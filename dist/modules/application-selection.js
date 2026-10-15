// Explicit release/scenario selection. The compiled GLB/BVH backend is the only
// scientific backend; unknown releases, backends or scenarios fail closed.
export function resolveApplicationSelection(registry, search = '') {
  const params = new URLSearchParams(search);
  for (const key of ['dataset', 'backend', 'scenario']) {
    if (params.getAll(key).length > 1 || (params.has(key) && !params.get(key))) throw new Error(`Invalid application selection: ${key}`);
  }
  const datasetId = params.get('dataset') ?? registry.default_dataset;
  const entry = registry.datasets?.[datasetId];
  if (!entry) throw new Error(`Unregistered dataset release ${datasetId}`);
  if (entry.adapter !== 'dam-spec-v07') throw new Error(`Unsupported dataset adapter ${entry.adapter}`);
  const backend = params.get('backend') ?? 'compiled';
  if (backend !== 'compiled') throw new Error(`Backend ${backend} cannot run release ${datasetId}`);
  return Object.freeze({ datasetId, backend, scenarioId: params.get('scenario') });
}

export function applicationSelectionSearch({ datasetId, scenarioId }) {
  const params = new URLSearchParams({ dataset: datasetId, backend: 'compiled' });
  if (scenarioId !== null && scenarioId !== undefined) params.set('scenario', scenarioId);
  return `?${params}`;
}

// The two entry points (ADR-030) link to each other with the same selection.
export const APP_PAGES = Object.freeze({ main: './', workbench: './geometry-preview.html' });
export function selectionHref(page, selection) {
  if (!Object.values(APP_PAGES).includes(page)) throw new Error(`Unknown application page ${page}`);
  return page + applicationSelectionSearch(selection);
}
