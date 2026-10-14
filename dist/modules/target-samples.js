// Target points for the multi-view overview (#15, FR-M15): points inside a recognition item, found with the
// calculation geometry. Pure: point classification is injected (never the display meshes); where to look
// comes from the bounds of the compiled components the item owns. Model frame, z up.

// Bounds ({ min, max }) of each component an item owns ({ min, max, entityIds, material }). Each part is
// sampled on its own: a thin gallery fills only a sliver of the box around all galleries.
export function itemParts(item, components) {
  return components.filter(c => item.kind === 'material' ? c.material === item.material : c.entityIds.some(id => item.featureIds.includes(id)))
    .map(c => ({ min: [...c.min], max: [...c.max] }));
}

// Whether a classified point ({ material, entityIds }) lies in the item.
export const itemContains = (item, c) => item.kind === 'material' ? c.material === item.material : c.entityIds.some(id => item.featureIds.includes(id));

function cellCentres(bounds, budget) {
  const size = [0, 1, 2].map(k => Math.max(bounds.max[k] - bounds.min[k], 1e-6));
  const step = Math.cbrt(size[0] * size[1] * size[2] / budget), cells = size.map(s => Math.max(1, Math.round(s / step)));
  return { count: cells[0] * cells[1] * cells[2], at: i => {
    const c = [i % cells[0], Math.floor(i / cells[0]) % cells[1], Math.floor(i / (cells[0] * cells[1]))];
    return c.map((v, k) => bounds.min[k] + (v + .5) * size[k] / cells[k]);
  } };
}

// Centres of about `budget` equal cells per part that lie in the item ({ position, featureIds }: the features
// at the point), without repeats, thinned evenly to at most `maxPoints`. Runs in chunks, yielding between them; rejects with an AbortError when `signal` aborts.
export async function sampleTargetPoints({ parts, contains, classify, budget = 4000, maxPoints = 1500, chunk = 1024, signal = null,
  yieldTo = () => new Promise(resolve => setTimeout(resolve, 0)) }) {
  const found = [], seen = new Set(), aborted = () => { if (signal?.aborted) throw new DOMException('Target sampling cancelled', 'AbortError'); };
  for (const bounds of parts) {
    const grid = cellCentres(bounds, budget);
    for (let start = 0; start < grid.count; start += chunk) {
      aborted();
      for (let i = start; i < Math.min(grid.count, start + chunk); i++) {
        const point = grid.at(i), key = point.map(v => v.toFixed(3)).join();
        if (seen.has(key)) continue;
        seen.add(key);
        const c = classify(point);
        if (contains(c)) found.push({ position: point, featureIds: [...c.entityIds] });
      }
      await yieldTo();
    }
  }
  aborted();
  if (found.length <= maxPoints) return found;
  const stride = found.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => found[Math.floor(i * stride)]);
}
