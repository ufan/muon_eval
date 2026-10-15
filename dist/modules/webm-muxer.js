// Minimal WebM (Matroska) writer for the demonstration animation (FR-M5): one video track of encoded frames
// ({ data: Uint8Array, timestampUs, key }) with exact timestamps, so the video plays at its frame rate however
// slowly it was rendered. Pure: returns the file bytes. Millisecond timecodes; a new cluster at each key frame.
const ID = { EBML: 0x1A45DFA3, Segment: 0x18538067, Info: 0x1549A966, Tracks: 0x1654AE6B, TrackEntry: 0xAE, Cluster: 0x1F43B675 };

function idBytes(id) { const out = []; for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 255); return out; }
// Element sizes as 8-byte variable-length integers (valid for any size).
function sizeBytes(size) { const out = [0x01]; for (let i = 6; i >= 0; i--) out.push(Math.floor(size / 256 ** i) & 255); return out; }
function uintBytes(value) { const out = []; for (let v = value; v > 0; v = Math.floor(v / 256)) out.unshift(v & 255); return out.length ? out : [0]; }
const concat = parts => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const element = (id, body) => concat([Uint8Array.from(idBytes(id)), Uint8Array.from(sizeBytes(body.length)), body]);
const master = (id, children) => element(id, concat(children));
const uint = (id, value) => element(id, Uint8Array.from(uintBytes(value)));
const string = (id, value) => element(id, Uint8Array.from(value, c => c.charCodeAt(0)));
const float = (id, value) => { const body = new Uint8Array(8); new DataView(body.buffer).setFloat64(0, value); return element(id, body); };

export function muxWebm({ codec, width, height, frames, durationUs }) {
  if (!frames.length || !frames[0].key) throw new Error('A WebM video must start with a key frame');
  const header = master(ID.EBML, [uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), string(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2)]);
  const info = master(ID.Info, [uint(0x2AD7B1, 1e6), float(0x4489, durationUs / 1000), string(0x4D80, 'muon-dam-eval'), string(0x5741, 'muon-dam-eval')]);
  const tracks = master(ID.Tracks, [master(ID.TrackEntry, [uint(0xD7, 1), uint(0x73C5, 1), uint(0x83, 1), uint(0x9C, 0), string(0x86, codec),
    master(0xE0, [uint(0xB0, width), uint(0xBA, height)])])]);
  const clusters = [];
  let base = null, blocks = [];
  const flush = () => { if (blocks.length) clusters.push(master(ID.Cluster, [uint(0xE7, base), ...blocks])); blocks = []; };
  for (const frame of frames) {
    const ms = Math.round(frame.timestampUs / 1000);
    if (frame.key || ms - base > 32000) { flush(); base = ms; }
    const head = new Uint8Array(4); head[0] = 0x81; new DataView(head.buffer).setInt16(1, ms - base); head[3] = frame.key ? 0x80 : 0;
    blocks.push(element(0xA3, concat([head, frame.data])));
  }
  flush();
  return concat([header, master(ID.Segment, [info, tracks, ...clusters])]);
}
