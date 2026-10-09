// A3 benchmark grids; extraction is shared with the production B2 module.
import { extractSampledContours } from '../dist/modules/contribution-contours.js';
export { slopeCoordinate } from '../dist/modules/contribution-contours.js';
import { nativeAxisBins } from '../dist/modules/detector-projection.js';
import { defaultAssessmentDevice } from '../dist/modules/detector-defaults.js';

export function benchmarkGrid(kind, n) {
  if (kind === 'material') {
    const max = Math.tan(Math.PI / 6);
    const sx = Array.from({ length: n }, (_, i) => max * (2 * i / (n - 1) - 1));
    return { kind: 'uniform-samples', sx, sy: Array.from({ length: n }, (_, i) => max * (1 - 2 * i / (n - 1))) };
  }
  if (kind !== 'detector') throw new Error('Unknown benchmark grid');
  const device = defaultAssessmentDevice(), bins = nativeAxisBins(n, device);
  const bounds = bins.map(b => [(b.first - 0.5) * device.nativeSlopeStep, (b.last + 0.5) * device.nativeSlopeStep]);
  return { kind: 'detector-aggregated', sx: bins.map(b => b.slope), sy: bins.map(b => b.slope).reverse(),
    sxBounds: bounds, syBounds: bounds.toReversed() };
}

export const sampleField = (grid, fn) => grid.sy.flatMap(y => grid.sx.map(x => fn(x, y)));
export const benchmarkContours = extractSampledContours;
