// Subject-feature catalogue (ADR-029): one entry per non-virtual entity and
// water body of a release, built only from the dataset's own declarations
// (semantics + vocabulary). Generic: it reads v0.7 fields, never subject IDs.
// Consumers (3D feature layer, outlines, picking, coverage, metrics) read this
// catalogue instead of keeping their own ID lists.
const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) deepFreeze(item); Object.freeze(value); }
  return value;
};

export function buildFeatureCatalogue({ entities, waterBodies, vocabulary, components }) {
  const classes = vocabulary?.classes, systems = vocabulary?.systems, roles = vocabulary?.imaging_roles;
  if (!classes || !systems || !roles) throw new Error('Feature catalogue needs vocabulary classes, systems and imaging roles');
  // Direct: the feature owns at least one physical compiled component.
  const owned = new Set(components.filter(c => c.flags?.physics && c.source_entity_id).map(c => c.source_entity_id));
  const features = [], seen = new Set();
  const add = (record, source) => {
    if (seen.has(record.id)) throw new Error(`Duplicate feature ID ${record.id}`);
    seen.add(record.id);
    const semantics = record.semantics ?? {}, declared = classes[semantics.class];
    if (!declared) throw new Error(`Unknown semantic class ${semantics.class} on ${record.id}`);
    if (!Object.hasOwn(systems, semantics.system ?? '')) throw new Error(`Unknown or missing system ${semantics.system} on ${record.id}`);
    if (!/^#[0-9A-Fa-f]{6}$/.test(declared.color ?? '')) throw new Error(`Invalid class colour for ${semantics.class}`);
    const imagingRole = semantics.imaging_role ?? declared.default_imaging_role;
    if (!Object.hasOwn(roles, imagingRole ?? '')) throw new Error(`Unknown imaging role ${imagingRole} on ${record.id}`);
    features.push({ id: record.id, source, label: { zh: semantics.names?.zh ?? declared.zh, en: semantics.names?.en ?? declared.en },
      class: semantics.class, category: declared.category, group: semantics.system, color: declared.color.toUpperCase(),
      imagingRole, kind: owned.has(record.id) ? 'direct' : 'aggregate' });
  };
  for (const entity of entities) if (entity.realization !== 'virtual') add(entity, 'entity');
  for (const water of waterBodies) add(water, 'water_body');
  // Order: declared system order, then feature ID.
  const systemOrder = Object.keys(systems);
  features.sort((a, b) => systemOrder.indexOf(a.group) - systemOrder.indexOf(b.group) || a.id.localeCompare(b.id));
  const groups = systemOrder.filter(id => features.some(f => f.group === id))
    .map(id => ({ id, label: systems[id], featureIds: features.filter(f => f.group === id).map(f => f.id) }));
  // Labels and colours of the classes in use (e.g. for derived recognition items).
  const usedClasses = Object.fromEntries([...new Set(features.map(f => f.class))].map(id => [id,
    { label: { zh: classes[id].zh, en: classes[id].en }, category: classes[id].category, color: classes[id].color.toUpperCase() }]));
  const imagingRoles = { ...roles };
  deepFreeze(features); deepFreeze(groups); deepFreeze(usedClasses); deepFreeze(imagingRoles);
  const byId = new Map(features.map(f => [f.id, f]));
  return Object.freeze({ version: '1.0.0', features, groups, classes: usedClasses, imagingRoles, get: id => byId.get(id) ?? null });
}
