import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionPass, evaluateProjectionPixel, nativeAxisBins } from '../../dist/modules/detector-projection.js';

// Two-plane telescope: N strips of pitch p per axis, outer planes D apart.
const N = 16, p = .002, D = .3;
const device = { layers: 3, width: N * p, height: N * p, stripsX: N, stripsY: N, nativeSlopeStep: p / D,
  maxSlopeX: (N - 1) * p / D, maxSlopeY: (N - 1) * p / D };
const response = { layerEfficiency: .9, deadLiveFraction: .95, angularResolutionDeg: .01,
  systematicFraction: .03, exposureDays: 2, angularModel: 'gaisser' };
const I = 7e-3, flux = () => I;  // isotropic intensity, cm^-2 s^-1 sr^-1
const seconds = response.exposureDays * 86400, efficiency = response.layerEfficiency ** 3 * response.deadLiveFraction;

// FR-C3: the geometric factor of all pixel pairs with offset (m, n) is
// (N-|m|)(N-|n|) p^2 (p/D)^2 cos^4(theta): projected area (cos) times the
// solid angle of a slope cell (cos^3). Verified against an independent
// isotropic-field Monte Carlo in CALCULATION_MODEL.md section 10.
test('native pixel counts follow the two-plane cos^4 geometric factor with no extra factors', () => {
  const bins = nativeAxisBins(2 * N - 1, device);
  for (const [m, n] of [[0, 0], [5, 0], [0, -9], [7, 7], [-15, 15], [15, -3]]) {
    const bx = bins[m + N - 1], by = bins[n + N - 1], tan2 = (m * p / D) ** 2 + (n * p / D) ** 2;
    const { value } = evaluateProjectionPixel({ bx, by, dir: { z: 1 }, q: { mwe: 0 }, device, response, flux });
    const expected = I * seconds * efficiency * (N - Math.abs(m)) * (N - Math.abs(n)) * (p * 100) ** 2 * (p / D) ** 2
      / (1 + tan2) ** 2;
    assert.ok(Math.abs(value.count / expected - 1) < 1e-12, `(${m},${n}): ${value.count} vs ${expected}`);
  }
});

test('the count factor does not depend on how many native bins a pixel aggregates', () => {
  // A central pixel's factor per native bin is the same on every grid size
  // (no grid-dependent heuristic factor).
  const centre = n => {
    const bins = nativeAxisBins(n, device), b = bins[(n - 1) / 2];
    const { value } = evaluateProjectionPixel({ bx: b, by: b, dir: { z: 1 }, q: { mwe: 0 }, device, response, flux });
    return value.factor / (b.sumWeight * b.sumWeight) * (1 + 2 * b.slope ** 2) ** 2;
  };
  assert.ok(Math.abs(centre(3) / centre(31) - 1) < 1e-12);
  assert.ok(Math.abs(centre(11) / centre(31) - 1) < 1e-12);
});

test('total open-sky count of an isotropic field sums the native geometric factors', () => {
  const pass = createProjectionPass({ n: 2 * N - 1, device, response, flux,
    sampleRay: () => ({ dir: { z: 1 }, q: { mwe: 0, totals: {} } }) });
  let expected = 0;
  for (let m = 1 - N; m < N; m++) for (let n = 1 - N; n < N; n++)
    expected += (N - Math.abs(m)) * (N - Math.abs(n)) * (p / D) ** 2 / (1 + (m * p / D) ** 2 + (n * p / D) ** 2) ** 2;
  expected *= I * seconds * efficiency * (p * 100) ** 2;
  assert.ok(Math.abs(pass.advance(2 * N).result.total / expected - 1) < 1e-12);
});

// quick-response@4.0.0: a pixel is a line through the detector; without timing the
// detector cannot tell which end a muon came from, so counts come from its sky end.
test('the sky end of a detector line is the direction itself or its reverse', async () => {
  const { skySideDirection } = await import('../../dist/modules/detector-pose.js');
  assert.deepEqual(skySideDirection([.6, 0, .8]), { direction: [.6, 0, .8], side: 'front' });
  assert.deepEqual(skySideDirection([.6, 0, -.8]), { direction: [-.6, -0, .8], side: 'back' });
  // Exactly horizontal lines keep the front direction (no flux either way).
  assert.equal(skySideDirection([1, 0, 0]).side, 'front');
});

test('the projection core rejects rays below the horizon and keeps the side of each pixel', () => {
  const run = sample => createProjectionPass({ n: 3, device, response, flux, sampleRay: sample }).advance(3).result;
  assert.throws(() => run(() => ({ dir: { x: 0, y: 0, z: -.1 }, q: { mwe: 0 } })), /sky side/);
  const values = run((sx, sy) => ({ dir: { x: 0, y: 0, z: 1 }, side: sy < 0 ? 'back' : 'front', q: { mwe: 0 } })).values;
  assert.deepEqual(values.map(v => v.side), values.map(v => v.sy < 0 ? 'back' : 'front'));
  assert.deepEqual([values[0].side, values[8].side], ['back', 'front']);
  // A back pixel counts exactly like the same pixel with the same sky direction and column marked front.
  const front = run(() => ({ dir: { x: 0, y: 0, z: 1 }, side: 'front', q: { mwe: 0 } })).values;
  assert.deepEqual(values.map(v => v.count), front.map(v => v.count));
});
