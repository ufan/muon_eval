// @ts-check
// Native analytic qualification backend. Uses published terrain arrays, not mesh/BVH.
// It is deliberately separate from the production UI until scenario/mesh validation lands.
import { sampleTerrainModel } from './dataset-loader.js';

const between = (value, range) => value >= range[0] && value <= range[1];
function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    if (((y1 > y) !== (y2 > y)) && x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1) inside = !inside;
  }
  return inside;
}
function interpolate(points, value) {
  if (value <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, z1] = points[i], [b, z2] = points[i + 1];
    if (value <= b && b > a) return z1 + (value - a) * (z2 - z1) / (b - a);
  }
  return points.at(-1)[1];
}

export function containsSourceGeometry(geometry, point, crestElevation) {
  const [x, y, z] = point, g = geometry;
  if (g.type === 'box') return between(x, g.x) && between(y, g.y) && between(z, g.z);
  if (g.type === 'extrusion_x') return between(x, g.x_range) && inPolygon(y, z, g.profile_yz);
  if (g.type === 'extrusion_z') return between(z, g.z_range) && inPolygon(x, y, g.plan_xy);
  if (g.type === 'sweep_xz' || g.type === 'sweep_y') {
    const along = g.type === 'sweep_xz' ? x : y, across = g.type === 'sweep_xz' ? y - g.y : x - g.x;
    const path = g.path_xz || g.path_yz, section = g.section;
    if (Math.abs(across) > section.width / 2) return false;
    for (let i = 0; i < path.length - 1; i++) {
      const [a, za] = path[i], [b, zb] = path[i + 1];
      if (Math.abs(b - a) < 1e-6 || !between(along, [Math.min(a, b), Math.max(a, b)])) continue;
      const floor = za + (along - a) / (b - a) * (zb - za);
      const roof = floor + section.wall_height + (section.height - section.wall_height)
        * Math.sqrt(Math.max(0, 1 - (2 * across / section.width) ** 2));
      if (z >= floor && z <= roof) return true;
    }
    return false;
  }
  if (g.type === 'chute') {
    if (!between(x, g.x_range) || !between(y, [g.floor_yz[0][0], g.floor_yz.at(-1)[0]])) return false;
    const top = g.top_boundary.segments.find(segment => y >= segment.y_range[0] && y < segment.y_range[1])?.z_top ?? crestElevation;
    return z > interpolate(g.floor_yz, y) && z <= top;
  }
  throw new Error(`Unsupported qualification geometry ${g.type}`);
}

function xBounds(g) {
  if (g.x_range) return g.x_range;
  if (g.type === 'box') return g.x;
  if (g.type === 'extrusion_z') return [Math.min(...g.plan_xy.map(p => p[0])), Math.max(...g.plan_xy.map(p => p[0]))];
  if (g.type === 'sweep_y') return [g.x - g.section.width / 2, g.x + g.section.width / 2];
  return [Math.min(...g.path_xz.map(p => p[0])), Math.max(...g.path_xz.map(p => p[0]))];
}

export function createV07QualificationKernel({ geometry, terrainNear, terrainFar, cellSize = 5 }) {
  const { source, coordinates, clipRange } = geometry;
  const linear = source.frames.model_frame.transform_from_doc.matrix_3x4.map(row => row.slice(0, 3));
  if (JSON.stringify(linear) !== '[[0,1,0],[1,0,0],[0,0,1]]') throw new Error('Qualification terrain backend only supports the native source-axis mapping');
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new Error('Invalid spatial cell size');
  const crest = geometry.resolveNumber({ parameter_ref: 'crest_elev' });
  const foundation = source.foundation_surface.points, index = new Map();
  const physical = [...geometry.entities.values()].filter(entity => entity.realization === 'solid');
  for (const entity of physical) {
    const [a, b] = xBounds(entity.geometry);
    for (let i = Math.floor(a / cellSize); i <= Math.floor(b / cellSize); i++) {
      if (!index.has(i)) index.set(i, []);
      index.get(i).push(entity);
    }
  }
  const contains = (entity, point) => containsSourceGeometry(entity.geometry, point, crest);
  const terrainElevation = (x, y) => {
    const p = coordinates.pointToModel([x, y, 0]);
    let height = sampleTerrainModel(terrainNear, p[0], p[1]);
    if (height === null && terrainFar) {
      const h = terrainFar.header;
      const a = Math.max(h.origin[0], Math.min(h.origin[0] + (h.shape[0] - 1) * h.spacing[0], p[0]));
      const b = Math.max(h.origin[1], Math.min(h.origin[1] + (h.shape[1] - 1) * h.spacing[1], p[1]));
      height = sampleTerrainModel(terrainFar, a, b);
    }
    if (height === null) throw new Error('Qualification requires terrain coverage');
    return coordinates.pointToSource([p[0], p[1], height])[2];
  };
  const reservoirMasks = new Map();
  const connectedReservoir = (water, x, y, level) => {
    const key = `${water.id}:${level}`;
    const h = terrainNear.header, [nx, ny] = h.shape;
    if (!reservoirMasks.has(key)) {
      const wet = new Uint8Array(nx * ny), connected = new Uint8Array(nx * ny);
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const point = coordinates.pointToSource([h.origin[0] + i * h.spacing[0], h.origin[1] + j * h.spacing[1], terrainNear.values[i * ny + j]]);
        wet[i * ny + j] = point[1] < water.y_range[1] && point[2] < level ? 1 : 0;
      }
      const seed = coordinates.pointToModel([...water.connectivity.seed_xy, 0]);
      const i = Math.round((seed[0] - h.origin[0]) / h.spacing[0]), j = Math.round((seed[1] - h.origin[1]) / h.spacing[1]);
      const queue = new Int32Array(nx * ny); let head = 0, tail = 0;
      if (i >= 0 && j >= 0 && i < nx && j < ny && wet[i * ny + j]) { queue[tail++] = i * ny + j; connected[i * ny + j] = 1; }
      while (head < tail) {
        const at = queue[head++], a = Math.floor(at / ny), b = at % ny;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = a + di, nj = b + dj, next = ni * ny + nj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !wet[next] || connected[next]) continue;
          connected[next] = 1; queue[tail++] = next;
        }
      }
      // Qualification is synchronous and bounded; retain only a few water-level masks.
      if (reservoirMasks.size >= 4) reservoirMasks.delete(reservoirMasks.keys().next().value);
      reservoirMasks.set(key, connected);
    }
    // Match the native reader's sampling immediately upstream of the contact plane.
    const sourceSpacing = Math.abs(coordinates.directionToSource([h.spacing[0], 0, 0])[1]);
    const model = coordinates.pointToModel([x, Math.min(y, -sourceSpacing), 0]);
    const fx = (model[0] - h.origin[0]) / h.spacing[0], fy = (model[1] - h.origin[1]) / h.spacing[1];
    return fx >= 0 && fy >= 0 && fx <= nx - 1 && fy <= ny - 1 && reservoirMasks.get(key)[Math.round(fx) * ny + Math.round(fy)] === 1;
  };
  const classifySource = (point, scenario) => {
    const [x, y, z] = point;
    if (!point.every(Number.isFinite)) throw new Error('Invalid material query point');
    const bounds = source.terrain.model_box;
    if (!between(x, bounds.x) || !between(y, bounds.y) || !between(z, bounds.z)) return { material: 'air', entityIds: [] };
    const entities = (index.get(Math.floor(x / cellSize)) || []).filter(entity => contains(entity, point));
    const clipped = between(x, clipRange) && z >= interpolate(foundation, x);
    const steel = entities.filter(entity => entity.kind === 'solid' && entity.material_id === 'steel');
    const solids = clipped ? entities.filter(entity => entity.kind === 'solid' && entity.material_id === 'concrete') : [];
    const voids = clipped ? entities.filter(entity => entity.kind === 'void') : [];
    let material = 'air';
    if (steel.length) material = 'steel';
    else if (voids.length) {
      if (voids.some(entity => {
        const fill = entity.fill;
        if (fill.kind === 'air') return false;
        const level = scenario.variables[fill.level.scenario_variable];
        return (fill.activation?.minimum_level === undefined || level >= fill.activation.minimum_level) && z <= level;
      })) material = 'water';
    } else if (solids.length) material = 'concrete';
    else if (z < terrainElevation(x, y)) material = 'rock';
    else for (const water of geometry.waterBodies.values()) {
      const level = scenario.variables[water.level.scenario_variable];
      // Native reference semantics: upstream seed connectivity; downstream interval fill.
      const wet = water.y_range[1] <= 0
        ? y >= water.y_range[0] && y < water.y_range[1] && connectedReservoir(water, x, y, level)
        : y > water.y_range[0] && y <= water.y_range[1];
      if (wet && z <= level) { material = water.material_id; break; }
    }
    return { material, entityIds: [...solids, ...voids, ...steel].map(entity => entity.id) };
  };
  const classifyModel = (point, scenario = geometry.resolveScenario()) => classifySource(coordinates.pointToSource(point), scenario);
  const traceRayModel = (origin, direction, length, step = 0.05, scenario = geometry.resolveScenario()) => {
    if (!(length >= 0) || !(step > 0) || !Number.isFinite(length) || !Number.isFinite(step)
      || Math.abs(Math.hypot(...direction) - 1) > 1e-5) throw new Error('Invalid qualification ray');
    const sourceOrigin = coordinates.pointToSource(origin), sourceDirection = coordinates.directionToSource(direction);
    const totals = Object.fromEntries([...geometry.materials.keys()].map(material => [material, 0]));
    for (let start = 0; start < length; start += step) {
      const span = Math.min(step, length - start), distance = start + span / 2;
      const point = sourceOrigin.map((value, axis) => value + sourceDirection[axis] * distance);
      const material = classifySource(point, scenario).material;
      totals[material] += span;
    }
    return totals;
  };
  return { classifyModel, traceRayModel, terrainElevation };
}
