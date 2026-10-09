// Pure, additive contracts. Existing projection/export formats are not migrated.
export const PATTERN_SCHEMA_VERSION = '1.0.0';
const fail = message => { throw new Error(`Invalid projection pattern: ${message}`); };
const requiredText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) fail(name);
};

// Deterministic full-input identity, not a cryptographic digest. Reject lossy JSON.
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  fail('snapshot/settings must be finite JSON data');
}

export function createPatternSnapshot(inputs) {
  for (const name of ['datasetRelease', 'scenario', 'geometryVersion', 'backendVersion', 'modelVersion']) requiredText(inputs[name], name);
  for (const name of ['station', 'pose', 'detector', 'environment', 'sampling', 'response']) {
    if (!inputs[name] || Object.getPrototypeOf(inputs[name]) !== Object.prototype) fail(name);
  }
  const key = canonical(inputs);
  return { schemaVersion: PATTERN_SCHEMA_VERSION, key, inputs: JSON.parse(key) };
}

function checkSnapshot(snapshot) {
  if (snapshot?.schemaVersion !== PATTERN_SCHEMA_VERSION || createPatternSnapshot(snapshot.inputs).key !== snapshot.key) fail('snapshot identity');
}

const quantities = { 'material-path': 'm', 'material-column': 'm.w.e.', transmission: '1', 'expected-count': 'events' };
export function createPatternField({ id, snapshot, quantity, material = null, representation = 'raw', grid, values, valid, provenance }) {
  requiredText(id, 'field id'); checkSnapshot(snapshot);
  if (!Object.hasOwn(quantities, quantity)) fail('quantity');
  if (quantity.startsWith('material-')) requiredText(material, 'material');
  else if (material !== null) fail('response field material attribution');
  if (!['raw', 'display-smoothed'].includes(representation)) fail('representation');
  if (!provenance || !Array.isArray(provenance.limitations)) fail('field provenance');
  requiredText(provenance.source, 'field source');
  if (!grid || !['uniform-samples', 'detector-aggregated'].includes(grid.kind)) fail('grid kind');
  // Canonical contract order: x increases, rows run from +sy to -sy.
  for (const [axis, sign] of [['sx', 1], ['sy', -1]]) {
    const coordinates = grid[axis];
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(Number.isFinite)
      || coordinates.some((v, i) => i && sign * (v - coordinates[i - 1]) <= 0)) fail(`${axis} order`);
  }
  if (grid.kind === 'detector-aggregated') {
    for (const [axis, boundsName] of [['sx', 'sxBounds'], ['sy', 'syBounds']]) {
      const bounds = grid[boundsName];
      if (!Array.isArray(bounds) || bounds.length !== grid[axis].length) fail(boundsName);
      bounds.forEach((pair, i) => {
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite)
          || pair[0] >= pair[1] || grid[axis][i] < pair[0] || grid[axis][i] > pair[1]) fail(boundsName);
        if (i && (axis === 'sx' ? bounds[i - 1][1] > pair[0] : pair[1] > bounds[i - 1][0])) fail('overlapping bin bounds');
      });
    }
  }
  const size = grid.sx.length * grid.sy.length;
  if (!Array.isArray(values) || !Array.isArray(valid) || values.length !== size || valid.length !== size) fail('field shape');
  values.forEach((v, i) => {
    if (typeof valid[i] !== 'boolean' || (valid[i] ? !Number.isFinite(v) || v < 0 : v !== null)) fail('valid mask/value');
    if (valid[i] && quantity === 'transmission' && v > 1) fail('transmission range');
  });
  return structuredClone({ schemaVersion: PATTERN_SCHEMA_VERSION, id, snapshot, quantity, units: quantities[quantity], material,
    representation, grid: { ...grid, axisOrder: 'sx-increasing/sy-decreasing', coordinates: 'detector-local-slopes', units: '1' }, values, valid, provenance });
}

// Coverage and variation are orthogonal: all-hit can still vary substantially.
export function describePatternField(field) {
  let count = 0, positive = 0, min = Infinity, max = -Infinity;
  field.values.forEach((v, i) => {
    if (field.valid[i]) { count++; positive += v > 0 ? 1 : 0; min = Math.min(min, v); max = Math.max(max, v); }
  });
  return { validity: count === 0 ? 'invalid' : count === field.values.length ? 'complete' : 'partial',
    coverage: count === 0 ? 'unknown' : positive === 0 ? 'none' : positive === count ? 'all-hit' : 'mixed',
    variation: count === 0 ? 'unknown' : min === max ? 'constant' : 'varying',
    validCount: count, min: count ? min : null, max: count ? max : null };
}

export function createPatternOverlay({ id, snapshot, semantic, source, algorithm, settings, tolerance, state, provenance, lines = [] }) {
  requiredText(id, 'overlay id'); checkSnapshot(snapshot);
  if (!['material-contribution', 'structural-reference', 'response-feature', 'depth-diagnostic'].includes(semantic)) fail('overlay semantic');
  if (!['ready', 'absent', 'outside-field', 'clipped', 'invalid', 'unresolved'].includes(state)) fail('overlay state');
  if (source?.snapshotKey !== snapshot.key) fail('overlay/source snapshot mismatch');
  requiredText(source?.id, 'overlay source');
  requiredText(source?.kind, 'source kind');
  requiredText(algorithm?.name, 'algorithm name'); requiredText(algorithm?.version, 'algorithm version');
  if (!settings || Object.getPrototypeOf(settings) !== Object.prototype) fail('settings');
  canonical(settings);
  if (!Number.isFinite(tolerance?.value) || tolerance.value < 0) fail('tolerance');
  requiredText(tolerance?.units, 'tolerance units');
  if (!provenance || !Array.isArray(provenance.limitations) || typeof provenance.complete !== 'boolean') fail('overlay provenance');
  if (!Array.isArray(lines) || lines.some(line => !Array.isArray(line) || line.length < 2
    || line.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))) fail('slope polylines');
  if (['absent', 'outside-field', 'invalid', 'unresolved'].includes(state) && lines.length) fail('non-renderable state');
  return structuredClone({ schemaVersion: PATTERN_SCHEMA_VERSION, id, snapshot, semantic, source, algorithm, settings, tolerance, state, provenance, lines });
}
