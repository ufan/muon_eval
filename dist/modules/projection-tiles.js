// Projection images from cached results (#16, FR-M4) and the colour scale shared with the main projection.
// Pure: no DOM. The compact entry (candidate-results.js) keeps its pixel arrays top row first.

// Fixed logarithmic scales, the same for every station so images compare: counts 0.1 … 10⁵, transmission 10⁻⁶ … 1.
export function colorLevel(mode, value) {
  const clamp = t => Math.min(1, Math.max(0, t));
  if (mode === 'counts') return clamp((Math.log10(Math.max(.1, value)) + 1) / 6);
  if (mode === 'transmission') return clamp((Math.log10(Math.max(1e-6, value)) + 6) / 6);
  throw new Error(`Unknown colour mode ${mode}`);
}

// Heat ramp blue → cyan → yellow → red, interpolated in linear channels (the renderer's working colour space,
// as drawn so far); returns [r, g, b] in [0, 1].
const STOPS = [[0, 0x397cff], [.38, 0x24d5c1], [.72, 0xffd166], [1, 0xff5f55]].map(([t, hex]) => [t, [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
  .map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })]);
export function heatRgb(t) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i], [b, cb] = STOPS[i + 1];
    if (t >= a && t <= b) return ca.map((v, k) => v + (cb[k] - v) * (t - a) / (b - a));
  }
  return [...STOPS.at(-1)[1]];
}

// An item's mask (ray length inside it > threshold), top row first, from the entry's sparse item lengths.
export function entryMask(entry, itemId, threshold) {
  const mask = new Uint8Array(entry.n * entry.n), item = entry.items?.[itemId];
  if (item) item.index.forEach((pixel, k) => { if (item.length[k] > threshold) mask[pixel] = 1; });
  return mask;
}

// The entry's counts as a projection field ({ n, values: [{ count }] }, bottom row first), e.g. for precision lines.
export function entryCountField(entry) {
  const n = entry.n, values = [];
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) values.push({ count: entry.pixels.count[(n - 1 - iy) * n + ix] });
  return { n, values };
}

// One pixel's values (ix from the left, iy from the bottom).
export function entryPixel(entry, ix, iy) {
  const i = (entry.n - 1 - iy) * entry.n + ix, p = entry.pixels;
  return { count: p.count[i], transmission: p.transmission[i], mwe: p.mwe[i], side: p.side[i] ? 'back' : 'front' };
}
