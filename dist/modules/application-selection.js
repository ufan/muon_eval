// Explicit release/backend selection. No fallback to another scientific backend.
export function resolveApplicationSelection(registry, search = '') {
  const params = new URLSearchParams(search);
  for (const key of ['dataset', 'backend', 'scenario']) {
    if (params.getAll(key).length > 1 || (params.has(key) && !params.get(key))) throw new Error(`Invalid application selection: ${key}`);
  }
  const datasetId = params.get('dataset') ?? registry.default_dataset;
  const entry = registry.datasets?.[datasetId];
  if (!entry) throw new Error(`Unregistered dataset release ${datasetId}`);
  if (entry.adapter && entry.adapter !== 'dam-spec-v07') throw new Error(`Unsupported dataset adapter ${entry.adapter}`);
  const supportedBackend = entry.adapter === 'dam-spec-v07' ? 'compiled' : 'legacy';
  const backend = params.get('backend') ?? supportedBackend;
  if (backend !== supportedBackend) throw new Error(`Backend ${backend} cannot run release ${datasetId}`);
  const scenarioId = params.get('scenario');
  if (backend === 'legacy' && scenarioId !== null) throw new Error('Legacy continuous-water backend does not accept frozen scenario IDs');
  return Object.freeze({ datasetId, backend, scenarioId });
}

export function applicationSelectionSearch({ datasetId, backend, scenarioId }) {
  const params = new URLSearchParams({ dataset: datasetId, backend });
  if (scenarioId !== null && scenarioId !== undefined) params.set('scenario', scenarioId);
  return `?${params}`;
}
