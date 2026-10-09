import { buildStructuralConnectivity, selectStructuralCandidates } from './structural-reference-candidates.js';
import { projectStructuralSegment } from './structural-reference-projection.js';
import { createPatternOverlay, createPatternSnapshot } from './projection-pattern-contract.js';
export const FINITE_REFERENCE_VERSION = '1.0.0';
export function prepareFiniteModelReferences(artifact) {
  if (artifact.eligibility !== 'qualification-only-not-physical-envelope') throw new Error('Expected source-bound finite-model artifact');
  const topology = buildStructuralConnectivity(artifact.mesh);
  if (topology.edges.some(e => !e.left || !e.right)) throw new Error('Closed finite boundary required');
  return { artifact, topology };
}
export function extractFiniteModelReferences(prepared, { snapshot, grid, materials, featureAngleDeg = 30, includeCreases = true, nearDepthM = .001 }) {
  if (createPatternSnapshot(snapshot.inputs).key !== snapshot.key) throw new Error('Invalid reference snapshot');
  const { artifact, topology } = prepared, input = snapshot.inputs;
  for (const key of ['kind', 'sx', 'sy', 'sxBounds', 'syBounds']) {
    if (JSON.stringify(grid[key]) !== JSON.stringify(input.sampling.grid[key])) throw new Error('Reference/grid snapshot mismatch');
  }
  if (input.datasetRelease !== artifact.source.identity.release_id || input.scenario !== artifact.source.scenarioId
    || input.backendVersion !== artifact.source.backend || JSON.stringify(input.environment.geometry) !== JSON.stringify(artifact.source.geometry)) {
    // Object key order is not identity: compare canonical snapshot subobjects.
    const identity = v => JSON.stringify(v, (_, x) => x && !Array.isArray(x) && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
    if (input.datasetRelease !== artifact.source.identity.release_id || input.scenario !== artifact.source.scenarioId
      || input.backendVersion !== artifact.source.backend || identity(input.environment.geometry) !== identity(artifact.source.geometry)) throw new Error('Reference/source snapshot mismatch');
  }
  if (!Array.isArray(materials) || !materials.length || new Set(materials).size !== materials.length
    || materials.some(m => m === 'air' || !Object.hasOwn(input.environment.geometry.materials, m))) throw new Error('Registered unique non-air materials required');
  const selected = selectStructuralCandidates(topology, { origin: input.station.origin, featureAngleDeg, includeCreases });
  const candidates = new Map(selected.candidates.map(e => [e.edgeId, e]));
  // Air patch transitions include coplanar material rims. Cap-incident rims
  // are excluded; partial contact splitting was performed by pinned Manifold.
  for (const edge of topology.edges) {
    if (artifact.faceMaterials[edge.left.face] !== artifact.faceMaterials[edge.right.face]) {
      const old = candidates.get(edge.edgeId);
      candidates.set(edge.edgeId, { ...edge, faceIds: [edge.left.face, edge.right.face], reasons: [...(old?.reasons || []), 'finite-material-patch-rim'] });
    }
  }
  const settings = { scope: 'finite-model-not-certified-physical', featureAngleDeg, includeCreases, nearDepthM,
    throughMaterial: true, knownCapPolicy: 'exclude-every-incident-edge', sourceContentSha256: artifact.contentSha256,
    slopeBounds: { sx: [grid.sx[0], grid.sx.at(-1)], sy: [grid.sy.at(-1), grid.sy[0]] }, rayLengthM: input.sampling.rayLengthM };
  return materials.map(material => {
    const lines = [], lineSources = []; let eligible = 0, excludedCaps = 0, clipped = 0;
    for (const edge of candidates.values()) {
      const faces = edge.faceIds;
      if (!faces.some(f => artifact.faceMaterials[f] === material)) continue;
      if (faces.some(f => artifact.faceScopeKinds[f] === 'domain-cap')) { excludedCaps++; continue; }
      eligible++;
      const projected = projectStructuralSegment(edge.segment, { origin: input.station.origin, ...input.pose,
        slopeBounds: settings.slopeBounds, rayLengthM: settings.rayLengthM, nearDepthM });
      if (projected.state === 'outside-field') continue;
      clipped += projected.state === 'clipped' ? 1 : 0;
      lines.push(projected.segmentSlope);
      lineSources.push({ edgeId: edge.edgeId, faceIds: faces, materials: faces.map(f => artifact.faceMaterials[f]),
        ancestors: faces.map(f => artifact.sourceFaces[f]), sourceEntityId: null, reasons: edge.reasons,
        segmentModel: projected.segmentModel, parameterInterval: projected.parameterInterval, clippedBy: projected.clippedBy });
    }
    return createPatternOverlay({ id: `finite-reference:${material}`, snapshot, semantic: 'structural-reference',
      source: { id: artifact.contentSha256, kind: 'source-bound-finite-model-boundary', snapshotKey: snapshot.key },
      algorithm: { name: 'VTK-9.5.2-silhouette-adaptation', version: FINITE_REFERENCE_VERSION }, settings: { ...settings, material },
      tolerance: { value: artifact.meshToleranceM ?? 0, units: 'm' },
      state: lines.length ? (clipped || excludedCaps ? 'clipped' : 'ready') : eligible ? 'outside-field' : excludedCaps ? 'unresolved' : 'absent',
      provenance: { complete: false, eligibleEdges: eligible, excludedCapEdges: excludedCaps, lineSources,
        physicalScope: 'unresolved', overlappingMaterialRims: true,
        limitations: [...artifact.limitations, 'Finite-model reference only: structure/water/domain boundary semantics remain unresolved.',
          'Known artificial caps and every incident edge excluded; missing terrain beyond published volume is not shown.',
          'Through-material reference, not optical visibility, measured contrast or a calibrated detectability claim.',
          'Native tolerance/zero numerical extraction tolerance is not survey accuracy.'] }, lines });
  });
}
