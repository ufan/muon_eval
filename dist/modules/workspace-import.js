// Import of workspace files (docs/specs/WORKSPACE_FORMAT.md, Import; ADR-033). Pure.
// Until the import preview (step 5) a merge adds new items, skips identical ones and refuses any conflict.
import { validateWorkspace, itemHash, deviceKey } from './workspace-format.js';

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

// The stations an imported file is about, to show after the merge: those of its roots (a study's deployments,
// deployments, stations), or every station of a whole-workspace file; and the first imported deployment.
export function importedFocus(selection) {
  const byId = new Map([...selection.deployments, ...selection.studies].map(item => [item.id, item]));
  const deployments = selection.roots.flatMap(id => id.startsWith('study-') ? byId.get(id).deployments : id.startsWith('dep-') ? [id] : []);
  const stations = selection.roots.length
    ? [...new Set([...deployments.flatMap(id => byId.get(id).stations), ...selection.roots.filter(id => id.startsWith('sta-'))])]
    : selection.stations.map(s => s.id);
  return { stations, deployment: deployments[0] ?? null };
}
