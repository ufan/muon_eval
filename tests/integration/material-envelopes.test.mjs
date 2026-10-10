import test from 'node:test';
import assert from 'node:assert/strict';
import { materialBoundaryProfile, materialEnvelopeEdges } from '../../dist/modules/material-envelopes.js';
import { evaluateMaterialProjection } from '../../dist/modules/material-projection.js';
import { loadCompiledMeshRuntime } from '../../dist/modules/compiled-mesh-runtime.js';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';

test('profiles distinguish actual air interfaces from water contacts and ray truncation', () => {
  const profile = materialBoundaryProfile({ totals: { concrete: 3, rock: 2 }, segments: [
    { t0: 0, t1: 2, material: 'concrete' }, { t0: 2, t1: 3, material: 'air' },
    { t0: 3, t1: 4, material: 'concrete' }, { t0: 4, t1: 5, material: 'water' },
    { t0: 5, t1: 7, material: 'rock' }] });
  assert.deepEqual(profile.concrete, { length: 3, airDepths: [2, 3] });
  assert.deepEqual(profile.rock, { length: 2, airDepths: [] });
});

test('material silhouettes work independently of entity mappings and do not invent viewport borders', () => {
  const pixel = length => ({ materialBoundaries: { concrete: { length, airDepths: length ? [10] : [] } } });
  const edges = materialEnvelopeEdges([pixel(1), pixel(0), pixel(1), pixel(0)], 2, 'concrete');
  assert.equal(edges.length, 2); assert.ok(edges.every(edge => edge.reason === 'material-silhouette' && edge.x0 === 1));
  assert.deepEqual(materialEnvelopeEdges(Array.from({ length: 4 }, () => pixel(1)), 2, 'concrete'), []);
});

test('air-interface depth edges reveal discontinuities even when every ray intersects the material', () => {
  const pixel = depth => ({ materialBoundaries: { rock: { length: 20, airDepths: [depth] } } });
  const values = [pixel(10), pixel(100), pixel(10), pixel(100)];
  assert.equal(materialEnvelopeEdges(values, 2, 'rock').length, 2);
  assert.deepEqual(materialEnvelopeEdges(values, 2, 'rock', { depthEdges: false }), []);
  assert.deepEqual(materialEnvelopeEdges([pixel(100), pixel(102), pixel(100), pixel(102)], 2, 'rock'), []);
});

test('published projection profiles match direct BVH intervals for both material envelopes', async () => {
  const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
  const runtime = await loadCompiledMeshRuntime(dataset, 'low');
  const origin = dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position);
  const result = await evaluateMaterialProjection(runtime, { origin, azimuthDeg: 180, elevationDeg: 30, halfAngleDeg: 60, bins: 25, length: 700 });
  for (const pixel of result.pixels) assert.deepEqual(pixel.materialBoundaries, materialBoundaryProfile(runtime.traceRayModel(origin, pixel.direction, 700)));
  for (const material of ['concrete', 'rock']) assert.ok(materialEnvelopeEdges(result.pixels, 25, material).length > 0);
});
