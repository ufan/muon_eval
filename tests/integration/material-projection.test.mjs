import test from 'node:test';
import assert from 'node:assert/strict';
import { detectorBasis, slopeDirection, evaluateMaterialProjection } from '../../dist/modules/material-projection.js';
import { loadCompiledMeshRuntime } from '../../dist/modules/compiled-mesh-runtime.js';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const config = { origin: [0, 0, 0], azimuthDeg: 180, elevationDeg: 30, halfAngleDeg: 30, bins: 3, length: 700 };
const fake = { identity: { dataset_id: 'test' }, backend: 'test', scenarioId: 'low', variables: { water: 1 },
  traceRayModel: (_, direction) => ({ totals: { air: 700 }, mwe: 10 + direction[2] }) };

test('local basis is orthonormal at horizontal and vertical poses; slopes use right/up', () => {
  assert.deepEqual(detectorBasis(0, 0).right, [-0, 1, 0]); // existing app +sx convention
  for (const elevation of [-90, 0, 30, 90]) {
    const basis = detectorBasis(180, elevation);
    for (const vector of Object.values(basis)) near(Math.hypot(...vector), 1);
    near(dot(basis.right, basis.up), 0); near(dot(basis.right, basis.forward), 0); near(dot(basis.up, basis.forward), 0);
    assert.deepEqual(slopeDirection(basis, 0, 0), basis.forward);
    assert.ok(dot(slopeDirection(basis, 0.2, 0), basis.right) > 0);
    assert.ok(dot(slopeDirection(basis, 0, 0.2), basis.up) > 0);
  }
});

test('projection snapshots inputs, orders local up at top, and records reproducible metadata', async () => {
  const input = structuredClone(config);
  const result = await evaluateMaterialProjection(fake, input);
  input.origin[0] = 99;
  assert.equal(result.config.origin[0], 0);
  assert.equal(result.pixels.length, 9);
  assert.ok(result.pixels[0].sx < 0 && result.pixels[0].sy > 0);
  assert.equal(result.pixels[4].sx, 0); assert.equal(result.pixels[4].sy, 0);
  assert.equal(result.scenarioId, 'low'); assert.deepEqual(result.identity, fake.identity);
  near(result.pixels[4].mwe, fake.traceRayModel(config.origin, detectorBasis(180, 30).forward).mwe);
});

test('invalid projections fail closed and cancellation prevents a completed result', async () => {
  for (const patch of [{ bins: 4 }, { bins: 67 }, { halfAngleDeg: 90 }, { length: NaN }, { origin: [0, 0] }, { elevationDeg: 91 }]) {
    await assert.rejects(evaluateMaterialProjection(fake, { ...config, ...patch }), /Invalid/);
  }
  const controller = new AbortController(); let rows = 0;
  await assert.rejects(evaluateMaterialProjection(fake, config, { signal: controller.signal,
    yieldTask: () => { rows++; controller.abort(); } }), { name: 'AbortError' });
  assert.equal(rows, 1);
});

test('all frozen scenario projections agree pixel-for-pixel with the shared ray backend', async () => {
  const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
  const origin = dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position);
  for (const scenario of ['low', 'mid', 'high', 'extreme']) {
    const runtime = await loadCompiledMeshRuntime(dataset, scenario);
    const result = await evaluateMaterialProjection(runtime, { ...config, origin });
    for (const pixel of result.pixels) {
      const direct = runtime.traceRayModel(origin, pixel.direction, config.length);
      near(pixel.mwe, direct.mwe); assert.deepEqual(pixel.totals, direct.totals);
      assert.deepEqual(pixel.materialColumns, direct.materialColumns);
      near(Object.values(pixel.materialColumns).reduce((a, b) => a + b, 0), pixel.mwe);
      near(Object.values(pixel.totals).reduce((a, b) => a + b), config.length);
    }
    assert.equal(result.scenarioId, scenario);
    assert.equal(result.variables.water_up_level, runtime.variables.water_up_level);
  }
});
