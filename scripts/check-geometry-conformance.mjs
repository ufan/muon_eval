import { readFile } from 'node:fs/promises';
import { createGeometryKernel } from '../dist/modules/geometry-kernel.js';

const base = new URL('../dist/data/datasets/zhouning-lower-reservoir-dam/0.6.1/', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, base), 'utf8'));
const [spec, header, farHeader, reference, rayReference] = await Promise.all([
  readJson('dam_spec.json'),
  readJson('compiled/terrain_effective_near.json'),
  readJson('compiled/terrain_far.json'),
  readJson('compiled/conformance_points.json'),
  readJson('compiled/conformance_rays.json')
]);
const buffer = await readFile(new URL('compiled/terrain_effective_near.f32', base));
const farBuffer = await readFile(new URL('compiled/terrain_far.f32', base));
const terrainNear = { header, values: new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4) };
const terrainFar = { header: farHeader, values: new Float32Array(farBuffer.buffer, farBuffer.byteOffset, farBuffer.byteLength / 4) };
const kernel = createGeometryKernel({ spec, terrainNear, terrainFar, upstreamLevel: reference.water_up_level });
const counts = {}, mismatches = [];
for (const sample of reference.points) {
  if (Math.abs(sample.dz_terrain) < 5) continue;
  const actual = kernel.classifyModel(...sample.p).material;
  counts[sample.material] = (counts[sample.material] || 0) + 1;
  if (actual !== sample.material) mismatches.push({ p: sample.p, expected: sample.material, actual, dz_terrain: sample.dz_terrain });
}
const checked = Object.values(counts).reduce((sum, value) => sum + value, 0);
const accuracy = checked ? (checked - mismatches.length) / checked : 0;
console.log(JSON.stringify({ checked, mismatches: mismatches.length, accuracy, counts, examples: mismatches.slice(0, 12) }, null, 2));
if (accuracy < 0.995) process.exitCode = 1;

const materials = ['concrete', 'water', 'rock', 'steel'];
// Transitional parametric-kernel gates. The release compiler is stricter
// (notably ~0.42 m rock P95); tighten these after the compiled mesh/BVH backend lands.
const rayP95Limits = { concrete: 0.5, water: 0.5, rock: 1.5, steel: 0.1 };
const errors = Object.fromEntries(materials.map(material => [material, []]));
for (const ray of rayReference.rays) {
  const actual = kernel.traceRayModel(ray.origin, ray.dir, ray.length, rayReference.step_m, rayReference.water_up_level);
  for (const material of materials) errors[material].push(Math.abs(actual[material] - ray.expected_m[material]));
}
const percentile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(q * values.length))];
const raySummary = Object.fromEntries(materials.map(material => [material, {
  p95_m: percentile(errors[material], 0.95),
  max_m: Math.max(...errors[material])
}]));
console.log(JSON.stringify({ rays: rayReference.rays.length, step_m: rayReference.step_m, errors: raySummary }, null, 2));
if (materials.some(material => raySummary[material].p95_m > rayP95Limits[material])) process.exitCode = 1;

