// Pure segment projection. Liang–Barsky/Cyrus–Beck parametric half-space
// clipping before perspective division, plus analytic segment/sphere range
// intersection. References and numerical scope: docs/GEOMETRY_REFERENCES.md#candidate-qualification-and-projection.
import { detectorBasis } from './material-projection.js';
export const STRUCTURAL_PROJECTION_VERSION = '1.0.0';
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const validPoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

export function projectStructuralSegment(segment, { origin, azimuthDeg, elevationDeg,
  slopeBounds, rayLengthM, nearDepthM } = {}) {
  if (!Array.isArray(segment) || segment.length !== 2 || !segment.every(validPoint) || !validPoint(origin)) throw new Error('Finite model-frame segment/origin required');
  if (!slopeBounds || !['sx', 'sy'].every(axis => Array.isArray(slopeBounds[axis]) && slopeBounds[axis].length === 2
    && slopeBounds[axis].every(Number.isFinite) && slopeBounds[axis][0] < slopeBounds[axis][1])) throw new Error('Ascending finite slope bounds required');
  if (!Number.isFinite(rayLengthM) || rayLengthM <= 0 || !Number.isFinite(nearDepthM) || nearDepthM <= 0) throw new Error('Explicit positive finite ray length and near depth required');
  const basis = detectorBasis(azimuthDeg, elevationDeg);
  const a = segment[0].map((x, i) => x - origin[i]), b = segment[1].map((x, i) => x - origin[i]);
  const d = b.map((x, i) => x - a[i]);
  if (![...a, ...b, ...d].every(Number.isFinite)) throw new Error('Segment coordinate overflow');
  const length = Math.hypot(...d);
  const empty = reason => ({ version: STRUCTURAL_PROJECTION_VERSION, state: 'outside-field', reason, segmentModel: null, segmentSlope: null, parameterInterval: null });
  if (length === 0) return empty('zero-length-source');
  if (!Number.isFinite(length)) throw new Error('Segment length overflow');
  const camera = p => [dot(p, basis.right), dot(p, basis.up), dot(p, basis.forward)];
  const ca = camera(a), cb = camera(b), [xmin, xmax] = slopeBounds.sx, [ymin, ymax] = slopeBounds.sy;
  // Each g(p)>=0 is linear along the original 3D segment. Intersect its
  // parameter interval; neither endpoint is divided/discarded prematurely.
  const planes = [
    ['near-depth', p => p[2] - nearDepthM],
    ['sx-min', p => p[0] - xmin * p[2]], ['sx-max', p => xmax * p[2] - p[0]],
    ['sy-min', p => p[1] - ymin * p[2]], ['sy-max', p => ymax * p[2] - p[1]]
  ];
  let lo = 0, hi = 1;
  const clippedBy = [];
  for (const [name, fn] of planes) {
    const start = fn(ca), end = fn(cb);
    if (![start, end].every(Number.isFinite)) throw new Error('Clipping plane overflow');
    if (start < 0 && end < 0) return empty(name);
    if (start < 0 || end < 0) {
      const t = start / (start - end);
      if (!Number.isFinite(t)) throw new Error('Clipping parameter overflow');
      if (start < 0 && t > lo) { lo = t; clippedBy.push(name); }
      if (end < 0 && t < hi) { hi = t; clippedBy.push(name); }
      if (lo >= hi) return empty('boundary-only-contact');
    }
  }
  // The requested ray length is radial, NOT a far-forward plane. Solve the
  // segment/sphere interval using closest approach, avoiding b*b-4*a*c
  // cancellation for an almost tangent line. All inputs remain model metres.
  const unit = d.map(x => x / length), along = dot(a, unit);
  const closest = a.map((x, i) => x - along * unit[i]), perpendicular = Math.hypot(...closest);
  if (![along, perpendicular].every(Number.isFinite)) throw new Error('Range intersection overflow');
  if (perpendicular >= rayLengthM) return empty(perpendicular === rayLengthM ? 'range-tangent-contact' : 'ray-range');
  const halfChord = Math.sqrt(rayLengthM - perpendicular) * Math.sqrt(rayLengthM + perpendicular);
  if (!Number.isFinite(halfChord)) throw new Error('Range chord overflow');
  const rangeLo = (-along - halfChord) / length, rangeHi = (-along + halfChord) / length;
  if (rangeLo > lo) { lo = rangeLo; clippedBy.push('ray-range'); }
  if (rangeHi < hi) { hi = rangeHi; clippedBy.push('ray-range'); }
  if (lo >= hi) return empty('ray-range');
  const relative = [lo, hi].map(t => a.map((x, i) => x + t * d[i]));
  const segmentSlope = relative.map(p => {
    const [x, y, depth] = camera(p);
    if (!(depth > 0)) throw new Error('Nonpositive clipped perspective depth');
    return [x / depth, y / depth];
  });
  if (!segmentSlope.flat().every(Number.isFinite)) throw new Error('Perspective division overflow');
  // A radial edge can have nonzero model length but no projected line.
  if (segmentSlope[0].every((x, i) => x === segmentSlope[1][i])) return empty('point-projection');
  return { version: STRUCTURAL_PROJECTION_VERSION, state: lo > 0 || hi < 1 ? 'clipped' : 'ready',
    clippedBy: [...new Set(clippedBy)], parameterInterval: [lo, hi],
    segmentModel: relative.map(p => p.map((x, i) => x + origin[i])), segmentSlope,
    endpointRangeM: relative.map(p => Math.hypot(...p)),
    scope: { slopeBounds: { sx: [...slopeBounds.sx], sy: [...slopeBounds.sy] }, rayLengthM, nearDepthM },
    qualification: 'unchanged-not-established-by-projection' };
}
