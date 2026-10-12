import test from 'node:test';
import assert from 'node:assert/strict';
import { structuralMeshIdentity, qualifiedStructuralCandidates } from '../../dist/modules/structural-reference-qualification.js';
import { createPatternFixture } from '../projection-pattern-fixtures.mjs';
const options = { material: 'concrete', scenarioKey: 'synthetic-fixture@1/low', origin: [0,0,0], includeCreases: true, featureAngleDeg: 30 };
const physical = material => ({kind:'physical-interface', materials:[material,'air'],scope:'whole-face-open-sides',errorBoundM:0,evidence:'Analytic fixture solid/shell construction; no competing volume on these whole face interiors.'});
function map(mesh, records) {
  return {version:'1.0.0',meshSha256:structuralMeshIdentity(mesh),scenarioKey:options.scenarioKey,faces:records};
}

test('missing provenance fails closed despite material labels and candidate lines',()=>{
  const mesh=createPatternFixture('slab').runtime.components[0];
  const result=qualifiedStructuralCandidates(mesh,options);
  assert.equal(result.qualification,'unresolved'); assert.equal(result.candidates.length,0);
  assert.equal(result.unresolvedCandidateIds.length,12);
});

test('analytic slab and cavity retain qualified internal/far-side reference edges without optical culling',()=>{
  for(const id of ['slab','cavity']) {
    const mesh=createPatternFixture(id).runtime.components[0];
    const faceMap=map(mesh,Array.from({length:mesh.indices.length/3},()=>physical('concrete')));
    const result=qualifiedStructuralCandidates(mesh,{...options,origin:[4,0,0],faceMap});
    assert.equal(result.qualification,'complete-supplied-face-map');
    assert.equal(result.candidates.length,id==='slab'?12:24);
    assert.ok(result.candidates.every(c=>c.sourceEntityId===null&&c.faceQualification.length===2));
    assert.equal(result.provenance.sourceEntityOwnership,'unresolved');
  }
});

test('verified concrete-rock contact faces are excluded rather than mislabeled as air',()=>{
  const mesh=createPatternFixture('material-junction').runtime.components[0];
  const faces=Array.from({length:12},(_,face)=>{
    const xs=Array.from(mesh.indices.slice(face*3,face*3+3),id=>mesh.positions[id*3]);
    return xs.every(x=>x===4)?{kind:'material-contact',materials:['concrete','rock'],scope:'whole-face-open-sides',errorBoundM:0,evidence:'Both analytic boxes occupy the full opposite sides of x=4.'}:physical('concrete');
  });
  const result=qualifiedStructuralCandidates(mesh,{...options,faceMap:map(mesh,faces)});
  assert.equal(result.candidates.length,8); assert.equal(result.excludedCandidateIds.length,4);
  assert.ok(result.candidates.every(c=>!c.segment.every(p=>p[0]===4)));
});

test('known finite terrain caps do not become a fake physical skyline',()=>{
  const mesh=createPatternFixture('terrain').runtime.components[0];
  // These indexed top faces follow the fixture's explicit construction, not
  // a general bounding-box or coordinate-name heuristic.
  const faces=Array.from({length:12},(_,face)=>face===2||face===3?physical('rock'):{kind:'domain-cap',evidence:'Analytic terrain fixture explicitly defines finite side/bottom truncations.'});
  const result=qualifiedStructuralCandidates(mesh,{...options,material:'rock',faceMap:map(mesh,faces)});
  assert.equal(result.candidates.length,0); assert.equal(result.excludedCandidateIds.length,12);
  assert.equal(result.provenance.domainFaces,10); assert.match(result.limitations.join(' '),/truncated/);
});

test('partial faces remain unresolved and stale or semantically invalid certificates are rejected',()=>{
  const mesh=createPatternFixture('slab').runtime.components[0], faces=Array.from({length:12},()=>physical('concrete'));
  faces[0]={kind:'unresolved',evidence:'Partial water contact has not been split/qualified.'};
  const faceMap=map(mesh,faces), result=qualifiedStructuralCandidates(mesh,{...options,faceMap});
  assert.equal(result.qualification,'partial'); assert.ok(result.unresolvedCandidateIds.length>0);
  for(const change of [{version:'2'},{meshSha256:'bad'},{scenarioKey:'other'},{faces:[]}]) assert.throws(()=>qualifiedStructuralCandidates(mesh,{...options,faceMap:{...faceMap,...change}}));
  const bad=structuredClone(faceMap); bad.faces[1]={...physical('concrete'),scope:'midpoint-only'};
  assert.throws(()=>qualifiedStructuralCandidates(mesh,{...options,faceMap:bad}));
  assert.throws(()=>qualifiedStructuralCandidates(mesh,{...options,featureAngleDeg:undefined}));
});
