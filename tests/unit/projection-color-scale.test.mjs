import test from 'node:test';
import assert from 'node:assert/strict';
import { projectionColorScale } from '../../dist/modules/projection-color-scale.js';

test('adaptive scale resists isolated extremes and reveals low columns', () => {
  const values = [0, ...Array.from({ length: 100 }, (_, i) => i + 1), 1e9], copy = [...values];
  const scale = projectionColorScale(values);
  assert.equal(scale.upper, 99); assert.equal(scale.clipped, 2);
  assert.ok(scale.normalize(1) > 0.1); assert.equal(scale.normalize(1e9), 1);
  assert.equal(scale.normalize(0), 0); assert.deepEqual(values, copy);
  assert.equal(projectionColorScale([0, 0, 2, 1e9]).upper, 2);
});

test('adaptive scale follows field values and handles empty or constant fields', () => {
  assert.equal(projectionColorScale([0, 0]).normalize(0), 0);
  assert.equal(projectionColorScale([]).upper, 1);
  assert.equal(projectionColorScale([4, 4, 4]).normalize(4), 1);
  assert.equal(projectionColorScale([0.001]).normalize(0.001), 1);
  const a = projectionColorScale([1, 2, 3]), b = projectionColorScale([10, 20, 30]);
  assert.equal(a.normalize(1), b.normalize(10));
});

test('fixed scale stays comparable and invalid values fail closed', () => {
  const scale = projectionColorScale([0, 10, 10000], 'fixed');
  assert.equal(scale.upper, 2000); assert.equal(scale.normalize(10), 0.005); assert.equal(scale.clipped, 1);
  for (const values of [[NaN], [-1], [Infinity]]) assert.throws(() => projectionColorScale(values), /Invalid/);
  assert.throws(() => projectionColorScale([1], 'unknown'), /Invalid/);
});
