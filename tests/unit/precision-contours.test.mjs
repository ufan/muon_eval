import test from 'node:test';
import assert from 'node:assert/strict';
import { precisionContours, countsForRelativeError } from '../../dist/modules/precision-contours.js';

// FR-M13: lines where the relative counting error 1/sqrt(N) reaches 10 % and 5 %.
const field = (n, countAt) => ({ n, values: Array.from({ length: n * n }, (_, i) => ({ count: countAt(i % n, Math.floor(i / n)) })) });
const xs = line => line.map(p => p[0]), ys = line => line.map(p => p[1]);
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('relative error levels map to count levels', () => {
  assert.equal(countsForRelativeError(.1), 100);
  assert.equal(countsForRelativeError(.05), 400);
  for (const bad of [0, -.1, 1.5, NaN]) assert.throws(() => countsForRelativeError(bad), /error/);
});

test('contours are open lines interpolated in log counts, reaching the image border', () => {
  // Counts grow to the right: 50, 150, 300, 500 in every row.
  const [ten, five] = precisionContours(field(4, ix => [50, 150, 300, 500][ix]));
  assert.equal(ten.relativeError, .1); assert.equal(ten.minCounts, 100);
  assert.equal(ten.lines.length, 1);
  const x10 = .5 + (2 - Math.log10(50)) / (Math.log10(150) - Math.log10(50));
  assert.ok(xs(ten.lines[0]).every(x => close(x, x10)));
  assert.deepEqual([Math.min(...ys(ten.lines[0])), Math.max(...ys(ten.lines[0]))], [0, 4]);
  const x5 = 2.5 + (Math.log10(400) - Math.log10(300)) / (Math.log10(500) - Math.log10(300));
  assert.ok(xs(five.lines[0]).every(x => close(x, x5)));
});

test('display order is top row first (projections store the bottom row first)', () => {
  // Bottom rows have many counts, the top row few: the 10 % line lies near the top.
  const [ten] = precisionContours(field(3, (ix, iy) => [1000, 1000, 10][iy]));
  // Halfway in log counts between the top row (10, centre 0.5) and the next (1000, centre 1.5).
  assert.ok(ys(ten.lines[0]).every(y => close(y, 1)));
});

test('no line where every pixel is on one side; zero counts are allowed', () => {
  const [ten, five] = precisionContours(field(3, () => 50));
  assert.deepEqual([ten.lines, five.lines], [[], []]);
  assert.equal(precisionContours(field(3, ix => [0, 0, 1e4][ix]))[0].lines.length, 1);
  assert.throws(() => precisionContours({ n: 2, values: [{ count: 1 }] }), /field/);
});
