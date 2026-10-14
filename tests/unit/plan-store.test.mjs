import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openStudies, saveStudy, saveSession, createStudy, switchStudy, deleteStudy, listStudies, studyIndexKey, studyPlanKey, studySessionKey } from '../../dist/modules/plan-store.js';
import { parsePlan, serializePlan } from '../../dist/modules/plan-format.js';

// Several studies per release in browser storage (docs/specs/PLAN_FORMAT.md, FR-P8).
const memory = (entries = {}) => { const map = new Map(Object.entries(entries)); return {
  getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map }; };
const settings = { width: .4096, height: .4096, stripPitch: .0016, strips: 256, spacing: .15, layerEfficiency: .95,
  deadLiveFraction: .98, angularResolutionDeg: .3, systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' };
const release = 'subject@1';
const context = (storage, extra = {}) => ({ storage, release, scenario: 'low', model: 'test', candidateIds: ['a', 'b'],
  defaultStations: [{ id: 'a', name: 'A', x: 1, y: 2, z: 3, az: 0, el: 25, candidateId: 'a' }, { id: 'b', name: 'B', x: 4, y: 5, z: 6, az: 0, el: 25, candidateId: 'b' }],
  defaultSettings: settings, ...extra });
const plan10 = await readFile(new URL('../fixtures/plans/plan-1.0.json', import.meta.url), 'utf8');

test('without stored data a first study starts from the dataset candidates and is not written yet', () => {
  const storage = memory(), opened = openStudies(context(storage));
  assert.equal(opened.source, 'default'); assert.equal(opened.active, 'study-1');
  assert.deepEqual(opened.studies, [{ id: 'study-1', title: '' }]);
  assert.deepEqual(opened.plan.stations.map(s => [s.id, s.candidateId]), [['a', 'a'], ['b', 'b']]);
  assert.deepEqual(opened.plan.deployments, []);
  assert.deepEqual(opened.session, { activeStation: 'a' });
  assert.equal(storage.map.size, 0);
});

test('a saved study is reopened with its session and follows the scenario chosen in the app', () => {
  const storage = memory(), first = openStudies(context(storage));
  const plan = { ...first.plan, title: 'kept', deployments: [{ id: 'two', name: 'Two', stations: ['b', 'a'] }] };
  assert.equal(saveStudy(storage, release, first.active, plan, { activeStation: 'b' }), true);
  const again = openStudies(context(storage, { scenario: 'high' }));
  assert.equal(again.source, 'stored'); assert.equal(again.plan.title, 'kept'); assert.equal(again.plan.scene.scenario, 'high');
  assert.deepEqual(again.plan.deployments, plan.deployments); assert.deepEqual(again.session, { activeStation: 'b' });
  assert.deepEqual(JSON.parse(storage.getItem(studyIndexKey(release))), { version: 1, active: 'study-1', studies: ['study-1'] });
  assert.doesNotThrow(() => parsePlan(storage.getItem(studyPlanKey(release, 'study-1'))));
  // The working station and compare flags are kept next to the plan.
  saveSession(storage, release, 'study-1', { activeStation: 'a', working: { name: 'w', x: 1 }, compare: ['b'] });
  assert.deepEqual(openStudies(context(storage)).session, { activeStation: 'a', working: { name: 'w', x: 1 }, compare: ['b'] });
  // A session naming a station that no longer exists falls back to the first station.
  saveSession(storage, release, 'study-1', { activeStation: 'ghost' });
  assert.deepEqual(openStudies(context(storage)).session, { activeStation: 'a' });
});

test('studies are created, listed, switched and deleted per release', () => {
  const storage = memory(), first = openStudies(context(storage));
  saveStudy(storage, release, first.active, { ...first.plan, title: 'First' });
  const id = createStudy(storage, release, { ...first.plan, title: 'Second', stations: first.plan.stations.slice(1) });
  assert.equal(id, 'study-2');
  assert.deepEqual(listStudies(storage, release), [{ id: 'study-1', title: 'First' }, { id: 'study-2', title: 'Second' }]);
  assert.equal(openStudies(context(storage)).plan.title, 'Second');
  const back = switchStudy(storage, release, 'study-1');
  assert.equal(back.plan.title, 'First'); assert.equal(openStudies(context(storage)).active, 'study-1');
  assert.throws(() => switchStudy(storage, release, 'ghost'), /ghost/);
  // Another release keeps its own studies.
  assert.deepEqual(listStudies(storage, 'other@2'), []);
  deleteStudy(storage, release, 'study-1');
  assert.equal(storage.getItem(studyPlanKey(release, 'study-1')), null);
  assert.deepEqual(listStudies(storage, release), [{ id: 'study-2', title: 'Second' }]);
  assert.equal(openStudies(context(storage)).active, 'study-2');
  // A new id is never reused while its predecessor exists.
  assert.equal(createStudy(storage, release, first.plan), 'study-3');
  deleteStudy(storage, release, 'study-2'); deleteStudy(storage, release, 'study-3');
  assert.equal(openStudies(context(storage)).source, 'default');
});

test('the single plan per release from before studies becomes study-1, keeping its active station', () => {
  const legacy = JSON.parse(plan10); legacy.scene.release = release;
  const storage = memory({ [`muon-plan:${release}`]: JSON.stringify(legacy) });
  const opened = openStudies(context(storage));
  assert.equal(opened.source, 'migrated'); assert.equal(opened.active, 'study-1');
  assert.equal(opened.plan.schemaVersion, '1.1.0'); assert.deepEqual(opened.plan.deployments.map(d => d.stations), [['north']]);
  assert.deepEqual(opened.session, { activeStation: 'station-2' });
  assert.equal(storage.getItem(`muon-plan:${release}`), null);
  assert.equal(storage.getItem(studyPlanKey(release, 'study-1')), serializePlan(opened.plan));
  assert.deepEqual(JSON.parse(storage.getItem(studySessionKey(release, 'study-1'))), { activeStation: 'station-2' });
  assert.equal(openStudies(context(storage)).source, 'stored');
});

test('pre-plan storage is converted once; the release station list is removed, the global device record kept', () => {
  const legacyStations = [{ id: 'a', name: 'A', x: 1, y: 2, z: 3, az: 10, el: 30 }, { id: 'a', name: 'copy', x: 7, y: 8, z: 9, az: 0, el: 25 }];
  const storage = memory({ 'muon-candidates:subject@1': JSON.stringify(legacyStations), 'muon-device-settings-v1': JSON.stringify({ ...settings, exposureDays: 60 }) });
  const opened = openStudies(context(storage));
  assert.equal(opened.source, 'migrated');
  assert.deepEqual(opened.plan.stations.map(s => [s.id, s.candidateId, s.pose.azimuthDeg]), [['a', 'a', 10], ['station-2', null, 0]]);
  assert.equal(opened.plan.detectors.default.response.exposureDays, 60);
  assert.equal(storage.getItem('muon-candidates:subject@1'), null);
  assert.notEqual(storage.getItem('muon-device-settings-v1'), null);
  assert.equal(openStudies(context(storage)).source, 'stored');
});

test('the global device record from before plans seeds new studies; unreadable storage falls back to defaults', () => {
  const seeded = openStudies(context(memory({ 'muon-device-settings-v1': JSON.stringify({ ...settings, exposureDays: 90 }) })));
  assert.equal(seeded.plan.detectors.default.response.exposureDays, 90);
  const brokenIndex = { [studyIndexKey(release)]: JSON.stringify({ version: 1, active: 'study-1', studies: ['study-1'] }), [studyPlanKey(release, 'study-1')]: '{"format":"muography-plan"' };
  const broken = openStudies(context(memory(brokenIndex)));
  assert.equal(broken.source, 'default'); assert.match(broken.warning, /plan/);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  assert.equal(openStudies(context(throwing)).source, 'default');
  assert.equal(saveStudy(throwing, release, 'study-1', seeded.plan), false);
  // A study stored under another release is not loaded here.
  const foreign = memory({ [studyIndexKey(release)]: JSON.stringify({ version: 1, active: 'study-1', studies: ['study-1'] }),
    [studyPlanKey(release, 'study-1')]: serializePlan({ ...seeded.plan, scene: { ...seeded.plan.scene, release: 'other@2' } }) });
  assert.match(openStudies(context(foreign)).warning, /another release/);
});
