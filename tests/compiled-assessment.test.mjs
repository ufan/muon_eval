import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCompiledAssessment } from '../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../dist/modules/detector-defaults.js';
import { createProjectionPass } from '../dist/modules/detector-projection.js';
import { detectorBasis, slopeDirection } from '../dist/modules/material-projection.js';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
import { loadRegisteredDataset } from '../scripts/dataset-fixture.mjs';

const device = defaultAssessmentDevice(), response = defaultAssessmentResponse();
const config = { origin: [0, 0, 0], azimuthDeg: 180, elevationDeg: 30, bins: 25, length: 700 };
const emptyRuntime = { identity: { dataset_id: 'test' }, backend: 'test', scenarioId: 'low', variables: {},
  traceRayModel: (_, __, length) => ({ mwe: 0, totals: { air: length } }) };

test('BVH assessment uses identical shared count formulas for all published scenarios', async () => {
  const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
  const origin = dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position);
  const basis = detectorBasis(config.azimuthDeg, config.elevationDeg);
  for (const scenarioId of ['low', 'mid', 'high', 'extreme']) {
    const runtime = await loadCompiledMeshRuntime(dataset, scenarioId);
    for (const angularModel of ['gaisser', 'cos2']) {
      const settings = { ...response, angularModel };
      const actual = await evaluateCompiledAssessment(runtime, { ...config, origin }, device, settings);
      const reference = createProjectionPass({ n: config.bins, device, response: settings, sampleRay: (sx, sy) => {
        const direction = slopeDirection(basis, sx, sy);
        return { dir: { x: direction[0], y: direction[1], z: direction[2] }, q: runtime.traceRayModel(origin, direction, config.length) };
      } }).advance(config.bins).result;
      assert.equal(actual.totalCount, reference.total); assert.equal(actual.weightedTransmission, reference.weightedTransmission);
      assert.equal(actual.scenarioId, scenarioId); assert.deepEqual(actual.variables, runtime.variables);
      assert.deepEqual(actual.identity, runtime.identity); assert.equal(actual.modelVersion, reference.modelVersion);
      for (let row = 0; row < config.bins; row++) for (let col = 0; col < config.bins; col++) {
        const pixel = actual.pixels[row * config.bins + col], expected = reference.values[(config.bins - 1 - row) * config.bins + col];
        assert.equal(pixel.count, expected.count); assert.equal(pixel.transmission, expected.transmission);
        assert.equal(pixel.displayCount, expected.displayCount); assert.deepEqual(pixel.totals, expected.q.totals);
        assert.equal(pixel.mwe, expected.q.mwe);
        assert.deepEqual(pixel.materialColumns, expected.q.materialColumns);
        const sum = Object.values(pixel.materialColumns).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - pixel.mwe) <= Math.max(1e-9, 1e-12 * Math.abs(pixel.mwe)));
      }
      assert.ok(actual.pixels[0].sy > 0); assert.ok(actual.pixels.at(-1).sy < 0);
      assert.equal(JSON.parse(JSON.stringify(actual)).pixels.length, 625);
    }
  }
});

test('assessment supports 65 samples, snapshots configuration and is independent of material-map angle', async () => {
  const input = { ...config, origin: [...config.origin], bins: 65, halfAngleDeg: 10 };
  const r = { ...response };
  const actual = await evaluateCompiledAssessment(emptyRuntime, input, device, r, { yieldTask: () => {
    input.origin[0] = 99; r.exposureDays = 99;
  } });
  const other = await evaluateCompiledAssessment(emptyRuntime, { ...config, bins: 65, halfAngleDeg: 80 }, device, response);
  assert.deepEqual(actual, other); assert.equal(actual.config.origin[0], 0); assert.equal(actual.response.exposureDays, 30);
  assert.equal(actual.pixels.length, 4225); assert.equal(actual.weightedTransmission, 1);
  assert.ok(actual.pixels.every(pixel => pixel.transmission === (pixel.direction[2] > 0 ? 1 : 0)));
});

test('exposure changes counts linearly and never modifies ray geometry or transmission', async () => {
  const a = await evaluateCompiledAssessment(emptyRuntime, config, device, response);
  const b = await evaluateCompiledAssessment(emptyRuntime, config, device, { ...response, exposureDays: 60 });
  assert.equal(b.totalCount, a.totalCount * 2);
  a.pixels.forEach((pixel, i) => {
    assert.equal(b.pixels[i].count, pixel.count * 2);
    assert.equal(b.pixels[i].mwe, pixel.mwe); assert.equal(b.pixels[i].transmission, pixel.transmission);
  });
});

test('invalid device/response, unsupported transport range and cancellation fail explicitly', async () => {
  for (const patch of [{ layers: 4 }, { stripsY: 128 }, { width: NaN }, { nativeSlopeStep: .9 }]) {
    await assert.rejects(evaluateCompiledAssessment(emptyRuntime, config, { ...device, ...patch }, response), /device/);
  }
  await assert.rejects(evaluateCompiledAssessment(emptyRuntime, config, device, { ...response, exposureDays: NaN }), /response/);
  await assert.rejects(evaluateCompiledAssessment(emptyRuntime, { ...config, length: Infinity }, device, response), /configuration/);
  const controller = new AbortController(); let yields = 0;
  await assert.rejects(evaluateCompiledAssessment(emptyRuntime, config, device, response, { signal: controller.signal,
    yieldTask: () => { yields++; controller.abort(); } }), { name: 'AbortError' });
  assert.equal(yields, 1);
  const tooDense = { ...emptyRuntime, traceRayModel: () => ({ mwe: 20000, totals: { rock: 700 } }) };
  await assert.rejects(evaluateCompiledAssessment(tooDense, config, device, response), /numerical range/);
});
