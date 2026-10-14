// Main-page integration acceptance only; no preview/performance workload.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolveStaticPath } from './static-paths.mjs';
import { readFile, mkdtemp } from 'node:fs/promises';
import { once } from 'node:events';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { replayPatternComparison } from '../dist/modules/pattern-comparison.js';

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
 const ready=async()=>{try{await page.waitForFunction(()=>!document.querySelector('#mainCaptureComparison')?.disabled&&document.querySelector('#mainPatternLegend')?.textContent.includes('65²'),null,{timeout:60000});}catch(error){console.error(await page.locator('#loading').textContent(),await page.locator('#projectionReadout').textContent());throw error;}};
 const click=selector=>page.locator(selector).evaluate(element=>element.click());
 const setInput=(selector,value,event='input')=>page.locator(selector).evaluate((element,{value,event})=>{element.value=value;element.dispatchEvent(new Event(event,{bubbles:true}));},{value,event});
 async function comparison(){await page.locator('#mainPatternControls').evaluate(element=>element.open=true);await click('#mainCaptureComparison');const pending=page.waitForEvent('download');await click('#mainExportComparison');const download=await pending;return replayPatternComparison(JSON.parse(await readFile(await download.path(),'utf8')));}
 async function loadSelected(){const navigation=page.waitForEvent('load');await click('#loadSelection');await navigation;await ready();}
 await page.goto(base);await ready();assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');assert.equal(await page.locator('#datasetSelect').inputValue(),release);
 await page.locator('#datasetSelect').selectOption(release);assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');await loadSelected();
 assert.equal(await page.locator('#datasetSelect').inputValue(),release);assert.equal(await page.locator('#scenarioSelect').inputValue(),'low');
 let result=(await comparison()).entries.at(-1).result;assert.equal(result.backend,'compiled-triangle-bvh@0.1.0');assert.equal(result.identity.release_id,release);assert.equal(result.scenarioId,'low');assert.equal(result.frame,'model_frame');assert.deepEqual(result.config.origin,[12.5,122,57]);
 const initial=structuredClone(result);
 // Features not yet migrated from the retired legacy backend stay visible but gated.
 for(const selector of ['#upLevel','[data-projection="significance"]','[data-layer="flux"]'])assert.ok(await page.locator(selector).isDisabled(),selector);
 await setInput('#upLevel','299');await click('[data-projection="significance"]');
 // Recognition items come from the release's display profile, all off by default (FR-M12); outlines never change results.
 assert.equal(await page.locator('[data-recognition]').count(),4);assert.equal(await page.locator('[data-recognition]:checked').count(),0);assert.equal(await page.locator('#projectionOutlines path').count(),0);
 const inView=page.locator('#recognitionItems label:not(.out) [data-recognition]');assert.ok(await inView.count()>0);const shown=await inView.first().getAttribute('data-recognition');await inView.first().check();
 assert.equal(await page.locator(`#projectionOutlines path[data-item="${shown}"]`).count(),1);assert.match(await page.locator('#projectionReadout').innerText(),/识别轮廓：/);
 await page.locator('#materialEnvelope').check();assert.ok(await page.locator('#projectionOutlines path.envelope[data-envelope="concrete"]').count()===1);
 await setInput('#recognitionThreshold','0.5','change');assert.equal(await page.locator(`#projectionOutlines path[data-item="${shown}"]`).count(),1);
 // 3D feature layers come from the catalogue: void systems only, defaults from imaging roles (FR-M11).
 assert.deepEqual(await page.locator('[data-feature-group]').evaluateAll(inputs=>inputs.map(input=>[input.dataset.featureGroup,input.checked])),[['flood_release',false],['gallery',true],['vertical_transport',true],['monitoring',true]]);
 assert.equal(await page.locator('[data-feature]').count(),20);
 for(const selector of ['[data-feature-group="flood_release"]','[data-feature-group="gallery"]'])await page.locator(selector).evaluate(element=>{element.checked=!element.checked;element.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('[data-feature="gallery_upper"]').isChecked(),false);
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=false;element.dispatchEvent(new Event('change',{bubbles:true}));});
 for(const mode of ['front','cross','top','perspective'])await setInput('#viewSelect',mode,'change');
 result=(await comparison()).entries.at(-1).result;assert.deepEqual(result,initial);
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));});
 // Use the shared numeric display layer without any compiled target heuristic.
 await page.locator('#mainMaterialContours').check();await page.locator('#mainResponseContours').check();assert.ok(await page.locator('#mainPatternOverlay path').count()>0);
 const canvas=await page.locator('#projectionCanvas').boundingBox();await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);assert.match(await page.locator('#projectionReadout').innerText(),/柱密度/);assert.ok(await page.locator('#projectionReadout .crossing').count()>0);await page.mouse.move(0,0);
 await setInput('#azNumber','10');await setInput('#azNumber','25');await setInput('#elNumber','35');await ready();result=(await comparison()).entries.at(-1).result;assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);assert.deepEqual(result.variables,initial.variables);
 const planPending=page.waitForEvent('download');await click('#export');const download=await planPending,plan=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(plan.kind,'compiled-deployment-snapshot');assert.equal(plan.scenarioId,'low');assert.equal(plan.identity.release_id,release);assert.deepEqual(plan.variables,result.variables);assert.equal(plan.activeRay.station.az,25);assert.ok(Number.isFinite(plan.activeRay.mwe));
 // Device form recomputes from one snapshot; results are history-independent (FR-C1), so doubling exposure doubles counts exactly.
 await click('#deviceSettings');await page.locator('#cfgExposure').fill('60');await page.locator('#deviceForm').evaluate(element=>element.requestSubmit());await ready();
 const doubled=(await comparison()).entries.at(-1).result;assert.equal(doubled.response.exposureDays,60);assert.equal(doubled.totalCount,result.totalCount*2);assert.equal(doubled.weightedTransmission,result.weightedTransmission);
 const count=await page.locator('#candidateList .candidate').count();await click('#add');await ready();assert.equal(await page.locator('#candidateList .candidate').count(),count+1);await click('#remove');await ready();assert.equal(await page.locator('#candidateList .candidate').count(),count);
 await page.locator('#candidateList .candidate').nth(1).evaluate(element=>element.click());await ready();assert.notDeepEqual((await comparison()).entries.at(-1).result.config.origin,result.config.origin);
 await page.locator('#candidateList .candidate').nth(0).evaluate(element=>element.click());await ready();
 const artifacts=await mkdtemp(join(tmpdir(),'muon-main-compiled-'));await page.screenshot({path:join(artifacts,'desktop.png')});
 for(const [scenarioId,waterLevel] of [['mid',293],['high',298],['extreme',305]]){await page.locator('#scenarioSelect').selectOption(scenarioId);await loadSelected();result=(await comparison()).entries.at(-1).result;assert.equal(result.scenarioId,scenarioId);assert.equal(result.variables.water_up_level,waterLevel);assert.equal(result.variables.gate_state,'closed');assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);}
 await page.setViewportSize({width:390,height:844});for(const selector of ['#toggleLeft','#toggleRight'])await click(selector);await page.waitForFunction(()=>{const canvas=document.querySelector('#webgl canvas'),rect=canvas?.getBoundingClientRect();return rect?.width>0&&rect.height>0&&Math.abs(canvas.width/canvas.height-rect.width/rect.height)<.01;},null,{timeout:10000});await page.screenshot({path:join(artifacts,'narrow.png'),fullPage:true});
 // Device settings and edited stations persist across a reload.
 await page.reload();await ready();await click('#deviceSettings');assert.equal(await page.locator('#cfgExposure').inputValue(),'60');await click('#deviceCancel');assert.equal(await page.locator('#azNumber').inputValue(),'25');
 assert.equal(await page.locator('#recognitionThreshold').inputValue(),'0.5');assert.ok(await page.locator(`[data-recognition="${shown}"]`).isChecked());
 assert.ok(await page.locator('#materialEnvelope').isChecked());assert.ok(await page.locator('[data-feature-group="flood_release"]').isChecked());assert.equal(await page.locator('[data-feature-group="gallery"]').isChecked(),false);
 assert.deepEqual(errors,[]);
 const invalid=await browser.newPage();await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=legacy');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/cannot run/);assert.equal(await invalid.locator('#webgl canvas').count(),0);await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=missing');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/Unknown compiled scenario/);assert.equal(await invalid.locator('#webgl canvas').count(),0);
 console.log('Compiled main application: all frozen scenarios, selection, capability gates for migration targets, recognition outlines, material envelopes, 3D feature layers, geometry layers, pose cancellation, device/stations, persistence, exports and desktop/narrow passed.');console.log('Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
