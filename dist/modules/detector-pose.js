// Plain model-coordinate directions; no dataset, renderer or application dependency.
// Orthonormal detector basis in model coordinates; sx, sy are tangents along right and up.
export function detectorBasis(azimuthDeg, elevationDeg) {
  if (!Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg) || Math.abs(elevationDeg) > 90) throw new Error('Invalid projection orientation');
  const az = azimuthDeg * Math.PI / 180, el = elevationDeg * Math.PI / 180;
  return { forward: [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)],
    right: [-Math.sin(az), Math.cos(az), 0],
    up: [-Math.sin(el) * Math.cos(az), -Math.sin(el) * Math.sin(az), Math.cos(el)] };
}

export function slopeDirection(basis, sx, sy) {
  if (![sx, sy].every(Number.isFinite)) throw new Error('Invalid projection slopes');
  const direction = basis.forward.map((value, axis) => value + sx * basis.right[axis] + sy * basis.up[axis]);
  const norm = Math.hypot(...direction);
  return direction.map(value => value / norm);
}

// A projection pixel is a line through the detector. Without timing the detector
// cannot tell which end a muon entered from, and muons come from the sky, so the
// line is evaluated along its upper end (quick-response@4.0.0). 'back' marks lines
// whose sky end lies behind the detector plane.
export function skySideDirection(direction) {
  if (!Array.isArray(direction) || direction.length !== 3 || !direction.every(Number.isFinite)) throw new Error('Invalid line direction');
  return direction[2] < 0 ? { direction: direction.map(value => -value), side: 'back' } : { direction: [...direction], side: 'front' };
}

// Pose that points the detector axis from origin at target, in the convention of detectorBasis (azimuth from X+
// toward Y+, elevation above the horizontal), rounded to 0.1°. Poses look at or above the horizon, so a target
// below the detector keeps its azimuth and gets elevation 0 (clamped: true). Null when the points coincide.
export function aimAt(origin, target) {
  const d = target.map((value, axis) => value - origin[axis]), horizontal = Math.hypot(d[0], d[1]);
  if (Math.hypot(...d) < 1e-9) return null;
  const round = value => Math.round(value * 10) / 10;
  let az = horizontal < 1e-9 ? 0 : round(Math.atan2(d[1], d[0]) * 180 / Math.PI);
  if (az < 0) az = round(az + 360);
  if (az >= 360) az = 0;
  const el = round(Math.atan2(d[2], horizontal) * 180 / Math.PI);
  return el < 0 ? { az, el: 0, clamped: true } : { az, el: Math.min(90, el), clamped: false };
}
