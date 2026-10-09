// Consume explicit whole-face qualification; never infer it from labels,
// midpoint probes, bounding boxes or source names. This validates a supplied
// certificate, not the scientific correctness of the certifying procedure.
import { sha256Portable } from './sha256.js';
import { buildStructuralConnectivity, selectStructuralCandidates } from './structural-reference-candidates.js';
export const STRUCTURAL_FACE_MAP_VERSION = '1.0.0';
export const STRUCTURAL_QUALIFICATION_VERSION = '1.1.0';
export function structuralMeshIdentity(mesh) {
  return sha256Portable(new TextEncoder().encode(JSON.stringify({ positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) })));
}
export function qualifiedStructuralCandidates(mesh, { material, scenarioKey, faceMap = null, includePatchBoundaries = false, ...selection } = {}) {
  if (typeof material !== 'string' || !material || material === 'air' || typeof scenarioKey !== 'string' || !scenarioKey) throw new Error('Explicit target material and scenario identity required');
  if (typeof selection.includeCreases !== 'boolean' || !Number.isFinite(selection.featureAngleDeg)) throw new Error('Explicit reference type/feature angle settings required');
  if (typeof includePatchBoundaries !== 'boolean') throw new Error('Invalid patch boundary setting');
  const connectivity = buildStructuralConnectivity(mesh), selected = selectStructuralCandidates(connectivity, selection);
  const meshSha256 = structuralMeshIdentity(mesh);
  const unresolved = reason => ({ ...selected, qualificationVersion: STRUCTURAL_QUALIFICATION_VERSION, candidates: [], unresolvedCandidateIds: selected.candidates.map(c => c.edgeId),
    excludedCandidateIds: [], meshSha256, scenarioKey, material, qualification: 'unresolved', limitations: [reason, ...selected.limitations] });
  if (faceMap === null) return unresolved('No explicit whole-face physical-interface/domain qualification supplied.');
  if (faceMap.version !== STRUCTURAL_FACE_MAP_VERSION || faceMap.meshSha256 !== meshSha256 || faceMap.scenarioKey !== scenarioKey) throw new Error('Face qualification version/mesh/scenario mismatch');
  if (!Array.isArray(faceMap.faces) || faceMap.faces.length !== mesh.indices.length / 3) throw new Error('Qualification must describe every indexed triangle');
  const faces = faceMap.faces.map(record => {
    if (!record || !['physical-interface', 'material-contact', 'domain-cap', 'unresolved'].includes(record.kind)
      || typeof record.evidence !== 'string' || !record.evidence) throw new Error('Explicit face kind/evidence required');
    if (record.kind === 'physical-interface' || record.kind === 'material-contact') {
      if (!Array.isArray(record.materials) || record.materials.length !== 2 || !record.materials.every(m => typeof m === 'string' && m)
        || record.materials[0] === record.materials[1] || record.scope !== 'whole-face-open-sides'
        || !Number.isFinite(record.errorBoundM) || record.errorBoundM < 0) throw new Error('Whole-face side materials and finite error bound required');
      if ((record.kind === 'physical-interface') !== record.materials.includes('air')) throw new Error('Air-interface/contact semantics conflict');
    }
    return structuredClone(record);
  });
  const chosen = new Map(selected.candidates.map(c=>[c.edgeId,c]));
  if (includePatchBoundaries) for (const edge of connectivity.edges) {
    if (!edge.left || !edge.right) continue;
    const adjacent=[faces[edge.left.face],faces[edge.right.face]];
    // A verified rim between TWO physical air-interface patches. Do not
    // generate rims from domain caps, open indexed borders or unknown/contact
    // patches. Iterate connectivity: a coplanar material transition need not
    // have been selected by the silhouette/crease angle test.
    const target = f=>f.kind==='physical-interface'&&f.materials.includes(material);
    const other = f=>f.kind==='physical-interface'&&!f.materials.includes(material);
    if ((target(adjacent[0])&&other(adjacent[1]))||(other(adjacent[0])&&target(adjacent[1]))) {
      const previous=chosen.get(edge.edgeId);
      chosen.set(edge.edgeId,{...(previous||{edgeId:edge.edgeId,pointIds:[...edge.pointIds],faceIds:[edge.left.face,edge.right.face],segment:edge.segment.map(p=>[...p]),reasons:[]}),
        reasons:[...(previous?.reasons||[]),'physical-patch-boundary']});
    }
  }
  const candidates = [], excludedCandidateIds = [], unresolvedCandidateIds = [];
  for (const candidate of chosen.values()) {
    const adjacent = candidate.faceIds.map(id => faces[id]);
    if (adjacent.some(f => f.kind === 'unresolved')) { unresolvedCandidateIds.push(candidate.edgeId); continue; }
    if (!candidate.reasons.includes('physical-patch-boundary') && !adjacent.every(f => f.kind === 'physical-interface' && f.materials.includes(material))) {
      excludedCandidateIds.push(candidate.edgeId); continue;
    }
    candidates.push({ ...candidate, material, interface: [material, 'air'],
      patchMaterials: [...new Set(adjacent.flatMap(f=>f.materials.filter(m=>m!=='air')))].sort(),
      faceQualification: adjacent, sourceEntityId: null });
  }
  const unresolvedFaces = faces.reduce((n, f) => n + (f.kind === 'unresolved'), 0);
  const domainFaces = faces.reduce((n, f) => n + (f.kind === 'domain-cap'), 0);
  const incomplete = unresolvedFaces > 0 || selected.borderEdgeIds.length > 0;
  return { algorithm: selected.algorithm, version: selected.version, qualificationVersion: STRUCTURAL_QUALIFICATION_VERSION, meshSha256, scenarioKey, material,
    candidates, excludedCandidateIds, unresolvedCandidateIds, borderEdgeIds: selected.borderEdgeIds,
    qualification: incomplete ? 'partial' : 'complete-supplied-face-map',
    provenance: { faceMapVersion: faceMap.version, unresolvedFaces, domainFaces, sourceEntityOwnership: 'unresolved' },
    limitations: ['Supplied face-map validation is not independent verification of its geometric proof.',
      'No optical occlusion: qualified internal/far-side references are retained.',
      'Contact splitting is not performed here; patch rims require two already-qualified physical air-interface co-faces.',
      ...(!includePatchBoundaries ? ['Physical patch-boundary extraction is disabled.'] : []),
      ...(domainFaces ? ['Domain-cap adjacency is excluded; terrain scope remains truncated.'] : []),
      ...(incomplete ? ['Unresolved faces or indexed borders prevent complete structural-reference qualification.'] : [])] };
}
