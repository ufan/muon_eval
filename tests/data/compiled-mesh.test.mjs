import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeCompiledGlb } from '../../dist/modules/compiled-glb.js';
import { createTriangleBVH } from '../../dist/modules/triangle-bvh.js';
import { createCompiledMeshRuntime, loadCompiledMeshRuntime } from '../../dist/modules/compiled-mesh-runtime.js';
import { createCompiledGeometryView } from '../../dist/modules/compiled-geometry-view.js';
import { sha256Portable, digestSha256 } from '../../dist/modules/sha256.js';
import { loadRegisteredDataset, readJson } from '../../scripts/dataset-fixture.mjs';
import { cube, component, glbFixture } from '../mesh-fixtures.mjs';

const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const decode = (buffer, declarations = [component('cube').metadata]) => decodeCompiledGlb(buffer, { components: declarations, scenarioId: 'low' });
const runtimeFor = components => createCompiledMeshRuntime({ version: '0.1.0', frame: 'model_frame', scenarioId: 'low', components },
  { geometry: dataset.geometry, identity: dataset.identity, variables: dataset.geometry.resolveScenario('low').variables });

test('BVH resolves shared diagonals, inside origins, boundary starts and corner crossings', () => {
  const bvh = createTriangleBVH(cube());
  assert.deepEqual(bvh.rayIntervals([-1, 0.5, 0.5], [1, 0, 0], 3), [[1, 2]]);
  assert.deepEqual(bvh.rayIntervals([0.5, 0.5, 0.5], [1, 0, 0], 2), [[0, 0.5]]);
  assert.deepEqual(bvh.rayIntervals([0, 0.5, 0.5], [1, 0, 0], 2), [[0, 1]]);
  assert.deepEqual(bvh.rayIntervals([0, 0.5, 0.5], [-1, 0, 0], 2), []);
  const diagonal = bvh.rayIntervals([-1, -1, -1], [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], 4);
  near(diagonal[0][0], Math.sqrt(3)); near(diagonal[0][1], 2 * Math.sqrt(3));
  assert.equal(bvh.containsPoint([0.5, 0.5, 0.5]), true);
  assert.equal(bvh.containsPoint([0, 0.5, 0.5]), true);
  assert.equal(bvh.containsPoint([-0.01, 0.5, 0.5]), false);
});

test('tangent rays do not accumulate material on surfaces or edges', () => {
  const bvh = createTriangleBVH(cube());
  for (const origin of [[-1, 0, 0.5], [-1, 0, 0], [0.5, 0, 0.5]]) assert.deepEqual(bvh.rayIntervals(origin, [1, 0, 0], 3), []);
  assert.deepEqual(bvh.rayIntervals([-1, -0.1, 0.5], [1, 0, 0], 3), []);
});

test('closed shell cavity yields two concrete chords, not a filled solid', () => {
  const outer = cube([0, 0, 0], [2, 2, 2]), inner = cube([0.5, 0.5, 0.5], [1.5, 1.5, 1.5]);
  const positions = new Float32Array([...outer.positions, ...inner.positions]), reversed = [];
  for (let i = 0; i < inner.indices.length; i += 3) reversed.push(inner.indices[i] + 8, inner.indices[i + 2] + 8, inner.indices[i + 1] + 8);
  const bvh = createTriangleBVH({ positions, indices: new Uint32Array([...outer.indices, ...reversed]) });
  near(bvh.signedVolume, 7);
  assert.equal(bvh.containsPoint([1, 1, 1]), false);
  assert.equal(bvh.containsPoint([0.25, 1, 1]), true);
  assert.deepEqual(bvh.rayIntervals([-1, 1, 1], [1, 0, 0], 4), [[1, 1.5], [2.5, 3]]);
});

test('open meshes and inconsistent winding fail before material queries', () => {
  const mesh = cube();
  assert.throws(() => createTriangleBVH({ ...mesh, indices: mesh.indices.slice(3) }), /closed/);
  const reversed = mesh.indices.slice(); [reversed[1], reversed[2]] = [reversed[2], reversed[1]];
  assert.throws(() => createTriangleBVH({ ...mesh, indices: reversed }), /winding/);
});

test('material sweep honors thin steel, priority, interval conservation and density', () => {
  const concrete = component('concrete', 'concrete', cube([0, 0, 0], [2, 2, 2]));
  const steel = component('steel', 'steel', cube([0.999, 0, 0], [1.001, 2, 2]));
  const virtual = component('reference', 'rock', cube([-10, -10, -10], [10, 10, 10]), { physics: false });
  concrete.metadata.flags.display = false;
  const runtime = runtimeFor([concrete, steel, virtual]), trace = runtime.traceRayModel([-1, 1, 1], [1, 0, 0], 4);
  near(trace.totals.steel, 0.002); near(trace.totals.concrete, 1.998); near(trace.totals.air, 2);
  near(Object.values(trace.totals).reduce((a, b) => a + b), 4);
  near(trace.mwe, 1.998 * 2.4 + 0.002 * 7.85, 1e-5);
  assert.equal(runtime.classifyModel([1, 1, 1]).material, 'steel');
  assert.equal(runtime.classifyModel([0.5, 1, 1]).material, 'concrete');
  assert.equal(runtime.classifyModel([9, 9, 9]).material, 'air');
  near(runtime.traceRayModel([1, 1, 1], [1, 0, 0], 0).mwe, 0);
  assert.throws(() => runtime.traceRayModel([0, 0, 0], [2, 0, 0], 4), /Invalid mesh ray/);
});

test('coincident material boundaries assign no duplicate length', () => {
  const runtime = runtimeFor([component('left', 'concrete'), component('right', 'water', cube([1, 0, 0], [2, 1, 1]))]);
  const trace = runtime.traceRayModel([-1, 0.5, 0.5], [1, 0, 0], 4);
  near(trace.totals.concrete, 1); near(trace.totals.water, 1); near(trace.totals.air, 2);
  assert.equal(runtime.classifyModel([1, 0.5, 0.5]).material, 'concrete');
});

test('GLB handles strided accessors, hierarchy, transforms and reflected winding', () => {
  const decoded = decode(glbFixture({ interleaved: true, node: { translation: [3, 4, 5], scale: [-2, 1, 1] } }));
  const bvh = createTriangleBVH(decoded.components[0]);
  assert.deepEqual(bvh.bounds, { min: [1, 4, 5], max: [3, 5, 6] });
  near(bvh.signedVolume, 2);
  assert.equal(bvh.containsPoint([2, 4.5, 5.5]), true);
  const nested = decode(glbFixture({ mutate: json => { json.nodes.push({ translation: [7, 0, 0], children: [0] }); json.scenes[0].nodes = [1]; } }));
  assert.deepEqual(createTriangleBVH(nested.components[0]).bounds.min, [7, 0, 0]);
});

test('malformed or unsupported GLBs cannot silently become geometry', () => {
  for (const mutate of [
    json => json.asset.version = '1.0', json => json.extensionsRequired = ['KHR_draco_mesh_compression'],
    json => json.buffers[0].uri = 'https://example.invalid/mesh.bin', json => json.accessors[0].sparse = {},
    json => json.accessors[0].count = 999999, json => json.bufferViews[0].byteStride = 8,
    json => json.meshes[0].primitives[0].mode = 1, json => json.nodes[0].children = [0],
    json => json.nodes[0].name = 'unregistered', (json, view) => view.setUint32(json.bufferViews[1].byteOffset, 999, true),
    (json, view) => view.setFloat32(0, NaN, true)
  ]) assert.throws(() => decode(glbFixture({ mutate })));
  const bad = glbFixture(); new DataView(bad).setUint32(8, 100, true); assert.throws(() => decode(bad), /header/);
  assert.throws(() => decode(glbFixture(), [component('missing').metadata]), /Unregistered/);
});

test('portable SHA-256 matches known vectors, padding lengths and binary views', async () => {
  assert.equal(sha256Portable(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Portable(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const length of [55, 56, 63, 64, 65, 1000000]) {
    const bytes = new Uint8Array(length + 12).fill(97).subarray(5, 5 + length);
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256Portable(bytes), expected); assert.equal(await digestSha256(bytes), expected);
  }
});

test('all published scenarios are closed and retain component/source identities', async () => {
  for (const id of dataset.geometry.scenarios.keys()) {
    const runtime = await loadCompiledMeshRuntime(dataset, id);
    assert.equal(runtime.scenarioId, id); assert.deepEqual(runtime.variables, dataset.geometry.resolveScenario(id).variables);
    const physical = runtime.components.filter(c => c.bvh);
    assert.equal(physical.length, dataset.compiledManifest.scenarios[id].components.length);
    for (const component of physical) {
      assert.ok(component.bvh.signedVolume > 0); assert.strictEqual(component.positions, component.bvh.positions); assert.strictEqual(component.indices, component.bvh.indices);
    }
    assert.ok(runtime.unresolvedSourceComponents.includes('concrete'));
    assert.deepEqual(runtime.components.find(c => c.componentId === 'gallery_upper').sourceEntityIds, ['gallery_upper']);
    assert.equal(runtime.components.find(c => c.componentId === 'virtual:bank_platform_N').bvh, null);
    for (const assertion of dataset.spec.assertions.filter(a => a.type === 'material_points' && a.input.scenario_water_up_levels.includes(runtime.variables.water_up_level))) {
      for (const point of assertion.input.points) assert.equal(runtime.classifyModel(dataset.geometry.coordinates.pointToModel(point)).material,
        assertion.expected.material_id, `${id}/${assertion.id}/${point}`);
    }
  }
});

test('release low-water material and ray gates use the original strict tolerances', async () => {
  const runtime = await loadCompiledMeshRuntime(dataset, 'low');
  const points = await readJson(new URL(dataset.entry.conformance.points, dataset.base)), rays = await readJson(new URL(dataset.entry.conformance.rays, dataset.base));
  const checked = points.points.filter(point => Math.abs(point.dz_terrain) >= 5);
  const mismatches = checked.filter(point => runtime.classifyModel(point.p).material !== point.material);
  assert.ok(1 - mismatches.length / checked.length >= 0.999);
  const errors = Object.fromEntries(Object.keys(rays.tolerances_m).map(material => [material, []]));
  for (const ray of rays.rays) {
    const trace = runtime.traceRayModel(ray.origin, ray.dir, ray.length);
    near(Object.values(trace.totals).reduce((a, b) => a + b), ray.length, 1e-7);
    for (const material of Object.keys(errors)) errors[material].push(Math.abs(trace.totals[material] - ray.expected_m[material]));
  }
  for (const [material, values] of Object.entries(errors)) {
    values.sort((a, b) => a - b); const at = (values.length - 1) * 0.95, lo = Math.floor(at);
    const p95 = values[lo] + (values[Math.ceil(at)] - values[lo]) * (at - lo);
    assert.ok(p95 <= rays.tolerances_m[material], `${material}: ${p95} exceeds release tolerance`);
  }
});

test('view shares BVH buffers; display toggles and transforms leave queries unchanged', () => {
  const runtime = runtimeFor([component('concrete'), component('gallery_upper', 'air', cube([2, 0, 0], [3, 1, 1]))]);
  const before = runtime.traceRayModel([-1, 0.5, 0.5], [1, 0, 0], 5), view = createCompiledGeometryView(runtime);
  for (const component of runtime.components) {
    const mesh = view.meshes.get(component.componentId);
    assert.strictEqual(mesh.geometry.attributes.position.array, component.bvh.positions);
    assert.strictEqual(mesh.geometry.index.array, component.bvh.indices);
    assert.equal(mesh.material.flatShading, true, 'engineering corners must not use averaged vertex shading');
  }
  view.setOverlays({ air: true, virtual: true }); view.group.scale.set(3, 2, 4);
  assert.deepEqual(runtime.traceRayModel([-1, 0.5, 0.5], [1, 0, 0], 5), before);
  view.dispose(); assert.equal(view.group.children.length, 0);
});
