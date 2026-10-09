import { enclosingCompiledRayLength } from './compiled-main-assessment.js';

// This sidecar explicitly accompanies the bounded v0.7 profile in doc_frame.
// Preserve its reference points without adding the legacy detector-height offset.
export function compiledDefaultStations(dataset) {
  if(dataset.geometry?.geometryFrame!=='doc_frame')throw new Error('Compiled candidate source frame must be explicit doc_frame');
  return dataset.candidates.candidates.map(candidate => {
    const point = candidate.example_position ?? candidate.geometry?.position;
    if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite) || candidate.binding !== false)
      throw new Error(`Unsupported compiled candidate ${candidate.id}`);
    const [x, y, z] = dataset.geometry.coordinates.pointToModel(point);
    return { id: candidate.id, name: candidate.names?.zh ?? candidate.id, x, y, z, az: 0, el: 25,
      hostEntityId: candidate.host_entity_id, binding: false, rationale: candidate.rationale };
  });
}

export function compiledDeploymentExport({ dataset, runtime, input, ray, candidates }) {
  return { schemaVersion: '0.1.0', kind: 'compiled-deployment-snapshot', frame: 'model_frame',
    identity: structuredClone(dataset.identity), backend: runtime.backend, scenarioId: runtime.scenarioId,
    variables: structuredClone(runtime.variables), device: structuredClone(input.device), response: structuredClone(input.response),
    trace: { maximumDistanceM: enclosingCompiledRayLength([input.station.x, input.station.y, input.station.z], runtime.bounds),
      boundsModel: structuredClone(runtime.bounds), policy: 'enclose-published-finite-mesh' },
    projectionGeometry: structuredClone(runtime.projectionGeometry),
    activeRay: { station: structuredClone(input.station), materialPathM: { ...ray.totals }, materialColumnsMwe: { ...ray.materialColumns }, mwe: ray.mwe },
    candidates: structuredClone(candidates), limitations: [...runtime.limitations,
      'Versioned export snapshot only; not a complete plan save/load format or a certified deployment recommendation.'] };
}
