import test from 'node:test';
import assert from 'node:assert/strict';
import { stationItemSummary, targetMultiView, overviewTable } from '../../dist/modules/overview-table.js';

// Multi-station overview table (#15, FR-M1, FR-M15): per recognition item, what each station records of it
// (from the item lengths and counts kept in its compact result) and how well the item is seen from several
// angles (multi-view coverage at points inside the item). A planning heuristic.
const n = 2;
// Counts top row first; item lengths sparse (index, length) in the same order.
const entry = (counts, lengths = {}, detectorItems = [], detectorFeatures = []) => ({ n, pixels: { count: Float32Array.from(counts) },
  items: Object.fromEntries(Object.entries(lengths).map(([id, pairs]) => [id, { index: Uint16Array.from(pairs.map(p => p[0])), length: Float32Array.from(pairs.map(p => p[1])) }])),
  detectorItems, detectorFeatures });

test('a station\'s row: mask at the threshold, its share of the image, counts in it and the median counting error', () => {
  const e = entry([100, 400, 2500, 0], { g: [[0, .05], [1, .5], [2, 3]] });
  const row = stationItemSummary(e, 'g', .1);
  assert.deepEqual({ ...row, medianError: +row.medianError.toFixed(4) }, { inView: true, maskPixels: 2, coverage: .5, counts: 2900, medianError: +((.05 + .02) / 2).toFixed(4), detectorInside: false });
  assert.equal(stationItemSummary(e, 'g', 1).maskPixels, 1);
  assert.deepEqual(stationItemSummary(e, 'other', .1), { inView: false, maskPixels: 0, coverage: 0, counts: 0, medianError: null, detectorInside: false });
  assert.equal(stationItemSummary(entry([0, 0, 0, 0], {}, ['g']), 'g', .1).detectorInside, true);
});

// Stations looking straight up (el 90°) from below a point at the origin + 10 m; device wide open.
const device = { maxSlopeX: 2, maxSlopeY: 2, stripsX: 2, nativeSlopeStep: 1 };
const up = (id, x, counts) => ({ id, name: id, x, y: 0, z: 0, az: 0, el: 90, device, n: 1, counts: counts === null ? null : Float32Array.of(counts) });

test('multi-view numbers over the target points: share with enough usable views, class shares, medians', () => {
  const points = [[0, 0, 10], [0, 0, 10.5], [100, 0, 10]].map(position => ({ position, featureIds: ['f'] }));
  const stations = [up('a', -5, 900), up('b', 0, 900), up('c', 5, 50)];
  const m = targetMultiView(points, stations, { errorLevel: .1, minViews: 2, goodSpreadDeg: 30, minSpreadDeg: 10 });
  // Points 1–2: a and b usable (spread ≈ 26.6°), c too weak → limited; point 3 out of every field of view.
  assert.equal(m.points, 3); assert.equal(m.shareMinViews, 2 / 3);
  assert.deepEqual(m.classShares, { good: 0, limited: 2 / 3, insufficient: 0, none: 1 / 3 });
  assert.ok(Math.abs(m.medianSpreadDeg - 26.2) < 1, m.medianSpreadDeg); assert.ok(Math.abs(m.medianWeakestError - 1 / 30) < 1e-9);
  assert.equal(m.pending, false);
  assert.equal(targetMultiView(points, [up('a', -5, null)], {}).pending, true);
  assert.equal(targetMultiView([], stations, {}).points, 0);
});

test('the table: one row per item with each station, seen-by count and multi-view numbers; a station is no view of the feature it sits in', () => {
  const items = [{ id: 'g', label: { zh: '廊道' }, color: '#123456' }, { id: 'h', label: { zh: '空' }, color: '#654321' }];
  const stations = [{ ...up('a', -5, 900), entry: entry([900, 0, 0, 0], { g: [[0, 2]] }) },
    { ...up('b', 0, 900), entry: entry([900, 0, 0, 0], { g: [[0, 2]] }, ['g'], ['g_upper']) }, { ...up('c', 5, 900), entry: null }];
  // Item g groups two galleries; b sits in g_upper and still sees g_lower.
  const samples = new Map([['g', [{ position: [0, 0, 10], featureIds: ['g_upper'] }, { position: [0, 0, 10.5], featureIds: ['g_lower'] }]]]);
  const table = overviewTable({ items, stations, samples, threshold: .1, options: { minViews: 2 } });
  assert.deepEqual(table.map(r => r.id), ['g', 'h']);
  const g = table[0];
  assert.deepEqual(g.stations.map(s => [s.id, s.state, s.detectorInside ?? null]), [['a', 'ready', false], ['b', 'ready', true], ['c', 'pending', null]]);
  assert.equal(g.seenBy, 2);
  // c has no result yet (pending); in g_upper only a is a usable view, in g_lower a and b.
  assert.equal(g.multi.shareMinViews, .5); assert.equal(g.multi.pending, true);
  assert.equal(table[1].multi, null); assert.equal(table[1].seenBy, 0);
});

test('with lines from behind hidden, a station row counts only the pixels whose lines come from in front', () => {
  const e = entry([100, 400, 2500, 0], { g: [[0, .5], [1, .5], [2, 3]] });
  e.pixels.side = Uint8Array.from([0, 1, 0, 0]);
  assert.deepEqual([stationItemSummary(e, 'g', .1).maskPixels, stationItemSummary(e, 'g', .1, { back: false }).maskPixels], [3, 2]);
  assert.equal(stationItemSummary(e, 'g', .1, { back: false }).counts, 2600);
});
