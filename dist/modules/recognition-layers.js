// Per-result recognition layers (ADR-029, FR-M12): for each recognition item, the
// length a pixel's ray runs inside the item, its feature mask (L > T) and the
// outline of that mask. Pure: reads a finished projection, never the scene or DOM.
// Fields are returned in display order (top row first); projections store the
// bottom row first.
import contours from '../vendor/d3-contour/contours.js';

export const DEFAULT_MASK_THRESHOLD_M = 0.1;

function checkThreshold(threshold) {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Invalid mask threshold');
  return threshold;
}

// End of the connected stretch of ray that starts at the detector inside the item
// (0 when the detector is outside it): the space the detector sits in is not a
// target in its own image, only a re-entry further out is.
function detectorRunEnd(q, item) {
  let end = 0;
  for (const segment of q.segments ?? []) {
    if (segment.t0 > end + 1e-9 || !segment.entityIds.some(id => item.featureIds.includes(id))) break;
    end = segment.t1;
  }
  return end;
}

function itemLength(q, item) {
  if (item.kind === 'material') return q.totals?.[item.material] ?? 0;
  if (item.kind !== 'features') throw new Error(`Unknown recognition item kind ${item.kind}`);
  let length = item.featureIds.reduce((sum, id) => sum + (q.entityLengths?.[id] ?? 0), 0);
  const runEnd = detectorRunEnd(q, item);
  if (runEnd > 0) for (const segment of q.segments) {
    if (segment.t1 > runEnd) break;
    length -= (segment.t1 - segment.t0) * segment.entityIds.filter(id => item.featureIds.includes(id)).length;
  }
  return Math.max(0, length);
}

// Feature items that contain the detector (their stretch from the detector is excluded).
export function detectorSpaceItems(pixel, items) {
  return items.filter(item => item.kind === 'features' && detectorRunEnd(pixel.q, item) > 0).map(item => item.id);
}

export function computeRecognitionLayers({ n, values }, items, { threshold = DEFAULT_MASK_THRESHOLD_M } = {}) {
  checkThreshold(threshold);
  if (!Number.isInteger(n) || n < 1 || values?.length !== n * n) throw new Error('Invalid projection field');
  return items.map(item => {
    const lengths = new Float64Array(n * n), mask = new Uint8Array(n * n);
    let maskPixels = 0;
    for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
      const at = (n - 1 - iy) * n + ix, length = itemLength(values[iy * n + ix].q, item);
      lengths[at] = length;
      if (length > threshold) { mask[at] = 1; maskPixels++; }
    }
    return { id: item.id, lengths, mask, maskPixels, coverage: maskPixels / (n * n), inView: maskPixels > 0 };
  });
}

export function visibleRecognitionLayers(layers) {
  return layers.filter(layer => layer.inView).sort((a, b) => b.coverage - a.coverage);
}

// Closed rings around the mask in display pixel units ([0, n], y down). The mask
// is padded with empty pixels so regions touching the image border close along it.
export function outlineRings(mask, n) {
  const size = n + 2, padded = new Float64Array(size * size);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) padded[(r + 1) * size + c + 1] = mask[r * n + c];
  const clamp = value => Math.max(0, Math.min(n, value - 1));
  return contours().size([size, size]).contour(padded, 0.5).coordinates
    .flatMap(polygon => polygon.map(ring => ring.map(([x, y]) => [clamp(x), clamp(y)])));
}

// Items crossed by one pixel's ray, in ray order: entry distance from the detector
// and length inside the item (metres). Items with length <= threshold are left out.
export function crossingsAlongRay(pixel, items, { threshold = 0 } = {}) {
  checkThreshold(threshold);
  const { q } = pixel;
  return items.flatMap(item => {
    const lengthM = itemLength(q, item);
    if (!(lengthM > threshold)) return [];
    const after = item.kind === 'features' ? detectorRunEnd(q, item) : 0;
    const entry = q.segments.find(segment => segment.t0 >= after && (item.kind === 'material' ? segment.material === item.material
      : segment.entityIds.some(id => item.featureIds.includes(id))));
    return [{ id: item.id, entryM: entry ? entry.t0 : NaN, lengthM }];
  }).sort((a, b) => a.entryM - b.entryM);
}
