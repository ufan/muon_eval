// Optional HTTP browser acceptance. No application runtime dependency on Playwright.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolveStaticPath } from './static-paths.mjs';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { replayPatternComparison } from '../dist/modules/pattern-comparison.js';

const options=new Map();
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--playwright','--chromium'].includes(key)||!value)throw Error('Usage: node scripts/check-main-app.mjs [--playwright /path/index.mjs] [--chromium /path/browser]');options.set(key,value);}
// Environment fallback lets `npm run test:browser` locate an existing Playwright/Chromium.
if(!options.has('--playwright')&&process.env.PLAYWRIGHT_MODULE)options.set('--playwright',process.env.PLAYWRIGHT_MODULE);
if(!options.has('--chromium')&&process.env.CHROMIUM_PATH)options.set('--chromium',process.env.CHROMIUM_PATH);
const {chromium}=await import(options.has('--playwright')?pathToFileURL(options.get('--playwright')).href:'playwright');
const root=new URL('../dist/',import.meta.url),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer(async(request,response)=>{try{const path=new URL(request.url,'http://localhost').pathname,file=resolveStaticPath(path);if(!file){response.writeHead(403).end();return;}response.setHeader('Content-Type',mime[extname(file.pathname)]||'application/octet-stream');response.end(await readFile(file));}catch{response.writeHead(404).end();}});
server.listen(0,'127.0.0.1');await once(server,'listening');let browser;
try{
 browser=await chromium.launch({headless:true,...(options.has('--chromium')?{executablePath:options.get('--chromium')} : {}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 const ready=async()=>{try{await page.waitForFunction(()=>!document.querySelector('#mainCaptureComparison')?.disabled&&document.querySelector('#mainPatternLegend')?.textContent.includes('65²'),null,{timeout:60000});}catch(error){console.error(await page.locator('#loading').textContent());throw error;}};
 const invoke=selector=>page.locator(selector).evaluate(e=>e.click());
 const setInput=(selector,value,event='input')=>page.locator(selector).evaluate((e,{value,event})=>{e.value=value;e.dispatchEvent(new Event(event,{bubbles:true}));},{value,event});
 async function exported(){const pending=page.waitForEvent('download');await invoke('#mainExportComparison');const download=await pending;return replayPatternComparison(JSON.parse(await readFile(await download.path(),'utf8')));}
 await page.goto('http://127.0.0.1:'+server.address().port+'/?dataset='+encodeURIComponent('zhouning-lower-reservoir-dam@0.6.2')+'&backend=legacy');await ready();
 assert.match(await page.locator('#projectionReadout').innerText(),/893,771/);
 await page.locator('#mainPatternControls').evaluate(e=>e.open=true);
 await invoke('#mainCaptureComparison');
 // Rendering/selection must not alter the captured scientific result.
 for(const mode of ['front','cross','top','perspective'])await setInput('#viewSelect',mode,'change');
 for(const selector of ['[data-layer="dam"]','[data-layer="terrain"]','[data-layer="gallery"]','[data-target="water"]','[data-target="gallery"]','[data-target="dam"]'])await page.locator(selector).evaluate(e=>{e.checked=!e.checked;e.dispatchEvent(new Event('change',{bubbles:true}));});
 await invoke('[data-projection="significance"]');assert.doesNotMatch(await page.locator('#projectionReadout').innerText(),/NaN|Infinity/);
 await invoke('#mainCaptureComparison');let result=await exported();assert.deepEqual(result.entries[0].result,result.entries[1].result);
 // Rapid input changes must publish only the final current pose/environment.
 await setInput('#azNumber','10');await setInput('#azNumber','25');await setInput('#upLevel','295');await ready();
 await invoke('#mainCaptureComparison');result=await exported();const changed=result.entries.at(-1).result;
 assert.equal(changed.config.azimuthDeg,25);assert.equal(changed.variables.upstream,295);assert.equal(changed.config.bins,65);assert.equal(changed.backend,'legacy-dda@1.0.0');
 // Device form preserves existing persistence and recomputes from one snapshot.
 // Both settings submissions clear legacy quantized flux caches. Compare equal
 // cache histories, not the earlier result warmed by other station poses.
 await invoke('#deviceSettings');await page.locator('#cfgExposure').fill('30');await page.locator('#deviceForm').evaluate(e=>e.requestSubmit());await ready();
 await invoke('#mainCaptureComparison');const fresh=(await exported()).entries.at(-1).result;
 await invoke('#deviceSettings');await page.locator('#cfgExposure').fill('60');await page.locator('#deviceForm').evaluate(e=>e.requestSubmit());await ready();
 await invoke('#mainCaptureComparison');result=await exported();const adjusted=result.entries.at(-1).result;
 assert.equal(adjusted.response.exposureDays,60);assert.equal(adjusted.totalCount,fresh.totalCount*2);assert.equal(adjusted.weightedTransmission,fresh.weightedTransmission);
 const count=await page.locator('#candidateList .candidate').count();await invoke('#add');await ready();assert.equal(await page.locator('#candidateList .candidate').count(),count+1);await invoke('#remove');await ready();assert.equal(await page.locator('#candidateList .candidate').count(),count);
 await page.locator('#candidateList .candidate').nth(1).evaluate(e=>e.click());await ready();
 const planPromise=page.waitForEvent('download');await invoke('#export');const plan=JSON.parse(await readFile(await (await planPromise).path(),'utf8'));assert.equal(plan.water.upstream,295);assert.equal(plan.device.response.exposureDays,60);assert.equal(plan.candidates.length,count);assert.ok(Number.isFinite(plan.active_ray.column_density_mwe));
 // Canvas backing dimensions stay proportional when sidebars/window change.
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);for(const selector of ['#toggleLeft','#toggleRight'])await invoke(selector);await page.waitForFunction(()=>{const c=document.querySelector('#webgl canvas'),r=c?.getBoundingClientRect();return r?.width>0&&r.height>0&&Math.abs(c.width/c.height-r.width/r.height)<.01;},null,{timeout:10000});}
 await page.reload();await ready();assert.equal(await page.locator('#cfgExposure').count(),1);await invoke('#deviceSettings');assert.equal(await page.locator('#cfgExposure').inputValue(),'60');await invoke('#deviceCancel');
 assert.deepEqual(errors,[]);console.log('Main application: desktop/narrow, views, layers, cancellation, device/stations, persistence and exports passed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
