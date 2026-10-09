// Extra A4 reference shape: 16-sided cylindrical prism, not a real dataset.
import { component } from './mesh-fixtures.mjs';
import { createTriangleBVH } from '../dist/modules/triangle-bvh.js';
import { createPatternFixture } from './projection-pattern-fixtures.mjs';

export function smoothReferenceFixture() {
  const sides = 16, positions = [], indices = [];
  for (const z of [-2, 2]) for (let i = 0; i < sides; i++) {
    positions.push(4 + Math.cos(i * 2 * Math.PI / sides), Math.sin(i * 2 * Math.PI / sides), z);
  }
  positions.push(4, 0, -2, 4, 0, 2);
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    indices.push(i, next, next + sides, i, next + sides, i + sides,
      2 * sides, next, i, 2 * sides + 1, i + sides, next + sides);
  }
  const mesh = component('smooth-prism', 'rock', { positions: new Float32Array(positions), indices: new Uint32Array(indices) });
  const bvh = createTriangleBVH(mesh, { tolerance: 1e-8 });
  return { id: 'smooth-prism', terrainDomain: null, views: createPatternFixture('slab').views,
    runtime: { components: [mesh], classifyModel: point => ({ material: bvh.containsPoint(point) ? 'rock' : 'air' }) } };
}
