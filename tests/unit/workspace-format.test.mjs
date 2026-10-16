import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan } from '../../dist/modules/plan-format.js';
import { WORKSPACE_SCHEMA_VERSION, validateWorkspace, parseWorkspace, serializeWorkspace, itemHash, workspaceHash, newId, createWorkspace,
  selectWorkspace, migrateStudies, selectionFromPlan, missingScenarios } from '../../dist/modules/workspace-format.js';

// muography-workspace 2.0.0 (docs/specs/WORKSPACE_FORMAT.md, ADR-033).
const example = name => readFile(new URL(`../../docs/specs/examples/${name}`, import.meta.url), 'utf8');
const fullText = await example('workspace-2.0-full.json'), selectionText = await example('workspace-2.0-selection.json');
const planText = await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8');
const full = () => JSON.parse(fullText), selection = () => JSON.parse(selectionText);
const rejects = (mutate, pattern, from = full) => { const doc = from(); mutate(doc); assert.throws(() => validateWorkspace(doc), pattern); };
// Deterministic "random" bytes for IDs: 0, 1, 2, … across calls.
const counter = () => { let n = 0; return length => Uint8Array.from({ length }, () => n++ % 256); };
const ID = /^(det|site|sta|dep|study|ws)-[0-9a-hjkmnp-tv-z]{16}$/;

test('load then save gives a byte-identical file, whatever the member order', () => {
  assert.equal(WORKSPACE_SCHEMA_VERSION, '2.0.0');
  assert.equal(serializeWorkspace(parseWorkspace(fullText)), fullText);
  assert.equal(serializeWorkspace(parseWorkspace(selectionText)), selectionText);
  const reversed = value => Array.isArray(value) ? value.map(reversed)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)])) : value;
  assert.equal(serializeWorkspace(parseWorkspace(JSON.stringify(reversed(full())))), fullText);
  assert.throws(() => parseWorkspace('{'), /not JSON/);
});

test('structure: versions, members, ranges and kinds', () => {
  rejects(d => { d.schemaVersion = '2.1.0'; }, /newer than this app/);
  rejects(d => { d.schemaVersion = '3.0.0'; }, /newer than this app/);
  rejects(d => { d.schemaVersion = '1.1.0'; }, /muography-plan/);
  rejects(d => { d.format = 'muography-plan'; }, /format/);
  rejects(d => { d.results = []; }, /Unknown member results/);
  rejects(d => { delete d.studies; }, /Missing member studies/);
  rejects(d => { d.units.length = 'mm'; }, /units.length/);
  rejects(d => { d.release.contentHash = 'md5:1'; }, /contentHash/);
  rejects(d => { d.provenance.exportedAt = 'yesterday'; }, /exportedAt/);
  rejects(d => { d.provenance.workspace = 'study-0123456789abcdef'; }, /provenance.workspace/);
  rejects(d => { d.detectors[0].response.exposureDays = 30; }, /Unknown member detectors\[0\].response.exposureDays/);
  rejects(d => { d.detectors[0].device.strips = 2.5; }, /strips/);
  rejects(d => { d.sites[0].frame = 'doc_frame'; }, /frame/);
  rejects(d => { d.sites[0].position = [1, 2]; }, /position/);
  rejects(d => { d.sites[0].name = ''; }, /name/);
  rejects(d => { d.stations[0].placement = { kind: 'carrier-mount', site: d.sites[0].id }; }, /placement.kind/);
  rejects(d => { d.stations[0].exposure = { kind: 'constant', days: 30 }; }, /Unknown member stations\[0\].exposure/);
  rejects(d => { d.stations[0].pose.elevationDeg = 91; }, /elevationDeg/);
  rejects(d => { d.studies[0].exposure = { kind: 'periods', periods: [] }; }, /exposure.kind/);
  rejects(d => { d.studies[0].exposure.days = 0; }, /exposure.days/);
  rejects(d => { d.studies[0].scenes = []; }, /scenes/);
  rejects(d => { d.studies[0].scenes[1].id = 'low'; }, /Duplicate scene id low/);
  rejects(d => { d.studies[0].scenes[0].anomalies = [{}]; }, /anomalies/);
  rejects(d => { d.studies[0].aim = {}; }, /aim/);
  rejects(d => { d.studies[0].basis = { recordedAt: '2026-10-17T00:00:00Z', items: { [d.sites[0].id]: 'sha256:x' } }; }, /basis/);
  rejects(d => { d.stations[0].note = 'x'.repeat(1001); }, /note/);
});

test('identity and references: global IDs, unique, resolvable', () => {
  rejects(d => { d.stations[0].id = 'station-3'; }, /stations\[0\].id/);
  rejects(d => { d.sites[0].id = 'site-ilou000000000000'; }, /sites\[0\].id/);
  rejects(d => { d.stations[0].id = 'sta-0000000000000000'; d.stations[1].id = 'sta-0000000000000000'; }, /Duplicate id/);
  rejects(d => { d.stations[0].placement.site = 'site-0000000000000000'; }, /unknown site/);
  rejects(d => { d.stations[0].detector = 'det-0000000000000000'; }, /unknown detector/);
  rejects(d => { d.deployments[0].stations.push('sta-0000000000000000'); }, /unknown station/);
  rejects(d => { d.deployments[0].stations.push(d.deployments[0].stations[0]); }, /distinct/);
  rejects(d => { d.studies[0].deployments = ['dep-0000000000000000']; }, /unknown deployment/);
  // A basis may name items deleted since the conclusion; only its hashes are checked.
  const doc = full();
  doc.studies[0].basis = { recordedAt: '2026-10-17T08:00:00Z', items: { 'sta-0000000000000000': `sha256:${'a'.repeat(64)}` } };
  assert.doesNotThrow(() => validateWorkspace(doc));
});

test('contents: a workspace has no roots and a detector; a selection holds exactly its closure', () => {
  rejects(d => { d.roots = [d.stations[0].id]; }, /roots/);
  rejects(d => { d.detectors = []; d.stations = []; d.deployments = []; d.studies = []; }, /at least one detector/);
  rejects(d => { d.roots = []; }, /roots/, selection);
  rejects(d => { d.roots = [d.sites[0].id]; }, /roots/, selection);
  rejects(d => { d.roots = ['dep-0000000000000000']; }, /unknown/, selection);
  rejects(d => { d.sites.push({ ...d.sites[0], id: 'site-0000000000000000' }); }, /not referenced by the roots/, selection);
  rejects(d => { d.roots = [d.stations[0].id]; }, /not referenced by the roots/, selection);
  // A workspace may hold unreferenced items (a saved station in no deployment).
  const doc = full(); doc.deployments = [doc.deployments[1]]; doc.studies[0].deployments = [doc.deployments[0].id];
  assert.doesNotThrow(() => validateWorkspace(doc));
});

test('item hash: content without the ID; references count, names of referenced items do not', () => {
  const doc = parseWorkspace(fullText), [a, b] = doc.stations;
  assert.match(itemHash(a), /^sha256:[0-9a-f]{64}$/);
  assert.equal(itemHash(a), itemHash({ ...a, id: 'sta-0000000000000000' }));
  assert.notEqual(itemHash(a), itemHash(b));
  const renamedSite = structuredClone(doc); renamedSite.sites[0].name = 'Renamed';
  assert.equal(itemHash(renamedSite.stations[0]), itemHash(a));
  assert.notEqual(itemHash(renamedSite.sites[0]), itemHash(doc.sites[0]));
  const moved = structuredClone(doc); moved.stations[0].placement.site = doc.sites[1].id;
  assert.notEqual(itemHash(moved.stations[0]), itemHash(a));
  assert.match(workspaceHash(doc), /^sha256:[0-9a-f]{64}$/);
});

test('new IDs: prefix and 16 Crockford base32 characters from the random source', () => {
  const random = counter(), first = newId('sta', random), second = newId('sta', random);
  assert.match(first, ID); assert.match(second, ID); assert.notEqual(first, second);
  assert.equal(newId('site', counter()), newId('site', counter()));
  assert.match(newId('dep'), ID);
  assert.throws(() => newId('station'), /prefix/);
});

test('an empty workspace has one detector and nothing else', () => {
  const doc = createWorkspace({ release: 'subject@1.0.0', detector: { name: 'default', device: full().detectors[0].device, response: full().detectors[0].response }, random: counter() });
  assert.deepEqual([doc.contents, doc.roots, doc.detectors.length, doc.sites, doc.stations, doc.deployments, doc.studies],
    ['workspace', [], 1, [], [], [], []]);
  assert.match(doc.provenance.workspace, ID);
  assert.equal(doc.provenance.exportedAt, null);
  assert.equal(serializeWorkspace(doc), serializeWorkspace(validateWorkspace(doc)));
});

test('a selection holds its roots and their closure, in workspace order', () => {
  const doc = parseWorkspace(fullText), [dep1, dep2] = doc.deployments;
  const one = selectWorkspace(doc, [dep1.id], { exportedAt: '2026-10-20T08:30:00Z', author: '' });
  assert.equal(serializeWorkspace(one), selectionText);
  const study = selectWorkspace(doc, [doc.studies[0].id], { exportedAt: '2026-10-20T08:30:00Z' });
  assert.deepEqual([study.roots, study.deployments.map(d => d.id), study.stations.length, study.sites.length, study.detectors.length],
    [[doc.studies[0].id], [dep1.id, dep2.id], 3, 2, 1]);
  const stations = selectWorkspace(doc, [doc.stations[2].id, doc.stations[0].id], { exportedAt: '2026-10-20T08:30:00Z' });
  assert.deepEqual(stations.roots, [doc.stations[2].id, doc.stations[0].id]);
  assert.deepEqual(stations.stations.map(s => s.id), [doc.stations[0].id, doc.stations[2].id]);
  assert.equal(stations.deployments.length, 0);
  assert.throws(() => selectWorkspace(doc, [], {}), /at least one/);
  assert.throws(() => selectWorkspace(doc, [doc.sites[0].id], {}), /station, deployment or study/);
  assert.throws(() => selectWorkspace(doc, ['dep-0000000000000000'], {}), /unknown/);
  assert.throws(() => selectWorkspace(selectWorkspace(doc, [dep2.id], {}), [dep1.id], {}), /unknown/);
  void dep2;
});

test('scenes are checked against the scenarios of the open release', () => {
  const doc = parseWorkspace(fullText);
  assert.deepEqual(missingScenarios(doc, ['low', 'mid', 'high']), []);
  assert.deepEqual(missingScenarios(doc, ['low']), [{ study: doc.studies[0].id, scene: 'mid', scenario: 'mid' }]);
  doc.studies[0].scenes[0].scenario = null;
  assert.deepEqual(missingScenarios(doc, ['mid']), []);
});

// Two 1.x studies: A with a second pose at north (own detector differing only in exposure), B a plain copy with
// an empty title and an empty station name.
function legacyStudies() {
  const a = parsePlan(planText), b = parsePlan(planText);
  a.detectors['detector-2'] = structuredClone(a.detectors.default);
  a.detectors['detector-2'].response.exposureDays = 60;
  a.stations.push({ ...structuredClone(a.stations[0]), id: 'north-steep', name: '北侧 · 陡角', pose: { azimuthDeg: 0, elevationDeg: 45 }, detector: 'detector-2' });
  a.deployments[1].stations.push('north-steep');
  b.title = ''; b.stations[1].name = '';
  const working = { from: 'north', name: '北侧点位', x: 12.5, y: 122, z: 57, az: 10, el: 25, model: 'test-telescope',
    settings: { width: 0.4096, height: 0.4096, stripPitch: 0.0016, strips: 256, spacing: 0.15, layerEfficiency: 0.95, deadLiveFraction: 0.98,
      angularResolutionDeg: 0.3, systematicFraction: 0.03, exposureDays: 45, angularModel: 'gaisser' } };
  return [{ id: 'study-1', plan: a, session: { activeStation: 'north', working, compare: ['station-2', 'north-steep'], activeDeployment: 'both' } },
    { id: 'study-2', plan: b, session: null }];
}

test('1.x studies migrate without loss: sites, detectors, stations, deployments, studies', () => {
  const { workspace: ws, report } = migrateStudies({ release: 'subject@1.0.0', studies: legacyStudies(), active: 'study-1', random: counter() });
  assert.equal(serializeWorkspace(ws), serializeWorkspace(validateWorkspace(ws)));
  for (const item of [...ws.detectors, ...ws.sites, ...ws.stations, ...ws.deployments, ...ws.studies]) assert.match(item.id, ID);
  // Detectors equal apart from exposure merge, also across studies.
  assert.equal(ws.detectors.length, 1);
  assert.equal(ws.detectors[0].name, 'default');
  // Sites: exact position and candidate within one study only (north + north-steep share; study B gets its own).
  assert.equal(ws.sites.length, 4);
  const [aNorth, aSecond, aSteep, bNorth, bSecond] = ws.stations;
  assert.equal(aNorth.placement.site, aSteep.placement.site);
  assert.notEqual(aNorth.placement.site, bNorth.placement.site);
  assert.notEqual(aNorth.placement.site, aSecond.placement.site);
  assert.deepEqual(ws.sites.find(s => s.id === aNorth.placement.site), { id: aNorth.placement.site, name: '北侧点位', position: [12.5, 122, 57], frame: 'model_frame', candidateId: 'north', note: '' });
  // Stations keep names and notes; an empty name gets a fallback.
  assert.deepEqual(ws.stations.map(s => s.name), ['北侧点位', '新候选点 2', '北侧 · 陡角', '北侧点位', '点位 2']);
  assert.equal(aSecond.note, 'Second pose of the same gallery');
  assert.deepEqual(aSteep.pose, { azimuthDeg: 0, elevationDeg: 45 });
  // Deployments: the 候选池 first, then the 1.x deployments with their members mapped.
  const [studyA, studyB] = ws.studies, byId = id => ws.deployments.find(d => d.id === id);
  assert.deepEqual(studyA.deployments.map(id => byId(id).name), ['Synthetic study · 候选池', '北侧单站', 'Both stations']);
  assert.deepEqual(byId(studyA.deployments[0]).stations, [aNorth.id, aSecond.id, aSteep.id]);
  assert.deepEqual(byId(studyA.deployments[2]).stations, [aSecond.id, aNorth.id, aSteep.id]);
  assert.deepEqual(studyB.deployments.map(id => byId(id).name), ['工作方案 2 · 候选池', '北侧单站', 'Both stations']);
  // Studies: title fallback, the plan's scenario as the one scene, exposure from the default detector.
  assert.deepEqual([studyA.title, studyB.title], ['Synthetic study', '工作方案 2']);
  assert.deepEqual(studyA.scenes, [{ id: 's1', label: 'low', scenario: 'low', anomalies: [] }]);
  assert.deepEqual(studyA.exposure, { kind: 'constant', days: 30 });
  assert.deepEqual([studyA.aim, studyA.basis], [null, null]);
  // A detector with another exposure is reported, in the note and in the report.
  assert.match(studyA.note, /detector "detector-2" used 60 days; this study uses 30 days for all stations/);
  assert.equal(studyB.note, '');
  assert.equal(report.length, 1);
  assert.match(report[0], /Synthetic study/);
});

test('1.x session: working station becomes the draft, compare the shown set, exposure the playground exposure', () => {
  const { workspace: ws, session } = migrateStudies({ release: 'subject@1.0.0', studies: legacyStudies(), active: 'study-1', random: counter() });
  const [aNorth, aSecond, aSteep] = ws.stations;
  assert.equal(session.version, 1);
  assert.equal(session.activeStudy, ws.studies[0].id);
  assert.equal(session.activeDeployment, ws.studies[0].deployments[2]);
  assert.deepEqual(session.shown, [aSecond.id, aSteep.id]);
  assert.equal(session.exposureDays, 45);
  assert.deepEqual(session.working, { site: aNorth.placement.site, station: aNorth.id, name: '北侧点位', position: [12.5, 122, 57],
    pose: { azimuthDeg: 10, elevationDeg: 25 }, device: ws.detectors[0].device, response: ws.detectors[0].response });
  // Without a session for the active study: no draft, default exposure, nothing shown.
  const plain = migrateStudies({ release: 'subject@1.0.0', studies: legacyStudies(), active: 'study-2', random: counter() }).session;
  assert.deepEqual([plain.activeStudy, plain.working, plain.shown, plain.exposureDays, plain.activeDeployment],
    [ws.studies[1].id, null, [], 30, null]);
});

test('migration refuses studies of another release', () => {
  const studies = legacyStudies();
  assert.throws(() => migrateStudies({ release: 'other@1.0.0', studies, active: 'study-1', random: counter() }), /subject@1.0.0/);
});

test('a 1.x plan file becomes a selection with one study as root', () => {
  const doc = selectionFromPlan(parsePlan(planText), { exportedAt: '2026-10-20T08:30:00Z', random: counter() });
  assert.equal(doc.contents, 'selection');
  assert.deepEqual(doc.roots, [doc.studies[0].id]);
  assert.equal(doc.release.id, 'subject@1.0.0');
  assert.deepEqual([doc.stations.length, doc.deployments.length, doc.studies.length], [2, 3, 1]);
  assert.equal(serializeWorkspace(doc), serializeWorkspace(validateWorkspace(doc)));
});
