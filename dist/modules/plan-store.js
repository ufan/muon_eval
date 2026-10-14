// Several studies (plans) per release in browser storage (docs/specs/PLAN_FORMAT.md, FR-P8).
// Storage is passed in; reads and writes never throw (private windows, blocked storage).
//   muon-studies:<release>          { version: 1, active, studies: [id, …] }
//   muon-plan:<release>:<study>     the study's plan (canonical text)
//   muon-session:<release>:<study>  session state next to the plan: { activeStation }
import { parsePlan, serializePlan, planFromState, planFromLegacyStorage, migratePlan } from './plan-format.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration, deviceSettingsData } from './device-configuration.js';

export const studyIndexKey = release => `muon-studies:${release}`;
export const studyPlanKey = (release, id) => `muon-plan:${release}:${id}`;
export const studySessionKey = (release, id) => `muon-session:${release}:${id}`;
const LEGACY_PLAN = release => `muon-plan:${release}`, LEGACY_STATIONS = release => `muon-candidates:${release}`, LEGACY_DEVICE = 'muon-device-settings-v1';
const FIRST = 'study-1';
const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };
const remove = (storage, key) => { try { storage.removeItem(key); } catch {} };
const readJson = (storage, key) => { try { return JSON.parse(read(storage, key)); } catch { return null; } };
// Device settings go through the app's one configuration path, so ranges and fallbacks match the form.
const normalise = (base, extra) => deviceSettingsData(applyDeviceConfiguration(applyDeviceConfiguration(defaultDeviceConfiguration(), base), extra ?? {}));

function readIndex(storage, release) {
  const index = readJson(storage, studyIndexKey(release));
  if (index?.version !== 1 || !Array.isArray(index.studies) || !index.studies.every(id => typeof id === 'string')) return null;
  return { version: 1, active: index.studies.includes(index.active) ? index.active : index.studies[0] ?? null, studies: [...index.studies] };
}
const writeIndex = (storage, release, index) => write(storage, studyIndexKey(release), JSON.stringify(index));

function readPlan(storage, release, id) {
  const text = read(storage, studyPlanKey(release, id));
  if (text === null) throw new Error(`Invalid plan: study ${id} is missing`);
  const plan = parsePlan(text);
  if (plan.scene.release !== release) throw new Error('Invalid plan: stored under another release');
  return plan;
}
// The active station must name a station of the plan; otherwise the first one.
const session = (plan, stored) => ({ activeStation: plan.stations.some(s => s.id === stored?.activeStation) ? stored.activeStation : plan.stations[0].id });
const withScenario = (plan, scenario) => ({ ...plan, scene: { ...plan.scene, scenario } });

export function saveStudy(storage, release, id, plan, sessionState) {
  const index = readIndex(storage, release) ?? { version: 1, active: id, studies: [] };
  if (!index.studies.includes(id)) index.studies.push(id);
  index.active = id;
  let ok = write(storage, studyPlanKey(release, id), serializePlan(plan)) && writeIndex(storage, release, index);
  if (sessionState) ok = saveSession(storage, release, id, sessionState) && ok;
  return ok;
}
export const saveSession = (storage, release, id, sessionState) => write(storage, studySessionKey(release, id), JSON.stringify({ activeStation: sessionState.activeStation ?? null }));

export function listStudies(storage, release) {
  return (readIndex(storage, release)?.studies ?? []).map(id => {
    let title = '';
    try { title = readPlan(storage, release, id).title; } catch {}
    return { id, title };
  });
}

// Stores a new study and makes it active; returns its id (study-N, never an existing one).
export function createStudy(storage, release, plan, sessionState) {
  const taken = new Set(readIndex(storage, release)?.studies ?? []);
  let n = taken.size + 1;
  while (taken.has(`study-${n}`) || read(storage, studyPlanKey(release, `study-${n}`)) !== null) n++;
  const id = `study-${n}`;
  saveStudy(storage, release, id, migratePlan(plan), sessionState ?? session(migratePlan(plan), null));
  return id;
}

export function switchStudy(storage, release, id) {
  const index = readIndex(storage, release);
  if (!index?.studies.includes(id)) throw new Error(`Study ${id} is not stored for ${release}`);
  const plan = readPlan(storage, release, id);
  writeIndex(storage, release, { ...index, active: id });
  return { plan, session: session(plan, readJson(storage, studySessionKey(release, id))) };
}

export function deleteStudy(storage, release, id) {
  const index = readIndex(storage, release);
  if (!index?.studies.includes(id)) return;
  remove(storage, studyPlanKey(release, id)); remove(storage, studySessionKey(release, id));
  const studies = index.studies.filter(s => s !== id);
  if (studies.length) writeIndex(storage, release, { version: 1, active: index.active === id ? studies[0] : index.active, studies });
  else remove(storage, studyIndexKey(release));
}

// Opens the release's active study. Returns { studies, active, plan, session, source:
// 'stored' | 'migrated' | 'default', warning? }; a default study is not written until saved.
// The scenario always follows the app's current selection.
export function openStudies({ storage, release, scenario, model, candidateIds, defaultStations, defaultSettings }) {
  let warning;
  const opened = (plan, stored, source, active) => {
    const result = { studies: listStudies(storage, release), active, plan: withScenario(plan, scenario), session: session(plan, stored), source };
    if (!result.studies.length) result.studies = [{ id: active, title: plan.title }];
    return warning === undefined ? result : { ...result, warning };
  };
  const index = readIndex(storage, release);
  if (index?.active) {
    try { return opened(readPlan(storage, release, index.active), readJson(storage, studySessionKey(release, index.active)), 'stored', index.active); }
    catch (error) { warning = `Stored plan ignored: ${error.message}`; }
  }
  // One plan per release (before studies): becomes study-1; its 1.0 active station moves to the session.
  const legacyPlan = index ? null : read(storage, LEGACY_PLAN(release));
  if (legacyPlan !== null) {
    try {
      const raw = JSON.parse(legacyPlan), plan = parsePlan(legacyPlan);
      if (plan.scene.release !== release) throw new Error('Invalid plan: stored under another release');
      const state = session(plan, { activeStation: raw?.deployment?.active });
      if (saveStudy(storage, release, FIRST, plan, state)) remove(storage, LEGACY_PLAN(release));
      return opened(plan, state, 'migrated', FIRST);
    } catch (error) { warning = `Stored plan ignored: ${error.message}`; }
  }
  const settings = normalise(defaultSettings, readJson(storage, LEGACY_DEVICE));
  const legacyStations = index ? null : readJson(storage, LEGACY_STATIONS(release));
  if (warning === undefined && Array.isArray(legacyStations) && legacyStations.length) {
    try {
      const plan = planFromLegacyStorage({ release, scenario, model, candidateIds, stations: legacyStations, settings });
      if (saveStudy(storage, release, FIRST, plan, session(plan, null))) remove(storage, LEGACY_STATIONS(release));
      return opened(plan, null, 'migrated', FIRST);
    } catch (error) { warning = `Stored stations ignored: ${error.message}`; }
  }
  const plan = planFromState({ release, scenario, model, stations: defaultStations, settings });
  return opened(plan, null, 'default', index?.active ?? FIRST);
}
