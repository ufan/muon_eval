// Display profile (ADR-029): a release's optional, presentation-only list of
// recognition items for projection outlines. Resolved against the feature
// catalogue; never part of geometry or result identity. Invalid profiles fail
// closed. Without a profile, defaults are derived from the catalogue.
const PROFILE_MAJOR = '1';
const SELECT_KEYS = ['system', 'category', 'class', 'imaging_role'];
const FEATURE_FIELD = { system: 'group', category: 'category', class: 'class', imaging_role: 'imagingRole' };
const isColour = value => /^#[0-9A-Fa-f]{6}$/.test(value ?? '');
const isLabel = value => value && ['zh', 'en'].every(key => typeof value[key] === 'string' && value[key].trim());
const deepFreeze = value => {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) deepFreeze(item); Object.freeze(value); }
  return value;
};

export function resolveRecognitionItems(profile, catalogue, materialIds) {
  const direct = catalogue.features.filter(f => f.kind === 'direct');
  if (profile === null || profile === undefined) {
    // One default-off item per class of direct reference voids or targets, in catalogue order.
    const classes = [...new Set(direct.filter(f => ['reference_void', 'target'].includes(f.imagingRole)).map(f => f.class))];
    return deepFreeze(classes.map(id => ({ id, label: { ...catalogue.classes[id].label }, kind: 'features',
      featureIds: direct.filter(f => f.class === id).map(f => f.id), material: null, color: catalogue.classes[id].color, default: false })));
  }
  if (typeof profile.profile_version !== 'string' || profile.profile_version.split('.')[0] !== PROFILE_MAJOR) throw new Error('Unsupported display profile version');
  if (!Array.isArray(profile.recognition_items) || !profile.recognition_items.length) throw new Error('Display profile needs at least one recognition item');
  const ids = new Set();
  return deepFreeze(profile.recognition_items.map(item => {
    if (!/^[a-z0-9_]+$/.test(item.id ?? '')) throw new Error(`Invalid recognition item ID ${item.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate recognition item ${item.id}`);
    ids.add(item.id);
    if (!isLabel(item.label)) throw new Error(`Recognition item ${item.id} needs a zh/en label`);
    if (typeof item.default !== 'boolean') throw new Error(`Recognition item ${item.id} needs a boolean default`);
    if (item.color !== undefined && !isColour(item.color)) throw new Error(`Invalid colour on recognition item ${item.id}`);
    const sources = ['members', 'select', 'material'].filter(key => item[key] !== undefined);
    if (sources.length !== 1) throw new Error(`Recognition item ${item.id} needs exactly one of members, select or material`);
    const resolved = { id: item.id, label: { zh: item.label.zh, en: item.label.en }, default: item.default };
    if (item.material !== undefined) {
      if (!materialIds.includes(item.material)) throw new Error(`Unknown material ${item.material} on ${item.id}`);
      if (!isColour(item.color)) throw new Error(`Material item ${item.id} needs a colour`);
      return { ...resolved, kind: 'material', featureIds: null, material: item.material, color: item.color.toUpperCase() };
    }
    let featureIds;
    if (item.members !== undefined) {
      if (!Array.isArray(item.members) || !item.members.length) throw new Error(`Recognition item ${item.id} has no members`);
      for (const id of item.members) {
        const feature = catalogue.get(id);
        if (!feature) throw new Error(`Unknown feature ${id} in ${item.id}`);
        if (feature.kind !== 'direct') throw new Error(`Feature ${id} in ${item.id} is aggregate and cannot be outlined until FR-GE4`);
      }
      if (new Set(item.members).size !== item.members.length) throw new Error(`Duplicate member in ${item.id}`);
      featureIds = [...item.members];
    } else {
      const keys = Object.keys(item.select ?? {});
      if (!keys.length || keys.some(key => !SELECT_KEYS.includes(key) || typeof item.select[key] !== 'string')) throw new Error(`Invalid select on ${item.id}`);
      featureIds = direct.filter(f => keys.every(key => f[FEATURE_FIELD[key]] === item.select[key])).map(f => f.id);
      if (!featureIds.length) throw new Error(`Recognition item ${item.id} matches no direct feature`);
    }
    return { ...resolved, kind: 'features', featureIds, material: null, color: (item.color ?? catalogue.get(featureIds[0]).color).toUpperCase() };
  }).map(({ id, label, kind, featureIds, material, color, default: on }) => ({ id, label, kind, featureIds, material, color, default: on })));
}
