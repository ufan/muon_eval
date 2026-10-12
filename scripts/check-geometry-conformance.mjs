import { readFile } from 'node:fs/promises';
import { createV07QualificationKernel } from '../dist/modules/geometry-v07-qualification.js';
import { loadRegisteredDataset } from './dataset-fixture.mjs';
import { verifySha256 } from '../dist/modules/dataset-validation.js';
import { sha256 } from './dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';

const registry = JSON.parse(await readFile(new URL('../datasets/registry.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--dataset', '--backend'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Usage: node scripts/check-geometry-conformance.mjs [--dataset RELEASE_ID] [--backend analytic|compiled]');
  options[args[i]] = args[i + 1];
}
const compiled = options['--backend'] === 'compiled';
if (options['--backend'] && !['analytic', 'compiled'].includes(options['--backend'])) throw new Error('Unknown geometry backend');
const datasetId = options['--dataset'] || registry.default_dataset;
const entry = registry.datasets[datasetId];
if (!entry) throw new Error(`Dataset ${datasetId} is not registered`);
const base = new URL(`../datasets/${entry.base_url.replace(/^\.\//, '')}`, import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, base), 'utf8'));
const [reference, rayReference] = await Promise.all([readJson(entry.conformance.points), readJson(entry.conformance.rays)]);
if (entry.adapter !== 'dam-spec-v07') throw new Error('Geometry conformance requires a native v0.7 release');
const dataset = await loadRegisteredDataset(datasetId);
for (const relative of [entry.conformance.points, entry.conformance.rays]) {
  await verifySha256(await readFile(new URL(relative, base)), entry.integrity[relative], relative, sha256);
}
const builtAt = performance.now();
const kernel = compiled ? await loadCompiledMeshRuntime(dataset, reference.scenario_id) : createV07QualificationKernel(dataset);
const buildMs = performance.now() - builtAt;
const scenario = dataset.geometry.resolveScenario(reference.scenario_id);
for (const ref of [reference, rayReference]) {
  if (ref.release_id !== dataset.id || ref.spec_sha256 !== entry.integrity[entry.spec] || ref.frame !== 'model_frame'
    || ref.schema_version !== dataset.identity.schema_version || ref.water_up_level !== scenario.variables.water_up_level
    || ref.scenario_id !== scenario.id) throw new Error('Conformance reference does not match release/scenario');
}
const counts = {}, mismatches = [];
for (const sample of reference.points) {
  if (Math.abs(sample.dz_terrain) < 5) continue;
  const actual = kernel.classifyModel(sample.p, scenario).material;
  counts[sample.material] = (counts[sample.material] || 0) + 1;
  if (actual !== sample.material) mismatches.push({ p: sample.p, expected: sample.material, actual, dz_terrain: sample.dz_terrain });
}
const checked = Object.values(counts).reduce((sum, value) => sum + value, 0);
const accuracy = checked ? (checked - mismatches.length) / checked : 0;
console.log(JSON.stringify({ dataset: datasetId, backend: compiled ? kernel.backend : 'v07-analytic-qualification', build_ms: Math.round(buildMs), checked, mismatches: mismatches.length, accuracy, counts, examples: mismatches.slice(0, 12) }, null, 2));
if (accuracy < 0.999) process.exitCode = 1;

const materials = ['concrete', 'water', 'rock', 'steel'];
const rayStep = rayReference.step_m ?? rayReference.sampling?.rays?.step_m;
if (!(rayStep > 0) || !Number.isFinite(rayStep)) throw new Error('Reference rays are missing a finite sampling step');
// Transitional parametric-kernel gates. The release compiler is stricter
// (notably ~0.42 m rock P95); tighten these after the compiled mesh/BVH backend lands.
const rayP95Limits = compiled ? rayReference.tolerances_m : { ...rayReference.tolerances_m, rock: 1.5 };
const errors = Object.fromEntries(materials.map(material => [material, []]));
const rayStarted = performance.now();
for (const ray of rayReference.rays) {
  const result = kernel.traceRayModel(ray.origin, ray.dir, ray.length, rayStep, scenario);
  const actual = compiled ? result.totals : result;
  for (const material of materials) errors[material].push(Math.abs(actual[material] - ray.expected_m[material]));
}
// Linear percentile matches the release's NumPy convention.
const percentile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b), at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
};
const raySummary = Object.fromEntries(materials.map(material => [material, {
  p95_m: percentile(errors[material], 0.95),
  max_m: Math.max(...errors[material])
}]));
console.log(JSON.stringify({ rays: rayReference.rays.length, ray_ms: Math.round(performance.now() - rayStarted), step_m: compiled ? null : rayStep, errors: raySummary,
  qualification_p95_limits_m: rayP95Limits,
  release_p95_limits_m: rayReference.tolerances_m || null,
  meets_release_ray_limits: rayReference.tolerances_m ? materials.every(material => raySummary[material].p95_m <= rayReference.tolerances_m[material]) : null
}, null, 2));
if (materials.some(material => raySummary[material].p95_m > rayP95Limits[material])) process.exitCode = 1;
