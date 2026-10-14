// Bounded dependency assembly, not a plugin registry or a new calculation core.
// The compiled GLB/BVH backend is the only scientific backend; capabilities
// gate the UI features it does not provide yet (migration targets, ROADMAP).
import { loadCompiledMeshRuntime } from './compiled-mesh-runtime.js';
import { createCompiledMainAssessment } from './compiled-main-assessment.js';
import { compiledDefaultStations } from './compiled-deployment-adapter.js';
import { placeInCavity } from './station-placement.js';
import { computeSliceMask } from './slice-plane.js';
import { itemParts, itemContains, sampleTargetPoints } from './target-samples.js';

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
    // Station placement inside a clicked cavity, on the calculation's geometry (never the display's).
    placeInCavity: pick => placeInCavity(pick, (origin, direction, length) => runtime.traceRayModel(origin, direction, length)),
    // Slice-plane mask on the calculation geometry: matter is any material denser than 0.01 g/cm³ (gases excluded).
    sliceMask: request => computeSliceMask({ ...request, classify: point => runtime.classifyModel(point),
      isMatter: c => (runtime.projectionGeometry.materials[c.material]?.density ?? 0) > 0.01 }),
    // Points inside each recognition item (#15 overview), from the calculation geometry: id → points.
    targetSamples: async ({ items, signal = null, yieldTo }) => {
      const components = runtime.components.filter(c => c.bvh).map(c => ({ ...c.bvh.bounds, entityIds: c.sourceEntityIds, material: c.metadata.material_id }));
      const samples = new Map();
      for (const item of items) {
        samples.set(item.id, await sampleTargetPoints({ parts: itemParts(item, components), contains: c => itemContains(item, c), classify: point => runtime.classifyModel(point), signal, ...(yieldTo ? { yieldTo } : {}) }));
      }
      return samples;
    },
    stations: compiledDefaultStations(dataset), environment: structuredClone(runtime.variables), waterLayers,
    capabilities: { continuousWater: false, targetSignificance: false, fluxCloud: false, layers: ['dam','terrain','upwater','downwater','cone'] },
    scenarios: [...dataset.geometry.scenarios.values()].map(s => ({ id: s.id, label: s.label, variables: { ...s.variables } })),
    environmentDescription: Object.entries(runtime.variables).map(([key,value]) => `${key}=${value}`).join(' · ') };
}
