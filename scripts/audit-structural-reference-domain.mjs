// Development-only audit for the reviewed dam_v07.compiler release. It does
// not qualify any air interface or alter release assets/scientific geometry.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadRegisteredDataset } from './dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
const compilerSha256 = '264500a53ebe203468a2b9ec3feffb4562e76e26587ec376aef98ae9830d5045';
const archive = new URL('../archive/zhouning-dam-spec_v0.6.2+schema0.7.0_20261005_full.zip', import.meta.url);
const member = 'zhouning-dam-spec_v0.6.2+schema0.7.0_20261005/dam_v07/compiler.py';

export function auditRockDomain(mesh, source, manifest) {
  if (mesh.componentId !== 'rock' || mesh.metadata.material_id !== 'rock' || !mesh.metadata.flags.physics) throw new Error('Reviewed rock component required');
  if (manifest.compiler.script_sha256 !== compilerSha256) throw new Error('Unreviewed compiler; domain construction must be requalified');
  if (JSON.stringify(source.frames.model_frame.transform_from_doc.matrix_3x4) !== JSON.stringify([[0,1,0,0],[1,0,0,0],[0,0,1,-source.parameters.model_frame_z_offset.value]])) throw new Error('Compiler/model frame mismatch');
  const box = source.terrain.model_box, step = manifest.compile_settings.rock_grid_m;
  if (!Number.isFinite(step) || step <= 0) throw new Error('Invalid rock grid step');
  if (!['x','y','z'].every(axis=>Array.isArray(box[axis])&&box[axis].length===2&&box[axis].every(Number.isFinite)&&box[axis][0]<box[axis][1])) throw new Error('Invalid compiler domain box');
  const gridEnd = axis => box[axis][0] + Math.floor((box[axis][1] + 1e-6 - box[axis][0])/step)*step;
  // Source __init__ also inserts near-field/breakline points. Verify none
  // extends the uniform-grid range before certifying the five cap planes.
  const nf = source.terrain.near_field, pool = source.terrain.plunge_pool_override;
  const resolve = x => typeof x === 'number' ? x : source.parameters[x.parameter_ref]?.value;
  const offsets = manifest.compile_settings.breakline_offset_m;
  const inserted = { x: [...nf.x.map(resolve), ...pool.x].flatMap(x=>[x-offsets,x+offsets]),
    y: [...nf.y,nf.y[0]-nf.blend_m,nf.y[1]+nf.blend_m,...pool.y].flatMap(x=>[x-offsets,x+offsets]) };
  for (const axis of ['x','y']) if (inserted[axis].some(x=>!Number.isFinite(x)||x<box[axis][0]||x>gridEnd(axis))) throw new Error('Inserted grid extends domain; audit requires requalification');
  const planes = [
    {id:'doc-x-min',axis:1,value:Math.fround(box.x[0])}, {id:'doc-x-grid-max',axis:1,value:Math.fround(gridEnd('x'))},
    {id:'doc-y-min',axis:0,value:Math.fround(box.y[0])}, {id:'doc-y-grid-max',axis:0,value:Math.fround(gridEnd('y'))},
    {id:'doc-z-bottom',axis:2,value:Math.fround(box.z[0]-source.parameters.model_frame_z_offset.value)}
  ];
  const counts = Object.fromEntries(planes.map(p=>[p.id,0]));
  let unresolvedFaces=0;
  for(let face=0;face<mesh.indices.length/3;face++) {
    const plane=planes.find(p=>[0,1,2].every(j=>mesh.positions[mesh.indices[face*3+j]*3+p.axis]===p.value));
    if(plane) counts[plane.id]++; else unresolvedFaces++;
  }
  return {componentId:mesh.componentId, triangleCount:mesh.indices.length/3,
    compilerSha256, domainPlanesModel:planes, exactCoplanarDomainFaces:counts,
    unresolvedFaces, acceptedPhysicalInterfaceFaces:0,
    limitations:['Exact coplanarity with reviewed compiler cap planes is exclusion evidence only.',
      'Other faces remain unresolved; no terrain/water/contact interface is certified.',
      'Near-plane faces are not classified by an invented tolerance or mesh bounding box.']};
}

async function main() {
  const compiler=execFileSync('unzip',['-p',archive.pathname,member]);
  if(createHash('sha256').update(compiler).digest('hex')!==compilerSha256) throw new Error('Archived compiler hash mismatch');
  const dataset=await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
  const scenarios=[];
  for(const scenarioId of dataset.geometry.scenarios.keys()) {
    const runtime=await loadCompiledMeshRuntime(dataset,scenarioId), mesh=runtime.components.find(c=>c.componentId==='rock');
    scenarios.push({scenarioId,...auditRockDomain(mesh,dataset.geometry.source,dataset.compiledManifest)});
  }
  process.stdout.write(JSON.stringify({dataset:dataset.identity,archivedCompilerVerified:true,scenarios},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main();
