import { raySurfaceCrossings } from './ray-inspection.js';

// Display data for a traced ray, shared by the 3D ray (tube and crossing rings) and the projection readout's depth
// profile, so all of them use one color and one drawing rule. Colors are for the ray only (they must stand out against
// the grey subject and terrain); they are not the subject's material colors.
export const RAY_MATERIALS = Object.freeze({
  concrete: Object.freeze({ color: 0xffe27a, label: '混凝土', short: '混凝土' }),
  rock: Object.freeze({ color: 0xb8f08a, label: '岩石', short: '岩石' }),
  water: Object.freeze({ color: 0x49a7ff, label: '水', short: '水' }),
  steel: Object.freeze({ color: 0xff8a5c, label: '钢', short: '钢' }),
  air: Object.freeze({ color: 0x63ffe8, label: '路径内空气（廊道、空腔）', short: '空气' })
});
const FALLBACK_COLOR = 0xffffff;
const KIND_LABEL = { entry: '入', exit: '出', interface: '界' };

export const rayMaterialColor = material => RAY_MATERIALS[material]?.color ?? FALLBACK_COLOR;
const cssColor = material => '#' + rayMaterialColor(material).toString(16).padStart(6, '0');

// Air inside the path (galleries, cavities) is drawn; air after the last material interval (open sky) is not.
export function displayedRaySegments(trace) {
  const last = trace.segments.findLastIndex(segment => segment.material !== 'air');
  return trace.segments.slice(0, last + 1);
}

// Short stub of the open air right after the exit (at most a quarter of the drawn length), so the 3D view shows the ray
// leaving the last surface. Only when that air interval starts exactly at the exit.
export function rayExitStub(trace, fraction = .25) {
  const drawn = displayedRaySegments(trace), next = trace.segments[drawn.length], end = drawn.at(-1)?.t1;
  if (!next || next.material !== 'air' || next.t0 !== end) return null;
  return { t0: end, t1: Math.min(next.t1, end + fraction * end) };
}

// Depth profile along the drawn ray: consecutive intervals of one material merged, gaps between intervals kept.
export function rayProfile(trace) {
  const parts = [];
  for (const { t0, t1, material } of displayedRaySegments(trace)) {
    const last = parts.at(-1);
    if (last && last.material === material && last.toM === t0) { last.toM = t1; continue; }
    parts.push({ material, label: RAY_MATERIALS[material]?.label ?? material, color: cssColor(material), fromM: t0, toM: t1 });
  }
  return { lengthM: parts.at(-1)?.toM ?? 0, parts };
}

// Surface markers from the calculation's crossings (ray-inspection.js), never from the rendered geometry.
export const rayMarkers = trace => raySurfaceCrossings(trace)
  .map(({ distanceM, kind }) => ({ distanceM, kind, label: `${KIND_LABEL[kind]} ${distanceM.toFixed(1)} m` }));

const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const scale = (a, k) => a.map(v => v * k), norm = a => Math.hypot(...a), unit = a => scale(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Camera pose that shows the ray [origin, origin + lengthM·direction] side-on: looking at its middle from the side the
// camera is already on (perpendicular to the ray), far enough that the whole ray fits the narrower field of view.
export function sideViewPose({ origin, direction, lengthM, eye, fovDeg, aspect, up = [0, 1, 0], margin = 1.5 }) {
  const dir = unit(direction), target = origin.map((v, i) => v + dir[i] * lengthM / 2), view = sub(eye, target);
  let side = sub(view, scale(dir, dot(view, dir)));
  if (norm(side) < 1e-6 * Math.max(1, norm(view))) side = cross(up, dir);
  if (norm(side) < 1e-9) side = cross([1, 0, 0], dir);
  const vertical = fovDeg * Math.PI / 180, horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const distance = margin * (lengthM / 2) / Math.tan(Math.min(vertical, horizontal) / 2);
  return { position: target.map((v, i) => v + unit(side)[i] * distance), target };
}
