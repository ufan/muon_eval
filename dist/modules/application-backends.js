// Bounded dependency assembly, not a plugin registry or a new calculation core.
// The compiled GLB/BVH backend is the only scientific backend; capabilities
// gate the UI features it does not provide yet (migration targets, ROADMAP).
import { loadCompiledMeshRuntime } from './compiled-mesh-runtime.js';
import { createCompiledMainAssessment } from './compiled-main-assessment.js';
import { compiledDefaultStations, compiledDeploymentExport } from './compiled-deployment-adapter.js';

export async function createApplicationBackend(dataset, selection) {
  if (selection.datasetId !== dataset.id) throw new Error('Loaded dataset differs from application selection');
  if (selection.backend !== 'compiled' || !dataset.geometry) throw new Error('Unsupported compiled application selection');
  const scenarioId = selection.scenarioId ?? dataset.geometry.scenarios.keys().next().value;
  if (!dataset.geometry.scenarios.has(scenarioId)) throw new Error(`Unknown compiled scenario ${scenarioId}`);
  const runtime = await loadCompiledMeshRuntime(dataset, scenarioId);
  const waterLayers = Object.fromEntries(['upwater','downwater'].map((layer, index) => [layer,
    [...dataset.geometry.waterBodies.values()].filter(body => body.semantics?.class === (index ? 'tailwater' : 'reservoir')).flatMap(body => [body.id,
      ...[...dataset.geometry.entities.values()].filter(entity => entity.fill?.source_water_id === body.id).map(entity => entity.id)])]));
  return { selection: { ...selection, scenarioId }, runtime, assessment: createCompiledMainAssessment({ runtime }),
    stations: compiledDefaultStations(dataset), environment: structuredClone(runtime.variables), waterLayers,
    capabilities: { continuousWater: false, targetSignificance: false, targetContours: false, fluxCloud: false, layers: ['dam','terrain','upwater','downwater','cone'] },
    scenarios: [...dataset.geometry.scenarios.values()].map(s => ({ id: s.id, label: s.label, variables: { ...s.variables } })),
    environmentDescription: Object.entries(runtime.variables).map(([key,value]) => `${key}=${value}`).join(' · '),
    exportFileName: 'compiled-deployment-snapshot-v1.json',
    exportPlan: (input, ray, candidates) => compiledDeploymentExport({ dataset, runtime, input, ray, candidates }) };
}
