// @ts-check
// Legacy target heuristics, not canonical entity ownership or physical interfaces.
import { minimumMuonEnergy, countSignificance } from './muon-response.js';

export function createLegacyTargetInterpreter({materials,targetIds}) {
  const ids=[...targetIds],known=new Set(ids);
  const waterDensity=materials.water?.density,concreteDensity=materials.concrete?.density;
  if (known.size!==ids.length || ids.some(id=>typeof id!=='string'||!id) ||
      ![waterDensity,concreteDensity].every(v=>Number.isFinite(v)&&v>=0))
    throw new Error('Invalid legacy target IDs or material densities');
  return function interpret(trace) {
    if (!Number.isFinite(trace.mwe) || trace.mwe<0 || !Array.isArray(trace.cells) ||
        ids.some(id=>!Number.isFinite(trace.targetLengths[id])||trace.targetLengths[id]<0))
      throw new Error('Invalid legacy target trace');
    const delta=Object.fromEntries(ids.map(id=>[id,0]));
    const targetEntry=Object.fromEntries(ids.map(id=>[id,Infinity]));
    for (const cell of trace.cells) {
      if (![cell.t0,cell.t1].every(Number.isFinite) || cell.t0<0 || cell.t1<cell.t0)
        throw new Error('Invalid legacy target interval');
      // Compatibility: skip the whole cell, rather than clipping it at 2 m.
      if (cell.t0<2) continue;
      const length=cell.t1-cell.t0;
      for (const id of cell.targets||[]) {
        if (!known.has(id)) throw new Error('Undeclared legacy target');
        targetEntry[id]=Math.min(targetEntry[id],cell.t0);
        if (id==='water') delta[id]-=length*waterDensity;
        else if (cell.kind==='air') delta[id]+=length*concreteDensity;
        else if (cell.kind==='concrete' && id!=='dam') delta[id]-=length*concreteDensity;
      }
    }
    const firstDense=trace.cells.find(cell=>cell.kind!=='air')?.t0??Infinity;
    const firstConcrete=trace.cells.find(cell=>cell.kind==='concrete')?.t0??Infinity;
    return {...trace,edgeProfile:{firstDense,firstConcrete,targetEntry},
      targetMask:Object.fromEntries(ids.map(id=>[id,trace.targetLengths[id]>.15])),
      counterfactualMwe:Object.fromEntries(ids.map(id=>[id,Math.max(0,trace.mwe+delta[id])]))};
  };
}

export function evaluateLegacyTargetSignificance(pixel,id,{flux,systematicFraction}) {
  if (!pixel.q.targetMask[id] || id==='dam') return 0;
  const counterfactual=flux(pixel.dir.z,minimumMuonEnergy(pixel.q.counterfactualMwe[id]))*pixel.factor;
  return countSignificance(pixel.count,counterfactual,systematicFraction);
}
