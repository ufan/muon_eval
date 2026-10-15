import { featureLayerGroups } from './feature-layers.js';
// 3D feature-layer panel (FR-M11): one checkbox per feature group, expandable to its
// features. View state only, remembered per release; hiding never changes results.
export function createFeatureLayerPanel({ root = document, features, storage, storageKey, onVisibility = () => {}, onHoverFeatures = () => {} }) {
  const host = root.querySelector('#featureLayers'), groups = featureLayerGroups(features);
  let saved = {};
  try { saved = JSON.parse(storage.getItem(storageKey)) ?? {}; } catch {}
  const visible = new Map(groups.flatMap(group => group.featureIds.map(id => [id, typeof saved[id] === 'boolean' ? saved[id] : group.defaultVisible])));
  const persist = () => { try { storage.setItem(storageKey, JSON.stringify(Object.fromEntries(visible))); } catch {} };
  const rows = groups.map(group => {
    const row = document.createElement('div'), head = document.createElement('div'), label = document.createElement('label'), box = document.createElement('input'),
      expand = document.createElement('button'), list = document.createElement('div');
    row.className = 'feature-group'; head.className = 'feature-group-head'; list.className = 'feature-list'; list.hidden = true;
    box.type = 'checkbox'; box.dataset.featureGroup = group.id;
    expand.type = 'button'; expand.textContent = '▸'; expand.title = '展开构件'; expand.setAttribute('aria-expanded', 'false');
    expand.addEventListener('click', () => { list.hidden = !list.hidden; expand.textContent = list.hidden ? '▸' : '▾'; expand.setAttribute('aria-expanded', String(!list.hidden)); });
    label.append(box, document.createTextNode(group.label), Object.assign(document.createElement('small'), { textContent: String(group.featureIds.length) }));
    const featureBoxes = group.featureIds.map(id => {
      const feature = features.get(id), item = document.createElement('label'), input = document.createElement('input'), swatch = document.createElement('i');
      input.type = 'checkbox'; input.dataset.feature = id; swatch.style.setProperty('--c', feature.color);
      item.title = feature.label.en; item.append(input, swatch, document.createTextNode(feature.label.zh));
      input.addEventListener('change', () => { set(id, input.checked); sync(); });
      item.addEventListener('mouseenter', () => onHoverFeatures([id])); item.addEventListener('mouseleave', () => onHoverFeatures([]));
      list.append(item); return input;
    });
    box.addEventListener('change', () => { for (const id of group.featureIds) set(id, box.checked); sync(); });
    head.addEventListener('mouseenter', () => onHoverFeatures(group.featureIds)); head.addEventListener('mouseleave', () => onHoverFeatures([]));
    head.append(label, expand); row.append(head, list);
    const sync = () => {
      const on = group.featureIds.filter(id => visible.get(id)).length;
      box.checked = on === group.featureIds.length; box.indeterminate = on > 0 && on < group.featureIds.length;
      featureBoxes.forEach((input, i) => { input.checked = visible.get(group.featureIds[i]); });
    };
    sync(); return row;
  });
  function set(id, on) { visible.set(id, on); persist(); onVisibility(id, on); }
  host.replaceChildren(...rows);
  return Object.freeze({ apply() { for (const [id, on] of visible) onVisibility(id, on); } });
}
