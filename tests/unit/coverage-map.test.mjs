import test from 'node:test';
import assert from 'node:assert/strict';
import { detectorBasis, slopeDirection, skySideDirection } from '../../dist/modules/detector-pose.js';
import { createProjectionPass, nativeAxisBins } from '../../dist/modules/detector-projection.js';
import { lineSlopes, classifyCoverage, slopeBin, countsPerSteradian, coverageBrightness, COVERAGE_LOG_RANGE, placementPoint, coveringStations, coverageStationSet, MAX_EXTRA_COVERAGE } from '../../dist/modules/coverage-map.js';

// Coverage highlight (FR-M10, ADR-026): what a station probes, evaluated per surface point.
const N = 16, step = .002 / .3;
const device = { layers: 3, width: .032, height: .032, stripsX: N, stripsY: N, nativeSlopeStep: step, maxSlopeX: (N - 1) * step, maxSlopeY: (N - 1) * step };
const origin = [10, 20, 5], basis = detectorBasis(30, 25);
const at = (direction, t) => origin.map((o, i) => o + t * direction[i]);
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('a point maps to the slopes of its line, from either end (mirror of detector-pose)', () => {
  for (const [sx, sy] of [[0, 0], [.05, -.08], [-.09, .1]]) {
    const d = slopeDirection(basis, sx, sy);
    const front = lineSlopes(at(d, 37), origin, basis), back = lineSlopes(at(d, -12), origin, basis);
    assert.ok(close(front.sx, sx) && close(front.sy, sy)); assert.equal(front.side, 'front');
    assert.ok(close(back.sx, sx) && close(back.sy, sy)); assert.equal(back.side, 'back');
  }
  assert.equal(lineSlopes(at(basis.right, 5), origin, basis), null);
});

test('points above the detector inside the acceptance are probed, in front or behind; below the horizon in front is no flux', () => {
  // A line steep enough to point below the horizon in front: its sky end is behind the detector.
  // (This device spans about ±6°, so tilt it only 3° up.)
  const low = detectorBasis(30, 3), d = slopeDirection(low, 0, -(device.maxSlopeY * .95));
  assert.ok(d[2] < 0);
  assert.equal(classifyCoverage(at(d, 30), origin, low, device), 'no-flux');
  assert.equal(classifyCoverage(at(skySideDirection(d).direction, 30), origin, low, device), 'probed');
  assert.equal(classifyCoverage(at(slopeDirection(basis, .02, .03), 50), origin, basis, device), 'probed');
  assert.equal(classifyCoverage(at(slopeDirection(basis, device.maxSlopeX * 1.1, 0), 50), origin, basis, device), 'outside');
  // Behind and below the horizon: the line's other end carries the muons, nothing here is probed.
  assert.equal(classifyCoverage(at(slopeDirection(basis, 0, .02), -30), origin, basis, device), 'outside');
});

test('a slope maps to exactly the projection bin that aggregates it', () => {
  for (const n of [3, 25, 31]) {
    const bins = nativeAxisBins(n, device);
    for (let j = -(N - 1); j <= N - 1; j++) {
      const i = slopeBin(j * step, n, device);
      assert.ok(bins[i].first <= j && j <= bins[i].last, `n ${n} native ${j} → bin ${i}`);
    }
    assert.equal(slopeBin(device.maxSlopeX * 1.2, n, device), null);
  }
});

test('counts per steradian divide each pixel count by its own solid angle (shared core formula)', () => {
  const response = { layerEfficiency: .9, deadLiveFraction: .95, angularResolutionDeg: .01, systematicFraction: .03, exposureDays: 2, angularModel: 'gaisser' };
  const I = 7e-3, n = 5, pass = createProjectionPass({ n, device, response, flux: () => I, sampleRay: () => ({ dir: { z: 1 }, q: { mwe: 0 } }) });
  const { values } = pass.advance(n).result, perSr = countsPerSteradian(values, n, device);
  const area = device.width * device.height * 1e4, seconds = response.exposureDays * 86400, eff = response.layerEfficiency ** 3 * response.deadLiveFraction;
  values.forEach((v, i) => {
    const cos = 1 / Math.sqrt(1 + v.sx ** 2 + v.sy ** 2);
    assert.ok(Math.abs(perSr[i] / (I * area * cos * seconds * eff) - 1) < 1e-12);
  });
});

test('brightness is a fixed logarithmic scale of counts per steradian', () => {
  const [low, high] = COVERAGE_LOG_RANGE;
  assert.equal(coverageBrightness(0), 0);
  assert.equal(coverageBrightness(10 ** low), 0);
  assert.equal(coverageBrightness(10 ** high), 1);
  assert.equal(coverageBrightness(10 ** ((low + high) / 2)), .5);
  assert.equal(coverageBrightness(10 ** (high + 3)), 1);
});

test('the readout of a surface point names its pixel exactly and its counts per steradian', async () => {
  const { coverageReadout } = await import('../../dist/modules/coverage-map.js');
  const response = { layerEfficiency: .9, deadLiveFraction: .95, angularResolutionDeg: .01, systematicFraction: .03, exposureDays: 2, angularModel: 'gaisser' };
  const n = 5, values = createProjectionPass({ n, device, response, flux: () => 7e-3, sampleRay: () => ({ dir: { z: 1 }, q: { mwe: 0 } }) }).advance(n).result.values;
  const station = { x: origin[0], y: origin[1], z: origin[2], az: 30, el: 25 }, bins = nativeAxisBins(n, device);
  // Aim at the centre of pixel (ix 3, iy 1) from in front, above the detector.
  const point = at(slopeDirection(basis, bins[3].slope, bins[1].slope), 40);
  const readout = coverageReadout(point, station, device, { n, values });
  assert.equal(readout.status, 'probed'); assert.equal(readout.side, 'front');
  assert.deepEqual([readout.ix, readout.iy], [3, 1]);
  assert.ok(Math.abs(readout.countsPerSr / countsPerSteradian(values, n, device)[1 * n + 3] - 1) < 1e-12);
  // Without a result: geometry only.
  const geometric = coverageReadout(point, station, device, null);
  assert.equal(geometric.countsPerSr, null); assert.deepEqual([geometric.ix, geometric.iy], [null, null]);
  assert.equal(coverageReadout(at(basis.right, 3), station, device, { n, values }).status, 'outside');
});

// Sketching (14d, FR-P5): place stations on the model and see several fields of view at once.
test('a picked surface point becomes a station point just off the surface, on the viewer\'s side', () => {
  // Floor seen from above: the normal already faces the viewer.
  assert.deepEqual(placementPoint([1, 2, 3], [0, 0, 1], [0, 0, -1]), [1, 2, 3.5]);
  // A face seen from its back side: the normal is flipped towards the viewer.
  assert.deepEqual(placementPoint([1, 2, 3], [1, 0, 0], [1, 0, 0], 2), [-1, 2, 3]);
  // Normals need not be unit length; invalid input fails.
  assert.deepEqual(placementPoint([0, 0, 0], [0, 0, 4], [0, 0, -1]), [0, 0, .5]);
  assert.throws(() => placementPoint([0, 0, Number.NaN], [0, 0, 1], [0, 0, -1]), /finite/);
  assert.throws(() => placementPoint([0, 0, 0], [0, 0, 0], [0, 0, -1]), /normal/);
});

test('the stations covering a point are those that probe it (same rule as one station)', () => {
  const station = (id, az, el) => ({ id, x: origin[0], y: origin[1], z: origin[2], az, el, device });
  const stations = [station('a', 30, 25), station('b', 30, 26), station('c', 210, 25)];
  const point = at(slopeDirection(basis, 0, 0), 50);
  assert.deepEqual(coveringStations(point, stations), ['a', 'b']);
  for (const s of stations) assert.equal(coveringStations(point, [s]).length === 1, classifyCoverage(point, [s.x, s.y, s.z], detectorBasis(s.az, s.el), device) === 'probed');
});

test('the extra coverage set follows the chosen source, skips the working station\'s own candidate and is capped', () => {
  const pool = ['a', 'b', 'c', 'd'], context = { pool, compared: ['c', 'a'], deployment: ['d', 'b'], exclude: 'b' };
  assert.deepEqual(coverageStationSet('none', context), []);
  assert.deepEqual(coverageStationSet('compared', context), ['a', 'c']);
  assert.deepEqual(coverageStationSet('deployment', context), ['d']);
  assert.deepEqual(coverageStationSet('all', context), ['a', 'c', 'd']);
  assert.deepEqual(coverageStationSet('all', { ...context, exclude: null }), pool);
  const many = Array.from({ length: 12 }, (_, i) => `s${i}`);
  assert.equal(coverageStationSet('all', { pool: many, compared: [], deployment: [], exclude: null }).length, MAX_EXTRA_COVERAGE);
  assert.throws(() => coverageStationSet('some', context), /Unknown/);
});
