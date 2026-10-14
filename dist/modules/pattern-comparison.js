import { prepareProjectionPattern } from './projection-pattern-fields.js';
import { responsePattern, responseFieldFromProjection } from './response-patterns.js';
import { createPatternOverlay } from './projection-pattern-contract.js';
import { sha256Portable } from './sha256.js';
export const COMPARISON_VERSION = '1.0.0';
const encoded = value => JSON.stringify(value);
const sha = value => sha256Portable(new TextEncoder().encode(encoded(value)));
export function comparisonIndicators(result, selection) {
  if (!selection || !['material', 'semantic'].includes(selection.kind) || typeof selection.id !== 'string'
    || !Number.isFinite(selection.minimumPathM) || selection.minimumPathM < 0) throw new Error('Explicit ROI and path threshold required');
  if (selection.kind === 'material' && !Object.hasOwn(result.projectionGeometry.materials, selection.id)) throw new Error('Unregistered ROI material');
  if (selection.kind === 'semantic' && !result.semanticAudit?.targets.some(t => t.id === selection.id)) throw new Error('Unmapped semantic ROI');
  const field = responseFieldFromProjection(result), mask = result.pixels.map(p =>
    (selection.kind === 'material' ? p.totals[selection.id] : p.targetLengths[selection.id]) > selection.minimumPathM);
  const target = [], background = [];
  result.pixels.forEach((p, i) => { if (field.valid[i]) (mask[i] ? target : background).push(p); });
  const mean = (list, key) => list.length ? list.reduce((s, p) => s + p[key], 0) / list.length : null;
  const sum = (list, key) => list.reduce((s, p) => s + p[key], 0);
  const centroid = list => {
    if (!list.length) return null;
    const v = [0, 1, 2].map(j => list.reduce((s, p) => s + p.direction[j], 0)), length = Math.hypot(...v);
    return length > 0 ? v.map(x => x / length) : null;
  };
  const a = centroid(target), b = centroid(background);
  const separation = a && b ? Math.acos(Math.max(-1, Math.min(1, a.reduce((s, x, i) => s + x * b[i], 0)))) * 180 / Math.PI : null;
  return { version: COMPARISON_VERSION, selection: structuredClone(selection), units: { coverage: 'bin fraction', contrast: '1', angularSeparation: 'deg', countSupport: 'events' },
    validBins: target.length + background.length, targetBins: target.length,
    targetFieldCoverage: field.values.length ? mask.filter(Boolean).length / field.values.length : null,
    supportedTargetCoverage: target.length + background.length ? target.length / (target.length + background.length) : null,
    targetExpectedCount: sum(target, 'count'), targetOpenSkyCount: sum(target, 'openCount'),
    totalExpectedCount: sum(result.pixels, 'count'),
    meanTargetTransmission: mean(target, 'transmission'), meanBackgroundTransmission: mean(background, 'transmission'),
    transmissionContrast: target.length && background.length ? mean(target, 'transmission') - mean(background, 'transmission') : null,
    targetBackgroundAngularSeparationDeg: separation,
    displayAngularResolutionDeg: result.response.angularResolutionDeg,
    warnings: ['ROI coverage is representative-bin coverage, not solid-angle area or canonical entity ownership.',
      'Contrast compares ROI/background mean raw transmission; different material paths are not a counterfactual.',
      'Angular separation is between direction centroids, not feature width or a calibrated resolution limit.',
      'No ranking, significance, measured-data inference, accessibility or safety score.'] };
}
export function comparePatternResults(results, selection, levels = [.01, .1, .5, .9]) {
  if (!Array.isArray(results) || !results.length) throw new Error('Comparison results required');
  const rows = results.map(result => prepareComparisonRow(result, selection, levels));
  return comparePreparedRows(results, rows, selection, levels);
}
function prepareComparisonRow(result, selection, levels) {
  return { snapshot: prepareProjectionPattern(result).snapshot,
    indicators: comparisonIndicators(result, selection), response: responsePattern(result, { levels }) };
}
// Worker-owned completed inputs are immutable. Cache only unchanged row work;
// comparison differences and sensitivity still use the same shared core.
export function createImmutablePatternComparisonEvaluator() {
  const cache = new WeakMap();
  return (results, selection, levels = [.01, .1, .5, .9]) => {
    if (!Array.isArray(results) || !results.length) throw new Error('Comparison results required');
    const key = encoded([selection, levels]);
    const rows = results.map(result => {
      let saved = cache.get(result); if (!saved) { saved = new Map(); cache.set(result, saved); }
      if (!saved.has(key)) { if (saved.size >= 8) saved.clear(); saved.set(key, prepareComparisonRow(result, selection, levels)); }
      return saved.get(key);
    });
    return comparePreparedRows(results, rows, selection, levels);
  };
}
// Which shared settings of each row differ from the first row (snapshot inputs of prepareProjectionPattern).
export function snapshotDifferences(inputs) {
  const base = inputs[0];
  const shared = ['datasetRelease', 'geometryVersion', 'backendVersion', 'modelVersion', 'detector', 'environment', 'sampling', 'response'];
  return inputs.map((row, index) => ({ index, fields: shared.filter(k => encoded(base[k]) !== encoded(row[k])) }));
}
function comparePreparedRows(results, rows, selection, levels) {
  const differences = snapshotDifferences(rows.map(row => row.snapshot.inputs));
  const sensitivity = rows.slice(1).map((row, offset) => {
    const other = results[offset + 1], same = differences[offset + 1].fields.length === 0;
    if (!same) return { baseline: 0, index: offset + 1, state: 'incomparable', meanAbsoluteTransmissionChange: null, coverageChange: null };
    const a = rows[0].response.field, b = row.response.field;
    const changes = a.values.flatMap((v, i) => a.valid[i] && b.valid[i] ? [Math.abs(v - b.values[i])] : []);
    return { baseline: 0, index: offset + 1, state: changes.length ? 'ready' : 'invalid',
      meanAbsoluteTransmissionChange: changes.length ? changes.reduce((s, x) => s + x, 0) / changes.length : null,
      coverageChange: row.indicators.targetFieldCoverage - rows[0].indicators.targetFieldCoverage,
      meaning: 'Sampled station/pose difference from baseline; not a derivative or uncertainty propagation.' };
  });
  return { version: COMPARISON_VERSION, selection: structuredClone(selection), levels: [...levels], rows, differences, sensitivity,
    comparable: differences.every(d => !d.fields.length), engineeringConstraints: 'not-evaluated-separate-input',
    limitations: ['Equal settings required for controlled physical comparisons; all unequal fields are disclosed.',
      'Shared single-site core; no automatic ranking or full scan optimizer is implemented.'] };
}
export function createPatternComparisonExport(entries, selection, levels) {
  const stored = entries.map(({ label, result, references = [] }) => {
    if (typeof label !== 'string' || !label) throw new Error('Comparison row label required');
    const snapshot = prepareProjectionPattern(result).snapshot;
    references.forEach(reference => { const checked = createPatternOverlay(reference);
      if (checked.snapshot.key !== snapshot.key || checked.semantic !== 'structural-reference'
        || checked.settings.scope !== 'finite-model-not-certified-physical' || checked.provenance.complete
        || checked.provenance.physicalScope !== 'unresolved' || checked.provenance.lineSources.length !== checked.lines.length
        || checked.provenance.lineSources.some(s => s.sourceEntityId !== null)) throw new Error('Reference/export snapshot mismatch'); });
    return structuredClone({ label, result, references, referencesStatus: references.length ? 'recorded-finite-model'
      : result.backend === 'legacy-dda@1.0.0' ? 'unsupported-backend' : 'unavailable-unresolved' });
  });
  const body = { schemaVersion: COMPARISON_VERSION, kind: 'projection-pattern-comparison', entries: stored,
    comparison: comparePatternResults(stored.map(e => e.result), selection, levels),
    warnings: ['Reference curves are finite-model, not certified physical envelopes; unknown entity ownership remains null.',
      'Stored raw results reproduce interpretation without rerunning rays; rerunning physics requires the pinned dataset/backend.',
      'Content digest is integrity, not authentication or independent physical validation.', 'Measured-muogram import/calibration is not implemented.'] };
  return { ...body, contentSha256: sha(body) };
}
export function replayPatternComparison(document) {
  const { contentSha256, ...body } = document;
  if (body.schemaVersion !== COMPARISON_VERSION || body.kind !== 'projection-pattern-comparison' || contentSha256 !== sha(body)) throw new Error('Unknown or altered comparison export');
  const replayed = createPatternComparisonExport(body.entries, body.comparison.selection, body.comparison.levels);
  if (encoded(replayed) !== encoded(document)) throw new Error('Comparison settings/indicators/curves disagree with stored raw results');
  return replayed;
}
