// @ts-check
import { materialFieldFromProjection, mapPatternOverlayToGraph } from './projection-pattern-fields.js';
import { extractContributionContours } from './contribution-contours.js';
import { responsePattern } from './response-patterns.js';
import { contributionPathData } from './contribution-view.js';

export function prepareNumericPattern(kind, result, options) {
  if (!['contribution', 'response'].includes(kind)) throw new Error('Unknown numeric pattern kind');
  const pattern = kind === 'contribution'
    ? { field: materialFieldFromProjection(result, options.material, options.quantity) }
    : responsePattern(result, options);
  if (kind === 'contribution') pattern.contours = extractContributionContours(pattern.field, options.levelOptions);
  const mapped = pattern.contours.overlays.map(overlay => mapPatternOverlayToGraph(overlay, pattern.field,
    { width: result.config.bins, height: result.config.bins }));
  return { ...pattern, mapped, pathData: mapped.map(m => contributionPathData(m.lines)) };
}

// Copy only inputs consumed by the existing pure adapters; never ray-profile
// arrays or DOM/display state. Validation still happens inside those adapters.
export function numericPatternInput(result) {
  const keys = ['kind', 'frame', 'schemaVersion', 'identity', 'scenarioId', 'backend', 'modelVersion',
    'variables', 'projectionGeometry', 'config', 'device', 'response', 'materialContributionUnits', 'limitations'];
  return { ...Object.fromEntries(keys.filter(k => Object.hasOwn(result, k)).map(k => [k, result[k]])),
    pixels: result.pixels.map(p => ({ sx: p.sx, sy: p.sy, nativeRangeX: p.nativeRangeX, nativeRangeY: p.nativeRangeY,
      totals: p.totals, materialColumns: p.materialColumns, openCount: p.openCount, count: p.count,
      transmission: p.transmission, displayCount: p.displayCount, displayTransmission: p.displayTransmission })) };
}
