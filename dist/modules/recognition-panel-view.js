import { computeRecognitionLayers, DEFAULT_MASK_THRESHOLD_M } from './recognition-layers.js';
import { recognitionItemForFeature } from './feature-layers.js';
// Recognition-item list of the projection panel (ADR-029, FR-M12): the release's
// display-profile items plus any direct feature the user adds, the mask threshold,
// and the layers of the current result. Selection and threshold persist per release.
export function createRecognitionPanel({ root = document, features, items, storage, storageKey, onChange = () => {}, onHoverItem = () => {} }) {
  const $ = s => root.querySelector(s), list = $('#recognitionItems'), extra = $('#recognitionExtra'), thresholdInput = $('#recognitionThreshold');
  const featureItem = feature => Object.freeze({ id: `feature:${feature.id}`, label: feature.label, kind: 'features',
    featureIds: Object.freeze([feature.id]), material: null, color: feature.color, default: false });
  let saved = {};
  try { saved = JSON.parse(storage.getItem(storageKey)) ?? {}; } catch {}
  const extras = new Set((saved.extras ?? []).filter(id => features.get(id)?.kind === 'direct'));
  const allItems = () => [...items, ...[...extras].map(id => featureItem(features.get(id)))];
  const known = new Set(allItems().map(item => item.id));
  const selected = new Set(Array.isArray(saved.selected) ? saved.selected.filter(id => known.has(id)) : items.filter(item => item.default).map(item => item.id));
  let threshold = Number.isFinite(saved.threshold) && saved.threshold >= 0 ? saved.threshold : DEFAULT_MASK_THRESHOLD_M;
  let data = null, layers = new Map();
  const persist = () => { try { storage.setItem(storageKey, JSON.stringify({ selected: [...selected], extras: [...extras], threshold })); } catch {} };

  function compute() { layers = data ? new Map(computeRecognitionLayers(data, allItems(), { threshold }).map(layer => [layer.id, layer])) : new Map(); }
  function render() {
    // Fixed order (profile, then added features) so the list does not jump between results;
    // items without pixels in the current view are greyed, not hidden.
    list.replaceChildren(...allItems().map(item => {
      const layer = layers.get(item.id), label = document.createElement('label'), input = document.createElement('input'),
        swatch = document.createElement('i'), coverage = document.createElement('small');
      input.type = 'checkbox'; input.dataset.recognition = item.id; input.checked = selected.has(item.id);
      swatch.style.setProperty('--c', item.color);
      coverage.textContent = layer ? (layer.inView ? `${(100 * layer.coverage).toFixed(layer.coverage < .01 ? 1 : 0)}%` : '视野外') : '';
      label.classList.toggle('out', !!layer && !layer.inView); label.title = item.label.en;
      label.append(input, swatch, document.createTextNode(item.label.zh), coverage);
      input.addEventListener('change', () => { input.checked ? selected.add(item.id) : selected.delete(item.id); persist(); onChange(); });
      label.addEventListener('mouseenter', () => onHoverItem(item)); label.addEventListener('mouseleave', () => onHoverItem(null));
      return label;
    }));
    const inView = [...layers.values()].filter(layer => layer.inView).length;
    $('#recognitionStatus').textContent = data ? `${inView}/${allItems().length} 项在视野内` : '—';
  }
  function fillExtra() {
    const taken = new Set(allItems().flatMap(item => item.featureIds?.length === 1 ? item.featureIds : []));
    extra.replaceChildren(new Option('其他构件…', ''), ...features.features.filter(f => f.kind === 'direct' && !taken.has(f.id))
      .map(f => new Option(f.label.zh, f.id)));
  }
  extra.addEventListener('change', () => {
    const feature = features.get(extra.value); if (!feature) return;
    extras.add(feature.id); selected.add(`feature:${feature.id}`); persist(); fillExtra(); compute(); render(); onChange();
  });
  thresholdInput.value = String(threshold);
  thresholdInput.addEventListener('change', () => {
    const value = Number(thresholdInput.value);
    if (!Number.isFinite(value) || value < 0) { thresholdInput.value = String(threshold); return; }
    threshold = value; persist(); compute(); render(); onChange();
  });
  fillExtra(); render();
  return Object.freeze({
    update(result) { data = result; compute(); render(); },
    // A feature picked in 3D toggles the outline of its item; a feature in no item becomes one.
    toggleFeature(featureId) {
      const feature = features.get(featureId); if (!feature || feature.kind !== 'direct') return;
      const item = recognitionItemForFeature(allItems(), featureId);
      if (!item) { extras.add(featureId); selected.add(`feature:${featureId}`); fillExtra(); compute(); }
      else if (selected.has(item.id)) selected.delete(item.id); else selected.add(item.id);
      persist(); render(); onChange();
    },
    itemForFeature: featureId => recognitionItemForFeature(allItems(), featureId),
    state: () => ({ items: allItems(), layers, selected: new Set(selected), threshold })
  });
}
