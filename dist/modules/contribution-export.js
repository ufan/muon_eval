// @ts-check
import { createPatternSnapshot, createPatternField } from './projection-pattern-contract.js';
import { prepareProjectionPattern, materialFieldFromProjection } from './projection-pattern-fields.js';
import { extractContributionContours } from './contribution-contours.js';

export const CONTRIBUTION_EXPORT_VERSION = '1.0.0';
const kind = 'material-contribution-pattern-export';
const fail = message => { throw new Error(`Invalid contribution export: ${message}`); };
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  fail('finite JSON required');
}
function checkSelection(selection, snapshot) {
  if (!selection || !['material-path', 'material-column'].includes(selection.quantity)
    || !Array.isArray(selection.materials) || new Set(selection.materials).size !== selection.materials.length
    || selection.materials.some(id => typeof id !== 'string' || !Object.hasOwn(snapshot.inputs.environment.geometry.materials, id))) fail('material selection');
  // Validate even an empty selection; no invalid levels are silently saved.
  const probe = createPatternField({ id: 'level-policy-validation', snapshot, quantity: selection.quantity, material: 'validation',
    grid: snapshot.inputs.sampling.grid, values: Array(snapshot.inputs.sampling.grid.sx.length * snapshot.inputs.sampling.grid.sy.length).fill(0),
    valid: Array(snapshot.inputs.sampling.grid.sx.length * snapshot.inputs.sampling.grid.sy.length).fill(true), provenance: { source: 'level-validation', limitations: [] } });
  const policy = extractContributionContours(probe, selection.levelOptions).levelPolicy;
  return policy.mode === 'adaptive' ? { mode: 'adaptive', fractions: policy.fractions }
    : { mode: 'physical', units: policy.units, levels: policy.levels };
}

export function createContributionExport(result, selection, display = { visible: true, colors: {}, strokeWidthCss: 1.5, haloWidthCss: 3.5, raster: {} }) {
  const { snapshot } = prepareProjectionPattern(result);
  const levelOptions = checkSelection(selection, snapshot);
  const entries = selection.materials.map(material => {
    const field = materialFieldFromProjection(result, material, selection.quantity);
    return { field, contours: extractContributionContours(field, levelOptions) };
  });
  const document = { schemaVersion: CONTRIBUTION_EXPORT_VERSION, kind,
    generator: { name: 'compiled-preview-contribution-export', version: '1.0.0' }, graphKind: result.kind, snapshot,
    selection: { quantity: selection.quantity, materials: [...selection.materials], levelOptions }, entries, display };
  validateDisplay(display); canonical(document);
  return structuredClone(document);
}

function validateDisplay(display) {
  if (!display || typeof display.visible !== 'boolean' || !display.colors || Object.getPrototypeOf(display.colors) !== Object.prototype
    || Object.values(display.colors).some(color => typeof color !== 'string')
    || ![display.strokeWidthCss, display.haloWidthCss].every(v => Number.isFinite(v) && v > 0)
    || !display.raster || Object.getPrototypeOf(display.raster) !== Object.prototype) fail('display metadata');
}

// Reject unknown formats rather than interpreting old raw exports as contours.
// Replay checks numerical consistency, not authenticity of a dataset or file.
export function replayContributionExport(document) {
  if (document?.schemaVersion !== CONTRIBUTION_EXPORT_VERSION || document.kind !== kind
    || document.generator?.name !== 'compiled-preview-contribution-export' || document.generator.version !== '1.0.0'
    || !['material-column-projection', 'compiled-detector-assessment'].includes(document.graphKind)) fail('unsupported version/kind');
  canonical(document); validateDisplay(document.display);
  const snapshot = createPatternSnapshot(document.snapshot.inputs);
  if (document.snapshot.schemaVersion !== snapshot.schemaVersion || document.snapshot.key !== snapshot.key) fail('snapshot identity');
  if (snapshot.inputs.sampling.grid.kind !== (document.graphKind === 'compiled-detector-assessment' ? 'detector-aggregated' : 'uniform-samples')) fail('graph/grid mismatch');
  const levelOptions = checkSelection(document.selection, snapshot);
  if (canonical(levelOptions) !== canonical(document.selection.levelOptions)) fail('level policy must be explicit');
  if (!Array.isArray(document.entries) || document.entries.length !== document.selection.materials.length) fail('entry count');
  const replayed = document.entries.map((entry, index) => {
    const field = createPatternField(entry.field);
    if (entry.field.schemaVersion !== field.schemaVersion || entry.field.units !== field.units
      || field.snapshot.key !== snapshot.key || field.quantity !== document.selection.quantity
      || field.material !== document.selection.materials[index] || field.representation !== 'raw'
      || field.provenance.source !== document.graphKind
      || canonical(field.grid) !== canonical({ ...snapshot.inputs.sampling.grid, axisOrder: 'sx-increasing/sy-decreasing', coordinates: 'detector-local-slopes', units: '1' })) fail('entry field/source mismatch');
    const contours = extractContributionContours(field, levelOptions);
    if (canonical(contours) !== canonical(entry.contours)) fail('saved contours do not reproduce');
    return { field, contours };
  });
  return { snapshot, entries: replayed };
}
