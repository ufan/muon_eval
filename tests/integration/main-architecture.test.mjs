import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3, MathUtils } from '../../dist/vendor/three/three.core.js';
import { createDeploymentState } from '../../dist/modules/deployment-state.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration } from '../../dist/modules/device-configuration.js';
import { directionModel, directionDoc, directionFromSlopes } from '../../dist/modules/detector-pose.js';
import { createMainAssessment } from '../../dist/modules/main-assessment.js';
import { createAssessmentController } from '../../dist/modules/assessment-controller.js';
import { createLegacyGeometryAdapter } from '../../dist/modules/legacy-geometry-adapter.js';
import { legacyDefaultStations } from '../../dist/modules/legacy-deployment-adapter.js';
import { createProjectionPass } from '../../dist/modules/detector-projection.js';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { legacyCalculationBaseline } from '../fixtures/legacy-calculation-baseline.mjs';
import { legacyTargetBaseline, legacyTargetSignificance } from '../fixtures/legacy-target-baseline.mjs';

const dataset=await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2'),geometry=createLegacyGeometryAdapter(dataset);
const stations=legacyDefaultStations(dataset,geometry),configuration=defaultDeviceConfiguration();
const input=()=>({station:{...stations[0]},...structuredClone(configuration),environment:{upstream:295}});
function oldDirection(c,sx,sy){const az=MathUtils.degToRad(c.az),el=MathUtils.degToRad(c.el),center=new Vector3(Math.cos(el)*Math.cos(az),Math.cos(el)*Math.sin(az),Math.sin(el)).normalize(),right=new Vector3(-Math.sin(az),Math.cos(az),0),up=new Vector3(-Math.sin(el)*Math.cos(az),-Math.sin(el)*Math.sin(az),Math.cos(el));const d=center.addScaledVector(right,sx).addScaledVector(up,sy).normalize();return new Vector3(d.y,d.x,d.z).normalize();}
const plain=v=>({x:v.x,y:v.y,z:v.z});

test('plain detector directions retain exact legacy Vector3 arithmetic at varied poses',()=>{
 for(const az of [0,2,25,90,220,345,359])for(const el of [0,18,25,42,90])for(const [sx,sy] of [[0,0],[-1.3,.2],[.7,-.9]]){
  const c={az,el};assert.deepEqual(directionFromSlopes(c,sx,sy,geometry),plain(oldDirection(c,sx,sy)));
  const d=directionModel(c);assert.ok(Math.abs(d.x*d.x+d.y*d.y+d.z*d.z-1)<1e-14);
  assert.deepEqual(directionDoc(c,geometry),plain(new Vector3(d.y,d.x,d.z).normalize()));
 }
});

test('deployment owns immutable inputs independently of view state and saved caller objects',()=>{
 const initial=input(),state=createDeploymentState({stations:[initial.station],environment:initial.environment,configuration});
 initial.station.x=999;initial.environment.upstream=999;
 const snapshot=state.snapshot();assert.equal(snapshot.environment.upstream,295);
 assert.throws(()=>state.device.width=999,TypeError);assert.throws(()=>state.candidates[0].x=999,TypeError);
 state.updateStation('az',25);state.setEnvironment({upstream:300});state.addStation();state.configure({exposureDays:60});
 assert.equal(snapshot.station.az,stations[0].az);assert.equal(snapshot.environment.upstream,295);assert.equal(snapshot.response.exposureDays,30);
 assert.equal(state.snapshot().station.az,25);assert.equal(state.response.exposureDays,60);state.removeStation();assert.equal(state.candidates.length,1);
 assert.throws(()=>state.updateStation('x',NaN));assert.throws(()=>state.select(10));assert.throws(()=>state.replaceStations([]));
 assert.equal(configuration.response.exposureDays,30);
 // Legacy form clamping/fallbacks are deliberately preserved, not silently redefined.
 const adjusted=applyDeviceConfiguration(configuration,{width:10,strips:1,spacing:.2,systematicFraction:0,angularModel:'cos2'});
 assert.equal(adjusted.device.width,5);assert.equal(adjusted.device.stripsX,2);assert.equal(adjusted.device.baseline,.4);assert.equal(adjusted.response.systematicFraction,.03);
});

test('whole assessment retains ordered cloud/quick/projection flux calls and exact 25/65 results',()=>{
 const captured=input(),context=geometry.bindEnvironment(captured.environment),origin=context.modelPointToDoc(captured.station),legacy=legacyCalculationBaseline(captured.device,captured.response);
 const caller=structuredClone(captured),session=createMainAssessment({geometry}).createSession(caller);
 caller.station.az=90;caller.device.width=4;caller.response.exposureDays=60;caller.environment.upstream=305;
 const flux=legacy.integratedSurfaceFlux,reference=flux(1,1),cloud={n:17,samples:[],sumThrough:0,sumOpen:0};
 for(let y=0;y<17;y++)for(let x=0;x<17;x++){
  const sx=(x-8)/8*captured.device.maxSlopeX*.94,sy=(y-8)/8*captured.device.maxSlopeY*.94,acceptance=Math.max(0,1-Math.abs(sx)/captured.device.maxSlopeX)*Math.max(0,1-Math.abs(sy)/captured.device.maxSlopeY),dirDoc=plain(oldDirection(captured.station,sx,sy)),trace=context.traceDoc(origin,dirDoc,{cellM:5,refineM:.5}),open=flux(dirDoc.z,1),through=flux(dirDoc.z,legacy.minimumMuonEnergy(trace.mwe));
  cloud.sumThrough+=acceptance*through;cloud.sumOpen+=acceptance*open;cloud.samples.push({dirDoc,transmission:open>0?through/open:0,contribution:acceptance*through/reference});
 }
 assert.deepEqual(session.cloud(),cloud);
 const samples=[];for(let y=0;y<9;y++)for(let x=0;x<9;x++){const sx=(x-4)/4*captured.device.maxSlopeX*.94,sy=(y-4)/4*captured.device.maxSlopeY*.94,dir=plain(oldDirection(captured.station,sx,sy)),trace=context.traceDoc(origin,dir,{cellM:5,refineM:.5}),weight=Math.max(0,1-Math.abs(sx)/captured.device.maxSlopeX)*Math.max(0,1-Math.abs(sy)/captured.device.maxSlopeY);samples.push({trace,dir,weight});}
 let openSum=0,throughSum=0;for(const s of samples){openSum+=s.weight*flux(s.dir.z,1);throughSum+=s.weight*flux(s.dir.z,legacy.minimumMuonEnergy(s.trace.mwe));}
 const quick=session.quickMetrics();assert.deepEqual(quick.center,samples[40].trace);assert.equal(quick.weightedTransmission,throughSum/openSum);
 assert.equal(quick.count,Math.round(12000*Math.max(.05,Math.sin(Math.max(0,MathUtils.degToRad(captured.station.el))))**1.7*(throughSum/openSum)));
 for(const quality of ['preview','final']){
  const n=quality==='preview'?25:65,refine=quality==='preview'?1.5:.5;
  const baseline=createProjectionPass({n,device:captured.device,response:captured.response,flux,includeContext:true,sampleRay:(sx,sy)=>{const dir=plain(oldDirection(captured.station,sx,sy));return{dir,q:legacyTargetBaseline(context.traceDoc(origin,dir,{cellM:5,refineM:refine}),context.materials,context.targetIds)};}});
  const work=session.projection(quality);let expected,actual;do{expected=baseline.advance(3);}while(!expected.done);do{actual=work.advance(3);}while(!actual.done);
  assert.deepEqual(actual.result,expected.result);
  const published=work.complete(actual.result);assert.equal(published.patternResult.variables.upstream,295);
  if(quality==='final')for(const id of context.targetIds){session.ensureTargetSignificance(published,id);for(let i=0;i<published.values.length;i++)assert.equal(published.values[i].sigByTarget[id],legacyTargetSignificance(expected.result.values[i],id,{flux,systematicFraction:captured.response.systematicFraction}));}
 }
});

function clock(){let id=0;const pending=new Map();return{scheduler:{set(fn){pending.set(++id,fn);return id;},clear(key){pending.delete(key);}},step(){const next=pending.entries().next().value;if(!next)return false;pending.delete(next[0]);next[1]();return true;},drain(){let n=0;while(this.step())if(n++>50)throw Error('Unbounded scheduling');},pending};}
test('controller snapshots both passes, cancels superseded jobs and rejects stale callbacks',()=>{
 const time=clock(),source={value:1},seen=[],published=[],failures=[];
 const assessment={createSession(input){seen.push(input.value);return{cloud:()=>({}),quickMetrics:()=>({}),projection(quality){let rows=0;return{advance(){return ++rows===2?{done:true,result:{value:input.value}}:{done:false,progress:.5};},complete:r=>({...r,quality})};},ensureTargetSignificance(){}};}};
 const controller=createAssessmentController({assessment,readInputs:()=>source,scheduler:time.scheduler,onResult:r=>published.push(r),onError:e=>failures.push(e)});
 controller.run();source.value=2;time.drain();assert.deepEqual(published,[{value:1,quality:'preview'},{value:1,quality:'final'}]);assert.deepEqual(seen,[1]);
 controller.run();const stale=[...time.pending.values()][0];source.value=3;controller.schedule();stale();time.drain();assert.deepEqual(published.slice(2),[{value:3,quality:'preview'},{value:3,quality:'final'}]);
 controller.schedule();controller.dispose();time.drain();assert.equal(published.length,4);assert.equal(failures.length,0);
});

test('controller contains input/assessment failures and cannot restart after disposal',()=>{
 const time=clock(),failures=[],controller=createAssessmentController({assessment:{createSession(){throw Error('backend unavailable');}},readInputs:()=>({}),scheduler:time.scheduler,onError:e=>failures.push(e.message)});
 controller.run();assert.deepEqual(failures,['backend unavailable']);assert.equal(time.pending.size,0);
 controller.dispose();controller.run();controller.schedule();assert.equal(time.pending.size,0);assert.equal(failures.length,1);
 const broken=createAssessmentController({assessment:{},readInputs(){throw Error('invalid inputs');},scheduler:time.scheduler,onError:e=>failures.push(e.message)});
 broken.run();assert.equal(failures.at(-1),'invalid inputs');assert.equal(time.pending.size,0);
});

test('major module import graph is acyclic and core/controller/state cannot import views or backends',async()=>{
 const root=new URL('../../dist/',import.meta.url),seen=new Set(),active=new Set();
 async function visit(url){assert.ok(!active.has(url.href),'Import cycle: '+url.href);if(seen.has(url.href))return;active.add(url.href);const source=await readFile(url,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))await visit(new URL(m[1],url));active.delete(url.href);seen.add(url.href);}
 await visit(new URL('app.js',root));
 for(const name of ['main-assessment','compiled-main-assessment','assessment-controller','deployment-state','device-configuration','detector-pose']){
  const source=await readFile(new URL('modules/'+name+'.js',root),'utf8');assert.doesNotMatch(source,/\bdocument\b|\bwindow\b|localStorage|THREE|from\s*['"][^'"]*(?:view|main-page|three|geometry-kernel|dda-ray-tracer|compiled-mesh-runtime)/);
 }
 const entry=await readFile(new URL('app.js',root),'utf8');assert.ok(entry.split('\n').length<40);assert.doesNotMatch(entry,/new THREE|traceDoc|createProjectionPass|addEventListener|localStorage/);
 const scene=await readFile(new URL('modules/legacy-scene-view.js',root),'utf8');assert.doesNotMatch(scene,/traceDoc|classifyDoc|muon-response|main-assessment|detector-projection/);
 const compiledScene=await readFile(new URL('modules/compiled-scene-view.js',root),'utf8');assert.doesNotMatch(compiledScene,/traceRayModel|classifyModel|muon-response|compiled-assessment|detector-projection/);
 const page=await readFile(new URL('modules/main-page.js',root),'utf8');assert.doesNotMatch(page,/THREE|createProjectionPass|minimumMuonEnergy|setTimeout|projectionJob|fluxCache/);
});
