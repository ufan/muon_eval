// Placing a station inside a clicked cavity (FR-P5 sketching): a gallery, room or shaft seen in
// the 3D view. Pure: geometry comes only from the injected calculation trace
// (origin, direction, length) → { segments: [{ t0, t1, material, entityIds }] }, model frame, z up.
// The cavity is the continuous run of the medium the line of sight enters at the clicked
// feature (its unlabelled parts, such as a vault, included).
export const CAVITY_MOUNT_HEIGHT_M = 1;

const add = (p, d, t) => p.map((v, i) => v + d[i] * t);
// Length of the run of `medium` starting at the trace origin.
function runFrom(trace, origin, direction, medium, reach) {
  let end = 0;
  for (const s of trace(origin, direction, reach).segments) {
    if (s.material !== medium || s.t0 > end + 1e-6) break;
    end = s.t1;
  }
  return end;
}

// { point, direction, featureId }: the clicked surface point and the viewing direction. Returns
// { position, floorZ, ceilingZ } or null when the line of sight does not enter that cavity.
export function placeInCavity({ point, direction, featureId }, trace, { heightM = CAVITY_MOUNT_HEIGHT_M, reachM = 500, approachM = 1 } = {}) {
  const length = Math.hypot(...direction);
  if (!(length > 0) || ![...point, ...direction].every(Number.isFinite)) throw new Error('Cavity placement needs a point and a viewing direction');
  const d = direction.map(v => v / length), start = add(point, d, -approachM);
  const segments = trace(start, d, reachM).segments;
  const entry = segments.findIndex(s => s.entityIds?.includes(featureId));
  if (entry < 0) return null;
  // The whole run of the entered medium along the line of sight, then its middle.
  const medium = segments[entry].material;
  let first = entry, last = entry;
  while (first > 0 && segments[first - 1].material === medium && segments[first - 1].t1 >= segments[first].t0 - 1e-6) first--;
  while (last < segments.length - 1 && segments[last + 1].material === medium && segments[last + 1].t0 <= segments[last].t1 + 1e-6) last++;
  const middle = add(start, d, (segments[first].t0 + segments[last].t1) / 2);
  // Floor and ceiling straight below and above the middle.
  const down = runFrom(trace, middle, [0, 0, -1], medium, reachM), up = runFrom(trace, middle, [0, 0, 1], medium, reachM);
  const floorZ = middle[2] - down, ceilingZ = middle[2] + up;
  return { position: [middle[0], middle[1], floorZ + Math.min(heightM, (ceilingZ - floorZ) / 2)], floorZ, ceilingZ };
}
