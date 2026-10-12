import test from 'node:test';
import assert from 'node:assert/strict';
import { integratedSurfaceFlux, minimumMuonEnergy } from '../../dist/modules/muon-response.js';
import { createProjectionPass } from '../../dist/modules/detector-projection.js';

const device = { layers: 3, width: .4096, height: .4096, stripsX: 8, stripsY: 8,
  nativeSlopeStep: .0016 / .30, maxSlopeX: 7 * .0016 / .30, maxSlopeY: 7 * .0016 / .30 };
const response = { layerEfficiency: .95, deadLiveFraction: .98, angularResolutionDeg: .01,
  systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' };

// Domain invariant 8 (FR-C1): a result never depends on what was evaluated before.
test('integrated flux is independent of evaluation history', () => {
  for (const angularModel of ['gaisser', 'cos2']) {
    const target = [.1, 5], fresh = integratedSurfaceFlux(...target, angularModel);
    const neighbours = [[.0951, 4.8], [.1049, 5.2], [.0999, 4.95]];
    for (const [cosZ, energy] of neighbours) integratedSurfaceFlux(cosZ, energy, angularModel);
    assert.equal(integratedSurfaceFlux(...target, angularModel), fresh);
  }
});

test('a projection pixel does not depend on the pixels evaluated before it', () => {
  // Every pixel but the last differs between the two passes; the last pixel's
  // direction and column density are identical, so its count must be too.
  const run = earlier => {
    const pass = createProjectionPass({ n: 3, device, response, sampleRay: () => {
      const next = earlier.shift() ?? [.1, 1200];
      return { dir: { x: 0, y: 0, z: next[0] }, q: { mwe: next[1], totals: {} } };
    } });
    return pass.advance(3).result.values.at(-1);
  };
  const a = run([]), b = run(Array.from({ length: 8 }, (_, i) => [.0952 + i * .001, 1150 + 10 * i]));
  assert.equal(b.count, a.count);
  assert.equal(b.transmission, a.transmission);
});

test('integrated flux resolves inputs closer than any former cache bucket', () => {
  const near = integratedSurfaceFlux(.1001, 5), far = integratedSurfaceFlux(.1049, 5);
  assert.ok(far > near);
  assert.ok(integratedSurfaceFlux(.1, 5.1) < integratedSurfaceFlux(.1, 5));
});

test('integrated flux edge cases', () => {
  assert.equal(integratedSurfaceFlux(0, 1), 0);
  assert.equal(integratedSurfaceFlux(-.2, 1), 0);
  assert.equal(integratedSurfaceFlux(.5, .2), integratedSurfaceFlux(.5, 1));
  assert.equal(minimumMuonEnergy(-5), 0);
});
