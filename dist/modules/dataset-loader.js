const fetchJson = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取 ${url} (${response.status})`);
  return response.json();
};

const resolveUrl = (base, relative) => new URL(relative, new URL(base, location.href)).href;

function validateBundle(spec, registryId, candidates) {
  const releaseId = `${spec.dataset_id}@${spec.dataset_version}`;
  if (releaseId !== registryId) throw new Error(`数据集登记 ${registryId} 与规格 ${releaseId} 不一致`);
  if (!spec.schema_id || !spec.schema_version) throw new Error('规格缺少 schema_id/schema_version');
  const ref = candidates.dataset_ref;
  if (ref && `${ref.dataset_id}@${ref.dataset_version}` !== releaseId) {
    throw new Error('候选点引用的数据集版本与几何规格不一致');
  }
}

async function loadTerrain(base, descriptor) {
  const header = await fetchJson(resolveUrl(base, descriptor.header));
  const response = await fetch(resolveUrl(base, descriptor.data));
  if (!response.ok) throw new Error(`无法读取地形数据 (${response.status})`);
  const buffer = await response.arrayBuffer();
  const expected = header.shape[0] * header.shape[1];
  const values = new Float32Array(buffer);
  if (values.length !== expected) throw new Error(`地形数组长度 ${values.length}，期望 ${expected}`);
  return { header, values };
}

export async function loadDefaultDataset(registryUrl = './data/datasets.json') {
  const registry = await fetchJson(registryUrl);
  const id = registry.default_dataset;
  const entry = registry.datasets?.[id];
  if (!entry) throw new Error(`默认数据集 ${id} 未登记`);
  const base = resolveUrl(registryUrl, entry.base_url);
  const [spec, candidates, detectorModels, siteConditions, compiledManifest, terrainNear, terrainFar] = await Promise.all([
    fetchJson(resolveUrl(base, entry.spec)),
    fetchJson(resolveUrl(base, entry.deployment_candidates)),
    fetchJson(resolveUrl(base, entry.detector_models)),
    fetchJson(resolveUrl(base, entry.site_conditions)),
    fetchJson(resolveUrl(base, entry.compiled_manifest)),
    loadTerrain(base, entry.terrain_near),
    loadTerrain(base, entry.terrain_far)
  ]);
  validateBundle(spec, id, candidates);
  return { id, base, entry, spec, candidates, detectorModels, siteConditions, compiledManifest, terrainNear, terrainFar };
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

