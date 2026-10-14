import test from 'node:test';
import assert from 'node:assert/strict';
import { detectorBasis, slopeDirection, skySideDirection } from '../../dist/modules/detector-pose.js';
import { createProjectionPass, nativeAxisBins } from '../../dist/modules/detector-projection.js';
import { lineSlopes, classifyCoverage, slopeBin, countsPerSteradian, coverageBrightness, COVERAGE_LOG_RANGE } from '../../dist/modules/coverage-map.js';

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
