import test from 'node:test';
import assert from 'node:assert/strict';
import { colorLevel, heatRgb, entryMask, entryCountField, entryPixel, frontMask, frontLines } from '../../dist/modules/projection-tiles.js';
import { precisionContours } from '../../dist/modules/precision-contours.js';

// Per-station projections side by side (#16, FR-M4), drawn from the cached compact results: one fixed colour
// scale shared with the main projection, masks and precision inputs from the cache.
test('one fixed logarithmic colour scale for every station', () => {
  assert.equal(colorLevel('counts', .1), 0); assert.equal(colorLevel('counts', 1e5), 1); assert.equal(colorLevel('counts', 1e2), .5);
  assert.equal(colorLevel('counts', 0), 0); assert.equal(colorLevel('counts', 1e9), 1);
  assert.equal(colorLevel('transmission', 1e-6), 0); assert.equal(colorLevel('transmission', 1), 1); assert.equal(colorLevel('transmission', 1e-3), .5);
  assert.throws(() => colorLevel('significance', 1), /mode/);
  // Ends of the ramp: blue #397cff and red #ff5f55 (linear working-space channels, as drawn so far).
  assert.deepEqual(heatRgb(0).map(v => +v.toFixed(3)), [.041, .202, 1]); assert.deepEqual(heatRgb(1).map(v => +v.toFixed(3)), [1, .114, .091]);
  const mid = heatRgb(.5); assert.ok(mid.every(v => v >= 0 && v <= 1));
});

const n = 2;
// Top row first: pixel 0 top-left … pixel 3 bottom-right.
const entry = { n, pixels: { count: Float32Array.of(400, 100, 9, 0), transmission: Float32Array.of(.5, .2, .1, .05), mwe: Float32Array.of(1, 2, 3, 4), side: Uint8Array.of(0, 0, 1, 1) },
  items: { g: { index: Uint16Array.of(1, 3), length: Float32Array.of(.05, 2) } } };

test('masks at any threshold and the pixel values come from the compact entry', () => {
  assert.deepEqual([...entryMask(entry, 'g', .1)], [0, 0, 0, 1]); assert.deepEqual([...entryMask(entry, 'g', 0)], [0, 1, 0, 1]);
  assert.deepEqual([...entryMask(entry, 'none', 0)], [0, 0, 0, 0]);
  // ix from the left, iy from the bottom, as in the projection readout.
  assert.deepEqual(entryPixel(entry, 0, 0), { count: 9, transmission: Math.fround(.1), mwe: 3, side: 'back' });
  assert.deepEqual(entryPixel(entry, 1, 1), { count: 100, transmission: Math.fround(.2), mwe: 2, side: 'front' });
});

test('precision lines from the cached counts equal those of the full projection', () => {
  const field = entryCountField(entry);
  assert.deepEqual(field.values.map(v => v.count), [9, 0, 400, 100]);
  const full = { n, values: [{ count: 9 }, { count: 0 }, { count: 400 }, { count: 100 }] };
  assert.deepEqual(precisionContours(field), precisionContours(full));
});

test('with lines from behind hidden, masks and lines keep only the pixels whose lines come from in front', () => {
  // 3 × 3, top row first: the bottom row comes from behind.
  const side = Uint8Array.from([0, 0, 0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual([...frontMask(Uint8Array.from([1, 0, 0, 1, 1, 0, 1, 1, 0]), side)], [1, 0, 0, 1, 1, 0, 0, 0, 0]);
  // A vertical line from the top into the back row is cut where it enters it; a line entirely behind disappears.
  assert.deepEqual(frontLines([[[1.5, .2], [1.5, 1.5], [1.5, 2.5]], [[.2, 2.4], [2.8, 2.6]]], side, 3), [[[1.5, .2], [1.5, 1.5]]]);
});
