import { integratedSurfaceFlux as calculateSurfaceFlux, minimumMuonEnergy } from './muon-response.js';
import { createProjectionPass } from './detector-projection.js';
import { createLegacyTargetInterpreter, evaluateLegacyTargetSignificance } from './legacy-target-interpretation.js';
import { adaptLegacyPatternResult } from './legacy-pattern-adapter.js';
import { directionDoc, directionFromSlopes, degreesToRadians as degToRad } from './detector-pose.js';

export const MAIN_TRACE_SETTINGS=Object.freeze({mainCell:5,refine:.5,previewRefine:1.5,previewN:25,finalN:65,debounceMs:160});

// A service owns its caches; every session owns a detached input/environment snapshot.
export function createMainAssessment({geometry,trace=MAIN_TRACE_SETTINGS}) {
 const fluxCache=new Map(),nativeBinCache=new Map(),TRACE={...trace};
 function createSession(input){
  const {station:c,device:DEVICE,response:RESPONSE,environment}=structuredClone(input);
  const geometryContext=geometry.bindEnvironment(environment),origin=geometryContext.modelPointToDoc(c);
  const flux=(z,e)=>calculateSurfaceFlux(z,e,RESPONSE.angularModel,fluxCache);
  const direction=(sx,sy)=>directionFromSlopes(c,sx,sy,geometryContext);
  const traceRay=(dir,cell=TRACE.mainCell,refine=TRACE.refine)=>geometryContext.traceDoc(origin,dir,{cellM:cell,refineM:refine});
  const interpretTargets=createLegacyTargetInterpreter({materials:geometryContext.materials,targetIds:geometryContext.targetIds});
  function cloud(){const n=17,reference=flux(1,1),samples=[];let sumThrough=0,sumOpen=0;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){const ux=(ix-(n-1)/2)/((n-1)/2),uy=(iy-(n-1)/2)/((n-1)/2),sx=ux*DEVICE.maxSlopeX*.94,sy=uy*DEVICE.maxSlopeY*.94,acceptance=Math.max(0,1-Math.abs(sx)/DEVICE.maxSlopeX)*Math.max(0,1-Math.abs(sy)/DEVICE.maxSlopeY),dirDoc=direction(sx,sy),q=traceRay(dirDoc),open=flux(dirDoc.z,1),through=flux(dirDoc.z,minimumMuonEnergy(q.mwe)),transmission=open>0?through/open:0,contribution=acceptance*through/reference;sumThrough+=acceptance*through;sumOpen+=acceptance*open;samples.push({dirDoc,transmission,contribution})}return{n,samples,sumThrough,sumOpen};}
  function quickMetrics(){const samples=[],n=9;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){const ux=(ix-(n-1)/2)/((n-1)/2),uy=(iy-(n-1)/2)/((n-1)/2),sx=ux*DEVICE.maxSlopeX*.94,sy=uy*DEVICE.maxSlopeY*.94,weight=Math.max(0,1-Math.abs(sx)/DEVICE.maxSlopeX)*Math.max(0,1-Math.abs(sy)/DEVICE.maxSlopeY);samples.push({trace:traceRay(direction(sx,sy)),weight,sx,sy});}
   const center=samples[40].trace,values=samples.map(r=>{const d=direction(r.sx,r.sy);return{...r,open:flux(d.z,1),through:flux(d.z,minimumMuonEnergy(r.trace.mwe))};}),openSum=values.reduce((s,r)=>s+r.weight*r.open,0),throughSum=values.reduce((s,r)=>s+r.weight*r.through,0),weightedTransmission=openSum>0?throughSum/openSum:0,paths=samples.filter(r=>r.weight>.05).map(r=>r.trace.totals.concrete),el=Math.max(0,degToRad(c.el)),zenithAcceptance=Math.max(.05,Math.sin(el))**1.7,count=Math.round(12000*zenithAcceptance*weightedTransmission);
   return{center,count,weightedTransmission,paths,dirDoc:directionDoc(c,geometryContext)};
  }
  function projection(quality){const n=quality==='preview'?TRACE.previewN:TRACE.finalN,refine=quality==='preview'?TRACE.previewRefine:TRACE.refine,traceSettings=geometryContext.traceSettings(origin,{cellM:TRACE.mainCell,refineM:refine});
   const pass=createProjectionPass({n,device:DEVICE,response:RESPONSE,includeContext:true,flux,axisBinCache:nativeBinCache,sampleRay:(sx,sy)=>{const dir=direction(sx,sy);return{dir,q:interpretTargets(traceRay(dir,TRACE.mainCell,refine))};}});
   return{advance:rows=>pass.advance(rows),complete:result=>({...result,quality,patternResult:adaptLegacyPatternResult({pass:result,identity:geometryContext.identity,materials:geometryContext.materials,station:c,device:DEVICE,response:RESPONSE,environment:geometryContext.environment,traceSettings,directionToModel:dir=>{const d=geometryContext.docDirectionToModel(dir);return[d.x,d.y,d.z];}})})};
  }
  return Object.freeze({cloud,quickMetrics,projection,centralRay:()=>traceRay(directionDoc(c,geometryContext)),ensureTargetSignificance(data,id){if(data?.quality!=='final')return;for(const v of data.values)if(!Object.hasOwn(v.sigByTarget,id))v.sigByTarget[id]=evaluateLegacyTargetSignificance(v,id,{flux,systematicFraction:RESPONSE.systematicFraction});}});
 }
 return Object.freeze({createSession,clearCaches(){nativeBinCache.clear();fluxCache.clear();}});
}
