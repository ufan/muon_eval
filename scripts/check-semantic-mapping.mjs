import { loadRegisteredDataset, readJson } from './dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--dataset')) throw new Error('Usage: node scripts/check-semantic-mapping.mjs [--dataset release-id]');
const registry = await readJson(new URL('../datasets/registry.json', import.meta.url));
const releaseId = args[1] || Object.keys(registry.datasets).find(id => registry.datasets[id].adapter === 'dam-spec-v07');
const dataset = await loadRegisteredDataset(releaseId);
if (!dataset.geometry) throw new Error('Semantic mapping audit requires a native compiled release');
const scenarios = [];
for (const id of dataset.geometry.scenarios.keys()) {
  const runtime = await loadCompiledMeshRuntime(dataset, id);
  scenarios.push({ scenarioId: id, ...runtime.semanticAudit });
}
console.log(JSON.stringify({ releaseId, identity: dataset.identity, scenarios }, null, 2));
