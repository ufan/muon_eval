import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { benchmarkGrid, sampleField, benchmarkContours } from './contour-benchmark-core.mjs';
import { patternFixtureIds, createPatternFixture } from '../tests/projection-pattern-fixtures.mjs';
import { detectorBasis, slopeDirection } from '../dist/modules/material-projection.js';

const round = v => Number(v.toPrecision(7));
const gap = axis => Math.max(...axis.slice(1).map((v, i) => Math.abs(v - axis[i])));
const points = result => result.levels.flatMap(v => v.lines.flat());
function timing(fn) {
  for (let i = 0; i < 5; i++) fn();
  const times = [];
  for (let i = 0; i < 20; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { medianMs: round((times[9] + times[10]) / 2), p95Ms: round(times[18]), maxMs: round(times[19]) };
}
const analytic = [], geometry = [];
for (const kind of ['material', 'detector']) for (const n of [25, 65, 129]) {
  const grid = benchmarkGrid(kind, n), maxGap = Math.max(gap(grid.sx), gap(grid.sy));
  const affine = sampleField(grid, (x, y) => 4 + x + 0.37 * y), circle = sampleField(grid, (x, y) => x * x + y * y);
  const affineResult = benchmarkContours(grid, affine, [4.123]), circleResult = benchmarkContours(grid, circle, [0.16]);
  const affineError = Math.max(...points(affineResult).map(([x, y]) => Math.abs(x + 0.37 * y - 0.123)));
  const circleError = Math.max(...points(circleResult).map(([x, y]) => Math.abs(Math.hypot(x, y) - 0.4)));
  const badMapError = Math.max(...grid.sx.map((x, i) => Math.abs(x - (grid.sx[0] + i / (n - 1) * (grid.sx.at(-1) - grid.sx[0])))));
  analytic.push({ kind, n, maxSlopeGap: round(maxGap), affineMaxResidual: round(affineError), circleMaxRadialError: round(circleError),
    rawCircleTopology: { polygons: circleResult.levels[0].polygons, holes: circleResult.levels[0].holes },
    endpointLinearMappingMaxError: round(badMapError), threeLevels: timing(() => benchmarkContours(grid, circle, [0.09, 0.16, 0.25])) });
  for (const id of patternFixtureIds) {
    const fixture = createPatternFixture(id), material = id === 'terrain' ? 'rock' : 'concrete';
    const views = fixture.views.map(view => {
      const basis = detectorBasis(view.azimuthDeg, view.elevationDeg);
      const fn = (x, y) => fixture.reference(view.origin, slopeDirection(basis, x, y), 20).totals[material];
      const values = sampleField(grid, fn), min = Math.min(...values), max = Math.max(...values);
      const levels = [0.25, 0.5, 0.75].map(t => min + (max - min) * t);
      const result = benchmarkContours(grid, values, levels);
      let residual = 0;
      for (const layer of result.levels) for (const line of layer.lines) for (const [x, y] of line) residual = Math.max(residual, Math.abs(fn(x, y) - layer.level));
      return { view: view.name, lines: result.levels.reduce((sum, layer) => sum + layer.lines.length, 0),
        points: points(result).length, maxLengthResidualM: round(residual),
        rawTopology: result.levels.map(layer => [layer.polygons, layer.holes]), rejectedPaddingEdges: result.rejected };
    });
    geometry.push({ kind, n, fixture: id, material, views });
  }
}
const bundle = await readFile(new URL('../dist/vendor/d3-contour/contours.js', import.meta.url));
console.log(JSON.stringify({ schemaVersion: '1.0.0', algorithm: 'd3-contour@4.0.2',
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  bundle: { bytes: bundle.length, sha256: createHash('sha256').update(bundle).digest('hex') },
  configuration: { materialHalfAngleDeg: 30, detector: 'defaultAssessmentDevice()', rayLengthM: 20, repetitions: 20, warmups: 5,
    smoothing: 'D3 linear interpolation (not detector smoothing)', invalidPolicy: 'exclude segments in cells with any invalid corner',
    paddingPolicy: 'exclude segments outside sample-center hull; do not extrapolate',
    errorMeaning: 'vertex residual only; not Hausdorff/topological accuracy or uncertainty',
    timingMeaning: 'D3 extraction plus coordinate/mask adapter, excludes ray tracing and browser rendering' }, analytic, geometry }, null, 2));
