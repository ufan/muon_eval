// Development adapter only. Geometry truth is the qualified model buffers.
// Neither the scientific ray core nor projection calculations import Three.
import { BufferGeometry, BufferAttribute, EdgesGeometry, REVISION } from '../dist/vendor/three/three.core.js';
import { detectorBasis } from '../dist/modules/material-projection.js';
export const THREE_REFERENCE_REVISION = REVISION;
export function featureSegments(component, angleDeg = 30) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(component.positions, 3));
  geometry.setIndex(new BufferAttribute(component.indices, 1));
  const edges = new EdgesGeometry(geometry, angleDeg), positions = edges.attributes.position.array;
  const result = [];
  for (let i = 0; i < positions.length; i += 6) result.push([Array.from(positions.subarray(i, i + 3)), Array.from(positions.subarray(i + 3, i + 6))]);
  edges.dispose(); geometry.dispose(); return result;
}
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export function projectReferencePoint(point, view) {
  const basis = detectorBasis(view.azimuthDeg, view.elevationDeg), delta = point.map((v, i) => v - view.origin[i]);
  const depth = dot(delta, basis.forward);
  return depth > 1e-8 ? [dot(delta, basis.right) / depth, dot(delta, basis.up) / depth] : null;
}
export function segmentKey(segment) {
  return segment.map(point => point.map(value => Math.round(value * 1e8) / 1e8).join(',')).sort().join('|');
}
// Diagnostic probes, NOT a qualified whole-face/edge interface algorithm.
// For fixtures: candidates wholly in material contacts/finite terrain caps must
// not become air-interface references just because an edge library finds them.
export function interfaceProbe(runtime, segment, material, offsetM = 1e-4) {
  const midpoint = segment[0].map((v, i) => (v + segment[1][i]) / 2), found = new Set();
  for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
    const point = [...midpoint]; point[axis] += sign * offsetM; found.add(runtime.classifyModel(point).material);
  }
  return { materials: [...found].sort(), hasMaterialAir: found.has(material) && found.has('air') };
}
