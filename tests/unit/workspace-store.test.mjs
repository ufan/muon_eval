import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { saveStudy, studyIndexKey, studyPlanKey } from '../../dist/modules/plan-store.js';
import { parsePlan } from '../../dist/modules/plan-format.js';
import { serializeWorkspace } from '../../dist/modules/workspace-format.js';
import { openWorkspace, saveWorkspace, saveWorkspaceSession, workspaceKey, workspaceSessionKey, invalidWorkspaceKey } from '../../dist/modules/workspace-store.js';

// Workspace in browser storage (docs/specs/WORKSPACE_FORMAT.md, Browser storage and Migration).
const memory = (entries = {}) => { const map = new Map(Object.entries(entries)); return {
  getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map }; };
const release = 'subject@1.0.0';
const planText = await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8');
const plan = parsePlan(planText);
const defaultDetector = { name: 'default', device: plan.detectors.default.device, response: (({ exposureDays, ...r }) => r)(plan.detectors.default.response) };
const settings = { width: .4096, height: .4096, stripPitch: .0016, strips: 256, spacing: .15, layerEfficiency: .95,
  deadLiveFraction: .98, angularResolutionDeg: .3, systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' };
const legacy = storage => ({ storage, release, scenario: 'low', model: 'test-telescope', candidateIds: ['a'],
  defaultStations: [{ id: 'a', name: 'A', x: 1, y: 2, z: 3, az: 0, el: 25, candidateId: 'a' }], defaultSettings: settings });
const open = (storage, extra = {}) => openWorkspace({ storage, release, defaultDetector, legacy: legacy(storage), ...extra });

test('a release opened for the first time gets an empty workspace, not written until saved', () => {
  const storage = memory(), opened = open(storage);
  assert.equal(opened.source, 'new');
  assert.deepEqual([opened.workspace.detectors.length, opened.workspace.stations.length, opened.workspace.studies.length], [1, 0, 0]);
  assert.deepEqual(opened.session, { version: 1, activeStudy: null, activeDeployment: null, shown: [], exposureDays: 30, working: null });
  assert.equal(storage.map.size, 0);
});

test('a saved workspace and session are reopened; invalid session parts are dropped', () => {
  const storage = memory(), first = open(storage);
  storage.setItem(studyIndexKey(release), 'ignored once a workspace exists');
  assert.equal(saveWorkspace(storage, release, first.workspace), true);
  assert.equal(storage.getItem(workspaceKey(release)), serializeWorkspace(first.workspace));
  saveWorkspaceSession(storage, release, { ...first.session, exposureDays: 60 });
  const again = open(storage);
  assert.equal(again.source, 'stored');
  assert.equal(serializeWorkspace(again.workspace), serializeWorkspace(first.workspace));
  assert.equal(again.session.exposureDays, 60);
  storage.setItem(workspaceSessionKey(release), JSON.stringify({ version: 1, activeStudy: 'study-0000000000000000', activeDeployment: 7,
    shown: ['sta-0000000000000000'], exposureDays: 0, working: { name: 'w' } }));
  assert.deepEqual(open(storage).session, { version: 1, activeStudy: null, activeDeployment: null, shown: [], exposureDays: 30, working: null });
  storage.setItem(workspaceSessionKey(release), '{');
  assert.equal(open(storage).session.exposureDays, 30);
});

test('a broken or foreign stored workspace is kept aside, never overwritten silently', () => {
  const storage = memory({ [workspaceKey(release)]: '{"format":"muography-workspace"' });
  const opened = open(storage);
  assert.equal(opened.source, 'new');
  assert.match(opened.warning, /Stored workspace ignored/);
  assert.equal(storage.getItem(invalidWorkspaceKey(release)), '{"format":"muography-workspace"');
  const other = open(memory()).workspace;
  const foreign = memory({ [workspaceKey(release)]: serializeWorkspace({ ...other, release: { id: 'other@1', contentHash: null } }) });
  assert.match(open(foreign).warning, /other@1/);
});

test('1.x studies migrate once; the 1.x keys stay as a backup', () => {
  const storage = memory();
  saveStudy(storage, release, 'study-1', plan, { activeStation: 'north', compare: ['station-2'], activeDeployment: 'both' });
  saveStudy(storage, release, 'study-2', { ...plan, title: 'Second' }, { activeStation: 'north' });
  const before = new Map(storage.map);
  const opened = open(storage);
  assert.equal(opened.source, 'migrated');
  assert.deepEqual(opened.workspace.studies.map(s => s.title), ['Synthetic study', 'Second']);
  assert.equal(opened.session.activeStudy, opened.workspace.studies[1].id);
  assert.equal(storage.getItem(workspaceKey(release)), serializeWorkspace(opened.workspace));
  for (const [key, value] of before) assert.equal(storage.getItem(key), value, key);
  assert.equal(open(storage).source, 'stored');
});

test('station lists from before plans migrate through the 1.x conversion', () => {
  const storage = memory({ [`muon-candidates:${release}`]: JSON.stringify([{ id: 'a', name: 'Old', x: 1, y: 2, z: 3, az: 10, el: 20 }]) });
  const opened = open(storage);
  assert.equal(opened.source, 'migrated');
  assert.deepEqual(opened.workspace.stations.map(s => s.name), ['Old']);
  assert.ok(storage.getItem(studyPlanKey(release, 'study-1')));
});

test('unreadable 1.x studies are skipped and reported', () => {
  const storage = memory();
  saveStudy(storage, release, 'study-1', plan, null);
  saveStudy(storage, release, 'study-2', plan, null);
  storage.setItem(studyPlanKey(release, 'study-2'), '{');
  const opened = open(storage);
  assert.equal(opened.workspace.studies.length, 1);
  assert.ok(opened.report.some(line => /study-2/.test(line)));
});

test('storage that throws never breaks opening', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const opened = open(broken);
  assert.equal(opened.source, 'new');
  assert.equal(saveWorkspace(broken, release, opened.workspace), false);
});
