import test from 'node:test';
import assert from 'node:assert/strict';
import { aimAt, detectorBasis } from '../../dist/modules/detector-pose.js';
import { shortcutFor } from '../../dist/modules/view-shortcuts.js';

const unit = v => { const n = Math.hypot(...v); return v.map(x => x / n); };

test('aiming points the detector axis at the target, in the pose convention (azimuth from X+ toward Y+)', () => {
  for (const target of [[10, 0, 0], [0, 10, 5], [-3, -4, 12], [5, -5, 1]]) {
    const pose = aimAt([0, 0, 0], target), forward = detectorBasis(pose.az, pose.el).forward;
    assert.equal(pose.clamped, false);
    unit(target).forEach((v, i) => assert.ok(Math.abs(forward[i] - v) < 2e-3, `${target} axis ${i}`));
    assert.ok(pose.az >= 0 && pose.az < 360);
  }
  assert.deepEqual(aimAt([1, 1, 1], [1, 2, 1]), { az: 90, el: 0, clamped: false });
});

test('a target below the detector keeps the azimuth and limits the elevation to 0°', () => {
  assert.deepEqual(aimAt([0, 0, 10], [10, 0, 0]), { az: 0, el: 0, clamped: true });
});

test('aiming at the detector itself is refused', () => {
  assert.equal(aimAt([1, 2, 3], [1, 2, 3]), null);
});

const key = (k, extra = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'CANVAS', isContentEditable: false }, ...extra });

test('shortcuts: C, R, V toggle the viewing aids; arrows nudge the pose, Shift for 5°', () => {
  assert.deepEqual(shortcutFor(key('c')), { toggle: 'cone' });
  assert.deepEqual(shortcutFor(key('R')), { toggle: 'ray' });
  assert.deepEqual(shortcutFor(key('v')), { toggle: 'coverage' });
  assert.deepEqual(shortcutFor(key('ArrowLeft')), { nudge: 'az', by: -1 });
  assert.deepEqual(shortcutFor(key('ArrowRight', { shiftKey: true })), { nudge: 'az', by: 5 });
  assert.deepEqual(shortcutFor(key('ArrowUp')), { nudge: 'el', by: 1 });
  assert.deepEqual(shortcutFor(key('ArrowDown', { shiftKey: true })), { nudge: 'el', by: -5 });
});

test('shortcuts never fire while typing, with modifier chords, or for other keys', () => {
  for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) assert.equal(shortcutFor(key('c', { target: { tagName, isContentEditable: false } })), null);
  assert.equal(shortcutFor(key('c', { target: { tagName: 'DIV', isContentEditable: true } })), null);
  assert.equal(shortcutFor(key('c', { ctrlKey: true })), null);
  assert.equal(shortcutFor(key('r', { metaKey: true })), null);
  assert.equal(shortcutFor(key('x')), null);
});
