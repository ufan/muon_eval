// 3D feature layers (ADR-029, FR-M11): which subject features the 3D view can show
// on their own, grouped as the dataset declares them. Pure; reads the catalogue only.
// Water bodies stay context surfaces with their own layers; aggregate features have
// no component of their own (until FR-GE4).
const DEFAULT_ROLES = new Set(['reference_void', 'target']);

export function featureLayerGroups(catalogue) {
  return catalogue.groups.map(group => {
    const features = group.featureIds.map(id => catalogue.get(id)).filter(f => f.kind === 'direct' && f.category !== 'water');
    // Shown by default only when everything in the group is something users look for.
    return { id: group.id, label: group.label, featureIds: features.map(f => f.id),
      defaultVisible: features.length > 0 && features.every(f => DEFAULT_ROLES.has(f.imagingRole)) };
  }).filter(group => group.featureIds.length);
}

export function recognitionItemForFeature(items, featureId) {
  return items.find(item => item.kind === 'features' && item.featureIds.includes(featureId)) ?? null;
}

// Listed features the ray runs through by more than the threshold, in ray order.
export function featuresAlongRay(pixel, featureIds, { threshold = 0 } = {}) {
  const { q } = pixel, entry = id => q.segments.find(segment => segment.entityIds.includes(id))?.t0 ?? Infinity;
  return featureIds.filter(id => (q.entityLengths?.[id] ?? 0) > threshold).sort((a, b) => entry(a) - entry(b));
}
