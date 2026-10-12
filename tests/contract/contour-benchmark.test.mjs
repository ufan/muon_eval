import test from 'node:test';
import assert from 'node:assert/strict';
import contours from '../../dist/vendor/d3-contour/contours.js';
import { benchmarkGrid, sampleField, slopeCoordinate, benchmarkContours } from '../../scripts/contour-benchmark-core.mjs';
import { createPatternFixture } from '../projection-pattern-fixtures.mjs';
import { evaluateMaterialProjection } from '../../dist/modules/material-projection.js';
import { evaluateCompiledAssessment } from '../../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../../dist/modules/detector-defaults.js';
const points = result => result.levels.flatMap(v => v.lines.flat());

test('benchmark axes match actual material/assessment projections, not array-index alignment', async () => {
  const runtime = createPatternFixture('slab').runtime;
  for (const n of [25, 65]) {
    const config = { origin: [0, 0, 0], azimuthDeg: 0, elevationDeg: 30, halfAngleDeg: 30, bins: n, length: 20 };
    const material = await evaluateMaterialProjection(runtime, config);
    const detector = await evaluateCompiledAssessment(runtime, config, defaultAssessmentDevice(), defaultAssessmentResponse());
    for (const [kind, result] of [['material', material], ['detector', detector]]) {
      const grid = benchmarkGrid(kind, n);
      result.pixels.forEach((p, i) => {
        assert.equal(p.sx, grid.sx[i % n]); assert.equal(p.sy, grid.sy[Math.floor(i / n)]);
      });
      assert.ok(points(benchmarkContours(grid, sampleField(grid, (x, y) => 4 + x + 0.37 * y), [4.123])).every(([x, y]) => Math.abs(x + 0.37 * y - 0.123) < 1e-12));
    }
    const axis = benchmarkGrid('detector', n).sx;
    const gap = Math.max(...axis.slice(1).map((v, i) => v - axis[i]));
    const error = Math.max(...axis.map((v, i) => Math.abs(v - (axis[0] + i / (n - 1) * (axis.at(-1) - axis[0])))));
    assert.ok(error > gap * 0.1, 'endpoint-only linear mapping measurably misaligns weighted centers');
  }
  assert.throws(() => slopeCoordinate([-1, 1], 0), /outside/);
});

test('circle topology and mapped positions converge on both grids without padded frame edges', () => {
  for (const kind of ['material', 'detector']) {
    let previous = Infinity;
    for (const n of [25, 65, 129]) {
      const grid = benchmarkGrid(kind, n), result = benchmarkContours(grid, sampleField(grid, (x, y) => x * x + y * y), [0.16]);
      assert.equal(result.levels[0].polygons, 1); assert.equal(result.levels[0].holes, 1);
      const pts = points(result); assert.ok(pts.length > 10);
      const error = Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x, y) - 0.4)));
      const maxGap = Math.max(...[grid.sx, grid.sy].flatMap(axis => axis.slice(1).map((v, i) => Math.abs(v - axis[i]))));
      assert.ok(error <= 0.05 * maxGap, 'A5 smooth-fixture localization budget');
      assert.ok(error < previous); previous = error;
      assert.ok(pts.every(([x, y]) => Math.abs(x) <= 0.400001 && Math.abs(y) <= 0.400001));
      assert.ok(result.rejected > 0, 'raw polygon includes frame padding, filtered by adapter');
    }
  }
});

test('constant, invalid, threshold equality, and invalid-region borders never invent contours', () => {
  const grid = benchmarkGrid('material', 25);
  assert.equal(benchmarkContours(grid, Array(625).fill(2), [1, 2, 3]).status, 'constant');
  assert.equal(benchmarkContours(grid, Array(625).fill(null), [1]).status, 'invalid');
  const values = sampleField(grid, x => x + 2), min = Math.min(...values), max = Math.max(...values);
  assert.ok(benchmarkContours(grid, values, [min, max]).levels.every(l => l.status === 'outside-range' && !l.lines.length));
  const masked = Array(625).fill(2); masked[312] = null;
  assert.ok(contours().size([25, 25]).contour(masked, 1).coordinates[0].length > 1, 'D3 alone creates a mask-boundary hole');
  assert.equal(benchmarkContours(grid, masked, [1]).status, 'constant');
  const valid = values.map((_, i) => Math.abs(i % 25 - 12) > 1);
  const result = benchmarkContours(grid, values.map((v, i) => valid[i] ? v : null), [2], valid);
  assert.equal(result.status, 'partial'); assert.equal(points(result).length, 0);
  const supported = benchmarkContours(grid, values.map((v, i) => valid[i] ? v : null), [1.8], valid);
  assert.ok(points(supported).length > 0);
  assert.ok(points(supported).every(([x]) => Math.abs(x + 0.2) < 1e-12), 'mask boundary does not add false lines');
});

test('D3 fixed ambiguous-saddle connectivity is pinned and not claimed as analytic topology', () => {
  const generator = contours().size([2, 2]);
  assert.equal(generator.contour([2, 0, 0, 2], 1).coordinates.length, 2);
  assert.equal(generator.contour([0, 2, 2, 0], 1).coordinates.length, 2);
  // Same sign cases with unequal amplitudes retain D3's case-table connectivity.
  assert.equal(generator.contour([100, 0, 0, 100], 1).coordinates.length, 2);
});
