// Interim bridge between the stored workspace (muography-workspace 2.0) and today's study UI, which edits
// one study as a muography-plan 1.1 view (ADR-033, step 3). It goes away with the 我的点位 sidebar (step 4).
// Convention: a study's first deployment is its candidate pool (`<title> · 候选池`, as migration creates it);
// the view's stations are the pool, its deployments the study's other deployments. Pure.
import { validatePlan, PLAN_FORMAT, PLAN_SCHEMA_VERSION, settingsFromDetector, detectorFromSettings } from './plan-format.js';
import { validateWorkspace, itemHash, newId, migrateStudies, selectWorkspace, detectorWithoutExposure, deviceKey } from './workspace-format.js';

export const POOL_MARK = ' · 候选池';
const DEFAULT_EXPOSURE_DAYS = 30;
const isPool = deployment => Boolean(deployment?.name.endsWith(POOL_MARK));
const find = (items, id, what) => { const item = items.find(x => x.id === id); if (!item) throw new Error(`${what} ${id} is not in the workspace`); return item; };
const samePlace = (site, station) => site.position.every((v, i) => v === station.position[i]) && site.candidateId === station.candidateId;
const global = (id, prefix) => { if (typeof id !== 'string' || !id.startsWith(`${prefix}-`)) throw new Error(`${id} is not a workspace ID; create the study state with newId`); };

export const listStudyItems = ws => ws.studies.map(s => ({ id: s.id, title: s.title }));

// Gives a study without a pool (one imported from elsewhere) a pool of the stations its deployments use.
export function ensurePool(ws, studyId, { random } = {}) {
  const study = find(ws.studies, studyId, 'Study');
  if (isPool(ws.deployments.find(d => d.id === study.deployments[0]))) return ws;
  const stations = [...new Set(study.deployments.flatMap(id => find(ws.deployments, id, 'Deployment').stations))];
  const pool = { id: newId('dep', random), name: `${study.title}${POOL_MARK}`.slice(-200), stations, note: '' };
  return validateWorkspace({ ...ws, deployments: [...ws.deployments, pool],
    studies: ws.studies.map(s => s.id === studyId ? { ...s, deployments: [pool.id, ...s.deployments] } : s) });
}

// The study as a 1.1 plan: pool stations with their site positions, the study's exposure on every detector.
export function planViewOf(ws, studyId, { scenario = null } = {}) {
  const study = find(ws.studies, studyId, 'Study'), pool = ws.deployments.find(d => d.id === study.deployments[0]);
  if (!isPool(pool)) throw new Error(`Study ${studyId} has no candidate pool`);
  const stations = pool.stations.map(id => find(ws.stations, id, 'Station'));
  if (!stations.length) throw new Error(`Study ${studyId} has no stations`);
  const days = study.exposure.days, primary = stations[0].detector, key = id => id === primary ? 'default' : id;
  const detectors = Object.fromEntries([...new Set(stations.map(s => s.detector))].map(id => {
    const d = find(ws.detectors, id, 'Detector');
    return [key(id), { device: { ...d.device }, response: { ...d.response, exposureDays: days } }];
  }));
  const inPool = new Set(pool.stations);
  return validatePlan({
    format: PLAN_FORMAT, schemaVersion: PLAN_SCHEMA_VERSION, title: study.title,
    scene: { release: ws.release.id, contentHash: ws.release.contentHash, scenario }, units: { length: 'm', angle: 'deg', frame: 'model_frame' },
    detectors,
    stations: stations.map(s => { const site = find(ws.sites, s.placement.site, 'Site');
      return { id: s.id, name: s.name, position: [...site.position], pose: { ...s.pose }, candidateId: site.candidateId, detector: key(s.detector), note: s.note }; }),
    deployments: study.deployments.slice(1).map(id => { const d = find(ws.deployments, id, 'Deployment'); return { id: d.id, name: d.name, stations: d.stations.filter(m => inPool.has(m)) }; }),
    anomalies: []
  });
}

// Writes an edited plan view back. Moved stations move their site when they are its only user, otherwise
// they get a site (shared with an equal place of the study, or new). Stations and deployments the study
// dropped are deleted only when nothing else uses them; unused sites and detectors go with them.
export function applyPlanView(ws, studyId, plan, { random } = {}) {
  plan = validatePlan(plan);
  const next = structuredClone(validateWorkspace(ws)), study = find(next.studies, studyId, 'Study');
  const pool = find(next.deployments, study.deployments[0], 'Deployment');
  if (!isPool(pool)) throw new Error(`Study ${studyId} has no candidate pool`);
  const detectorIds = Object.fromEntries(Object.entries(plan.detectors).map(([name, d]) => {
    const content = detectorWithoutExposure(d), existing = next.detectors.find(x => deviceKey(x) === deviceKey(d));
    if (existing) return [name, existing.id];
    const id = newId('det', random);
    next.detectors.push({ id, name: d.device.model || 'detector', ...content });
    return [name, id];
  }));
  study.exposure = { kind: 'constant', days: plan.detectors.default.response.exposureDays };
  if (plan.title) study.title = plan.title;
  const planIds = plan.stations.map(s => s.id), previous = [...pool.stations];
  const studySite = s => next.stations.filter(x => planIds.includes(x.id)).map(x => find(next.sites, x.placement.site, 'Site')).find(site => samePlace(site, s));
  const newSite = s => { const site = { id: newId('site', random), name: s.name || '点位', position: [...s.position], frame: 'model_frame', candidateId: s.candidateId, note: '' }; next.sites.push(site); return site; };
  for (const s of plan.stations) {
    global(s.id, 'sta');
    const fields = { name: s.name || '点位', pose: { ...s.pose }, detector: detectorIds[s.detector], note: s.note };
    const existing = next.stations.find(x => x.id === s.id);
    if (!existing) { next.stations.push({ id: s.id, name: fields.name, placement: { kind: 'site', site: (studySite(s) ?? newSite(s)).id }, pose: fields.pose, detector: fields.detector, note: fields.note }); continue; }
    const site = find(next.sites, existing.placement.site, 'Site');
    if (!samePlace(site, s)) {
      if (next.stations.some(x => x.id !== s.id && x.placement.site === site.id)) existing.placement.site = (studySite(s) ?? newSite(s)).id;
      else { site.position = [...s.position]; site.candidateId = s.candidateId; }
    }
    Object.assign(existing, fields);
  }
  pool.stations = planIds;
  for (const d of plan.deployments) {
    global(d.id, 'dep');
    const existing = next.deployments.find(x => x.id === d.id);
    if (existing) Object.assign(existing, { name: d.name, stations: [...d.stations] });
    else next.deployments.push({ id: d.id, name: d.name, stations: [...d.stations], note: '' });
  }
  const droppedDeployments = study.deployments.slice(1).filter(id => !plan.deployments.some(d => d.id === id));
  study.deployments = [pool.id, ...plan.deployments.map(d => d.id)];
  next.deployments = next.deployments.filter(d => !droppedDeployments.includes(d.id) || next.studies.some(s => s.deployments.includes(d.id)));
  for (const id of previous.filter(id => !planIds.includes(id))) {
    if (next.deployments.some(d => d.stations.includes(id))) continue;
    const site = find(next.stations, id, 'Station').placement.site;
    next.stations = next.stations.filter(x => x.id !== id);
    if (!next.stations.some(x => x.placement.site === site)) next.sites = next.sites.filter(x => x.id !== site);
  }
  const used = new Set(next.stations.map(s => s.detector)), kept = next.detectors.filter(d => used.has(d.id));
  next.detectors = kept.length ? kept : next.detectors.slice(0, 1);
  return validateWorkspace(next);
}

// Adds new items of a selection to the workspace: identical ones (same ID and content) are skipped, a
// detector equal to a local one is mapped onto it, and any conflict (same ID, other content) refuses the
// whole merge; choosing per conflict arrives with the import preview (step 5). Returns { workspace, added, skipped }.
export function mergeSelection(ws, selection) {
  const next = structuredClone(validateWorkspace(ws)), incoming = structuredClone(validateWorkspace(selection));
  let added = 0, skipped = 0;
  const conflicts = [], detectorMap = new Map();
  for (const d of incoming.detectors) {
    const same = next.detectors.find(x => x.id === d.id);
    if (same) { if (itemHash(same) === itemHash(d)) skipped++; else conflicts.push(d.id); continue; }
    const equal = next.detectors.find(x => deviceKey(x) === deviceKey(d));
    if (equal) { detectorMap.set(d.id, equal.id); skipped++; } else { next.detectors.push(d); added++; }
  }
  for (const s of incoming.stations) s.detector = detectorMap.get(s.detector) ?? s.detector;
  for (const kind of ['sites', 'stations', 'deployments', 'studies']) {
    for (const item of incoming[kind]) {
      const same = next[kind].find(x => x.id === item.id);
      if (!same) { next[kind].push(item); added++; } else if (itemHash(same) === itemHash(item)) skipped++; else conflicts.push(item.id);
    }
  }
  if (conflicts.length) throw new Error(`Import conflict: ${conflicts.length} item(s) already exist here with other content (${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? ', …' : ''})`);
  return { workspace: validateWorkspace(next), added, skipped };
}

// A plan of the dataset candidates (or a 1.x plan file) as a new study with fresh IDs.
export function addStudyFromPlan(ws, plan, { random } = {}) {
  const { workspace: converted } = migrateStudies({ release: ws.release.id, contentHash: ws.release.contentHash, studies: [{ id: 'new', plan, session: null }], random });
  const studyId = converted.studies[0].id;
  return { workspace: mergeSelection(ws, selectWorkspace(converted, [studyId])).workspace, studyId };
}

// Removes the study only: its deployments and stations stay in the workspace (they may be shared).
export const removeStudy = (ws, studyId) => validateWorkspace({ ...ws, studies: ws.studies.filter(s => s.id !== studyId) });

// An imported selection, merged, opens as a study: its own study root, or a new study holding the
// imported deployments and stations (as a 1.x import created a study).
export function studyForImport(ws, selection, { title, exposureDays = DEFAULT_EXPOSURE_DAYS, random } = {}) {
  const merged = mergeSelection(ws, selection).workspace, root = selection.roots.find(id => id.startsWith('study-'));
  if (root) return { workspace: ensurePool(merged, root, { random }), studyId: root };
  const deployments = selection.roots.filter(id => id.startsWith('dep-'));
  const stations = [...new Set([...deployments.flatMap(id => find(merged.deployments, id, 'Deployment').stations), ...selection.roots.filter(id => id.startsWith('sta-'))])];
  const pool = { id: newId('dep', random), name: `${title}${POOL_MARK}`.slice(-200), stations, note: '' };
  const study = { id: newId('study', random), title, scenes: [{ id: 's1', label: '', scenario: null, anomalies: [] }], deployments: [pool.id, ...deployments],
    exposure: { kind: 'constant', days: exposureDays }, aim: null, basis: null, note: '' };
  return { workspace: validateWorkspace({ ...merged, deployments: [...merged.deployments, pool], studies: [...merged.studies, study] }), studyId: study.id };
}

// Session: the stored workspace session (2.0 shape) for the study state of one study (1.x shape), and back.
export function legacySession(ws, session, studyId) {
  if (!session || session.activeStudy !== studyId) return null;
  const study = find(ws.studies, studyId, 'Study'), w = session.working;
  const working = w ? { from: w.station, name: w.name, x: w.position[0], y: w.position[1], z: w.position[2], az: w.pose.azimuthDeg, el: w.pose.elevationDeg,
    model: w.device.model, settings: settingsFromDetector({ device: w.device, response: { ...w.response, exposureDays: study.exposure.days } }) } : null;
  return { activeStation: w?.station ?? null, ...(working ? { working } : {}), compare: [...session.shown], ...(session.activeDeployment ? { activeDeployment: session.activeDeployment } : {}) };
}

export function workspaceSession(ws, studyId, legacy, previous = {}) {
  const w = legacy?.working, station = w ? ws.stations.find(s => s.id === w.from) : null;
  const working = w ? { site: station?.placement.site ?? null, station: station?.id ?? null, name: w.name, position: [w.x, w.y, w.z],
    pose: { azimuthDeg: w.az, elevationDeg: w.el }, ...detectorWithoutExposure(detectorFromSettings(w.model, w.settings)) } : null;
  return { version: 1, activeStudy: studyId, activeDeployment: legacy?.activeDeployment ?? null, shown: [...(legacy?.compare ?? [])],
    exposureDays: previous.exposureDays ?? DEFAULT_EXPOSURE_DAYS, working };
}
