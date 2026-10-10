import test from 'node:test';
import { resolveStaticPath } from '../scripts/static-paths.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { loadDataset, loadDefaultDataset } from '../dist/modules/dataset-loader.js';
import { adaptDamSpecV07 } from '../dist/modules/dam-spec-v07.js';
import { createCoordinateTransform } from '../dist/modules/coordinates.js';
import { createV07QualificationKernel, containsSourceGeometry } from '../dist/modules/geometry-v07-qualification.js';
import { validateBundle, validateTerrainHeader, verifySha256 } from '../dist/modules/dataset-validation.js';
import { loadRegisteredDataset, registryUrl, readJson, sha256 } from '../scripts/dataset-fixture.mjs';

const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release);
const { spec, geometry } = dataset;
const kernel = createV07QualificationKernel(dataset);
const near = (actual, expected) => actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-9, `${actual} != ${expected}`));

test('registry keeps legacy default and separates native release identity', async () => {
  const registry = await readJson(registryUrl);
  assert.equal(registry.default_dataset, 'zhouning-lower-reservoir-dam@0.6.2');
  const legacy = await loadRegisteredDataset();
  assert.equal(legacy.geometry, null);
  assert.equal(legacy.identity.dataset_version, dataset.identity.dataset_version);
  assert.notEqual(legacy.id, dataset.id);
  assert.equal(geometry.identity.release_id, release);
  const oldVersion = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.1');
  assert.equal(oldVersion.identity.dataset_version, '0.6.1');
});

test('native adapter preserves source provenance, semantic entities and scenario state', () => {
  assert.equal(geometry.frame, 'model_frame');
  assert.equal(geometry.geometryFrame, 'doc_frame');
  assert.equal(geometry.entities.size, spec.entities.length);
  assert.deepEqual(geometry.provenance.unknowns, spec.unknowns);
  assert.deepEqual(geometry.provenance.sources, spec.sources);
  assert.deepEqual(geometry.source.contacts, spec.contacts);
  assert.equal(geometry.entities.get('bank_platform_N').realization, 'virtual');
  assert.equal(geometry.entities.get('gallery_upper').semantics.access.walkable, true);
  assert.equal(geometry.resolveScenario('high').variables.water_up_level, 298);
  assert.equal(geometry.resolveScenario('low', { water_up_level: 291 }).variables.water_up_level, 291);
  assert.throws(() => geometry.resolveScenario('missing'), /Unknown scenario/);
  assert.throws(() => geometry.resolveScenario('low', { gate_state: 'open' }), /Unsupported scenario/);
  assert.throws(() => geometry.resolveScenario('low', { water_up_level: NaN }), /Unsupported scenario/);
  const changed = structuredClone(spec), adapted = adaptDamSpecV07(changed);
  changed.unknowns.length = 0;
  assert.equal(adapted.provenance.unknowns.length, spec.unknowns.length);
});

test('known coordinate controls, inverse transforms, directions and winding', () => {
  const controls = [ [[0, 0, 198], [0, 0, 0]], [[122, 12.5, 255], [12.5, 122, 57]], [[231, 9.7, 306], [9.7, 231, 108]] ];
  for (const [doc, model] of controls) {
    near(geometry.coordinates.pointToModel(doc), model);
    near(geometry.coordinates.pointToSource(model), doc);
  }
  near(geometry.coordinates.directionToModel([0, 0, 1]), [0, 0, 1]);
  near(geometry.coordinates.directionToSource([1, 0, 0]), [0, 1, 0]);
  assert.equal(geometry.coordinates.reversesWinding, true);
  const independent = createCoordinateTransform([[0, -1, 0, 17], [1, 0, 0, -4], [0, 0, 1, 9]]);
  near(independent.pointToSource(independent.pointToModel([2, 3, 4])), [2, 3, 4]);
  near(independent.directionToModel([2, 3, 4]), [-3, 2, 4]);
  assert.throws(() => createCoordinateTransform([[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]), /singular/);
});

test('adapter fails closed on unsupported rules and broken references', () => {
  for (const [mutate, pattern] of [
    [s => s.dataset.schema_version = '0.8.0', /Unsupported schema/],
    [s => s.classification.material_precedence.reverse(), /classification/],
    [s => s.compile_operations.pop(), /compile operations/],
    [s => s.frames.model_frame.transform_from_doc.determinant = 1, /determinant/],
    [s => s.entities.push(s.entities[0]), /duplicate ID/],
    [s => s.entities[0].material_id = 'unknown', /Unknown material/],
    [s => s.entities.find(e => e.fill?.kind === 'water_to_level').fill.source_water_id = 'missing', /fill reference/],
    [s => s.conformance.required_assertions.push('missing'), /Missing required assertion/],
    [s => s.contacts[0].a.pointer = '/missing', /Unresolved contact/],
    [s => s.lod_levels[0].inherits = s.lod_levels[0].id, /LOD inheritance/],
    [s => s.parameters.crest_elev.source_refs.push('missing'), /Unknown source/],
    [s => s.relations[0].from = 'missing', /relation endpoint/],
    [s => s.asset_conformance.requires_assets[0].path = 'missing.npz', /Terrain asset/]
  ]) {
    const changed = structuredClone(spec); mutate(changed);
    assert.throws(() => adaptDamSpecV07(changed), pattern);
  }
  const candidates = structuredClone(dataset.candidates);
  candidates.dataset_ref.release_id = 'zhouning-lower-reservoir-dam@0.6.2';
  assert.throws(() => validateBundle(spec, release, { ...dataset, candidates }), /release_id/);
});

test('sha256 and terrain headers reject corrupted runtime data', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  await verifySha256(bytes, sha256(bytes), 'test', sha256);
  await assert.rejects(verifySha256(new Uint8Array([1, 2, 4]), sha256(bytes), 'test', sha256), /SHA-256 mismatch/);
  for (const update of [{ byte_order: 'big_endian' }, { axis_order: ['Y', 'X'] }, { spacing: [0, 5] }, { shape: [1, 3] }, { outside_policy: 'guess' }]) {
    assert.throws(() => validateTerrainHeader({ ...dataset.terrainNear.header, ...update }, dataset.terrainNear.values.byteLength));
  }
  assert.throws(() => validateTerrainHeader(dataset.terrainNear.header, 4), /byte length/);
});

test('gallery roof is arched and internal/virtual display metadata cannot add material', () => {
  const gallery = geometry.entities.get('gallery_upper'), g = gallery.geometry;
  const floor = g.path_xz[0][1], x = g.path_xz[0][0];
  assert.equal(containsSourceGeometry(g, [x, g.y, floor + g.section.height - 0.01]), true);
  assert.equal(containsSourceGeometry(g, [x, g.y + g.section.width / 2, floor + g.section.height - 0.01]), false);
  const virtual = geometry.entities.get('bank_platform_N');
  const [a, b] = virtual.geometry.z_range;
  const p = virtual.geometry.plan_xy.reduce((acc, point) => acc.map((value, axis) => value + point[axis] / virtual.geometry.plan_xy.length), [0, 0]);
  const classified = kernel.classifyModel(geometry.coordinates.pointToModel([...p, (a + b) / 2]), geometry.resolveScenario('low'));
  assert.ok(!classified.entityIds.includes(virtual.id));
});

test('named hydraulic material checks pass across declared water levels', () => {
  let count = 0;
  for (const assertion of spec.assertions.filter(a => a.type === 'material_points')) {
    for (const level of assertion.input.scenario_water_up_levels) for (const point of assertion.input.points) {
      const actual = kernel.classifyModel(geometry.coordinates.pointToModel(point), geometry.resolveScenario(null, { water_up_level: level }));
      assert.equal(actual.material, assertion.expected.material_id, `${assertion.id}: ${point} at ${level}`);
      count++;
    }
  }
  assert.ok(count >= 30);
});

test('upstream seed connectivity excludes disconnected wet depressions', () => {
  const source = structuredClone(spec);
  source.water_bodies.find(water => water.id === 'reservoir').connectivity.seed_xy = [95, -15];
  const adapted = adaptDamSpecV07(source);
  const terrain = {
    header: { ...dataset.terrainNear.header, origin: [-20, 90], spacing: [5, 5], shape: [5, 5] },
    values: new Float32Array(25).fill(95)
  };
  terrain.values[1 * 5 + 1] = 80;
  terrain.values[1 * 5 + 3] = 80;
  const query = createV07QualificationKernel({ geometry: adapted, terrainNear: terrain, terrainFar: dataset.terrainFar });
  const scenario = adapted.resolveScenario('low');
  assert.equal(query.classifyModel(adapted.coordinates.pointToModel([95, -15, 287]), scenario).material, 'water');
  assert.equal(query.classifyModel(adapted.coordinates.pointToModel([105, -15, 287]), scenario).material, 'air');
  terrain.values[1 * 5 + 1] = 95;
  const drySeed = createV07QualificationKernel({ geometry: adapted, terrainNear: terrain, terrainFar: dataset.terrainFar });
  assert.equal(drySeed.classifyModel(adapted.coordinates.pointToModel([105, -15, 287]), scenario).material, 'air');
});

test('qualification material queries obey bounds and reject invalid ray inputs', () => {
  assert.equal(kernel.classifyModel(geometry.coordinates.pointToModel([100, -1000, 250])).material, 'air');
  assert.throws(() => kernel.classifyModel([NaN, 0, 0]), /Invalid material query/);
  assert.throws(() => kernel.traceRayModel([0, 0, 0], [0, 0, 2], 10), /Invalid qualification ray/);
  assert.throws(() => kernel.traceRayModel([0, 0, 0], [0, 0, 1], 10, 0), /Invalid qualification ray/);
});

test('actual HTTP loader verifies native assets and lazy scenario meshes', async t => {
  let corrupt = false, nativeDefault = false;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = resolveStaticPath(url.pathname);
      let bytes = await readFile(path);
      if (nativeDefault && url.pathname.endsWith('/registry.json')) {
        const registry = JSON.parse(bytes.toString()); registry.default_dataset = release;
        bytes = Buffer.from(JSON.stringify(registry));
      }
      if (corrupt && url.pathname.endsWith('/dam_spec_v070.json')) bytes = Buffer.from(bytes.toString().replace('0.6.2', '0.6.3'));
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = `http://127.0.0.1:${server.address().port}/datasets/registry.json`;
  const loaded = await loadDataset(release, address, { digest: sha256 });
  assert.equal(loaded.geometry.identity.release_id, release);
  const mesh = await loaded.loadCompiledScenario('high');
  assert.equal(new TextDecoder().decode(mesh.buffer.slice(0, 4)), 'glTF');
  assert.equal(mesh.variables.water_up_level, 298);
  assert.ok(mesh.components.some(c => c.component_id === 'concrete'));
  await assert.rejects(loaded.loadCompiledScenario('missing'), /Unknown compiled scenario/);
  const legacy = await loadDefaultDataset(address);
  assert.equal(legacy.id, 'zhouning-lower-reservoir-dam@0.6.2');
  nativeDefault = true;
  await assert.rejects(loadDefaultDataset(address, { digest: sha256 }), /legacy-only compatibility loader/);
  corrupt = true;
  await assert.rejects(loadDataset(release, address, { digest: sha256 }), /SHA-256 mismatch/);
});
