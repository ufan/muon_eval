// Multi-station overview table (#15, FR-M1, FR-M15): per recognition item, what each station records of it,
// from the item lengths and counts kept in its compact result (candidate-results.js), and how well the item
// is seen from several angles: multi-view coverage (coverage-map.js) at points inside it (target-samples.js).
// A planning heuristic, not a reconstruction guarantee. Pure; no DOM.
import { multiViewCoverage } from './coverage-map.js';

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// One station and one item: the mask (ray length inside the item > threshold), its share of the image, the
// counts in it and the median counting error 1/√N of its pixels (pixels without counts count as infinite).
export function stationItemSummary(entry, itemId, threshold) {
  const item = entry.items?.[itemId], detectorInside = entry.detectorItems?.includes(itemId) ?? false;
  const errors = [];
  let counts = 0;
  if (item) item.index.forEach((pixel, k) => {
    if (!(item.length[k] > threshold)) return;
    const n = entry.pixels.count[pixel];
    counts += n; errors.push(n > 0 ? 1 / Math.sqrt(n) : Infinity);
  });
  const maskPixels = errors.length;
  return { inView: maskPixels > 0, maskPixels, coverage: maskPixels / (entry.n * entry.n), counts, medianError: median(errors), detectorInside };
}

// Multi-view coverage over the target points ({ position, featureIds }): the share with at least `minViews`
// usable views, the share of each class, the median spread of points with ≥ 2 usable views and the median
// weakest error of points with a usable view; `pending` while a station that sees a point has no result yet.
// A station is not a view of points in a feature it sits in (`detectorFeatures`), as in its own image the
// space it sits in is left out.
export function targetMultiView(points, stations, options = {}) {
  const minViews = options.minViews ?? 3, shares = { good: 0, limited: 0, insufficient: 0, none: 0 }, spreads = [], errors = [];
  let enough = 0, pending = false;
  for (const { position, featureIds = [] } of points) {
    const views = stations.filter(s => !s.detectorFeatures?.some(id => featureIds.includes(id)));
    const m = multiViewCoverage(position, views, options);
    shares[m.class]++;
    if (m.usable.length >= minViews) enough++;
    if (m.usable.length >= 2) spreads.push(m.spreadDeg);
    if (m.weakestError !== null) errors.push(m.weakestError);
    if (m.pending.length) pending = true;
  }
  const count = points.length, share = v => count ? v / count : 0;
  return { points: count, shareMinViews: share(enough), classShares: Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, share(v)])),
    medianSpreadDeg: median(spreads), medianWeakestError: median(errors), pending };
}

// Rows for `items` over `stations` ({ id, name, x, y, z, az, el, device, n, counts, entry }; entry null while
// pending; its counts are then ignored). `detectorInside` marks a station sitting in the item; its numbers
// leave out the feature it sits in. `samples`: item id → target points; items without samples get no
// multi-view numbers.
export function overviewTable({ items, stations, samples, threshold, options = {} }) {
  return items.map(item => {
    const rows = stations.map(s => {
      if (!s.entry) return { id: s.id, name: s.name, state: 'pending' };
      const summary = stationItemSummary(s.entry, item.id, threshold);
      return { id: s.id, name: s.name, state: 'ready', ...summary };
    });
    const views = stations.map(s => s.entry ? { ...s, detectorFeatures: s.entry.detectorFeatures ?? [] } : { ...s, counts: null }), points = samples.get(item.id);
    return { id: item.id, label: item.label, color: item.color, stations: rows,
      seenBy: rows.filter(r => r.state === 'ready' && r.inView).length,
      multi: points?.length ? targetMultiView(points, views, options) : null };
  });
}
