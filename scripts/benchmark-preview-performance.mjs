// Development-only, real HTTP production-page measurements. No scientific writes.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import assert from 'node:assert/strict';
const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
const { chromium } = await import(args.includes('--playwright') ? pathToFileURL(value('--playwright')).href : 'playwright');
const root = new URL('../dist/', import.meta.url);
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname, file = new URL(`.${path}`, root);
    if (!file.href.startsWith(root.href)) return response.writeHead(403).end();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
const rows = [];
const memoryTimers = new Set();
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--host-resolver-rules=MAP muon-perf.test 127.0.0.1'] });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
    const cdp = await context.newCDPSession(page), browserCdp = await browser.newBrowserCDPSession(), memory = [];
    let sampling = Promise.resolve();
    const sampleMemory = async () => {
      const heap = await cdp.send('Runtime.getHeapUsage');
      const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
      const rss = await Promise.all(processInfo.map(async p => {
        try { const status = await readFile(`/proc/${p.id}/status`, 'utf8'); return Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024; } catch { return 0; }
      }));
      memory.push({ at: Date.now(), mainIsolateHeapUsedBytes: heap.usedSize, mainIsolateBackingBytes: heap.backingStorageSize ?? null,
        browserProcessRssSumBytes: rss.reduce((a, b) => a + b, 0), processCount: processInfo.length });
    };
    const timer = setInterval(() => { sampling = sampling.then(sampleMemory).catch(error => errors.push(`Memory sampler: ${error.message}`)); }, 250);
    memoryTimers.add(timer);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      globalThis.perfEvidence = { longTasks: [], workerReplies: [], heap: [], frames: [], overlayWork: [], numericInputs: {} };
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.name.startsWith('pattern:')) perfEvidence.overlayWork.push({ name: e.name, start: e.startTime, duration: e.duration }); }).observe({ type: 'measure', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) perfEvidence.longTasks.push({ start: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true });
      const Original = Worker;
      globalThis.Worker = class extends Original {
        constructor(...args) { super(...args); this.patternChunks = new Map(); this.addEventListener('message', ({ data }) => { if (data.performance) perfEvidence.workerReplies.push({ at: performance.now(), ...data.performance }); }); }
        postMessage(data, ...args) {
          if (data.input && ['material', 'assessment'].includes(data.graph)) perfEvidence.numericInputs[data.graph] = data.input;
          if (data.inputChunk === 'header' && ['material', 'assessment'].includes(data.request.graph)) this.patternChunks.set(data.id, { graph: data.request.graph, input: { ...data.header, pixels: [] } });
          const chunk = this.patternChunks.get(data.id);
          if (chunk && data.inputChunk === 'pixels') chunk.input.pixels.push(...data.pixels);
          if (chunk && data.inputChunk === 'end') { perfEvidence.numericInputs[chunk.graph] = chunk.input; this.patternChunks.delete(data.id); }
          if (data.inputChunk === 'cancel') this.patternChunks.delete(data.id);
          return super.postMessage(data, ...args);
        }
      };
      const observer = new MutationObserver(() => {
        const bins = document.getElementById('projectionBins'), half = document.getElementById('halfAngle');
        if (bins?.querySelector('option[value="65"]') && half) { bins.value = '65'; half.value = '65'; observer.disconnect(); }
      }); observer.observe(document, { subtree: true, childList: true });
      setInterval(() => { if (performance.memory) perfEvidence.heap.push({ at: performance.now(), bytes: performance.memory.usedJSHeapSize }); }, 50);
      let previous = performance.now();
      function frame(at) { perfEvidence.frames.push({ at, gap: at - previous }); previous = at; requestAnimationFrame(frame); } requestAnimationFrame(frame);
    });
    await page.goto(`http://muon-perf.test:${server.address().port}/geometry-preview.html`);
    for (const scenario of ['low', 'high', 'mid', 'extreme']) {
      const wallStart = Date.now();
      const start = await page.evaluate(() => performance.now());
      if (scenario !== 'low') await page.locator('#scenario').selectOption(scenario);
      await page.waitForFunction(id => document.getElementById('assessmentStatus').textContent.includes(`65×65 complete · ${id}`)
        && ['material', 'assessment'].every(graph => document.getElementById(`${graph}ReferenceLegend`).textContent.includes('Physical scope unresolved')
          && document.getElementById(`${graph}ContributionLegend`).textContent.includes('not comparable across views'))
        && document.getElementById('responseLegend').textContent.includes('acceptance + directional flux'), scenario, { timeout: 120000 });
      const timing = await page.evaluate(start => {
        const now = performance.now(), data = perfEvidence;
        return { elapsedMs: now - start, overlayWork: data.overlayWork.filter(e => e.start >= start), longTasks: data.longTasks.filter(e => e.start >= start), workerReplies: data.workerReplies.filter(e => e.at >= start),
          mainHeapPeakBytes: Math.max(0, ...data.heap.filter(e => e.at >= start).map(e => e.bytes)), frameGapMaxMs: Math.max(0, ...data.frames.filter(e => e.at >= start).map(e => e.gap)),
          segments: Object.fromEntries(['material', 'assessment'].map(g => [g, document.getElementById(`${g}ReferenceLegend`).textContent])) };
      }, start);
      const controls = await page.evaluate(async () => {
        const input = document.getElementById('finiteRock'), handlers = [], nextPaint = [];
        for (let i = 0; i < 20; i++) {
          const start = performance.now(); input.checked = !input.checked; input.dispatchEvent(new Event('change')); handlers.push(performance.now() - start);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); nextPaint.push(performance.now() - start);
        }
        handlers.sort((a, b) => a - b); nextPaint.sort((a, b) => a - b);
        return { repetitions: 20, handlerP95Ms: handlers[18], handlerMaxMs: handlers[19], twoFrameAcknowledgementP95Ms: nextPaint[18] };
      });
      timing.memorySamples = memory.filter(e => e.at >= wallStart);
      const numericBatch = await page.evaluate(async () => {
        const moduleUrl = new URL('./modules/numeric-pattern-work.js', location.href).href;
        const source = `import { prepareNumericPattern } from ${JSON.stringify(moduleUrl)};
          self.onmessage = ({data}) => { try {
            const times = []; for(let i=0;i<25;i++) { const start=performance.now();
              for(const result of data) for(const material of ['concrete','rock']) prepareNumericPattern('contribution',result,
                {material,quantity:'material-column',levelOptions:{mode:'physical',units:'m.w.e.',levels:[1,10,100]}});
              if(i>=5) times.push(performance.now()-start);
            } times.sort((a,b)=>a-b); self.postMessage({p95Ms:times[18],maxMs:times[19],repetitions:20,warmups:5});
          } catch(error) { self.postMessage({error:error.message}); } };`;
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' })), worker = new Worker(url, { type: 'module' });
        try { return await new Promise((resolve,reject) => { worker.onmessage = ({data}) => data.error ? reject(new Error(data.error)) : resolve(data); worker.onerror = e => reject(new Error(e.message)); worker.postMessage([perfEvidence.numericInputs.material, perfEvidence.numericInputs.assessment]); }); }
        finally { worker.terminate(); URL.revokeObjectURL(url); }
      });
      rows.push({ viewport, scenario, bins: 65, halfAngleDeg: 65, cache: 'fresh context / no-store; one cold worker per scenario', timing, controls, numericBatch });
      console.log(JSON.stringify({ viewport, scenario, elapsedMs: timing.elapsedMs, longestTaskMs: Math.max(0, ...timing.longTasks.map(e => e.duration)), controls }));
    }
    const ack = await page.evaluate(() => {
      const start = performance.now(), input = document.getElementById('azimuth');
      input.value = '190'; input.dispatchEvent(new Event('input')); input.value = '180'; input.dispatchEvent(new Event('input'));
      return { elapsedMs: performance.now() - start, staleReferencePaths: document.querySelectorAll('#materialReferenceOverlay path,#assessmentReferenceOverlay path').length };
    });
    assert.equal(ack.staleReferencePaths, 0);
    await page.waitForFunction(() => document.getElementById('assessmentReferenceLegend').textContent.includes('Physical scope unresolved'), null, { timeout: 120000 });
    rows.push({ viewport, cancellation: ack, errors }); assert.deepEqual(errors, []);
    await cdp.send('HeapProfiler.collectGarbage');
    const retentionStart = Date.now(), beforeCapture = await cdp.send('Runtime.getHeapUsage'), captureTimes = [];
    for (let i = 0; i < 20; i++) captureTimes.push(await page.evaluate(async () => {
      const start = performance.now(); document.getElementById('captureComparison').click();
      const elapsed = performance.now() - start;
      await new Promise(resolve => requestAnimationFrame(resolve)); return elapsed;
    }));
    await page.waitForFunction(() => document.querySelectorAll('#comparisonSummary p').length === 22, null, { timeout: 60000 });
    const rowsAtLimit = await page.locator('#comparisonSummary p').count();
    await page.locator('#captureComparison').click();
    assert.equal(await page.locator('#comparisonSummary p').count(), rowsAtLimit);
    assert.equal(rowsAtLimit, 22, '20 rows plus notice and sensitivity');
    const fullCapture = await cdp.send('Runtime.getHeapUsage');
    await page.locator('#clearComparison').click();
    assert.equal(await page.locator('#comparisonSummary').textContent(), 'No saved assessments.');
    await cdp.send('HeapProfiler.collectGarbage');
    const afterClearGc = await cdp.send('Runtime.getHeapUsage');
    rows.push({ viewport, retention: { captures: 20, limitEnforced: true, captureHandlerMs: captureTimes,
      beforeCapture, fullCapture, afterClearGc, memorySamples: memory.filter(e => e.at >= retentionStart),
      limitation: 'Forced GC checkpoints test retained heap, not normal-operation peak memory; repeated identical captures are not all settings/poses.' } });
    clearInterval(timer); memoryTimers.delete(timer); await sampling; assert.deepEqual(errors, []); await cdp.detach(); await browserCdp.detach(); await context.close();
  }
  const report = { version: '1.0.0', date: '2026-10-07', browser: browser.version(), environment: { node: process.version, platform: os.platform(), cpu: os.cpus()[0].model }, rows,
    limitations: ['Fresh context/no-store is browser cold, not OS disk cache cold.', 'CDP main-isolate heap excludes worker heaps; browser process RSS sum includes workers/GPU/utilities but double-counts shared pages and is not private RAM.', 'Memory sampled every 250ms can miss transient peaks; performance.memory may be coarse.', 'Animation frames/long tasks include scientific calculation and WebGL/software rendering; overlay User Timing separately attributes synchronous view work, not paint.', 'Eight bounded views are not all poses/machines; 20 repetitions are a development baseline, not an SLA.'] };
  if (args.includes('--output')) await writeFile(value('--output'), JSON.stringify(report, null, 2));
} finally { for (const timer of memoryTimers) clearInterval(timer); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
