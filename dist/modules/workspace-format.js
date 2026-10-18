// Workspace format muography-workspace 2.0.0 (docs/specs/WORKSPACE_FORMAT.md, ADR-033).
// Pure: validation, canonical text, item hashes, global IDs, selection closure and migration
// from muography-plan 1.x. No DOM, storage or dataset access; the random source is injectable.
import { sha256Portable } from './sha256.js';
import { migratePlan, detectorFromSettings } from './plan-format.js';

export const WORKSPACE_FORMAT = 'muography-workspace';
export const WORKSPACE_SCHEMA_VERSION = '2.0.0';
export const WORKSPACE_APP = 'muography-deployment-evaluation';
const BASE32 = '0123456789abcdefghjkmnpqrstvwxyz';
const PREFIXES = ['det', 'site', 'sta', 'dep', 'study', 'ws'];
const idPattern = prefixes => new RegExp(`^(${prefixes.join('|')})-[${BASE32}]{16}$`);
const ITEM_ID = idPattern(['det', 'site', 'sta', 'dep', 'study']), ROOT_ID = idPattern(['sta', 'dep', 'study']);
const SCENE_ID = /^[A-Za-z0-9_.-]{1,64}$/, HASH = /^sha256:[0-9a-f]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DEVICE = { width: [.01, 5], height: [.01, 5], stripPitch: [.00005, .1], strips: [2, 4096, 'integer'], spacing: [.01, 5] };
const RESPONSE = { layerEfficiency: [.01, 1], deadLiveFraction: [.01, 1], angularResolutionDeg: [.01, 20], systematicFraction: [0, 1, 'positive'] };
const TOP = ['format', 'schemaVersion', 'contents', 'roots', 'release', 'units', 'provenance', 'detectors', 'sites', 'stations', 'deployments', 'studies'];
const DEFAULT_EXPOSURE_DAYS = 30;

const fail = message => { throw new Error(`Invalid workspace: ${message}`); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function members(value, path, keys) {
  if (!isObject(value)) fail(`${path || 'workspace'} must be an object`);
  const at = key => (path ? `${path}.` : '') + key;
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`Unknown member ${at(key)}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`Missing member ${at(key)}`);
}
const text = (value, path, max, { min = 0, nullable = false } = {}) => {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length < min || value.length > max) fail(`${path} must be ${nullable ? 'null or ' : ''}text of ${min}–${max} characters`);
};
const number = (value, path, [min, max, rule]) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (rule === 'integer' && !Number.isInteger(value)) || (rule === 'positive' && value <= 0)) {
    fail(`${path} must be ${rule === 'integer' ? 'an integer' : 'a number'} in ${rule === 'positive' ? `(${min}, ${max}]` : `[${min}, ${max}]`}`);
  }
};
const list = (value, path) => { if (!Array.isArray(value)) fail(`${path} must be a list`); return value; };
const ownId = (value, path, prefix) => { if (typeof value !== 'string' || !idPattern([prefix]).test(value)) fail(`${path} must be ${prefix}-<16 base32 characters>`); };

function checkVersion(version) {
  const match = typeof version === 'string' && /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail('schemaVersion must be a semantic version');
  const [major, minor] = [+match[1], +match[2]], [knownMajor, knownMinor] = WORKSPACE_SCHEMA_VERSION.split('.').map(Number);
  if (major > knownMajor || (major === knownMajor && minor > knownMinor)) fail(`schemaVersion ${version} is newer than this app understands (${WORKSPACE_SCHEMA_VERSION}); update the app`);
  if (major < knownMajor) fail(`schemaVersion ${version} is a muography-plan version; read it as a plan and convert it (selectionFromPlan)`);
}

// Each item in canonical member order (the order of the spec).
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const CANONICAL = {
  detector: d => ({ id: d.id, name: d.name, device: pick(d.device, ['model', 'layers', ...Object.keys(DEVICE)]), response: pick(d.response, [...Object.keys(RESPONSE), 'angularModel']) }),
  site: s => ({ id: s.id, name: s.name, position: [...s.position], frame: s.frame, candidateId: s.candidateId, note: s.note }),
  station: s => ({ id: s.id, name: s.name, placement: pick(s.placement, ['kind', 'site']), pose: pick(s.pose, ['azimuthDeg', 'elevationDeg']), detector: s.detector, note: s.note }),
  deployment: d => ({ id: d.id, name: d.name, stations: [...d.stations], note: d.note }),
  study: s => ({ id: s.id, title: s.title, scenes: s.scenes.map(c => ({ id: c.id, label: c.label, scenario: c.scenario, anomalies: [] })),
    deployments: [...s.deployments], exposure: pick(s.exposure, ['kind', 'days']), aim: null,
    basis: s.basis === null ? null : { recordedAt: s.basis.recordedAt, items: { ...s.basis.items } }, note: s.note })
};

function checkDetector(d, path) {
  members(d, path, ['id', 'name', 'device', 'response']);
  ownId(d.id, `${path}.id`, 'det'); text(d.name, `${path}.name`, 200, { min: 1 });
  members(d.device, `${path}.device`, ['model', 'layers', ...Object.keys(DEVICE)]);
  text(d.device.model, `${path}.device.model`, 100);
  if (d.device.layers !== 3) fail(`${path}.device.layers must be 3`);
  for (const [key, range] of Object.entries(DEVICE)) number(d.device[key], `${path}.device.${key}`, range);
  members(d.response, `${path}.response`, [...Object.keys(RESPONSE), 'angularModel']);
  for (const [key, range] of Object.entries(RESPONSE)) number(d.response[key], `${path}.response.${key}`, range);
  if (!['gaisser', 'cos2'].includes(d.response.angularModel)) fail(`${path}.response.angularModel must be gaisser or cos2`);
}
function checkSite(s, path) {
  members(s, path, ['id', 'name', 'position', 'frame', 'candidateId', 'note']);
  ownId(s.id, `${path}.id`, 'site'); text(s.name, `${path}.name`, 200, { min: 1 });
  if (!Array.isArray(s.position) || s.position.length !== 3 || !s.position.every(v => typeof v === 'number' && Number.isFinite(v))) fail(`${path}.position must be three finite numbers`);
  if (s.frame !== 'model_frame') fail(`${path}.frame must be model_frame`);
  text(s.candidateId, `${path}.candidateId`, 200, { min: 1, nullable: true }); text(s.note, `${path}.note`, 1000);
}
function checkStation(s, path) {
  members(s, path, ['id', 'name', 'placement', 'pose', 'detector', 'note']);
  ownId(s.id, `${path}.id`, 'sta'); text(s.name, `${path}.name`, 200, { min: 1 });
  if (!isObject(s.placement) || s.placement.kind !== 'site') fail(`${path}.placement.kind must be site (the only placement in ${WORKSPACE_SCHEMA_VERSION})`);
  members(s.placement, `${path}.placement`, ['kind', 'site']);
  members(s.pose, `${path}.pose`, ['azimuthDeg', 'elevationDeg']);
  number(s.pose.azimuthDeg, `${path}.pose.azimuthDeg`, [0, 359]); number(s.pose.elevationDeg, `${path}.pose.elevationDeg`, [0, 90]);
  text(s.note, `${path}.note`, 1000);
}
function checkDeployment(d, path) {
  members(d, path, ['id', 'name', 'stations', 'note']);
  ownId(d.id, `${path}.id`, 'dep'); text(d.name, `${path}.name`, 200, { min: 1 });
  if (new Set(list(d.stations, `${path}.stations`)).size !== d.stations.length) fail(`${path}.stations must list distinct station IDs`);
  text(d.note, `${path}.note`, 1000);
}
function checkStudy(s, path) {
  members(s, path, ['id', 'title', 'scenes', 'deployments', 'exposure', 'aim', 'basis', 'note']);
  ownId(s.id, `${path}.id`, 'study'); text(s.title, `${path}.title`, 200, { min: 1 });
  if (!list(s.scenes, `${path}.scenes`).length) fail(`${path}.scenes must list at least one scene`);
  const sceneIds = new Set();
  s.scenes.forEach((c, i) => {
    const at = `${path}.scenes[${i}]`;
    members(c, at, ['id', 'label', 'scenario', 'anomalies']);
    if (typeof c.id !== 'string' || !SCENE_ID.test(c.id)) fail(`${at}.id must match ${SCENE_ID}`);
    if (sceneIds.has(c.id)) fail(`Duplicate scene id ${c.id} in ${path}`);
    sceneIds.add(c.id);
    text(c.label, `${at}.label`, 100); text(c.scenario, `${at}.scenario`, 100, { min: 1, nullable: true });
    if (!Array.isArray(c.anomalies) || c.anomalies.length) fail(`${at}.anomalies must be empty in ${WORKSPACE_SCHEMA_VERSION}`);
  });
  if (new Set(list(s.deployments, `${path}.deployments`)).size !== s.deployments.length) fail(`${path}.deployments must list distinct deployment IDs`);
  if (!isObject(s.exposure) || s.exposure.kind !== 'constant') fail(`${path}.exposure.kind must be constant (the only exposure in ${WORKSPACE_SCHEMA_VERSION})`);
  members(s.exposure, `${path}.exposure`, ['kind', 'days']);
  number(s.exposure.days, `${path}.exposure.days`, [1, 3650, 'integer']);
  if (s.aim !== null) fail(`${path}.aim must be null in ${WORKSPACE_SCHEMA_VERSION}`);
  if (s.basis !== null) {
    members(s.basis, `${path}.basis`, ['recordedAt', 'items']);
    if (typeof s.basis.recordedAt !== 'string' || !UTC.test(s.basis.recordedAt)) fail(`${path}.basis.recordedAt must be a UTC time`);
    if (!isObject(s.basis.items) || !Object.keys(s.basis.items).length) fail(`${path}.basis.items must name at least one item`);
    for (const [id, hash] of Object.entries(s.basis.items)) if (!ITEM_ID.test(id) || typeof hash !== 'string' || !HASH.test(hash)) fail(`${path}.basis.items must map item IDs to sha256 hashes`);
  }
  text(s.note, `${path}.note`, 1000);
}

// The IDs a set of roots reaches: studies → deployments → stations → sites and detectors.
function closure(doc, roots) {
  const byId = new Map([...doc.detectors, ...doc.sites, ...doc.stations, ...doc.deployments, ...doc.studies].map(item => [item.id, item]));
  const reached = new Set(), visit = id => {
    if (reached.has(id)) return;
    const item = byId.get(id);
    if (!item) fail(`roots: unknown id ${id}`);
    reached.add(id);
    if (id.startsWith('study-')) item.deployments.forEach(visit);
    else if (id.startsWith('dep-')) item.stations.forEach(visit);
    else if (id.startsWith('sta-')) { visit(item.placement.site); visit(item.detector); }
  };
  roots.forEach(visit);
  return reached;
}

// Throws on the first problem; returns the workspace in canonical member order.
export function validateWorkspace(doc) {
  if (!isObject(doc)) fail('workspace must be an object');
  if (doc.format !== WORKSPACE_FORMAT) fail(`format must be ${WORKSPACE_FORMAT}`);
  checkVersion(doc.schemaVersion);
  members(doc, '', TOP);
  if (!['workspace', 'selection'].includes(doc.contents)) fail('contents must be workspace or selection');
  list(doc.roots, 'roots');
  if (doc.contents === 'workspace' && doc.roots.length) fail('roots must be empty in a workspace');
  if (doc.contents === 'selection' && (!doc.roots.length || !doc.roots.every(id => typeof id === 'string' && ROOT_ID.test(id)) || new Set(doc.roots).size !== doc.roots.length)) {
    fail('roots of a selection must list distinct station, deployment or study IDs');
  }
  members(doc.release, 'release', ['id', 'contentHash']);
  text(doc.release.id, 'release.id', 200, { min: 1 });
  if (doc.release.contentHash !== null && !HASH.test(doc.release.contentHash)) fail('release.contentHash must be null or sha256:<64 hex>');
  members(doc.units, 'units', ['length', 'angle']);
  if (doc.units.length !== 'm') fail('units.length must be m');
  if (doc.units.angle !== 'deg') fail('units.angle must be deg');
  members(doc.provenance, 'provenance', ['app', 'exportedAt', 'author', 'workspace']);
  text(doc.provenance.app, 'provenance.app', 100, { min: 1 });
  if (doc.provenance.exportedAt !== null && (typeof doc.provenance.exportedAt !== 'string' || !UTC.test(doc.provenance.exportedAt))) fail('provenance.exportedAt must be null or a UTC time');
  text(doc.provenance.author, 'provenance.author', 100);
  ownId(doc.provenance.workspace, 'provenance.workspace', 'ws');
  const kinds = [['detectors', checkDetector], ['sites', checkSite], ['stations', checkStation], ['deployments', checkDeployment], ['studies', checkStudy]];
  const seen = new Set();
  for (const [key, check] of kinds) list(doc[key], key).forEach((item, i) => {
    check(item, `${key}[${i}]`);
    if (seen.has(item.id)) fail(`Duplicate id ${item.id}`);
    seen.add(item.id);
  });
  if (doc.contents === 'workspace' && !doc.detectors.length) fail('a workspace holds at least one detector');
  const has = prefix => id => typeof id === 'string' && id.startsWith(`${prefix}-`) && seen.has(id);
  doc.stations.forEach((s, i) => {
    if (!has('site')(s.placement.site)) fail(`stations[${i}].placement.site: unknown site ${s.placement.site}`);
    if (!has('det')(s.detector)) fail(`stations[${i}].detector: unknown detector ${s.detector}`);
  });
  doc.deployments.forEach((d, i) => d.stations.forEach(id => { if (!has('sta')(id)) fail(`deployments[${i}].stations: unknown station ${id}`); }));
  doc.studies.forEach((s, i) => s.deployments.forEach(id => { if (!has('dep')(id)) fail(`studies[${i}].deployments: unknown deployment ${id}`); }));
  if (doc.contents === 'selection') {
    const reached = closure(doc, doc.roots);
    for (const id of seen) if (!reached.has(id)) fail(`${id} is not referenced by the roots; a selection holds exactly their closure`);
  }
  return {
    format: doc.format, schemaVersion: doc.schemaVersion, contents: doc.contents, roots: [...doc.roots],
    release: pick(doc.release, ['id', 'contentHash']), units: pick(doc.units, ['length', 'angle']),
    provenance: pick(doc.provenance, ['app', 'exportedAt', 'author', 'workspace']),
    detectors: doc.detectors.map(CANONICAL.detector), sites: doc.sites.map(CANONICAL.site), stations: doc.stations.map(CANONICAL.station),
    deployments: doc.deployments.map(CANONICAL.deployment), studies: doc.studies.map(CANONICAL.study)
  };
}

export function parseWorkspace(source) {
  let doc;
  try { doc = JSON.parse(source); } catch (error) { throw new Error(`Invalid workspace: not JSON (${error.message})`); }
  return validateWorkspace(doc);
}

export function serializeWorkspace(doc) {
  doc = validateWorkspace(doc);
  if (doc.schemaVersion !== WORKSPACE_SCHEMA_VERSION) fail(`only ${WORKSPACE_SCHEMA_VERSION} workspaces are written`);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const sha256 = value => `sha256:${sha256Portable(new TextEncoder().encode(value))}`;
// An item of a validated (canonical) workspace: its content without the ID. References are content.
export function itemHash(item) {
  const { id, ...content } = item;
  void id;
  return sha256(JSON.stringify(content));
}
export const workspaceHash = doc => sha256(serializeWorkspace(doc));

// <prefix>-<16 lowercase Crockford base32 characters> from 80 random bits.
const cryptoRandom = length => globalThis.crypto.getRandomValues(new Uint8Array(length));
export function newId(prefix, random = cryptoRandom) {
  if (!PREFIXES.includes(prefix)) throw new Error(`Unknown ID prefix ${prefix}`);
  const bytes = random(10);
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  return `${prefix}-${out}`;
}

const envelope = ({ contents, roots = [], release, contentHash = null, exportedAt = null, author = '', workspace }) => ({
  format: WORKSPACE_FORMAT, schemaVersion: WORKSPACE_SCHEMA_VERSION, contents, roots,
  release: { id: release, contentHash }, units: { length: 'm', angle: 'deg' },
  provenance: { app: WORKSPACE_APP, exportedAt, author, workspace } });

// A release opened for the first time: one detector, nothing saved (playground first).
export function createWorkspace({ release, contentHash = null, detector, random = cryptoRandom }) {
  return validateWorkspace({ ...envelope({ contents: 'workspace', release, contentHash, workspace: newId('ws', random) }),
    detectors: [{ id: newId('det', random), name: detector.name, device: detector.device, response: detector.response }],
    sites: [], stations: [], deployments: [], studies: [] });
}

// The export of some stations, deployments or studies: the roots plus everything they reference, each
// kind in workspace order (WORKSPACE_FORMAT.md, Export).
export function selectWorkspace(doc, roots, { exportedAt = null, author = '' } = {}) {
  doc = validateWorkspace(doc);
  if (!Array.isArray(roots) || !roots.length) throw new Error('Choose at least one item to export');
  for (const id of roots) if (typeof id !== 'string' || !ROOT_ID.test(id)) throw new Error(`Only a station, deployment or study can be exported (${id})`);
  const reached = closure(doc, roots), keep = items => items.filter(item => reached.has(item.id));
  return validateWorkspace({ ...envelope({ contents: 'selection', roots: [...roots], release: doc.release.id, contentHash: doc.release.contentHash,
    exportedAt, author, workspace: doc.provenance.workspace }),
    detectors: keep(doc.detectors), sites: keep(doc.sites), stations: keep(doc.stations), deployments: keep(doc.deployments), studies: keep(doc.studies) });
}

// Study scenes naming scenarios the open release lacks (null means the release's first and always exists).
export function missingScenarios(doc, scenarioIds) {
  const known = new Set(scenarioIds);
  return doc.studies.flatMap(study => study.scenes.filter(scene => scene.scenario !== null && !known.has(scene.scenario))
    .map(scene => ({ study: study.id, scene: scene.id, scenario: scene.scenario })));
}

// --- Migration from muography-plan 1.x -----------------------------------------------------------
export const detectorWithoutExposure = detector => {
  const { exposureDays, ...response } = detector.response;
  void exposureDays;
  return { device: { ...detector.device }, response };
};
const withoutExposure = detectorWithoutExposure;
// Detectors are the same device when device and response agree, whatever their ID, name or exposure.
export const deviceKey = detector => JSON.stringify(withoutExposure(detector));

// Converts 1.x studies ({ id, plan, session }) of one release into one workspace (WORKSPACE_FORMAT.md,
// Migration). Detectors equal apart from exposure merge across studies; sites merge only for exactly
// equal position and candidate within one study; every study keeps a 候选池 deployment; differing
// exposures are noted on the study and reported. Returns { workspace, session, report }.
export function migrateStudies({ release, contentHash = null, studies, active = null, random = cryptoRandom }) {
  const detectors = [], detectorIds = new Map(), sites = [], stations = [], deployments = [], migrated = [], report = [];
  let session = { version: 1, activeStudy: null, activeDeployment: null, shown: [], exposureDays: DEFAULT_EXPOSURE_DAYS, working: null };
  const detectorFor = (name, detector) => {
    const key = deviceKey(detector);
    if (!detectorIds.has(key)) {
      const id = newId('det', random);
      detectorIds.set(key, id);
      detectors.push({ id, name, ...withoutExposure(detector) });
    }
    return detectorIds.get(key);
  };
  studies.forEach(({ id: legacyId, plan: source, session: legacySession }, index) => {
    const plan = migratePlan(source);
    if (plan.scene.release !== release) throw new Error(`Study ${legacyId} belongs to ${plan.scene.release}, not ${release}`);
    const title = plan.title || `工作方案 ${index + 1}`, stationIds = new Map(), siteIds = new Map();
    plan.stations.forEach((s, i) => {
      const siteKey = JSON.stringify([s.position, s.candidateId]);
      if (!siteIds.has(siteKey)) {
        const id = newId('site', random);
        siteIds.set(siteKey, id);
        sites.push({ id, name: s.name || `点位 ${i + 1}`, position: [...s.position], frame: 'model_frame', candidateId: s.candidateId, note: '' });
      }
      const id = newId('sta', random);
      stationIds.set(s.id, id);
      stations.push({ id, name: s.name || `点位 ${i + 1}`, placement: { kind: 'site', site: siteIds.get(siteKey) }, pose: { ...s.pose },
        detector: detectorFor(s.detector, plan.detectors[s.detector]), note: s.note });
    });
    const pool = { id: newId('dep', random), name: `${title} · 候选池`.slice(0, 200), stations: plan.stations.map(s => stationIds.get(s.id)), note: '' };
    const deploymentIds = new Map(plan.deployments.map(d => [d.id, newId('dep', random)]));
    deployments.push(pool, ...plan.deployments.map(d => ({ id: deploymentIds.get(d.id), name: d.name, stations: d.stations.map(id => stationIds.get(id)), note: '' })));
    const days = plan.detectors.default.response.exposureDays;
    const differing = [...new Set(plan.stations.map(s => s.detector))].filter(name => plan.detectors[name].response.exposureDays !== days)
      .map(name => `1.x: detector "${name}" used ${plan.detectors[name].response.exposureDays} days; this study uses ${days} days for all stations.`);
    if (differing.length) report.push(`${title}: ${differing.join(' ')}`);
    const study = { id: newId('study', random), title: title.slice(0, 200), scenes: [{ id: 's1', label: plan.scene.scenario ?? '', scenario: plan.scene.scenario, anomalies: [] }],
      deployments: [pool.id, ...plan.deployments.map(d => deploymentIds.get(d.id))], exposure: { kind: 'constant', days }, aim: null, basis: null,
      note: differing.join('\n').slice(0, 1000) };
    migrated.push(study);
    if (legacyId === active) session = migrateSession(legacySession, { study, stationIds, deploymentIds, stations, detectorIds });
  });
  const workspace = validateWorkspace({ ...envelope({ contents: 'workspace', release, contentHash, workspace: newId('ws', random) }),
    detectors, sites, stations, deployments, studies: migrated });
  return { workspace, session, report };
}

// The active 1.x study's session: the working station becomes the draft (its exposure the playground
// exposure), the compared candidates the shown set, the active deployment its new ID.
function migrateSession(legacy, { study, stationIds, deploymentIds, stations }) {
  const result = { version: 1, activeStudy: study.id, activeDeployment: deploymentIds.get(legacy?.activeDeployment) ?? null,
    shown: (Array.isArray(legacy?.compare) ? legacy.compare : []).map(id => stationIds.get(id)).filter(Boolean),
    exposureDays: DEFAULT_EXPOSURE_DAYS, working: null };
  const w = legacy?.working;
  if (w && typeof w === 'object' && typeof w.model === 'string' && w.settings && ['x', 'y', 'z', 'az', 'el'].every(key => Number.isFinite(w[key]))) {
    const station = stationIds.get(w.from) ?? null, { device, response } = withoutExposure(detectorFromSettings(w.model, w.settings));
    if (Number.isInteger(w.settings.exposureDays) && w.settings.exposureDays >= 1 && w.settings.exposureDays <= 3650) result.exposureDays = w.settings.exposureDays;
    result.working = { site: station ? stations.find(s => s.id === station).placement.site : null, station, name: String(w.name ?? ''),
      position: [w.x, w.y, w.z], pose: { azimuthDeg: w.az, elevationDeg: w.el }, device, response };
  }
  return result;
}

// A muography-plan 1.x file as an import: a selection whose one root is the converted study.
export function selectionFromPlan(plan, { exportedAt = null, random = cryptoRandom } = {}) {
  plan = migratePlan(plan);
  const { workspace } = migrateStudies({ release: plan.scene.release, contentHash: plan.scene.contentHash, studies: [{ id: 'plan', plan, session: null }], random });
  return selectWorkspace(workspace, [workspace.studies[0].id], { exportedAt });
}
