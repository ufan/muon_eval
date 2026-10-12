import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatternCaptureStore } from '../../dist/modules/pattern-capture-store.js';

test('repeated captures share detached immutable science but preserve per-row display/label and complete JSON', () => {
  const store = createPatternCaptureStore(), result = { pixels: [{ count: 2 }], config: { azimuthDeg: 30 }, display: { mode: 'a' } }, references = [{ lines: [[[0, 0], [1, 1]]] }];
  const first = store.capture(result, references, 'first');
  result.display = { mode: 'b' };
  const second = store.capture(result, references, 'second');
  assert.equal(first.result.pixels, second.result.pixels); assert.notEqual(first.result.pixels, result.pixels);
  assert.equal(first.references, second.references); assert.notEqual(first.references, references);
  assert.equal(first.result.display.mode, 'a'); assert.equal(second.result.display.mode, 'b');
  assert.deepEqual(JSON.parse(JSON.stringify(second)), { label: 'second', result, references });
  result.pixels[0].count = 999; references[0].lines[0][0][0] = 999;
  assert.equal(first.result.pixels[0].count, 2); assert.equal(first.references[0].lines[0][0][0], 0);
  store.clear(); const fresh = store.capture(result, references, 'fresh');
  assert.notEqual(fresh.result.pixels, first.result.pixels); assert.equal(fresh.result.pixels[0].count, 999);
});

test('changed finite-reference identity requires a new detached snapshot', () => {
  const store = createPatternCaptureStore(), result = { pixels: [{ count: 2 }] };
  const first = store.capture(result, [], 'first'), second = store.capture(result, [{ state: 'ready' }], 'second');
  assert.notEqual(first.result.pixels, second.result.pixels); assert.equal(second.references.length, 1);
});
