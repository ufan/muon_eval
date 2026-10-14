// Study state (FR-P6, ADR-020): the plan's fixed candidate pool plus one working station.
// The working station is edited freely; candidates change only through an explicit
// update, save as new, delete or "apply detector to all". Pure: no DOM or storage.
import { validatePlan, planHash, detectorFromSettings, settingsFromDetector } from './plan-format.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration, deviceSettingsData } from './device-configuration.js';

const FIELDS = ['name', 'x', 'y', 'z', 'az', 'el'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const encoded = value => JSON.stringify(value);
// Settings always pass the app's one configuration path, so ranges and derived values match the form.
const normalise = (settings, base) => deviceSettingsData(applyDeviceConfiguration(
  base ? applyDeviceConfiguration(defaultDeviceConfiguration(), base) : defaultDeviceConfiguration(), settings));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

function fromCandidate(plan, id) {
  const s = plan.stations.find(station => station.id === id), detector = plan.detectors[s.detector];
  return { from: s.id, name: s.name, x: s.position[0], y: s.position[1], z: s.position[2], az: s.pose.azimuthDeg, el: s.pose.elevationDeg,
    model: detector.device.model, settings: normalise(settingsFromDetector(detector)) };
}
function validWorking(plan, w) {
  if (!w || typeof w !== 'object' || typeof w.name !== 'string' || typeof w.model !== 'string'
    || !['x', 'y', 'z', 'az', 'el'].every(key => Number.isFinite(w[key])) || !w.settings || typeof w.settings !== 'object') return null;
  return { from: plan.stations.some(s => s.id === w.from) ? w.from : null, name: w.name, x: w.x, y: w.y, z: w.z,
    az: clamp(w.az, 0, 359), el: clamp(w.el, 0, 90), model: w.model, settings: normalise(w.settings) };
}
// The plan's detector equal to these settings, or a new named one (detector-N).
function resolveDetector(detectors, model, settings) {
  const wanted = detectorFromSettings(model, settings);
  for (const [name, detector] of Object.entries(detectors)) if (encoded(detector) === encoded(wanted)) return [detectors, name];
  let n = Object.keys(detectors).length + 1;
  while (Object.hasOwn(detectors, `detector-${n}`)) n++;
  return [{ ...detectors, [`detector-${n}`]: wanted }, `detector-${n}`];
}
const prune = (detectors, stations) => {
  const used = new Set(['default', ...stations.map(s => s.detector)]);
  return Object.fromEntries(Object.entries(detectors).filter(([name]) => used.has(name)));
};

export function createStudyState({ plan, session = null, environment }) {
  let current = freeze(validatePlan(plan));
  if (!current.schemaVersion.startsWith('1.1.')) throw new Error('Study state needs a current plan; migrate first');
  const ids = () => new Set(current.stations.map(s => s.id));
  const start = ids().has(session?.activeStation) ? session.activeStation : current.stations[0].id;
  let working = validWorking(current, session?.working) ?? fromCandidate(current, start);
  let compared = new Set((Array.isArray(session?.compare) ? session.compare : []).filter(id => ids().has(id)));
  const commit = next => { current = freeze(validatePlan({ ...next, detectors: prune(next.detectors, next.stations) })); };
  const station = (w, base = {}) => ({ ...base, name: w.name, position: [w.x, w.y, w.z], pose: { azimuthDeg: w.az, elevationDeg: w.el } });
  const configuration = settings => {
    const c = applyDeviceConfiguration(defaultDeviceConfiguration(), settings);
    return { device: { ...c.device, model: working.model }, response: c.response };
  };
  const reference = id => ({ hash: planHash(current), stationId: id });
  const isModified = () => {
    if (working.from === null) return true;
    const source = fromCandidate(current, working.from);
    return ['name', 'x', 'y', 'z', 'az', 'el', 'model'].some(key => source[key] !== working[key]) || encoded(source.settings) !== encoded(working.settings);
  };

  return Object.freeze({
    get plan() { return current; },
    get working() { return { ...working, settings: { ...working.settings } }; },
    get modified() { return isModified(); },
    get configuration() { return configuration(working.settings); },
    get compared() { return current.stations.map(s => s.id).filter(id => compared.has(id)); },
    candidate(id) { const s = current.stations.find(station => station.id === id); if (!s) throw new Error(`Candidate ${id} is not in the study`); return s; },
    select(id) { this.candidate(id); working = fromCandidate(current, id); },
    update(field, value) {
      if (!FIELDS.includes(field)) throw new Error('Unknown working station field');
      if (field === 'name') { working = { ...working, name: String(value) }; return; }
      const number = +value;
      if (!Number.isFinite(number)) throw new Error('Working station values must be finite');
      working = { ...working, [field]: field === 'az' ? clamp(number, 0, 359) : field === 'el' ? clamp(number, 0, 90) : number };
    },
    configure(settings) { working = { ...working, settings: normalise(settings, working.settings) }; },
    saveAsNew() {
      const taken = ids(), names = new Set(current.stations.map(s => s.name));
      let n = current.stations.length + 1;
      while (taken.has(`station-${n}`)) n++;
      let name = working.name;
      for (let k = 2; names.has(name); k++) name = `${working.name} (${k})`;
      const [detectors, detector] = resolveDetector(current.detectors, working.model, working.settings);
      const source = working.from === null ? null : this.candidate(working.from);
      const id = `station-${n}`;
      commit({ ...current, detectors, stations: [...current.stations, station({ ...working, name },
        { id, candidateId: source?.candidateId ?? null, detector, note: '' })] });
      working = { ...working, name, from: id };
      return id;
    },
    updateCandidate() {
      if (working.from === null) throw new Error('The working station has no source candidate; save it as new');
      const [detectors, detector] = resolveDetector(current.detectors, working.model, working.settings);
      commit({ ...current, detectors, stations: current.stations.map(s => s.id === working.from
        ? { ...station(working, s), detector } : s) });
    },
    removeCandidate(id) {
      this.candidate(id);
      if (current.stations.length < 2) throw new Error('A study keeps at least its last candidate');
      commit({ ...current, stations: current.stations.filter(s => s.id !== id),
        deployments: current.deployments.map(d => ({ ...d, stations: d.stations.filter(member => member !== id) })) });
      compared.delete(id);
      if (working.from === id) working = { ...working, from: null };
    },
    applyDetectorToAll() {
      const [detectors, detector] = resolveDetector(current.detectors, working.model, working.settings);
      commit({ ...current, detectors, stations: current.stations.map(s => ({ ...s, detector })) });
    },
    setCompared(id, on) { this.candidate(id); if (on) compared.add(id); else compared.delete(id); },
    // Assessment inputs (deployment-state snapshot shape). The working station refers to
    // the plan only while it equals its candidate; otherwise it is not from the plan.
    snapshot() {
      const { device, response } = configuration(working.settings);
      return structuredClone({ station: { id: working.from ?? 'working', name: working.name, x: working.x, y: working.y, z: working.z, az: working.az, el: working.el },
        device, response, environment, plan: isModified() ? null : reference(working.from) });
    },
    candidateInput(id) {
      const s = this.candidate(id), c = applyDeviceConfiguration(defaultDeviceConfiguration(), settingsFromDetector(current.detectors[s.detector]));
      return structuredClone({ station: { id: s.id, name: s.name, x: s.position[0], y: s.position[1], z: s.position[2], az: s.pose.azimuthDeg, el: s.pose.elevationDeg },
        device: { ...c.device, model: current.detectors[s.detector].device.model }, response: c.response, environment, plan: reference(s.id) });
    },
    session() { return structuredClone({ activeStation: working.from, working, compare: this.compared }); }
  });
}
