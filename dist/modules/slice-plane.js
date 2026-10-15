// Slice plane through the interior (15e, FR-M16): a plane across one model axis, spanning the other two
// axes of an extent, shown only where it cuts through matter. Pure: point classification is injected
// (the calculation geometry, never the display meshes). Model frame, z up.
export const SLICE_AXES = Object.freeze({ x: [1, 2], y: [0, 2], z: [0, 1] });
const INDEX = { x: 0, y: 1, z: 2 };

function axes(axis) {
  if (!Object.hasOwn(SLICE_AXES, axis)) throw new Error(`Unknown slice axis ${axis}`);
  return SLICE_AXES[axis];
}
export const sliceRange = (axis, extent) => { axes(axis); return [extent.min[INDEX[axis]], extent.max[INDEX[axis]]]; };

// The model point at plane coordinates (u, v) in [0, 1] (u along the first other axis, v along the second).
export function slicePoint(axis, value, extent, u, v) {
  const [a, b] = axes(axis), point = [0, 0, 0];
  point[INDEX[axis]] = value;
  point[a] = extent.min[a] + u * (extent.max[a] - extent.min[a]);
  point[b] = extent.min[b] + v * (extent.max[b] - extent.min[b]);
  return point;
}

// resolution² cells (row v from the bottom), 1 where the cell centre is matter. Starts after `startDelayMs` (so a
// slider can come to rest), runs in chunks, yielding between them; rejects with an AbortError when `signal` aborts.
export async function computeSliceMask({ classify, isMatter, axis, value, extent, resolution = 128, chunk = 2048, signal = null, startDelayMs = 0,
  yieldTo = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)) }) {
  axes(axis);
  const mask = new Uint8Array(resolution * resolution), aborted = () => { if (signal?.aborted) throw new DOMException('Slice cancelled', 'AbortError'); };
  if (startDelayMs > 0) await yieldTo(startDelayMs);
  for (let start = 0; start < mask.length; start += chunk) {
    aborted();
    for (let i = start; i < Math.min(mask.length, start + chunk); i++) {
      const u = (i % resolution + .5) / resolution, v = (Math.floor(i / resolution) + .5) / resolution;
      mask[i] = isMatter(classify(slicePoint(axis, value, extent, u, v))) ? 1 : 0;
    }
    await yieldTo();
  }
  aborted();
  return mask;
}
