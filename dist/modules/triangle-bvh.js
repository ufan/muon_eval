// @ts-check
// CPU geometry only. BufferGeometry and scene objects are never query inputs.
const rayBox = (origin, direction, min, max, tolerance) => {
  let near = 0, far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    if (direction[axis] === 0) { if (origin[axis] < min[axis] - tolerance || origin[axis] > max[axis] + tolerance) return false; continue; }
    let a = (min[axis] - tolerance - origin[axis]) / direction[axis], b = (max[axis] + tolerance - origin[axis]) / direction[axis];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a); far = Math.min(far, b);
    if (near > far) return false;
  }
  return true;
};

export function createTriangleBVH({ positions, indices }, { tolerance = 1e-5, pointTolerance = tolerance, leafSize = 8 } = {}) {
  if (!(positions instanceof Float32Array || positions instanceof Float64Array) || !(indices instanceof Uint32Array) || positions.length % 3 || indices.length % 3
    || !positions.every(Number.isFinite) || indices.some(i => i >= positions.length / 3) || !(tolerance > 0) || !Number.isFinite(tolerance)
    || !(pointTolerance > 0) || !Number.isFinite(pointTolerance)
    || !Number.isInteger(leafSize) || leafSize < 1) throw new Error('Invalid BVH mesh/options');
  const count = indices.length / 3, order = Uint32Array.from({ length: count }, (_, i) => i);
  if (!count) throw new Error('Empty BVH mesh');
  const vertexCount = positions.length / 3, edges = new Map(), edgeBase = indices.length + 1;
  if (!Number.isSafeInteger(vertexCount * vertexCount) || !Number.isSafeInteger(indices.length * edgeBase)) throw new Error('Mesh exceeds topology index limit');
  let signedVolume = 0;
  const anchor = Array.from(positions.subarray(0, 3));
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    if (a === b || b === c || c === a) throw new Error('Degenerate triangle indices');
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = Math.min(from, to) * vertexCount + Math.max(from, to);
      edges.set(key, (edges.get(key) || 0) + (from < to ? 1 : edgeBase));
    }
    const ax = positions[a * 3] - anchor[0], ay = positions[a * 3 + 1] - anchor[1], az = positions[a * 3 + 2] - anchor[2];
    const bx = positions[b * 3] - anchor[0], by = positions[b * 3 + 1] - anchor[1], bz = positions[b * 3 + 2] - anchor[2];
    const cx = positions[c * 3] - anchor[0], cy = positions[c * 3 + 1] - anchor[1], cz = positions[c * 3 + 2] - anchor[2];
    signedVolume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  if ([...edges.values()].some(value => value !== edgeBase + 1) || !(signedVolume > 0)) throw new Error('Physics mesh must be closed with outward, consistent winding');
  edges.clear();
  const bounds = new Float64Array(count * 6), centers = new Float64Array(count * 3), nodes = [];
  for (let triangle = 0; triangle < count; triangle++) for (let axis = 0; axis < 3; axis++) {
    const a = positions[indices[triangle * 3] * 3 + axis], b = positions[indices[triangle * 3 + 1] * 3 + axis], c = positions[indices[triangle * 3 + 2] * 3 + axis];
    bounds[triangle * 6 + axis] = Math.min(a, b, c); bounds[triangle * 6 + axis + 3] = Math.max(a, b, c);
    centers[triangle * 3 + axis] = (a + b + c) / 3;
  }
  function build(begin, end) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const cmin = [...min], cmax = [...max];
    for (let i = begin; i < end; i++) for (let axis = 0; axis < 3; axis++) {
      const t = order[i]; min[axis] = Math.min(min[axis], bounds[t * 6 + axis]); max[axis] = Math.max(max[axis], bounds[t * 6 + axis + 3]);
      cmin[axis] = Math.min(cmin[axis], centers[t * 3 + axis]); cmax[axis] = Math.max(cmax[axis], centers[t * 3 + axis]);
    }
    const id = nodes.length, node = { min, max, begin, end, left: -1, right: -1 }; nodes.push(node);
    if (end - begin > leafSize) {
      const spans = cmax.map((value, axis) => value - cmin[axis]), axis = spans.indexOf(Math.max(...spans));
      if (spans[axis] > 0) {
        order.subarray(begin, end).sort((a, b) => centers[a * 3 + axis] - centers[b * 3 + axis]);
        const middle = Math.floor((begin + end) / 2); node.left = build(begin, middle); node.right = build(middle, end);
      }
    }
    return id;
  }
  build(0, count);
  function triangleData(triangle) {
    const a = indices[triangle * 3] * 3, b = indices[triangle * 3 + 1] * 3, c = indices[triangle * 3 + 2] * 3;
    return [positions[a], positions[a + 1], positions[a + 2],
      positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2],
      positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
  }
  function hitTriangle(triangle, origin, direction) {
    const [ax, ay, az, ex, ey, ez, fx, fy, fz] = triangleData(triangle);
    const px = direction[1] * fz - direction[2] * fy, py = direction[2] * fx - direction[0] * fz, pz = direction[0] * fy - direction[1] * fx;
    const det = ex * px + ey * py + ez * pz;
    if (Math.abs(det) <= 1e-12 * Math.hypot(ex, ey, ez) * Math.hypot(fx, fy, fz)) return null;
    const tx = origin[0] - ax, ty = origin[1] - ay, tz = origin[2] - az;
    const u = (tx * px + ty * py + tz * pz) / det;
    const qx = ty * ez - tz * ey, qy = tz * ex - tx * ez, qz = tx * ey - ty * ex;
    const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / det;
    if (u < -1e-10 || v < -1e-10 || u + v > 1 + 1e-10) return null;
    const distance = (fx * qx + fy * qy + fz * qz) / det;
    return distance >= -tolerance ? { distance: Math.max(0, distance), sign: det > 0 ? -1 : 1 } : null;
  }
  function surfaceTriangle(triangle, point, surfaceTolerance) {
    const [ax, ay, az, ex, ey, ez, fx, fy, fz] = triangleData(triangle);
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const length = Math.hypot(nx, ny, nz);
    if (!length) return false;
    const dx = point[0] - ax, dy = point[1] - ay, dz = point[2] - az;
    if (Math.abs(dx * nx + dy * ny + dz * nz) > surfaceTolerance * length) return false;
    const ee = ex * ex + ey * ey + ez * ez, ff = fx * fx + fy * fy + fz * fz, ef = ex * fx + ey * fy + ez * fz;
    const de = dx * ex + dy * ey + dz * ez, df = dx * fx + dy * fy + dz * fz, det = ee * ff - ef * ef;
    if (det <= 0) return false;
    const u = (ff * de - ef * df) / det, v = (ee * df - ef * de) / det;
    return u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9;
  }
  function onSurface(point, surfaceTolerance = tolerance) {
    const pending = [0];
    while (pending.length) {
      const node = nodes[pending.pop()];
      if (point.some((value, axis) => value < node.min[axis] - surfaceTolerance || value > node.max[axis] + surfaceTolerance)) continue;
      if (node.left !== -1) { pending.push(node.left, node.right); continue; }
      for (let i = node.begin; i < node.end; i++) if (surfaceTriangle(order[i], point, surfaceTolerance)) return true;
    }
    return false;
  }
  function intersections(origin, direction) {
    const hits = [], pending = [0];
    while (pending.length) {
      const node = nodes[pending.pop()];
      if (!rayBox(origin, direction, node.min, node.max, tolerance)) continue;
      if (node.left !== -1) { pending.push(node.left, node.right); continue; }
      for (let i = node.begin; i < node.end; i++) { const hit = hitTriangle(order[i], origin, direction); if (hit) hits.push(hit); }
    }
    hits.sort((a, b) => a.distance - b.distance);
    const groups = [];
    for (const hit of hits) {
      const last = groups.at(-1);
      if (last && hit.distance - last.distance <= tolerance) { last.enter ||= hit.sign < 0; last.exit ||= hit.sign > 0; }
      else groups.push({ distance: hit.distance, enter: hit.sign < 0, exit: hit.sign > 0 });
    }
    // A shared triangle diagonal crosses once; opposing normals at one contact are tangential.
    return groups.filter(group => group.enter !== group.exit).map(group => ({ distance: group.distance, entering: group.enter }));
  }
  const pointDirection = [0.763747886534, 0.477342429084, 0.434904434527];
  function containsPoint(point) {
    const root = nodes[0];
    if (point.some((value, axis) => value < root.min[axis] - pointTolerance || value > root.max[axis] + pointTolerance)) return false;
    if (onSurface(point, pointTolerance)) return true;
    const first = intersections(point, pointDirection).find(hit => hit.distance > tolerance);
    return Boolean(first && !first.entering);
  }
  function rayIntervals(origin, direction, length) {
    const crossings = intersections(origin, direction).filter(hit => hit.distance > tolerance), intervals = [];
    let inside = Boolean(crossings[0] && !crossings[0].entering), start = 0;
    for (const crossing of crossings) {
      if (crossing.distance >= length) break;
      if (inside && crossing.distance > start + tolerance) intervals.push([start, crossing.distance]);
      inside = crossing.entering; start = crossing.distance;
    }
    if (inside && length > start + tolerance) intervals.push([start, length]);
    // Rays along a surface are zero-length contacts, not material chords.
    return intervals.filter(([a, b]) => !onSurface(origin.map((value, axis) => value + direction[axis] * (a + b) / 2)));
  }
  return { positions, indices, signedVolume, nodeCount: nodes.length, triangleCount: count, bounds: { min: nodes[0].min, max: nodes[0].max }, containsPoint, intersections, rayIntervals };
}
