// @ts-check
// Bounded schema-0.6 compatibility adapter, not a generic geometry backend.
import { createGeometryKernel } from './geometry-kernel.js';
import { createDdaRayTracer } from './dda-ray-tracer.js';

function freeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const point = p => {
  if (!p || ![p.x,p.y,p.z].every(Number.isFinite)) throw new Error('Expected finite coordinate fields');
  return p;
};

export function createLegacyGeometryAdapter(dataset) {
  if (dataset.geometry || dataset.spec?.schema_version !== '0.6' || !dataset.id)
    throw new Error('Legacy adapter requires an explicit schema-0.6 dataset');
  // Computation owns a detached source snapshot, including terrain buffers.
  // Neither later UI mutations nor caller changes can alter a bound calculation.
  const source = structuredClone({spec:dataset.spec,identity:dataset.identity,
    terrainNear:dataset.terrainNear,terrainFar:dataset.terrainFar});
  const {spec,terrainNear,terrainFar} = source, h = terrainNear.header;
  const matrix = spec.conventions?.model_frame?.transform_from_doc?.matrix_3x4;
  const offset = -matrix?.[2]?.[3];
  if (!Number.isFinite(offset) || JSON.stringify(matrix) !== JSON.stringify([[0,1,0,0],[1,0,0,0],[0,0,1,-offset]]) ||
      h.z_offset_applied !== offset || (terrainFar && terrainFar.header.z_offset_applied !== offset))
    throw new Error('Unsupported legacy coordinate convention or terrain elevation datum');
  const identity = freeze({...source.identity,release_id:dataset.id});
  const materials = freeze({...spec.materials,steel:spec.materials.steel||{density:7.85},air:spec.materials.air||{density:0}});
  const densities = {concrete:materials.concrete.density,water:materials.water.density,
    rock:materials.rock.density,steel:materials.steel.density,air:0};
  const bounds = {min:{x:h.origin[1],y:h.origin[0],z:150},
    max:{x:h.origin[1]+(h.shape[1]-1)*h.spacing[1],y:h.origin[0]+(h.shape[0]-1)*h.spacing[0],z:600}};
  const boundsDoc = freeze({min:[bounds.min.x,bounds.min.y,bounds.min.z],max:[bounds.max.x,bounds.max.y,bounds.max.z]});
  const defaultEnvironment = freeze({upstream:spec.parameters.water_up_level.value,
    downstream:spec.parameters.water_tail_level?.value??210});
  const kernel = createGeometryKernel({spec,terrainNear,terrainFar});
  const targetIds = Object.freeze(['elevator','spillway','platform','water','dam','gallery']);
  const trace = createDdaRayTracer({bounds,densities,targetIds,maxDistanceM:500,
    classifyPoint:(x,y,z,environment)=>{
      const q=kernel.classifyDoc(x,y,z,environment.upstream);
      return {kind:q.material,targets:q.targets};
    }});
  // Keep the exact legacy arithmetic order, using the declared elevation offset.
  const modelPointToDoc = p => {point(p);return{x:p.y,y:p.x,z:p.z+offset};};
  const docPointToModel = p => {point(p);return{x:p.y,y:p.x,z:p.z-offset};};
  const swapDirection = d => {point(d);return{x:d.y,y:d.x,z:d.z};};
  function bindEnvironment(input=defaultEnvironment) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(k=>!['upstream','downstream'].includes(k)))
      throw new Error('Unsupported legacy environment fields');
    const environment=freeze({upstream:Object.hasOwn(input,'upstream')?input.upstream:defaultEnvironment.upstream,
      downstream:Object.hasOwn(input,'downstream')?input.downstream:defaultEnvironment.downstream});
    if (!Object.values(environment).every(Number.isFinite) || environment.downstream!==defaultEnvironment.downstream)
      throw new Error('Legacy environment requires finite upstream and dataset-fixed downstream levels');
    const traceDoc=(origin,direction,{cellM,refineM})=>trace(origin,direction,{cellM,refineM,environment});
    return Object.freeze({identity,materials,environment,boundsDoc,targetIds,
      modelPointToDoc,docPointToModel,modelDirectionToDoc:swapDirection,docDirectionToModel:swapDirection,
      backend:'legacy-dda@1.0.0',maxDistanceM:500,
      traceDoc,
      traceModel:(origin,direction,settings)=>traceDoc(modelPointToDoc(origin),swapDirection(direction),settings),
      classifyDoc:(x,y,z)=>kernel.classifyDoc(x,y,z,environment.upstream),
      traceSettings(origin,{cellM,refineM}) {
        point(origin);
        if (![cellM,refineM].every(v=>Number.isFinite(v)&&v>0)) throw new Error('Invalid legacy trace sampling');
        const coordinates=[origin.x,origin.y,origin.z];
        return {mainCellM:cellM,refineM,boundsDoc,
          maximumRayDistanceM:Math.hypot(...coordinates.map((v,i)=>Math.max(Math.abs(v-boundsDoc.min[i]),Math.abs(v-boundsDoc.max[i]))))};
      }});
  }
  return Object.freeze({identity,materials,defaultEnvironment,boundsDoc,targetIds,bindEnvironment,
    modelPointToDoc,docPointToModel,modelDirectionToDoc:swapDirection,docDirectionToModel:swapDirection,
    terrainAtDoc:(x,y)=>kernel.terrainAtDoc(x,y)});
}
