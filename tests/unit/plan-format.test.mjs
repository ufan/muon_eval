import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan, serializePlan, validatePlan, planFromState, stateFromPlan, planFromLegacyStorage, planHash, extractDeployments, PLAN_SCHEMA_VERSION } from '../../dist/modules/plan-format.js';

// muography-plan 1.1.0 (docs/specs/PLAN_FORMAT.md, FR-P1, FR-P2, FR-P7).
const read = name => readFile(new URL(`../fixtures/plans/${name}`, import.meta.url), 'utf8');
const text = await read('two-stations.json'), text10 = await read('plan-1.0.json');
const plan = () => JSON.parse(text);
const rejects = (mutate, pattern) => { const doc = plan(); mutate(doc); assert.throws(() => validatePlan(doc), pattern); };
const settings = { width: 0.4096, height: 0.4096, stripPitch: 0.0016, strips: 256, spacing: 0.15,
  layerEfficiency: 0.95, deadLiveFraction: 0.98, angularResolutionDeg: 0.3, systematicFraction: 0.03, exposureDays: 30, angularModel: 'gaisser' };

test('load then save gives a byte-identical file', () => {
  assert.equal(PLAN_SCHEMA_VERSION, '1.1.0');
  assert.equal(serializePlan(parsePlan(text)), text);
  // Member order is canonical whatever the input order.
  const shuffled = JSON.stringify(Object.fromEntries(Object.entries(plan()).reverse()));
  assert.equal(serializePlan(parsePlan(shuffled)), text);
});

test('a 1.0 plan is upgraded: its selection becomes one deployment, notes are empty, the active station leaves the plan', () => {
  const upgraded = parsePlan(text10);
  assert.equal(upgraded.schemaVersion, '1.1.0');
  assert.deepEqual(upgraded.deployments, [{ id: 'deployment-1', name: 'deployment-1', stations: ['north'] }]);
  assert.deepEqual(upgraded.stations.map(s => s.note), ['', '']);
  assert.equal('deployment' in upgraded, false);
  const empty = JSON.parse(text10); empty.deployment.selected = [];
  assert.deepEqual(parsePlan(JSON.stringify(empty)).deployments, []);
  // 1.0 rules still apply to 1.0 input.
  const bad = JSON.parse(text10); bad.deployment.active = 'ghost';
  assert.throws(() => parsePlan(JSON.stringify(bad)), /active/);
  const mixed = JSON.parse(text10); mixed.deployments = [];
  assert.throws(() => parsePlan(JSON.stringify(mixed)), /Unknown member deployments/);
});

test('a plan converts to the app state and back without loss', () => {
  const state = stateFromPlan(parsePlan(text));
  assert.deepEqual(state.stations[1], { id: 'station-2', name: '新候选点 2', note: 'Second pose of the same gallery', x: 80, y: 101.25, z: 55, az: 180, el: 35, candidateId: null });
  assert.deepEqual(state.deployments, plan().deployments);
  assert.deepEqual(state.settings, settings);
  const back = planFromState({ title: 'Synthetic study', release: 'subject@1.0.0', scenario: 'low', model: 'test-telescope', ...state });
  assert.equal(serializePlan(back), text);
});

test('removing a station removes it from every deployment; deployments may be empty', () => {
  const state = stateFromPlan(parsePlan(text));
  const back = planFromState({ release: 'subject@1.0.0', model: 'test-telescope', ...state, stations: state.stations.slice(1) });
  assert.deepEqual(back.deployments, [{ id: 'deployment-1', name: '北侧单站', stations: [] }, { id: 'both', name: 'Both stations', stations: ['station-2'] }]);
  assert.equal(planFromState({ release: 'r@1', model: 'm', stations: state.stations, settings }).deployments.length, 0);
});

test('invalid plans fail closed with the offending member named', () => {
  rejects(d => { d.format = 'other'; }, /format/);
  rejects(d => { d.schemaVersion = '1.2.0'; }, /newer/);
  rejects(d => { d.schemaVersion = '2.0.0'; }, /newer/);
  rejects(d => { d.schemaVersion = 'one'; }, /schemaVersion/);
  rejects(d => { d.extra = 1; }, /Unknown member extra/);
  rejects(d => { d.deployment = { selected: [], active: 'north' }; }, /Unknown member deployment/);
  rejects(d => { d.stations[0].extra = 1; }, /Unknown member stations\[0\]\.extra/);
  rejects(d => { delete d.stations[0].note; }, /Missing member stations\[0\]\.note/);
  rejects(d => { d.stations[0].note = 'x'.repeat(1001); }, /note/);
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
  rejects(d => { d.deployments[1].id = 'deployment-1'; }, /Duplicate deployment/);
  rejects(d => { d.deployments[0].id = 'bad id'; }, /deployments\[0\]\.id/);
  rejects(d => { d.deployments[0].name = ''; }, /deployments\[0\]\.name/);
  rejects(d => { d.deployments[0].stations = ['ghost']; }, /deployments\[0\]\.stations/);
  rejects(d => { d.deployments[0].stations = ['north', 'north']; }, /deployments\[0\]\.stations/);
  rejects(d => { d.deployments[0].extra = 1; }, /Unknown member deployments\[0\]\.extra/);
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
    settings
  });
  // Copies of a candidate got the candidate's ID; they are renumbered, and only the original keeps the candidate link.
  assert.deepEqual(legacy.stations.map(s => [s.id, s.candidateId, s.note]), [['north', 'north', ''], ['station-2', null, '']]);
  assert.deepEqual(legacy.deployments, []);
  validatePlan(legacy);
});

test('chosen deployments are extracted as their own plan', () => {
  const doc = plan();
  doc.detectors.long = structuredClone(doc.detectors.default); doc.detectors.long.response.exposureDays = 90;
  doc.detectors.unused = structuredClone(doc.detectors.default);
  doc.stations[1].detector = 'long';
  const full = parsePlan(JSON.stringify(doc));
  const one = extractDeployments(full, ['deployment-1']);
  assert.deepEqual(one.stations.map(s => s.id), ['north']);
  assert.deepEqual(one.deployments, [full.deployments[0]]);
  assert.deepEqual(Object.keys(one.detectors), ['default']);
  assert.equal(one.title, full.title); assert.deepEqual(one.scene, full.scene);
  const both = extractDeployments(full, ['both', 'deployment-1']);
  // Stations keep the pool order; deployments keep the plan's order; only used detectors stay (default is always kept).
  assert.deepEqual(both.stations.map(s => s.id), ['north', 'station-2']);
  assert.deepEqual(both.deployments.map(d => d.id), ['deployment-1', 'both']);
  assert.deepEqual(Object.keys(both.detectors), ['default', 'long']);
  assert.throws(() => extractDeployments(full, ['ghost']), /ghost/);
  assert.throws(() => extractDeployments(full, []), /at least one/);
  const emptyDoc = plan(); emptyDoc.deployments[0].stations = [];
  assert.throws(() => extractDeployments(parsePlan(JSON.stringify(emptyDoc)), ['deployment-1']), /no stations/);
});

test('the plan hash identifies the canonical text', () => {
  const hash = planHash(parsePlan(text));
  assert.match(hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(planHash(parsePlan(serializePlan(parsePlan(text)))), hash);
  const changed = plan(); changed.title = 'Other';
  assert.notEqual(planHash(parsePlan(JSON.stringify(changed))), hash);
});
