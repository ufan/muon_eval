import test from 'node:test';
import assert from 'node:assert/strict';
import { dragMove, dragAimPoint } from '../../dist/modules/station-drag.js';

const close = (actual, expected, eps = 1e-9) => { assert.ok(actual, 'a result'); actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < eps, `${actual} vs ${expected}`)); };

test('horizontal move: the pointer ray meets the plane at the station height (model z up)', () => {
  close(dragMove({ anchor: [10, 20, 5], rayOrigin: [0, 0, 105], rayDir: [0.1, 0.2, -1], vertical: false }), [10, 20, 5]);
  close(dragMove({ anchor: [0, 0, 5], rayOrigin: [3, 4, 15], rayDir: [0, 0, -1], vertical: false }), [3, 4, 5]);
  assert.equal(dragMove({ anchor: [0, 0, 5], rayOrigin: [0, 0, 10], rayDir: [1, 0, 0], vertical: false }), null, 'a ray parallel to the plane');
  assert.equal(dragMove({ anchor: [0, 0, 5], rayOrigin: [0, 0, 10], rayDir: [0, 0, 1], vertical: false }), null, 'the plane behind the camera');
});

test('vertical move (Shift): only z changes, on a vertical plane facing the camera', () => {
  close(dragMove({ anchor: [10, 0, 5], rayOrigin: [0, 0, 0], rayDir: [1, 0, 0.8], vertical: true }), [10, 0, 8]);
  close(dragMove({ anchor: [0, 10, 5], rayOrigin: [2, 0, 1], rayDir: [0, 1, 0.5], vertical: true }), [0, 10, 6]);
  assert.equal(dragMove({ anchor: [0, 10, 5], rayOrigin: [0, 0, 0], rayDir: [0, 0, 1], vertical: true }), null, 'looking straight up');
});

test('aim: the pointer ray meets the sphere of the axis handle; outside it, the closest point of the ray', () => {
  close(dragAimPoint({ origin: [0, 0, 0], radius: 10, rayOrigin: [-30, 0, 0], rayDir: [1, 0, 0] }), [-10, 0, 0]);
  close(dragAimPoint({ origin: [0, 0, 0], radius: 10, rayOrigin: [0, -30, 20], rayDir: [0, 1, 0] }), [0, 0, 20]);
  assert.equal(dragAimPoint({ origin: [0, 0, 0], radius: 10, rayOrigin: [0, 30, 0], rayDir: [0, 1, 0] }), null, 'ray pointing away');
});
