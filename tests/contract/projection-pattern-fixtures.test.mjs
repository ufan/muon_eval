import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatternFixture, patternFixtureIds, FIXTURE_TOLERANCE_M } from '../projection-pattern-fixtures.mjs';
import { detectorBasis, slopeDirection, evaluateMaterialProjection } from '../../dist/modules/material-projection.js';

const near = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) <= FIXTURE_TOLERANCE_M, `${label}: ${actual} != ${expected}`);

test('fixture central chords have independent hand-calculated lengths and classifications', () => {
  const expected = { slab: [4, 0], wedge: [4, 0], cavity: [2, 0], opening: [0, 0], 'material-junction': [2, 2], terrain: [0, 8] };
  for (const [id, [concrete, rock]] of Object.entries(expected)) {
    const fixture = createPatternFixture(id);
    for (const result of [fixture.reference([0, 0, 0], [1, 0, 0], 20), fixture.runtime.traceRayModel([0, 0, 0], [1, 0, 0], 20)]) {
      near(result.totals.concrete, concrete, id); near(result.totals.rock, rock, id);
      near(result.totals.air, 20 - concrete - rock, id); near(result.mwe, concrete * 2.4 + rock * 2.65, id);
    }
  }
  assert.equal(createPatternFixture('cavity').runtime.classifyModel([4, 0, 0]).material, 'air');
  assert.equal(createPatternFixture('cavity').runtime.classifyModel([2.5, 0, 0]).material, 'concrete');
  assert.equal(createPatternFixture('opening').runtime.classifyModel([4, 0, 0]).material, 'air');
  assert.equal(createPatternFixture('material-junction').runtime.classifyModel([5, 0, 0]).material, 'rock');
  assert.equal(createPatternFixture('terrain').runtime.classifyModel([4, 0, 3]).material, 'air');
});

test('all fixtures match analytic chords for internal, external and off-axis slope grids', () => {
  for (const id of patternFixtureIds) {
    const fixture = createPatternFixture(id);
    for (const view of fixture.views) {
      const basis = detectorBasis(view.azimuthDeg, view.elevationDeg);
      for (const bins of [25, 65, 129]) {
        for (let row = 0; row < bins; row++) for (let column = 0; column < bins; column++) {
          const direction = slopeDirection(basis, -0.6 + 1.2 * column / (bins - 1), 0.6 - 1.2 * row / (bins - 1));
          const expected = fixture.reference(view.origin, direction, 20), actual = fixture.runtime.traceRayModel(view.origin, direction, 20);
          for (const material of ['air', 'concrete', 'rock']) near(actual.totals[material], expected.totals[material], `${id}/${view.name}/${bins}/${material}`);
          near(actual.mwe, expected.mwe, id); near(Object.values(actual.totals).reduce((a, b) => a + b), 20, 'conservation');
        }
      }
    }
  }
});

test('slab and wedge retain all-hit but varying thickness; opening and cavity are not filled', async () => {
  const config = { origin: [0, 0, 0], azimuthDeg: 0, elevationDeg: 0, halfAngleDeg: 15, bins: 25, length: 20 };
  for (const id of ['slab', 'wedge']) {
    const projection = await evaluateMaterialProjection(createPatternFixture(id).runtime, config);
    assert.ok(projection.pixels.every(pixel => pixel.totals.concrete > 0));
    assert.ok(Math.max(...projection.pixels.map(p => p.totals.concrete)) - Math.min(...projection.pixels.map(p => p.totals.concrete)) > 0.1);
  }
  const cavity = createPatternFixture('cavity').runtime.traceRayModel([0, 0, 0], [1, 0, 0], 20);
  assert.deepEqual(cavity.segments.filter(s => s.material === 'concrete').map(s => [s.t0, s.t1]), [[2, 3], [5, 6]]);
  near(createPatternFixture('opening').runtime.traceRayModel([0, 0, 0], [1, 0, 0], 20).mwe, 0);
});

test('finite ray truncation, tangency, and finite terrain domain have explicit references', () => {
  const slab = createPatternFixture('slab');
  for (const length of [1, 3, 20]) {
    near(slab.runtime.traceRayModel([0, 0, 0], [1, 0, 0], length).totals.concrete, Math.max(0, Math.min(length, 6) - 2));
  }
  for (const source of [[0, 4, 0], [0, 4, 4]]) {
    near(slab.reference(source, [1, 0, 0], 20).mwe, 0);
    near(slab.runtime.traceRayModel(source, [1, 0, 0], 20).mwe, 0);
  }
  const terrain = createPatternFixture('terrain');
  assert.equal(terrain.terrainDomain.physicalTop, 'z=1+x/4');
  near(terrain.runtime.traceRayModel([4, 0, 0], [0, 0, 1], 20).totals.rock, 2);
  near(terrain.reference([4, 0, 0], [0, 0, 1], 20).totals.rock, 2);
});

test('oblique slab/wedge formulas and an internal cavity exit anchor the analytic oracle', () => {
  const direction = slopeDirection(detectorBasis(0, 0), 0.2, 0.1);
  const expectedSlab = 4 * Math.sqrt(1 + 0.2 ** 2 + 0.1 ** 2);
  const expectedWedge = 6 / (direction[0] - direction[1] / 4) - 2 / direction[0];
  for (const [id, expected] of [['slab', expectedSlab], ['wedge', expectedWedge]]) {
    const fixture = createPatternFixture(id);
    near(fixture.reference([0, 0, 0], direction, 20).totals.concrete, expected);
    near(fixture.runtime.traceRayModel([0, 0, 0], direction, 20).totals.concrete, expected);
  }
  const cavity = createPatternFixture('cavity');
  near(cavity.reference([4, 0, 0], [1, 0, 0], 20).totals.concrete, 1);
  assert.deepEqual(cavity.runtime.traceRayModel([4, 0, 0], [1, 0, 0], 20).segments.filter(s => s.material === 'concrete').map(s => [s.t0, s.t1]), [[1, 2]]);
});
