// Shared BVH/math checks. Sampled evidence, not whole-patch physical proof.
import { createTriangleBVH } from '../dist/modules/triangle-bvh.js';
export function checkInterfaceRayConsistency(mesh,runtime,rays,{toleranceM}={}) {
  if(!Number.isFinite(toleranceM)||toleranceM<=0||!Array.isArray(rays)||!rays.length) throw new Error('Explicit ray tolerance and nonempty reference set required');
  const rayTolerance=runtime.projectionGeometry.tolerances.ray.intersection_m;
  const bvh=createTriangleBVH(mesh,{tolerance:rayTolerance,pointTolerance:runtime.projectionGeometry.tolerances.analytic.point_classification_m});
  const results=rays.map(({origin,direction,length,label})=>{
    const trace=runtime.traceRayModel(origin,direction,length), expected=[];
    for(const s of trace.segments) if(s.material!=='air') {
      const last=expected.at(-1);
      if(last&&last[1]===s.t0) last[1]=s.t1;else expected.push([s.t0,s.t1]);
    }
    const actual=bvh.rayIntervals(origin,direction,length);
    const total=intervals=>intervals.reduce((sum,[a,b])=>sum+b-a,0);
    const lengthErrorM=Math.abs(total(expected)-total(actual));
    const endpointErrorM=expected.length===actual.length?Math.max(0,...expected.flatMap((p,i)=>p.map((x,j)=>Math.abs(x-actual[i][j])))):null;
    return {label,origin:[...origin],direction:[...direction],lengthM:length,
      expectedIntervals:expected,derivedIntervals:actual,lengthErrorM,endpointErrorM,
      passed:endpointErrorM!==null&&endpointErrorM<=toleranceM&&lengthErrorM<=toleranceM};
  });
  return {kind:'sampled-global-air-boundary-ray-consistency',toleranceM,rayToleranceM:rayTolerance,
    rayCount:results.length,passed:results.every(r=>r.passed),failedRays:results.filter(r=>!r.passed),
    maximumLengthErrorM:Math.max(...results.map(r=>r.lengthErrorM)),
    maximumEndpointErrorM:Math.max(0,...results.filter(r=>r.endpointErrorM!==null).map(r=>r.endpointErrorM)),
    limitations:['Sampled total dense occupancy only; not per-material paths, exhaustive topology or physical-domain qualification.',
      'Boundary-coincident/tangent rays retain the original scientific core semantics; disagreement is reported, not discarded.'],results};
}
