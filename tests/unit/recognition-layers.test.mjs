import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRecognitionLayers, visibleRecognitionLayers, outlineRings, crossingsAlongRay } from '../../dist/modules/recognition-layers.js';

// Synthetic 3x3 projection; values are stored bottom row first (iy = 0 at the bottom).
const ray = (entityLengths = {}, totals = {}, segments = []) => ({ q: { entityLengths, totals: { concrete: 0, ...totals }, segments } });
const field = cells => ({ n: 3, values: cells });
const items = [
  { id: 'tunnels', kind: 'features', featureIds: ['a', 'b'], material: null },
  { id: 'concrete', kind: 'material', featureIds: null, material: 'concrete' },
  { id: 'room', kind: 'features', featureIds: ['r'], material: null }
];
const data = field([
  ray({ a: 0.06, b: 0.06 }, { concrete: 30 }), ray({ a: 0.1 }, { concrete: 0.1 }), ray({}, { concrete: 12 }),
  ray(), ray({ b: 2 }), ray(),
  ray(), ray(), ray({ a: 5, r: 0 })
]);

test('feature lengths sum the member entities; material lengths read the material total', () => {
  const [tunnels, concrete] = computeRecognitionLayers(data, items);
  // Display order: top row first.
  assert.deepEqual([...tunnels.lengths], [0, 0, 5, 0, 2, 0, 0.12, 0.1, 0]);
  assert.deepEqual([...concrete.lengths], [0, 0, 0, 0, 0, 0, 30, 0.1, 12]);
});

test('a pixel is in the mask only when its length exceeds the threshold', () => {
  const [tunnels, concrete, room] = computeRecognitionLayers(data, items);
  assert.deepEqual([...tunnels.mask], [0, 0, 1, 0, 1, 0, 1, 0, 0]);
  assert.deepEqual([...concrete.mask], [0, 0, 0, 0, 0, 0, 1, 0, 1]);
  assert.equal(tunnels.maskPixels, 3);
  assert.equal(tunnels.coverage, 3 / 9);
  assert.equal(tunnels.inView, true);
  assert.equal(room.inView, false);
  const [strict] = computeRecognitionLayers(data, items, { threshold: 1 });
  assert.deepEqual([...strict.mask], [0, 0, 1, 0, 1, 0, 0, 0, 0]);
});

test('invalid thresholds or fields fail closed', () => {
  for (const threshold of [-1, NaN, Infinity]) assert.throws(() => computeRecognitionLayers(data, items, { threshold }), /threshold/);
  assert.throws(() => computeRecognitionLayers({ n: 2, values: data.values }, items), /field/);
  assert.throws(() => computeRecognitionLayers(data, [{ id: 'x', kind: 'other' }]), /kind/);
});

test('visible layers are the in-view ones, largest coverage first', () => {
  const layers = computeRecognitionLayers(data, items);
  assert.deepEqual(visibleRecognitionLayers(layers).map(l => l.id), ['tunnels', 'concrete']);
});

test('outlines are closed rings around the mask, also at the image border', () => {
  const mask = Uint8Array.from([1, 1, 0, 1, 1, 0, 0, 0, 0]);
  const rings = outlineRings(mask, 3);
  assert.equal(rings.length, 1);
  const ring = rings[0];
  assert.deepEqual(ring[0], ring.at(-1));
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  // The ring reaches the image border (clamped to [0, n]) and stays between the mask and its neighbours.
  assert.equal(Math.min(...xs), 0); assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...xs), 2); assert.equal(Math.max(...ys), 2);
  assert.deepEqual(outlineRings(new Uint8Array(9), 3), []);
  const full = outlineRings(new Uint8Array(9).fill(1), 3);
  assert.equal(full.length, 1);
});

test('two separate mask regions give two rings', () => {
  assert.equal(outlineRings(Uint8Array.from([1, 0, 1, 0, 0, 0, 0, 0, 0]), 3).length, 2);
});

test('crossings list the items a ray passes, in ray order, with entry distance and length', () => {
  const pixel = { q: {
    entityLengths: { a: 3, r: 1 }, totals: { concrete: 8 },
    segments: [
      { t0: 0, t1: 2, material: 'air', entityIds: [] },
      { t0: 2, t1: 6, material: 'concrete', entityIds: [] },
      { t0: 6, t1: 7, material: 'air', entityIds: ['r'] },
      { t0: 7, t1: 10, material: 'air', entityIds: ['a'] },
      { t0: 10, t1: 14, material: 'concrete', entityIds: [] }
    ]
  } };
  assert.deepEqual(crossingsAlongRay(pixel, items), [
    { id: 'concrete', entryM: 2, lengthM: 8 },
    { id: 'room', entryM: 6, lengthM: 1 },
    { id: 'tunnels', entryM: 7, lengthM: 3 }
  ]);
  assert.deepEqual(crossingsAlongRay(pixel, items, { threshold: 2 }).map(c => c.id), ['concrete', 'tunnels']);
});

test('inputs are not modified', () => {
  const copy = structuredClone(data);
  computeRecognitionLayers(data, items);
  assert.deepEqual(data, copy);
});
