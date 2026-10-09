import { createCoordinateTransform } from './coordinates.js';
import { datasetIdentity, validateV07References } from './dataset-validation.js';

// A deliberately bounded native adapter, not a v0.7 → v0.6 conversion.
// Future schema profiles must advertise supported rules before reaching the query backend.
const geometryTypes = new Set(['extrusion_x', 'extrusion_z', 'box', 'sweep_xz', 'sweep_y', 'chute']);
const supportedOperations = [
  { id: 'concrete_union', result: 'concrete', op: 'union', of: { selectors: [{ kind: 'solid', material_id: 'concrete', realization: 'solid' }] } },
  { id: 'concrete_clip', result: 'concrete', op: 'intersect', with: { region: 'above_foundation_within_crest' } },
  { id: 'concrete_minus_voids', result: 'concrete', op: 'subtract', of: { selectors: [{ kind: 'void', realization: 'solid' }] } },
  { id: 'steel_union', result: 'steel', op: 'union', of: { selectors: [{ kind: 'solid', material_id: 'steel', realization: 'solid' }] } },
  { id: 'concrete_minus_steel', result: 'concrete', op: 'subtract', of: { results: ['steel'] } },
  { id: 'rock_base', result: 'rock', op: 'below_surface', surface: 'effective_terrain' },
  { id: 'rock_minus_structures', result: 'rock', op: 'subtract', of: { results: ['concrete', 'steel'], selectors: [{ kind: 'void', realization: 'solid' }] } },
  { id: 'water_bodies_fill', result: 'water', op: 'fill_below_level', bodies: 'water_bodies' },
  { id: 'water_minus_solids', result: 'water', op: 'subtract', of: { results: ['concrete', 'steel', 'rock'], selectors: [{ kind: 'void', realization: 'solid' }] } },
  { id: 'void_fills', result: 'void_water', op: 'fill_below_level', bodies: 'void_fills' }
];
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const uniqueIndex = (records, name) => {
  const index = new Map();
  for (const record of records) {
    if (!record.id || index.has(record.id)) throw new Error(`${name}: missing or duplicate ID ${record.id}`);
    index.set(record.id, record);
  }
  return index;
};

export function adaptDamSpecV07(spec) {
  const identity = datasetIdentity(spec);
  if (identity.schema_version !== '0.7.0') throw new Error(`Unsupported schema version ${identity.schema_version}`);
  const source = structuredClone(spec);
  validateV07References(source);
  if (source.units.length !== 'm' || source.units.density !== 'g/cm3' || source.units.angle !== 'deg') throw new Error('Unsupported dataset units');
  const policy = source.classification;
  if (canonical(policy.material_precedence) !== canonical(['steel', 'concrete', 'rock', 'water', 'air'])
    || policy.comparison !== 'closed_intervals' || policy.structure_clip.kind !== 'above_foundation_within_crest'
    || canonical(policy.structure_clip.applies_to) !== canonical(['solid', 'void'])
    || canonical(policy.structure_clip.exempt_materials) !== canonical(['steel'])
    || policy.structure_clip.foundation !== 'foundation_surface'
    || policy.void_effect !== 'voids remove structure material; filled part takes fill material'
    || policy.shared_surface !== 'higher_precedence' || policy.tangent_ray !== 'zero_length_contact'
    || policy.water_surface !== 'water' || policy.outside_model !== 'air') throw new Error('Unsupported v0.7 classification policy');
  if (canonical(source.compile_operations) !== canonical(supportedOperations)) throw new Error('Unsupported v0.7 compile operations');
  const coordinates = createCoordinateTransform(source.frames.model_frame.transform_from_doc.matrix_3x4);
  const declared = source.frames.model_frame.transform_from_doc.determinant;
  if (Math.abs(coordinates.determinant - declared) > 1e-10) throw new Error('Coordinate determinant does not match declaration');
  const resolveNumber = value => {
    const resolved = typeof value === 'number' ? value : source.parameters[value?.parameter_ref]?.value;
    if (!Number.isFinite(resolved)) throw new Error(`Unresolved numeric parameter ${value?.parameter_ref}`);
    return resolved;
  };
  const transform = source.frames.model_frame.transform_from_doc;
  if (transform.z_offset_parameter_ref && transform.matrix_3x4[2][3] !== -resolveNumber({ parameter_ref: transform.z_offset_parameter_ref })) throw new Error('Coordinate elevation offset does not match parameter');
  const materials = uniqueIndex(source.materials, 'materials');
  if (canonical([...materials.keys()].sort()) !== canonical(['air', 'concrete', 'rock', 'steel', 'water'])) throw new Error('Unsupported v0.7 material set');
  const entities = uniqueIndex(source.entities, 'entities');
  const waterBodies = uniqueIndex(source.water_bodies, 'water bodies');
  const variables = uniqueIndex(source.scenario_variables, 'scenario variables');
  const scenarios = uniqueIndex(source.scenarios, 'scenarios');
  const defaults = Object.fromEntries([...variables].map(([id, variable]) => [id,
    typeof variable.default === 'object' ? resolveNumber(variable.default) : variable.default]));
  const resolveScenario = (scenarioId = null, overrides = {}) => {
    if (scenarioId !== null && !scenarios.has(scenarioId)) throw new Error(`Unknown scenario ${scenarioId}`);
    const values = { ...defaults, ...scenarios.get(scenarioId)?.variables, ...overrides };
    for (const [id, value] of Object.entries(values)) {
      const variable = variables.get(id);
      if (!variable || (variable.allowed ? !variable.allowed.includes(value) : !Number.isFinite(value))) throw new Error(`Unsupported scenario variable ${id}=${value}`);
    }
    return { id: scenarioId, variables: values };
  };
  for (const scenario of scenarios.values()) resolveScenario(scenario.id);
  for (const entity of entities.values()) {
    if (!geometryTypes.has(entity.geometry.type)) throw new Error(`Unsupported geometry ${entity.geometry.type}`);
    if (!['solid', 'virtual'].includes(entity.realization) || !['solid', 'void'].includes(entity.kind)) throw new Error(`Unsupported entity ${entity.id}`);
    if (entity.kind === 'solid' && !materials.has(entity.material_id)) throw new Error(`Unknown material on ${entity.id}`);
    if (entity.kind === 'void') {
      const fill = entity.fill;
      if (!['air', 'water_to_level'].includes(fill.kind)) throw new Error(`Unsupported fill on ${entity.id}`);
      if (fill.kind === 'water_to_level' && (!waterBodies.has(fill.source_water_id) || !variables.has(fill.level.scenario_variable) || fill.material_id !== 'water')) throw new Error(`Invalid fill reference on ${entity.id}`);
    }
    if (entity.output_clip && !entities.has(entity.output_clip.entity_id)) throw new Error(`Invalid output clip on ${entity.id}`);
  }
  for (const water of waterBodies.values()) {
    if (water.kind !== 'region_below_level' || water.material_id !== 'water' || water.bounded_below.kind !== 'terrain'
      || water.connectivity.kind !== 'seed_connected' || !variables.has(water.level.scenario_variable)) throw new Error(`Unsupported water body ${water.id}`);
  }
  const clipRange = policy.structure_clip.x_range.map(resolveNumber);
  if (clipRange[0] > clipRange[1]) throw new Error('Invalid structure clip range');
  return {
    irVersion: '0.1.0', adapter: 'dam-spec-v07@0.1.0', identity: { ...identity },
    frame: 'model_frame', geometryFrame: 'doc_frame', coordinates,
    materials, entities, waterBodies, scenarios, resolveScenario, resolveNumber,
    classification: policy, clipRange, tolerances: source.tolerances,
    // Source geometry remains in its explicitly declared frame. Public queries use model_frame.
    source, provenance: { sources: source.sources, parameters: source.parameters, unknowns: source.unknowns },
    limitations: ['Analytic qualification backend uses compiled terrain sampling; it is not the compiled mesh/BVH backend.']
  };
}
