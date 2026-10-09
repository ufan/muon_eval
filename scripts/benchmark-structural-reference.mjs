import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createPatternFixture, patternFixtureIds } from '../tests/projection-pattern-fixtures.mjs';
import { smoothReferenceFixture } from '../tests/structural-reference-fixtures.mjs';
import { featureSegments, segmentKey, projectReferencePoint, interfaceProbe, THREE_REFERENCE_REVISION } from './structural-reference-benchmark-core.mjs';

const fixtures = [...patternFixtureIds.map(createPatternFixture), smoothReferenceFixture()];
const request = { featureAngleDeg: 30, fixtures: fixtures.map(f => ({ id: f.id, views: f.views,
  components: f.runtime.components.map(c => ({ componentId: c.componentId, positions: Array.from(c.positions), indices: Array.from(c.indices) })) })) };
const option = process.argv.indexOf('--python');
const python = option >= 0 ? process.argv[option + 1] : 'python3';
const native = spawnSync(python, [fileURLToPath(new URL('./vtk-structural-reference.py', import.meta.url))],
  { input: JSON.stringify(request), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (native.error || native.status !== 0) throw new Error(`VTK reference unavailable: ${native.error?.message || native.stderr}`);
const vtk = JSON.parse(native.stdout);
if (vtk.vtkVersion !== '9.5.2') throw new Error(`Expected pinned VTK 9.5.2; got ${vtk.vtkVersion}`);
const results = vtk.results.map(record => {
  const fixture = fixtures.find(f => f.id === record.fixture), component = fixture.runtime.components.find(c => c.componentId === record.componentId);
  const three = featureSegments(component), threeKeys = new Set(three.map(segmentKey)), vtkKeys = new Set(record.featureSegments.map(segmentKey));
  const difference = [...threeKeys].filter(key => !vtkKeys.has(key)).concat([...vtkKeys].filter(key => !threeKeys.has(key)));
  if (difference.length) throw new Error(`Feature-edge mismatch ${record.fixture}/${record.componentId}`);
  return { fixture: fixture.id, componentId: component.componentId, material: component.metadata.material_id,
    meshSha256: createHash('sha256').update(JSON.stringify({ positions: Array.from(component.positions), indices: Array.from(component.indices) })).digest('hex'),
    threeFeatureEdges: three.length, vtkFeatureEdges: record.featureSegments.length, featureEdgeSetMatches: true,
    terrainDomain: fixture.terrainDomain,
    views: record.views.map(v => {
      const view = fixture.views.find(item => item.name === v.name);
      const all = [...new Map([...three, ...v.segments].map(segment => [segmentKey(segment), segment])).values()];
      const contacts = all.filter(s => !interfaceProbe(fixture.runtime, s, component.metadata.material_id).hasMaterialAir);
      const projected = all.map(s => s.map(p => projectReferencePoint(p, view)));
      return { name: v.name, silhouetteEdges: v.segments.length, combinedCandidates: all.length,
        silhouetteEdgesMissingFromCreases: v.segments.filter(s => !threeKeys.has(segmentKey(s))).length,
        nonAirInterfaceProbeCandidates: contacts.length,
        candidatesWithEndpointAtOrBehindObserverPlane: projected.filter(s => s.some(p => p === null)).length,
        silhouetteSegmentsModel: v.segments };
    }) };
});
console.log(JSON.stringify({ schemaVersion: '1.0.0', vtkVersion: vtk.vtkVersion, threeRevision: THREE_REFERENCE_REVISION,
  featureAngleDeg: request.featureAngleDeg, directionMode: 'specified-origin (perspective)', hiddenLineRemoval: false,
  limitations: ['Candidate comparison only; material-interface probes do not prove whole-edge qualification.',
    'No field clipping, adaptive edge splitting, source attribution, or production implementation accepted.'], results }, null, 2));
