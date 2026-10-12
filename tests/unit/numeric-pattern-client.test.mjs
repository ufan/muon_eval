import test from 'node:test';
import assert from 'node:assert/strict';
import { createNumericPatternClient } from '../../dist/modules/numeric-pattern-client.js';
import { createPatternInputAssembler } from '../../dist/modules/pattern-input-chunks.js';

test('numeric client reuses inputs/cache, rejects errors and ignores terminated-job replies', () => {
  const previous = globalThis.Worker, workers = [];
  globalThis.Worker = class {
    messages = []; assemble = createPatternInputAssembler(); constructor() { workers.push(this); }
    postMessage(data) { const request = this.assemble(data); if (request) this.messages.push(request); } terminate() { this.terminated = true; }
  };
  try {
    const client = createNumericPatternClient({ schedule: callback => callback() }), result = { pixels: [{ sx: 0, sy: 0, totals: { concrete: 1 }, profiles: [1, 2, 3] }] };
    let ready = 0;
    const read = key => client.read(result, 'material', key, 'contribution', {}, () => ready++);
    assert.equal(read('a'), null); assert.equal(read('a'), null);
    assert.equal(workers[0].messages.length, 1);
    const first = workers[0].messages[0]; assert.equal(first.input.pixels[0].profiles, undefined);
    workers[0].onmessage({ data: { id: first.id, entry: { mapped: [] } } });
    assert.equal(ready, 1); assert.deepEqual(read('a'), { mapped: [] });
    read('b'); assert.equal(workers[0].messages[1].input, undefined);
    workers[0].onmessage({ data: { id: workers[0].messages[1].id, error: 'invalid levels' } });
    assert.throws(() => read('b'), /invalid levels/);
    read('c'); const stale = workers[0].messages[2]; client.invalidate();
    workers[0].onmessage({ data: { id: stale.id, entry: {} } });
    assert.equal(ready, 2); assert.equal(workers[0].terminated, true);
    read('a'); assert.ok(workers[1].messages[0].input);
    workers[1].onerror({ message: 'load failed' });
    assert.equal(workers[1].terminated, true); assert.throws(() => read('a'), /load failed/);
    read('new-settings'); assert.ok(workers[2].messages[0].input);
  } finally { globalThis.Worker = previous; }
});

test('numeric preparation and submission are distinct tasks; cancellation suppresses unsent jobs', () => {
  const previous = globalThis.Worker, workers = [], tasks = [];
  globalThis.Worker = class { messages = []; assemble = createPatternInputAssembler(); constructor() { workers.push(this); }
    postMessage(data) { const request = this.assemble(data); if (request) this.messages.push(request); } terminate() {} };
  try {
    const client = createNumericPatternClient({ schedule: callback => tasks.push(callback) }), result = { pixels: [{ sx: 0, sy: 0 }] };
    client.read(result, 'material', 'a', 'contribution', {}, () => {});
    assert.equal(workers[0].messages.length, 0);
    tasks.shift()(); assert.equal(workers[0].messages.length, 0);
    tasks.shift()(); assert.equal(workers[0].messages.length, 0);
    while (tasks.length) tasks.shift()(); assert.equal(workers[0].messages.length, 1);
    client.read(result, 'material', 'b', 'contribution', {}, () => {});
    tasks.shift()(); client.invalidate(); tasks.shift()();
    assert.equal(workers[0].messages.length, 1);
  } finally { globalThis.Worker = previous; }
});
