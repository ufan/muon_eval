import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDdaRayTracer } from '../dist/modules/dda-ray-tracer.js';
import { createGeometryKernel } from '../dist/modules/geometry-kernel.js';
import { createLegacyGeometryAdapter } from '../dist/modules/legacy-geometry-adapter.js';
import { createProjectionPass } from '../dist/modules/detector-projection.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../dist/modules/detector-defaults.js';
import { loadRegisteredDataset, readJson } from '../scripts/dataset-fixture.mjs';
import { createLegacyTraceBaseline } from './fixtures/legacy-trace-baseline.mjs';

const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2'), spec = dataset.spec;
const kernel = createGeometryKernel({spec, terrainNear:dataset.terrainNear, terrainFar:dataset.terrainFar});
const h = dataset.terrainNear.header;
const bounds = {min:{x:h.origin[1],y:h.origin[0],z:150},max:{x:h.origin[1]+(h.shape[1]-1)*h.spacing[1],y:h.origin[0]+(h.shape[0]-1)*h.spacing[0],z:600}};
const targetIds = ['elevator','spillway','platform','water','dam','gallery'];
const densities = {concrete:spec.materials.concrete.density,water:spec.materials.water.density,rock:spec.materials.rock.density,steel:spec.materials.steel?.density??7.85,air:0};
const classifyPoint = (x,y,z,environment) => {
  const q = kernel.classifyDoc(x,y,z,environment.upstream);
  return {kind:q.material,targets:q.targets};
};
const trace = createDdaRayTracer({bounds,densities,targetIds,classifyPoint,maxDistanceM:500});
const adapter = createLegacyGeometryAdapter(dataset);
const environment = {upstream:spec.parameters.water_up_level.value};
const baseline = env => createLegacyTraceBaseline({dataset,spec,classifyPoint:(x,y,z)=>classifyPoint(x,y,z,env)});
const direction = (x,y,z) => {const n=Math.hypot(x,y,z);return{x:x/n,y:y/n,z:z/n};};

test('legacy DDA matches every recorded real-data ray, including cells and target lengths', async () => {
  const reference = await readJson(new URL(dataset.entry.conformance.rays, dataset.base));
  const env = {upstream:reference.water_up_level}, old = baseline(env), context = adapter.bindEnvironment(env);
  for (const ray of reference.rays) {
    const origin={x:ray.origin[1],y:ray.origin[0],z:ray.origin[2]+198};
    // Recorded directions are rounded to six decimals; the UI normalizes directions.
    const dir=direction(ray.dir[1],ray.dir[0],ray.dir[2]);
    const expected=old(origin,dir);
    assert.deepEqual(trace(origin,dir,{cellM:5,refineM:.5,environment:env}),expected);
    assert.deepEqual(context.traceDoc(origin,dir,{cellM:5,refineM:.5}),expected);
  }
});

test('axis, reversed, tied-grid, near-parallel, inside, boundary and miss rays retain exact legacy behavior', () => {
  const origins=[{x:0,y:0,z:250},bounds.min,bounds.max,{x:bounds.min.x-10,y:bounds.min.y-10,z:149}];
  const dirs=[direction(1,0,0),direction(-1,0,0),direction(0,1,0),direction(0,0,1),direction(1,1,1),direction(1e-10,1,-.2)];
  for(const upstream of [spec.parameters.water_up_level.value,250,305]) {
    const env={upstream},old=baseline(env),context=adapter.bindEnvironment(env);
    for(const origin of origins)for(const dir of dirs)for(const refineM of [.5,1.5]) {
      assert.deepEqual(trace(origin,dir,{cellM:5,refineM,environment:env}),old(origin,dir,5,refineM));
      assert.deepEqual(context.traceDoc(origin,dir,{cellM:5,refineM}),old(origin,dir,5,refineM));
    }
  }
});

test('25/65-bin full projections retain paths, columns, counts, transmission and smoothing', () => {
  const device=defaultAssessmentDevice(),response=defaultAssessmentResponse();
  const origin={x:100,y:40,z:210},old=baseline(environment);
  const run=(tracer,n) => {
    const pass=createProjectionPass({n,device,response,sampleRay:(sx,sy)=>{
      const dir=direction(1,sx,.6+sy);
      return{dir,q:tracer(origin,dir,n===25?1.5:.5)};
    }});
    let state;do{state=pass.advance(3);}while(!state.done);return state.result;
  };
  const context=adapter.bindEnvironment(environment);
  for(const n of [25,65]) {
    const expected=run((o,d,r)=>old(o,d,5,r),n);
    assert.deepEqual(run((o,d,r)=>trace(o,d,{cellM:5,refineM:r,environment}),n),expected);
    assert.deepEqual(run((o,d,r)=>context.traceDoc(o,d,{cellM:5,refineM:r}),n),expected);
  }
});

test('configuration is detached, environment is explicit and caller vectors remain unchanged', () => {
  const b={min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},rho={stone:2,air:0},ids=['region'];
  const tracer=createDdaRayTracer({bounds:b,densities:rho,targetIds:ids,maxDistanceM:20,
    classifyPoint:(x,y,z,env)=>({kind:env.filled?'stone':'air',targets:new Set(['region'])})});
  b.max.x=1;rho.stone=100;ids.length=0;
  const origin=Object.freeze({x:-1,y:5,z:5}),dir=Object.freeze({x:1,y:0,z:0});
  const a=tracer(origin,dir,{cellM:5,refineM:.5,environment:Object.freeze({filled:true})});
  assert.ok(Math.abs(a.totals.stone-(10-1e-6))<1e-12);assert.equal(a.mwe,a.totals.stone*2);
  assert.equal(a.targetLengths.region,a.totals.stone);
  assert.equal(tracer(origin,dir,{cellM:5,refineM:.5,environment:{filled:false}}).mwe,0);
});

test('invalid geometry inputs and undeclared classifier output fail explicitly', () => {
  const config={bounds:{min:{x:0,y:0,z:0},max:{x:10,y:10,z:10}},densities:{air:0},targetIds:[],maxDistanceM:20,classifyPoint:()=>({kind:'air',targets:[]})};
  const tracer=createDdaRayTracer(config),origin={x:1,y:1,z:1},dir={x:1,y:0,z:0};
  for(const options of [{cellM:0,refineM:.5},{cellM:5,refineM:NaN}])assert.throws(()=>tracer(origin,dir,options));
  assert.throws(()=>tracer(origin,{x:2,y:0,z:0},{cellM:5,refineM:.5}));
  assert.throws(()=>createDdaRayTracer({...config,densities:{air:-1}}));
  assert.throws(()=>createDdaRayTracer({...config,classifyPoint:()=>({kind:'unknown',targets:[]})})(origin,dir,{cellM:5,refineM:.5}));
});

test('dependency boundaries prohibit geometry-to-projection/UI imports and preserve main wiring', async () => {
  const core=await readFile(new URL('../dist/modules/dda-ray-tracer.js',import.meta.url),'utf8');
  assert.doesNotMatch(core,/\bimport\s|\bimport\(|\bdocument\b|\bwindow\b|THREE|three\//);
  const projection=await readFile(new URL('../dist/modules/detector-projection.js',import.meta.url),'utf8');
  assert.doesNotMatch(projection,/from\s+['"][^'"]*(dda-ray-tracer|geometry-kernel|compiled-mesh-runtime|three)/);
  const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.match(app,/createApplicationBackend\(dataset,selection\)/);
  const backends=await readFile(new URL('../dist/modules/application-backends.js',import.meta.url),'utf8');
  assert.match(backends,/legacyGeometry = createLegacyGeometryAdapter\(dataset\)/);
  const assessment=await readFile(new URL('../dist/modules/main-assessment.js',import.meta.url),'utf8');
  assert.match(assessment,/q:interpretTargets\(traceRay\(dir,TRACE.mainCell,refine\)\)/);
  assert.doesNotMatch(app,/function rayBox\(/);
  assert.doesNotMatch(app,/guard\+\+<10000/);
});
