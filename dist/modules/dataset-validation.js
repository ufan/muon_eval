export function datasetIdentity(spec) {
  const identity = spec.dataset || spec;
  for (const key of ['dataset_id', 'dataset_version', 'release_id', 'schema_id', 'schema_version']) {
    if (typeof identity[key] !== 'string' || !identity[key]) throw new Error(`Dataset is missing ${key}`);
  }
  return identity;
}

export function validateBundle(spec, registryId, { candidates, siteConditions, compiledManifest }) {
  const identity = datasetIdentity(spec);
  if (identity.release_id !== registryId) throw new Error(`Registry release ${registryId} does not match ${identity.release_id}`);
  for (const [name, document] of [['candidates', candidates], ['site conditions', siteConditions], ['compiled manifest', compiledManifest]]) {
    const ref = name === 'compiled manifest' ? document : document?.dataset_ref;
    if (!ref) throw new Error(`${name} has no dataset reference`);
    for (const key of ['dataset_id', 'dataset_version', 'schema_version', 'release_id']) {
      // Legacy sidecars predate full release references. v0.7 references are mandatory.
      if ((spec.dataset || ref[key] !== undefined) && ref[key] !== identity[key]) throw new Error(`${name}: ${key} does not match release`);
    }
  }
  return identity;
}

export async function verifySha256(bytes, expected, label, digest = digestSha256) {
  if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error(`${label}: invalid SHA-256`);
  const actual = await digest(bytes);
  if (actual !== expected) throw new Error(`${label}: SHA-256 mismatch`);
}

export function validateTerrainHeader(header, byteLength) {
  const validPair = (pair, test) => Array.isArray(pair) && pair.length === 2 && pair.every(test);
  if (header.dtype !== 'float32' || header.byte_order !== 'little_endian' || header.layout !== 'row_major'
    || header.frame !== 'model_frame' || header.unit !== 'm' || JSON.stringify(header.axis_order) !== '["X","Y"]'
    || header.interpolation !== 'bilinear' || header.nodata !== null
    || !validPair(header.shape, n => Number.isInteger(n) && n >= 2)
    || !validPair(header.spacing, n => Number.isFinite(n) && n > 0)
    || !validPair(header.origin, Number.isFinite)) throw new Error('Unsupported or invalid terrain header');
  if (byteLength !== header.shape[0] * header.shape[1] * 4) throw new Error('Terrain byte length does not match shape');
  if (!['use_far_grid', 'clamp_to_edge'].includes(header.outside_policy)) throw new Error('Unsupported terrain outside policy');
}

// Cross-reference gate complements the offline JSON Schema/profile gate.
export function validateV07References(spec) {
  const index = (records, name) => {
    const result = new Map();
    for (const record of records) {
      if (!record.id || result.has(record.id)) throw new Error(`${name}: missing or duplicate ID ${record.id}`);
      result.set(record.id, record);
    }
    return result;
  };
  const entities = index(spec.entities, 'entities'), water = index(spec.water_bodies, 'water bodies');
  const markers = index(spec.markers, 'markers'), nodes = index(spec.nodes, 'nodes');
  const all = index([...spec.entities, ...spec.water_bodies, ...spec.markers, ...spec.nodes], 'scene objects');
  const sources = index(spec.sources, 'sources'), materials = index(spec.materials, 'materials');
  const variables = index(spec.scenario_variables, 'scenario variables');
  const walk = object => {
    if (!object || typeof object !== 'object') return;
    if (object.parameter_ref && !Object.hasOwn(spec.parameters, object.parameter_ref)) throw new Error(`Unknown parameter ${object.parameter_ref}`);
    if (object.scenario_variable && !variables.has(object.scenario_variable)) throw new Error(`Unknown scenario variable ${object.scenario_variable}`);
    for (const value of Object.values(object)) walk(value);
  };
  walk(spec);
  for (const [id, parameter] of Object.entries(spec.parameters)) for (const ref of parameter.source_refs || []) {
    if (!sources.has(ref)) throw new Error(`Unknown source ${ref} on parameter ${id}`);
  }
  for (const entity of entities.values()) {
    if (entity.kind === 'solid' && !materials.has(entity.material_id)) throw new Error(`Unknown material on ${entity.id}`);
    if (entity.fill?.source_water_id && !water.has(entity.fill.source_water_id)) throw new Error(`Invalid fill reference on ${entity.id}`);
  }
  const hydraulics = new Map([...all.keys()].map(id => [id, new Set()]));
  for (const relation of spec.relations) {
    for (const key of ['from', 'to', 'other']) if (relation[key] && !all.has(relation[key])) throw new Error(`Unknown relation endpoint ${relation[key]}`);
    if (relation.type === 'hydraulically_connected') {
      hydraulics.get(relation.from).add(relation.to);
      hydraulics.get(relation.to).add(relation.from);
    }
  }
  for (const entity of entities.values()) {
    if (entity.kind !== 'void' || entity.realization !== 'solid') continue;
    const reachable = new Set([entity.id]), pending = [entity.id];
    while (pending.length) for (const next of hydraulics.get(pending.pop())) {
      if (!reachable.has(next)) { reachable.add(next); pending.push(next); }
    }
    if (entity.fill.kind === 'air' ? [...water.keys()].some(id => reachable.has(id)) : !reachable.has(entity.fill.source_water_id)) {
      throw new Error(`Invalid hydraulic fill relation on ${entity.id}`);
    }
  }
  const pointerValue = (object, pointer) => {
    for (const token of pointer.replace(/^\//, '').split('/')) object = object?.[token.replace(/~1/g, '/').replace(/~0/g, '~')];
    return object;
  };
  for (const contact of spec.contacts) for (const side of ['a', 'b']) {
    const ref = contact[side];
    const value = ref.entity_id ? pointerValue(entities.get(ref.entity_id), ref.pointer)
      : ref.marker_id ? pointerValue(markers.get(ref.marker_id), ref.pointer)
        : ref.water_body_id ? pointerValue(water.get(ref.water_body_id), ref.pointer)
          : ref.terrain_pointer ? pointerValue(spec.terrain, ref.terrain_pointer) : spec.parameters[ref.parameter_ref]?.value;
    if (!Number.isFinite(value)) throw new Error(`Unresolved contact ${contact.id || ''}/${side}`);
    if (contact.relation === 'mirror' && !spec.frames.transforms[contact.transform_ref]) throw new Error('Unknown contact transform');
  }
  const core = index(spec.assertions, 'assertions');
  for (const id of spec.conformance.required_assertions) if (!core.has(id)) throw new Error(`Missing required assertion ${id}`);
  const assetAssertions = index(spec.asset_conformance.assertions, 'asset assertions');
  for (const id of spec.asset_conformance.required_assertions) if (!assetAssertions.has(id)) throw new Error(`Missing asset assertion ${id}`);
  const assets = new Map();
  for (const asset of spec.asset_conformance.requires_assets) {
    if (assets.has(asset.role)) throw new Error(`Duplicate asset role ${asset.role}`);
    assets.set(asset.role, asset.path);
  }
  for (const [name, grid] of Object.entries(spec.terrain.grids)) {
    if (assets.get(`${name}_terrain_grid`) !== grid.file) throw new Error(`Terrain asset reference mismatch: ${name}`);
  }
  const lods = index(spec.lod_levels, 'LOD levels');
  for (const lod of lods.values()) {
    const visited = new Set([lod.id]); let parent = lod.inherits;
    while (parent) {
      if (!lods.has(parent) || visited.has(parent)) throw new Error('Invalid LOD inheritance');
      visited.add(parent); parent = lods.get(parent).inherits;
    }
    for (const id of [...lod.include, ...lod.exclude]) if (id !== 'foundation_surface' && !entities.has(id) && !water.has(id)) throw new Error(`Unknown LOD entity ${id}`);
  }
  // Keep separate namespaces explicit; markers/nodes are semantic objects, never materials.
  return { entities, water, markers, nodes };
}
import { digestSha256 } from './sha256.js';
