// Synthetic, metre/model-frame fixtures only. Analytic references are test
// oracles, not a substitute production ray tracer or contour implementation.
import { cube, component } from './mesh-fixtures.mjs';
import { createCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';

export const FIXTURE_TOLERANCE_M = 1e-6;
export const fixtureDensities = { air: 0, concrete: 2.4, rock: 2.65 };
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const boxPlanes = (min, max) => min.flatMap((value, i) => {
  const n = [0, 0, 0]; n[i] = 1;
  return [[n, max[i]], [n.map(v => -v), -value]];
});

// Intersection of n·p <= offset half-spaces with a finite unit ray.
// Surface-parallel contacts have no positive-volume chord.
function planeChord(planes, origin, direction, length) {
  let enter = 0, exit = length;
  for (const [normal, offset] of planes) {
    const rate = dot(normal, direction), remaining = offset - dot(normal, origin);
    if (Math.abs(rate) < 1e-14) {
      if (remaining <= 0) return [];
    } else if (rate > 0) exit = Math.min(exit, remaining / rate);
    else enter = Math.max(enter, remaining / rate);
  }
  return exit > enter ? [[enter, exit]] : [];
}
const span = intervals => intervals.reduce((sum, [a, b]) => sum + b - a, 0);
function shellMesh(outer, inner) {
  const offset = outer.positions.length / 3, reverse = [];
  for (let i = 0; i < inner.indices.length; i += 3) reverse.push(inner.indices[i] + offset, inner.indices[i + 2] + offset, inner.indices[i + 1] + offset);
  return { positions: new Float32Array([...outer.positions, ...inner.positions]), indices: new Uint32Array([...outer.indices, ...reverse]) };
}
function deform(mesh, transform) {
  const positions = mesh.positions.slice();
  for (let i = 0; i < positions.length; i += 3) positions.set(transform(...positions.subarray(i, i + 3)), i);
  return { positions, indices: mesh.indices.slice() };
}

export function createPatternFixture(id) {
  const regions = [], components = [], holes = [];
  function add(name, material, min, max, mesh = cube(min, max), planes = boxPlanes(min, max)) {
    components.push(component(name, material, mesh)); regions.push({ material, planes });
  }
  const extent = { min: [2, -4, -4], max: [6, 4, 4] };
  if (id === 'slab') add('slab', 'concrete', extent.min, extent.max);
  else if (id === 'wedge') {
    // Near x=2, far x=6+y/4, clipped to |y|,|z|<=4.
    const mesh = deform(cube(extent.min, extent.max), (x, y, z) => [x === 6 ? x + y / 4 : x, y, z]);
    const planes = boxPlanes(extent.min, extent.max); planes[0] = [[1, -0.25, 0], 6];
    add('wedge', 'concrete', extent.min, extent.max, mesh, planes);
  } else if (id === 'cavity') {
    const innerMin = [3, -1, -1], innerMax = [5, 1, 1];
    add('shell', 'concrete', extent.min, extent.max, shellMesh(cube(extent.min, extent.max), cube(innerMin, innerMax)));
    holes.push(boxPlanes(innerMin, innerMax));
  } else if (id === 'opening') {
    // Through-opening: |y|<1, across the full z extent.
    add('left', 'concrete', [2, -4, -4], [6, -1, 4]);
    add('right', 'concrete', [2, 1, -4], [6, 4, 4]);
  } else if (id === 'material-junction') {
    add('concrete', 'concrete', [2, -4, -4], [4, 4, 4]);
    add('rock', 'rock', [4, -4, -4], [6, 4, 4]);
  } else if (id === 'terrain') {
    // Finite terrain patch: top z=1+x/4, bottom z=-4.
    const min = [2, -4, -4], max = [10, 4, 4];
    const mesh = deform(cube(min, max), (x, y, z) => [x, y, z === 4 ? 1 + x / 4 : z]);
    const planes = boxPlanes(min, max); planes[4] = [[-0.25, 0, 1], 1];
    add('terrain', 'rock', min, max, mesh, planes);
  } else throw new Error(`Unknown projection fixture ${id}`);
  const geometry = { tolerances: { ray: { intersection_m: 1e-8 }, analytic: { point_classification_m: 1e-8 } },
    materials: new Map(Object.entries(fixtureDensities).map(([material, density]) => [material, { density }])),
    entities: new Map(), waterBodies: new Map(), classification: { material_precedence: ['concrete', 'rock', 'air'] } };
  const runtime = createCompiledMeshRuntime({ version: '0.1.0', frame: 'model_frame', scenarioId: 'low', components },
    { identity: { dataset_id: `synthetic-${id}`, release: 'fixture@1' }, geometry, variables: {} });
  function reference(origin, direction, length) {
    const totals = { air: 0, concrete: 0, rock: 0 };
    for (const region of regions) totals[region.material] += span(planeChord(region.planes, origin, direction, length));
    // In this fixture every hole is strictly inside the outer concrete box.
    for (const hole of holes) totals.concrete -= span(planeChord(hole, origin, direction, length));
    totals.air = length - totals.concrete - totals.rock;
    return { totals, mwe: totals.concrete * fixtureDensities.concrete + totals.rock * fixtureDensities.rock };
  }
  return { id, runtime, reference, units: 'm', frame: 'model_frame',
    terrainDomain: id === 'terrain' ? { x: [2, 10], y: [-4, 4], bottomZ: -4, physicalTop: 'z=1+x/4',
      limitation: 'Sides and bottom are domain truncations, not physical rock-air envelopes.' } : null,
    views: [
      { name: 'external', origin: [0, 0, 0], azimuthDeg: 0, elevationDeg: 0 },
      { name: 'internal', origin: [4, 0, 0], azimuthDeg: 0, elevationDeg: 0 },
      { name: 'off-axis', origin: [0, -0.5, 0.25], azimuthDeg: 17, elevationDeg: 11 }
    ] };
}

export const patternFixtureIds = ['slab', 'wedge', 'cavity', 'opening', 'material-junction', 'terrain'];
