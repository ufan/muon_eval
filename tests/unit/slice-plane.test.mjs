import test from 'node:test';
import assert from 'node:assert/strict';
import { SLICE_AXES, slicePoint, sliceRange, computeSliceMask } from '../../dist/modules/slice-plane.js';

// Slice plane through the interior (15e, FR-M16): a plane across one model axis inside the subject's extent,
// shown only where it cuts through matter (classified with the calculation geometry).
const extent = { min: [0, 0, 0], max: [100, 50, 20] };

test('the plane spans the other two axes of the extent', () => {
  assert.deepEqual(SLICE_AXES.z, [0, 1]); assert.deepEqual(SLICE_AXES.x, [1, 2]); assert.deepEqual(SLICE_AXES.y, [0, 2]);
  assert.deepEqual(slicePoint('z', 7, extent, 0, 0), [0, 0, 7]);
  assert.deepEqual(slicePoint('z', 7, extent, 1, .5), [100, 25, 7]);
  assert.deepEqual(slicePoint('x', 30, extent, .5, 1), [30, 25, 20]);
  assert.deepEqual(slicePoint('y', 10, extent, .25, .5), [25, 10, 10]);
  assert.throws(() => slicePoint('w', 0, extent, 0, 0), /axis/);
  assert.deepEqual(sliceRange('x', extent), [0, 100]);
});

test('the mask marks matter cell by cell, row v from the bottom, at cell centres', async () => {
  // Matter: a box x < 50 and z < 10.
  const classify = ([x, , z]) => ({ dense: x < 50 && z < 10 });
  const mask = await computeSliceMask({ classify, isMatter: c => c.dense, axis: 'y', value: 25, extent, resolution: 4, chunk: 3, yieldTo: async () => {} });
  // u along x (cells at 12.5, 37.5, 62.5, 87.5), v along z (2.5, 7.5, 12.5, 17.5).
  assert.deepEqual([...mask], [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('a newer request cancels the running mask', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = computeSliceMask({ classify: () => { calls++; return {}; }, isMatter: () => true, axis: 'z', value: 5, extent, resolution: 8, chunk: 4,
    signal: controller.signal, yieldTo: async () => { controller.abort(); } });
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.ok(calls < 64);
  // A request superseded while waiting for the slider to rest does no work at all.
  const early = new AbortController(); let work = 0;
  const waiting = computeSliceMask({ classify: () => { work++; return {}; }, isMatter: () => true, axis: 'z', value: 5, extent, resolution: 4, startDelayMs: 250,
    signal: early.signal, yieldTo: async ms => { if (ms) early.abort(); } });
  await assert.rejects(waiting, error => error.name === 'AbortError'); assert.equal(work, 0);
});
