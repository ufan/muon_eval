// 3D feature layers (ADR-029, FR-M11): which subject features the 3D view can show
// on their own, grouped as the dataset declares them. Pure; reads the catalogue only.
// Water bodies stay context surfaces with their own layers; aggregate features have
// no component of their own (until FR-GE4).
import { crossingsAlongRay, computeRecognitionLayers } from './recognition-layers.js';

const DEFAULT_ROLES = new Set(['reference_void', 'target']);

// Groups the display profile hides (resolveFeatureLayerOptions) are kept, unlisted and off by default: the panel
// leaves them out and the 3D view does not pick them, but linked emphasis can still highlight their features.
export function featureLayerGroups(catalogue, { hiddenGroups = [] } = {}) {
  const hidden = new Set(hiddenGroups);
  return catalogue.groups.map(group => {
    const features = group.featureIds.map(id => catalogue.get(id)).filter(f => f.kind === 'direct' && f.category !== 'water');
    // Shown by default only when everything in the group is something users look for.
    return { id: group.id, label: group.label, featureIds: features.map(f => f.id),
      defaultVisible: !hidden.has(group.id) && features.length > 0 && features.every(f => DEFAULT_ROLES.has(f.imagingRole)), listed: !hidden.has(group.id) };
  }).filter(group => group.featureIds.length);
}

export function recognitionItemForFeature(items, featureId) {
  return items.find(item => item.kind === 'features' && item.featureIds.includes(featureId)) ?? null;
}

// Listed features the ray runs through by more than the threshold, in ray order;
// same rule as the recognition crossings (the detector's own space is excluded).
export function featuresAlongRay(pixel, featureIds, { threshold = 0 } = {}) {
  return crossingsAlongRay(pixel, featureIds.map(id => ({ id, kind: 'features', featureIds: [id] })), { threshold }).map(c => c.id);
}

// "In view" (ADR-029): the feature's mask in this result is non-empty, by the same rule as
// the outlines (length > threshold, the detector's own space excluded).
export function featuresInView(data, featureIds, { threshold } = {}) {
  const layers = computeRecognitionLayers(data, featureIds.map(id => ({ id, kind: 'features', featureIds: [id] })), threshold === undefined ? {} : { threshold });
  return new Set(layers.filter(layer => layer.inView).map(layer => layer.id));
}
