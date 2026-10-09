import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
import { evaluateMaterialProjection } from '../dist/modules/material-projection.js';
import { evaluateCompiledAssessment } from '../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../dist/modules/detector-defaults.js';
import { loadRegisteredDataset } from '../scripts/dataset-fixture.mjs';
import { cube, component } from './mesh-fixtures.mjs';

const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
const materials = new Map([...dataset.geometry.materials, ['test-alloy', { density: 3.125 }]]);
const geometry = { ...dataset.geometry, materials,
  classification: { ...dataset.geometry.classification, material_precedence: ['test-alloy', ...dataset.geometry.classification.material_precedence] } };
function runtimeFor() {
  return createCompiledMeshRuntime({ version: '0.1.0', frame: 'model_frame', scenarioId: 'low', components: [
    component('block', 'concrete', cube([0, -2, -2], [4, 2, 2])),
    component('insert', 'test-alloy', cube([1, -2, -2], [2, 2, 2])),
    component('steel', 'steel', cube([3, -2, -2], [3.125, 2, 2]))
  ] }, { geometry, identity: dataset.identity, variables: {} });
}
function verify(trace) {
  assert.deepEqual(Object.keys(trace.materialColumns), [...materials.keys()]);
  for (const [id, material] of materials) {
    assert.equal(trace.materialColumns[id], id === 'air' ? 0 : trace.totals[id] * material.density);
  }
  // Independently evaluate the pre-B1 formula, including its exact order.
  const baseline = [...materials].reduce((sum, [id, m]) => id === 'air' ? sum : sum + trace.totals[id] * m.density, 0);
  assert.equal(trace.mwe, baseline);
  const sum = Object.values(trace.materialColumns).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - trace.mwe) <= Math.max(1e-9, 1e-12 * Math.abs(trace.mwe)));
}

test('contributions cover arbitrary materials, priority overlaps, thin steel, air and truncated rays', () => {
  const runtime = runtimeFor();
  const trace = runtime.traceRayModel([-1, 0, 0], [1, 0, 0], 6);
  verify(trace);
  assert.equal(trace.totals['test-alloy'], 1);
  assert.equal(trace.totals.steel, 0.125);
  assert.equal(trace.totals.concrete, 2.875);
  assert.equal(trace.materialColumns['test-alloy'], 3.125);
  assert.equal(trace.materialColumns.steel, 0.125 * 7.85);
  for (const [origin, length] of [[[-1, 0, 0], 0], [[-1, 0, 0], 2.5], [[1.5, 0, 0], 2], [[-1, 10, 0], 6]]) {
    verify(runtime.traceRayModel(origin, [1, 0, 0], length));
  }
  trace.materialColumns.concrete = 99;
  assert.notEqual(runtime.traceRayModel([-1, 0, 0], [1, 0, 0], 6).materialColumns.concrete, 99);
});

test('both projections carry detached raw contributions without extra ray calls or response changes', async () => {
  const runtime = runtimeFor(), traces = [];
  const counting = { ...runtime, traceRayModel: (...args) => {
    const trace = runtime.traceRayModel(...args); traces.push(trace); return trace;
  } };
  const config = { origin: [-1, 0, 0], azimuthDeg: 0, elevationDeg: 30, halfAngleDeg: 30, bins: 3, length: 6 };
  const material = await evaluateMaterialProjection(counting, config);
  assert.equal(traces.length, 9);
  material.pixels.forEach((pixel, i) => { verify(pixel); assert.notEqual(pixel.materialColumns, traces[i].materialColumns); });
  traces.length = 0;
  const device = defaultAssessmentDevice(), response = defaultAssessmentResponse();
  const result = await evaluateCompiledAssessment(counting, config, device, response);
  assert.equal(traces.length, 9);
  result.pixels.forEach(pixel => verify(pixel));
  const withoutColumns = { ...runtime, traceRayModel: (...args) => {
    const trace = runtime.traceRayModel(...args); delete trace.materialColumns; return trace;
  } };
  const baseline = await evaluateCompiledAssessment(withoutColumns, config, device, response);
  assert.equal(result.totalCount, baseline.totalCount);
  assert.equal(result.weightedTransmission, baseline.weightedTransmission);
  result.pixels.forEach((pixel, i) => {
    for (const key of ['mwe', 'count', 'transmission', 'displayCount', 'displayTransmission']) assert.equal(pixel[key], baseline.pixels[i][key]);
    assert.equal(baseline.pixels[i].materialColumns, null);
  });
  const roundtrip = JSON.parse(JSON.stringify(result));
  assert.deepEqual(roundtrip.pixels.map(p => p.materialColumns), result.pixels.map(p => p.materialColumns));
});
