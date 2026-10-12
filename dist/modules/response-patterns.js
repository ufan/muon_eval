import { createPatternField } from './projection-pattern-contract.js';
import { prepareProjectionPattern } from './projection-pattern-fields.js';
import { extractResponseContours } from './contribution-contours.js';

export const RESPONSE_PATTERN_VERSION = '1.0.0';
export function responseFieldFromProjection(result, quantity = 'transmission', representation = 'raw', context = 'through') {
  if (!['compiled-detector-assessment', 'legacy-detector-assessment'].includes(result.kind) || !['transmission', 'expected-count'].includes(quantity)
    || !['raw', 'display-smoothed'].includes(representation) || !['through', 'open-sky', 'normalized'].includes(context)
    || (context !== 'through' && representation !== 'raw') || (context === 'open-sky' && quantity !== 'expected-count')
    || (context === 'normalized' && quantity !== 'transmission')) throw new Error('Invalid response field request');
  const { snapshot, grid } = prepareProjectionPattern(result);
  const values = result.pixels.map(p => {
    if (!Number.isFinite(p.openCount) || p.openCount < 0) throw new Error('Explicit shared-core open-sky counts required');
    if (context === 'open-sky') return p.openCount;
    // Zero reference support is undefined, never a fabricated zero transmission.
    if (p.openCount === 0) return null;
    const value = context === 'normalized' ? p.count / p.openCount : quantity === 'transmission'
      ? p[representation === 'raw' ? 'transmission' : 'displayTransmission']
      : p[representation === 'raw' ? 'count' : 'displayCount'];
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid response sample');
    // T>1 (possible from legacy-quick-response@1.0.0 results) keeps its raw
    // value but is never clamped into a fabricated valid attenuation field.
    return quantity === 'transmission' && value > 1 ? null : value;
  });
  return createPatternField({ id: `response:${quantity}:${representation}:${context}`, snapshot, grid, quantity, representation,
    values, valid: values.map(v => v !== null), provenance: { source: result.kind, context, adapterVersion: RESPONSE_PATTERN_VERSION,
      invalidSampleCount: values.filter(v => v === null).length,
      limitations: [...result.limitations, 'Open-sky counts include acceptance, directional surface flux, exposure and efficiency.',
        'N/Nopen is an attenuation diagnostic only; zero open-sky support is invalid.',
        'Out-of-range T>1 is invalid for attenuation interpretation, not clamped; raw exports retain it.',
        'Display smoothing is the existing uncalibrated approximation, not a detector response measurement.',
        'No counterfactual ownership, statistical significance or physical resolvability is inferred.'] } });
}
export function responsePattern(result, { quantity = 'transmission', representation = 'raw', context = 'through', levels } = {}) {
  const field = responseFieldFromProjection(result, quantity, representation, context);
  const options = { mode: 'physical', units: field.units, levels: levels ?? (quantity === 'transmission' ? [.01, .1, .5, .9] : [1, 10, 100, 1000]) };
  return { field, contours: extractResponseContours(field, options) };
}

// Local adjacent-bin diagnostics, not attribution or a detectability score.
export function responseFeatureContext(result, index, neighbour) {
  if (![index, neighbour].every(i => Number.isInteger(i) && i >= 0 && i < result.pixels.length)) throw new Error('Invalid feature pixels');
  const n = result.config.bins;
  if (Math.abs(index % n - neighbour % n) + Math.abs(Math.floor(index / n) - Math.floor(neighbour / n)) !== 1) throw new Error('Adjacent bins required');
  const a = result.pixels[index], b = result.pixels[neighbour];
  const supported = a.openCount > 0 && b.openCount > 0;
  const dot = a.direction.reduce((sum, x, i) => sum + x * b.direction[i], 0);
  return { version: RESPONSE_PATTERN_VERSION, units: { contrast: '1', countSupport: 'events', separation: 'deg' },
    state: supported ? 'ready' : 'invalid', transmissionDifference: supported ? b.transmission - a.transmission : null,
    normalizedCountDifference: supported ? b.count / b.openCount - a.count / a.openCount : null,
    expectedCounts: [a.count, b.count], openSkyCounts: [a.openCount, b.openCount],
    angularSeparationDeg: Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI,
    nativeRanges: [a, b].map(p => ({ x: p.nativeRangeX, y: p.nativeRangeY })),
    displayAngularResolutionDeg: result.response.angularResolutionDeg,
    limitations: ['Adjacent representative samples, not independent physical angular resolution or significance.',
      'Count differences alone conflate material, acceptance and directional flux.'] };
}
