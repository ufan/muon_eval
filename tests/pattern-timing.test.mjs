import test from 'node:test';
import assert from 'node:assert/strict';
import { timePatternWork, deferPatternWork } from '../dist/modules/pattern-timing.js';

test('view timing preserves return/errors and does not retain performance entries', () => {
  const result = {};
  assert.equal(timePatternWork('test', () => result), result);
  const error = new Error('original');
  assert.throws(() => timePatternWork('test', () => { throw error; }), e => e === error);
  assert.equal(performance.getEntriesByName('pattern:test').length, 0);
});

test('deferred stages yield and suppress invalidated work', () => {
  const tasks = []; let calls = 0, current = true;
  deferPatternWork('test', () => calls++, () => current, callback => tasks.push(callback));
  assert.equal(calls, 0); tasks.shift()(); assert.equal(calls, 1);
  deferPatternWork('test', () => calls++, () => current, callback => tasks.push(callback));
  current = false; tasks.shift()(); assert.equal(calls, 1);
});
