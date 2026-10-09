import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLegacyGeometryAdapter } from '../dist/modules/legacy-geometry-adapter.js';
import { loadRegisteredDataset } from '../scripts/dataset-fixture.mjs';

const dataset=await loadRegisteredDataset(),adapter=createLegacyGeometryAdapter(dataset);
const copyDataset=()=>({...dataset,...structuredClone({spec:dataset.spec,identity:dataset.identity,
  terrainNear:dataset.terrainNear,terrainFar:dataset.terrainFar})});

test('legacy point transforms preserve exact arithmetic; directions never receive elevation translation',()=>{
  for(const p of [{x:12.5,y:122,z:57.400000000000006},{x:-1,y:-2,z:-3},{x:0,y:0,z:0}]) {
    assert.deepEqual(adapter.modelPointToDoc(p),{x:p.y,y:p.x,z:p.z+198});
    assert.deepEqual(adapter.docPointToModel(p),{x:p.y,y:p.x,z:p.z-198});
    assert.deepEqual(adapter.modelDirectionToDoc(p),{x:p.y,y:p.x,z:p.z});
    assert.deepEqual(adapter.docDirectionToModel(p),{x:p.y,y:p.x,z:p.z});
  }
  assert.deepEqual(adapter.docPointToModel(adapter.modelPointToDoc({x:2,y:3,z:4})),{x:2,y:3,z:4});
  assert.throws(()=>adapter.modelPointToDoc({x:NaN,y:0,z:0}));
});

test('bound environment and dataset metadata are detached and immutable across later changes',()=>{
  const input=copyDataset(),mutable=createLegacyGeometryAdapter(input),env={upstream:300};
  const context=mutable.bindEnvironment(env),origin={x:122,y:12.5,z:255.4},dir={x:0,y:1,z:0},settings={cellM:5,refineM:.5};
  const before=context.traceDoc(origin,dir,settings),terrainBefore=mutable.terrainAtDoc(0,0);
  env.upstream=260;input.spec.materials.concrete.density=999;input.spec.parameters.water_tail_level.value=999;
  input.spec.solids.length=0;input.terrainNear.values.fill(999);
  input.identity.dataset_version='mutated';
  mutable.bindEnvironment({upstream:260});
  assert.deepEqual(context.traceDoc(origin,dir,settings),before);
  assert.equal(mutable.terrainAtDoc(0,0),terrainBefore);
  assert.equal(context.environment.upstream,300);
  assert.equal(context.environment.downstream,adapter.defaultEnvironment.downstream);
  assert.deepEqual(context.identity,adapter.identity);
  assert.deepEqual(context.materials,adapter.materials);
  assert.throws(()=>{context.environment.upstream=260;},TypeError);
  assert.throws(()=>{context.materials.concrete.density=999;},TypeError);
  assert.throws(()=>{context.boundsDoc.min[0]=999;},TypeError);
});

test('trace settings and model-frame tracing share the bound dataset and legacy limits',()=>{
  const context=adapter.bindEnvironment({upstream:295}),h=dataset.terrainNear.header;
  const p={x:12.5,y:122,z:57.4},d={x:1,y:0,z:0},o=adapter.modelPointToDoc(p),settings={cellM:5,refineM:.5};
  assert.deepEqual(context.traceModel(p,d,settings),context.traceDoc(o,adapter.modelDirectionToDoc(d),settings));
  const boundsDoc={min:[h.origin[1],h.origin[0],150],max:[h.origin[1]+(h.shape[1]-1)*h.spacing[1],h.origin[0]+(h.shape[0]-1)*h.spacing[0],600]};
  assert.deepEqual(context.traceSettings(o,settings),{mainCellM:5,refineM:.5,boundsDoc,
    maximumRayDistanceM:Math.hypot(...[o.x,o.y,o.z].map((v,i)=>Math.max(Math.abs(v-boundsDoc.min[i]),Math.abs(v-boundsDoc.max[i]))))});
  assert.equal(context.maxDistanceM,500);
  assert.equal(context.backend,'legacy-dda@1.0.0');
});

test('unsupported datasets, coordinate conventions and downstream changes are rejected',()=>{
  assert.throws(()=>createLegacyGeometryAdapter({...dataset,geometry:{}}));
  assert.throws(()=>createLegacyGeometryAdapter({...dataset,spec:{...dataset.spec,schema_version:'0.7.0'}}));
  const altered=copyDataset();altered.spec.conventions.model_frame.transform_from_doc.matrix_3x4[0][3]=1;
  assert.throws(()=>createLegacyGeometryAdapter(altered));
  assert.throws(()=>adapter.bindEnvironment({upstream:NaN}));
  assert.throws(()=>adapter.bindEnvironment({upstream:null}));
  assert.throws(()=>adapter.bindEnvironment({rainfall:1}));
  assert.throws(()=>adapter.bindEnvironment({downstream:adapter.defaultEnvironment.downstream+1}));
});

test('adapter import closure has no renderer, UI, projection or cyclic dependencies',async()=>{
  const seen=new Set(),active=new Set();
  async function visit(url) {
    if(active.has(url.href))assert.fail('Circular geometry import: '+url.href);
    if(seen.has(url.href))return;active.add(url.href);
    const source=await readFile(url,'utf8');
    assert.doesNotMatch(source,/\bdocument\s*\.|\bwindow\s*\.|\bTHREE\b|from\s+['"]three/);
    for(const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      assert.match(match[1],/^\.\//);
      assert.doesNotMatch(match[1],/projection|response|contour|view|worker|app\.js/);
      await visit(new URL(match[1],url));
    }
    active.delete(url.href);seen.add(url.href);
  }
  await visit(new URL('../dist/modules/legacy-geometry-adapter.js',import.meta.url));
  const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/createGeometryKernel|createDdaRayTracer|density:7\.85|z:150|z:600/);
  const assessment=await readFile(new URL('../dist/modules/main-assessment.js',import.meta.url),'utf8');
  assert.match(assessment,/identity:geometryContext\.identity,materials:geometryContext\.materials/);
  assert.match(assessment,/traceSettings=geometryContext\.traceSettings/);
});
