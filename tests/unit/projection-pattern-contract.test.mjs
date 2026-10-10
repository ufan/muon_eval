import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatternSnapshot, createPatternField, describePatternField, createPatternOverlay } from '../../dist/modules/projection-pattern-contract.js';

const inputs = { datasetRelease: 'synthetic@1', scenario: 'dry', geometryVersion: 'fixture@1', backendVersion: 'analytic@1', modelVersion: 'none',
  station: { origin: [0, 0, 0] }, pose: { azimuthDeg: 0, elevationDeg: 0 }, detector: { type: 'none' },
  environment: { water: 0 }, sampling: { bins: 2 }, response: { type: 'none' } };
const snapshot = createPatternSnapshot(inputs);
const fieldInput = { id: 'concrete-length', snapshot, quantity: 'material-path', material: 'concrete',
  grid: { kind: 'uniform-samples', sx: [-1, 1], sy: [1, -1] }, values: [1, 2, 3, 4], valid: [true, true, true, true],
  provenance: { source: 'synthetic', limitations: ['contract fixture, not geometry validation'] } };
const overlayInput = { id: 'reference', snapshot, semantic: 'structural-reference', source: { id: 'concrete-air', kind: 'interface', snapshotKey: snapshot.key },
  algorithm: { name: 'fixture', version: '1' }, settings: {}, tolerance: { value: 0, units: 'slope' }, state: 'ready',
  provenance: { complete: true, limitations: [] }, lines: [[[-0.5, 1], [0.5, -1]]] };

test('snapshot keys are order independent, input complete, and detached', () => {
  assert.equal(createPatternSnapshot(Object.fromEntries(Object.entries(inputs).reverse())).key, snapshot.key);
  for (const name of Object.keys(inputs)) {
    const changed = structuredClone(inputs);
    if (typeof changed[name] === 'string') changed[name] += '-changed'; else changed[name].revision = 2;
    assert.notEqual(createPatternSnapshot(changed).key, snapshot.key, name);
  }
  const changed = structuredClone(inputs), saved = createPatternSnapshot(changed);
  changed.station.origin[0] = 10; assert.equal(saved.inputs.station.origin[0], 0);
  assert.throws(() => createPatternSnapshot({ ...inputs, response: { value: NaN } }), /finite JSON/);
  assert.throws(() => createPatternSnapshot({ ...inputs, sampling: undefined }), /sampling/);
});

test('all-hit varying, constant, empty, partial, and invalid are different facts', () => {
  const describe = (values, valid = [true, true, true, true]) => describePatternField(createPatternField({ ...fieldInput, values, valid }));
  assert.equal(describe([1, 2, 3, 4]).coverage, 'all-hit');
  assert.equal(describe([1, 2, 3, 4]).variation, 'varying');
  assert.equal(describe([2, 2, 2, 2]).variation, 'constant');
  assert.equal(describe([0, 0, 0, 0]).coverage, 'none');
  assert.equal(describe([0, 1, 0, 1]).coverage, 'mixed');
  assert.equal(describe([1, null, 1, null], [true, false, true, false]).validity, 'partial');
  assert.deepEqual(describe([null, null, null, null], [false, false, false, false]),
    { validity: 'invalid', coverage: 'unknown', variation: 'unknown', validCount: 0, min: null, max: null });
  assert.throws(() => describe([1, 0, 1, 0], [true, false, true, false]), /mask/);
  assert.throws(() => describe([1, NaN, 1, 1]), /mask/);
});

test('actual nonuniform coordinates and detector bounds survive; malformed grids fail', () => {
  const grid = { kind: 'detector-aggregated', sx: [-0.8, 0.3], sy: [0.7, -0.2],
    sxBounds: [[-1, 0], [0, 0.5]], syBounds: [[0, 1], [-0.5, 0]] };
  const input = { ...fieldInput, grid }, field = createPatternField(input);
  assert.deepEqual(field.grid.sx, [-0.8, 0.3]); grid.sx[0] = -0.9; assert.equal(field.grid.sx[0], -0.8);
  for (const patch of [{ sy: [-1, 1] }, { sx: [1, 1] }, { sxBounds: undefined }, { sxBounds: [[-1, 0.4], [0, 0.5]] }]) {
    assert.throws(() => createPatternField({ ...fieldInput, grid: { ...grid, ...patch } }), /Invalid/);
  }
  assert.throws(() => createPatternField({ ...fieldInput, quantity: 'transmission', material: null, values: [0, 0.2, 1, 2] }), /range/);
});

test('overlay states, semantics and provenance are independent and stale identity fails', () => {
  for (const state of ['ready', 'absent', 'outside-field', 'clipped', 'invalid', 'unresolved']) {
    const overlay = createPatternOverlay({ ...overlayInput, state, lines: state === 'ready' || state === 'clipped' ? overlayInput.lines : [] });
    assert.equal(overlay.state, state); assert.equal(overlay.semantic, 'structural-reference');
  }
  for (const semantic of ['material-contribution', 'response-feature', 'depth-diagnostic']) assert.equal(createPatternOverlay({ ...overlayInput, semantic }).semantic, semantic);
  assert.throws(() => createPatternOverlay({ ...overlayInput, source: { ...overlayInput.source, snapshotKey: 'old' } }), /mismatch/);
  assert.throws(() => createPatternOverlay({ ...overlayInput, state: 'unresolved' }), /non-renderable/);
  assert.throws(() => createPatternOverlay({ ...overlayInput, snapshot: { ...snapshot, key: 'old' } }), /identity/);
  const overlay = createPatternOverlay(overlayInput); overlay.lines[0][0][0] = 99;
  assert.equal(overlayInput.lines[0][0][0], -0.5);
});
