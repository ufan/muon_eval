import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLegacyTargetInterpreter, evaluateLegacyTargetSignificance } from '../dist/modules/legacy-target-interpretation.js';
import { createLegacyGeometryAdapter } from '../dist/modules/legacy-geometry-adapter.js';
import { createProjectionPass, nativeAxisBins } from '../dist/modules/detector-projection.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../dist/modules/detector-defaults.js';
import { integratedSurfaceFlux } from '../dist/modules/muon-response.js';
import { loadRegisteredDataset, readJson } from '../scripts/dataset-fixture.mjs';
import { legacyTargetBaseline, legacyTargetSignificance } from './fixtures/legacy-target-baseline.mjs';

const dataset=await loadRegisteredDataset(),adapter=createLegacyGeometryAdapter(dataset);
const ids=adapter.targetIds,materials=adapter.materials;
const interpret=createLegacyTargetInterpreter({materials,targetIds:ids});
const normalize=(x,y,z)=>{const n=Math.sqrt(x*x+y*y+z*z);return{x:x/n,y:y/n,z:z/n};};
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const synthetic=cells=>({totals:{concrete:4,water:2,rock:1,steel:0,air:3},mwe:5,cells,
  targetLengths:Object.fromEntries(ids.map(id=>[id,.2]))});

test('exclusion, mask equality, overlapping targets, water removal, filling and clamping match frozen semantics',()=>{
  const cells=[{t0:1,t1:3,kind:'concrete',targets:['gallery']},
    {t0:2,t1:4,kind:'air',targets:['gallery','elevator']},
    {t0:4,t1:9,kind:'concrete',targets:['gallery','dam','water']},
    {t0:9,t1:12,kind:'rock',targets:['platform']},
    {t0:12,t1:14,kind:'steel',targets:['spillway']}];
  const input=synthetic(cells);input.targetLengths.elevator=.15;input.targetLengths.spillway=0;
  const original=structuredClone(input);freeze(input);
  const output=interpret(input);
  assert.deepEqual(output,legacyTargetBaseline(input,materials,ids));assert.deepEqual(input,original);
  assert.equal(output.targetMask.elevator,false);assert.equal(output.targetMask.gallery,true);
  assert.equal(output.edgeProfile.firstDense,1);assert.equal(output.edgeProfile.firstConcrete,1);
  assert.equal(output.edgeProfile.targetEntry.gallery,2);
  assert.equal(output.counterfactualMwe.gallery,0);assert.equal(output.counterfactualMwe.water,0);
  assert.equal(output.counterfactualMwe.dam,5);
  const absent=interpret(synthetic([]));assert.equal(absent.edgeProfile.firstDense,Infinity);
  assert.ok(ids.every(id=>absent.edgeProfile.targetEntry[id]===Infinity));
});

test('density/ID settings detach from caller and malformed trace inputs fail explicitly',()=>{
  const registry=structuredClone(materials),targetIds=[...ids],bound=createLegacyTargetInterpreter({materials:registry,targetIds});
  registry.concrete.density=999;targetIds.length=0;
  const input=synthetic([{t0:2,t1:3,kind:'air',targets:['gallery']}]);
  assert.deepEqual(bound(input),legacyTargetBaseline(input,materials,ids));
  assert.throws(()=>interpret({...input,mwe:NaN}));
  assert.throws(()=>interpret(synthetic([{t0:3,t1:2,kind:'air',targets:[]}])));
  assert.throws(()=>interpret(synthetic([{t0:2,t1:3,kind:'air',targets:['invented']}])));
  assert.throws(()=>createLegacyTargetInterpreter({materials:{water:{density:NaN},concrete:{density:2}},targetIds:ids}));
});

test('all real reference rays retain entry depths, masks and counterfactual columns at multiple water levels',async()=>{
  const reference=await readJson(new URL(dataset.entry.conformance.rays,dataset.base));
  for(const upstream of [reference.water_up_level,295]) {
    const context=adapter.bindEnvironment({upstream});
    for(const ray of reference.rays) {
      const origin={x:ray.origin[1],y:ray.origin[0],z:ray.origin[2]+198},dir=normalize(ray.dir[1],ray.dir[0],ray.dir[2]);
      const trace=context.traceDoc(origin,dir,{cellM:5,refineM:.5});
      assert.deepEqual(interpret(trace),legacyTargetBaseline(trace,materials,ids));
    }
  }
});

test('complete 25/65 projections and every target significance retain exact frozen results',()=>{
  const device=defaultAssessmentDevice(),response=defaultAssessmentResponse(),context=adapter.bindEnvironment({upstream:295});
  const origin={x:122,y:12.5,z:255.4};
  for(const n of [25,65]) {
    const bins=nativeAxisBins(n,device),rays=[];
    for(const by of bins)for(const bx of bins){const dir=normalize(bx.slope,1,.4+by.slope);
      rays.push({dir,trace:context.traceDoc(origin,dir,{cellM:5,refineM:n===25?1.5:.5})});}
    function run(derive,significance) {
      const cache=new Map(),flux=(z,e)=>integratedSurfaceFlux(z,e,response.angularModel,cache);let index=0;
      const pass=createProjectionPass({n,device,response,flux,includeContext:true,sampleRay:()=>{const {dir,trace}=rays[index++];return{dir,q:derive(trace)};}});
      let state;do{state=pass.advance(3);}while(!state.done);
      for(const pixel of state.result.values)for(const id of ids)pixel.sigByTarget[id]=significance(pixel,id,{flux,systematicFraction:response.systematicFraction});
      return{result:state.result,cache};
    }
    assert.deepEqual(run(interpret,evaluateLegacyTargetSignificance),run(q=>legacyTargetBaseline(q,materials,ids),legacyTargetSignificance));
  }
});

test('absent and dam targets bypass flux; significance never mutates scientific fields',()=>{
  const q=interpret(synthetic([{t0:2,t1:3,kind:'air',targets:['gallery']}]));q.targetMask.water=false;
  const pixel=freeze({q,dir:{z:.5},count:10,factor:2}),before=structuredClone(pixel);
  const unused=()=>assert.fail('Flux must not run');
  assert.equal(evaluateLegacyTargetSignificance(pixel,'water',{flux:unused,systematicFraction:.03}),0);
  assert.equal(evaluateLegacyTargetSignificance(pixel,'dam',{flux:unused,systematicFraction:.03}),0);
  const flux=(z,e)=>z/(1+e);
  assert.equal(evaluateLegacyTargetSignificance(pixel,'gallery',{flux,systematicFraction:.03}),legacyTargetSignificance(pixel,'gallery',{flux,systematicFraction:.03}));
  assert.deepEqual(pixel,before);
});

test('target interpretation has no geometry/UI/renderer dependency and UI only orchestrates calls',async()=>{
  const source=await readFile(new URL('../dist/modules/legacy-target-interpretation.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bdocument\s*\.|\bwindow\s*\.|THREE|geometryContext|from\s+['"][^'"]*(geometry|projection|view|three)/);
  const imports=[...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m=>m[1]);
  assert.deepEqual(imports,['./muon-response.js']);
  const app=await readFile(new URL('../dist/modules/main-assessment.js',import.meta.url),'utf8');
  assert.match(app,/targetIds:geometryContext\.targetIds/);
  assert.match(app,/evaluateLegacyTargetSignificance\(v,id/);
  assert.doesNotMatch(app,/q\.t0<2|trace\.targetLengths\[k\]>\.15|delta\[id\]/);
});
