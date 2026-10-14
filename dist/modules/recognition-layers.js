// Per-result recognition layers (ADR-029, FR-M12): for each recognition item, the
// length a pixel's ray runs inside the item, its feature mask (L > T) and the
// outline of that mask. Pure: reads a finished projection, never the scene or DOM.
// Fields are returned in display order (top row first); projections store the
// bottom row first.
import contours from '../vendor/d3-contour/contours.js';
import { materialBoundaryProfile, materialEnvelopeEdges } from './material-envelopes.js';

export const DEFAULT_MASK_THRESHOLD_M = 0.1;

function checkThreshold(threshold) {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('Invalid mask threshold');
  return threshold;
}

function itemLength(q, item) {
  if (item.kind === 'material') return q.totals?.[item.material] ?? 0;
  if (item.kind === 'features') return item.featureIds.reduce((sum, id) => sum + (q.entityLengths?.[id] ?? 0), 0);
  throw new Error(`Unknown recognition item kind ${item.kind}`);
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
    const entry = q.segments.find(segment => item.kind === 'material' ? segment.material === item.material
      : segment.entityIds.some(id => item.featureIds.includes(id)));
    return [{ id: item.id, entryM: entry ? entry.t0 : NaN, lengthM }];
  }).sort((a, b) => a.entryM - b.entryM);
}

// Material envelopes (sampled material silhouettes and air-interface depth edges) of a
// main-app projection, in display pixel units like the outlines. Same rule as the
// geometry preview; a material counts as present where its length exceeds the threshold.
export function materialEnvelopes({ n, values }, materials, { threshold = DEFAULT_MASK_THRESHOLD_M, depthEdges = true } = {}) {
  checkThreshold(threshold);
  if (!Number.isInteger(n) || n < 1 || values?.length !== n * n) throw new Error('Invalid projection field');
  const pixels = new Array(n * n);
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++)
    pixels[(n - 1 - iy) * n + ix] = { materialBoundaries: materialBoundaryProfile(values[iy * n + ix].q) };
  return materials.map(material => ({ material, edges: materialEnvelopeEdges(pixels, n, material, { tolerance: threshold, depthEdges }) }));
}
