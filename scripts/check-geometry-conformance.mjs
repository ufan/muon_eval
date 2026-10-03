import { readFile } from 'node:fs/promises';
import { createGeometryKernel } from '../dist/modules/geometry-kernel.js';

const base = new URL('../dist/data/datasets/zhouning-lower-reservoir-dam/0.6.1/', import.meta.url);
const readJson = async relative => JSON.parse(await readFile(new URL(relative, base), 'utf8'));
const [spec, header, reference] = await Promise.all([
  readJson('dam_spec.json'),
  readJson('compiled/terrain_effective_near.json'),
  readJson('compiled/conformance_points.json')
]);
const buffer = await readFile(new URL('compiled/terrain_effective_near.f32', base));
const terrainNear = { header, values: new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4) };
const kernel = createGeometryKernel({ spec, terrainNear, upstreamLevel: reference.water_up_level });
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

