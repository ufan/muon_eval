import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan } from '../../dist/modules/plan-format.js';
import { createWorkspace, migrateStudies, selectWorkspace, workspaceHash, validateWorkspace } from '../../dist/modules/workspace-format.js';
import { createWorkspaceState } from '../../dist/modules/workspace-state.js';

// The working draft, saved stations, the shown set and deployments on the flat workspace (ADR-033 step 4).
const planText = await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8');
const plan = parsePlan(planText), environment = { upstream: 0 };
const detector = { name: 'default', device: plan.detectors.default.device, response: (({ exposureDays, ...r }) => r)(plan.detectors.default.response) };
const draft = { name: '建议点 A', x: 1, y: 2, z: 3, az: 0, el: 25, candidateId: 'a', model: 'test-telescope',
  settings: { width: .4096, height: .4096, stripPitch: .0016, strips: 256, spacing: .15, layerEfficiency: .95, deadLiveFraction: .98,
    angularResolutionDeg: .3, systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' } };
const empty = () => createWorkspace({ release: 'subject@1.0.0', detector });
const migrated = () => migrateStudies({ release: 'subject@1.0.0', studies: [{ id: 'study-1', plan, session: null }] }).workspace;
const state = (workspace = empty(), session = null) => createWorkspaceState({ workspace, session, environment, draft });

test('an empty workspace starts with an unsaved draft; saving creates a station on a new site', () => {
  const s = state();
  assert.deepEqual(s.plan.stations, []);
  assert.equal(s.working.from, null);
  // An untouched draft is no unsaved edit; changing it is, and it has no saved station to refer to.
  assert.equal(s.modified, false);
  assert.equal(s.snapshot().plan, null);
  s.update('az', 0); assert.equal(s.modified, true);
  const id = s.saveAsNew();
  assert.match(id, /^sta-/);
  assert.equal(s.modified, false);
  assert.deepEqual(s.plan.stations.map(x => [x.name, x.position, x.candidateId]), [['建议点 A', [1, 2, 3], 'a']]);
  assert.equal(s.workspace.sites.length, 1);
  assert.doesNotThrow(() => validateWorkspace(s.workspace));
});

test('another pose at the same place shares the site; a moved draft gets a new one', () => {
  const s = state(), first = s.saveAsNew();
  s.update('el', 45); const steep = s.saveAsNew();
  assert.equal(s.candidate(steep).site, s.candidate(first).site);
  // Names are free text, not identity: the second pose keeps the draft's name.
  assert.equal(s.candidate(steep).name, '建议点 A');
  s.update('x', 9); const moved = s.saveAsNew();
  assert.notEqual(s.candidate(moved).site, s.candidate(first).site);
  assert.equal(s.workspace.sites.length, 2);
  assert.equal(s.workspace.detectors.length, 1);
});

test('updating a moved station: its own site moves; a shared site asks to move all or split off', () => {
  const s = state(), first = s.saveAsNew();
  s.update('x', 5); assert.equal(s.siteSharedBy(), 0); s.updateCandidate();
  assert.deepEqual(s.candidate(first).position, [5, 2, 3]);
  assert.equal(s.workspace.sites.length, 1);
  s.update('el', 60); const second = s.saveAsNew();
  s.select(first); s.update('y', 7);
  assert.equal(s.siteSharedBy(), 1);
  assert.throws(() => s.updateCandidate(), /shared/);
  s.updateCandidate('move');
  assert.deepEqual([s.candidate(first).position, s.candidate(second).position], [[5, 7, 3], [5, 7, 3]]);
  s.update('z', 4); s.updateCandidate('new');
  assert.deepEqual([s.candidate(first).position, s.candidate(second).position], [[5, 7, 4], [5, 7, 3]]);
  assert.notEqual(s.candidate(first).site, s.candidate(second).site);
});

test('removing a station takes it out of deployments and deletes its unused site; dependants are listed', () => {
  const ws = migrated(), s = state(ws), [north, second] = s.plan.stations.map(x => x.id);
  assert.deepEqual(s.dependants(north), { deployments: ['Synthetic study · 候选池', '北侧单站', 'Both stations'], studies: ['Synthetic study'] });
  s.select(second); s.removeCandidate(second);
  // The removed station's values stay as an unsaved draft.
  assert.deepEqual([s.working.from, s.modified], [null, true]);
  assert.equal(s.plan.stations.length, 1);
  assert.ok(s.plan.deployments.every(d => !d.stations.includes(second)));
  assert.equal(s.workspace.sites.length, 1);
  assert.deepEqual(s.dependants(s.plan.deployments[1].id), { studies: ['Synthetic study'] });
  void north;
});

test('ticks are the shown set; deployments load into it and update from it explicitly', () => {
  const ws = migrated(), s = state(ws), [north, second] = s.plan.stations.map(x => x.id);
  const both = s.plan.deployments.find(d => d.name === 'Both stations').id;
  s.selectDeployment(both);
  assert.deepEqual(s.compared, [north, second]);
  assert.equal(s.matchedDeployment, both);
  s.setCompared(second, false);
  assert.equal(s.matchedDeployment, s.plan.deployments.find(d => d.name === '北侧单站').id);
  s.setCompared(north, false);
  assert.equal(s.matchedDeployment, null);
  s.setCompared(second, true);
  s.updateDeployment(both);
  assert.deepEqual(s.plan.deployments.find(d => d.id === both).stations, [second]);
  const created = s.createDeployment('Only north', [north]);
  assert.equal(s.activeDeployment, created);
  s.renameDeployment(created, 'North');
  const copy = s.copyDeployment(created, 'North copy');
  assert.deepEqual(s.plan.deployments.find(d => d.id === copy).stations, [north]);
  // Deleting a deployment also takes it out of the studies that compare it.
  s.deleteDeployment(both);
  assert.ok(s.workspace.studies.every(study => !study.deployments.includes(both)));
  s.setMember(created, second, true);
  assert.deepEqual(s.plan.deployments.find(d => d.id === created).stations, [north, second]);
});

test('exposure is one setting for every station of the session', () => {
  const ws = migrated(), s = state(ws), id = s.plan.stations[0].id;
  assert.equal(s.exposureDays, 30);
  s.setExposure(90);
  assert.equal(s.candidateInput(id).response.exposureDays, 90);
  assert.equal(s.working.settings.exposureDays, 90);
  assert.equal(s.session().exposureDays, 90);
  assert.equal(s.workspace.detectors[0].response.exposureDays, undefined);
});

test('results refer to the workspace selection of their station', () => {
  const ws = migrated(), s = state(ws), id = s.plan.stations[1].id;
  assert.deepEqual(s.candidateInput(id).plan, { hash: workspaceHash(selectWorkspace(ws, [id])), stationId: id });
  s.select(id);
  assert.deepEqual(s.snapshot().plan, s.candidateInput(id).plan);
  s.update('az', 99);
  assert.equal(s.snapshot().plan, null);
  assert.equal(s.snapshot().station.id, id);
});

test('the session holds the draft, shown set, deployment and exposure, and restores them', () => {
  const ws = migrated(), s = state(ws), second = s.plan.stations[1].id;
  s.select(second); s.update('az', 15); s.setCompared(second, true); s.selectDeployment(s.plan.deployments[2].id); s.setExposure(45);
  const session = s.session();
  assert.equal(session.working.station, second);
  assert.equal(session.working.site, s.candidate(second).site);
  const back = state(s.workspace, session);
  assert.deepEqual([back.working, back.compared, back.activeDeployment, back.exposureDays], [s.working, s.compared, s.activeDeployment, 45]);
  assert.equal(back.modified, true);
});

test('a dataset suggestion loads as an unsaved draft', () => {
  const s = state(migrated());
  s.loadDraft({ name: 'B', x: 4, y: 5, z: 6, az: 10, el: 20, candidateId: 'b' });
  assert.deepEqual([s.working.from, s.working.name, s.working.x, s.modified], [null, 'B', 4, false]);
  const id = s.saveAsNew();
  assert.equal(s.candidate(id).candidateId, 'b');
});

test('the detector applies to all stations; studies are renamed or removed without touching their items', () => {
  const ws = migrated(), s = state(ws);
  s.configure({ ...s.working.settings, layerEfficiency: .9 }); s.applyDetectorToAll();
  assert.equal(s.workspace.detectors.length, 1);
  assert.equal(s.workspace.detectors[0].response.layerEfficiency, .9);
  const study = s.workspace.studies[0].id;
  s.renameStudy(study, 'Renamed');
  assert.equal(s.workspace.studies[0].title, 'Renamed');
  s.deleteStudy(study);
  assert.deepEqual([s.workspace.studies.length, s.workspace.deployments.length, s.workspace.stations.length], [0, 3, 2]);
});

test('duplicates (same place, candidate, pose and detector) merge only on request, keeping deployments and the shown set', () => {
  const two = migrateStudies({ release: 'subject@1.0.0', studies: [{ id: 'a', plan, session: null }, { id: 'b', plan: { ...plan, title: 'B' }, session: null }] }).workspace;
  const s = state(two), [a1, a2, b1, b2] = s.plan.stations.map(x => x.id);
  assert.equal(s.duplicateCount, 2);
  s.setCompared(b2, true); s.select(b1);
  assert.equal(s.mergeDuplicates(), 2);
  assert.deepEqual(s.plan.stations.map(x => x.id), [a1, a2]);
  assert.equal(s.workspace.sites.length, 2);
  const studyB = s.workspace.studies[1], pool = s.workspace.deployments.find(d => d.id === studyB.deployments[0]);
  assert.deepEqual(pool.stations, [a1, a2]);
  assert.deepEqual([s.compared, s.working.from, s.duplicateCount], [[a2], a1, 0]);
  assert.doesNotThrow(() => validateWorkspace(s.workspace));
});

test('revert discards the edits: back to the saved station, or to the draft as it was loaded', () => {
  const ws = migrated(), s = state(ws), id = s.plan.stations[1].id, saved = s.candidate(id);
  s.select(id); s.update('x', 99); s.update('el', 60); s.configure({ ...s.working.settings, layerEfficiency: .9 });
  assert.equal(s.modified, true);
  s.revert();
  assert.deepEqual([s.modified, s.working.x, s.working.el, s.working.settings.layerEfficiency], [false, saved.position[0], saved.pose.elevationDeg, .95]);
  s.loadDraft({ name: 'B', x: 4, y: 5, z: 6, az: 10, el: 20, candidateId: 'b' }); s.update('z', 40);
  s.revert();
  assert.deepEqual([s.working.from, s.working.z, s.modified], [null, 6, false]);
});

test('a suggestion can be added to the saved stations without touching the working station', () => {
  const s = state(), before = s.working;
  const id = s.addFromDraft({ name: '建议点 B', x: 4, y: 5, z: 6, az: 10, el: 20, candidateId: 'b' });
  assert.deepEqual(s.working, before);
  assert.deepEqual([s.candidate(id).name, s.candidate(id).position, s.candidate(id).candidateId, s.candidate(id).pose], ['建议点 B', [4, 5, 6], 'b', { azimuthDeg: 10, elevationDeg: 20 }]);
  assert.equal(s.workspace.detectors.length, 1);
  // The same position and pose cannot be saved twice, whatever the name.
  assert.throws(() => s.addFromDraft({ name: '另一个名字', x: 4, y: 5, z: 6, az: 10, el: 20, candidateId: null }), /same position and pose.*建议点 B/);
});

test('the members of a deployment are set in one step, in station order, unknown stations refused', () => {
  const ws = migrated(), s = state(ws), [north, second] = s.plan.stations.map(x => x.id), dep = s.plan.deployments[1].id;
  s.setDeploymentStations(dep, [second, north]);
  assert.deepEqual(s.plan.deployments[1].stations, [north, second]);
  s.setDeploymentStations(dep, []);
  assert.deepEqual(s.plan.deployments[1].stations, []);
  assert.throws(() => s.setDeploymentStations(dep, ['sta-0000000000000000']), /not in the workspace/);
});

test('no two stations share position and pose: saving, adding and updating refuse a clash naming the station', () => {
  const s = state(), first = s.saveAsNew();
  assert.throws(() => s.saveAsNew(), /same position and pose.*建议点 A/);
  s.update('name', 'Other name'); assert.throws(() => s.saveAsNew(), /same position and pose/);
  s.update('el', 40); const second = s.saveAsNew();
  s.select(second); s.update('el', 25);
  assert.throws(() => s.updateCandidate(), /same position and pose.*建议点 A/);
  s.update('az', 5); assert.doesNotThrow(() => s.updateCandidate());
  assert.equal(s.stationAt({ x: 1, y: 2, z: 3, az: 0, el: 25 }), first);
  assert.equal(s.stationAt({ x: 1, y: 2, z: 3, az: 0, el: 26 }), null);
});

test('deselecting a deployment clears the ticks and the active deployment', () => {
  const ws = migrated(), s = state(ws), both = s.plan.deployments.find(d => d.name === 'Both stations').id;
  s.selectDeployment(both);
  s.deselectDeployment();
  assert.deepEqual([s.compared, s.activeDeployment, s.matchedDeployment, s.session().shown], [[], null, null, []]);
});

test('a draft at the position and pose of a saved station is that station (at start and when a suggestion loads)', () => {
  const first = state(), id = first.saveAsNew();
  const again = createWorkspaceState({ workspace: first.workspace, session: { ...first.session(), working: null }, environment, draft });
  assert.equal(again.working.from, id);
  // A draft kept in the session at that position and pose links to it too, keeping its values (here equal: no edits).
  const kept = createWorkspaceState({ workspace: first.workspace, session: { ...first.session(), working: { ...first.session().working, station: null, site: null } }, environment, draft });
  assert.deepEqual([kept.working.from, kept.modified], [id, false]);
  const s = state(first.workspace);
  s.loadDraft({ name: '建议点 A', x: 1, y: 2, z: 3, az: 0, el: 25, candidateId: 'a' });
  assert.deepEqual([s.working.from, s.modified], [id, false]);
  s.loadDraft({ name: 'B', x: 1, y: 2, z: 3, az: 0, el: 26, candidateId: 'a' });
  assert.equal(s.working.from, null);
});
