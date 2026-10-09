import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatternInputAssembler, postPatternInputChunks } from '../dist/modules/pattern-input-chunks.js';

test('chunk transport preserves metadata, doubles, null/missing support and ordering without detaching inputs', () => {
  const tasks = [], messages = [], input = { config: { bins: 3 }, pixels: Array.from({ length: 9 }, (_, i) => ({ sx: i / 7, materialColumns: { steel: i === 3 ? null : i }, missing: undefined })) };
  const original = structuredClone(input), request = { id: 1, token: 4 }, assemble = createPatternInputAssembler();
  postPatternInputChunks({ postMessage: data => messages.push(structuredClone(data)) }, request, input,
    { name: 'test', current: () => true, failed: error => { throw error; }, schedule: callback => tasks.push(callback), size: 2 });
  assert.equal(messages.length, 0); while (tasks.length) tasks.shift()();
  const completed = messages.map(assemble).filter(Boolean);
  assert.deepEqual(completed, [{ ...request, input }]); assert.deepEqual(input, original);
  assert.equal(messages.filter(m => m.inputChunk === 'pixels').length, 5);
});

test('cancelled, incomplete and misordered input cannot become a calculation', () => {
  const assemble = createPatternInputAssembler(), header = { id: 1, inputChunk: 'header', request: { id: 1 }, header: {}, count: 2 };
  assemble(header); assert.throws(() => assemble({ id: 1, inputChunk: 'end' }), /Incomplete/);
  assert.throws(() => assemble({ id: 1, inputChunk: 'pixels', offset: 1, pixels: [{}] }), /Invalid/);
  assemble({ id: 1, inputChunk: 'cancel' }); assert.equal(assemble({ id: 1, inputChunk: 'end' }), null);
  let current = true; const tasks = [], messages = [];
  postPatternInputChunks({ postMessage: data => messages.push(data) }, { id: 2 }, { pixels: [{}] },
    { name: 'test', current: () => current, failed: assert.fail, schedule: callback => tasks.push(callback) });
  current = false; tasks.shift()(); assert.deepEqual(messages, [{ id: 2, inputChunk: 'cancel' }]);
});
