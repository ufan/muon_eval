import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { csgInterfaceCases, nativeCaseInput, summarizeNativeInterface, realInterfaceCases } from '../../scripts/benchmark-interface-csg.mjs';
import { structuralMeshIdentity, qualifiedStructuralCandidates } from '../../dist/modules/structural-reference-qualification.js';
import { createTriangleBVH } from '../../dist/modules/triangle-bvh.js';
const evidence=JSON.parse(await readFile(new URL('../fixtures/interface-csg.json',import.meta.url),'utf8'));
const meshFor=id=>{const row=evidence.fixtureMeshes.find(r=>r.id===id);return {row,mesh:{positions:new Float64Array(row.positions),indices:new Uint32Array(row.indices)}};};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const area=(a,b,c)=>{const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;};
const triangle=(row,face)=>row.indices.slice(face*3,face*3+3).map(id=>row.positions.slice(id*3,id*3+3));
function fixtureQualified(id,material,includePatchBoundaries) {
  const {mesh,row}=meshFor(id);
  const faceMap={version:'1.0.0',meshSha256:structuralMeshIdentity(mesh),scenarioKey:`native-fixture@1/${id}`,faces:row.faceMaterials.map((m,i)=>row.faceScopeKinds[i]==='domain-cap'
    ?{kind:'domain-cap',evidence:'Explicit analytic terrain fixture cap IDs preserved by native CSG lineage.'}
    :{kind:'physical-interface',materials:[m,'air'],scope:'whole-face-open-sides',errorBoundM:row.nativeToleranceM,
      evidence:'Analytic fixture domain semantics plus recorded native priority-partition/global-union external boundary.'})};
  return qualifiedStructuralCandidates(mesh,{material,scenarioKey:faceMap.scenarioKey,faceMap,origin:[0,0,0],includeCreases:true,featureAngleDeg:30,includePatchBoundaries});
}

test('recorded native CSG boundary/lineage is tied to unchanged analytic inputs',()=>{
  assert.equal(evidence.manifoldVersion,'3.5.4');
  for(const fixture of csgInterfaceCases()) {
    const input=nativeCaseInput(fixture),hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const summary=evidence.results.find(r=>r.id===fixture.id),native=evidence.fixtureMeshes.find(r=>r.id===fixture.id);
    assert.equal(summary.inputSha256,hash);
    assert.deepEqual(summarizeNativeInterface(fixture,native),summary);
    assert.equal(summary.indexedBorderEdges,0);
    assert.equal(native.sourceFaces.length,native.indices.length/3);
    for(const source of native.sourceFaces) {
      const original=fixture.components.find(c=>c.componentId===source.componentId);
      assert.ok(source.faceId>=0&&source.faceId<original.indices.length/3);
    }
  }
});

test('native union removes material contacts and splits entire partial water-contact patches',()=>{
  const junction=meshFor('material-junction').row;
  assert.ok(Array.from({length:junction.indices.length/3},(_,i)=>triangle(junction,i)).every(t=>!t.every(p=>p[0]===4)));
  const water=meshFor('partial-water-contact').row;
  let exposedArea=0;
  for(let face=0;face<water.faceMaterials.length;face++) {
    const t=triangle(water,face);
    if(water.faceMaterials[face]==='concrete'&&t.every(p=>p[0]===2)) {
      assert.ok(t.every(p=>p[2]>=0),'untrimmed water-contact face leaked into concrete-air patch');
      exposedArea+=area(...t);
    }
  }
  close(exposedArea,8);
  close(water.unionVolumeM3,100);
  const overlap=meshFor('overlap-priority').row;
  close(overlap.winningVolumesM3.concrete,64); close(overlap.winningVolumesM3.water,28);
  const identical=meshFor('identical-overlap-priority').row;
  assert.ok(identical.faceMaterials.every(m=>m==='concrete')); close(identical.winningVolumesM3.water,0);
});

test('recorded union buffers retain analytic solid and cavity ray chords',()=>{
  for(const [id,origin,direction,expected] of [
    ['slab',[0,0,0],[1,0,0],4], ['cavity',[0,0,0],[1,0,0],2],
    ['opening',[0,0,0],[1,0,0],0], ['material-junction',[0,0,0],[1,0,0],4]
  ]) {
    const {row}=meshFor(id),bvh=createTriangleBVH({positions:new Float32Array(row.positions),indices:new Uint32Array(row.indices)},{tolerance:1e-8});
    close(bvh.rayIntervals(origin,direction,20).reduce((n,[a,b])=>n+b-a,0),expected);
  }
});

test('coplanar verified air-patch transitions produce separately labeled rims without domain rims',()=>{
  const off=fixtureQualified('material-junction','concrete',false),on=fixtureQualified('material-junction','concrete',true);
  assert.equal(off.candidates.length,8); assert.equal(on.candidates.length,12);
  const rims=on.candidates.filter(c=>c.reasons.includes('physical-patch-boundary'));
  assert.equal(rims.length,4);
  assert.ok(rims.every(c=>c.segment.every(p=>p[0]===4)&&c.patchMaterials.join(',')==='concrete,rock'&&c.sourceEntityId===null));
  const terrain=fixtureQualified('terrain','rock',true);
  assert.equal(terrain.candidates.length,0); assert.equal(terrain.provenance.domainFaces,10);
  const cavity=fixtureQualified('cavity','concrete',true);
  assert.equal(cavity.candidates.length,24);
});

test('native real-scenario summaries are tied to verified mesh/material/domain inputs without certifying physical scope',async()=>{
  const cases=await realInterfaceCases();
  assert.equal(cases.length,4);
  for(const row of cases) {
    const summary=evidence.results.find(r=>r.id===row.id);
    assert.equal(summary.inputSha256,createHash('sha256').update(JSON.stringify(nativeCaseInput(row))).digest('hex'));
    assert.equal(summary.indexedBorderEdges,0);
    assert.equal(Object.values(summary.materialCounts).reduce((a,b)=>a+b,0),summary.outputTriangles);
    assert.equal(Object.values(summary.scopeCounts).reduce((a,b)=>a+b,0),summary.outputTriangles);
    assert.ok(summary.scopeCounts['scope-unqualified']>0);
    close(Object.values(summary.winningVolumesM3).reduce((a,b)=>a+b,0),summary.unionVolumeM3);
  }
});
