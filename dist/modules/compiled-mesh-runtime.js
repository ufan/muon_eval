import { decodeCompiledGlb } from './compiled-glb.js';
import { createTriangleBVH } from './triangle-bvh.js';
import { auditSemanticMappings } from './semantic-mapping.js';

export async function loadCompiledMeshRuntime(dataset, scenarioId) {
  if (!dataset.geometry) throw new Error('Compiled mesh runtime requires a native geometry IR');
  const compiled = await dataset.loadCompiledScenario(scenarioId);
  const visualOnlyIds = [...dataset.geometry.entities.values()].filter(e => e.realization === 'virtual').map(e => `virtual:${e.id}`)
    .concat(dataset.geometry.source.markers.map(marker => `marker:${marker.id}`));
  const decoded = decodeCompiledGlb(compiled.buffer, { ...compiled, visualOnlyIds });
  const manifest = dataset.compiledManifest;
  return createCompiledMeshRuntime(decoded, { identity: dataset.identity, geometry: dataset.geometry, variables: compiled.variables,
    assetIdentity: { specSha256: manifest.input.spec_sha256,
      glbSha256: manifest.outputs[manifest.scenarios[scenarioId].glb] } });
}

export function createCompiledMeshRuntime(decoded, { identity, geometry, variables, assetIdentity = { status: 'unverified-buffer' } }) {
  if (decoded.frame !== 'model_frame' || decoded.version !== '0.1.0') throw new Error('Unsupported decoded mesh runtime');
  const tolerance = geometry.tolerances.ray.intersection_m;
  const semanticAudit = auditSemanticMappings(decoded.components, geometry);
  const components = decoded.components.map(component => {
    const metadata = component.metadata;
    if (metadata.scenario_id !== decoded.scenarioId || metadata.frame !== 'model_frame'
      || !metadata.flags || ['physics', 'display', 'pick'].some(flag => typeof metadata.flags[flag] !== 'boolean')
      || (metadata.flags.physics && !geometry.materials.has(metadata.material_id))) throw new Error('Invalid runtime component metadata');
    const sourceId = component.metadata.source_entity_id;
    return { ...component,
      sourceEntityIds: geometry.entities.has(sourceId) || geometry.waterBodies.has(sourceId) ? [sourceId] : [],
      sourceMapping: geometry.entities.has(sourceId) || geometry.waterBodies.has(sourceId) ? 'entity' : component.metadata.flags.physics ? 'aggregate' : 'visual',
      bvh: component.metadata.flags.physics ? createTriangleBVH(component, { tolerance, pointTolerance: geometry.tolerances.analytic.point_classification_m }) : null };
  });
  const physical = components.filter(c => c.bvh), precedence = geometry.classification.material_precedence;
  if (!physical.length) throw new Error('Compiled runtime has no physical components');
  const rank = material => precedence.indexOf(material);
  const ordered = [...physical].sort((a, b) => rank(a.metadata.material_id) - rank(b.metadata.material_id));
  function validatePoint(point) { if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) throw new Error('Invalid model point'); }
  function classifyModel(point) {
    validatePoint(point);
    const occupied = ordered.filter(component => component.bvh.containsPoint(point));
    const dense = occupied.find(component => component.metadata.material_id !== 'air');
    return { material: dense?.metadata.material_id || 'air', componentId: dense?.componentId || null,
      componentIds: occupied.map(component => component.componentId), entityIds: [...new Set(occupied.flatMap(component => component.sourceEntityIds))] };
  }
  function traceRayModel(origin, direction, length) {
    validatePoint(origin); validatePoint(direction);
    if (!Number.isFinite(length) || length < 0 || Math.abs(Math.hypot(...direction) - 1) > 1e-5) throw new Error('Invalid mesh ray');
    // Rounded reference directions are renormalized; distances remain in metres.
    const norm = Math.hypot(...direction), unit = direction.map(value => value / norm);
    const events = [];
    for (const component of physical) for (const [start, end] of component.bvh.rayIntervals(origin, unit, length)) {
      events.push({ t: start, component, enter: true }, { t: end, component, enter: false });
    }
    events.sort((a, b) => a.t - b.t);
    const active = new Set(), segments = [], totals = Object.fromEntries([...geometry.materials.keys()].map(id => [id, 0]));
    const componentLengths = {}, entityLengths = {};
    let cursor = 0, index = 0;
    function accumulate(end) {
      if (end <= cursor) return;
      const occupied = [...active], dense = occupied.filter(c => c.metadata.material_id !== 'air').sort((a, b) => rank(a.metadata.material_id) - rank(b.metadata.material_id))[0];
      const material = dense?.metadata.material_id || 'air', span = end - cursor;
      const componentIds = occupied.map(c => c.componentId).sort(), entityIds = [...new Set(occupied.flatMap(c => c.sourceEntityIds))].sort();
      totals[material] += span;
      for (const id of componentIds) componentLengths[id] = (componentLengths[id] || 0) + span;
      for (const id of entityIds) entityLengths[id] = (entityLengths[id] || 0) + span;
      const last = segments.at(-1);
      if (last && last.material === material && JSON.stringify(last.componentIds) === JSON.stringify(componentIds)) last.t1 = end;
      else segments.push({ t0: cursor, t1: end, material, componentIds, entityIds });
      cursor = end;
    }
    while (index < events.length) {
      const at = events[index].t; accumulate(at);
      let next = index;
      while (next < events.length && events[next].t - at <= tolerance) next++;
      // Remove exits before entries at coincident boundaries; no double material budget.
      for (let i = index; i < next; i++) if (!events[i].enter) active.delete(events[i].component);
      for (let i = index; i < next; i++) if (events[i].enter) active.add(events[i].component);
      index = next;
    }
    accumulate(length);
    // Expose the existing winning-material integral, not component overlaps or
    // a second density formula in a projection adapter. Preserve summation order.
    const materialColumns = {};
    const mwe = [...geometry.materials].reduce((sum, [id, material]) => {
      const column = id === 'air' ? 0 : totals[id] * material.density;
      if (!Number.isFinite(column) || column < 0) throw new Error('Invalid material column contribution');
      materialColumns[id] = column;
      return id === 'air' ? sum : sum + column;
    }, 0);
    if (!Number.isFinite(mwe)) throw new Error('Invalid total material column');
    return { totals, materialColumns, segments, componentLengths, entityLengths, mwe };
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  function traceTargetRayModel(entityId, origin, direction, length) {
    const target = semanticAudit.targets.find(target => target.id === entityId);
    if (!target) throw new Error(`Unmapped or nonphysical semantic target ${entityId}`);
    const trace = traceRayModel(origin, direction, length);
    const segments = trace.segments.filter(segment => segment.entityIds.includes(entityId));
    return { entityId, componentIds: [...target.componentIds], semanticLength: trace.entityLengths[entityId] || 0,
      segments, materialLengths: segments.reduce((totals, segment) => {
        totals[segment.material] = (totals[segment.material] || 0) + segment.t1 - segment.t0; return totals;
      }, {}), significanceAvailable: false };
  }
  for (const component of physical) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], component.bvh.bounds.min[axis]); max[axis] = Math.max(max[axis], component.bvh.bounds.max[axis]);
  }
  const projectionGeometry = structuredClone({ version: '1.0.0',
    geometryVersion: `${identity.dataset_version || 'unversioned'}/${geometry.adapter || 'unversioned-buffer-adapter'}/${geometry.irVersion || 'unversioned-ir'}`,
    assetIdentity, frame: 'model_frame', coordinates: geometry.source?.frames || { status: 'not-provided', frame: 'model_frame' },
    densityUnits: 'g/cm3', materials: Object.fromEntries([...geometry.materials].map(([id, m]) => [id, { density: m.density }])),
    classification: geometry.classification, tolerances: geometry.tolerances });
  return { ...decoded, identity: { ...identity }, variables: { ...variables }, components, bounds: { min, max }, projectionGeometry,
    backend: 'compiled-triangle-bvh@0.1.0', classifyModel, traceRayModel, traceTargetRayModel, semanticAudit,
    limitations: ['Frozen compiled scenario only; continuous water levels and aggregate source-entity mapping are not yet resolved.'],
    unresolvedSourceComponents: components.filter(c => c.sourceMapping === 'aggregate').map(c => c.componentId) };
}
