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
 await page.goto(base);await ready();assert.equal(await page.locator('#backendSelect').inputValue(),'legacy');
 await page.locator('#datasetSelect').selectOption(release);assert.equal(await page.locator('#backendSelect').inputValue(),'compiled');await loadSelected();
 assert.equal(await page.locator('#datasetSelect').inputValue(),release);assert.equal(await page.locator('#scenarioSelect').inputValue(),'low');
 let result=(await comparison()).entries.at(-1).result;assert.equal(result.backend,'compiled-triangle-bvh@0.1.0');assert.equal(result.identity.release_id,release);assert.equal(result.scenarioId,'low');assert.equal(result.frame,'model_frame');assert.deepEqual(result.config.origin,[12.5,122,57]);
 const initial=structuredClone(result);
 for(const selector of ['#upLevel','[data-projection="significance"]','[data-target="dam"]','[data-layer="gallery"]','[data-layer="flux"]'])assert.ok(await page.locator(selector).isDisabled(),selector);
 await setInput('#upLevel','299');await setInput('[data-target="dam"]','dam','change');await click('[data-projection="significance"]');
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=false;element.dispatchEvent(new Event('change',{bubbles:true}));});
 for(const mode of ['front','cross','top','perspective'])await setInput('#viewSelect',mode,'change');
 result=(await comparison()).entries.at(-1).result;assert.deepEqual(result,initial);
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="upwater"]','[data-layer="downwater"]'])await page.locator(selector).evaluate(element=>{element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));});
 // Use the shared numeric display layer without any compiled target heuristic.
 await page.locator('#mainMaterialContours').check();await page.locator('#mainResponseContours').check();assert.ok(await page.locator('#mainPatternOverlay path').count()>0);
 const canvas=await page.locator('#projectionCanvas').boundingBox();await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);assert.match(await page.locator('#projectionReadout').innerText(),/柱密度/);await page.mouse.move(0,0);
 await setInput('#azNumber','10');await setInput('#azNumber','25');await setInput('#elNumber','35');await ready();result=(await comparison()).entries.at(-1).result;assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);assert.deepEqual(result.variables,initial.variables);
 const planPending=page.waitForEvent('download');await click('#export');const download=await planPending,plan=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(plan.kind,'compiled-deployment-snapshot');assert.equal(plan.scenarioId,'low');assert.equal(plan.identity.release_id,release);assert.deepEqual(plan.variables,result.variables);assert.equal(plan.activeRay.station.az,25);assert.ok(Number.isFinite(plan.activeRay.mwe));
 const artifacts=await mkdtemp(join(tmpdir(),'muon-main-compiled-'));await page.screenshot({path:join(artifacts,'desktop.png')});
 for(const [scenarioId,waterLevel] of [['mid',293],['high',298],['extreme',305]]){await page.locator('#scenarioSelect').selectOption(scenarioId);await loadSelected();result=(await comparison()).entries.at(-1).result;assert.equal(result.scenarioId,scenarioId);assert.equal(result.variables.water_up_level,waterLevel);assert.equal(result.variables.gate_state,'closed');assert.equal(result.config.azimuthDeg,25);assert.equal(result.config.elevationDeg,35);}
 await page.setViewportSize({width:390,height:844});for(const selector of ['#toggleLeft','#toggleRight'])await click(selector);await page.waitForFunction(()=>{const canvas=document.querySelector('#webgl canvas'),rect=canvas?.getBoundingClientRect();return rect?.width>0&&rect.height>0&&Math.abs(canvas.width/canvas.height-rect.width/rect.height)<.01;},null,{timeout:10000});await page.screenshot({path:join(artifacts,'narrow.png'),fullPage:true});
 // Real UI can explicitly return to legacy without changing registry defaults.
 const registry=JSON.parse(await readFile(new URL('../datasets/registry.json',import.meta.url),'utf8'));await page.locator('#datasetSelect').selectOption(registry.default_dataset);await loadSelected();assert.equal(await page.locator('#backendSelect').inputValue(),'legacy');assert.ok(await page.locator('#upLevel').isEnabled());assert.ok(await page.locator('[data-projection="significance"]').isEnabled());
 assert.deepEqual(errors,[]);
 const invalid=await browser.newPage();await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=legacy');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/cannot run/);assert.equal(await invalid.locator('#webgl canvas').count(),0);await invalid.goto(base+'/?dataset='+encodeURIComponent(release)+'&backend=compiled&scenario=missing');await invalid.waitForFunction(()=>document.querySelector('#loading')?.classList.contains('error'));assert.match(await invalid.locator('#loading').innerText(),/Unknown compiled scenario/);assert.equal(await invalid.locator('#webgl canvas').count(),0);
 console.log('Compiled main application: all frozen scenarios, selection/legacy return, capability gates, geometry layers, pose cancellation, exports and desktop/narrow passed.');console.log('Screenshots: '+artifacts);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
