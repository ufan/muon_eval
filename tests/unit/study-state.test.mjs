import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan, validatePlan, planHash } from '../../dist/modules/plan-format.js';
import { createStudyState } from '../../dist/modules/study-state.js';

// Working station vs fixed candidates (FR-P6, ADR-020 decision 2).
const plan = parsePlan(await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8'));
const environment = { water_up_level: 290 };
const open = (session = null, p = plan) => createStudyState({ plan: p, session, environment });

test('the working station starts as a copy of the session\'s active candidate', () => {
  const study = open({ activeStation: 'station-2' });
  assert.equal(study.working.from, 'station-2'); assert.equal(study.modified, false);
  assert.deepEqual([study.working.x, study.working.y, study.working.z, study.working.az, study.working.el], [80, 101.25, 55, 180, 35]);
  assert.equal(open().working.from, 'north');
  assert.equal(study.configuration.device.model, 'test-telescope');
  assert.equal(study.configuration.device.stripsX, 256);
});

test('editing the working station never changes a candidate until it is applied', () => {
  const study = open();
  study.update('el', 40); study.update('az', 400); study.update('name', 'steeper');
  assert.equal(study.working.az, 359); assert.equal(study.modified, true);
  assert.equal(study.plan.stations[0].pose.elevationDeg, 25);
  assert.throws(() => study.update('x', Number.NaN), /finite/);
  assert.throws(() => study.update('detector', 'x'), /field/);
  // Update applies the edit to the source candidate, keeping its id, note and dataset link.
  study.updateCandidate();
  const north = study.plan.stations[0];
  assert.deepEqual([north.id, north.name, north.pose.elevationDeg, north.candidateId, north.note], ['north', 'steeper', 40, 'north', '']);
  assert.equal(study.modified, false);
});

test('save as new adds a candidate after the pool, keeps the dataset link and avoids duplicate names', () => {
  const study = open();
  study.update('el', 50);
  const id = study.saveAsNew();
  assert.equal(id, 'station-3');
  const added = study.plan.stations.at(-1);
  assert.deepEqual([added.id, added.name, added.pose.elevationDeg, added.candidateId, added.note], ['station-3', '北侧点位 (2)', 50, 'north', '']);
  assert.equal(study.working.from, 'station-3'); assert.equal(study.modified, false);
  assert.equal(study.plan.stations[0].pose.elevationDeg, 25);
  validatePlan(study.plan);
});

test('a working station without a source can only be saved as new', () => {
  const study = open();
  study.removeCandidate('north');
  assert.equal(study.working.from, null); assert.equal(study.modified, true);
  assert.throws(() => study.updateCandidate(), /no source candidate/);
  assert.deepEqual(study.plan.deployments.map(d => d.stations), [[], ['station-2']]);
  assert.throws(() => study.removeCandidate('station-2'), /last candidate/);
});

test('detectors are shared when equal and added when different; unused ones are pruned', () => {
  const study = open();
  study.configure({ exposureDays: 90 });
  assert.equal(study.configuration.response.exposureDays, 90);
  assert.equal(study.plan.detectors.default.response.exposureDays, 30);
  const id = study.saveAsNew();
  assert.deepEqual(Object.keys(study.plan.detectors), ['default', 'detector-2']);
  assert.equal(study.plan.stations.find(s => s.id === id).detector, 'detector-2');
  // Selecting a candidate loads its own detector.
  study.select('north'); assert.equal(study.configuration.response.exposureDays, 30);
  study.select(id); assert.equal(study.configuration.response.exposureDays, 90);
  // Back to the default settings: the candidate shares `default` again and detector-2 is pruned.
  study.configure({ exposureDays: 30 }); study.updateCandidate();
  assert.deepEqual(Object.keys(study.plan.detectors), ['default']);
  // Apply to all: every candidate takes the working detector.
  study.configure({ exposureDays: 60 }); study.applyDetectorToAll();
  assert.deepEqual(new Set(study.plan.stations.map(s => s.detector)).size, 1);
  assert.equal(study.plan.detectors[study.plan.stations[0].detector].response.exposureDays, 60);
  validatePlan(study.plan);
});

test('inputs: the working station carries the plan reference only while it equals its candidate', () => {
  const study = open();
  const input = study.snapshot();
  assert.deepEqual(input.station, { id: 'north', name: '北侧点位', x: 12.5, y: 122, z: 57, az: 0, el: 25 });
  assert.deepEqual(input.plan, { hash: planHash(study.plan), stationId: 'north' });
  assert.deepEqual(input.environment, environment); assert.notEqual(input.environment, environment);
  study.update('el', 30);
  assert.equal(study.snapshot().plan, null);
  // A candidate's own input never depends on the working station.
  assert.deepEqual(study.candidateInput('north').station.el, 25);
  assert.deepEqual(study.candidateInput('north').plan, { hash: planHash(study.plan), stationId: 'north' });
  assert.throws(() => study.candidateInput('ghost'), /ghost/);
});

test('compare flags and the working station persist as session state', () => {
  const study = open();
  study.setCompared('station-2', true); study.setCompared('north', true); study.setCompared('north', false);
  assert.deepEqual(study.compared, ['station-2']);
  study.update('el', 33);
  const session = study.session();
  assert.deepEqual(session.compare, ['station-2']);
  const again = open(session);
  assert.equal(again.working.el, 33); assert.equal(again.working.from, 'north'); assert.equal(again.modified, true);
  assert.deepEqual(again.compared, ['station-2']);
  // Invalid stored session parts are ignored.
  const broken = open({ activeStation: 'ghost', working: { x: 'a' }, compare: ['ghost', 'north'] });
  assert.equal(broken.working.from, 'north'); assert.equal(broken.modified, false); assert.deepEqual(broken.compared, ['north']);
  study.removeCandidate('station-2'); assert.deepEqual(study.compared, []);
});

test('deployments are created, renamed, copied, filled and deleted (FR-P7)', () => {
  const study = open();
  assert.deepEqual(study.plan.deployments.map(d => d.id), ['deployment-1', 'both']);
  const id = study.createDeployment('Plan A');
  assert.equal(id, 'deployment-3'); assert.equal(study.activeDeployment, id);
  study.setMember(id, 'station-2', true); study.setMember(id, 'north', true); study.setMember(id, 'north', true);
  assert.deepEqual(study.plan.deployments.at(-1), { id, name: 'Plan A', stations: ['station-2', 'north'] });
  study.setMember(id, 'station-2', false);
  assert.deepEqual(study.plan.deployments.at(-1).stations, ['north']);
  const copy = study.copyDeployment(id, 'Plan A copy');
  assert.deepEqual(study.plan.deployments.at(-1), { id: copy, name: 'Plan A copy', stations: ['north'] });
  assert.equal(study.activeDeployment, copy);
  study.renameDeployment(copy, 'Plan B'); assert.equal(study.plan.deployments.at(-1).name, 'Plan B');
  assert.throws(() => study.renameDeployment(copy, ''), /name/);
  assert.throws(() => study.setMember(copy, 'ghost', true), /ghost/);
  study.deleteDeployment(copy);
  assert.equal(study.plan.deployments.some(d => d.id === copy), false);
  assert.equal(study.activeDeployment, 'deployment-1');
  // Deleting a candidate removes it from every deployment.
  study.removeCandidate('north'); assert.deepEqual(study.plan.deployments.find(d => d.id === id).stations, []);
  validatePlan(study.plan);
});

test('the active deployment and the study title persist', () => {
  const study = open({ activeDeployment: 'both' });
  assert.equal(study.activeDeployment, 'both');
  study.selectDeployment('deployment-1'); assert.equal(study.session().activeDeployment, 'deployment-1');
  assert.throws(() => study.selectDeployment('ghost'), /ghost/);
  assert.equal(open({ activeDeployment: 'ghost' }).activeDeployment, 'deployment-1');
  const empty = open(null, { ...plan, deployments: [] });
  assert.equal(empty.activeDeployment, null);
  study.setTitle('Renamed study'); assert.equal(study.plan.title, 'Renamed study');
  assert.throws(() => study.setTitle('x'.repeat(201)), /title/);
});
