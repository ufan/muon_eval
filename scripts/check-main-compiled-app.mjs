// Main-page integration acceptance only; no preview/performance workload.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolveStaticPath } from './static-paths.mjs';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { once } from 'node:events';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { replayPatternComparison } from '../dist/modules/pattern-comparison.js';
import { parsePlan, serializePlan, planHash } from '../dist/modules/plan-format.js';

const options=new Map();for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--playwright','--chromium'].includes(key)||!value)throw Error('Usage: node scripts/check-main-compiled-app.mjs [--playwright /path/index.mjs] [--chromium /path/browser]');options.set(key,value);}
// Environment fallback lets `npm run test:browser` locate an existing Playwright/Chromium.
if(!options.has('--playwright')&&process.env.PLAYWRIGHT_MODULE)options.set('--playwright',process.env.PLAYWRIGHT_MODULE);
if(!options.has('--chromium')&&process.env.CHROMIUM_PATH)options.set('--chromium',process.env.CHROMIUM_PATH);
const {chromium}=await import(options.has('--playwright')?pathToFileURL(options.get('--playwright')).href:'playwright');
const root=new URL('../dist/',import.meta.url),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer(async(request,response)=>{try{const path=new URL(request.url,'http://localhost').pathname,file=resolveStaticPath(path);if(!file){response.writeHead(403).end();return;}response.setHeader('Content-Type',mime[extname(file.pathname)]||'application/octet-stream');response.end(await readFile(file));}catch{response.writeHead(404).end();}});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
const release='zhouning-lower-reservoir-dam@0.6.2+schema0.7.0',base='http://127.0.0.1:'+server.address().port;
try{
 browser=await chromium.launch({headless:true,...(options.has('--chromium')?{executablePath:options.get('--chromium')}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.on('console',message=>{if(message.type()==='error'){errors.push(message.text());console.error(message.text());}});
 // Count WebGL draw calls to check on-demand rendering (FR-N5).
 await page.addInitScript(()=>{globalThis.drawCalls=0;for(const Type of [WebGLRenderingContext,WebGL2RenderingContext])for(const method of ['drawElements','drawArrays']){const original=Type.prototype[method];Type.prototype[method]=function(...args){globalThis.drawCalls++;return original.apply(this,args);};}});
 const drawCalls=()=>page.evaluate(()=>globalThis.drawCalls);
 const ready=async()=>{try{await page.waitForFunction(()=>!document.querySelector('#exportResult')?.disabled&&document.querySelector('#mainPatternLegend')?.textContent.includes('65²'),null,{timeout:60000});}catch(error){console.error(await page.locator('#loading').textContent(),await page.locator('#projectionReadout').textContent());throw error;}};
 const click=selector=>page.locator(selector).evaluate(element=>element.click());
 const setInput=(selector,value,event='input')=>page.locator(selector).evaluate((element,{value,event})=>{element.value=value;element.dispatchEvent(new Event(event,{bubbles:true}));},{value,event});
 // The working station's full result, through "导出当前结果".
 async function currentResult(){await page.locator('#mainPatternControls').evaluate(element=>element.open=true);const pending=page.waitForEvent('download');await click('#exportResult');const download=await pending;return JSON.parse(await readFile(await download.path(),'utf8'));}
 const accept=(text)=>page.once('dialog',dialog=>dialog.accept(text));
 const exportPlan=async kind=>{const pending=page.waitForEvent('download');await click('#export');await click(`[data-export="${kind}"]`);const file=await pending;return {name:file.suggestedFilename(),plan:parsePlan(await readFile(await file.path(),'utf8'))};};
 const openCandidates=async()=>{if(await page.locator('#candidateSection').evaluate(e=>e.classList.contains('collapsed')))await click('#candidateSection .section-toggle');};
 async function loadSelected(){const navigation=page.waitForEvent('load');await click('#loadSelection');await navigation;await ready();}
 await page.goto(base);await ready();
 // An idle scene draws nothing; a view change draws again.
 await page.waitForTimeout(1500);const idleStart=await drawCalls();await page.waitForTimeout(1000);assert.equal(await drawCalls(),idleStart,'idle scene keeps drawing');
 await setInput('#viewSelect','top','change');await page.waitForTimeout(300);assert.ok(await drawCalls()>idleStart);await setInput('#viewSelect','perspective','change');assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');assert.equal(await page.locator('#datasetSelect').inputValue(),release);
 await page.locator('#datasetSelect').selectOption(release);assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');await loadSelected();
 assert.equal(await page.locator('#datasetSelect').inputValue(),release);assert.equal(await page.locator('#scenarioSelect').inputValue(),'low');
 // ADR-030: the dataset workbench opens on the same release and scenario.
 for(const link of ['#workbenchLink','#workbenchLinkDiagnostics'])assert.equal(await page.locator(link).getAttribute('href'),'./geometry-preview.html?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=low');
 let result=await currentResult();assert.equal(result.backend,'compiled-triangle-bvh@0.1.0');assert.equal(result.identity.release_id,release);assert.equal(result.scenarioId,'low');assert.equal(result.frame,'model_frame');assert.deepEqual(result.config.origin,[12.5,122,57]);
 const initial=structuredClone(result);
 // Features not yet migrated from the retired legacy backend stay visible but gated.
 for(const selector of ['#upLevel','[data-projection="significance"]','[data-layer="flux"]'])assert.ok(await page.locator(selector).isDisabled(),selector);
 await setInput('#upLevel','299');await click('[data-projection="significance"]');
 // Recognition items come from the release's display profile, all off by default (FR-M12); outlines never change results.
 assert.equal(await page.locator('[data-recognition]').count(),4);assert.equal(await page.locator('[data-recognition]:checked').count(),0);assert.equal(await page.locator('#projectionOutlines path[data-item]').count(),0);
 // Lines below the horizon count muons from behind the detector (quick-response@4.0.0).
 assert.equal(await page.locator('#projectionOutlines path.horizon').count(),1);
 const inView=page.locator('#recognitionItems label:not(.out) [data-recognition]');assert.ok(await inView.count()>0);const shown=await inView.first().getAttribute('data-recognition');await inView.first().check();
 assert.equal(await page.locator(`#projectionOutlines path[data-item="${shown}"]`).count(),1);assert.match(await page.locator('#projectionReadout').innerText(),/识别轮廓：/);
 // Precision lines (FR-M13): off by default, drawn from the result's own counts, remembered.
 assert.equal(await page.locator('#precisionContours').isChecked(),false);assert.equal(await page.locator('#projectionOutlines path.precision').count(),0);
 await page.locator('#precisionContours').check();assert.ok(await page.locator('#projectionOutlines path.precision').count()>0);
 await setInput('#recognitionThreshold','0.5','change');assert.equal(await page.locator(`#projectionOutlines path[data-item="${shown}"]`).count(),1);
 // 3D feature layers come from the catalogue: void systems only, defaults from imaging roles (FR-M11).
 assert.deepEqual(await page.locator('[data-feature-group]').evaluateAll(inputs=>inputs.map(input=>[input.dataset.featureGroup,input.checked])),[['flood_release',false],['gallery',true],['vertical_transport',true],['monitoring',true]]);
 assert.equal(await page.locator('[data-feature]').count(),20);
 for(const selector of ['[data-feature-group="flood_release"]','[data-feature-group="gallery"]'])await page.locator(selector).evaluate(element=>{element.checked=!element.checked;element.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('[data-feature="gallery_upper"]').isChecked(),false);
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=false;element.dispatchEvent(new Event('change',{bubbles:true}));});
 // Coverage highlight (FR-M10): off by default; a view option only, so the result below is unchanged.
 assert.equal(await page.locator('#coverageMode').inputValue(),'off');assert.ok(await page.locator('#coverageOptions').isHidden());
 for(const mode of ['geometric','physical'])await page.locator('#coverageMode').selectOption(mode);await page.locator('#coverageContext').check();
 for(const mode of ['front','cross','top','perspective'])await setInput('#viewSelect',mode,'change');
 result=await currentResult();assert.deepEqual(result,initial);
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));});
 // Use the shared numeric display layer without any compiled target heuristic.
 // Numeric contour layers live in the expert diagnostics drawer, closed and off by default (FR-M14).
 assert.equal(await page.locator('#expertDiagnostics').evaluate(e=>e.open),false);assert.equal(await page.locator('#mainMaterialContours').isChecked(),false);
 await page.locator('#expertDiagnostics').evaluate(e=>e.open=true);
 await page.locator('#mainMaterialContours').check();await page.locator('#mainResponseContours').check();assert.ok(await page.locator('#mainPatternOverlay path').count()>0);
 await page.locator('#projectionCanvas').scrollIntoViewIfNeeded();const canvas=await page.locator('#projectionCanvas').boundingBox();await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);assert.match(await page.locator('#projectionReadout').innerText(),/柱密度/);assert.ok(await page.locator('#projectionReadout .crossing').count()>0);await page.mouse.move(0,0);
 await setInput('#azNumber','10');await setInput('#azNumber','25');await setInput('#elNumber','35');await ready();result=await currentResult();assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);assert.deepEqual(result.variables,initial.variables);
 // Edits change the working station only (FR-P6); "更新候选" writes them back to the source candidate.
 assert.match(await page.locator('#workingStatus').innerText(),/已修改/);assert.equal(await page.locator('#updateCandidate').isDisabled(),false);
 await click('#updateCandidate');await ready();assert.match(await page.locator('#workingStatus').innerText(),/一致/);assert.ok(await page.locator('#updateCandidate').isDisabled());result=await currentResult();
 // "导出部署方案" writes a muography-plan 1.1.0 file that loads back byte-identically (PLAN_FORMAT.md).
 const planPending=page.waitForEvent('download');await click('#export');assert.equal(await page.locator('#exportMenu').isVisible(),true);assert.ok(await page.locator('[data-export="deployment"]').isDisabled());await click('[data-export="study"]');const download=await planPending,planText=await readFile(await download.path(),'utf8'),plan=parsePlan(planText);
 assert.equal(serializePlan(plan),planText);assert.equal(plan.scene.release,release);assert.equal(plan.scene.scenario,'low');assert.ok(plan.stations.every(s=>s.candidateId===s.id));
 assert.equal(plan.schemaVersion,'1.1.0');assert.deepEqual(plan.deployments,[]);assert.ok(plan.stations.every(s=>s.note===''));
 // The plan holds no active station (session state); the edited station is the first, active one.
 assert.deepEqual(plan.stations[0].pose,{azimuthDeg:25,elevationDeg:35});
 // The result records the plan it came from: same hash as the exported plan, and the active station.
 assert.deepEqual(result.plan,{hash:planHash(plan),stationId:plan.stations[0].id});
 // Device form recomputes from one snapshot; results are history-independent (FR-C1), so doubling exposure doubles counts exactly.
 // "应用到全部候选" sets the detector on every candidate, so the working station still equals its candidate.
 await click('#deviceSettings');await page.locator('#cfgExposure').fill('60');await click('#deviceApplyAll');await ready();
 const doubled=await currentResult();assert.equal(doubled.response.exposureDays,60);assert.equal(doubled.totalCount,result.totalCount*2);assert.equal(doubled.weightedTransmission,result.weightedTransmission);assert.equal(doubled.plan.stationId,result.plan.stationId);
 // Save as new adds a candidate and makes it the source; deleting it leaves an unsaved working station.
 const count=await page.locator('#candidateList .candidate').count();await setInput('#elNumber','36');await click('#saveCandidate');await ready();
 assert.equal(await page.locator('#candidateList .candidate').count(),count+1);assert.equal(await page.locator('#candidateList .candidate.active').getAttribute('data-candidate'),'station-'+(count+1));
 accept();await click('#remove');await ready();assert.equal(await page.locator('#candidateList .candidate').count(),count);assert.match(await page.locator('#workingStatus').innerText(),/未保存/);
 // Leaving unsaved edits asks first.
 accept();await page.locator('#candidateList .candidate').nth(1).evaluate(element=>element.click());await ready();assert.notDeepEqual((await currentResult()).config.origin,result.config.origin);
 await page.locator('#candidateList .candidate').nth(0).evaluate(element=>element.click());await ready();assert.equal(await page.locator('#elNumber').inputValue(),'35');
 // Every candidate gets a cached result in the background (FR-P10); ticked candidates are compared from the cache,
 // and the exported comparison holds their full, recomputed results.
 await page.waitForFunction(n=>document.querySelectorAll('#candidateList .result-status[data-state="ready"]').length===n,count,{timeout:120000});
 await openCandidates();for(const i of [0,1])await page.locator('#candidateList [data-compare]').nth(i).check();
 await page.waitForFunction(()=>document.querySelectorAll('#mainComparisonSummary p').length===2&&!document.querySelector('#mainExportComparison').disabled);
 assert.match(await page.locator('#mainComparisonSummary').innerText(),/混凝土覆盖/);
 const comparisonPending=page.waitForEvent('download');await click('#mainExportComparison');const exported=replayPatternComparison(JSON.parse(await readFile(await (await comparisonPending).path(),'utf8')));
 assert.equal(exported.entries.length,2);assert.equal(exported.entries[0].result.config.elevationDeg,35);assert.equal(exported.entries[0].result.plan.stationId,result.plan.stationId);
 // Named deployments (FR-P7): created, filled by ticking, copied, exported alone or together, deleted; "比较本组合的点位" sets the comparison.
 assert.match(await page.locator('#deploymentSummary').innerText(),/新建/);
 accept('Plan A');await click('#newDeployment');for(const i of [0,2])await page.locator('#deploymentMembers [data-member]').nth(i).check();
 assert.match(await page.locator('#deploymentSummary').innerText(),/^2 个点位/);
 let file=await exportPlan('deployment');assert.match(file.name,/-study-1-deployment-1\.json$/);assert.equal(file.plan.stations.length,2);assert.deepEqual(file.plan.deployments.map(d=>d.name),['Plan A']);
 accept('Plan B');await click('#copyDeployment');assert.equal(await page.locator('#deploymentSelect option').count(),2);await page.locator('#deploymentMembers [data-member]').nth(2).uncheck();await page.locator('#deploymentMembers [data-member]').nth(1).check();
 file=await exportPlan('deployments');assert.deepEqual(file.plan.deployments.map(d=>[d.name,d.stations.length]),[['Plan A',2],['Plan B',2]]);assert.equal(file.plan.stations.length,3);
 await click('#compareDeployment');await page.waitForFunction(()=>document.querySelectorAll('#mainComparisonSummary p').length===2);
 assert.deepEqual(await page.locator('#candidateList [data-compare]').evaluateAll(inputs=>inputs.map(i=>i.checked)).then(v=>v.slice(0,3)),[true,true,false]);
 accept();await click('#deleteDeployment');assert.equal(await page.locator('#deploymentSelect option').count(),1);assert.equal(await page.locator('#deploymentSelect').inputValue(),'deployment-1');
 // Sketching (14d): other candidates in the coverage view, each with its colour; views never change results.
 const before=await currentResult();await page.locator('#coverageMode').selectOption('geometric');assert.equal(await page.locator('.cov-swatch').count(),0);
 await page.locator('#coverageStations').selectOption('compared');assert.equal(await page.locator('#candidateList .cov-swatch').count(),1);assert.ok(await page.locator('#coverageCountLegend').isVisible());
 await page.locator('#coverageStations').selectOption('all');assert.equal(await page.locator('#candidateList .cov-swatch').count(),count-1);
 await page.waitForTimeout(300);assert.deepEqual(await currentResult(),before);await page.locator('#coverageMode').selectOption('physical');
 // Placing: one click on the model moves the working station there; Esc cancels.
 await click('#placeStation');assert.ok(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')));await page.keyboard.press('Escape');assert.equal(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')),false);
 const xyz=async()=>Promise.all(['#x','#y','#z'].map(id=>page.locator(id).inputValue())),start=await xyz();await click('#placeStation');
 const view=await page.locator('#webgl canvas').boundingBox();await page.mouse.move(view.x+view.width/2,view.y+view.height/2);await page.mouse.down();await page.mouse.up();await ready();
 assert.notDeepEqual(await xyz(),start);assert.equal(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')),false);assert.match(await page.locator('#workingStatus').innerText(),/已修改/);
 accept();await page.locator('#candidateList .candidate').nth(0).evaluate(element=>element.click());await ready();
 const artifacts=await mkdtemp(join(tmpdir(),'muon-main-compiled-'));await page.screenshot({path:join(artifacts,'desktop.png')});
 for(const [scenarioId,waterLevel] of [['mid',293],['high',298],['extreme',305]]){await page.locator('#scenarioSelect').selectOption(scenarioId);await loadSelected();result=await currentResult();assert.equal(result.scenarioId,scenarioId);assert.equal(result.variables.water_up_level,waterLevel);assert.equal(result.variables.gate_state,'closed');assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);}
 await page.setViewportSize({width:390,height:844});for(const selector of ['#toggleLeft','#toggleRight'])await click(selector);await page.waitForFunction(()=>{const canvas=document.querySelector('#webgl canvas'),rect=canvas?.getBoundingClientRect();return rect?.width>0&&rect.height>0&&Math.abs(canvas.width/canvas.height-rect.width/rect.height)<.01;},null,{timeout:10000});await page.screenshot({path:join(artifacts,'narrow.png'),fullPage:true});
 // Device settings and edited stations persist across a reload.
 await page.reload();await ready();await click('#deviceSettings');assert.equal(await page.locator('#cfgExposure').inputValue(),'60');await click('#deviceCancel');assert.equal(await page.locator('#azNumber').inputValue(),'25');
 assert.equal(await page.locator('#recognitionThreshold').inputValue(),'0.5');assert.ok(await page.locator('#precisionContours').isChecked());assert.equal(await page.locator('#coverageMode').inputValue(),'physical');assert.ok(await page.locator('#coverageContext').isChecked());assert.ok(await page.locator(`[data-recognition="${shown}"]`).isChecked());
 assert.ok(await page.locator('[data-feature-group="flood_release"]').isChecked());assert.equal(await page.locator('[data-feature-group="gallery"]').isChecked(),false);
 // An imported plan becomes a new study (FR-P8): in place for the current release and scenario; another scenario opens that scenario.
 const studies=async()=>page.locator('#studySelect option').evaluateAll(options=>options.map(o=>[o.value,o.selected]));
 assert.deepEqual(await studies(),[['study-1',true]]);
 const importPlan=async(mutate,expectNavigation)=>{const doc=JSON.parse(planText);mutate(doc);const file=join(artifacts,'imported-plan.json');await writeFile(file,JSON.stringify(doc));
  const navigation=expectNavigation?page.waitForEvent('load'):null;await page.locator('#importPlanFile').setInputFiles(file);if(navigation){await navigation;}await ready();};
 await importPlan(doc=>{doc.scene.scenario='extreme';doc.stations[0].pose.elevationDeg=40;},false);
 assert.equal(await page.locator('#elNumber').inputValue(),'40');assert.equal(await page.locator('#scenarioSelect').inputValue(),'extreme');assert.deepEqual(await studies(),[['study-1',false],['study-2',true]]);
 await importPlan(doc=>{doc.scene.scenario='mid';doc.stations[0].pose.elevationDeg=41;},true);
 assert.equal(await page.locator('#scenarioSelect').inputValue(),'mid');assert.equal(await page.locator('#elNumber').inputValue(),'41');assert.deepEqual(await studies(),[['study-1',false],['study-2',false],['study-3',true]]);
 assert.deepEqual(errors,[]);
 // A plan for an unregistered release is refused with a message; nothing changes.
 const refusal=page.waitForEvent('dialog');const bad=join(artifacts,'bad-plan.json');await writeFile(bad,planText.replace(release,'unknown@0'));
 await page.locator('#importPlanFile').setInputFiles(bad);const dialog=await refusal;assert.match(dialog.message(),/未登记/);await dialog.dismiss();
 assert.equal(await page.locator('#elNumber').inputValue(),'41');assert.equal((await studies()).length,3);
 // Switching studies restores each one's stations and device; a new study starts from the dataset candidates; the choice survives a reload.
 await openCandidates();await page.locator('#studySelect').selectOption('study-1');await ready();assert.equal(await page.locator('#elNumber').inputValue(),'35');
 await click('#deviceSettings');assert.equal(await page.locator('#cfgExposure').inputValue(),'60');await click('#deviceCancel');
 await click('#newStudy');await ready();assert.deepEqual((await studies()).map(([id,on])=>[id,on]).at(-1),['study-4',true]);assert.equal(await page.locator('#candidateList .candidate').count(),count);
 await page.reload();await ready();assert.equal((await studies()).find(([,on])=>on)[0],'study-4');
 await openCandidates();await page.locator('#studySelect').selectOption('study-3');await ready();assert.equal(await page.locator('#elNumber').inputValue(),'41');
 // Studies can be renamed and deleted; deleting the active study opens the first remaining one.
 accept('Gallery study');await click('#renameStudy');assert.equal(await page.locator('#studySelect option:checked').innerText(),'Gallery study');
 accept();await click('#deleteStudy');await ready();assert.deepEqual((await studies()).map(([id])=>id),['study-1','study-2','study-4']);assert.equal(await page.locator('#studySelect').inputValue(),'study-1');
 assert.equal(await page.locator('#deploymentSelect option').count(),1);
 const invalid=await browser.newPage();await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=legacy');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/cannot run/);assert.equal(await invalid.locator('#webgl canvas').count(),0);await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=missing');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/Unknown compiled scenario/);assert.equal(await invalid.locator('#webgl canvas').count(),0);
 console.log('Compiled main application: all frozen scenarios, selection, capability gates for migration targets, recognition outlines, precision lines, expert diagnostics, workbench link, plan export/import, studies (rename, delete), working station and candidates, deployments and plan export menu, multi-station coverage and placement, cached comparison, coverage highlight, on-demand rendering, 3D feature layers, geometry layers, pose cancellation, device/stations, persistence, exports and desktop/narrow passed.');console.log('Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
