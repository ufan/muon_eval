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
import { serializePlan, planFromState, settingsFromDetector } from '../dist/modules/plan-format.js';
import { parseWorkspace, serializeWorkspace } from '../dist/modules/workspace-format.js';

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
 // In-page dialogs (page-dialog.js) replace window.prompt/confirm/alert; a native dialog anywhere fails the run.
 const nativeDialogs=[];page.on('dialog',dialog=>{nativeDialogs.push(dialog.message());dialog.dismiss().catch(()=>{});});
 const answer=async text=>{await page.waitForSelector('#pageDialog[open]');if(text!==undefined)await page.locator('#pageDialog input[type=text]').fill(text);await page.locator('#pageDialogOk').click();await page.waitForFunction(()=>!document.querySelector('#pageDialog')?.open);await page.evaluate(()=>new Promise(r=>setTimeout(r,50)));};// the close event and the caller's continuation run after .open turns false
 const exportPlan=async kind=>{const pending=page.waitForEvent('download');await click('#export');await click(`[data-export="${kind}"]`);const file=await pending;return {name:file.suggestedFilename(),plan:parseWorkspace(await readFile(await file.path(),'utf8'))};};
 const openCandidates=async()=>{if(await page.locator('#candidateSection').evaluate(e=>e.classList.contains('collapsed')))await click('#candidateSection .section-toggle');};
 // Dataset controls sit in the header "数据配置" menu; open it before choosing (selectOption needs a visible select).
 const selectData=async(selector,value)=>{if(await page.locator('#dataMenu').isHidden())await click('#dataMenuButton');await page.locator(selector).selectOption(value);};
 // Layer and display controls live in popovers over the 3D view (ADR-032): open the one holding a control before using it.
 const reveal=async selector=>{await page.locator(selector).evaluate(element=>{const popover=element.closest('.vt-popover');if(popover?.hidden)document.querySelector(`[aria-controls="${popover.id}"]`).click();});return page.locator(selector);};
 // Opens a candidate whatever the state: confirms discarding edits, and reselects if the click deselected it.
 const openCandidate=async n=>{const item=page.locator('#candidateList .candidate').nth(n);await item.evaluate(e=>e.click());if(await page.evaluate(()=>Boolean(document.querySelector('#pageDialog')?.open))){await page.locator('#pageDialogOk').click();await page.waitForFunction(()=>!document.querySelector('#pageDialog')?.open);}
  if(await page.locator('#singlePanel').evaluate(e=>e.classList.contains('inactive')))await item.evaluate(e=>e.click());};
 const setOthers=async on=>{if(await page.locator('#othersButton').getAttribute('aria-pressed')!==String(on))await click('#othersButton');};
 async function loadSelected(){const navigation=page.waitForEvent('load');await click('#loadSelection');await navigation;await ready();}
 await page.goto(base);await ready();
 // An idle scene draws nothing; a view change draws again.
 await page.waitForTimeout(1500);const idleStart=await drawCalls();await page.waitForTimeout(1000);assert.equal(await drawCalls(),idleStart,'idle scene keeps drawing');
 await setInput('#viewSelect','top','change');await page.waitForTimeout(300);assert.ok(await drawCalls()>idleStart);await setInput('#viewSelect','perspective','change');assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');assert.equal(await page.locator('#datasetSelect').inputValue(),release);
 await selectData('#datasetSelect',release);assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');await loadSelected();
 assert.equal(await page.locator('#datasetSelect').inputValue(),release);assert.equal(await page.locator('#scenarioSelect').inputValue(),'low');
 // ADR-030: the dataset workbench opens on the same release and scenario.
 for(const link of ['#workbenchLink','#workbenchLinkDiagnostics'])assert.equal(await page.locator(link).getAttribute('href'),'./geometry-preview.html?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=low');
 let result=await currentResult();assert.equal(result.backend,'compiled-triangle-bvh@0.1.0');assert.equal(result.identity.release_id,release);assert.equal(result.scenarioId,'low');assert.equal(result.frame,'model_frame');assert.deepEqual(result.config.origin,[12.5,122,57]);
 const initial=structuredClone(result);
 // Features not yet migrated from the retired legacy backend stay visible but gated.
 for(const selector of ['#upLevel','[data-projection="significance"]'])assert.ok(await page.locator(selector).isDisabled(),selector);
 await setInput('#upLevel','299');await click('[data-projection="significance"]');
 // Recognition items come from the release's display profile, all off by default (FR-M12); outlines never change results.
 assert.equal(await page.locator('[data-recognition]').count(),4);assert.equal(await page.locator('[data-recognition]:checked').count(),0);assert.equal(await page.locator('#projectionOutlines path[data-item]').count(),0);
 // Lines below the horizon count muons from behind the detector (quick-response@4.0.0).
 assert.equal(await page.locator('#projectionOutlines path.horizon').count(),1);
 // 后方来向 off (a view option): back pixels are blank and not read out, the label says so, the result is unchanged; on again restores it.
 {const before=await currentResult();await page.locator('#projectionCanvas').scrollIntoViewIfNeeded();const box=await page.locator('#projectionCanvas').boundingBox();await page.locator('#showBack').uncheck();
  assert.match(await page.locator('#projectionOutlines .horizon-label').allTextContents().then(t=>t.join(' ')),/已隐藏/);
  await page.mouse.move(box.x+box.width/2,box.y+box.height-2);assert.match(await page.locator('#projectionReadout').innerText(),/后方来向已隐藏/);
  assert.deepEqual(await currentResult(),before);await page.locator('#showBack').check();await page.mouse.move(box.x+box.width/2,box.y+box.height-2);
  assert.match(await page.locator('#projectionReadout').innerText(),/后方来向/);assert.doesNotMatch(await page.locator('#projectionReadout').innerText(),/已隐藏/);}
 const inView=page.locator('#recognitionItems label:not(.out) [data-recognition]');assert.ok(await inView.count()>0);const shown=await inView.first().getAttribute('data-recognition');await inView.first().check();
 assert.equal(await page.locator(`#projectionOutlines path[data-item="${shown}"]`).count(),1);assert.doesNotMatch(await page.locator('#projectionReadout').innerText(),/总计数/,'no idle summary (ADR-032)');
 // Precision lines (FR-M13): off by default, drawn from the result's own counts, remembered.
 assert.equal(await page.locator('#precisionContours').isChecked(),false);assert.equal(await page.locator('#projectionOutlines path.precision').count(),0);
 await page.locator('#precisionContours').check();assert.ok(await page.locator('#projectionOutlines path.precision').count()>0);
 await setInput('#recognitionThreshold','0.5','change');assert.equal(await page.locator(`#projectionOutlines path[data-item="${shown}"]`).count(),1);
 // 3D feature layers come from the catalogue: void systems only, defaults from imaging roles (FR-M11).
 assert.deepEqual(await page.locator('[data-feature-group]').evaluateAll(inputs=>inputs.map(input=>[input.dataset.featureGroup,input.checked])),[['gallery',true],['vertical_transport',true],['monitoring',true]]);
 // The display profile hides the flood-release system from the layer panel (profile 1.1, owner 2026-10-15).
 assert.equal(await page.locator('[data-feature-group="flood_release"]').count(),0);
 assert.equal(await page.locator('[data-feature]').count(),8);
 for(const selector of ['[data-feature-group="monitoring"]','[data-feature-group="vertical_transport"]'])await page.locator(selector).evaluate(element=>{element.checked=!element.checked;element.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('[data-feature="elevator_shaft"]').isChecked(),false);assert.ok(await page.locator('[data-feature="gallery_upper"]').isChecked());
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=false;element.dispatchEvent(new Event('change',{bubbles:true}));});
 // Coverage highlight (FR-M10): off by default; a view option only, so the result below is unchanged.
 assert.equal(await (await reveal('#coverageMode')).inputValue(),'off');assert.ok(await page.locator('#coverageOptions').isHidden());
 for(const mode of ['geometric','physical'])await (await reveal('#coverageMode')).selectOption(mode);await (await reveal('#coverageContext')).check();
 for(const mode of ['front','cross','top','perspective'])await setInput('#viewSelect',mode,'change');
 result=await currentResult();assert.deepEqual(result,initial);
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));});
 // Use the shared numeric display layer without any compiled target heuristic.
 // Numeric contour layers live in the expert diagnostics drawer, closed and off by default (FR-M14).
 assert.equal(await page.locator('#expertDiagnostics').evaluate(e=>e.open),false);assert.equal(await page.locator('#mainMaterialContours').isChecked(),false);
 await page.locator('#expertDiagnostics').evaluate(e=>e.open=true);
 await page.locator('#mainMaterialContours').check();await page.locator('#mainResponseContours').check();assert.ok(await page.locator('#mainPatternOverlay path').count()>0);
 await page.locator('#projectionCanvas').scrollIntoViewIfNeeded();const canvas=await page.locator('#projectionCanvas').boundingBox();await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);assert.match(await page.locator('#projectionReadout').innerText(),/柱密度/);assert.ok(await page.locator('#projectionReadout .crossing').count()>0);await page.mouse.move(0,0);
 // Playground first (ADR-033): nothing is saved for a new release; the draft starts at the first dataset suggestion.
 await openCandidates();assert.equal(await page.locator('#candidateList .candidate').count(),0);assert.ok(await page.locator('#emptyStations').isVisible());assert.match(await page.locator('#workingStatus').innerText(),/查看建议位置.*未加入我的点位/);assert.equal(await page.locator('#saveCandidate').innerText(),'加入我的点位');
 // Each suggestion loads into the draft and 存为新点位 saves it; then the first station is opened.
 await page.locator('#suggestionSection').evaluate(d=>d.open=true);const suggestions=await page.locator('#suggestionList .suggestion').count();assert.ok(suggestions>2);
 // A suggestion row activates like a station row: highlighted as the working station, a second click deselects it.
 await page.locator('#suggestionList .suggestion-main').nth(1).click();assert.equal(await page.locator('#suggestionList .suggestion.active').count(),1);assert.match(await page.locator('#suggestionList .suggestion.active span').innerText(),/查看中/);
 await page.locator('#suggestionList .suggestion-main').nth(1).click();assert.equal(await page.locator('#suggestionList .suggestion.active').count(),0);assert.ok(await page.locator('#noWorking').isVisible());
 // ＋ adds one to 我的点位 without loading it; the second is saved through the working station, the rest with ＋.
 await page.locator('#suggestionList .suggestion-add').nth(0).click();assert.equal(await page.locator('#candidateList .candidate').count(),1);assert.ok(await page.locator('#noWorking').isVisible());
 await page.locator('#suggestionList .suggestion-main').nth(1).click();await click('#saveCandidate');
 for(let i=2;i<suggestions;i++)await page.locator('#suggestionList .suggestion-add').nth(i).click();
 assert.equal(await page.locator('#candidateList .candidate').count(),suggestions);
 // Position and pose identify a station: adding the same suggestion again is refused, naming the station already there.
 await page.locator('#suggestionList .suggestion-add').nth(0).click();await page.waitForSelector('#pageDialog[open]');assert.match(await page.locator('#pageDialogText').innerText(),/已在同一位置和姿态/);await answer();
 assert.equal(await page.locator('#candidateList .candidate').count(),suggestions);
 await openCandidate(0);await ready();assert.match(await page.locator('#workingStatus').innerText(),/一致/);
 await setInput('#azNumber','10');await setInput('#azNumber','25');await setInput('#elNumber','35');await ready();result=await currentResult();assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);assert.deepEqual(result.variables,initial.variables);
 // Edits change the working station only (FR-P6); "更新候选" writes them back to the source candidate.
 assert.match(await page.locator('#workingStatus').innerText(),/已修改/);assert.equal(await page.locator('#updateCandidate').isDisabled(),false);
 await click('#updateCandidate');await ready();assert.match(await page.locator('#workingStatus').innerText(),/一致/);assert.ok(await page.locator('#updateCandidate').isDisabled());
 // 撤销修改 discards edits: the working station returns to its saved station.
 assert.ok(await page.locator('#revertCandidate').isHidden());await setInput('#azNumber','80');assert.match(await page.locator('#workingStatus').innerText(),/已修改/);
 await click('#revertCandidate');assert.equal(await page.locator('#azNumber').inputValue(),'25');assert.match(await page.locator('#workingStatus').innerText(),/一致/);assert.ok(await page.locator('#revertCandidate').isHidden());await ready();result=await currentResult();
 // "导出方案 → 整个工作区" writes the muography-workspace 2.0 file, which loads back byte-identically (WORKSPACE_FORMAT.md).
 const planPending=page.waitForEvent('download');await click('#export');assert.equal(await page.locator('#exportMenu').isVisible(),true);assert.ok(await page.locator('[data-export="deployment"]').isDisabled());await click('[data-export="workspace"]');const download=await planPending,planText=await readFile(await download.path(),'utf8'),exportedStudy=parseWorkspace(planText);
 assert.equal(serializeWorkspace(exportedStudy),planText);await click('#export');await click('[data-export="text"]');await page.waitForSelector('#pageDialog[open] textarea');const shownText=parseWorkspace(await page.locator('#pageDialog textarea').inputValue());assert.equal(serializeWorkspace({...shownText,provenance:{...shownText.provenance,exportedAt:exportedStudy.provenance.exportedAt}}),planText);await answer();assert.equal(exportedStudy.release.id,release);assert.deepEqual([exportedStudy.contents,exportedStudy.roots,exportedStudy.studies],['workspace',[],[]]);assert.ok(exportedStudy.sites.every(s=>s.candidateId!==null));
 assert.equal(exportedStudy.schemaVersion,'2.0.0');assert.equal(exportedStudy.deployments.length,0);assert.equal(exportedStudy.sites.length,suggestions);assert.ok(exportedStudy.stations.every(s=>s.note===''));
 // The saved stations as a 1.x plan, for the import checks below.
 const sitesById=new Map(exportedStudy.sites.map(site=>[site.id,site])),savedDetector=exportedStudy.detectors[0];
 const plan=planFromState({release,scenario:'low',model:savedDetector.device.model,settings:settingsFromDetector({device:savedDetector.device,response:{...savedDetector.response,exposureDays:30}}),
  stations:exportedStudy.stations.map(s=>{const site=sitesById.get(s.placement.site);return {id:s.id,name:s.name,x:site.position[0],y:site.position[1],z:site.position[2],az:s.pose.azimuthDeg,el:s.pose.elevationDeg,candidateId:site.candidateId,note:s.note};})}),legacyText=serializePlan(plan);
 // The plan holds no active station (session state); the edited station is the first, active one.
 assert.deepEqual(plan.stations[0].pose,{azimuthDeg:25,elevationDeg:35});
 // The result records the plan it came from: same hash as the exported plan, and the active station.
 assert.match(result.plan.hash,/^sha256:[0-9a-f]{64}$/);assert.equal(result.plan.stationId,plan.stations[0].id);
 // Device form recomputes from one snapshot; results are history-independent (FR-C1), so doubling exposure doubles counts exactly.
 // "应用到全部候选" sets the detector on every candidate, so the working station still equals its candidate.
 await click('#deviceSettings');await page.locator('#cfgExposure').fill('60');await click('#deviceApplyAll');await ready();
 const doubled=await currentResult();assert.equal(doubled.response.exposureDays,60);assert.equal(doubled.totalCount,result.totalCount*2);assert.equal(doubled.weightedTransmission,result.weightedTransmission);assert.equal(doubled.plan.stationId,result.plan.stationId);
 // Save as new adds a candidate (with a global workspace ID) and makes it the source; deleting it leaves an unsaved working station.
 const count=await page.locator('#candidateList .candidate').count();await setInput('#elNumber','36');await click('#saveCandidate');await ready();
 assert.equal(await page.locator('#candidateList .candidate').count(),count+1);assert.equal(await page.locator('#candidateList .candidate.active').getAttribute('data-candidate').then(id=>/^sta-[0-9a-hjkmnp-tv-z]{16}$/.test(id)),true);
 await click('#remove');await answer();await ready();assert.equal(await page.locator('#candidateList .candidate').count(),count);assert.match(await page.locator('#workingStatus').innerText(),/未保存|未加入我的点位/);
 // The working station is always highlighted somewhere: here as an inspected suggestion or as the unsaved draft row.
 assert.equal(await page.locator('#candidateList .working-draft, #suggestionList .suggestion.active').count(),1);
 // Leaving unsaved edits asks first, in the page (window.confirm is blocked in embedded viewers).
 await page.locator('#candidateList .candidate').nth(1).evaluate(element=>element.click());assert.ok(await page.locator('#pageDialog').evaluate(d=>d.open));await page.locator('#pageDialogOk').click();await page.waitForFunction(()=>/一致/.test(document.querySelector('#workingStatus').textContent));await ready();assert.notDeepEqual((await currentResult()).config.origin,result.config.origin);
 await page.locator('#candidateList .candidate').nth(0).evaluate(element=>element.click());await ready();assert.equal(await page.locator('#elNumber').inputValue(),'35');
 // Clicking the highlighted candidate again deselects it: no working station until one is chosen (owner, 2026-10-16).
 {const active=page.locator('#candidateList .candidate.active');await active.evaluate(element=>element.click());assert.equal(await active.count(),0);assert.ok(await page.locator('#noWorking').isVisible());
  assert.ok(await page.locator('#remove').isDisabled());await page.locator('#candidateList .candidate').nth(0).evaluate(element=>element.click());await ready();assert.equal(await active.count(),1);assert.ok(await page.locator('#noWorking').isHidden());}
 // Every candidate gets a cached result in the background (FR-P10); ticked candidates are compared from the cache,
 // and the exported comparison holds their full, recomputed results.
 await page.waitForFunction(n=>document.querySelectorAll('#candidateList .result-status[data-state="ready"]').length===n,count,{timeout:120000});
 await openCandidates();for(const i of [0,1])await page.locator('#candidateList [data-compare]').nth(i).check();
 await page.waitForFunction(()=>document.querySelectorAll('#mainComparisonSummary p').length===2&&!document.querySelector('#mainExportComparison').disabled);
 assert.match(await page.locator('#mainComparisonSummary').innerText(),/混凝土覆盖/);
 const comparisonPending=page.waitForEvent('download');await click('#mainExportComparison');const exported=replayPatternComparison(JSON.parse(await readFile(await (await comparisonPending).path(),'utf8')));
 assert.equal(exported.entries.length,2);assert.equal(exported.entries[0].result.config.elevationDeg,35);assert.equal(exported.entries[0].result.plan.stationId,result.plan.stationId);
 // Named deployments (FR-P7): saved from the ticks, shown by a click, changed ticks saved as another, exported alone, deleted from ⋯.
 assert.match(await page.locator('#deploymentSummary').innerText(),/新建/);assert.ok(await page.locator('#shownSave').isVisible());assert.ok(await page.locator('#updateShownDeployment').isHidden());
 await click('#newDeployment');await answer('Plan A');assert.match(await page.locator('#shownStatus').innerText(),/= 组合「Plan A」/);assert.ok(await page.locator('#shownSave').isHidden());
 let file=await exportPlan('deployment');assert.match(file.name,/-Plan_A\.json$/);assert.equal(file.plan.stations.length,2);assert.deepEqual(file.plan.deployments.map(d=>d.name),['Plan A']);
 // ＋ opened the member dialog with the ticked stations; ⋯ → 编辑成员 opens it with the members ticked and changes them.
 const editMembers=async index=>{await page.locator('#deploymentList .item-row').nth(0).locator('.item-more').click();await page.locator('.item-menu button',{hasText:'编辑成员'}).click();
  await page.waitForSelector('#pageDialog[open] .page-checklist');await page.locator('#pageDialog .page-checklist input').nth(index).click();await answer();};
 await editMembers(2);assert.match(await page.locator('#deploymentList .item-row').nth(0).innerText(),/3 个点位/);assert.equal(await page.locator('#deploymentList .members span').count(),3);
 await editMembers(2);assert.match(await page.locator('#deploymentList .item-row').nth(0).innerText(),/2 个点位/);
 await page.locator('#candidateList [data-compare]').nth(1).uncheck();await page.locator('#candidateList [data-compare]').nth(2).check();
 assert.match(await page.locator('#shownStatus').innerText(),/与「Plan A」不同/);assert.ok(await page.locator('#updateShownDeployment').isVisible());
 await click('#saveShownDeployment');await answer('Plan B');assert.equal(await page.locator('#deploymentList .item-row').count(),2);assert.match(await page.locator('#shownStatus').innerText(),/= 组合「Plan B」/);
 file=await exportPlan('shown');assert.equal(file.plan.stations.length,2);assert.deepEqual(file.plan.deployments,[]);
 await page.locator('#deploymentList .item-row').nth(0).locator('.item-main').click();await page.waitForFunction(()=>document.querySelectorAll('#mainComparisonSummary p').length===2);
 assert.deepEqual(await page.locator('#candidateList [data-compare]').evaluateAll(inputs=>inputs.map(i=>i.checked)).then(v=>v.slice(0,3)),[true,true,false]);
 await page.locator('#deploymentList .item-row').nth(1).locator('.item-more').click();await page.locator('.item-menu button',{hasText:'删除'}).click();await answer();
 assert.equal(await page.locator('#deploymentList .item-row').count(),1);assert.match(await page.locator('#shownStatus').innerText(),/= 组合「Plan A」/);
 // A click on the deployment shown deactivates it (nothing ticked, a fresh start); another click shows it again.
 await page.locator('#deploymentList .item-row').nth(0).locator('.item-main').click();assert.equal(await page.locator('#candidateList [data-compare]:checked').count(),0);assert.ok(await page.locator('#deploymentList .item-row.shown').count()===0);
 await page.locator('#deploymentList .item-row').nth(0).locator('.item-main').click();assert.equal(await page.locator('#candidateList [data-compare]:checked').count(),2);await page.waitForFunction(()=>document.querySelectorAll('#mainComparisonSummary p').length===2);
 // Sketching (14d): other candidates in the coverage view, each with its colour; views never change results.
 const before=await currentResult();await (await reveal('#coverageMode')).selectOption('geometric');assert.equal(await page.locator('.cov-swatch').count(),0);
 // The 比较 boxes are the only membership; the 其他点位 chip shows the compared candidates (display-state.js).
 await setOthers(true);assert.equal(await page.locator('#candidateList .cov-swatch').count(),1);assert.ok(await (await reveal('#coverageCountLegend')).isVisible());
 {const was=await page.locator('#candidateList [data-compare]').evaluateAll(inputs=>inputs.map(i=>i.checked));await click('#compareAll');assert.equal(await page.locator('#candidateList .cov-swatch').count(),count-1);
  await page.evaluate(was=>was.forEach((checked,i)=>{const input=document.querySelectorAll('#candidateList [data-compare]')[i];if(input.checked!==checked)input.click();}),was);assert.equal(await page.locator('#candidateList .cov-swatch').count(),1);}
 // Defaults (owner 2026-10-15): cone layer off with edges off and solid frustum on; the projection ray layer on.
 assert.equal(await page.locator('[data-layer="cone"]').isChecked(),false);assert.ok(await page.locator('[data-layer="ray"]').isChecked());
 // The cone options open only while 视锥 is on (no empty or ineffective popover).
 assert.ok(await page.locator('[aria-controls="conePopover"]').isDisabled());await page.locator('[data-layer="cone"]').check();assert.ok(await page.locator('[aria-controls="conePopover"]').isEnabled());
 assert.equal(await (await reveal('#fovEdges')).isChecked(),false);await (await reveal('#fovEdges')).check();
 await page.waitForTimeout(300);assert.deepEqual(await currentResult(),before);await (await reveal('#fovEdges')).uncheck();
 assert.ok(await (await reveal('#fovSolid')).isChecked());await (await reveal('#fovSolid')).uncheck();await page.waitForTimeout(300);assert.deepEqual(await currentResult(),before);await (await reveal('#fovSolid')).check();await page.locator('[data-layer="cone"]').uncheck();assert.ok(await page.locator('#conePopover').isHidden());
 for(const layer of ['cone','ray']){const box=page.locator(`[data-layer="${layer}"]`),was=await box.isChecked();await box.setChecked(!was);await page.waitForTimeout(300);assert.deepEqual(await currentResult(),before,layer);await box.setChecked(was);}
 // Physical multi-station maps (15d): 多视角覆盖 by default, legend per map, thresholds only for the class map; views never change results.
 await (await reveal('#coverageMode')).selectOption('physical');assert.ok(await page.locator('#multiControls').isVisible());assert.equal(await (await reveal('#coverageMulti')).inputValue(),'views');
 assert.ok(await (await reveal('#coverageCountLegend')).isHidden());assert.match(await page.locator('#multiLegend').innerText(),/可用视角数/);assert.ok(await page.locator('#classThresholds').isHidden());
 for(const map of ['spread','class','dominant','total','views'])await (await reveal('#coverageMulti')).selectOption(map);
 await (await reveal('#coverageMulti')).selectOption('class');assert.ok(await page.locator('#classThresholds').isVisible());await (await reveal('#classViews')).fill('4');await (await reveal('#classViews')).dispatchEvent('change');assert.match(await page.locator('#multiLegend').innerText(),/≥4 视角/);
 await (await reveal('#classViews')).fill('3');await (await reveal('#classViews')).dispatchEvent('change');await (await reveal('#coverageMulti')).selectOption('views');
 // Slice plane and feature tint (15e): the mask comes from the calculation geometry; views never change results.
 await (await reveal('#coverageFeatures')).uncheck();await (await reveal('#coverageFeatures')).check();
 assert.equal(await page.locator('#sliceOn').isChecked(),false);await page.locator('#sliceOn').check();assert.match(await page.locator('#sliceOut').innerText(),/^Z = -?\d+\.\d m$/);
 const sliceDone=()=>page.waitForFunction(()=>document.querySelector('#sliceHint').textContent.startsWith('切面只显示'),null,{timeout:30000});
 await (await reveal('#sliceAxis')).selectOption('y');assert.match(await page.locator('#sliceOut').innerText(),/^Y = /);
 await setInput('#slicePos','300','input');await sliceDone();await page.locator('#sliceOn').uncheck();
 await page.waitForTimeout(300);assert.deepEqual(await currentResult(),before);
 // Multi-station overview (#15) lives in 多站评估 (ADR-032): entering it swaps the right sidebar and shows the stations'
 // multi-view coverage in 3D; leaving it restores the coverage settings. Same station set as 其他点位; a station name opens it.
 const coverageBefore=await (await reveal('#coverageMode')).inputValue();await click('#modeMulti');
 assert.ok(await page.locator('#multiPanel').isVisible());assert.ok(await page.locator('#singlePanel').isHidden());assert.equal(await (await reveal('#coverageMode')).inputValue(),coverageBefore,'the mode does not change the 3D view');
 await page.waitForFunction(()=>/^\d+ 个点位$/.test(document.querySelector('#overviewStatus').textContent),null,{timeout:60000});
 assert.equal(await page.locator('.overview-item').count(),await page.locator('#recognitionItems input:not([data-recognition^="feature:"])').count());assert.match(await page.locator('.overview-item summary').first().innerText(),/站[\s\S]*视角/);
 await page.waitForTimeout(300);assert.deepEqual(await currentResult(),before);
 // Projections side by side (#16): one card per overview station from the cache, same colour scale; views never change results.
 assert.ok(await page.locator('#tilesPanel').isVisible());
 assert.equal(await page.locator('.tile').count(),1+await page.locator('#candidateList .cov-swatch').count());assert.equal(await page.locator('.tile canvas').count(),await page.locator('.tile').count());
 {const box=await page.locator('.tile canvas').first().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);assert.match(await page.locator('#tilesReadout').innerText(),/像素 \(\d+,\d+\) · \d+ 事件/);}
 await page.locator('[data-tiles-mode="transmission"]').click();assert.match(await page.locator('#tilesLegend').innerText(),/透射率/);await page.locator('[data-tiles-mode="counts"]').click();
 assert.deepEqual(await currentResult(),before);
 // The cards are the compared stations: a card's 比较 box removes its station; the list's box brings it back.
 {const start=await page.locator('#mainComparisonCount').innerText(),id=await page.locator('[data-tile-compare]:checked').first().getAttribute('data-tile-compare');
  await page.locator(`[data-tile-compare="${id}"]`).evaluate(box=>box.click());await page.waitForFunction(text=>document.querySelector('#mainComparisonCount').textContent!==text,start);assert.equal(await page.locator(`[data-tile-compare="${id}"]`).count(),0);
  await page.locator(`#candidateList [data-compare="${id}"]`).evaluate(box=>box.click());await page.waitForFunction(text=>document.querySelector('#mainComparisonCount').textContent===text,start);await page.waitForFunction(id=>document.querySelector(`[data-tile-compare="${id}"]`),id);}
 {const button=page.locator('[data-tile-station]').first(),name=await button.innerText();await button.click();await ready();
  assert.match(await page.locator('#workingStatus').innerText(),new RegExp(`与点位「${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}」一致`));}
 await page.locator('.overview-item summary').first().click();const target=page.locator('[data-overview-station]').first(),targetName=await target.innerText();await target.click();await ready();
 assert.match(await page.locator('#workingStatus').innerText(),new RegExp(`与点位「${targetName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}」一致`));
 // Other stations' markers: the name shows on hover (permanent labels only in demo mode, owner 2026-10-16); a click on the marker opens that station.
 const labels=page.locator('.station-labels button:not([hidden])');await page.waitForFunction(()=>document.querySelectorAll('.station-labels button:not([hidden])').length>0);
 const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),opened=async name=>assert.match(await page.locator('#workingStatus').innerText(),new RegExp(`与点位「${escape(name)}」一致`));
 assert.ok(await labels.first().isHidden(),'no permanent labels outside demo mode');
 {await page.waitForFunction(()=>document.querySelectorAll('.station-labels button:not([hidden])').length>0);const label=labels.first(),name=await label.innerText();
  const anchor=await label.evaluate(e=>{const box=document.querySelector('#webgl').getBoundingClientRect();return[box.left+parseFloat(e.style.left),box.top+parseFloat(e.style.top)];});
  await page.mouse.move(...anchor);await page.waitForTimeout(200);assert.match(await page.locator('.feature-tip').innerText(),/点击设为工作点位/);await page.mouse.down();await page.mouse.up();await ready();await opened(name);}
 await setOthers(false);assert.ok(await page.locator('#multiEmpty').isVisible());assert.ok(await page.locator('#overviewSection').isHidden());
 await click('#modeSingle');assert.ok(await page.locator('#singlePanel').isVisible());assert.equal(await (await reveal('#coverageMode')).inputValue(),coverageBefore);
 // Demonstration mode (#17): the 3D view alone with caption, legend and limitations; presets and saved views stepped with ← →;
 // the screenshot is a PNG; Esc leaves. Views never change results; the camera keeps the container's aspect ratio.
 {const unchanged=await currentResult();await setOthers(true);await click('#demoMode');
  assert.ok(await page.locator('.app').evaluate(e=>e.classList.contains('demo')));assert.ok(await page.locator('aside.left').isHidden());assert.ok(await page.locator('#projectionPanel').isHidden());
  assert.match(await page.locator('#demoCaption').innerText(),/\d+ 个点位/);assert.match(await page.locator('#demoFootnote').innerText(),/非施工或安全结论[\s\S]*曝光 \d+ 天/);
  assert.ok(await page.locator('#demoLegend div').count()>=2);await page.waitForFunction(()=>!document.querySelector('.station-labels .working-label').hidden);
  await page.waitForFunction(()=>{const canvas=document.querySelector('#webgl canvas'),box=document.querySelector('#webgl').getBoundingClientRect();return Math.abs(canvas.width/canvas.height-box.width/box.height)<.01&&box.width>window.innerWidth*.95;});
  const view=await page.locator('#viewSelect').inputValue();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#viewSelect').inputValue(),view);
  await click('#demoSaveView');await answer('演示视角');assert.equal(await page.locator('#demoSaved [data-demo-view]').innerText(),'演示视角');
  // 图例 and 说明 are optional (owner 2026-10-16).
  for(const [toggle,box] of [['#demoLegendToggle','#demoLegend'],['#demoNoteToggle','#demoFootnote']]){assert.ok(await page.locator(box).isVisible());await click(toggle);assert.ok(await page.locator(box).isHidden());await click(toggle);assert.ok(await page.locator(box).isVisible());}
  const download=page.waitForEvent('download');await click('#demoShot');assert.match((await download).suggestedFilename(),/^muography-demo-.+-\d{8}-\d{4}\.png$/);
  // Animation (FR-M5): frames are generated with exact timestamps; Esc cancels without a download and keeps demo mode.
  if(!await page.locator('#demoRecord').isDisabled()){let downloaded=false;const onDownload=()=>{downloaded=true;};page.on('download',onDownload);
   await page.locator('#demoAnimKind').selectOption('orbit');await click('#demoRecord');await page.waitForFunction(()=>/(生成中|录制中)…/.test(document.querySelector('#demoRecord').textContent),null,{timeout:30000});
   assert.ok(await page.locator('#demoBar').evaluate(e=>e.classList.contains('recording')));await page.keyboard.press('Escape');
   await page.waitForFunction(()=>document.querySelector('#demoRecord').textContent==='录制动画',null,{timeout:30000});await page.waitForTimeout(500);
   assert.equal(downloaded,false);page.off('download',onDownload);assert.ok(await page.locator('.app').evaluate(e=>e.classList.contains('demo')));assert.equal(await page.locator('#demoBar').evaluate(e=>e.classList.contains('recording')),false);}
  await click('#demoSaved [data-demo-remove]');assert.equal(await page.locator('#demoSaved button').count(),0);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.app').evaluate(e=>e.classList.contains('demo')),false);assert.ok(await page.locator('aside.left').isVisible());
  assert.ok(await page.locator('.station-labels .working-label').isHidden());await setOthers(false);await page.waitForTimeout(300);assert.deepEqual(await currentResult(),unchanged);}
 // 瞄准此处 (ADR-032): right-click on the model, aim the working detector at that point; arrow keys nudge the pose.
 {const box=await page.locator('#webgl canvas').boundingBox(),pose=async()=>[+await page.locator('#azNumber').inputValue(),+await page.locator('#elNumber').inputValue()],start=await pose();
  await page.mouse.click(box.x+box.width*.45,box.y+box.height*.45,{button:'right'});await page.locator('.scene-menu button').first().click();await ready();
  assert.notDeepEqual(await pose(),start);assert.match(await page.locator('#placeNote').innerText(),/已瞄准所点位置/);assert.ok(await page.locator('.scene-menu').isHidden());
  const [az,el]=await pose();await page.locator('#webgl canvas').hover();await page.keyboard.press('Shift+ArrowUp');await page.keyboard.press('ArrowLeft');await ready();
  assert.deepEqual(await pose(),[(az+359)%360,Math.min(90,el+5)]);
  }
 // Drag handles (ADR-032 step 7): the centre moves the working detector, the axis tip aims it; the view never orbits meanwhile.
 {const handle=async kind=>page.locator(`[data-handle="${kind}"]`).evaluate(a=>{const b=document.querySelector('#webgl').getBoundingClientRect();return[b.left+parseFloat(a.style.left),b.top+parseFloat(a.style.top)];});
  const values=async()=>Promise.all(['#x','#y','#z','#azNumber','#elNumber'].map(id=>page.locator(id).inputValue())),drag=async(kind,dx,dy)=>{const [x,y]=await handle(kind);await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=8;i++)await page.mouse.move(x+dx*i/8,y+dy*i/8);await page.mouse.up();await ready();};
  const start=await values();await drag('move',40,12);const moved=await values();assert.notDeepEqual(moved.slice(0,2),start.slice(0,2));assert.equal(moved[2],start[2],'a horizontal drag keeps the height');assert.deepEqual(moved.slice(3),start.slice(3));
  await drag('aim',-30,-40);const aimed=await values();assert.deepEqual(aimed.slice(0,3),moved.slice(0,3));assert.notDeepEqual(aimed.slice(3),moved.slice(3));assert.match(await page.locator('#workingStatus').innerText(),/已修改|未保存/);}
 // Placing: one click on the model moves the working station there; Esc cancels.
 await click('#placeStation');assert.ok(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')));await page.keyboard.press('Escape');assert.equal(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')),false);
 const xyz=async()=>Promise.all(['#x','#y','#z'].map(id=>page.locator(id).inputValue())),start=await xyz();await click('#placeStation');
 const view=await page.locator('#webgl canvas').boundingBox();await page.mouse.move(view.x+view.width/2,view.y+view.height/2);await page.mouse.down();await page.mouse.up();await ready();
 assert.notDeepEqual(await xyz(),start);assert.equal(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')),false);assert.match(await page.locator('#workingStatus').innerText(),/已修改/);
 assert.match(await page.locator('#placeNote').innerText(),/0\.5 m|已放入/);
 // A cavity seen through the semi-transparent concrete takes the click: the station goes inside it, 1 m above its floor.
 await setInput('#viewSelect','top','change');let cavityNote=null;
 const steps=(from,to,step)=>Array.from({length:Math.round((to-from)/step)+1},(_,i)=>+(from+i*step).toFixed(3));
 for(const fy of steps(.25,.75,.05))for(const fx of steps(.15,.85,.05)){if(cavityNote)break;await click('#placeStation');await page.mouse.move(view.x+view.width*fx,view.y+view.height*fy);await page.mouse.down();await page.mouse.up();
  const note=await page.locator('#placeNote').innerText();if(note.startsWith('已放入'))cavityNote=note;else if(await page.locator('#placeStation').evaluate(e=>e.classList.contains('active')))await page.keyboard.press('Escape');}
 assert.ok(cavityNote,'no cavity found under the top-view grid');const [,floor]=/底板 Z ([\d.]+) m，离底板 1\.00 m/.exec(cavityNote);assert.ok(Math.abs(+await page.locator('#z').inputValue()-(+floor+1))<.011,cavityNote);
 await ready();await setInput('#viewSelect','perspective','change');
 await openCandidate(0);await ready();
 const artifacts=await mkdtemp(join(tmpdir(),'muon-main-compiled-'));await page.screenshot({path:join(artifacts,'desktop.png')});
 for(const [scenarioId,waterLevel] of [['mid',293],['high',298],['extreme',305]]){await selectData('#scenarioSelect',scenarioId);await loadSelected();result=await currentResult();assert.equal(result.scenarioId,scenarioId);assert.equal(result.variables.water_up_level,waterLevel);assert.equal(result.variables.gate_state,'closed');assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);}
 await page.setViewportSize({width:390,height:844});for(const selector of ['#toggleLeft','#toggleRight'])await click(selector);await page.waitForFunction(()=>{const canvas=document.querySelector('#webgl canvas'),rect=canvas?.getBoundingClientRect();return rect?.width>0&&rect.height>0&&Math.abs(canvas.width/canvas.height-rect.width/rect.height)<.01;},null,{timeout:10000});await page.screenshot({path:join(artifacts,'narrow.png'),fullPage:true});
 // Device settings and edited stations persist across a reload.
 await page.reload();await ready();await click('#deviceSettings');assert.equal(await page.locator('#cfgExposure').inputValue(),'60');await click('#deviceCancel');assert.equal(await page.locator('#azNumber').inputValue(),'25');
 assert.equal(await page.locator('#recognitionThreshold').inputValue(),'0.5');assert.ok(await page.locator('#precisionContours').isChecked());assert.equal(await (await reveal('#coverageMode')).inputValue(),'physical');assert.ok(await (await reveal('#coverageContext')).isChecked());assert.ok(await page.locator(`[data-recognition="${shown}"]`).isChecked());
 assert.equal(await page.locator('[data-feature-group="monitoring"]').isChecked(),false);assert.equal(await page.locator('[data-feature-group="vertical_transport"]').isChecked(),false);
 // An imported 1.x plan is merged as a study (FR-P12): its stations are added and shown; another scenario opens that scenario.
 const studies=async()=>page.locator('#studyList .item-row .item-main b').allTextContents();
 assert.deepEqual(await studies(),[]);assert.ok(await page.locator('#studySection').isHidden());
 const savedCount=await page.locator('#candidateList .candidate').count();
 const importPlan=async(mutate,expectNavigation)=>{const doc=JSON.parse(legacyText);mutate(doc);const file=join(artifacts,'imported-plan.json');await writeFile(file,JSON.stringify(doc));
  const navigation=expectNavigation?page.waitForEvent('load'):null;await page.locator('#importPlanFile').setInputFiles(file);if(navigation){await navigation;}await ready();};
 await importPlan(doc=>{doc.title='Imported A';doc.scene.scenario='extreme';doc.stations[0].pose.elevationDeg=40;},false);
 assert.equal(await page.locator('#scenarioSelect').inputValue(),'extreme');assert.deepEqual(await studies(),['Imported A']);
 assert.equal(await page.locator('#candidateList .candidate').count(),savedCount+plan.stations.length);assert.equal(await page.locator('#candidateList [data-compare]:checked').count(),plan.stations.length);
 await importPlan(doc=>{doc.title='Imported B';doc.scene.scenario='mid';doc.stations[0].pose.elevationDeg=41;},true);
 assert.equal(await page.locator('#scenarioSelect').inputValue(),'mid');await openCandidates();assert.deepEqual(await studies(),['Imported A','Imported B']);
 assert.equal(await page.locator('#candidateList .candidate').count(),savedCount+2*plan.stations.length);
 assert.deepEqual(errors,[]);
 // A file of another dataset is refused; another release of this dataset asks first (cancelled here); a changed copy of an
 // item already stored is a conflict and refused until the import preview; nothing changes.
 const bad=join(artifacts,'bad-plan.json');await writeFile(bad,planText.split(release).join('unknown@0'));
 await page.locator('#importPlanFile').setInputFiles(bad);await page.waitForSelector('#pageDialog[open]');assert.match(await page.locator('#pageDialogText').innerText(),/另一个数据集/);await answer();
 const otherRelease=join(artifacts,'other-release.json');await writeFile(otherRelease,planText.split(release).join(`${release.split('@')[0]}@9.9.9`));
 await page.locator('#importPlanFile').setInputFiles(otherRelease);await page.waitForSelector('#pageDialog[open]');assert.match(await page.locator('#pageDialogText').innerText(),/9\.9\.9/);
 await page.locator('#pageDialogCancel').click();await page.waitForFunction(()=>!document.querySelector('#pageDialog').open);
 const conflict=join(artifacts,'conflict.json'),changed=JSON.parse(planText);changed.stations[0].name='Changed elsewhere';await writeFile(conflict,JSON.stringify(changed));
 await page.locator('#importPlanFile').setInputFiles(conflict);await page.waitForSelector('#pageDialog[open]');assert.match(await page.locator('#pageDialogText').innerText(),/conflict/i);await answer();
 assert.equal((await studies()).length,2);assert.equal(await page.locator('#candidateList .candidate').count(),savedCount+2*plan.stations.length);
 // Studies are read-only rows until the composer (ADR-033 step 6): expand to show one of its deployments, rename, delete (its stations stay).
 await click('#deviceSettings');assert.equal(await page.locator('#cfgExposure').inputValue(),'60');await click('#deviceCancel');
 {const row=page.locator('#studyList .item-row').nth(1);await row.locator('.item-main').click();assert.ok(await row.locator('.item-children').isVisible());
  await row.locator('.item-children button').first().click();assert.equal(await page.locator('#candidateList [data-compare]:checked').count(),plan.stations.length);
  await row.locator('.item-more').click();await page.locator('.item-menu button',{hasText:'重命名'}).click();await answer('Gallery study');assert.deepEqual(await studies(),['Imported A','Gallery study']);
  await page.locator('#studyList .item-row').nth(1).locator('.item-more').click();await page.locator('.item-menu button',{hasText:'删除'}).click();await answer();assert.deepEqual(await studies(),['Imported A']);}
 assert.equal(await page.locator('#candidateList .candidate').count(),savedCount+2*plan.stations.length);
 await page.reload();await ready();assert.deepEqual(await studies(),['Imported A']);assert.equal(await page.locator('#deploymentList .item-row').count(),1+2*(plan.deployments.length+1));
 // Studies saved by the previous version (muography-plan 1.x keys) move into the workspace when the app opens; the 1.x keys stay.
 const legacyPage=await browser.newPage();await legacyPage.goto(base);await legacyPage.evaluate(({release,text,copy})=>{localStorage.clear();
  localStorage.setItem(`muon-studies:${release}`,JSON.stringify({version:1,active:'study-1',studies:['study-1','study-2']}));localStorage.setItem(`muon-plan:${release}:study-1`,text);localStorage.setItem(`muon-plan:${release}:study-2`,copy);},
  {release,text:serializePlan({...plan,title:'Legacy study',scene:{...plan.scene,scenario:null}}),copy:serializePlan({...plan,title:'Legacy copy',scene:{...plan.scene,scenario:null}})});
 await legacyPage.reload();await legacyPage.waitForFunction(()=>document.querySelector('#studyList .item-main b')?.textContent==='Legacy study',null,{timeout:60000});
 const stored=await legacyPage.evaluate(release=>({workspace:JSON.parse(localStorage.getItem(`muon-workspace:${release}`)),legacy:localStorage.getItem(`muon-plan:${release}:study-1`)!==null}),release);
 assert.deepEqual([stored.workspace.format,stored.workspace.studies.map(s=>s.title),stored.legacy],['muography-workspace',['Legacy study','Legacy copy'],true]);
 // Each old study had its own copies; they are merged only on request (合并重复), keeping both studies' deployments.
 assert.equal(await legacyPage.locator('#candidateList .candidate').count(),2*plan.stations.length);assert.ok(await legacyPage.locator('#duplicateNotice').isVisible());
 await legacyPage.locator('#mergeDuplicates').click();await legacyPage.waitForSelector('#pageDialog[open]');await legacyPage.locator('#pageDialogOk').click();
 await legacyPage.waitForFunction(n=>document.querySelectorAll('#candidateList .candidate').length===n,plan.stations.length);assert.ok(await legacyPage.locator('#duplicateNotice').isHidden());
 assert.equal(await legacyPage.locator('#studyList .item-row').count(),2);await legacyPage.close();
 const invalid=await browser.newPage();await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=legacy');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/cannot run/);assert.equal(await invalid.locator('#webgl canvas').count(),0);await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=missing');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/Unknown compiled scenario/);assert.equal(await invalid.locator('#webgl canvas').count(),0);
 // Last, so the pan cannot disturb the steps above: a right-drag pans the view and does not open the right-click menu.
 {await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(500);const box=await page.locator('#webgl canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.mouse.down({button:'right'});
  for(let i=1;i<=6;i++)await page.mouse.move(box.x+box.width*.5+i*10,box.y+box.height*.6+i*4);await page.mouse.up({button:'right'});assert.ok(await page.locator('.scene-menu').isHidden(),'no menu after a pan');}
 assert.deepEqual(nativeDialogs,[],'no native browser dialogs');
 console.log('Compiled main application: all frozen scenarios, selection, capability gates for migration targets, recognition outlines, precision lines, expert diagnostics, workbench link, workspace storage and 1.x migration, study export/import (download and copyable text), in-page dialogs, studies (rename, delete), working station and candidates, deployments and plan export menu, multi-station coverage, overview, demonstration mode with animation and placement, cached comparison, coverage highlight, on-demand rendering, 3D feature layers, geometry layers, pose cancellation, device/stations, persistence, exports and desktop/narrow passed.');console.log('Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
