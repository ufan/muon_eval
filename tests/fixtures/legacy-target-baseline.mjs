// Frozen pre-extraction legacy target arithmetic. Test-only.
export function legacyTargetBaseline(trace,materials,targetIds){const TARGETS=Object.fromEntries(targetIds.map(id=>[id,{}])),geometryContext={materials};const delta=Object.fromEntries(Object.keys(TARGETS).map(k=>[k,0])),rho=geometryContext.materials,targetEntry=Object.fromEntries(Object.keys(TARGETS).map(k=>[k,Infinity]));for(const q of trace.cells){if(q.t0<2)continue;const len=q.t1-q.t0;for(const id of q.targets||[]){targetEntry[id]=Math.min(targetEntry[id],q.t0);if(id==='water')delta[id]-=len*rho.water.density;else if(q.kind==='air')delta[id]+=len*rho.concrete.density;else if(q.kind==='concrete'&&id!=='dam')delta[id]-=len*rho.concrete.density}}const firstDense=trace.cells.find(q=>q.kind!=='air')?.t0??Infinity,firstConcrete=trace.cells.find(q=>q.kind==='concrete')?.t0??Infinity;return{...trace,edgeProfile:{firstDense,firstConcrete,targetEntry},targetMask:Object.fromEntries(Object.keys(TARGETS).map(k=>[k,trace.targetLengths[k]>.15])),counterfactualMwe:Object.fromEntries(Object.keys(TARGETS).map(k=>[k,Math.max(0,trace.mwe+delta[k])]))}}
export function legacyTargetSignificance(pixel,id,{flux,systematicFraction}) {
 if(!pixel.q.targetMask[id]||id==='dam')return 0;
 const energy=.2/4e-4*(Math.exp(4e-4*Math.max(0,pixel.q.counterfactualMwe[id]))-1);
 const cf=flux(pixel.dir.z,energy)*pixel.factor;
 return Math.abs(pixel.count-cf)/Math.sqrt(Math.max(1,pixel.count)+(systematicFraction*pixel.count)**2);
}
