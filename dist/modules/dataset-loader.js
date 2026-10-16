import { adaptDamSpecV07 } from './dam-spec-v07.js';
import { buildFeatureCatalogue } from './feature-catalogue.js';
import { resolveAxisLabels, resolveFeatureLayerOptions, resolveRecognitionItems } from './display-profile.js';
import { validateBundle, validateTerrainHeader, verifySha256 } from './dataset-validation.js';

// fetch/digest injection lets Node tests exercise the actual browser loading path.
export async function loadDataset(id = null, registryUrl = './datasets/registry.json', options = {}) {
  const fetcher = options.fetch || globalThis.fetch;
  const registryAddress = new URL(registryUrl, options.baseUrl || globalThis.location?.href || import.meta.url);
  const fetchBytes = async url => {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`无法读取 ${url} (${response.status})`);
    return response.arrayBuffer();
  };
  const json = bytes => JSON.parse(new TextDecoder().decode(bytes));
  const registry = json(await fetchBytes(registryAddress));
  id ??= registry.default_dataset;
  const entry = registry.datasets?.[id];
  if (!entry) throw new Error(`数据集 ${id} 未登记`);
  if (entry.adapter !== 'dam-spec-v07') throw new Error(`Unsupported dataset adapter ${entry.adapter}`);
  const base = new URL(entry.base_url, registryAddress).href;
  const bytes = async relative => {
    const buffer = await fetchBytes(new URL(relative, base));
    await verifySha256(buffer, entry.integrity?.[relative], relative, options.digest);
    return buffer;
  };
  const readJson = async relative => json(await bytes(relative));
  const loadTerrain = async descriptor => {
    const header = await readJson(descriptor.header);
    const buffer = await bytes(descriptor.data);
    validateTerrainHeader(header, buffer.byteLength);
    if (header.file !== descriptor.data.split('/').at(-1)) throw new Error('Terrain header names a different data file');
    await verifySha256(buffer, header.sha256, descriptor.data, options.digest);
    // Decode the declared endianness rather than relying on host byte order.
    const view = new DataView(buffer), values = new Float32Array(buffer.byteLength / 4);
    for (let i = 0; i < values.length; i++) {
      values[i] = view.getFloat32(i * 4, true);
      if (!Number.isFinite(values[i])) throw new Error('Terrain contains non-finite heights');
    }
    return { header, values };
  };
  const [spec, candidates, detectorModels, siteConditions, compiledManifest, terrainNear, terrainFar] = await Promise.all([
    readJson(entry.spec),
    readJson(entry.deployment_candidates),
    readJson(entry.detector_models),
    readJson(entry.site_conditions),
    readJson(entry.compiled_manifest),
    loadTerrain(entry.terrain_near),
    loadTerrain(entry.terrain_far)
  ]);
  const identity = validateBundle(spec, id, { candidates, siteConditions, compiledManifest });
  if (compiledManifest.manifest_version !== '0.3' || compiledManifest.frame?.name !== 'model_frame') throw new Error('Unsupported compiled manifest contract');
  if (compiledManifest.input.spec_file !== entry.spec || compiledManifest.input.spec_sha256 !== entry.integrity[entry.spec]) throw new Error('Manifest source spec does not match registry');
  const geometry = adaptDamSpecV07(spec);
  for (const candidate of candidates.candidates) {
    if (!geometry.entities.has(candidate.host_entity_id) || candidate.binding !== false) throw new Error(`Invalid candidate ${candidate.id}`);
  }
  for (const condition of siteConditions.conditions) {
    if (!geometry.entities.has(condition.entity_id)) throw new Error(`Unknown site-condition entity ${condition.entity_id}`);
  }
  for (const scenario of geometry.scenarios.values()) {
    const compiled = compiledManifest.scenarios[scenario.id];
    const sameVariables = compiled && Object.keys(compiled.variables).length === Object.keys(scenario.variables).length
      && Object.entries(scenario.variables).every(([name, value]) => compiled.variables[name] === value);
    if (!sameVariables) throw new Error(`Compiled scenario ${scenario.id} does not match source`);
    for (const component of compiled.components) {
      if (component.scenario_id !== scenario.id || component.frame !== 'model_frame' || !geometry.materials.has(component.material_id)) throw new Error(`Invalid compiled component ${component.component_id}`);
    }
    if (compiledManifest.outputs[compiled.glb] !== entry.integrity[`compiled/${compiled.glb}`]) throw new Error(`Compiled mesh ${compiled.glb} does not match registry`);
  }
  const features = buildFeatureCatalogue({ entities: geometry.entities.values(), waterBodies: geometry.waterBodies.values(),
    vocabulary: spec.vocabulary, components: Object.values(compiledManifest.scenarios).flatMap(scenario => scenario.components) });
  // Optional display profile: presentation only, with its own hash outside the authored package integrity (ADR-029).
  let profile = null;
  if (entry.display_profile) {
    const buffer = await fetchBytes(new URL(entry.display_profile.path, base));
    await verifySha256(buffer, entry.display_profile.sha256, entry.display_profile.path, options.digest);
    profile = json(buffer);
  }
  const recognitionItems = resolveRecognitionItems(profile, features, [...geometry.materials.keys()]), featureLayers = resolveFeatureLayerOptions(profile, features), axisLabels = resolveAxisLabels(profile);
  const loadCompiledScenario = async scenarioId => {
    const scenario = compiledManifest.scenarios[scenarioId];
    if (!scenario) throw new Error(`Unknown compiled scenario ${scenarioId}`);
    const relative = `compiled/${scenario.glb}`, buffer = await bytes(relative);
    await verifySha256(buffer, compiledManifest.outputs[scenario.glb], relative, options.digest);
    return { scenarioId, variables: scenario.variables, components: scenario.components, buffer };
  };
  return { id, identity, base, entry, spec, geometry, features, featureLayers, axisLabels, recognitionItems, candidates, detectorModels, siteConditions, compiledManifest, terrainNear, terrainFar, loadCompiledScenario };
}

export function sampleTerrainModel(terrain, modelX, modelY) {
  const { header, values } = terrain;
  const [nx, ny] = header.shape;
  const fx = (modelX - header.origin[0]) / header.spacing[0];
  const fy = (modelY - header.origin[1]) / header.spacing[1];
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return null;
  const i0 = Math.min(nx - 2, Math.floor(fx)), j0 = Math.min(ny - 2, Math.floor(fy));
  const tx = fx - i0, ty = fy - j0;
  const at = (i, j) => values[i * ny + j];
  return (1 - tx) * ((1 - ty) * at(i0, j0) + ty * at(i0, j0 + 1))
    + tx * ((1 - ty) * at(i0 + 1, j0) + ty * at(i0 + 1, j0 + 1));
}
