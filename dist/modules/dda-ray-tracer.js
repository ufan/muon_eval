// Pure legacy DDA traversal. Coordinates/bounds/densities belong to the caller.
// Preserves the legacy sampling, merge and guard policies; not exact surface tracing.
const axes = ['x', 'y', 'z'];
const pointAt = (origin, direction, t) => ({
  x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t
});

function rayBox(origin, direction, min, max, maxDistanceM) {
  let lo = 0, hi = maxDistanceM;
  for (const axis of axes) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      continue;
    }
    let a = (min[axis] - origin[axis]) / direction[axis];
    let b = (max[axis] - origin[axis]) / direction[axis];
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a); hi = Math.min(hi, b);
    if (lo > hi) return null;
  }
  return [lo, hi];
}

export function createDdaRayTracer({bounds, densities, targetIds, classifyPoint, maxDistanceM}) {
  if (typeof classifyPoint !== 'function' || !Number.isFinite(maxDistanceM) || maxDistanceM <= 0)
    throw new Error('DDA requires a classifier and positive finite distance');
  const min = {...bounds?.min}, max = {...bounds?.max};
  if (axes.some(k => !Number.isFinite(min[k]) || !Number.isFinite(max[k]) || min[k] >= max[k]))
    throw new Error('DDA requires finite ordered bounds');
  const rho = {...densities}, materials = Object.keys(rho), targets = [...targetIds];
  if (!materials.length || materials.some(k => !Number.isFinite(rho[k]) || rho[k] < 0) ||
      new Set(targets).size !== targets.length || targets.some(k => typeof k !== 'string' || !k))
    throw new Error('Invalid DDA material densities or target IDs');
  return function traceRay(origin, direction, {cellM, refineM, environment} = {}) {
    if (!Number.isFinite(cellM) || cellM <= 0 || !Number.isFinite(refineM) || refineM <= 0 ||
        axes.some(k => !Number.isFinite(origin?.[k]) || !Number.isFinite(direction?.[k])) ||
        Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) > 1e-9)
      throw new Error('DDA requires finite points, unit directions and positive sampling lengths');
    const totals = Object.fromEntries(materials.map(k => [k, 0]));
    const targetLengths = Object.fromEntries(targets.map(k => [k, 0])), cells = [];
    const hit = rayBox(origin, direction, min, max, maxDistanceM);
    if (!hit) return {totals, targetLengths, cells, mwe: 0};
    let t = hit[0] + 1e-6, end = hit[1], p = pointAt(origin, direction, t);
    let ix = Math.floor((p.x-min.x)/cellM), iy = Math.floor((p.y-min.y)/cellM), iz = Math.floor((p.z-min.z)/cellM);
    const step = {x: Math.sign(direction.x), y: Math.sign(direction.y), z: Math.sign(direction.z)};
    const delta = {}, next = {};
    const at = u => {
      const q = pointAt(origin, direction, u), result = classifyPoint(q.x, q.y, q.z, environment);
      if (!Object.hasOwn(totals, result.kind) || [...result.targets].some(id => !Object.hasOwn(targetLengths, id)))
        throw new Error('Classifier returned an undeclared material or target');
      return result;
    };
    const signature = q => q.kind + '|' + [...q.targets].sort().join(',');
    const accumulate = (a,b,q) => {
      const length = b-a; totals[q.kind] += length;
      for (const id of q.targets) targetLengths[id] += length;
      const last = cells.at(-1);
      if (last && last.ix===ix && last.iy===iy && last.iz===iz && last.kind===q.kind && Math.abs(last.t1-a)<1e-7) last.t1=b;
      else cells.push({ix,iy,iz,t0:a,t1:b,kind:q.kind,targets:[...q.targets]});
    };
    const split = (a,b,depth=0) => {
      const span=b-a, m=(a+b)/2, q1=at(a+span*.125), q2=at(m), q3=at(b-span*.125);
      if (span<=refineM || depth>=8) return accumulate(a,b,q2);
      if (signature(q1)===signature(q2) && signature(q2)===signature(q3)) return accumulate(a,b,q2);
      split(a,m,depth+1); split(m,b,depth+1);
    };
    for (const k of axes) {
      delta[k]=direction[k]===0 ? Infinity : Math.abs(cellM/direction[k]);
      const boundary=min[k]+(step[k]>0 ? Math.floor((p[k]-min[k])/cellM)+1 : Math.floor((p[k]-min[k])/cellM))*cellM;
      next[k]=direction[k]===0 ? Infinity : t+(boundary-p[k])/direction[k];
    }
    let guard=0;
    while (t<end-1e-7 && guard++<10000) {
      const tn=Math.min(end,next.x,next.y,next.z); split(t,tn); t=tn;
      for (const k of axes) if (Math.abs(next[k]-tn)<1e-7) {
        if (k==='x') ix+=step.x; if (k==='y') iy+=step.y; if (k==='z') iz+=step.z; next[k]+=delta[k];
      }
    }
    // Preserve declared summation order; zero-density materials do not add a term.
    let mwe=0; for (const material of materials) if (rho[material]!==0) mwe+=totals[material]*rho[material];
    return {totals,targetLengths,cells,mwe};
  };
}
