// SPDX-FileCopyrightText: Copyright (c) Ken Martin, Will Schroeder, Bill Lorensen
// SPDX-License-Identifier: BSD-3-Clause
// Adapted from VTK v9.5.2 vtkPolyDataSilhouette::RequestData.
// See dist/vendor/vtk-reference/LICENSE and README.md for attribution/changes.
// Candidates ONLY: this module cannot certify material-air/domain interfaces.
export const STRUCTURAL_CANDIDATE_VERSION = '1.0.0';
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const point = (positions, id) => Array.from(positions.slice(id * 3, id * 3 + 3));

export function buildStructuralConnectivity({ positions, indices }) {
  if (!positions || !indices || positions.length % 3 || indices.length % 3 || !positions.length || !indices.length) {
    throw new Error('Expected nonempty indexed triangle buffers');
  }
  if (!Array.from(positions).every(Number.isFinite)) throw new Error('Nonfinite mesh position');
  const count = positions.length / 3, edges = new Map();
  for (let face = 0; face < indices.length / 3; face++) {
    const ids = Array.from(indices.slice(face * 3, face * 3 + 3));
    if (!ids.every(id => Number.isInteger(id) && id >= 0 && id < count)) throw new Error('Invalid triangle index');
    const [a, b, c] = ids.map(id => point(positions, id));
    const u = b.map((v, i) => v - a[i]), v = c.map((x, i) => x - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal);
    if (!(length > 0) || !Number.isFinite(length)) throw new Error('Degenerate triangle');
    for (let j = 0; j < 3; j++) {
      const p = ids[j], q = ids[(j + 1) % 3], low = Math.min(p, q), high = Math.max(p, q), key = `${low}:${high}`;
      let edge = edges.get(key);
      if (!edge) { edge = { edgeId: key, pointIds: [low, high], segment: [point(positions, low), point(positions, high)], left: null, right: null }; edges.set(key, edge); }
      const side = p < q ? 'left' : 'right';
      // Upstream overwrites repeated sides. Reject instead: never certify a
      // non-manifold or inconsistently wound mesh using overwritten normals.
      if (edge[side]) throw new Error(`Non-manifold/inconsistent winding at edge ${key}`);
      edge[side] = { face, normal: normal.map(x => x / length) };
    }
  }
  return { version: STRUCTURAL_CANDIDATE_VERSION, pointIdentity: 'indexed-no-welding',
    edges: [...edges.values()].sort((a, b) => a.pointIds[0] - b.pointIds[0] || a.pointIds[1] - b.pointIds[1]) };
}

export function selectStructuralCandidates(connectivity, { origin, featureAngleDeg = 30, includeCreases = true } = {}) {
  if (connectivity?.version !== STRUCTURAL_CANDIDATE_VERSION || !Array.isArray(connectivity.edges)) throw new Error('Unsupported connectivity');
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) throw new Error('Finite observer origin required');
  if (!Number.isFinite(featureAngleDeg) || featureAngleDeg < 0 || featureAngleDeg > 180 || typeof includeCreases !== 'boolean') throw new Error('Invalid feature settings');
  const threshold = Math.cos(featureAngleDeg * Math.PI / 180), candidates = [], borderEdgeIds = [];
  for (const edge of connectivity.edges) {
    if (!edge.left || !edge.right) { borderEdgeIds.push(edge.edgeId); continue; }
    const direction = origin.map((x, i) => x - (edge.segment[0][i] + edge.segment[1][i]) / 2);
    const apparentContour = dot(direction, edge.left.normal) * dot(direction, edge.right.normal) < 0;
    const crease = includeCreases && dot(edge.left.normal, edge.right.normal) < threshold;
    if (apparentContour || crease) candidates.push({ edgeId: edge.edgeId, pointIds: [...edge.pointIds],
      faceIds: [edge.left.face, edge.right.face], segment: edge.segment.map(p => [...p]),
      reasons: [...(apparentContour ? ['apparent-contour'] : []), ...(crease ? ['crease'] : [])] });
  }
  return { algorithm: 'VTK-9.5.2-silhouette-adaptation', version: STRUCTURAL_CANDIDATE_VERSION,
    candidates, borderEdgeIds, qualification: 'unresolved',
    limitations: ['Candidate edges are not certified material-air interfaces.',
      'No point welding, material/domain qualification, clipping or optical occlusion is performed.',
      ...(borderEdgeIds.length ? ['Indexed mesh has border edges; these are excluded, not treated as physical patch rims.'] : [])] };
}
