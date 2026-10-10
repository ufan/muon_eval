import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../../dist/modules/compiled-mesh-runtime.js';
import { auditRockDomain } from '../../scripts/audit-structural-reference-domain.mjs';
const dataset=await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');

test('reviewed compiler domain audit excludes caps in all four real scenarios without certifying air interfaces',async()=>{
  for(const scenario of dataset.geometry.scenarios.keys()) {
    const runtime=await loadCompiledMeshRuntime(dataset,scenario), mesh=runtime.components.find(c=>c.componentId==='rock');
    const before=mesh.positions.slice(), audit=auditRockDomain(mesh,dataset.geometry.source,dataset.compiledManifest);
    assert.deepEqual(audit.exactCoplanarDomainFaces,{'doc-x-min':356,'doc-x-grid-max':356,'doc-y-min':348,'doc-y-grid-max':348,'doc-z-bottom':58458});
    assert.equal(audit.unresolvedFaces,60934); assert.equal(audit.acceptedPhysicalInterfaceFaces,0);
    // Literal declared max is 831; the compiler's sampled endpoint is 830.
    assert.equal(audit.domainPlanesModel.find(p=>p.id==='doc-x-grid-max').value,830);
    assert.equal(Object.values(audit.exactCoplanarDomainFaces).reduce((a,b)=>a+b,0)+audit.unresolvedFaces,mesh.indices.length/3);
    assert.deepEqual(mesh.positions,before);
  }
});

test('domain audit rejects changed compiler semantics/frame and wrong component',async()=>{
  const runtime=await loadCompiledMeshRuntime(dataset,'low'),mesh=runtime.components.find(c=>c.componentId==='rock');
  const manifest=structuredClone(dataset.compiledManifest); manifest.compiler.script_sha256='unreviewed';
  assert.throws(()=>auditRockDomain(mesh,dataset.geometry.source,manifest));
  const source=structuredClone(dataset.geometry.source); source.frames.model_frame.transform_from_doc.matrix_3x4[0][3]=1;
  assert.throws(()=>auditRockDomain(mesh,source,dataset.compiledManifest));
  assert.throws(()=>auditRockDomain(runtime.components.find(c=>c.componentId==='concrete'),dataset.geometry.source,dataset.compiledManifest));
});
