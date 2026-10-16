// Drag handles on the working detector (ADR-032): pointer-ray geometry in model coordinates (z up), pure.
// dragMove: where the centre handle goes. Horizontal drags keep the station height (plane z = anchor z); vertical drags
// (Shift) keep x and y and move along a vertical plane through the station that faces the pointer ray.
// dragAimPoint: the point the axis handle points at, on a sphere around the station; when the ray misses the sphere,
// the point of the ray closest to the station. Null when the plane or point lies behind the ray or the ray is parallel.
const EPS = 1e-9;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (origin, dir, t) => origin.map((v, i) => v + t * dir[i]);

export function dragMove({ anchor, rayOrigin, rayDir, vertical }) {
  const normal = vertical ? [rayDir[0], rayDir[1], 0] : [0, 0, 1];
  if (Math.hypot(...normal) < EPS) return null;
  const denominator = dot(rayDir, normal);
  if (Math.abs(denominator) < EPS) return null;
  const t = dot(anchor.map((v, i) => v - rayOrigin[i]), normal) / denominator;
  if (!(t > 0)) return null;
  const point = along(rayOrigin, rayDir, t);
  return vertical ? [anchor[0], anchor[1], point[2]] : [point[0], point[1], anchor[2]];
}

export function dragAimPoint({ origin, radius, rayOrigin, rayDir }) {
  const toOrigin = origin.map((v, i) => v - rayOrigin[i]), a = dot(rayDir, rayDir);
  if (a < EPS) return null;
  const closest = dot(toOrigin, rayDir) / a, miss = dot(toOrigin, toOrigin) - closest * closest * a;
  if (miss <= radius * radius) {
    const half = Math.sqrt((radius * radius - miss) / a), near = closest - half, far = closest + half;
    const t = near > 0 ? near : far > 0 ? far : null;
    return t === null ? null : along(rayOrigin, rayDir, t);
  }
  return closest > 0 ? along(rayOrigin, rayDir, closest) : null;
}
