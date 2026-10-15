import test from 'node:test';
import assert from 'node:assert/strict';
import { muxWebm } from '../../dist/modules/webm-muxer.js';

// Minimal WebM (Matroska) writer for the demonstration animation (FR-M5): encoded video frames with exact
// timestamps, so the video plays at its frame rate however slowly the frames were rendered.
// A small EBML reader checks the structure.
function readVint(bytes, at, keepMarker) {
  const first = bytes[at]; let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  let value = keepMarker ? first : first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[at + i];
  return { value, length };
}
function parse(bytes, start = 0, end = bytes.length) {
  const out = [];
  for (let at = start; at < end;) {
    const id = readVint(bytes, at, true), size = readVint(bytes, at + id.length, false), body = at + id.length + size.length;
    out.push({ id: id.value, start: body, end: body + size.value }); at = body + size.value;
  }
  return out;
}
const child = (bytes, element, id) => parse(bytes, element.start, element.end).find(e => e.id === id);
const uint = (bytes, e) => { let v = 0; for (let i = e.start; i < e.end; i++) v = v * 256 + bytes[i]; return v; };
const text = (bytes, e) => String.fromCharCode(...bytes.subarray(e.start, e.end));

test('header, track and clusters: one cluster per key frame, block times relative to it', () => {
  const frames = [0, 1, 2, 3, 4].map(i => ({ data: Uint8Array.of(i, i, i), timestampUs: i * 40000, key: i % 3 === 0 }));
  const bytes = muxWebm({ codec: 'V_VP9', width: 640, height: 360, frames, durationUs: 200000 });
  const [ebml, segment] = parse(bytes);
  assert.equal(ebml.id, 0x1A45DFA3); assert.equal(text(bytes, child(bytes, ebml, 0x4282)), 'webm');
  assert.equal(segment.id, 0x18538067); assert.equal(segment.end, bytes.length);
  const info = child(bytes, segment, 0x1549A966), view = new DataView(bytes.buffer, bytes.byteOffset);
  assert.equal(uint(bytes, child(bytes, info, 0x2AD7B1)), 1e6);
  assert.equal(view.getFloat64(child(bytes, info, 0x4489).start), 200);
  const entry = child(bytes, child(bytes, segment, 0x1654AE6B), 0xAE), video = child(bytes, entry, 0xE0);
  assert.equal(text(bytes, child(bytes, entry, 0x86)), 'V_VP9'); assert.equal(uint(bytes, child(bytes, entry, 0x83)), 1);
  assert.equal(uint(bytes, child(bytes, video, 0xB0)), 640); assert.equal(uint(bytes, child(bytes, video, 0xBA)), 360);
  const clusters = parse(bytes, segment.start, segment.end).filter(e => e.id === 0x1F43B675);
  assert.equal(clusters.length, 2);
  const blocks = clusters.flatMap(c => { const base = uint(bytes, child(bytes, c, 0xE7));
    return parse(bytes, c.start, c.end).filter(e => e.id === 0xA3).map(b => ({ time: base + view.getInt16(b.start + 1), key: !!(bytes[b.start + 3] & 0x80), track: bytes[b.start] & 0x7f, first: bytes[b.start + 4] })); });
  assert.deepEqual(blocks, [0, 1, 2, 3, 4].map(i => ({ time: i * 40, key: i % 3 === 0, track: 1, first: i })));
});

test('the first frame must be a key frame', () => {
  assert.throws(() => muxWebm({ codec: 'V_VP8', width: 2, height: 2, frames: [{ data: Uint8Array.of(1), timestampUs: 0, key: false }], durationUs: 1 }), /key frame/);
});
