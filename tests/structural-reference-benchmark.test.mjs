import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPatternFixture } from './projection-pattern-fixtures.mjs';
import { smoothReferenceFixture } from './structural-reference-fixtures.mjs';
import { featureSegments, projectReferencePoint, interfaceProbe } from '../scripts/structural-reference-benchmark-core.mjs';

test('existing edge library selects 12 box creases, not 18 triangulation edges; shell preserves inner creases', () => {
  assert.equal(featureSegments(createPatternFixture('slab').runtime.components[0]).length, 12);
  assert.equal(featureSegments(createPatternFixture('wedge').runtime.components[0]).length, 12);
  assert.equal(featureSegments(createPatternFixture('cavity').runtime.components[0]).length, 24);
});

test('perspective references use detector slopes and reject undefined/backward points', () => {
  const view = { origin: [0, 0, 0], azimuthDeg: 0, elevationDeg: 0 };
  assert.deepEqual(projectReferencePoint([2, 1, 0.5], view), [0.5, 0.25]);
  assert.deepEqual(projectReferencePoint([6, 1, 0.5], view), [1 / 6, 1 / 12]);
  assert.equal(projectReferencePoint([-2, 1, 0], view), null);
  assert.equal(projectReferencePoint([0, 0, 0], view), null);
  const offset = { ...view, origin: [1, 2, 3] };
  assert.deepEqual(projectReferencePoint([3, 3, 3.5], offset), [0.5, 0.25]);
});

test('an inter-material cap is not concrete-air and terrain clipping remains explicit', () => {
  const fixture = createPatternFixture('material-junction');
  const contact = interfaceProbe(fixture.runtime, [[4, -1, -1], [4, 1, 1]], 'concrete');
  assert.deepEqual(contact.materials, ['concrete', 'rock']); assert.equal(contact.hasMaterialAir, false);
  const outer = interfaceProbe(fixture.runtime, [[2, -1, -1], [2, 1, 1]], 'concrete');
  assert.equal(outer.hasMaterialAir, true);
  const terrain = createPatternFixture('terrain');
  assert.ok(featureSegments(terrain.runtime.components[0]).length > 0);
  assert.match(terrain.terrainDomain.limitation, /truncations/);
});

test('gently faceted prism has rim creases but no vertical sharp edges at 30 degrees', () => {
  const fixture = smoothReferenceFixture(), edges = featureSegments(fixture.runtime.components[0]);
  assert.equal(edges.length, 32);
  assert.ok(edges.every(([a, b]) => a[2] === b[2]));
  assert.equal(fixture.runtime.classifyModel([4, 0, 0]).material, 'rock');
});

test('recorded native VTK comparison is tied to unchanged fixtures and captures missing contour cases', async () => {
  const evidence = JSON.parse(await readFile(new URL('./fixtures/structural-reference.json', import.meta.url), 'utf8'));
  assert.equal(evidence.vtkVersion, '9.5.2'); assert.equal(evidence.threeRevision, '186');
  assert.equal(evidence.results.length, 9);
  for (const row of evidence.results) {
    const fixture = row.fixture === 'smooth-prism' ? smoothReferenceFixture() : createPatternFixture(row.fixture);
    const component = fixture.runtime.components.find(c => c.componentId === row.componentId);
    const hash = createHash('sha256').update(JSON.stringify({ positions: Array.from(component.positions), indices: Array.from(component.indices) })).digest('hex');
    assert.equal(hash, row.meshSha256, `${row.fixture}: native evidence requires regeneration`);
    assert.equal(featureSegments(component).length, row.vtkFeatureEdges);
    assert.equal(row.featureEdgeSetMatches, true);
  }
  const slab = evidence.results.find(row => row.fixture === 'slab');
  assert.equal(slab.views.find(v => v.name === 'external').silhouetteEdges, 4);
  assert.equal(slab.views.find(v => v.name === 'internal').silhouetteEdges, 0);
  const prism = evidence.results.find(row => row.fixture === 'smooth-prism');
  assert.equal(prism.views.find(v => v.name === 'external').silhouetteEdgesMissingFromCreases, 2);
});

test('axis-only midpoint probes miss valid cavity crease sectors and cannot qualify interfaces', () => {
  const fixture = createPatternFixture('cavity');
  const diagnostic = interfaceProbe(fixture.runtime, [[3, -1, -1], [3, 1, -1]], 'concrete');
  assert.equal(diagnostic.hasMaterialAir, false);
  assert.equal(fixture.runtime.classifyModel([3.0001, 0, -0.9999]).material, 'air');
  assert.equal(fixture.runtime.classifyModel([2.9999, 0, -1.0001]).material, 'concrete');
});
