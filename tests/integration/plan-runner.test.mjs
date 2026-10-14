import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { runPlan } from '../../scripts/run-plan.mjs';
import { createApplicationBackend } from '../../dist/modules/application-backends.js';
import { createDeploymentState } from '../../dist/modules/deployment-state.js';
import { defaultDeviceConfiguration, deviceSettingsData } from '../../dist/modules/device-configuration.js';
import { planFromState, serializePlan, planHash } from '../../dist/modules/plan-format.js';
import { replayPatternComparison } from '../../dist/modules/pattern-comparison.js';

// Headless batch runner (FR-S5): same modules and same results as the browser path.
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0', scenarioId = 'low';
const dataset = await loadRegisteredDataset(release);
const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId });
const configuration = defaultDeviceConfiguration();
const stations = backend.stations.slice(0, 2).map((s, i) => ({ ...s, az: s.az + 10 * i }));
const plan = planFromState({ title: 'Runner check', release, scenario: scenarioId, model: configuration.device.model, stations,
  activeIndex: 1, selected: [stations[0].id], settings: deviceSettingsData(configuration) });
const work = await mkdtemp(join(tmpdir(), 'plan-runner-')), planPath = join(work, 'plan.json');
await writeFile(planPath, serializePlan(plan));
test.after(() => rm(work, { recursive: true, force: true }));

// The app path: deployment state snapshot with the plan reference, through the same assessment port.
function appResult(index) {
  const state = createDeploymentState({ stations, environment: backend.environment, configuration });
  const input = { ...state.snapshot(), station: structuredClone(stations[index]), plan: { hash: planHash(plan), stationId: stations[index].id } };
  const pass = backend.assessment.createSession(input).projection('preview');
  let step; do step = pass.advance(25); while (!step.done);
  return pass.complete(step.result).patternResult;
}

test('results match the in-app evaluation and do not depend on the thread count', async () => {
  const selection = { kind: 'material', id: 'concrete', minimumPathM: .15 };
  const one = join(work, 'one'), two = join(work, 'two');
  await runPlan({ planPath, outDir: one, quality: 'preview', workers: 1, compare: selection });
  await runPlan({ planPath, outDir: two, quality: 'preview', workers: 2, compare: selection });
  for (const file of ['summary.json', 'comparison.json', ...stations.map(s => `${s.id}.result.json`)])
    assert.equal(await readFile(join(one, file), 'utf8'), await readFile(join(two, file), 'utf8'), file);
  const summary = JSON.parse(await readFile(join(one, 'summary.json'), 'utf8'));
  assert.equal(summary.plan.hash, planHash(plan)); assert.equal(summary.scene.scenario, scenarioId); assert.equal(summary.bins, 25);
  assert.deepEqual(summary.stations.map(s => s.id), stations.map(s => s.id));
  for (const [i, station] of stations.entries()) {
    const stored = JSON.parse(await readFile(join(one, `${station.id}.result.json`), 'utf8'));
    assert.deepEqual(stored, JSON.parse(JSON.stringify(appResult(i))));
    assert.deepEqual(stored.plan, { hash: planHash(plan), stationId: station.id });
    assert.equal(summary.stations[i].totalCount, stored.totalCount);
  }
  // The comparison is the app's export format and replays there (方案比较 → 重放比较).
  const comparison = JSON.parse(await readFile(join(one, 'comparison.json'), 'utf8'));
  assert.equal(replayPatternComparison(comparison).entries.length, 2);
  assert.deepEqual(comparison.comparison.selection, selection);
  // A run never overwrites an earlier one.
  await assert.rejects(runPlan({ planPath, outDir: one, quality: 'preview', workers: 1 }), /already holds a run/);
});

test('the selected deployment can be run alone; the command line reports failures with an exit code', async () => {
  const summary = await runPlan({ planPath, outDir: join(work, 'selected'), stations: 'selected', quality: 'preview', workers: 1 });
  assert.deepEqual(summary.stations.map(s => s.id), [stations[0].id]);
  assert.equal(summary.comparison, null);
  const script = new URL('../../scripts/run-plan.mjs', import.meta.url).pathname;
  await assert.rejects(promisify(execFile)(process.execPath, [script, planPath]), error => error.code === 1 && /Usage/.test(error.stderr));
  const foreign = JSON.parse(serializePlan(plan)); foreign.scene.release = 'unknown@1.0.0';
  await writeFile(join(work, 'foreign.json'), JSON.stringify(foreign));
  await assert.rejects(runPlan({ planPath: join(work, 'foreign.json'), outDir: join(work, 'foreign'), quality: 'preview', workers: 1 }), /unknown@1\.0\.0/);
});
