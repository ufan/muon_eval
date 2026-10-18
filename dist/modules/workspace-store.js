// The workspace of a release in browser storage (docs/specs/WORKSPACE_FORMAT.md, Browser storage, Migration).
// Storage is passed in; reads and writes never throw (private windows, blocked storage).
//   muon-workspace:<release>          the workspace, canonical text
//   muon-workspace-session:<release>  session state { version, activeStudy, activeDeployment, shown, exposureDays, working }
//   muon-workspace-invalid:<release>  a stored workspace that could not be read, kept aside before anything replaces it
// 1.x studies (plan-store.js) are converted once and left in place as a backup.
import { parseWorkspace, serializeWorkspace, createWorkspace, migrateStudies } from './workspace-format.js';
import { openStudies, readLegacyStudies } from './plan-store.js';

export const workspaceKey = release => `muon-workspace:${release}`;
export const workspaceSessionKey = release => `muon-workspace-session:${release}`;
export const invalidWorkspaceKey = release => `muon-workspace-invalid:${release}`;
const DEFAULT_EXPOSURE_DAYS = 30;
const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };
const readJson = (storage, key) => { try { return JSON.parse(read(storage, key)); } catch { return null; } };
const finite = values => Array.isArray(values) && values.every(v => typeof v === 'number' && Number.isFinite(v));

export const saveWorkspace = (storage, release, workspace) => write(storage, workspaceKey(release), serializeWorkspace(workspace));
export const saveWorkspaceSession = (storage, release, session) => write(storage, workspaceSessionKey(release), JSON.stringify(session));

// Session parts that do not fit the workspace are dropped; the rest is kept.
export function readSession(stored, workspace) {
  const ids = new Set([...workspace.stations, ...workspace.deployments, ...workspace.studies, ...workspace.sites].map(item => item.id));
  const s = stored && typeof stored === 'object' ? stored : {}, w = s.working;
  const working = w && typeof w === 'object' && typeof w.name === 'string' && finite(w.position) && w.position.length === 3
    && w.pose && finite([w.pose.azimuthDeg, w.pose.elevationDeg]) && w.device && typeof w.device === 'object' && typeof w.device.model === 'string'
    && w.response && typeof w.response === 'object'
    ? { site: ids.has(w.site) ? w.site : null, station: ids.has(w.station) ? w.station : null, name: w.name, position: [...w.position],
      pose: { azimuthDeg: w.pose.azimuthDeg, elevationDeg: w.pose.elevationDeg }, device: { ...w.device }, response: { ...w.response } } : null;
  const known = (id, prefix) => typeof id === 'string' && id.startsWith(`${prefix}-`) && ids.has(id) ? id : null;
  return { version: 1, activeStudy: known(s.activeStudy, 'study'), activeDeployment: known(s.activeDeployment, 'dep'),
    shown: Array.isArray(s.shown) ? s.shown.filter(id => known(id, 'sta')) : [],
    exposureDays: Number.isInteger(s.exposureDays) && s.exposureDays >= 1 && s.exposureDays <= 3650 ? s.exposureDays : DEFAULT_EXPOSURE_DAYS, working };
}

// Opens the release's workspace. Returns { workspace, session, source: 'stored' | 'migrated' | 'new', report, warning? }.
// A new workspace (one detector, nothing saved) is not written until saved. `legacy` is the openStudies context, so
// storage from before studies first becomes a 1.x study and then moves over with the others.
export function openWorkspace({ storage, release, contentHash = null, defaultDetector, legacy = null, random }) {
  let warning;
  const text = read(storage, workspaceKey(release));
  if (text !== null) {
    try {
      const workspace = parseWorkspace(text);
      if (workspace.release.id !== release) throw new Error(`stored under ${release} but made for ${workspace.release.id}`);
      return { workspace, session: readSession(readJson(storage, workspaceSessionKey(release)), workspace), source: 'stored', report: [] };
    } catch (error) {
      warning = `Stored workspace ignored (kept as ${invalidWorkspaceKey(release)}): ${error.message}`;
      if (read(storage, invalidWorkspaceKey(release)) === null) write(storage, invalidWorkspaceKey(release), text);
    }
  }
  const done = result => warning === undefined ? result : { ...result, warning };
  if (legacy) openStudies(legacy);
  const { studies, active, problems } = readLegacyStudies(storage, release);
  const report = problems.map(problem => `Not migrated: ${problem}`);
  if (studies.length) {
    const migrated = migrateStudies({ release, contentHash, studies, active, random });
    report.push(...migrated.report);
    saveWorkspace(storage, release, migrated.workspace);
    saveWorkspaceSession(storage, release, migrated.session);
    return done({ workspace: migrated.workspace, session: readSession(migrated.session, migrated.workspace), source: 'migrated', report });
  }
  const workspace = createWorkspace({ release, contentHash, detector: defaultDetector, random });
  return done({ workspace, session: readSession(null, workspace), source: 'new', report });
}
