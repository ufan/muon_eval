import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeploymentState } from '../../dist/modules/deployment-state.js';
import { defaultDeviceConfiguration, applyDeviceConfiguration } from '../../dist/modules/device-configuration.js';
import { createAssessmentController } from '../../dist/modules/assessment-controller.js';

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
 // Device form clamping/fallbacks are deliberately preserved, not silently redefined.
 const adjusted=applyDeviceConfiguration(configuration,{width:10,strips:1,spacing:.2,systematicFraction:0,angularModel:'cos2'});
 assert.equal(adjusted.device.width,5);assert.equal(adjusted.device.stripsX,2);assert.equal(adjusted.device.baseline,.4);assert.equal(adjusted.response.systematicFraction,.03);
});

function clock(){let id=0;const pending=new Map();return{scheduler:{set(fn){pending.set(++id,fn);return id;},clear(key){pending.delete(key);}},step(){const next=pending.entries().next().value;if(!next)return false;pending.delete(next[0]);next[1]();return true;},drain(){let n=0;while(this.step())if(n++>50)throw Error('Unbounded scheduling');},pending};}
test('controller snapshots both passes, cancels superseded jobs and rejects stale callbacks',()=>{
 const time=clock(),source={value:1},seen=[],published=[],failures=[];
 const assessment={createSession(input){seen.push(input.value);return{cloud:()=>null,quickMetrics:()=>null,projection(quality){let rows=0;return{advance(){return ++rows===2?{done:true,result:{value:input.value}}:{done:false,progress:.5};},complete:r=>({...r,quality})};}};}};
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
 for(const name of ['compiled-main-assessment','assessment-controller','deployment-state','device-configuration','detector-pose']){
  const source=await readFile(new URL('modules/'+name+'.js',root),'utf8');assert.doesNotMatch(source,/\bdocument\b|\bwindow\b|localStorage|THREE|from\s*['"][^'"]*(?:view|main-page|three|compiled-mesh-runtime)/);
 }
 const entry=await readFile(new URL('app.js',root),'utf8');assert.ok(entry.split('\n').length<40);assert.doesNotMatch(entry,/new THREE|traceRayModel|createProjectionPass|addEventListener|localStorage/);
 const compiledScene=await readFile(new URL('modules/compiled-scene-view.js',root),'utf8');assert.doesNotMatch(compiledScene,/traceRayModel|classifyModel|muon-response|compiled-assessment|detector-projection/);
 const page=await readFile(new URL('modules/main-page.js',root),'utf8');assert.doesNotMatch(page,/THREE|createProjectionPass|minimumMuonEnergy|setTimeout|projectionJob|fluxCache/);
});
