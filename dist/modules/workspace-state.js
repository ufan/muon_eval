// Workspace state (ADR-033 step 4, FR-P11): the release's flat workspace plus the session — one working draft,
// the shown set (the ticked stations), the deployment last loaded and the playground exposure. The draft is
// edited freely; saved stations change only through an explicit save, update, delete or "apply detector to all".
// Same interface as the former study state, so the views keep working. Pure: no DOM or storage.
import { detectorFromSettings, settingsFromDetector } from './plan-format.js';
import { validateWorkspace, newId as randomId, selectWorkspace, workspaceHash, detectorWithoutExposure, deviceKey } from './workspace-format.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration, deviceSettingsData } from './device-configuration.js';

const FIELDS = ['name', 'x', 'y', 'z', 'az', 'el'];
const DEFAULT_EXPOSURE_DAYS = 30;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const encoded = value => JSON.stringify(value);
// Settings always pass the app's one configuration path, so ranges and derived values match the form.
const normalise = (settings, base) => deviceSettingsData(applyDeviceConfiguration(
  base ? applyDeviceConfiguration(defaultDeviceConfiguration(), base) : defaultDeviceConfiguration(), settings));
const samePlace = (site, w) => site.position[0] === w.x && site.position[1] === w.y && site.position[2] === w.z;
const sameSet = (a, b) => a.length === b.size && a.every(id => b.has(id));

// draft: the working station to start from when the session has none and nothing is saved
// ({ name, x, y, z, az, el, candidateId, model, settings }).
export function createWorkspaceState({ workspace, session = null, environment, draft = null, newId = prefix => randomId(prefix) }) {
  let ws = validateWorkspace(workspace);
  let exposureDays = Number.isInteger(session?.exposureDays) ? clamp(session.exposureDays, 1, 3650) : DEFAULT_EXPOSURE_DAYS;
  const byId = (items, id, what) => { const item = items.find(x => x.id === id); if (!item) throw new Error(`${what} ${id} is not in the workspace`); return item; };
  const station = id => byId(ws.stations, id, 'Station');
  const siteOf = s => byId(ws.sites, s.placement.site, 'Site');
  const commit = next => {
    const used = new Set(next.stations.map(s => s.detector)), kept = next.detectors.filter(d => used.has(d.id));
    ws = validateWorkspace({ ...next, detectors: kept.length ? kept : next.detectors.slice(0, 1) });
  };
  const settingsOf = detector => normalise(settingsFromDetector({ device: detector.device, response: { ...detector.response, exposureDays } }));
  const fromStation = id => {
    const s = station(id), site = siteOf(s), d = byId(ws.detectors, s.detector, 'Detector');
    return { from: s.id, site: site.id, name: s.name, x: site.position[0], y: site.position[1], z: site.position[2], az: s.pose.azimuthDeg, el: s.pose.elevationDeg,
      model: d.device.model, settings: settingsOf(d), candidateId: site.candidateId };
  };
  const fromSession = w => {
    if (!w) return null;
    const from = ws.stations.some(s => s.id === w.station) ? w.station : null, site = ws.sites.find(s => s.id === w.site) ?? null;
    return { from, site: site?.id ?? null, name: w.name, x: w.position[0], y: w.position[1], z: w.position[2],
      az: clamp(w.pose.azimuthDeg, 0, 359), el: clamp(w.pose.elevationDeg, 0, 90), model: w.device.model,
      settings: normalise(settingsFromDetector({ device: w.device, response: { ...w.response, exposureDays } })),
      candidateId: from ? siteOf(station(from)).candidateId : site?.candidateId ?? null };
  };
  const fromDraft = d => ({ from: null, site: null, name: d.name, x: d.x, y: d.y, z: d.z, az: d.az, el: d.el, model: d.model,
    settings: normalise({ ...d.settings, exposureDays }), candidateId: d.candidateId ?? null });
  let working = fromSession(session?.working) ?? (ws.stations.length ? fromStation(ws.stations[0].id) : draft ? fromDraft(draft) : null);
  if (!working) throw new Error('A workspace state needs a saved station or a draft');
  // A draft that is no saved station counts as edited once the user changes it (or when it comes back from the session).
  let touched = working.from === null && Boolean(session?.working);
  // The draft as it was loaded (a dataset suggestion or the start draft), for revert.
  let draftBase = working.from === null ? working : null;
  let shown = new Set((session?.shown ?? []).filter(id => ws.stations.some(s => s.id === id)));
  let activeDeployment = ws.deployments.some(d => d.id === session?.activeDeployment) ? session.activeDeployment : null;

  const configuration = settings => { const c = applyDeviceConfiguration(defaultDeviceConfiguration(), settings); return { device: { ...c.device, model: working.model }, response: c.response }; };
  const reference = id => ({ hash: workspaceHash(selectWorkspace(ws, [id])), stationId: id });
  const isModified = () => {
    if (working.from === null) return touched;
    const source = fromStation(working.from);
    return ['name', 'x', 'y', 'z', 'az', 'el', 'model'].some(key => source[key] !== working[key]) || encoded(source.settings) !== encoded(working.settings);
  };
  // The workspace detector for these settings: an equal device, or a new one.
  const resolveDetector = next => {
    const wanted = detectorFromSettings(working.model, working.settings), existing = next.detectors.find(d => deviceKey(d) === deviceKey(wanted));
    if (existing) return [next.detectors, existing.id];
    const id = newId('det');
    return [[...next.detectors, { id, name: working.model || 'detector', ...detectorWithoutExposure(wanted) }], id];
  };
  const newSite = () => ({ id: newId('site'), name: working.name || '点位', position: [working.x, working.y, working.z], frame: 'model_frame', candidateId: working.candidateId, note: '' });
  const view = s => { const site = siteOf(s); return { id: s.id, name: s.name, position: [...site.position], pose: { ...s.pose }, candidateId: site.candidateId, detector: s.detector, note: s.note, site: site.id }; };
  const deployment = id => byId(ws.deployments, id, 'Deployment');
  // Position and pose identify a station (owner, 2026-10-18); names are free text and may repeat.
  const duplicateKey = s => { const site = siteOf(s); return JSON.stringify([site.position, s.pose]); };
  const stationAtPlace = ({ x, y, z, az, el }, except = null) => ws.stations.find(s => s.id !== except && s.pose.azimuthDeg === az && s.pose.elevationDeg === el
    && siteOf(s).position.every((v, i) => v === [x, y, z][i]))?.id ?? null;
  const refuseClash = (place, except = null) => { const other = stationAtPlace(place, except); if (other) throw new Error(`Another station has the same position and pose: ${station(other).name}`); };
  const withDeployments = deployments => commit({ ...ws, deployments });
  const othersOnSite = () => {
    if (working.from === null) return 0;
    const s = station(working.from);
    return ws.stations.filter(x => x.id !== s.id && x.placement.site === s.placement.site).length;
  };

  return Object.freeze({
    get workspace() { return ws; },
    // Read-only view in the shape the views use: every saved station with its site position, every deployment.
    get plan() { return { title: '', stations: ws.stations.map(view), deployments: ws.deployments.map(d => ({ id: d.id, name: d.name, stations: [...d.stations] })) }; },
    get working() { return { ...working, settings: { ...working.settings } }; },
    get modified() { return isModified(); },
    get configuration() { return configuration(working.settings); },
    get compared() { return ws.stations.map(s => s.id).filter(id => shown.has(id)); },
    get exposureDays() { return exposureDays; },
    candidate(id) { return view(station(id)); },
    select(id) { station(id); working = fromStation(id); touched = false; },
    loadDraft(d) { working = fromDraft({ ...d, model: working.model, settings: working.settings }); draftBase = working; touched = false; },
    // Discards the edits of the working station: back to its saved station, or to the draft as it was loaded.
    revert() { if (working.from !== null) { working = fromStation(working.from); touched = false; } else if (draftBase) { working = { ...draftBase, settings: normalise({ ...draftBase.settings, exposureDays }, draftBase.settings) }; touched = false; } },
    update(field, value) {
      if (!FIELDS.includes(field)) throw new Error('Unknown working station field');
      touched = true;
      if (field === 'name') { working = { ...working, name: String(value) }; return; }
      const number = +value;
      if (!Number.isFinite(number)) throw new Error('Working station values must be finite');
      working = { ...working, [field]: field === 'az' ? clamp(number, 0, 359) : field === 'el' ? clamp(number, 0, 90) : number };
    },
    configure(settings) { touched = true; working = { ...working, settings: normalise({ ...settings, exposureDays }, working.settings) }; },
    // One exposure for every station while no study is active (ADR-033); not stored in the workspace.
    setExposure(days) {
      if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Exposure must be 1–3650 whole days');
      exposureDays = days;
      working = { ...working, settings: normalise({ ...working.settings, exposureDays }, working.settings) };
    },
    // Reuses the draft's site while its position is unchanged; otherwise a new site (never matched by position).
    saveAsNew() {
      refuseClash(working);
      const name = working.name || '点位';
      const [detectors, detector] = resolveDetector(ws);
      const keep = working.site !== null && ws.sites.some(s => s.id === working.site && samePlace(s, working));
      const site = keep ? null : newSite(), siteId = keep ? working.site : site.id, id = newId('sta');
      commit({ ...ws, detectors, sites: site ? [...ws.sites, site] : ws.sites,
        stations: [...ws.stations, { id, name, placement: { kind: 'site', site: siteId }, pose: { azimuthDeg: working.az, elevationDeg: working.el }, detector, note: '' }] });
      working = { ...working, name, from: id, site: siteId }; touched = false;
      return id;
    },
    // Adds a position (a dataset suggestion) as a saved station on a new site, with the working station's detector,
    // without changing the working station. Returns the new station's ID.
    addFromDraft(d) {
      refuseClash({ x: d.x, y: d.y, z: d.z, az: clamp(d.az, 0, 359), el: clamp(d.el, 0, 90) });
      const name = d.name || '点位';
      const [detectors, detector] = resolveDetector(ws), site = { id: newId('site'), name: d.name || '点位', position: [d.x, d.y, d.z], frame: 'model_frame', candidateId: d.candidateId ?? null, note: '' }, id = newId('sta');
      commit({ ...ws, detectors, sites: [...ws.sites, site],
        stations: [...ws.stations, { id, name, placement: { kind: 'site', site: site.id }, pose: { azimuthDeg: clamp(d.az, 0, 359), elevationDeg: clamp(d.el, 0, 90) }, detector, note: '' }] });
      return id;
    },
    // The saved station at exactly this position and pose, or null (position and pose identify a station).
    stationAt(place) { return stationAtPlace(place); },
    // How many other stations share the working station's site (0 when it has its own).
    siteSharedBy: othersOnSite,
    // A moved station on a shared site needs a choice: 'move' moves the site with every station on it, 'new' gives
    // this station a site of its own. A site used by this station only simply moves.
    updateCandidate(mode = null) {
      if (working.from === null) throw new Error('The working station has no source station; save it as new');
      const s = station(working.from), site = siteOf(s), moved = !samePlace(site, working);
      if (moved && othersOnSite() && !['move', 'new'].includes(mode)) throw new Error('The site is shared; choose move or new');
      refuseClash(working, s.id);
      const [detectors, detector] = resolveDetector(ws);
      let sites = ws.sites, siteId = site.id;
      if (moved && mode === 'new' && othersOnSite()) { const created = newSite(); sites = [...sites, created]; siteId = created.id; }
      else if (moved) sites = sites.map(x => x.id === site.id ? { ...x, position: [working.x, working.y, working.z] } : x);
      commit({ ...ws, detectors, sites, stations: ws.stations.map(x => x.id === s.id
        ? { ...x, name: working.name || x.name, placement: { kind: 'site', site: siteId }, pose: { azimuthDeg: working.az, elevationDeg: working.el }, detector } : x) });
      working = { ...working, site: siteId, name: working.name || s.name };
    },
    // What would be affected by deleting a station (deployments holding it, studies comparing those) or a deployment (studies).
    dependants(id) {
      const studiesOf = deps => ws.studies.filter(st => st.deployments.some(d => deps.includes(d))).map(st => st.title);
      if (id.startsWith('dep-')) return { studies: studiesOf([id]) };
      const deps = ws.deployments.filter(d => d.stations.includes(id));
      return { deployments: deps.map(d => d.name), studies: studiesOf(deps.map(d => d.id)) };
    },
    removeCandidate(id) {
      const site = station(id).placement.site, stations = ws.stations.filter(s => s.id !== id);
      commit({ ...ws, stations, sites: stations.some(s => s.placement.site === site) ? ws.sites : ws.sites.filter(s => s.id !== site),
        deployments: ws.deployments.map(d => ({ ...d, stations: d.stations.filter(m => m !== id) })) });
      shown.delete(id);
      if (working.from === id) { working = { ...working, from: null, site: stations.some(s => s.placement.site === site) ? site : null }; touched = true; }
    },
    // Stations equal in position and pose, e.g. copies from several 1.x studies.
    // Never merged on their own (ADR-033); mergeDuplicates keeps the first of each, rewrites deployments, the shown
    // set and the draft to it, and merges sites of exactly the same place. Returns the number of stations removed.
    get duplicateCount() { return ws.stations.length - new Set(ws.stations.map(duplicateKey)).size; },
    mergeDuplicates() {
      const keepStation = new Map(), stationTo = new Map(), keepSite = new Map(), siteTo = new Map();
      for (const site of ws.sites) { const key = JSON.stringify([site.position, site.candidateId]); if (!keepSite.has(key)) keepSite.set(key, site.id); siteTo.set(site.id, keepSite.get(key)); }
      for (const s of ws.stations) { const key = duplicateKey(s); if (!keepStation.has(key)) keepStation.set(key, s.id); stationTo.set(s.id, keepStation.get(key)); }
      const stations = ws.stations.filter(s => stationTo.get(s.id) === s.id).map(s => ({ ...s, placement: { kind: 'site', site: siteTo.get(s.placement.site) } }));
      const removed = ws.stations.length - stations.length, used = new Set(stations.map(s => s.placement.site));
      if (!removed) return 0;
      commit({ ...ws, stations, sites: ws.sites.filter(site => siteTo.get(site.id) === site.id && used.has(site.id)),
        deployments: ws.deployments.map(d => ({ ...d, stations: [...new Set(d.stations.map(id => stationTo.get(id)))] })) });
      shown = new Set([...shown].map(id => stationTo.get(id)));
      if (working.from !== null) { const from = stationTo.get(working.from); working = { ...working, from, site: station(from).placement.site }; }
      return removed;
    },
    applyDetectorToAll() {
      const [detectors, detector] = resolveDetector(ws);
      commit({ ...ws, detectors, stations: ws.stations.map(s => ({ ...s, detector })) });
    },
    // Deployments (FR-P7): loading one replaces the shown set; the shown set changes a deployment only on request.
    get activeDeployment() { return activeDeployment; },
    get matchedDeployment() {
      const candidates = activeDeployment ? [deployment(activeDeployment), ...ws.deployments.filter(d => d.id !== activeDeployment)] : ws.deployments;
      return candidates.find(d => d.stations.length && sameSet(d.stations, shown))?.id ?? null;
    },
    selectDeployment(id) { shown = new Set(deployment(id).stations); activeDeployment = id; },
    // A fresh start: nothing ticked, no deployment active.
    deselectDeployment() { shown = new Set(); activeDeployment = null; },
    createDeployment(name, stations = this.compared) { const id = newId('dep'); withDeployments([...ws.deployments, { id, name, stations: [...stations], note: '' }]); activeDeployment = id; return id; },
    copyDeployment(id, name) { return this.createDeployment(name, deployment(id).stations); },
    renameDeployment(id, name) { deployment(id); withDeployments(ws.deployments.map(d => d.id === id ? { ...d, name } : d)); },
    updateDeployment(id) { deployment(id); withDeployments(ws.deployments.map(d => d.id === id ? { ...d, stations: this.compared } : d)); activeDeployment = id; },
    deleteDeployment(id) {
      deployment(id);
      commit({ ...ws, deployments: ws.deployments.filter(d => d.id !== id), studies: ws.studies.map(st => ({ ...st, deployments: st.deployments.filter(d => d !== id) })) });
      if (activeDeployment === id) activeDeployment = null;
    },
    // The members chosen in the 部署组合 dialog, kept in station order.
    setDeploymentStations(id, stationIds) {
      deployment(id); for (const stationId of stationIds) station(stationId);
      const chosen = new Set(stationIds);
      withDeployments(ws.deployments.map(d => d.id === id ? { ...d, stations: ws.stations.map(s => s.id).filter(sid => chosen.has(sid)) } : d));
    },
    setMember(id, stationId, on) {
      station(stationId);
      const d = deployment(id), stations = on ? (d.stations.includes(stationId) ? d.stations : [...d.stations, stationId]) : d.stations.filter(s => s !== stationId);
      withDeployments(ws.deployments.map(item => item.id === id ? { ...item, stations } : item));
    },
    setCompared(id, on) { station(id); if (on) shown.add(id); else shown.delete(id); },
    // Studies stay read-only rows until the composer (step 6): rename or remove; their items stay.
    renameStudy(id, title) { byId(ws.studies, id, 'Study'); commit({ ...ws, studies: ws.studies.map(st => st.id === id ? { ...st, title } : st) }); },
    deleteStudy(id) { byId(ws.studies, id, 'Study'); commit({ ...ws, studies: ws.studies.filter(st => st.id !== id) }); },
    // Assessment inputs (deployment-state snapshot shape). The working station refers to its saved station only
    // while it equals it; the reference is the station's workspace selection (WORKSPACE_FORMAT.md, Identity).
    snapshot() {
      const { device, response } = configuration(working.settings);
      return structuredClone({ station: { id: working.from ?? 'working', name: working.name, x: working.x, y: working.y, z: working.z, az: working.az, el: working.el },
        device, response, environment, plan: working.from === null || isModified() ? null : reference(working.from) });
    },
    candidateInput(id) {
      const s = station(id), site = siteOf(s), d = byId(ws.detectors, s.detector, 'Detector'), c = applyDeviceConfiguration(defaultDeviceConfiguration(), settingsOf(d));
      return structuredClone({ station: { id: s.id, name: s.name, x: site.position[0], y: site.position[1], z: site.position[2], az: s.pose.azimuthDeg, el: s.pose.elevationDeg },
        device: { ...c.device, model: d.device.model }, response: c.response, environment, plan: reference(s.id) });
    },
    session() {
      const { device, response } = detectorWithoutExposure(detectorFromSettings(working.model, working.settings));
      return structuredClone({ version: 1, activeStudy: null, activeDeployment, shown: this.compared, exposureDays,
        working: { site: working.site, station: working.from, name: working.name, position: [working.x, working.y, working.z],
          pose: { azimuthDeg: working.az, elevationDeg: working.el }, device, response } });
    }
  });
}
