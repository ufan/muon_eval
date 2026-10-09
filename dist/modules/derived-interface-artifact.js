// Source-bound qualification artifact only. Never a replacement ray backend
// or an implicitly accepted physical envelope. No DOM/render/native dependency.
import { sha256Portable } from './sha256.js';
import { structuralMeshIdentity } from './structural-reference-qualification.js';
import { buildStructuralConnectivity } from './structural-reference-candidates.js';
import { createTriangleBVH } from './triangle-bvh.js';
export const INTERFACE_ARTIFACT_VERSION = '1.0.0';
const canonical = value => JSON.stringify(value, (_, v) => {
  if (typeof v === 'number' && !Number.isFinite(v) || ['undefined','function','symbol','bigint'].includes(typeof v)) throw new Error('Artifact requires finite JSON');
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (Object.getPrototypeOf(v)!==Object.prototype && Object.getPrototypeOf(v)!==null) throw new Error('Artifact requires plain JSON objects');
    return Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]));
  }
  return v;
});
const digest = value => sha256Portable(new TextEncoder().encode(canonical(value)));
const detached = value => JSON.parse(canonical(value));
function nativeInputDigest(runtime,domainFaces,sourceCaseId) {
  const input={id:sourceCaseId,precedence:runtime.projectionGeometry.classification.material_precedence.filter(m=>m!=='air'),
    components:runtime.components.filter(c=>c.metadata.flags.physics&&c.metadata.material_id!=='air').map(c=>({
      componentId:c.componentId,material:c.metadata.material_id,positions:Array.from(c.positions),indices:Array.from(c.indices),domainFaceIds:domainFaces[c.componentId]||[]}))};
  return sha256Portable(new TextEncoder().encode(JSON.stringify(input)));
}
function binding(runtime, domainPolicy,domainFaces,sourceCaseId) {
  if (!runtime?.projectionGeometry || !runtime.identity || typeof runtime.scenarioId!=='string' || !domainPolicy?.id || !domainPolicy.version) throw new Error('Explicit source geometry/scenario/domain policy required');
  if(typeof sourceCaseId!=='string'||!sourceCaseId) throw new Error('Explicit native source case required');
  return detached({identity:runtime.identity,scenarioId:runtime.scenarioId,variables:runtime.variables,
    backend:runtime.backend,geometry:runtime.projectionGeometry,domainPolicy,sourceCaseId,
    nativeInputSha256:nativeInputDigest(runtime,domainFaces,sourceCaseId)});
}
function inputRecords(runtime, domainFaces) {
  const ids=new Set();
  return runtime.components.filter(c=>c.metadata.flags.physics&&c.metadata.material_id!=='air').map(c=>{
    if(ids.has(c.componentId)) throw new Error('Duplicate source component'); ids.add(c.componentId);
    const faces=domainFaces[c.componentId]||[];
    if(!Array.isArray(faces)||!faces.every((f,i)=>Number.isInteger(f)&&f>=0&&f<c.indices.length/3&&(i===0||f>faces[i-1]))) throw new Error('Ordered unique source domain-face IDs required');
    return {componentId:c.componentId,material:c.metadata.material_id,triangleCount:c.indices.length/3,
      meshSha256:structuralMeshIdentity(c),domainFaceIds:[...faces]};
  });
}
function validateBoundary(boundary, inputs) {
  if (!boundary || !Array.isArray(boundary.positions)||!boundary.positions.every(Number.isFinite)||!Array.isArray(boundary.indices)||boundary.indices.some(i=>!Number.isInteger(i)||i<0||i>0xffffffff)) throw new Error('Invalid boundary buffers');
  const mesh={positions:new Float64Array(boundary.positions),indices:new Uint32Array(boundary.indices)};
  const topology=buildStructuralConnectivity(mesh);
  if(topology.edges.some(e=>!e.left||!e.right)) throw new Error('Derived boundary must be indexed closed/wound');
  createTriangleBVH(mesh,{tolerance:Math.max(boundary.nativeToleranceM||0,1e-12)});
  const count=boundary.indices.length/3, byId=new Map(inputs.map(i=>[i.componentId,i]));
  const domainSets=new Map(inputs.map(i=>[i.componentId,new Set(i.domainFaceIds)]));
  if(!Number.isFinite(boundary.nativeToleranceM)||boundary.nativeToleranceM<0 || !['faceMaterials','sourceFaces','faceScopeKinds'].every(k=>Array.isArray(boundary[k])&&boundary[k].length===count)) throw new Error('Invalid triangle lineage/scope/tolerance');
  boundary.sourceFaces.forEach((source,i)=>{
    const input=byId.get(source?.componentId);
    if(!input||Object.keys(source).sort().join(',')!=='componentId,faceId,sourceMaterial,winningMaterial'||!Number.isInteger(source.faceId)||source.faceId<0||source.faceId>=input.triangleCount
      ||source.sourceMaterial!==input.material||source.winningMaterial!==boundary.faceMaterials[i]
      ||!inputs.some(r=>r.material===boundary.faceMaterials[i])) throw new Error('Invalid boundary source/material lineage');
    const expected=domainSets.get(source.componentId).has(source.faceId)?'domain-cap':'scope-unqualified';
    if(boundary.faceScopeKinds[i]!==expected) throw new Error('Unproved physical scope or domain lineage conflict');
  });
  return mesh;
}
export function createDerivedInterfaceArtifact(native, {runtime, domainFaces={}, domainPolicy, sourceCaseId, generator} = {}) {
  if(generator?.name!=='manifold-priority-interface'||generator.version!=='1.0.0'||generator.manifoldVersion!=='3.5.4'||typeof generator.numpyVersion!=='string') throw new Error('Pinned explicit interface generator required');
  const inputs=inputRecords(runtime,domainFaces);
  const source=binding(runtime,domainPolicy,domainFaces,sourceCaseId);
  if(native.id!==sourceCaseId||native.inputSha256!==source.nativeInputSha256) throw new Error('Native input receipt does not match current scientific source');
  const boundary=detached({positions:native.positions,indices:native.indices,faceMaterials:native.faceMaterials,
    sourceFaces:native.sourceFaces,faceScopeKinds:native.faceScopeKinds,nativeToleranceM:native.nativeToleranceM});
  validateBoundary(boundary,inputs);
  const body={formatVersion:INTERFACE_ARTIFACT_VERSION,kind:'derived-material-air-interface',frame:'model_frame',units:'m',
    source,inputs,generator:detached(generator),boundary,
    eligibility:'qualification-only-not-physical-envelope',
    limitations:['Finite-model air boundary only; positive physical-domain scope remains unqualified.',
      'Source component/face lineage does not establish canonical entity ownership.',
      'Native tolerance is not validated geometric accuracy; this artifact never changes scientific ray inputs.']};
  return {...body,contentSha256:digest(body)};
}
export function validateDerivedInterfaceArtifact(document, {runtime,domainFaces={},domainPolicy,sourceCaseId,expectedSha256} = {}) {
  if(!/^[a-f0-9]{64}$/.test(expectedSha256||'')) throw new Error('External pinned artifact SHA-256 required');
  const {contentSha256,...body}=document;
  if(body.formatVersion!==INTERFACE_ARTIFACT_VERSION||body.kind!=='derived-material-air-interface'||body.frame!=='model_frame'||body.units!=='m'
    ||body.eligibility!=='qualification-only-not-physical-envelope') throw new Error('Unsupported interface artifact');
  if(contentSha256!==expectedSha256||digest(body)!==expectedSha256) throw new Error('Interface artifact integrity mismatch');
  if(!Array.isArray(body.limitations)||!body.limitations.length||!body.limitations.every(s=>typeof s==='string'&&s)) throw new Error('Explicit interface limitations required');
  if(canonical(body.source)!==canonical(binding(runtime,domainPolicy,domainFaces,sourceCaseId))) throw new Error('Interface artifact source/scenario/policy mismatch');
  if(canonical(body.inputs)!==canonical(inputRecords(runtime,domainFaces))) throw new Error('Interface artifact input/domain mismatch');
  if(body.generator?.name!=='manifold-priority-interface'||body.generator.version!=='1.0.0'||body.generator.manifoldVersion!=='3.5.4') throw new Error('Unsupported interface generator');
  const mesh=validateBoundary(body.boundary,body.inputs);
  return {mesh,source:detached(body.source),contentSha256,eligibility:body.eligibility,
    faceMaterials:[...body.boundary.faceMaterials],sourceFaces:detached(body.boundary.sourceFaces),
    faceScopeKinds:[...body.boundary.faceScopeKinds],limitations:[...body.limitations]};
}
