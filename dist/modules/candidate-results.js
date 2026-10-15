// Per-candidate session result cache (FR-P10, ADR-020): one compact entry per assessment
// key, filled in the background through the assessment port. Pure apart from the injected
// port and scheduler; no DOM.
import { prepareProjectionPattern } from './projection-pattern-fields.js';
import { comparisonIndicators, snapshotDifferences } from './pattern-comparison.js';
import { computeRecognitionLayers, detectorSpaceItems } from './recognition-layers.js';

const stable = value => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;

// Every effective input of one assessment pass; names, ids and the plan reference are provenance only.
export function assessmentKey({ station, device, response, environment }, quality = 'final') {
  const { x, y, z, az, el } = station;
  return JSON.stringify(stable({ station: { x, y, z, az, el }, device, response, environment, quality }));
}

// Per recognition item, the length each pixel's ray runs inside it (recognition-layers.js, the space the
// detector sits in excluded), kept sparse: pixel indices (top row first) and lengths of the pixels with any
// length, so masks at any threshold come from the cache (#15 overview). `detectorItems`: the items the
// detector sits in; `detectorFeatures`: the features it sits in (the first stretch of its rays).
export function compactItemLengths(data, items) {
  const layers = computeRecognitionLayers(data, items, { threshold: 0 }), out = {};
  for (const layer of layers) {
    if (!layer.maskPixels) continue;
    const index = new Uint16Array(layer.maskPixels), length = new Float32Array(layer.maskPixels);
    let k = 0;
    layer.lengths.forEach((value, i) => { if (value > 0) { index[k] = i; length[k++] = value; } });
    out[layer.id] = { index, length };
  }
  const mid = Math.floor(data.n / 2);
  const centre = data.values[mid * data.n + mid], first = centre.q.segments?.[0];
  return { items: out, detectorItems: detectorSpaceItems(centre, items), detectorFeatures: first && first.t0 <= 1e-9 ? [...first.entityIds] : [] };
}

// Compact form of a compiled result: summary, comparison indicators for `selection`, the
// snapshot inputs (for parameter differences), 32-bit per-pixel arrays in the result's
// pixel order (top row first) and, with `recognition` (compactItemLengths), the item lengths.
// Path segments are left out until a view needs them (#16).
export function compactResult(result, { selection, recognition = null } = {}) {
  const n = result.config.bins, count = n * n, arrays = {};
  for (const key of ['count', 'displayCount', 'transmission', 'displayTransmission', 'mwe']) arrays[key] = Float32Array.from(result.pixels, p => p[key]);
  arrays.side = Uint8Array.from(result.pixels, p => p.side === 'back' ? 1 : 0);
  let indicators = null;
  if (selection) { try { indicators = comparisonIndicators(result, selection); } catch { indicators = null; } }
  const entry = { n, totalCount: result.totalCount, weightedTransmission: result.weightedTransmission, modelVersion: result.modelVersion,
    plan: result.plan ? { ...result.plan } : null, indicators, snapshotInputs: prepareProjectionPattern(result).snapshot.inputs, pixels: arrays,
    items: recognition?.items ?? {}, detectorItems: recognition?.detectorItems ?? [], detectorFeatures: recognition?.detectorFeatures ?? [] };
  entry.bytes = Object.values(arrays).reduce((sum, a) => sum + a.byteLength, 0) + JSON.stringify(entry.snapshotInputs).length + (indicators ? 2000 : 0)
    + Object.values(entry.items).reduce((sum, item) => sum + item.index.byteLength + item.length.byteLength, 0);
  if (entry.pixels.count.length !== count) throw new Error('Invalid compact result shape');
  return entry;
}

export function createResultCache() {
  const entries = new Map();
  return Object.freeze({
    get: key => entries.get(key), has: key => entries.has(key), set(key, entry) { entries.set(key, entry); },
    retain(keys) { const keep = new Set(keys); for (const key of [...entries.keys()]) if (!keep.has(key)) entries.delete(key); },
    get size() { return entries.size; },
    get bytes() { return [...entries.values()].reduce((sum, e) => sum + (e.bytes ?? 0), 0); }
  });
}

// Background evaluation, one candidate at a time at final quality. `request(jobs)` replaces
// the wanted set ([{ key, input }] in priority order); `pause()` cancels the running job and
// holds the queue while the working station computes; `resume()` continues.
export function createCandidateQueue({ port, compact, onEntry, onError = () => {}, onChange = () => {},
  scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) } }) {
  let queued = [], running = null, paused = false, disposed = false, timer = null;
  const failed = new Set();
  const kick = () => { if (timer === null && !disposed) timer = scheduler.set(() => { timer = null; next(); }, 0); };
  function cancelRunning(requeue) {
    if (!running) return;
    const job = running; running = null; job.abort.abort();
    if (requeue) queued.unshift({ key: job.key, input: job.input });
  }
  function next() {
    if (running || paused || disposed) return;
    const job = queued.shift();
    if (!job) { onChange(); return; }
    const abort = new AbortController(), current = { ...job, abort };
    running = current; onChange();
    Promise.resolve().then(() => port.open(job.input).evaluate('final', { signal: abort.signal }))
      .then(full => { if (running !== current) return; running = null; onEntry(job.key, compact(full)); })
      .catch(error => { if (running !== current && error?.name === 'AbortError') return; if (running === current) running = null;
        if (error?.name !== 'AbortError') { failed.add(job.key); onError(job.key, error); } })
      .finally(() => { onChange(); kick(); });
  }
  return Object.freeze({
    request(jobs) {
      const wanted = jobs.filter(job => !failed.has(job.key));
      if (running && !wanted.some(job => job.key === running.key)) cancelRunning(false);
      queued = wanted.filter(job => job.key !== running?.key);
      onChange(); kick();
    },
    pause() { paused = true; cancelRunning(true); },
    resume() { paused = false; kick(); },
    state(key) { return running?.key === key ? 'running' : queued.some(job => job.key === key) ? 'queued' : failed.has(key) ? 'failed' : null; },
    get idle() { return !running && !queued.length; },
    dispose() { disposed = true; cancelRunning(false); queued = []; if (timer !== null) scheduler.clear(timer); }
  });
}

// Comparison rows from cached entries ([{ label, entry }]): the shared indicators and the
// shared parameter differences; no second formula path.
export function compareEntries(items) {
  if (!items.length) throw new Error('Compare at least one candidate');
  const differences = snapshotDifferences(items.map(item => item.entry.snapshotInputs));
  return { rows: items.map(({ label, entry }) => ({ label, indicators: entry.indicators })), differences,
    comparable: differences.every(d => !d.fields.length) };
}

// A cached entry's per-pixel counts in the projection's own order (bottom row first), or null.
export function entryCountsBottomFirst(entry) {
  if (!entry) return null;
  const n = entry.n, out = new Float32Array(n * n);
  for (let row = 0; row < n; row++) out.set(entry.pixels.count.subarray((n - 1 - row) * n, (n - row) * n), row * n);
  return out;
}
