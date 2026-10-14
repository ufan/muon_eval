// Plan format muography-plan 1.0.0 (docs/specs/PLAN_FORMAT.md; FR-P1, FR-P2, ADR-006).
// Pure: validation, migration, canonical text and conversion to and from the app's
// deployment state. No DOM, storage or dataset access.
import { sha256Portable } from './sha256.js';

export const PLAN_FORMAT = 'muography-plan';
export const PLAN_SCHEMA_VERSION = '1.0.0';
const ID = /^[A-Za-z0-9_.-]{1,64}$/;
const DEVICE = { width: [.01, 5], height: [.01, 5], stripPitch: [.00005, .1], strips: [2, 4096, 'integer'], spacing: [.01, 5] };
const RESPONSE = { layerEfficiency: [.01, 1], deadLiveFraction: [.01, 1], angularResolutionDeg: [.01, 20],
  systematicFraction: [0, 1, 'positive'], exposureDays: [1, 3650, 'integer'] };

const fail = message => { throw new Error(`Invalid plan: ${message}`); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function members(value, path, required, optional = []) {
  if (!isObject(value)) fail(`${path || 'plan'} must be an object`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`Unknown member ${path ? path + '.' : ''}${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`Missing member ${path ? path + '.' : ''}${key}`);
}
const text = (value, path, max, { nullable = false, min = 0 } = {}) => {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length < min || value.length > max) fail(`${path} must be ${nullable ? 'null or ' : ''}text of ${min}–${max} characters`);
};
const number = (value, path, [min, max, rule]) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (rule === 'integer' && !Number.isInteger(value)) || (rule === 'positive' && value <= 0)) {
    fail(`${path} must be ${rule === 'integer' ? 'an integer' : 'a number'} in ${rule === 'positive' ? `(${min}, ${max}]` : `[${min}, ${max}]`}`);
  }
};

function checkVersion(version) {
  const match = typeof version === 'string' && /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail('schemaVersion must be a semantic version');
  const [major, minor] = [+match[1], +match[2]], [knownMajor, knownMinor] = PLAN_SCHEMA_VERSION.split('.').map(Number);
  if (major > knownMajor || (major === knownMajor && minor > knownMinor)) fail(`schemaVersion ${version} is newer than this app understands (${PLAN_SCHEMA_VERSION}); update the app`);
  if (major < knownMajor) fail(`schemaVersion ${version} has no migration`);
}

// Throws on the first problem; returns the plan in canonical member order.
export function validatePlan(doc) {
  members(doc, '', ['format', 'schemaVersion', 'title', 'scene', 'units', 'detectors', 'stations', 'deployment', 'anomalies']);
  if (doc.format !== PLAN_FORMAT) fail(`format must be ${PLAN_FORMAT}`);
  checkVersion(doc.schemaVersion);
  text(doc.title, 'title', 200);
  members(doc.scene, 'scene', ['release', 'contentHash', 'scenario']);
  text(doc.scene.release, 'scene.release', 200, { min: 1 });
  if (doc.scene.contentHash !== null && !/^sha256:[0-9a-f]{64}$/.test(doc.scene.contentHash)) fail('scene.contentHash must be null or sha256:<64 hex>');
  text(doc.scene.scenario, 'scene.scenario', 100, { nullable: true, min: 1 });
  members(doc.units, 'units', ['length', 'angle', 'frame']);
  for (const [key, value] of Object.entries({ length: 'm', angle: 'deg', frame: 'model_frame' })) if (doc.units[key] !== value) fail(`units.${key} must be ${value}`);
  if (!isObject(doc.detectors) || !Object.hasOwn(doc.detectors, 'default')) fail('detectors must contain default');
  for (const [name, detector] of Object.entries(doc.detectors)) {
    const path = `detectors.${name}`;
    if (!ID.test(name)) fail(`${path}: invalid detector name`);
    members(detector, path, ['device', 'response']);
    members(detector.device, `${path}.device`, ['model', 'layers', ...Object.keys(DEVICE)]);
    text(detector.device.model, `${path}.device.model`, 100);
    if (detector.device.layers !== 3) fail(`${path}.device.layers must be 3`);
    for (const [key, range] of Object.entries(DEVICE)) number(detector.device[key], `${path}.device.${key}`, range);
    members(detector.response, `${path}.response`, [...Object.keys(RESPONSE), 'angularModel']);
    for (const [key, range] of Object.entries(RESPONSE)) number(detector.response[key], `${path}.response.${key}`, range);
    if (!['gaisser', 'cos2'].includes(detector.response.angularModel)) fail(`${path}.response.angularModel must be gaisser or cos2`);
  }
  if (!Array.isArray(doc.stations) || !doc.stations.length) fail('stations must list at least one station');
  const ids = new Set();
  doc.stations.forEach((station, i) => {
    const path = `stations[${i}]`;
    members(station, path, ['id', 'name', 'position', 'pose', 'candidateId', 'detector']);
    if (typeof station.id !== 'string' || !ID.test(station.id)) fail(`${path}.id must match ${ID}`);
    if (ids.has(station.id)) fail(`Duplicate station id ${station.id}`);
    ids.add(station.id);
    text(station.name, `${path}.name`, 200);
    if (!Array.isArray(station.position) || station.position.length !== 3 || !station.position.every(v => typeof v === 'number' && Number.isFinite(v))) fail(`${path}.position must be three finite numbers`);
    members(station.pose, `${path}.pose`, ['azimuthDeg', 'elevationDeg']);
    number(station.pose.azimuthDeg, `${path}.pose.azimuthDeg`, [0, 359]);
    number(station.pose.elevationDeg, `${path}.pose.elevationDeg`, [0, 90]);
    text(station.candidateId, `${path}.candidateId`, 200, { nullable: true, min: 1 });
    if (typeof station.detector !== 'string' || !Object.hasOwn(doc.detectors, station.detector)) fail(`${path}.detector must name an entry of detectors`);
  });
  members(doc.deployment, 'deployment', ['selected', 'active']);
  if (!Array.isArray(doc.deployment.selected) || new Set(doc.deployment.selected).size !== doc.deployment.selected.length
    || !doc.deployment.selected.every(id => ids.has(id))) fail('deployment.selected must list distinct station ids');
  if (!ids.has(doc.deployment.active)) fail('deployment.active must name a station');
  if (!Array.isArray(doc.anomalies) || doc.anomalies.length) fail('anomalies must be empty in 1.0');
  return canonical(doc);
}

// Canonical member order (the order of the spec) for byte-identical round trips.
function canonical(doc) {
  const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
  return {
    format: doc.format, schemaVersion: doc.schemaVersion, title: doc.title,
    scene: pick(doc.scene, ['release', 'contentHash', 'scenario']),
    units: pick(doc.units, ['length', 'angle', 'frame']),
    detectors: Object.fromEntries(Object.entries(doc.detectors).map(([name, d]) => [name, {
      device: pick(d.device, ['model', 'layers', ...Object.keys(DEVICE)]),
      response: pick(d.response, [...Object.keys(RESPONSE).slice(0, 4), 'exposureDays', 'angularModel']) }])),
    stations: doc.stations.map(s => ({ id: s.id, name: s.name, position: [...s.position],
      pose: pick(s.pose, ['azimuthDeg', 'elevationDeg']), candidateId: s.candidateId, detector: s.detector })),
    deployment: { selected: [...doc.deployment.selected], active: doc.deployment.active },
    anomalies: []
  };
}

// Older versions of the same major are upgraded here, step by step (none yet).
export function migratePlan(doc) {
  return validatePlan(doc);
}

export function parsePlan(source) {
  let doc;
  try { doc = JSON.parse(source); } catch (error) { throw new Error(`Invalid plan: not JSON (${error.message})`); }
  return migratePlan(doc);
}

export const serializePlan = plan => `${JSON.stringify(validatePlan(plan), null, 2)}\n`;

// Synchronous so every assessment input can carry its plan reference.
export function planHash(plan) {
  return `sha256:${sha256Portable(new TextEncoder().encode(serializePlan(plan)))}`;
}

const SETTINGS_DEVICE = ['width', 'height', 'stripPitch', 'strips', 'spacing'];
const SETTINGS_RESPONSE = ['layerEfficiency', 'deadLiveFraction', 'angularResolutionDeg', 'systematicFraction', 'exposureDays', 'angularModel'];

// App state: flat stations { id, name, x, y, z, az, el, candidateId }, the active index,
// selected station ids and the device settings form values (deviceSettingsData).
export function planFromState({ title = '', release, scenario = null, contentHash = null, model, stations, activeIndex = 0, selected = [], settings }) {
  const plan = {
    format: PLAN_FORMAT, schemaVersion: PLAN_SCHEMA_VERSION, title,
    scene: { release, contentHash, scenario },
    units: { length: 'm', angle: 'deg', frame: 'model_frame' },
    detectors: { default: {
      device: { model, layers: 3, ...Object.fromEntries(SETTINGS_DEVICE.map(key => [key, settings[key]])) },
      response: Object.fromEntries(SETTINGS_RESPONSE.map(key => [key, settings[key]])) } },
    stations: stations.map(s => ({ id: s.id, name: s.name, position: [s.x, s.y, s.z], pose: { azimuthDeg: s.az, elevationDeg: s.el },
      candidateId: s.candidateId ?? null, detector: 'default' })),
    deployment: { selected: [...selected], active: stations[activeIndex]?.id },
    anomalies: []
  };
  return validatePlan(plan);
}

export function stateFromPlan(plan) {
  plan = validatePlan(plan);
  const detector = plan.detectors.default;
  return {
    stations: plan.stations.map(s => ({ id: s.id, name: s.name, x: s.position[0], y: s.position[1], z: s.position[2],
      az: s.pose.azimuthDeg, el: s.pose.elevationDeg, candidateId: s.candidateId })),
    activeIndex: plan.stations.findIndex(s => s.id === plan.deployment.active),
    selected: [...plan.deployment.selected],
    settings: { ...Object.fromEntries(SETTINGS_DEVICE.map(key => [key, detector.device[key]])), ...detector.response },
    model: detector.device.model
  };
}

// One-time conversion of browser storage from before plans: copies of a station kept
// its ID, so IDs are made unique and only the first keeps the candidate link.
export function planFromLegacyStorage({ release, scenario = null, title = '', model, candidateIds = [], stations, settings }) {
  const used = new Set(), known = new Set(candidateIds);
  const unique = stations.map((s, i) => {
    let id = typeof s.id === 'string' && ID.test(s.id) && !used.has(s.id) ? s.id : null;
    const candidateId = id !== null && known.has(id) ? id : null;
    for (let n = i + 1; id === null; n++) if (!used.has(`station-${n}`)) id = `station-${n}`;
    used.add(id);
    return { id, name: String(s.name ?? id), x: s.x, y: s.y, z: s.z, az: s.az, el: s.el, candidateId };
  });
  return planFromState({ title, release, scenario, model, stations: unique, activeIndex: 0, selected: [], settings });
}
