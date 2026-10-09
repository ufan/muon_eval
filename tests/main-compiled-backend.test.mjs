import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRegisteredDataset, readJson, registryUrl } from '../scripts/dataset-fixture.mjs';
import { resolveApplicationSelection, applicationSelectionSearch } from '../dist/modules/application-selection.js';
import { createApplicationBackend } from '../dist/modules/application-backends.js';
import { createDeploymentState } from '../dist/modules/deployment-state.js';
import { createCompiledMainAssessment, enclosingCompiledRayLength } from '../dist/modules/compiled-main-assessment.js';
import { evaluateCompiledAssessment, createCompiledAssessmentPass } from '../dist/modules/compiled-assessment.js';
import { defaultDeviceConfiguration } from '../dist/modules/device-configuration.js';

const registry=await readJson(registryUrl),release='zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset=await loadRegisteredDataset(release),configuration=defaultDeviceConfiguration();
test('release/backend/scenario selection is explicit, compatible and round-trippable',()=>{
 const legacy=resolveApplicationSelection(registry);assert.equal(legacy.backend,'legacy');assert.equal(legacy.datasetId,registry.default_dataset);
 const compiled=resolveApplicationSelection(registry,'?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=high');
 assert.deepEqual(resolveApplicationSelection(registry,applicationSelectionSearch(compiled)),compiled);
 for(const search of ['?dataset=missing','?backend=compiled','?scenario=low','?backend=unknown','?dataset=','?backend=legacy&backend=compiled',`?dataset=${encodeURIComponent(release)}&backend=legacy`])assert.throws(()=>resolveApplicationSelection(registry,search));
});

test('main backend binds all published frozen scenarios to the existing exact assessment',async()=>{
 for(const scenarioId of dataset.geometry.scenarios.keys()){
  const backend=await createApplicationBackend(dataset,{datasetId:release,backend:'compiled',scenarioId});
  assert.equal(backend.selection.scenarioId,scenarioId);assert.deepEqual(backend.environment,dataset.geometry.scenarios.get(scenarioId).variables);
  assert.deepEqual([backend.stations[0].x,backend.stations[0].y,backend.stations[0].z],dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position));
  assert.equal(backend.stations[0].binding,false);assert.equal(backend.capabilities.continuousWater,false);assert.equal(backend.capabilities.targetSignificance,false);
  const state=createDeploymentState({stations:backend.stations,environment:backend.environment,configuration});
  state.updateStation('az',180);state.updateStation('el',30);const captured=state.snapshot(),session=backend.assessment.createSession(captured);
  captured.station.az=90;captured.response.exposureDays=60;captured.environment.water_up_level=999;
  const origin=[state.candidates[0].x,state.candidates[0].y,state.candidates[0].z],length=enclosingCompiledRayLength(origin,backend.runtime.bounds);
  for(const quality of ['preview','final']){
   const work=session.projection(quality);let step;do{step=work.advance(3);}while(!step.done);const actual=work.complete(step.result);
   const expected=await evaluateCompiledAssessment(backend.runtime,{origin,azimuthDeg:180,elevationDeg:30,bins:quality==='preview'?25:65,length},state.device,state.response);
   assert.deepEqual(actual.patternResult,expected);assert.equal(actual.total,expected.totalCount);assert.equal(actual.weightedTransmission,expected.weightedTransmission);
   assert.equal(actual.patternResult.scenarioId,scenarioId);assert.equal(actual.patternResult.frame,'model_frame');assert.equal(actual.patternResult.projectionGeometry.assetIdentity.glbSha256,backend.runtime.projectionGeometry.assetIdentity.glbSha256);
   assert.ok(actual.values[0].dir.z!==undefined);assert.ok(actual.values[0].q.segments);assert.ok(actual.values.every(pixel=>!pixel.q.counterfactualMwe));
   assert.throws(()=>session.ensureTargetSignificance(actual,'dam'),/unavailable/);
  }
  const ray=session.centralRay(),plan=backend.exportPlan(state.snapshot(),ray,state.candidates);
  assert.equal(plan.schemaVersion,'0.1.0');assert.equal(plan.scenarioId,scenarioId);assert.equal(plan.activeRay.mwe,ray.mwe);assert.deepEqual(plan.variables,backend.runtime.variables);
  assert.deepEqual(plan.activeRay.station,state.snapshot().station);assert.equal(plan.trace.maximumDistanceM,length);
  const changed=state.snapshot();changed.environment.water_up_level+=1;assert.throws(()=>backend.assessment.createSession(changed),/frozen/);
  changed.environment={...state.environment,upstream:295};assert.throws(()=>backend.assessment.createSession(changed),/frozen/);
  assert.equal(session.cloud(),null);assert.equal(session.quickMetrics(),null);
 }
});

test('invalid scenario/backend combinations cannot fall back to legacy or another scenario',async()=>{
 await assert.rejects(createApplicationBackend(dataset,{datasetId:release,backend:'legacy',scenarioId:null}),/legacy/);
 await assert.rejects(createApplicationBackend(dataset,{datasetId:release,backend:'compiled',scenarioId:'not-published'}),/Unknown compiled scenario/);
 await assert.rejects(createApplicationBackend(dataset,{datasetId:'wrong',backend:'compiled',scenarioId:'low'}),/differs/);
 const legacyDataset=await loadRegisteredDataset();await assert.rejects(createApplicationBackend(legacyDataset,{datasetId:legacyDataset.id,backend:'compiled',scenarioId:'low'}),/compiled/);
 const legacy=await createApplicationBackend(legacyDataset,resolveApplicationSelection(registry));assert.equal(legacy.capabilities.continuousWater,true);assert.equal(legacy.capabilities.targetSignificance,true);
});

test('finite mesh ray extent encloses every corner and fails instead of truncating an oversized domain',()=>{
 const origin=[3,-5,2],bounds={min:[-2,-3,-4],max:[6,7,8]},length=enclosingCompiledRayLength(origin,bounds);
 for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])assert.ok(Math.hypot(x-origin[0],y-origin[1],z-origin[2])<=length);
 assert.throws(()=>enclosingCompiledRayLength(origin,{min:[-20000,0,0],max:[20000,0,0]}),/exceeds/);
 assert.throws(()=>enclosingCompiledRayLength([NaN,0,0],bounds),/Invalid/);
});

test('shared compiled batched pass rejects invalid device settings and preserves cancellation boundary',async()=>{
 const backend=await createApplicationBackend(dataset,{datasetId:release,backend:'compiled',scenarioId:'low'}),station=backend.stations[0];
 const service=createCompiledMainAssessment({runtime:backend.runtime}),input={station,environment:backend.environment,...configuration};
 const bad=structuredClone(input);bad.device.stripsY=128;assert.throws(()=>service.createSession(bad).projection('final'),/device/);
 const config={origin:[station.x,station.y,station.z],azimuthDeg:0,elevationDeg:25,bins:25,length:500};
 assert.throws(()=>createCompiledAssessmentPass(backend.runtime,config,{...input.device,layers:4},input.response),/device/);
 const controller=new AbortController();await assert.rejects(evaluateCompiledAssessment(backend.runtime,config,input.device,input.response,{signal:controller.signal,yieldTask:()=>controller.abort()}),{name:'AbortError'});
 const source=await readFile(new URL('../dist/modules/compiled-main-assessment.js',import.meta.url),'utf8');assert.doesNotMatch(source,/legacy-target|legacy-pattern|from\s*['"][^'"]*(?:view|compiled-mesh-runtime|geometry-kernel)|\bdocument\b|\bwindow\b|THREE/);
});
