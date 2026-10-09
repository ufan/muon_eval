// Development-only driver. stdout is reproducible evidence; --output writes
// generated evidence on explicit invocation, never modifies dataset assets.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createPatternFixture, patternFixtureIds } from '../tests/projection-pattern-fixtures.mjs';
import { cube, component } from '../tests/mesh-fixtures.mjs';
import { buildStructuralConnectivity, selectStructuralCandidates } from '../dist/modules/structural-reference-candidates.js';
import { loadRegisteredDataset } from './dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
import { auditRockDomain } from './audit-structural-reference-domain.mjs';

export function csgInterfaceCases() {
  const cases=patternFixtureIds.map(id=>({id,components:createPatternFixture(id).runtime.components,precedence:['concrete','rock']}));
  cases.find(row=>row.id==='terrain').components[0].domainFaceIds=[0,1,4,5,6,7,8,9,10,11];
  cases.push({id:'partial-water-contact',precedence:['concrete','water'],components:[
    component('concrete','concrete',cube([2,-2,-2],[6,2,2])),
    component('water','water',cube([0,-3,-3],[2,3,0]))]});
  cases.push({id:'overlap-priority',precedence:['concrete','water'],components:[
    component('concrete','concrete',cube([2,-2,-2],[6,2,2])),
    component('water','water',cube([1,-3,-3],[3,3,0]))]});
  cases.push({id:'identical-overlap-priority',precedence:['concrete','water'],components:[
    component('concrete','concrete',cube([2,-2,-2],[6,2,2])),
    component('water','water',cube([2,-2,-2],[6,2,2]))]});
  return cases;
}
export function nativeCaseInput(row) {
  return {id:row.id,precedence:row.precedence,components:row.components.map(c=>({componentId:c.componentId,
    material:c.metadata.material_id,positions:Array.from(c.positions),indices:Array.from(c.indices),domainFaceIds:c.domainFaceIds||[]}))};
}
export async function runNativeInterfaceCases(cases,python='python3') {
  const inputs=cases.map(nativeCaseInput),request=JSON.stringify({cases:inputs});
  const child=spawn(python,[new URL('./manifold-interface-reference.py',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data',data=>stdout+=data); child.stderr.on('data',data=>stderr+=data);
  const completion=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`Native CSG exited ${code}: ${stderr}`)));});
  child.stdin.on('error',()=>{});
  child.stdin.end(request);
  await completion;
  const result=JSON.parse(stdout);
  if(result.requestSha256!==createHash('sha256').update(request).digest('hex')||result.results.length!==inputs.length) throw new Error('Native request receipt mismatch');
  result.results=result.results.map((native,i)=>{
    if(native.id!==inputs[i].id) throw new Error('Native case receipt mismatch');
    return {...native,inputSha256:createHash('sha256').update(JSON.stringify(inputs[i])).digest('hex')};
  });
  return result;
}
export function summarizeNativeInterface(row,native) {
  const input=nativeCaseInput(row), inputSha256=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const mesh={positions:new Float64Array(native.positions),indices:new Uint32Array(native.indices)};
  const connectivity=buildStructuralConnectivity(mesh);
  const selected=selectStructuralCandidates(connectivity,{origin:[0,0,0],featureAngleDeg:30,includeCreases:true});
  const materialCounts=Object.fromEntries(row.precedence.map(m=>[m,native.faceMaterials.filter(x=>x===m).length]));
  const scopeCounts=Object.fromEntries(['domain-cap','scope-unqualified'].map(k=>[k,native.faceScopeKinds.filter(x=>x===k).length]));
  return {id:row.id,inputSha256,sourceComponentIds:row.components.map(c=>c.componentId),
    outputTriangles:native.indices.length/3,materialCounts,scopeCounts,
    winningVolumesM3:native.winningVolumesM3,unionVolumeM3:native.unionVolumeM3,nativeToleranceM:native.nativeToleranceM,
    indexedBorderEdges:selected.borderEdgeIds.length,creaseAndContourCandidates:selected.candidates.length,
    limitations:native.limitations};
}
export async function realInterfaceCases() {
  const dataset=await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0'), cases=[];
  for(const scenario of dataset.geometry.scenarios.keys()) {
    const runtime=await loadCompiledMeshRuntime(dataset,scenario);
    const components=runtime.components.filter(c=>c.metadata.flags.physics&&c.metadata.material_id!=='air');
    const rock=components.find(c=>c.componentId==='rock'),audit=auditRockDomain(rock,dataset.geometry.source,dataset.compiledManifest);
    rock.domainFaceIds=[];
    for(let face=0;face<rock.indices.length/3;face++) if(audit.domainPlanesModel.some(p=>[0,1,2].every(j=>rock.positions[rock.indices[face*3+j]*3+p.axis]===p.value))) rock.domainFaceIds.push(face);
    cases.push({id:`real-${scenario}`,components,runtime,
      domainPolicy:{id:'reviewed-rock-compiler-cap-lineage',version:'1.0.0',compilerSha256:dataset.compiledManifest.compiler.script_sha256},
      referenceOrigins:dataset.candidates.candidates.map(c=>({label:c.id,origin:dataset.geometry.coordinates.pointToModel(c.example_position)})),
      precedence:dataset.geometry.classification.material_precedence.filter(m=>m!=='air')});
  }
  return cases;
}
async function main() {
  const args=process.argv.slice(2), value=flag=>args[args.indexOf(flag)+1];
  const python=args.includes('--python')?value('--python'):'python3';
  const cases=csgInterfaceCases(), includeReal=args.includes('--real');
  if(includeReal) cases.push(...await realInterfaceCases());
  const summaries=[], fixtureMeshes=[];let versions;
  // Each process is isolated to bound native-memory lifetime on the real mesh.
  for(const row of cases) {
    process.stderr.write(`Native CSG reference: ${row.id}\n`);
    const result=await runNativeInterfaceCases([row],python);
    versions={manifoldVersion:result.manifoldVersion,numpyVersion:result.numpyVersion};
    summaries.push(summarizeNativeInterface(row,result.results[0]));
    if(!row.id.startsWith('real-')) fixtureMeshes.push(result.results[0]);
  }
  const output=JSON.stringify({...versions,method:'priority-partition-then-union-boundary-with-face-lineage',results:summaries,fixtureMeshes},null,2)+'\n';
  if(args.includes('--output')) await writeFile(value('--output'),output);else process.stdout.write(output);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main();
