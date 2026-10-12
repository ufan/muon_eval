import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildStructuralConnectivity, selectStructuralCandidates } from '../../dist/modules/structural-reference-candidates.js';
import { createPatternFixture } from '../projection-pattern-fixtures.mjs';
import { smoothReferenceFixture } from '../structural-reference-fixtures.mjs';
import { featureSegments, segmentKey } from '../../scripts/structural-reference-benchmark-core.mjs';

test('VTK adaptation matches all 27 native silhouette sets and nine crease sets', async () => {
  const evidence = JSON.parse(await readFile(new URL('../fixtures/structural-reference.json', import.meta.url)));
  assert.equal(evidence.vtkVersion, '9.5.2');
  for (const row of evidence.results) {
    const fixture = row.fixture === 'smooth-prism' ? smoothReferenceFixture() : createPatternFixture(row.fixture);
    const mesh = fixture.runtime.components.find(c => c.componentId === row.componentId);
    const hash = createHash('sha256').update(JSON.stringify({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })).digest('hex');
    assert.equal(hash, row.meshSha256);
    const connectivity = buildStructuralConnectivity(mesh);
    for (const native of row.views) {
      const view = fixture.views.find(v => v.name === native.name);
      const selected = selectStructuralCandidates(connectivity, { origin: view.origin, includeCreases: false });
      assert.deepEqual(selected.candidates.map(c => segmentKey(c.segment)).sort(), native.silhouetteSegmentsModel.map(segmentKey).sort(), `${row.fixture}/${row.componentId}/${view.name}`);
      assert.equal(selected.qualification, 'unresolved');
      assert.equal(selected.borderEdgeIds.length, 0);
    }
    const selected = selectStructuralCandidates(connectivity, { origin: fixture.views[0].origin });
    assert.deepEqual(selected.candidates.filter(c => c.reasons.includes('crease')).map(c => segmentKey(c.segment)).sort(), featureSegments(mesh).map(segmentKey).sort());
  }
});

test('open boundaries are excluded and never silently welded or certified', () => {
  const connectivity = buildStructuralConnectivity({ positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2] });
  const result = selectStructuralCandidates(connectivity, { origin: [0,0,1] });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.borderEdgeIds.length, 3);
  assert.equal(connectivity.pointIdentity, 'indexed-no-welding');
  assert.match(result.limitations.join(' '), /border edges/);
});

test('invalid meshes and selection settings fail explicitly', () => {
  for (const mesh of [
    { positions: [0,0,0, 1,0,0, 2,0,0], indices: [0,1,2] },
    { positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,3] },
    { positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2, 0,1,2] },
    { positions: [NaN,0,0], indices: [0,0,0] }
  ]) assert.throws(() => buildStructuralConnectivity(mesh));
  const mesh = createPatternFixture('slab').runtime.components[0];
  const connectivity = buildStructuralConnectivity(mesh);
  assert.throws(() => selectStructuralCandidates(connectivity, { origin: [0,0,Infinity] }));
  assert.throws(() => selectStructuralCandidates(connectivity, { origin: [0,0,0], featureAngleDeg: -1 }));
});

test('detached connectivity and candidate segments do not mutate geometry truth', () => {
  const mesh = createPatternFixture('slab').runtime.components[0], before = Array.from(mesh.positions);
  const connectivity = buildStructuralConnectivity(mesh);
  const selected = selectStructuralCandidates(connectivity, { origin: [0,0,0] });
  selected.candidates[0].segment[0][0] += 100;
  assert.deepEqual(Array.from(mesh.positions), before);
  assert.notEqual(selected.candidates[0].segment[0][0], connectivity.edges.find(e => e.edgeId === selected.candidates[0].edgeId).segment[0][0]);
});
