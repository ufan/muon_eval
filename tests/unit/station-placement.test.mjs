import test from 'node:test';
import assert from 'node:assert/strict';
import { placeInCavity, CAVITY_MOUNT_HEIGHT_M } from '../../dist/modules/station-placement.js';

// Placing a station inside a clicked cavity (14d follow-up): the trace is the calculation's, here a
// synthetic world: solid everywhere except an axis-aligned box cavity of a low-density medium. The
// lower part of the cavity carries the feature id; the top part (a vault) is the same medium, unlabelled.
function boxWorld({ min, max, labelTop, feature = 'g' }) {
  return (origin, direction, length) => {
    let t0 = 0, t1 = length;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(direction[k]) < 1e-12) { if (origin[k] < min[k] || origin[k] > max[k]) { t0 = 1; t1 = 0; } continue; }
      const a = (min[k] - origin[k]) / direction[k], b = (max[k] - origin[k]) / direction[k];
      t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
    }
    if (t1 <= t0) return { segments: [{ t0: 0, t1: length, material: 'solid', entityIds: [] }] };
    const segments = [], push = (a, b, material, entityIds) => { if (b - a > 1e-9) segments.push({ t0: a, t1: b, material, entityIds }); };
    push(0, t0, 'solid', []);
    // Split the cavity part at the label height (z = labelTop).
    const z = t => origin[2] + direction[2] * t, tz = Math.abs(direction[2]) < 1e-12 ? null : (labelTop - origin[2]) / direction[2];
    if (tz !== null && tz > t0 && tz < t1) {
      const lowFirst = z((t0 + tz) / 2) < labelTop;
      push(t0, tz, 'void', lowFirst ? [feature] : []); push(tz, t1, 'void', lowFirst ? [] : [feature]);
    } else push(t0, t1, 'void', z((t0 + t1) / 2) < labelTop ? [feature] : []);
    push(t1, length, 'solid', []);
    return { segments };
  };
}
const gallery = { min: [0, 0, 10], max: [20, 3, 13.5], labelTop: 12.8 };
const close = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('a click on a cavity seen from outside puts the station inside it, on the floor plus the mounting height', () => {
  const trace = boxWorld(gallery);
  // Seen obliquely from above: the ray enters the cavity's labelled part through the label height.
  const point = [10, 1.5, 12.8], direction = [0, 0.3, -1];
  const placed = placeInCavity({ point, direction, featureId: 'g' }, trace);
  assert.equal(CAVITY_MOUNT_HEIGHT_M, 1);
  assert.ok(close(placed.floorZ, 10) && close(placed.ceilingZ, 13.5), JSON.stringify(placed));
  assert.ok(close(placed.position[2], 11));
  // Horizontally at the middle of the cavity crossing along the line of sight: with y = 1.5 + 0.3 s and
  // z = 12.8 − s the ray is inside for s in [−0.7, 2.8], so the middle is at s = 1.05.
  assert.ok(close(placed.position[0], 10) && close(placed.position[1], 1.5 + 0.3 * 1.05, 1e-9));
});

test('the unlabelled part of the same cavity counts; a low cavity takes half its height', () => {
  const low = boxWorld({ min: [0, 0, 10], max: [20, 3, 11.2], labelTop: 10.9 });
  const placed = placeInCavity({ point: [5, 1.5, 10.9], direction: [0, 0, -1], featureId: 'g' }, low);
  assert.ok(close(placed.floorZ, 10) && close(placed.ceilingZ, 11.2));
  assert.ok(close(placed.position[2], 10.6));
  const custom = placeInCavity({ point: [5, 1.5, 12.8], direction: [0, 0, -1], featureId: 'g' }, boxWorld(gallery), { heightM: 1.5 });
  assert.ok(close(custom.position[2], 11.5));
});

test('no cavity of that feature along the line of sight gives no placement', () => {
  const trace = boxWorld(gallery);
  assert.equal(placeInCavity({ point: [10, 30, 12], direction: [0, 0, -1], featureId: 'g' }, trace), null);
  assert.equal(placeInCavity({ point: [10, 1.5, 12.8], direction: [0, 0, -1], featureId: 'other' }, trace), null);
  assert.throws(() => placeInCavity({ point: [0, 0, 0], direction: [0, 0, 0], featureId: 'g' }, trace), /direction/);
});
