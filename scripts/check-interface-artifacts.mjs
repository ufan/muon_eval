// Generates qualification-only artifacts in a fresh temporary directory by
// default. Existing outputs are never overwritten; release assets untouched.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { realInterfaceCases, runNativeInterfaceCases } from './benchmark-interface-csg.mjs';
import { createDerivedInterfaceArtifact, validateDerivedInterfaceArtifact } from '../dist/modules/derived-interface-artifact.js';
import { detectorBasis, slopeDirection } from '../dist/modules/material-projection.js';
import { checkInterfaceRayConsistency } from './interface-ray-consistency.mjs';
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
const outputDir=args.includes('--output-dir')?resolve(value('--output-dir')):await mkdtemp(join(tmpdir(),'muon-interface-artifacts-'));
await mkdir(outputDir,{recursive:true});
const python=args.includes('--python')?value('--python'):'python3';
const summaries=[];
for(const row of await realInterfaceCases()) {
  process.stderr.write(`Source-bound artifact and shared-ray checks: ${row.id}\n`);
  const native=await runNativeInterfaceCases([row],python);
  const context={runtime:row.runtime,sourceCaseId:row.id,domainFaces:Object.fromEntries(row.components.map(c=>[c.componentId,c.domainFaceIds||[]])),
    domainPolicy:row.domainPolicy,generator:{name:'manifold-priority-interface',version:'1.0.0',manifoldVersion:native.manifoldVersion,numpyVersion:native.numpyVersion}};
  const sourceHashesBefore=row.runtime.components.map(c=>createHash('sha256').update(c.positions).update(c.indices).digest('hex'));
  const artifact=createDerivedInterfaceArtifact(native.results[0],context);
  const filename=`${row.id}.interface.v1.json`,address=join(outputDir,filename);
  await writeFile(address,JSON.stringify(artifact),{encoding:'utf8',flag:'wx'});
  // Parse the actual file, then verify external content pin and current source.
  const bytes=await readFile(address),parsed=JSON.parse(bytes.toString('utf8'));
  const loaded=validateDerivedInterfaceArtifact(parsed,{...context,expectedSha256:artifact.contentSha256});
  const spans=row.runtime.bounds.max.map((x,i)=>x-row.runtime.bounds.min[i]),center=row.runtime.bounds.min.map((x,i)=>x+spans[i]/2);
  const origins=[...row.referenceOrigins,
    {label:'outside-min-x',origin:[row.runtime.bounds.min[0]-.13*spans[0],center[1],center[2]]},
    {label:'outside-max-x',origin:[row.runtime.bounds.max[0]+.13*spans[0],center[1],center[2]]},
    {label:'above-domain',origin:[center[0],center[1],row.runtime.bounds.max[2]+.13*spans[2]]}];
  const rays=origins.flatMap(({label,origin})=>Array.from({length:8},(_,i)=>i*45).flatMap(azimuthDeg=>[-10,20,50].map(elevationDeg=>({
    label:`${label}/az${azimuthDeg}/el${elevationDeg}`,origin,direction:slopeDirection(detectorBasis(azimuthDeg,elevationDeg),.031,.017),length:3*Math.hypot(...spans)}))));
  const report=checkInterfaceRayConsistency(loaded.mesh,row.runtime,rays,{toleranceM:row.runtime.projectionGeometry.tolerances.analytic.point_classification_m});
  const sourceHashesAfter=row.runtime.components.map(c=>createHash('sha256').update(c.positions).update(c.indices).digest('hex'));
  if(JSON.stringify(sourceHashesBefore)!==JSON.stringify(sourceHashesAfter)) throw new Error('Derived artifact altered scientific mesh buffers');
  await writeFile(join(outputDir,`${row.id}.ray-check.json`),JSON.stringify(report,null,2),{flag:'wx'});
  summaries.push({scenarioId:row.runtime.scenarioId,artifact:filename,fileSha256:createHash('sha256').update(bytes).digest('hex'),
    contentSha256:artifact.contentSha256,byteLength:bytes.length,source:artifact.source,
    inputHashesUnchanged:true,eligibility:artifact.eligibility,triangleCount:artifact.boundary.indices.length/3,
    domainFaces:artifact.boundary.faceScopeKinds.filter(k=>k==='domain-cap').length,
    unqualifiedFaces:artifact.boundary.faceScopeKinds.filter(k=>k==='scope-unqualified').length,
    rayChecks:{rayCount:report.rayCount,toleranceM:report.toleranceM,passed:report.passed,failedRays:report.failedRays.length,
      maximumLengthErrorM:report.maximumLengthErrorM,maximumEndpointErrorM:report.maximumEndpointErrorM}});
}
const report={milestone:'source-bound-interface-artifacts-and-sampled-shared-ray-consistency',version:'1.0.0',
  outputDir,passed:summaries.every(s=>s.rayChecks.passed),scenarios:summaries,
  limitations:['Not accepted physical envelopes; all non-cap real physical scope remains unqualified.',
    'Ray checks sample total dense occupancy only; not exhaustive/per-material or real-survey accuracy.']};
await writeFile(join(outputDir,'manifest.json'),JSON.stringify(report,null,2),{flag:'wx'});
process.stdout.write(JSON.stringify({...report,scenarios:report.scenarios.map(({source,...rest})=>({...rest,sourceRelease:source.identity.release_id,sourceGlbSha256:source.geometry.assetIdentity.glbSha256}))},null,2)+'\n');
if(!report.passed) process.exitCode=1;
