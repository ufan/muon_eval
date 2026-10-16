import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeploymentState } from '../../dist/modules/deployment-state.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration } from '../../dist/modules/device-configuration.js';
import { createAssessmentController, createLocalAssessmentPort } from '../../dist/modules/assessment-controller.js';

const configuration=defaultDeviceConfiguration();
const station={id:'s1',name:'station',x:10,y:20,z:30,az:0,el:25},environment={level:295};

test('deployment owns immutable inputs independently of view state and saved caller objects',()=>{
 const initial={station:{...station},environment:{...environment}},state=createDeploymentState({stations:[initial.station],environment:initial.environment,configuration});
 initial.station.x=999;initial.environment.level=999;
 const snapshot=state.snapshot();assert.equal(snapshot.environment.level,295);assert.equal(snapshot.station.x,10);
 assert.throws(()=>state.device.width=999,TypeError);assert.throws(()=>state.candidates[0].x=999,TypeError);assert.throws(()=>state.environment.level=1,TypeError);
 state.updateStation('az',25);state.setEnvironment({level:300});state.addStation();state.configure({exposureDays:60});
 assert.equal(snapshot.station.az,station.az);assert.equal(snapshot.environment.level,295);assert.equal(state.environment.level,300);assert.equal(snapshot.response.exposureDays,30);
 assert.equal(state.snapshot().station.az,25);assert.equal(state.response.exposureDays,60);state.removeStation();assert.equal(state.candidates.length,1);
 assert.throws(()=>state.updateStation('x',NaN));assert.throws(()=>state.select(10));assert.throws(()=>state.replaceStations([]));
 assert.equal(configuration.response.exposureDays,30);
 // Plans need unique station ids (PLAN_FORMAT.md): an added station gets a fresh id and no candidate link.
 const plan=createDeploymentState({stations:[{...station,id:'a',candidateId:'a'},{...station,id:'station-2'}],environment,configuration});
 plan.addStation();assert.equal(plan.candidates.at(-1).id,'station-3');assert.equal(plan.candidates.at(-1).candidateId,null);assert.equal(plan.active,2);
 plan.select(0);plan.addStation();assert.equal(plan.candidates.at(-1).id,'station-4');
 // Device form clamping/fallbacks are deliberately preserved, not silently redefined.
 const adjusted=applyDeviceConfiguration(configuration,{width:10,strips:1,spacing:.2,systematicFraction:0,angularModel:'cos2'});
 assert.equal(adjusted.device.width,5);assert.equal(adjusted.device.stripsX,2);assert.equal(adjusted.device.baseline,.4);assert.equal(adjusted.response.systematicFraction,.03);
});

function clock(){let id=0;const pending=new Map();return{scheduler:{set(fn){pending.set(++id,fn);return id;},clear(key){pending.delete(key);}},step(){const next=pending.entries().next().value;if(!next)return false;pending.delete(next[0]);next[1]();return true;},
 // Results arrive through promises (ADR-006 port): let continuations run between scheduled batches.
 async drain(){let n=0;for(;;){await new Promise(r=>setImmediate(r));if(!this.step()){await new Promise(r=>setImmediate(r));if(!pending.size)return;continue;}if(n++>50)throw Error('Unbounded schedule');}},pending};}
const steppedAssessment=(seen=[])=>({createSession(input){seen.push(input.value);return{cloud:()=>null,quickMetrics:()=>null,projection(quality){let rows=0;return{advance(){return ++rows===2?{done:true,result:{value:input.value}}:{done:false,progress:.5};},complete:r=>({...r,quality})};}};}});
test('controller snapshots both passes, cancels superseded jobs and rejects stale callbacks',async()=>{
 const time=clock(),source={value:1},seen=[],published=[],failures=[],progress=[];
 const controller=createAssessmentController({assessment:steppedAssessment(seen),readInputs:()=>source,scheduler:time.scheduler,onResult:r=>published.push(r),onProgress:p=>progress.push(p.quality),onError:e=>failures.push(e)});
 controller.run();source.value=2;await time.drain();assert.deepEqual(published,[{value:1,quality:'preview'},{value:1,quality:'final'}]);assert.deepEqual(seen,[1]);assert.deepEqual([...new Set(progress)],['preview','final']);
 controller.run();const stale=[...time.pending.values()][0];source.value=3;controller.schedule();stale();await time.drain();assert.deepEqual(published.slice(2),[{value:3,quality:'preview'},{value:3,quality:'final'}]);
 controller.schedule();controller.dispose();await time.drain();assert.equal(published.length,4);assert.equal(failures.length,0);
});

test('the assessment port evaluates one quality as a cancellable promise',async()=>{
 const time=clock(),port=createLocalAssessmentPort(steppedAssessment(),{scheduler:time.scheduler}),session=port.open({value:7}),progress=[];
 const done=session.evaluate('final',{onProgress:p=>progress.push(p)});await time.drain();assert.deepEqual(await done,{value:7,quality:'final'});assert.deepEqual(progress,[.5]);
 const abort=new AbortController(),rejected=assert.rejects(session.evaluate('preview',{signal:abort.signal}),{name:'AbortError'});abort.abort();await rejected;
 await time.drain();assert.equal(time.pending.size,0);
 const aborted=new AbortController();aborted.abort();await assert.rejects(session.evaluate('preview',{signal:aborted.signal}),{name:'AbortError'});
 assert.throws(()=>session.evaluate('draft'),/quality/);
});

test('controller contains input/assessment failures and cannot restart after disposal',async()=>{
 const time=clock(),failures=[],controller=createAssessmentController({assessment:{createSession(){throw Error('backend unavailable');}},readInputs:()=>({}),scheduler:time.scheduler,onError:e=>failures.push(e.message)});
 controller.run();assert.deepEqual(failures,['backend unavailable']);assert.equal(time.pending.size,0);
 controller.dispose();controller.run();controller.schedule();assert.equal(time.pending.size,0);assert.equal(failures.length,1);
 const broken=createAssessmentController({assessment:{},readInputs(){throw Error('invalid inputs');},scheduler:time.scheduler,onError:e=>failures.push(e.message)});
 broken.run();assert.equal(failures.at(-1),'invalid inputs');assert.equal(time.pending.size,0);
 // A failing pass is reported once and leaves nothing scheduled.
 const failing=createAssessmentController({assessment:{createSession:()=>({cloud:()=>null,quickMetrics:()=>null,projection:()=>({advance(){throw Error('trace failed');}})})},readInputs:()=>({}),scheduler:time.scheduler,onError:e=>failures.push(e.message)});
 failing.run();await time.drain();assert.equal(failures.at(-1),'trace failed');assert.equal(time.pending.size,0);
});

test('major module import graph is acyclic and core/controller/state cannot import views or backends',async()=>{
 const root=new URL('../../dist/',import.meta.url),seen=new Set(),active=new Set();
 async function visit(url){assert.ok(!active.has(url.href),'Import cycle: '+url.href);if(seen.has(url.href))return;active.add(url.href);const source=await readFile(url,'utf8');for(const m of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))await visit(new URL(m[1],url));active.delete(url.href);seen.add(url.href);}
 await visit(new URL('app.js',root));
 for(const name of ['compiled-main-assessment','assessment-controller','deployment-state','device-configuration','detector-pose','recognition-layers','feature-layers','plan-format','plan-store','workspace-format','workspace-store','workspace-study','study-state','candidate-results']){
  const source=await readFile(new URL('modules/'+name+'.js',root),'utf8');assert.doesNotMatch(source,/\bdocument\b|\bwindow\b|localStorage|THREE|from\s*['"][^'"]*(?:view|main-page|three|compiled-mesh-runtime)/);
 }
 const entry=await readFile(new URL('app.js',root),'utf8');assert.ok(entry.split('\n').length<40);assert.doesNotMatch(entry,/new THREE|traceRayModel|createProjectionPass|addEventListener|localStorage/);
 const compiledScene=await readFile(new URL('modules/compiled-scene-view.js',root),'utf8');assert.doesNotMatch(compiledScene,/traceRayModel|classifyModel|muon-response|compiled-assessment|detector-projection/);
 const page=await readFile(new URL('modules/main-page.js',root),'utf8');assert.doesNotMatch(page,/THREE|createProjectionPass|minimumMuonEnergy|setTimeout|projectionJob|fluxCache/);
});
