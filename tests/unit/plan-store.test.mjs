import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStoredPlan, storePlan, planStorageKey } from '../../dist/modules/plan-store.js';
import { parsePlan } from '../../dist/modules/plan-format.js';

// One plan per release in browser storage (docs/specs/PLAN_FORMAT.md).
const memory = (entries = {}) => { const map = new Map(Object.entries(entries)); return {
  getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map }; };
const settings = { width: .4096, height: .4096, stripPitch: .0016, strips: 256, spacing: .15, layerEfficiency: .95,
  deadLiveFraction: .98, angularResolutionDeg: .3, systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' };
const context = (storage, extra = {}) => ({ storage, release: 'subject@1', scenario: 'low', model: 'test', candidateIds: ['a', 'b'],
  defaultStations: [{ id: 'a', name: 'A', x: 1, y: 2, z: 3, az: 0, el: 25, candidateId: 'a' }, { id: 'b', name: 'B', x: 4, y: 5, z: 6, az: 0, el: 25, candidateId: 'b' }],
  defaultSettings: settings, ...extra });

test('without stored data the plan starts from the dataset candidates and is not written yet', () => {
  const storage = memory(), { plan, source } = loadStoredPlan(context(storage));
  assert.equal(source, 'default');
  assert.deepEqual(plan.stations.map(s => [s.id, s.candidateId]), [['a', 'a'], ['b', 'b']]);
  assert.equal(plan.scene.release, 'subject@1'); assert.equal(plan.scene.scenario, 'low');
  assert.equal(storage.map.size, 0);
});

test('a stored plan is loaded and follows the scenario chosen in the app', () => {
  const storage = memory(), first = loadStoredPlan(context(storage)).plan;
  first.title = 'kept'; first.stations[1].pose.elevationDeg = 40; storePlan(storage, first);
  const { plan, source } = loadStoredPlan(context(storage, { scenario: 'high' }));
  assert.equal(source, 'stored'); assert.equal(plan.title, 'kept'); assert.equal(plan.stations[1].pose.elevationDeg, 40);
  assert.equal(plan.scene.scenario, 'high');
  assert.equal(planStorageKey('subject@1'), 'muon-plan:subject@1');
  assert.doesNotThrow(() => parsePlan(storage.getItem('muon-plan:subject@1')));
});

test('pre-plan storage is converted once; the release station list is removed, the global device record kept', () => {
  const legacyStations = [{ id: 'a', name: 'A', x: 1, y: 2, z: 3, az: 10, el: 30 }, { id: 'a', name: 'copy', x: 7, y: 8, z: 9, az: 0, el: 25 }];
  const storage = memory({ 'muon-candidates:subject@1': JSON.stringify(legacyStations), 'muon-device-settings-v1': JSON.stringify({ ...settings, exposureDays: 60 }) });
  const { plan, source } = loadStoredPlan(context(storage));
  assert.equal(source, 'migrated');
  assert.deepEqual(plan.stations.map(s => [s.id, s.candidateId, s.pose.azimuthDeg]), [['a', 'a', 10], ['station-2', null, 0]]);
  assert.equal(plan.detectors.default.response.exposureDays, 60);
  assert.equal(storage.getItem('muon-candidates:subject@1'), null);
  assert.notEqual(storage.getItem('muon-device-settings-v1'), null);
  assert.equal(loadStoredPlan(context(storage)).source, 'stored');
});

test('the global device record from before plans seeds new plans; unreadable storage falls back to defaults', () => {
  const seeded = loadStoredPlan(context(memory({ 'muon-device-settings-v1': JSON.stringify({ ...settings, exposureDays: 90 }) })));
  assert.equal(seeded.plan.detectors.default.response.exposureDays, 90);
  const broken = loadStoredPlan(context(memory({ 'muon-plan:subject@1': '{"format":"muography-plan"' })));
  assert.equal(broken.source, 'default'); assert.match(broken.warning, /plan/);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  assert.equal(loadStoredPlan(context(throwing)).source, 'default');
  assert.doesNotThrow(() => storePlan(throwing, seeded.plan));
});
