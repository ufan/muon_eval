import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemandRender } from '../dist/modules/demand-render.js';

test('demand rendering coalesces changes and stops when idle', () => {
  const frames = []; let renders = 0;
  const request = createDemandRender(() => renders++, callback => frames.push(callback));
  request(); request(); request();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(renders, 1); assert.equal(frames.length, 0);
  request(); frames.shift()(); assert.equal(renders, 2);
});

test('control changes during rendering schedule damping continuation without duplicate frames', () => {
  const frames = []; let renders = 0;
  const request = createDemandRender(() => { if (++renders < 3) { request(); request(); } }, callback => frames.push(callback));
  request();
  while (frames.length) { assert.equal(frames.length, 1); frames.shift()(); }
  assert.equal(renders, 3);
});
