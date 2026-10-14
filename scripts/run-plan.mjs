// Headless batch runner (FR-S5, ADR-006): plan in, results out, using the browser's modules.
//   node scripts/run-plan.mjs plan.json --out runs/study [--stations all|id,id | --deployment <id>]
//        [--quality final|preview] [--workers N] [--compare material:<id>:<min path m>]
// Writes <station>.result.json per station, summary.json and, with --compare, comparison.json
// (projection-pattern-comparison v1, replayable in the app's 方案比较 drawer).
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { loadRegisteredDataset, sha256 } from './dataset-fixture.mjs';
import { parsePlan } from '../dist/modules/plan-format.js';
import { planAssessmentInputs, planRunSummary, resultFileName } from '../dist/modules/plan-runner.js';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
import { createCompiledMainAssessment } from '../dist/modules/compiled-main-assessment.js';
import { createPatternComparisonExport } from '../dist/modules/pattern-comparison.js';

const USAGE = 'Usage: node scripts/run-plan.mjs <plan.json> --out <dir> [--stations all|<id,id> | --deployment <id>] [--quality final|preview] [--workers N] [--compare material:<id>:<min path m>]';

export function parseRunArguments(argv) {
  const options = { planPath: null, outDir: null, stations: 'all', quality: 'final', workers: null, compare: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (options.planPath !== null) throw new Error(`${USAGE}\nOnly one plan file`);
      options.planPath = arg; continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`${USAGE}\n${arg} must have a value`);
    if (arg === '--out') options.outDir = value;
    else if (arg === '--stations' || arg === '--deployment') {
      if (options.stations !== 'all') throw new Error(`${USAGE}\nUse --stations or --deployment once`);
      options.stations = arg === '--deployment' ? { deployment: value } : value === 'all' ? 'all' : value.split(',');
    }
    else if (arg === '--quality') {
      if (!['final', 'preview'].includes(value)) throw new Error('--quality must be final or preview');
      options.quality = value;
    } else if (arg === '--workers') {
      if (!/^[1-9]\d*$/.test(value)) throw new Error('--workers must be a positive integer');
      options.workers = Number(value);
    } else if (arg === '--compare') {
      const match = /^(material):([A-Za-z0-9_.-]+):(\d+(?:\.\d+)?)$/.exec(value);
      if (!match) throw new Error('--compare must be material:<id>:<minimum path in m>');
      options.compare = { kind: match[1], id: match[2], minimumPathM: Number(match[3]) };
    } else throw new Error(`${USAGE}\nUnknown option ${arg}`);
  }
  if (options.planPath === null || options.outDir === null) throw new Error(USAGE);
  return options;
}

// One evaluator per thread: the compiled runtime (mesh and BVH) is built once and reused.
async function createEvaluator(release, scenarioId) {
  const dataset = await loadRegisteredDataset(release);
  const assessment = createCompiledMainAssessment({ runtime: await loadCompiledMeshRuntime(dataset, scenarioId) });
  return (input, quality) => {
    const work = assessment.createSession(input).projection(quality);
    let step;
    do step = work.advance(65); while (!step.done);
    return work.complete(step.result).patternResult;
  };
}

// Runs every station job on `workers` threads (or in this thread for one worker).
async function evaluateAll({ release, scenarioId, jobs, quality, workers, log }) {
  const results = new Array(jobs.length);
  if (workers === 1) {
    const evaluate = await createEvaluator(release, scenarioId);
    jobs.forEach((job, i) => { results[i] = evaluate(job.input, quality); log(`${job.stationId} done`); });
    return results;
  }
  let next = 0;
  await Promise.all(Array.from({ length: workers }, () => new Promise((done, fail) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { release, scenarioId, quality } });
    const send = () => {
      if (next >= jobs.length) { worker.terminate().then(() => done()); return; }
      const index = next++;
      worker.postMessage({ index, input: jobs[index].input });
    };
    worker.on('message', message => {
      if (message.error) { worker.terminate(); fail(new Error(message.error)); return; }
      if (message.index !== undefined) { results[message.index] = message.result; log(`${jobs[message.index].stationId} done`); }
      send();
    });
    worker.on('error', fail);
  })));
  return results;
}

export async function runPlan({ planPath, outDir, stations = 'all', quality = 'final', workers = null, compare = null, log = () => {} }) {
  const plan = parsePlan(await readFile(planPath, 'utf8'));
  if (plan.scene.contentHash !== null) throw new Error('The runner only loads registered releases; plans for user-loaded datasets (contentHash) are not supported yet');
  const dataset = await loadRegisteredDataset(plan.scene.release);
  const scenarioId = plan.scene.scenario ?? dataset.geometry.scenarios.keys().next().value;
  if (!dataset.geometry.scenarios.has(scenarioId)) throw new Error(`Release ${plan.scene.release} has no scenario ${scenarioId}`);
  const jobs = planAssessmentInputs(plan, { environment: dataset.geometry.scenarios.get(scenarioId).variables, stations });
  const files = jobs.map(job => resultFileName(job.stationId));
  if (await access(join(outDir, 'summary.json')).then(() => true, () => false)) throw new Error(`${outDir} already holds a run; choose another --out`);
  const threads = Math.min(workers ?? availableParallelism(), jobs.length);
  log(`${plan.scene.release} · ${scenarioId} · ${jobs.length} station(s) · ${quality} · ${threads} thread(s)`);
  const results = await evaluateAll({ release: plan.scene.release, scenarioId, jobs, quality, workers: threads, log });
  await mkdir(outDir, { recursive: true });
  const stationsRun = [];
  for (const [i, job] of jobs.entries()) {
    const bytes = new TextEncoder().encode(`${JSON.stringify(results[i])}\n`);
    await writeFile(join(outDir, files[i]), bytes);
    stationsRun.push({ stationId: job.stationId, name: job.name, file: files[i], sha256: sha256(bytes), result: results[i] });
  }
  let comparison = null;
  if (compare) {
    const document = createPatternComparisonExport(jobs.map((job, i) => ({ label: `${job.name} (${job.stationId})`, result: results[i], references: [] })), compare);
    await writeFile(join(outDir, 'comparison.json'), JSON.stringify(document));
    comparison = 'comparison.json';
  }
  const summary = planRunSummary({ plan, quality, stations: stationsRun, comparison });
  await writeFile(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (!isMainThread && workerData?.release) {
  const evaluate = await createEvaluator(workerData.release, workerData.scenarioId);
  parentPort.on('message', ({ index, input }) => {
    try { parentPort.postMessage({ index, result: evaluate(input, workerData.quality) }); }
    catch (error) { parentPort.postMessage({ error: error.message }); }
  });
  parentPort.postMessage({ ready: true });
} else if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseRunArguments(process.argv.slice(2)), started = performance.now();
    const summary = await runPlan({ ...options, log: line => console.error(line) });
    console.error(`Wrote ${summary.stations.length} result(s) to ${options.outDir} in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
