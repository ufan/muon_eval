// Attribution comes only from declared source IDs, not names, spatial guesses
// or connectivity relations. Aggregate geometry requires compiler provenance.
export function auditSemanticMappings(components, geometry) {
  const records = components.map(component => {
    const metadata = component.metadata, sourceId = metadata.source_entity_id;
    const source = geometry.entities.get(sourceId) || geometry.waterBodies.get(sourceId);
    if (source && metadata.semantics_ref && metadata.semantics_ref !== sourceId) throw new Error('Conflicting component semantic reference');
    if (source && metadata.flags.physics && source.realization === 'virtual') throw new Error('Virtual entity cannot have a physical semantic mapping');
    const status = source ? (metadata.flags.physics ? 'direct' : 'visual') : metadata.flags.physics ? 'aggregate' : 'visual';
    return { componentId: component.componentId, sourceEntityId: source?.id || null, declaredSourceId: sourceId || null,
      status, physics: metadata.flags.physics, role: metadata.role, materialId: metadata.material_id || null,
      name: source?.semantics?.names?.en || source?.semantics?.names?.zh || source?.id || component.componentId,
      semantics: source ? structuredClone(source.semantics || {}) : {},
      evidence: source ? 'Declared source_entity_id resolves to canonical release object' : status === 'aggregate'
        ? 'No canonical entity for aggregate source ID; per-entity ownership unavailable' : 'Display-only proxy; excluded from physical target masks' };
  });
  const mappedIds = new Set(records.filter(record => record.status === 'direct').map(record => record.sourceEntityId));
  const targets = [...mappedIds].sort().map(id => {
    const mapped = records.filter(record => record.status === 'direct' && record.sourceEntityId === id);
    return { id, name: mapped[0].name, semantics: mapped[0].semantics, componentIds: mapped.map(record => record.componentId).sort(),
      evidence: 'Direct compiled components', significanceAvailable: false };
  });
  return { version: '0.1.0', records, targets, maskThresholdM: geometry.tolerances.ray.intersection_m,
    unresolvedComponents: records.filter(record => record.status === 'aggregate').map(record => record.componentId).sort(),
    unmappedPhysicalEntities: [...geometry.entities.values()].filter(entity => entity.realization !== 'virtual' && !mappedIds.has(entity.id)).map(entity => entity.id).sort(),
    limitations: ['Target masks express compiled semantic-volume occupancy, not material ownership or counterfactual significance.',
      'Merged concrete/steel/rock components cannot be split into source entities from this release.'] };
}
