// Pure sampled contour extraction; D3 owns marching squares. Promoted from A3.
import contours from '../vendor/d3-contour/contours.js';
import { createPatternField, describePatternField, createPatternOverlay } from './projection-pattern-contract.js';

export function slopeCoordinate(axis, value) {
  const u = value - 0.5;
  if (u < -1e-10 || u > axis.length - 1 + 1e-10) throw new Error('Coordinate outside sampled hull');
  const at = Math.max(0, Math.min(axis.length - 1, u)), low = Math.min(axis.length - 2, Math.floor(at));
  return axis[low] + (at - low) * (axis[low + 1] - axis[low]);
}
export function extractSampledContours(grid, values, levels, valid = values.map(v => v !== null && Number.isFinite(v))) {
  const width = grid.sx.length, height = grid.sy.length;
  if (values.length !== width * height || valid.length !== values.length || !levels.every(Number.isFinite)) throw new Error('Invalid benchmark field');
  const finite = values.filter((v, i) => valid[i]);
  if (finite.some(v => !Number.isFinite(v))) throw new Error('Invalid valid sample');
  let min = Infinity, max = -Infinity;
  for (const v of finite) { min = Math.min(min, v); max = Math.max(max, v); }
  if (!finite.length || min === max) return { status: !finite.length ? 'invalid' : 'constant', levels: [], rejected: 0 };
  const generator = contours().size([width, height]).smooth(true);
  const supplied = values.map((v, i) => valid[i] ? v : NaN);
  let rejected = 0;
  const result = levels.map(level => {
    if (level <= min || level >= max) return { level, status: 'outside-range', lines: [], polygons: 0, holes: 0 };
    const polygon = generator.contour(supplied, level), lines = [];
    function supported(a, b) {
      if ([a, b].some(([x, y]) => x < 0.5 || x > width - 0.5 || y < 0.5 || y > height - 0.5)) return false;
      const x = (a[0] + b[0]) / 2 - 0.5, y = (a[1] + b[1]) / 2 - 0.5;
      // Conservatively require all corners of every incident cell to be valid.
      const incident = (u, size) => [...new Set([Math.floor(u - 1e-10), Math.floor(u + 1e-10)])].filter(i => i >= 0 && i < size - 1);
      return incident(x, width).every(ix => incident(y, height).every(iy =>
        [iy * width + ix, iy * width + ix + 1, (iy + 1) * width + ix, (iy + 1) * width + ix + 1].every(i => valid[i])));
    }
    for (const rings of polygon.coordinates) for (const ring of rings) {
      let current = [];
      const flush = () => { if (current.length > 1) lines.push(current); current = []; };
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        if (!supported(a, b)) { rejected++; flush(); continue; }
        const map = ([x, y]) => [slopeCoordinate(grid.sx, x), slopeCoordinate(grid.sy, y)];
        if (!current.length) current.push(map(a)); current.push(map(b));
      }
      flush();
    }
    return { level, status: 'sampled', lines, polygons: polygon.coordinates.length,
      holes: polygon.coordinates.reduce((sum, rings) => sum + rings.length - 1, 0) };
  });
  return { status: finite.length === values.length ? 'complete' : 'partial', levels: result, rejected };
}

// Scientific entry point. Fields are revalidated/detached because contracts are
// plain JSON data and callers may have changed them since construction.
export function extractContributionContours(input, options) {
  return extractNumericalContours(input, options, 'material-contribution');
}

export function extractResponseContours(input, options) {
  return extractNumericalContours(input, options, 'response-feature');
}

function extractNumericalContours(input, options, semantic) {
  const field = createPatternField(input);
  if (input.schemaVersion !== field.schemaVersion || input.units !== field.units
    || !(semantic === 'material-contribution' ? ['material-path', 'material-column'] : ['transmission', 'expected-count']).includes(field.quantity)
    || (semantic === 'material-contribution' && field.representation !== 'raw')) throw new Error('Invalid numerical contour field');
  if (!options || !['physical', 'adaptive'].includes(options.mode)) throw new Error('Explicit contour level mode required');
  const description = describePatternField(field);
  const ordered = (values, predicate) => Array.isArray(values) && values.length > 0 && values.length <= 16
    && values.every((v, i) => Number.isFinite(v) && predicate(v) && (!i || v > values[i - 1]));
  let levels, policy;
  if (options.mode === 'physical') {
    if (options.units !== field.units || !ordered(options.levels, v => v >= 0)) throw new Error('Invalid physical levels or units');
    levels = [...options.levels];
    policy = { mode: 'physical', units: field.units, levels, label: semantic === 'material-contribution' ? 'Explicit physical contribution levels' : 'Explicit numerical response levels' };
  } else {
    const fractions = options.fractions ?? [0.25, 0.5, 0.75];
    if (!ordered(fractions, v => v > 0 && v < 1)) throw new Error('Invalid adaptive fractions');
    levels = description.validity === 'invalid' ? [] : fractions.map(f => (1 - f) * description.min + f * description.max);
    policy = { mode: 'adaptive', units: field.units, fractions: [...fractions], levels,
      range: [description.min, description.max], label: 'Adaptive inspection levels (not comparable across views)' };
  }
  const extracted = extractSampledContours(field.grid, field.values, levels, field.valid);
  const width = field.grid.sx.length, height = field.grid.sy.length;
  const onHull = ([x, y]) => x === field.grid.sx[0] || x === field.grid.sx.at(-1)
    || y === field.grid.sy[0] || y === field.grid.sy.at(-1);
  const overlays = levels.map((level, index) => {
    const layer = extracted.levels[index];
    const lines = layer?.lines ?? [];
    let ambiguousCells = 0;
    for (let row = 0; row < height - 1; row++) for (let col = 0; col < width - 1; col++) {
      const ids = [row * width + col, row * width + col + 1, (row + 1) * width + col + 1, (row + 1) * width + col];
      if (!ids.every(i => field.valid[i])) continue;
      const high = ids.map(i => field.values[i] >= level);
      if (high[0] === high[2] && high[1] === high[3] && high[0] !== high[1]) ambiguousCells++;
    }
    const open = lines.some(line => {
      const a = line[0], b = line.at(-1);
      return a[0] !== b[0] || a[1] !== b[1];
    });
    const fieldEdge = lines.some(line => onHull(line[0]) || onHull(line.at(-1)));
    const partial = description.validity === 'partial';
    let state, reason;
    if (description.validity === 'invalid') { state = 'invalid'; reason = 'no-valid-samples'; }
    else if (description.variation === 'constant') { state = partial ? 'unresolved' : 'absent'; reason = 'constant-valid-region'; }
    else if (layer?.status === 'outside-range') { state = partial ? 'unresolved' : 'absent'; reason = 'level-not-strictly-inside-sampled-range'; }
    else if (!lines.length) { state = 'unresolved'; reason = 'no-supported-segments'; }
    else { state = partial || open || fieldEdge ? 'clipped' : 'ready'; reason = 'sampled-isoline'; }
    const limitations = [...field.provenance.limitations,
      semantic === 'material-contribution' ? 'Sampled contribution isoline, not a geometric air boundary or detectability claim.' : 'Numerical response isoline; count transitions include acceptance and open-sky flux, not just material.',
      'No extrapolation beyond sample centers; no mask borders or padded frame closures.',
      'Zero tolerance denotes exact constant/range tests, not geometric precision.'];
    if (policy.mode === 'adaptive') limitations.push(policy.label);
    if (partial) limitations.push('Incomplete valid sample domain; unsupported portions omitted.');
    if (open || fieldEdge) limitations.push('Open or sample-hull-limited line fragments; full curve extent not established.');
    if (ambiguousCells) limitations.push('D3 fixed saddle connectivity; physical topology unresolved.');
    return createPatternOverlay({ id: `${field.id}:${semantic === 'material-contribution' ? 'contribution' : 'response'}:${index}`, snapshot: field.snapshot,
      semantic, source: { id: field.id, kind: 'numerical-field', snapshotKey: field.snapshot.key },
      algorithm: { name: 'd3-contour', version: '4.0.2', adapterVersion: '1.0.0' },
      settings: { level, units: field.units, quantity: field.quantity, material: field.material, representation: field.representation,
        levelPolicy: policy, interpolation: 'linear/actual-slope-centers', invalidPolicy: 'all-incident-cell-corners-valid',
        paddingPolicy: 'sample-center-hull-only' },
      tolerance: { value: 0, units: field.units }, state,
      provenance: { complete: !partial && !open && !fieldEdge && !ambiguousCells && state !== 'unresolved' && state !== 'invalid',
        limitations, reason, ambiguousCells, topology: ambiguousCells ? 'ambiguous' : 'sampled-not-qualified',
        fieldDescription: description }, lines });
  });
  return { schemaVersion: field.schemaVersion, snapshot: field.snapshot, fieldId: field.id,
    description, levelPolicy: policy, overlays, diagnostics: { rejectedSegments: extracted.rejected } };
}
