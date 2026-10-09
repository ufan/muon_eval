import { mapPatternOverlayToGraph } from './projection-pattern-fields.js';
import { contributionPathData } from './contribution-view.js';

// Pure display preparation, suitable for the geometry worker. Keep the original
// slope-space overlay untouched for scientific export and provenance inspection.
export function prepareReferenceViewLayers(overlays, fields, bins) {
  return overlays.map(overlay => {
    if (overlay.semantic !== 'structural-reference') throw new Error('Structural reference required');
    const material = overlay.settings.material, field = fields.find(f => f.material === material);
    if (!field) throw new Error('Reference mapping requires its material field');
    const mapped = mapPatternOverlayToGraph(overlay, field, { width: bins, height: bins });
    return { material, color: material === 'concrete' ? '#ffffff' : '#ffae58', overlay,
      mapped, pathData: contributionPathData(mapped.lines) };
  });
}
