import { sampleTerrainModel } from './dataset-loader.js';

const EPS = 1e-6;
const inRange = (value, range) => value >= Math.min(...range) - EPS && value <= Math.max(...range) + EPS;
const isPhysical = entity => entity.realization !== 'virtual';
const rangesOf = entity => entity.x_ranges || [entity.x_range];

function pointInPolygon(a, b, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ai, bi] = polygon[i], [aj, bj] = polygon[j];
    if (((bi > b) !== (bj > b)) && a < (aj - ai) * (b - bi) / (bj - bi) + ai) inside = !inside;
  }
  return inside;
}

function interpolate(path, coordinate) {
  for (let i = 0; i < path.length - 1; i++) {
    const [a, za] = path[i], [b, zb] = path[i + 1];
    if (inRange(coordinate, [a, b]) && Math.abs(b - a) > EPS) return za + (zb - za) * (coordinate - a) / (b - a);
  }
  return null;
}

function voidTopAt(entity, y) {
  return entity.void_top?.find(segment => inRange(y, segment.y))?.z_top ?? 306;
}

export function entityContains(entity, x, y, z) {
  if (!isPhysical(entity)) return false;
  if (entity.type === 'extrusion_x') return rangesOf(entity).some(range => inRange(x, range)) && pointInPolygon(y, z, entity.profile_yz);
  if (entity.type === 'extrusion_z') return inRange(z, entity.z) && pointInPolygon(x, y, entity.plan_xy);
  if (entity.type === 'box') return (entity.boxes || [entity]).some(box => box.x && box.y && box.z && inRange(x, box.x) && inRange(y, box.y) && inRange(z, box.z));
  if (entity.type === 'sweep_xz') {
    const floor = interpolate(entity.path_xz, x);
    return floor !== null && Math.abs(y - entity.y) <= entity.width / 2 + EPS && z >= floor - EPS && z <= floor + entity.height + EPS;
  }
  if (entity.type === 'sweep_y') {
    const floor = interpolate(entity.path_yz, y);
    return floor !== null && Math.abs(x - entity.x) <= entity.width / 2 + EPS && z >= floor - EPS && z <= floor + entity.height + EPS;
  }
  if (entity.type === 'chute' && entity.x_ranges.some(range => inRange(x, range))) {
    const floor = interpolate(entity.floor_yz, y);
    return floor !== null && z >= floor - EPS && z <= voidTopAt(entity, y) + EPS;
  }
  return false;
}

function entityXRanges(entity) {
  if (entity.x_ranges || entity.x_range) return rangesOf(entity);
  if (entity.type === 'extrusion_z') return [[Math.min(...entity.plan_xy.map(point => point[0])), Math.max(...entity.plan_xy.map(point => point[0]))]];
  if (entity.type === 'sweep_y') return [[entity.x - entity.width / 2, entity.x + entity.width / 2]];
  if (entity.type === 'box') return (entity.boxes || [entity]).filter(box => box.x).map(box => box.x);
  if (entity.path_xz) return [[Math.min(...entity.path_xz.map(point => point[0])), Math.max(...entity.path_xz.map(point => point[0]))]];
  return [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]];
}

function buildIndex(spec, cellSize) {
  const index = { solids: new Map(), voids: new Map() };
  for (const collection of ['solids', 'voids']) for (const entity of spec[collection]) {
    if (!isPhysical(entity)) continue;
    for (const range of entityXRanges(entity)) {
      if (!Number.isFinite(range[0]) || !Number.isFinite(range[1])) continue;
      for (let cell = Math.floor(range[0] / cellSize); cell <= Math.floor(range[1] / cellSize); cell++) {
        if (!index[collection].has(cell)) index[collection].set(cell, []);
        index[collection].get(cell).push(entity);
      }
    }
  }
  return index;
}

function voidFillAt(spec, entity, z, upstreamLevel) {
  if (!entity.fill || entity.fill === 'air' || entity.fill.type !== 'water_up_to_level') return 'air';
  const level = entity.fill.level_param ? spec.parameters[entity.fill.level_param]?.value : upstreamLevel;
  return (entity.fill.min_level == null || upstreamLevel >= entity.fill.min_level) && z <= level + EPS ? 'water' : 'air';
}

function targetsFor(solids, voids, material) {
  const targets = new Set();
  for (const entity of voids) {
    const cls = entity.semantics?.class;
    if (cls === 'elevator_shaft') targets.add('elevator');
    if (['gallery', 'link_gallery', 'observation_room', 'access_adit'].includes(cls)) targets.add('gallery');
    if (entity.semantics?.system === 'flood_release') targets.add('spillway');
  }
  for (const entity of solids) {
    if (entity.semantics?.system === 'flood_release') targets.add('spillway');
    if (['outlet_structure', 'bank_platform'].includes(entity.semantics?.class)) targets.add('platform');
  }
  if (material === 'water') targets.add('water');
  if (material === 'concrete' || material === 'steel') targets.add('dam');
  return targets;
}

export function createGeometryKernel({ spec, terrainNear, terrainFar = null, upstreamLevel = spec.parameters.water_up_level.value, cellSize = 5 }) {
  const index = buildIndex(spec, cellSize);
  const foundation = [...new Map(spec.foundation_surface.points.map(([x, z]) => [x, Math.min(...spec.foundation_surface.points.filter(point => point[0] === x).map(point => point[1]))])).entries()].sort((a, b) => a[0] - b[0]);
  const waterRegions = Object.fromEntries(spec.water.filter(item => item.type === 'region').map(item => [item.id, item]));
  const entitiesAt = (collection, x) => index[collection].get(Math.floor(x / cellSize)) || [];
  const terrainAtDoc = (x, y) => {
    const nearZ = sampleTerrainModel(terrainNear, y, x);
    const source = nearZ === null && terrainFar ? terrainFar : terrainNear;
    const modelZ = nearZ ?? (terrainFar ? sampleTerrainModel(terrainFar, y, x) : null);
    return modelZ === null ? null : modelZ + source.header.z_offset_applied;
  };
  const foundationAt = x => {
    if (x <= foundation[0][0]) return foundation[0][1];
    if (x >= foundation.at(-1)[0]) return foundation.at(-1)[1];
    for (let i = 0; i < foundation.length - 1; i++) {
      const [a, za] = foundation[i], [b, zb] = foundation[i + 1];
      if (x >= a && x <= b) return za + (zb - za) * (x - a) / (b - a);
    }
    return Number.POSITIVE_INFINITY;
  };
  const classifyDoc = (x, y, z, level = upstreamLevel) => {
    const aboveFoundation = z >= foundationAt(x) - EPS;
    const solids = aboveFoundation ? entitiesAt('solids', x).filter(entity => entityContains(entity, x, y, z)) : [];
    const voids = entitiesAt('voids', x).filter(entity => entityContains(entity, x, y, z));
    let material;
    if (solids.some(entity => entity.material === 'steel')) material = 'steel';
    else if (solids.length && !voids.length) material = 'concrete';
    else if (voids.length) material = voids.some(entity => voidFillAt(spec, entity, z, level) === 'water') ? 'water' : 'air';
    else {
      const terrain = terrainAtDoc(x, y);
      if (terrain !== null && z < terrain - EPS) material = 'rock';
      else if (waterRegions.reservoir && inRange(y, waterRegions.reservoir.y_range) && z <= level + EPS) material = 'water';
      else if (waterRegions.tailwater && inRange(y, waterRegions.tailwater.y_range) && z <= spec.parameters.water_tail_level.value + EPS) material = 'water';
      else material = 'air';
    }
    return { material, targets: targetsFor(solids, voids, material) };
  };
  const classifyModel = (X, Y, Z, level = upstreamLevel) => classifyDoc(Y, X, Z + terrainNear.header.z_offset_applied, level);
  const traceRayModel = (origin, direction, length, step = 0.05, level = upstreamLevel) => {
    const totals = { concrete: 0, water: 0, rock: 0, steel: 0, air: 0 };
    const count = Math.ceil(length / step);
    for (let i = 0; i < count; i++) {
      const start = i * step, segment = Math.min(step, length - start), distance = start + segment / 2;
      const material = classifyModel(
        origin[0] + direction[0] * distance,
        origin[1] + direction[1] * distance,
        origin[2] + direction[2] * distance,
        level
      ).material;
      totals[material] += segment;
    }
    return totals;
  };
  return { classifyDoc, classifyModel, traceRayModel, terrainAtDoc };
}

