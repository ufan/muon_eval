import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPatternSnapshot, createPatternField } from '../dist/modules/projection-pattern-contract.js';
import { extractContributionContours } from '../dist/modules/contribution-contours.js';
import { benchmarkGrid, sampleField } from '../scripts/contour-benchmark-core.mjs';

const snapshot = createPatternSnapshot({ datasetRelease: 'synthetic@1', scenario: 'dry', geometryVersion: 'fixture@1',
  backendVersion: 'analytic@1', modelVersion: 'none', station: { origin: [0, 0, 0] }, pose: { azimuthDeg: 0, elevationDeg: 0 },
  detector: { type: 'none' }, environment: {}, sampling: { type: 'fixture' }, response: { type: 'none' } });
function field(grid = benchmarkGrid('material', 25), fn = x => 4 + x, patch = {}) {
  const values = sampleField(grid, fn);
  return createPatternField({ id: 'alloy-column', snapshot, quantity: 'material-column', material: 'arbitrary-alloy',
    grid, values, valid: values.map(v => v !== null), provenance: { source: 'analytic', limitations: [] }, ...patch });
}
const physical = levels => ({ mode: 'physical', units: 'm.w.e.', levels });
const points = result => result.overlays.flatMap(o => o.lines.flat());

test('physical contribution levels use actual centers on both grids without changing the field', () => {
  for (const kind of ['material', 'detector']) {
    const input = field(benchmarkGrid(kind, 65)), saved = structuredClone(input);
    const result = extractContributionContours(input, physical([4.123]));
    assert.deepEqual(input, saved); assert.ok(points(result).length > 20);
    assert.ok(points(result).every(([x]) => Math.abs(x - 0.123) < 1e-12));
    const overlay = result.overlays[0];
    assert.equal(result.description.coverage, 'all-hit');
    assert.equal(overlay.semantic, 'material-contribution'); assert.equal(overlay.state, 'clipped');
    assert.equal(overlay.provenance.complete, false);
    assert.equal(overlay.settings.material, 'arbitrary-alloy'); assert.equal(overlay.settings.units, 'm.w.e.');
    assert.equal(overlay.source.snapshotKey, snapshot.key); assert.equal(overlay.algorithm.version, '4.0.2');
    result.snapshot.inputs.station.origin[0] = 99; assert.equal(input.snapshot.inputs.station.origin[0], 0);
  }
});

test('adaptive levels are explicit inspection fractions, independent of colour and physical levels', () => {
  const input = field(), result = extractContributionContours(input, { mode: 'adaptive' });
  const { min, max } = result.description;
  assert.deepEqual(result.levelPolicy.levels, [0.25, 0.5, 0.75].map(f => (1 - f) * min + f * max));
  assert.match(result.levelPolicy.label, /not comparable/);
  assert.ok(result.overlays.every(o => o.provenance.limitations.some(l => l.includes('Adaptive inspection'))));
  const changed = field(undefined, x => 40 + 10 * x);
  assert.notDeepEqual(extractContributionContours(changed, { mode: 'adaptive' }).levelPolicy.levels, result.levelPolicy.levels);
  assert.deepEqual(extractContributionContours(changed, physical([4])).levelPolicy.levels, [4]);
  const path = field(undefined, x => 4 + x, { quantity: 'material-path' });
  assert.equal(extractContributionContours(path, { mode: 'physical', units: 'm', levels: [4] }).overlays[0].settings.units, 'm');
});

test('constant, invalid, outside-range and unsupported domains never manufacture boundaries', () => {
  const constant = extractContributionContours(field(undefined, () => 2), physical([1, 2, 3]));
  assert.ok(constant.overlays.every(o => o.state === 'absent' && !o.lines.length));
  const invalid = extractContributionContours(field(undefined, () => null), physical([1]));
  assert.equal(invalid.overlays[0].state, 'invalid'); assert.equal(invalid.overlays[0].provenance.complete, false);
  assert.equal(extractContributionContours(field(undefined, () => null), { mode: 'adaptive' }).description.validity, 'invalid');
  const input = field(), { min, max } = extractContributionContours(input, { mode: 'adaptive' }).description;
  assert.ok(extractContributionContours(input, physical([min, max])).overlays.every(o => o.state === 'absent'));
  const missing = field(undefined, x => Math.abs(x) < 0.07 ? null : 4 + x);
  assert.equal(extractContributionContours(missing, physical([4])).overlays[0].state, 'unresolved');
  const supported = extractContributionContours(missing, physical([3.8]));
  assert.equal(supported.overlays[0].state, 'clipped'); assert.ok(points(supported).length);
  assert.ok(points(supported).every(([x]) => Math.abs(x + 0.2) < 1e-12));
  const hole = field(undefined, (x, y) => Math.abs(x) < 0.01 && Math.abs(y) < 0.01 ? null : 2);
  const partial = extractContributionContours(hole, physical([1]));
  assert.equal(partial.overlays[0].state, 'unresolved'); assert.equal(points(partial).length, 0);
});

test('smooth closed circles retain sampled holes and meet the A5 bin-relative limit', () => {
  for (const kind of ['material', 'detector']) {
    let previous = Infinity;
    for (const n of [25, 65, 129]) {
      const grid = benchmarkGrid(kind, n), input = field(grid, (x, y) => x * x + y * y);
      const result = extractContributionContours(input, physical([0.16]));
      const pts = points(result), error = Math.max(...pts.map(([x, y]) => Math.abs(Math.hypot(x, y) - 0.4)));
      const gap = Math.max(...[grid.sx, grid.sy].flatMap(axis => axis.slice(1).map((v, i) => Math.abs(v - axis[i]))));
      assert.ok(error <= gap * 0.05); assert.ok(error < previous); previous = error;
      assert.equal(result.overlays[0].state, 'ready'); assert.equal(result.overlays[0].provenance.complete, true);
      assert.ok(pts.every(([x, y]) => Math.abs(x) <= 0.400001 && Math.abs(y) <= 0.400001));
    }
  }
});

test('ambiguous saddles disclose pinned topology without claiming complete physical curves', () => {
  const grid = { kind: 'uniform-samples', sx: [-1, 1], sy: [1, -1] };
  const input = field(grid, () => 0, { values: [100, 0, 0, 100], valid: [true, true, true, true] });
  const overlay = extractContributionContours(input, physical([1])).overlays[0];
  assert.equal(overlay.provenance.ambiguousCells, 1); assert.equal(overlay.provenance.topology, 'ambiguous');
  assert.equal(overlay.provenance.complete, false); assert.match(overlay.provenance.limitations.at(-1), /saddle/);
});

test('bad levels, units, stale identities and non-raw material fields fail closed; module remains offline/pure', async () => {
  const input = field();
  for (const options of [undefined, {}, physical([]), physical([4, 3]), physical([4, 4]), physical([NaN]), physical([-1]),
    { ...physical([4]), units: 'm' }, { mode: 'adaptive', fractions: [0, 1] }, { mode: 'adaptive', fractions: [0.5, 0.25] }]) {
    assert.throws(() => extractContributionContours(input, options));
  }
  for (const patch of [{ representation: 'display-smoothed' }, { units: 'm' }, { snapshot: { ...snapshot, key: 'stale' } },
    { quantity: 'expected-count', material: null }]) {
    assert.throws(() => extractContributionContours({ ...input, ...patch }, physical([4])));
  }
  const source = await readFile(new URL('../dist/modules/contribution-contours.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(document|window|THREE)\b|from ['"]https?:|from ['"].*scripts\//);
  assert.deepEqual(JSON.parse(JSON.stringify(extractContributionContours(input, physical([4])))), extractContributionContours(input, physical([4])));
});
