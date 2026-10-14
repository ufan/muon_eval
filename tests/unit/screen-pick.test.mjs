import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestScreenPoint } from '../../dist/modules/screen-pick.js';

// Picking a small 3D marker (#15: open a station from its marker) by its distance on screen, in CSS pixels.
test('the nearest marker within the radius wins; markers behind the camera never do', () => {
  const points = [{ id: 'a', x: 100, y: 100, visible: true }, { id: 'b', x: 108, y: 100, visible: true }, { id: 'c', x: 103, y: 101, visible: false }];
  assert.equal(nearestScreenPoint(points, [105, 100], 12), 'b');
  assert.equal(nearestScreenPoint(points, [101, 100], 12), 'a');
  assert.equal(nearestScreenPoint(points, [140, 100], 12), null);
  assert.equal(nearestScreenPoint([], [0, 0], 12), null);
});
