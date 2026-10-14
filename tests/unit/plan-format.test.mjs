import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan, serializePlan, validatePlan, planFromState, stateFromPlan, planFromLegacyStorage, planHash, PLAN_SCHEMA_VERSION } from '../../dist/modules/plan-format.js';

// muography-plan 1.0.0 (docs/specs/PLAN_FORMAT.md, FR-P1, FR-P2).
const text = await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8');
const plan = () => JSON.parse(text);
const rejects = (mutate, pattern) => { const doc = plan(); mutate(doc); assert.throws(() => validatePlan(doc), pattern); };

test('load then save gives a byte-identical file', () => {
  assert.equal(PLAN_SCHEMA_VERSION, '1.0.0');
  assert.equal(serializePlan(parsePlan(text)), text);
  // Member order is canonical whatever the input order.
  const shuffled = JSON.stringify(Object.fromEntries(Object.entries(plan()).reverse()));
  assert.equal(serializePlan(parsePlan(shuffled)), text);
});

test('a plan converts to the app state and back without loss', () => {
  const state = stateFromPlan(parsePlan(text));
  assert.deepEqual(state.stations[1], { id: 'station-2', name: '新候选点 2', x: 80, y: 101.25, z: 55, az: 180, el: 35, candidateId: null });
  assert.equal(state.activeIndex, 1);
  assert.deepEqual(state.selected, ['north']);
  assert.deepEqual(state.settings, { width: 0.4096, height: 0.4096, stripPitch: 0.0016, strips: 256, spacing: 0.15,
    layerEfficiency: 0.95, deadLiveFraction: 0.98, angularResolutionDeg: 0.3, systematicFraction: 0.03, exposureDays: 30, angularModel: 'gaisser' });
  const back = planFromState({ title: 'Synthetic study', release: 'subject@1.0.0', scenario: 'low', model: 'test-telescope', ...state });
  assert.equal(serializePlan(back), text);
});

test('invalid plans fail closed with the offending member named', () => {
  rejects(d => { d.format = 'other'; }, /format/);
  rejects(d => { d.schemaVersion = '1.1.0'; }, /newer/);
  rejects(d => { d.schemaVersion = '2.0.0'; }, /newer/);
  rejects(d => { d.schemaVersion = 'one'; }, /schemaVersion/);
  rejects(d => { d.extra = 1; }, /Unknown member extra/);
  rejects(d => { d.stations[0].extra = 1; }, /Unknown member stations\[0\]\.extra/);
  rejects(d => { d.scene.contentHash = 'md5:1'; }, /contentHash/);
  rejects(d => { d.units.length = 'ft'; }, /units\.length/);
  rejects(d => { delete d.detectors.default; }, /default/);
  rejects(d => { d.detectors.default.device.strips = 2.5; }, /strips/);
  rejects(d => { d.detectors.default.response.systematicFraction = 0; }, /systematicFraction/);
  rejects(d => { d.detectors.default.response.angularModel = 'flat'; }, /angularModel/);
  rejects(d => { d.stations = []; }, /station/);
  rejects(d => { d.stations[1].id = 'north'; }, /Duplicate station/);
  rejects(d => { d.stations[0].id = 'bad id'; }, /id/);
  rejects(d => { d.stations[0].position = [1, 2]; }, /position/);
  rejects(d => { d.stations[0].position = [1, 2, Infinity]; }, /position/);
  rejects(d => { d.stations[0].pose.elevationDeg = -5; }, /elevationDeg/);
  rejects(d => { d.stations[0].pose.azimuthDeg = 360; }, /azimuthDeg/);
  rejects(d => { d.stations[0].detector = 'other'; }, /detector/);
  rejects(d => { d.deployment.active = 'nowhere'; }, /active/);
  rejects(d => { d.deployment.selected = ['north', 'north']; }, /selected/);
  rejects(d => { d.deployment.selected = ['ghost']; }, /selected/);
  rejects(d => { d.anomalies = [{}]; }, /anomalies/);
  assert.throws(() => parsePlan('{'), /JSON/);
});

test('stations and device settings stored before plans become a plan once', () => {
  const legacy = planFromLegacyStorage({
    release: 'subject@1.0.0', scenario: 'low', title: 'Synthetic study', model: 'test-telescope', candidateIds: ['north'],
    stations: [
      { id: 'north', name: '北侧点位', x: 12.5, y: 122, z: 57, az: 0, el: 25, hostEntityId: 'gallery', binding: false },
      { id: 'north', name: '新候选点 2', x: 80, y: 101.25, z: 55, az: 180, el: 35 }
    ],
    settings: { width: 0.4096, height: 0.4096, stripPitch: 0.0016, strips: 256, spacing: 0.15, layerEfficiency: 0.95,
      deadLiveFraction: 0.98, angularResolutionDeg: 0.3, systematicFraction: 0.03, exposureDays: 30, angularModel: 'gaisser' }
  });
  // Copies of a candidate got the candidate's ID; they are renumbered, and only the original keeps the candidate link.
  assert.deepEqual(legacy.stations.map(s => [s.id, s.candidateId]), [['north', 'north'], ['station-2', null]]);
  assert.deepEqual(legacy.deployment, { selected: [], active: 'north' });
  validatePlan(legacy);
});

test('the plan hash identifies the canonical text', async () => {
  const hash = await planHash(parsePlan(text));
  assert.match(hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(await planHash(parsePlan(serializePlan(parsePlan(text)))), hash);
  const changed = plan(); changed.title = 'Other';
  assert.notEqual(await planHash(parsePlan(JSON.stringify(changed))), hash);
});
