import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { csgInterfaceCases } from '../scripts/benchmark-interface-csg.mjs';
import { createPatternFixture } from './projection-pattern-fixtures.mjs';
import { createDerivedInterfaceArtifact, validateDerivedInterfaceArtifact } from '../dist/modules/derived-interface-artifact.js';
import { checkInterfaceRayConsistency } from '../scripts/interface-ray-consistency.mjs';
import { createTriangleBVH } from '../dist/modules/triangle-bvh.js';
const evidence=JSON.parse(await readFile(new URL('./fixtures/interface-csg.json',import.meta.url),'utf8'));
const generator={name:'manifold-priority-interface',version:'1.0.0',manifoldVersion:evidence.manifoldVersion,numpyVersion:evidence.numpyVersion};
function setup(id='slab') {
  const fixture=createPatternFixture(id), row=csgInterfaceCases().find(c=>c.id===id);
  return {native:{...evidence.fixtureMeshes.find(r=>r.id===id),inputSha256:evidence.results.find(r=>r.id===id).inputSha256},context:{runtime:fixture.runtime,sourceCaseId:id,
    domainFaces:Object.fromEntries(row.components.map(c=>[c.componentId,c.domainFaceIds||[]])),
    domainPolicy:{id:'explicit-analytic-fixture-cap-map',version:'1.0.0'},generator}};
}

test('artifact JSON roundtrip binds every source input and retains unqualified scope without native dependencies',()=>{
  for(const id of ['slab','cavity','opening','material-junction','terrain']) {
    const {native,context}=setup(id),before=context.runtime.components.map(c=>Array.from(c.positions));
    const artifact=createDerivedInterfaceArtifact(native,context);
    const parsed=JSON.parse(JSON.stringify(artifact));
    const loaded=validateDerivedInterfaceArtifact(parsed,{...context,expectedSha256:artifact.contentSha256});
    assert.ok(loaded.mesh.positions instanceof Float64Array);
    assert.equal(loaded.eligibility,'qualification-only-not-physical-envelope');
    assert.deepEqual(loaded.sourceFaces,native.sourceFaces);
    assert.deepEqual(loaded.faceScopeKinds,native.faceScopeKinds);
    assert.deepEqual(context.runtime.components.map(c=>Array.from(c.positions)),before);
    loaded.mesh.positions[0]+=100;
    assert.equal(parsed.boundary.positions[0],native.positions[0]);
  }
});

test('stale source, domain/scenario and any tampered content fail closed',()=>{
  const {native,context}=setup(),artifact=createDerivedInterfaceArtifact(native,context);
  const read=doc=>validateDerivedInterfaceArtifact(doc,{...context,expectedSha256:artifact.contentSha256});
  assert.throws(()=>validateDerivedInterfaceArtifact(artifact,context),/pinned/);
  for(const alter of [
    d=>d.formatVersion='2',d=>d.boundary.positions[0]+=1,d=>d.boundary.faceScopeKinds[0]='physical-interface',
    d=>d.source.scenarioId='other',d=>d.inputs[0].meshSha256='bad',d=>d.generator.manifoldVersion='3',
    d=>d.eligibility='physical-envelope-ready',d=>d.boundary.sourceFaces[0].entityId='invented'
  ]) {const copy=structuredClone(artifact);alter(copy);assert.throws(()=>read(copy));}
  assert.throws(()=>validateDerivedInterfaceArtifact(artifact,{...context,domainPolicy:{id:'other',version:'1.0.0'},expectedSha256:artifact.contentSha256}));
  const changed=setup().context;changed.runtime.variables={water:9};
  assert.throws(()=>validateDerivedInterfaceArtifact(artifact,{...changed,expectedSha256:artifact.contentSha256}));
  changed.runtime.components[0].positions[0]+=.125;
  assert.throws(()=>validateDerivedInterfaceArtifact(artifact,{...changed,expectedSha256:artifact.contentSha256}));
});

test('invalid lineage, asserted physical scope and open/degenerate boundaries are rejected at creation',()=>{
  const {native,context}=setup();
  for(const alter of [
    n=>n.sourceFaces[0].faceId=999,n=>n.faceScopeKinds[0]='physical-interface',n=>n.positions[0]=NaN,
    n=>n.indices=n.indices.slice(3),n=>n.indices[1]=n.indices[0],n=>n.faceMaterials[0]='invented',n=>n.inputSha256='stale',n=>n.id='other'
  ]) {const copy=structuredClone(native);alter(copy);assert.throws(()=>createDerivedInterfaceArtifact(copy,context));}
});

test('loaded boundaries reproduce analytic scientific air/dense transitions for internal and external observers',()=>{
  for(const id of ['slab','wedge','cavity','opening','material-junction','terrain']) {
    const {native,context}=setup(id),artifact=createDerivedInterfaceArtifact(native,context);
    const {mesh}=validateDerivedInterfaceArtifact(artifact,{...context,expectedSha256:artifact.contentSha256});
    const rays=createPatternFixture(id).views.flatMap(view=>[[-.2,.13],[0,0],[.3,-.17]].map(([y,z])=>{
      const v=[1,y,z],norm=Math.hypot(...v);return {label:`${view.name}/${y}/${z}`,origin:view.origin,direction:v.map(x=>x/norm),length:30};
    }));
    const report=checkInterfaceRayConsistency(mesh,context.runtime,rays,{toleranceM:1e-6});
    assert.equal(report.passed,true,JSON.stringify(report.failedRays));
  }
});

test('shared BVH accepts double precision without changing existing Float32 behavior',()=>{
  const mesh=createPatternFixture('slab').runtime.components[0];
  const single=createTriangleBVH(mesh),double=createTriangleBVH({...mesh,positions:new Float64Array(mesh.positions)});
  assert.deepEqual(double.rayIntervals([0,0,0],[1,0,0],30),single.rayIntervals([0,0,0],[1,0,0],30));
  assert.equal(double.containsPoint([3,0,0]),single.containsPoint([3,0,0]));
});

test('ray gate detects displaced interfaces even when total dense length is unchanged',()=>{
  const {native,context}=setup(),positions=new Float64Array(native.positions);
  for(let i=0;i<positions.length;i+=3) positions[i]+=1;
  const report=checkInterfaceRayConsistency({positions,indices:new Uint32Array(native.indices)},context.runtime,
    [{label:'displaced-slab',origin:[0,0,0],direction:[1,0,0],length:30}],{toleranceM:1e-6});
  assert.equal(report.passed,false); assert.equal(report.failedRays.length,1);
  assert.equal(report.maximumLengthErrorM,0); assert.equal(report.maximumEndpointErrorM,1);
});
