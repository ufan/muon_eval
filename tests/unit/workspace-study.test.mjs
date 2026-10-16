import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan } from '../../dist/modules/plan-format.js';
import { createStudyState } from '../../dist/modules/study-state.js';
import { migrateStudies, serializeWorkspace, selectWorkspace, newId, validateWorkspace } from '../../dist/modules/workspace-format.js';
import { listStudyItems, planViewOf, applyPlanView, addStudyFromPlan, removeStudy, mergeSelection, studyForImport, ensurePool,
  legacySession, workspaceSession } from '../../dist/modules/workspace-study.js';

// Interim bridge (ADR-033 step 3): the workspace is stored, today's study UI edits a 1.x plan view of one study.
const planText = await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8');
const counter = (start = 0) => { let n = start; return length => Uint8Array.from({ length }, () => n++ % 256); };
const environment = { upstream: 0 };
function migrated() {
  const a = parsePlan(planText), b = parsePlan(planText);
  b.title = 'Second';
  return migrateStudies({ release: 'subject@1.0.0', studies: [{ id: 'study-1', plan: a, session: null }, { id: 'study-2', plan: b, session: null }], active: 'study-1', random: counter() });
}
const strip = plan => ({ title: plan.title, stations: plan.stations.map(({ id, detector, ...rest }) => rest),
  deployments: plan.deployments.map(d => ({ name: d.name, size: d.stations.length })), exposure: plan.detectors.default.response.exposureDays });

test('a study is seen as the 1.x plan it came from (its 候选池 is the candidate pool)', () => {
  const { workspace: ws } = migrated(), source = parsePlan(planText), studyId = ws.studies[0].id;
  assert.deepEqual(listStudyItems(ws), [{ id: ws.studies[0].id, title: 'Synthetic study' }, { id: ws.studies[1].id, title: 'Second' }]);
  const view = planViewOf(ws, studyId, { scenario: 'mid' });
  assert.equal(view.scene.scenario, 'mid');
  assert.deepEqual(strip(view), strip(source));
  assert.ok(view.stations.every(s => s.id.startsWith('sta-')));
  assert.ok(view.deployments.every(d => d.id.startsWith('dep-')));
  // Writing an unchanged view back changes nothing.
  assert.equal(serializeWorkspace(applyPlanView(ws, studyId, view)), serializeWorkspace(ws));
});

test('edits through the study state land in the workspace', () => {
  const { workspace: ws } = migrated(), studyId = ws.studies[0].id, random = counter(200);
  const study = createStudyState({ plan: planViewOf(ws, studyId, { scenario: 'low' }), environment, newId: prefix => newId(prefix, random) });
  const [north, second] = study.plan.stations.map(s => s.id);
  // A second pose at north, saved as new: shares north's site.
  study.select(north); study.update('el', 50); const steep = study.saveAsNew();
  // Moving station-2, whose site is its own: the site moves.
  study.select(second); study.update('x', 81); study.updateCandidate();
  // Moving north while the steep pose shares its site: north gets a new site.
  study.select(north); study.update('y', 130); study.updateCandidate();
  study.createDeployment('Added', [steep]); study.setTitle('Renamed');
  let next = applyPlanView(ws, studyId, study.plan, { random });
  const station = id => next.stations.find(s => s.id === id), site = id => next.sites.find(s => s.id === station(id).placement.site);
  assert.match(steep, /^sta-/);
  assert.equal(site(steep).position[1], 122);
  assert.equal(site(second).position[0], 81);
  assert.equal(site(second).id, ws.stations.find(s => s.id === second).placement.site);
  assert.notEqual(site(north).id, site(steep).id);
  assert.deepEqual(site(north).position, [12.5, 130, 57]);
  const studyItem = next.studies.find(s => s.id === studyId);
  assert.equal(studyItem.title, 'Renamed');
  assert.deepEqual(next.deployments.find(d => d.id === studyItem.deployments[0]).stations, [north, second, steep]);
  assert.equal(next.deployments.find(d => d.id === studyItem.deployments.at(-1)).name, 'Added');
  // Removing a station deletes it, and its own site, when nothing else uses it.
  study.removeCandidate(second);
  next = applyPlanView(next, studyId, study.plan, { random });
  assert.equal(next.stations.some(s => s.id === second), false);
  assert.equal(next.sites.some(s => s.position[0] === 81), false);
  // Deleting a deployment removes it from the workspace when no other study uses it.
  const added = study.plan.deployments.at(-1).id;
  study.deleteDeployment(added);
  next = applyPlanView(next, studyId, study.plan, { random });
  assert.equal(next.deployments.some(d => d.id === added), false);
  assert.doesNotThrow(() => validateWorkspace(next));
});

test('exposure set in the plan view becomes the study exposure', () => {
  const { workspace: ws } = migrated(), studyId = ws.studies[0].id;
  const study = createStudyState({ plan: planViewOf(ws, studyId, { scenario: 'low' }), environment });
  study.setExposure(90);
  assert.deepEqual(Object.values(study.plan.detectors).map(d => d.response.exposureDays), [90]);
  assert.equal(study.working.settings.exposureDays, 90);
  const next = applyPlanView(ws, studyId, study.plan);
  assert.deepEqual(next.studies[0].exposure, { kind: 'constant', days: 90 });
  assert.deepEqual(next.studies[1].exposure, { kind: 'constant', days: 30 });
  assert.equal(next.detectors.length, 1);
});

test('a station used by another study stays when one study drops it', () => {
  const { workspace: ws } = migrated(), [a, b] = ws.studies, random = counter(300);
  const shared = ws.deployments.find(d => d.id === a.deployments[0]).stations[0];
  const withShared = structuredClone(ws);
  withShared.deployments.find(d => d.id === b.deployments[1]).stations.push(shared);
  const study = createStudyState({ plan: planViewOf(withShared, a.id, { scenario: 'low' }), environment });
  study.removeCandidate(shared);
  const next = applyPlanView(withShared, a.id, study.plan, { random });
  assert.ok(next.stations.some(s => s.id === shared));
  assert.equal(next.deployments.find(d => d.id === a.deployments[0]).stations.includes(shared), false);
});

test('new and removed studies', () => {
  const { workspace: ws } = migrated();
  const { workspace: added, studyId } = addStudyFromPlan(ws, { ...parsePlan(planText), title: '工作方案 3' }, { random: counter(400) });
  assert.equal(added.studies.at(-1).id, studyId);
  assert.equal(planViewOf(added, studyId, { scenario: 'low' }).title, '工作方案 3');
  assert.equal(added.stations.length, ws.stations.length + 2);
  // Removing a study keeps its deployments and stations (they may be shared; step 4 lists them).
  const removed = removeStudy(added, studyId);
  assert.deepEqual(removed.studies.map(s => s.id), ws.studies.map(s => s.id));
  assert.equal(removed.stations.length, added.stations.length);
});

test('a study without a pool gets one holding the stations of its deployments', () => {
  const { workspace: ws } = migrated(), study = ws.studies[0];
  const bare = structuredClone(ws); bare.studies[0].deployments = study.deployments.slice(1);
  const fixed = ensurePool(bare, study.id, { random: counter(500) });
  const pool = fixed.deployments.find(d => d.id === fixed.studies[0].deployments[0]);
  assert.match(pool.name, / · 候选池$/);
  // Stations in the order the deployments first use them; here the same as the pool migration made.
  assert.deepEqual(pool.stations, ws.deployments.find(d => d.id === study.deployments[0]).stations);
  assert.equal(ensurePool(ws, study.id), ws);
});

test('merging a selection: new items added, identical skipped, conflicts refused, equal detectors reused', () => {
  const { workspace: ws } = migrated(), dep = ws.studies[0].deployments[1];
  const selection = selectWorkspace(ws, [dep], {});
  const same = mergeSelection(ws, selection);
  assert.deepEqual([same.added, same.skipped], [0, 4]);
  assert.equal(serializeWorkspace(same.workspace), serializeWorkspace(ws));
  const changed = structuredClone(selection); changed.stations[0].name = 'Changed';
  assert.throws(() => mergeSelection(ws, changed), /conflict/i);
  // From someone else: fresh IDs, the same device under another detector ID.
  const other = migrateStudies({ release: 'subject@1.0.0', studies: [{ id: 's', plan: parsePlan(planText), session: null }], random: counter(600) }).workspace;
  const foreign = selectWorkspace(other, [other.studies[0].id], {});
  const merged = mergeSelection(ws, foreign);
  assert.equal(merged.added, foreign.sites.length + foreign.stations.length + foreign.deployments.length + 1);
  assert.equal(merged.workspace.detectors.length, 1);
  assert.ok(merged.workspace.stations.filter(s => foreign.stations.some(f => f.id === s.id)).every(s => s.detector === ws.detectors[0].id));
});

test('an imported selection opens as a study: its own, or a new one holding the imported deployments', () => {
  const { workspace: ws } = migrated();
  const other = migrateStudies({ release: 'subject@1.0.0', studies: [{ id: 's', plan: parsePlan(planText), session: null }], random: counter(700) }).workspace;
  const asStudy = studyForImport(ws, selectWorkspace(other, [other.studies[0].id], {}), { title: '导入', random: counter(800) });
  assert.equal(asStudy.studyId, other.studies[0].id);
  const deps = selectWorkspace(other, [other.studies[0].deployments[2]], {});
  const asDeployments = studyForImport(ws, deps, { title: '导入的部署组合', random: counter(900) });
  const view = planViewOf(asDeployments.workspace, asDeployments.studyId, { scenario: 'low' });
  assert.equal(view.title, '导入的部署组合');
  assert.deepEqual(view.deployments.map(d => d.name), ['Both stations']);
  assert.equal(view.stations.length, 2);
});

test('sessions convert between the workspace and the study state', () => {
  const { workspace: ws } = migrated(), studyId = ws.studies[0].id;
  const study = createStudyState({ plan: planViewOf(ws, studyId, { scenario: 'low' }), environment });
  const second = study.plan.stations[1].id;
  study.select(second); study.update('az', 15); study.setCompared(study.plan.stations[0].id, true); study.selectDeployment(study.plan.deployments[1].id);
  const stored = workspaceSession(ws, studyId, study.session(), { exposureDays: 45 });
  assert.equal(stored.activeStudy, studyId);
  assert.equal(stored.exposureDays, 45);
  assert.equal(stored.working.station, second);
  assert.equal(stored.working.site, ws.stations.find(s => s.id === second).placement.site);
  assert.deepEqual(stored.working.pose, { azimuthDeg: 15, elevationDeg: 35 });
  const back = createStudyState({ plan: planViewOf(ws, studyId, { scenario: 'low' }), session: legacySession(ws, stored, studyId), environment });
  assert.deepEqual(back.session(), study.session());
  assert.equal(legacySession(ws, stored, ws.studies[1].id), null);
});
