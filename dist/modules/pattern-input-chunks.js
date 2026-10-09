import { deferPatternWork } from './pattern-timing.js';

// Bound structured-clone work with small native-cloned pixel batches. This is
// an internal transport only: doubles, nulls, missing values and metadata are
// not encoded, rounded or transferred away from their scientific owner.
export function postPatternInputChunks(worker, request, input, { name, current, failed, schedule, size = 128 }) {
  const { pixels, ...header } = input;
  let offset = -1;
  function send() {
    if (!current()) { try { worker.postMessage({ id: request.id, inputChunk: 'cancel' }); } catch {} return; }
    deferPatternWork(name, () => {
      if (!current()) { try { worker.postMessage({ id: request.id, inputChunk: 'cancel' }); } catch {} return; }
      try {
        if (offset === -1) {
          worker.postMessage({ id: request.id, inputChunk: 'header', request, header, count: pixels.length }); offset = 0;
        } else if (offset < pixels.length) {
          worker.postMessage({ id: request.id, inputChunk: 'pixels', offset, pixels: pixels.slice(offset, offset + size) }); offset += size;
        } else { worker.postMessage({ id: request.id, inputChunk: 'end' }); return; }
        send();
      } catch (error) { try { worker.postMessage({ id: request.id, inputChunk: 'cancel' }); } catch {} failed(error); }
    }, () => true, schedule);
  }
  send();
}

export function createPatternInputAssembler() {
  const pending = new Map();
  return data => {
    if (!data.inputChunk) return data; // prior whole-input protocol
    if (data.inputChunk === 'cancel') { pending.delete(data.id); return null; }
    if (data.inputChunk === 'header') {
      if (!Number.isInteger(data.count) || data.count < 0 || data.count > 100000 || !data.header || data.request?.id !== data.id) throw new Error('Invalid pattern input header');
      if (pending.size >= 4) pending.delete(pending.keys().next().value);
      pending.set(data.id, { request: data.request, input: { ...data.header, pixels: [] }, count: data.count }); return null;
    }
    const state = pending.get(data.id);
    if (!state) return null; // cancelled/superseded input
    if (data.inputChunk === 'pixels') {
      if (data.offset !== state.input.pixels.length || !Array.isArray(data.pixels) || state.input.pixels.length + data.pixels.length > state.count) throw new Error('Invalid pattern input chunk');
      state.input.pixels.push(...data.pixels); return null;
    }
    if (data.inputChunk !== 'end' || state.input.pixels.length !== state.count) throw new Error('Incomplete pattern input');
    pending.delete(data.id); return { ...state.request, input: state.input };
  };
}
