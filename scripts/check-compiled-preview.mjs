// Optional browser smoke check. Playwright is development tooling only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { replayContributionExport } from '../dist/modules/contribution-export.js';
import { mapContributionOverlayToGraph } from '../dist/modules/projection-pattern-fields.js';
import { contributionPathData } from '../dist/modules/contribution-view.js';
import { replayPatternComparison } from '../dist/modules/pattern-comparison.js';
import { replayPatternLayerExport } from '../dist/modules/pattern-layer-export.js';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--playwright')) throw new Error('Usage: node scripts/check-compiled-preview.mjs [--playwright /path/to/playwright/index.mjs]');
const { chromium } = await import(args[1] ? pathToFileURL(args[1]).href : 'playwright');
const root = new URL('../dist/', import.meta.url), artifacts = await mkdtemp(join(tmpdir(), 'muon-preview-check-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = new URL(`.${pathname === '/' ? '/index.html' : pathname}`, root);
    if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', mime[extname(file.pathname)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-proxy-server', '--host-resolver-rules=MAP muon-preview.test 127.0.0.1'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Preview page error:', error.message); });
  await page.addInitScript(() => {
    globalThis.previewDrawCalls = 0;
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const method of ['drawElements', 'drawArrays']) {
        const original = Type.prototype[method];
        Type.prototype[method] = function (...args) { previewDrawCalls++; return original.apply(this, args); };
      }
    }
  });
  const address = `http://muon-preview.test:${server.address().port}`;
  await page.goto(`${address}/geometry-preview.html`);
  assert.equal(await page.evaluate(() => Boolean(globalThis.crypto?.subtle)), false, 'LAN HTTP smoke must exercise portable SHA-256');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('upstream 288 m'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#paths tr').length === 5);
  await page.waitForFunction(() => document.getElementById('projectionStatus').textContent.includes('complete · low'));
  await page.locator('#materialProjection').scrollIntoViewIfNeeded();
  const projection = await page.locator('#materialProjection').boundingBox();
  await page.mouse.click(projection.x + projection.width / 2, projection.y + projection.height / 2);
  assert.ok((await page.locator('#projectionPixel').textContent()).includes('sx 0.000, sy 0.000'));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportProjection').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.scenarioId, 'low'); assert.equal(exported.pixels.length, 625);
  assert.equal(exported.kind, 'material-column-projection');
  assert.equal(exported.display.colorScale.mode, 'adaptive');
  const lowProjection = await page.locator('#materialProjection').evaluate(canvas => canvas.toDataURL());
  await page.locator('#projectionScale').selectOption('fixed');
  assert.ok((await page.locator('#projectionScaleLegend').textContent()).includes('Fixed linear'));
  assert.notEqual(await page.locator('#materialProjection').evaluate(canvas => canvas.toDataURL()), lowProjection);
  assert.equal(await page.locator('#column').textContent(), `Column density: ${exported.pixels[312].mwe.toFixed(2)} m.w.e.`);
  await page.locator('#projectionScale').selectOption('adaptive');
  assert.equal(await page.locator('#materialProjection').evaluate(canvas => canvas.toDataURL()), lowProjection);
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('complete · low'));
  await page.locator('#assessmentProjection').scrollIntoViewIfNeeded();
  const assessmentCanvas = await page.locator('#assessmentProjection').boundingBox();
  await page.mouse.click(assessmentCanvas.x + assessmentCanvas.width / 2, assessmentCanvas.y + assessmentCanvas.height / 2);
  assert.ok((await page.locator('#assessmentPixel').textContent()).includes('events/30 days'));
  const assessmentDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportAssessment').click();
  const assessmentDownload = await assessmentDownloadPromise;
  const assessmentExport = JSON.parse(await readFile(await assessmentDownload.path(), 'utf8'));
  assert.equal(assessmentExport.kind, 'compiled-detector-assessment');
  assert.equal(assessmentExport.scenarioId, 'low'); assert.equal(assessmentExport.pixels.length, 625);
  assert.equal(assessmentExport.modelVersion, 'legacy-quick-response@1.0.0');
  assert.equal(assessmentExport.semanticAudit.targets.length, 22);
  assert.deepEqual(assessmentExport.semanticAudit.unresolvedComponents, ['concrete', 'rock', 'steel_gates']);
  assert.equal(await page.locator('#column').textContent(), `Column density: ${assessmentExport.pixels[312].mwe.toFixed(2)} m.w.e.`);
  const coldReferenceStart = Date.now();
  await page.waitForFunction(() => document.getElementById('materialReferenceLegend').textContent.includes('Physical scope unresolved')
    && document.getElementById('assessmentReferenceLegend').textContent.includes('Physical scope unresolved'), null, { timeout: 60000 });
  const coldReferenceWaitMs = Date.now() - coldReferenceStart;
  assert.ok(await page.locator('#materialReferenceOverlay path[data-material="concrete"]').count() > 0);
  assert.ok(await page.locator('#assessmentReferenceOverlay path[data-material="concrete"]').count() > 0);
  const finitePaths = await page.locator('#materialReferenceOverlay').innerHTML();
  await page.locator('#envelopeDepthEdges').uncheck();
  assert.equal(await page.locator('#materialReferenceOverlay').innerHTML(), finitePaths);
  await page.locator('#finiteConcrete').uncheck();
  assert.equal(await page.locator('#materialReferenceOverlay path[data-material="concrete"]').count(), 0);
  await page.locator('#finiteConcrete').check();
  assert.equal(await page.locator('#materialReferenceOverlay').innerHTML(), finitePaths);
  await page.locator('#envelopeDepthEdges').check();
  const responsePaths = await page.locator('#assessmentResponseOverlay').innerHTML();
  assert.ok(await page.locator('#assessmentResponseOverlay path').count() > 0);
  await page.locator('#responseContours').uncheck(); assert.equal(await page.locator('#assessmentResponseOverlay path').count(), 0);
  await page.locator('#responseContours').check(); assert.equal(await page.locator('#assessmentResponseOverlay').innerHTML(), responsePaths);
  await page.locator('#responseContext').selectOption('open-sky');
  await page.waitForFunction(() => document.getElementById('responseLegend').textContent.includes('acceptance + directional flux'));
  await page.locator('#responseContext').selectOption('through');
  await page.locator('#assessmentProjection').scrollIntoViewIfNeeded();
  const point = await page.locator('#assessmentReferenceOverlay path[data-material="concrete"][data-role="contour"]').first().evaluate(path => {
    const p = path.getPointAtLength(path.getTotalLength() / 2), r = path.ownerSVGElement.getBoundingClientRect(), n = path.ownerSVGElement.viewBox.baseVal.width;
    return { x: r.left + p.x / n * r.width, y: r.top + p.y / n * r.height };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForFunction(() => document.getElementById('assessmentReferenceHover').textContent.includes('canonical entity unresolved'));
  assert.ok((await page.locator('#responseFeatureContext').textContent()).includes('No significance/resolve claim'));
  await page.locator('#captureComparison').click();
  const comparisonDownloadPromise = page.waitForEvent('download'); comparisonDownloadPromise.catch(() => {}); await page.locator('#exportComparison').click();
  assert.ok(!(await page.locator('#comparisonSummary').textContent()).includes('Export unavailable'), await page.locator('#comparisonSummary').textContent());
  const comparisonDownload = await comparisonDownloadPromise, comparisonBytes = await readFile(await comparisonDownload.path());
  const comparisonExport = replayPatternComparison(JSON.parse(comparisonBytes));
  assert.equal(comparisonExport.entries[0].references.length, 2);
  assert.deepEqual(comparisonExport.entries[0].result.pixels, assessmentExport.pixels);
  await page.locator('#clearComparison').click();
  await page.locator('#importComparison').setInputFiles({ name: 'comparison.json', mimeType: 'application/json', buffer: comparisonBytes });
  await page.waitForFunction(() => document.getElementById('comparisonSummary').textContent.includes('Controlled comparison'));
  console.log(JSON.stringify({ finiteReferenceGate: 'PASS', coldReferenceWaitMs, meaning: 'wait after initial scientific calculation; preprocessing runs off main thread' }));
  for (const graph of ['Material', 'Assessment']) {
    const promise = page.waitForEvent('download'); await page.locator(`#export${graph}Patterns`).click();
    const file = await promise, document = JSON.parse(await readFile(await file.path(), 'utf8'));
    const replay = replayPatternLayerExport(document);
    assert.equal(replay.referenceVerification, 'stored-integrity-only'); assert.equal(document.references.length, 2);
    assert.equal(document.response !== null, graph === 'Assessment');
  }
  for (const [id, graph, raw] of [['exportMaterialContours', 'material', exported], ['exportAssessmentContours', 'assessment', assessmentExport]]) {
    const promise = page.waitForEvent('download'); await page.locator(`#${id}`).click();
    const file = await promise, contourExport = JSON.parse(await readFile(await file.path(), 'utf8'));
    const replay = replayContributionExport(contourExport);
    assert.equal(contourExport.schemaVersion, '1.0.0'); assert.equal(contourExport.graphKind, raw.kind);
    assert.deepEqual(replay.entries, contourExport.entries);
    const expectedPaths = [];
    for (const { field, contours } of replay.entries) {
      assert.deepEqual(field.values, raw.pixels.map(p => p.materialColumns[field.material]));
      for (const overlay of contours.overlays) {
        const mapped = mapContributionOverlayToGraph(overlay, field, { width: raw.config.bins, height: raw.config.bins });
        if (mapped.lines.length) expectedPaths.push(contributionPathData(mapped.lines));
      }
    }
    assert.deepEqual(await page.locator(`#${graph}ContributionOverlay path[data-role="contour"]`).evaluateAll(paths => paths.map(p => p.getAttribute('d'))), expectedPaths);
  }
  // Contribution layers are separate vectors, independent of heuristic depth
  // diagnostics and scientific raster values. Readability uses CSS pixels.
  assert.ok(await page.locator('#materialContributionOverlay path[data-role="contour"]').count() > 0);
  assert.ok(await page.locator('#assessmentContributionOverlay path[data-role="contour"]').count() > 0);
  assert.ok((await page.locator('#materialContributionLegend').textContent()).includes('not comparable across views'));
  const contributionPaths = await page.locator('#materialContributionOverlay').innerHTML();
  const contributionSummary = await page.locator('#assessmentSummary').textContent();
  await page.locator('#envelopeDepthEdges').uncheck();
  assert.equal(await page.locator('#materialContributionOverlay').innerHTML(), contributionPaths);
  await page.locator('#concreteEnvelope').uncheck(); await page.locator('#rockEnvelope').uncheck();
  assert.equal(await page.locator('#materialContributionOverlay').innerHTML(), contributionPaths);
  await page.locator('#contributionVisible').uncheck();
  assert.equal(await page.locator('#materialContributionOverlay path').count(), 0);
  await page.locator('#contributionVisible').check();
  assert.equal(await page.locator('#materialContributionOverlay').innerHTML(), contributionPaths);
  await page.locator('#contributionMaterials input[value="concrete"]').uncheck();
  assert.equal(await page.locator('#materialContributionOverlay path[data-material="concrete"]').count(), 0);
  await page.locator('#contributionMaterials input[value="concrete"]').check();
  assert.equal(await page.locator('#materialContributionOverlay').innerHTML(), contributionPaths);
  await page.locator('#contributionMode').selectOption('physical');
  assert.ok((await page.locator('#materialContributionLegend').textContent()).includes('Enter increasing'));
  const columns = exported.pixels.map(p => p.materialColumns.concrete);
  await page.locator('#contributionLevels').fill(String((Math.min(...columns) + Math.max(...columns)) / 2));
  await page.locator('#contributionLevels').press('Tab');
  await page.waitForFunction(() => document.getElementById('materialContributionLegend').textContent.includes('Explicit physical levels'));
  assert.ok((await page.locator('#materialContributionLegend').textContent()).includes('Explicit physical levels'));
  await page.locator('#contributionLevels').fill('bad,1'); await page.locator('#contributionLevels').press('Tab');
  await page.waitForFunction(() => document.getElementById('materialContributionLegend').textContent.includes('unavailable'));
  assert.equal(await page.locator('#materialContributionOverlay path').count(), 0);
  assert.ok((await page.locator('#materialContributionLegend').textContent()).includes('unavailable'));
  await page.locator('#contributionMode').selectOption('adaptive');
  await page.locator('#contributionQuantity').selectOption('material-path');
  await page.waitForFunction(() => document.getElementById('materialContributionLegend').textContent.includes(' · path ·'));
  assert.ok((await page.locator('#materialContributionLegend').textContent()).includes('path'));
  await page.locator('#contributionQuantity').selectOption('material-column');
  assert.equal(await page.locator('#materialContributionOverlay').innerHTML(), contributionPaths);
  await page.locator('#envelopeDepthEdges').check();
  await page.locator('#concreteEnvelope').check(); await page.locator('#rockEnvelope').check();
  assert.equal(await page.locator('#assessmentSummary').textContent(), contributionSummary);
  const unchangedDownloadPromise = page.waitForEvent('download'); await page.locator('#exportProjection').click();
  const unchangedDownload = await unchangedDownloadPromise;
  const unchangedExport = JSON.parse(await readFile(await unchangedDownload.path(), 'utf8'));
  assert.deepEqual(unchangedExport.pixels, exported.pixels);
  assert.deepEqual(unchangedExport.config, exported.config);
  assert.deepEqual(unchangedExport.projectionGeometry, exported.projectionGeometry);
  const countMap = await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL());
  const envelopeColumn = await page.locator('#column').textContent();
  const envelopeSummary = await page.locator('#assessmentSummary').textContent();
  await page.locator('#concreteEnvelope').uncheck(); await page.locator('#rockEnvelope').uncheck();
  assert.notEqual(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  assert.equal(await page.locator('#column').textContent(), envelopeColumn);
  assert.equal(await page.locator('#assessmentSummary').textContent(), envelopeSummary);
  await page.locator('#concreteEnvelope').check(); await page.locator('#rockEnvelope').check();
  assert.equal(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  const unchangedColumn = await page.locator('#column').textContent();
  const unchangedSummary = await page.locator('#assessmentSummary').textContent();
  await page.locator('#semanticTarget').selectOption('gallery_upper');
  assert.ok((await page.locator('#targetRay').textContent()).includes('gallery_upper'));
  assert.notEqual(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  assert.equal(await page.locator('#column').textContent(), unchangedColumn);
  assert.equal(await page.locator('#assessmentSummary').textContent(), unchangedSummary);
  await page.locator('#semanticTarget').selectOption('');
  assert.equal(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  await page.locator('#assessmentMode').selectOption('transmission');
  assert.notEqual(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  await page.locator('#assessmentMode').selectOption('counts');
  assert.equal(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  await page.locator('#assessmentExposure').fill('60');
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('complete · low'));
  assert.ok((await page.locator('#assessmentSummary').textContent()).includes('60 days'));
  await page.locator('#assessmentExposure').fill('30');
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('complete · low'));
  assert.equal(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  // Return to the exact central material ray used by the overlay assertions.
  await page.locator('#materialProjection').scrollIntoViewIfNeeded();
  const materialRect = await page.locator('#materialProjection').boundingBox();
  await page.mouse.click(materialRect.x + materialRect.width / 2, materialRect.y + materialRect.height / 2);
  await page.locator('#release').scrollIntoViewIfNeeded();
  const low = await page.locator('#paths').textContent();
  await page.screenshot({ path: join(artifacts, 'desktop.png') });
  await page.locator('#air').check(); await page.locator('#virtual').check();
  assert.equal(await page.locator('#paths').textContent(), low, 'Display overlays must not change material paths');
  assert.equal(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap);
  assert.equal(await page.locator('#materialProjection').evaluate(canvas => canvas.toDataURL()), lowProjection);
  await page.locator('#scenario').selectOption('high');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('upstream 298 m'));
  await page.waitForFunction(() => !document.getElementById('trace').disabled && document.querySelectorAll('#paths tr').length === 5);
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('complete · high'));
  await page.waitForFunction(() => document.getElementById('assessmentReferenceLegend').textContent.includes('Physical scope unresolved'), null, { timeout: 60000 });
  assert.notEqual(await page.locator('#paths').textContent(), low, 'Scenario change must refresh the material result');
  for (const scenario of ['mid', 'extreme', 'low']) {
    await page.locator('#scenario').selectOption(scenario);
    await page.waitForFunction(() => !document.getElementById('trace').disabled);
    await page.waitForFunction(() => document.getElementById('assessmentReferenceLegend').textContent.includes('Physical scope unresolved'), null, { timeout: 60000 });
  }
  await page.waitForFunction(() => document.getElementById('projectionStatus').textContent.includes('complete · low'));
  await page.locator('#azimuth').fill('190');
  await page.locator('#azimuth').fill('180');
  await page.waitForFunction(() => document.getElementById('projectionStatus').textContent.includes('complete · low'));
  assert.equal(await page.locator('#materialProjection').evaluate(canvas => canvas.toDataURL()), lowProjection, 'Cancelled work must not overwrite the latest pose');
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('complete · low'));
  assert.equal(await page.locator('#assessmentProjection').evaluate(canvas => canvas.toDataURL()), countMap, 'Cancelled assessment must not overwrite the latest pose');
  await page.locator('#halfAngle').fill('65');
  await page.waitForFunction(() => document.querySelectorAll('#materialReferenceOverlay path[data-material="rock"]').length > 0, null, { timeout: 60000 });
  const wideReferences = await page.locator('#materialReferenceOverlay').innerHTML();
  await page.locator('#envelopeDepthEdges').uncheck();
  assert.equal(await page.locator('#materialReferenceOverlay').innerHTML(), wideReferences);
  await page.locator('#finiteRock').uncheck(); assert.equal(await page.locator('#materialReferenceOverlay path[data-material="rock"]').count(), 0);
  await page.locator('#finiteRock').check(); assert.equal(await page.locator('#materialReferenceOverlay').innerHTML(), wideReferences);
  await page.locator('#envelopeDepthEdges').check(); await page.locator('#halfAngle').fill('30');
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('25×25 complete · low'));
  await page.waitForFunction(() => ['material', 'assessment'].every(g => document.getElementById(`${g}ContributionLegend`).textContent.includes('not comparable across views')));
  await page.locator('#projectionBins').selectOption('65');
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('65×65 complete · low'));
  await page.waitForFunction(() => document.getElementById('assessmentReferenceOverlay').getAttribute('viewBox') === '0 0 65 65', null, { timeout: 60000 });
  const referenceTiming = await page.evaluate(() => {
    const times = [], input = document.getElementById('finiteConcrete');
    for (let i = 0; i < 20; i++) { const start = performance.now(); input.checked = !input.checked; input.dispatchEvent(new Event('change')); times.push(performance.now() - start); }
    times.sort((a, b) => a - b);
    return { bins: 65, repetitions: 20, cachedReferenceHandlerP95Ms: times[18], maxMs: times[19],
      linePathCount: document.querySelectorAll('#materialReferenceOverlay path,#assessmentReferenceOverlay path').length,
      meaning: 'both-graph cached reference SVG/control work; excludes paint, worker cold preparation and rays' };
  });
  console.log(JSON.stringify({ referenceTiming })); assert.ok(referenceTiming.cachedReferenceHandlerP95Ms <= 100);
  assert.equal(await page.locator('#materialContributionOverlay').getAttribute('viewBox'), '0 0 65 65');
  assert.equal(await page.locator('#assessmentContributionOverlay').getAttribute('viewBox'), '0 0 65 65');
  assert.ok(await page.locator('#materialContributionOverlay path[data-role="contour"]').count() > 0);
  const toggleTiming = await page.evaluate(() => {
    const input = document.getElementById('contributionVisible'), times = [];
    for (let i = 0; i < 20; i++) {
      input.checked = false; input.dispatchEvent(new Event('change'));
      const start = performance.now(); input.checked = true; input.dispatchEvent(new Event('change'));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { bins: 65, repetitions: 20, cachedBothGraphsHandlerP95Ms: times[18], maxMs: times[19],
      meaning: 'synchronous cached mapping/SVG DOM update; excludes paint and ray calculation' };
  });
  console.log(JSON.stringify({ contributionToggleTiming: toggleTiming }));
  await page.locator('#projectionBins').selectOption('25');
  await page.waitForFunction(() => document.getElementById('assessmentStatus').textContent.includes('25×25 complete · low'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#focus').click(); await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#viewport canvas'), rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && Math.abs(canvas.width / canvas.height - rect.width / rect.height) < 0.005;
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Narrow preview must not overflow horizontally');
  for (const id of ['material', 'assessment']) {
    const geometry = await page.locator(`#${id}ContributionOverlay`).evaluate(svg => {
      const rect = svg.getBoundingClientRect(), raster = svg.previousElementSibling.getBoundingClientRect();
      const path = svg.querySelector('path[data-role="contour"]');
      return { width: rect.width, height: rect.height, rasterWidth: raster.width, rasterHeight: raster.height,
        stroke: path?.getAttribute('stroke-width'), effect: path?.getAttribute('vector-effect') };
    });
    assert.equal(geometry.width, geometry.rasterWidth); assert.equal(geometry.height, geometry.rasterHeight);
    assert.equal(geometry.stroke, '1.5'); assert.equal(geometry.effect, 'non-scaling-stroke');
    await page.waitForFunction(graph => document.getElementById(`${graph}ReferenceOverlay`).getAttribute('viewBox') === '0 0 25 25', id, { timeout: 60000 });
    const finiteGeometry = await page.locator(`#${id}ReferenceOverlay`).evaluate(svg => {
      const rect = svg.getBoundingClientRect(), raster = document.getElementById(svg.id.startsWith('material') ? 'materialProjection' : 'assessmentProjection').getBoundingClientRect();
      const path = svg.querySelector('path[data-role="contour"]');
      return { width: rect.width, height: rect.height, rasterWidth: raster.width, rasterHeight: raster.height,
        stroke: path?.getAttribute('stroke-width'), effect: path?.getAttribute('vector-effect') };
    });
    assert.equal(finiteGeometry.width, finiteGeometry.rasterWidth); assert.equal(finiteGeometry.height, finiteGeometry.rasterHeight);
    assert.equal(finiteGeometry.stroke, '1.5'); assert.equal(finiteGeometry.effect, 'non-scaling-stroke');
  }
  await page.screenshot({ path: join(artifacts, 'narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#focus').click();
  await page.evaluate(() => scrollTo(0, 0));
  const canvas = await page.locator('#viewport canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  assert.ok((await page.locator('#picked').textContent()).includes('source mapping:'), 'Surface picking should preserve component identity');
  const demandRendering = await page.evaluate(async () => {
    const settle = async () => {
      let stable = 0, previous = previewDrawCalls;
      for (let i = 0; i < 240 && stable < 8; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        stable = previewDrawCalls === previous ? stable + 1 : 0; previous = previewDrawCalls;
      }
      assertIdle(stable); return previewDrawCalls;
    };
    function assertIdle(stable) { if (stable < 8) throw new Error('Preview renderer never became idle'); }
    const idle = await settle();
    document.getElementById('air').click();
    const changed = await settle();
    document.getElementById('air').click(); await settle();
    return { idle, changed };
  });
  assert.ok(demandRendering.idle > 0 && demandRendering.changed > demandRendering.idle, 'Scene visibility changes must draw, then stop when idle');
  const beforeOrbit = await page.evaluate(() => previewDrawCalls);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width / 2 + 30, canvas.y + canvas.height / 2 + 10, { steps: 4 }); await page.mouse.up();
  await page.waitForFunction(before => previewDrawCalls > before, beforeOrbit);
  await page.evaluate(async () => {
    document.getElementById('captureComparison').click();
    document.getElementById('clearComparison').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await page.locator('#comparisonSummary').textContent(), 'No saved assessments.', 'Clear must cancel pending comparison work');
  const legacy = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  legacy.on('pageerror', error => errors.push(error.message));
  await legacy.goto(`${address}/`);
  await legacy.waitForFunction(() => document.getElementById('loading')?.style.display === 'none', null, { timeout: 30000 });
  // Final assessment formats transmission with two decimals; the initial
  // coarse estimate has one. Exercise the extracted core through the real UI.
  await legacy.waitForFunction(() => /^\d+\.\d{2}%$/.test(document.getElementById('sky').textContent), null, { timeout: 30000 });
  await legacy.locator('#mainPatternControls').evaluate(node => { node.open = true; });
  await legacy.locator('#mainMaterialContours').check(); await legacy.locator('#mainResponseContours').check();
  assert.ok(await legacy.locator('#mainPatternOverlay path').count() > 0);
  assert.ok((await legacy.locator('#mainPatternLegend').textContent()).includes('legacy-dda@1.0.0'));
  await legacy.locator('#mainCaptureComparison').click();
  const mainDownloadPromise = legacy.waitForEvent('download'); await legacy.locator('#mainExportComparison').click();
  const mainDownload = await mainDownloadPromise, mainBytes = await readFile(await mainDownload.path());
  const mainExport = replayPatternComparison(JSON.parse(mainBytes));
  assert.equal(mainExport.entries[0].result.backend, 'legacy-dda@1.0.0');
  assert.equal(mainExport.entries[0].result.kind, 'legacy-detector-assessment');
  await legacy.locator('#mainClearComparison').click();
  await legacy.locator('#mainImportComparison').setInputFiles({ name: 'main.json', mimeType: 'application/json', buffer: mainBytes });
  await legacy.waitForFunction(() => document.getElementById('mainComparisonSummary').textContent.includes('参数差异'));
  const initialMainProjection = await legacy.locator('#projectionReadout').textContent();
  assert.ok(initialMainProjection.includes('总计数'));
  await legacy.locator('#elNumber').fill('45');
  await legacy.waitForFunction(initial => {
    const text = document.getElementById('projectionReadout').textContent;
    return text.includes('总计数') && text !== initial && /^\d+\.\d{2}%$/.test(document.getElementById('sky').textContent);
  }, initialMainProjection, { timeout: 30000 });
  await legacy.setViewportSize({ width: 390, height: 844 });
  await legacy.waitForFunction(() => {
    const canvas = document.querySelector('#webgl canvas'), rect = canvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && Math.abs(canvas.width / canvas.height - rect.width / rect.height) < .01;
  });
  const mainVectorBounds = await legacy.locator('#mainPatternOverlay').evaluate(svg => {
    const s = svg.getBoundingClientRect(), c = document.getElementById('projectionCanvas').getBoundingClientRect();
    return { svg: [s.width, s.height], canvas: [c.width, c.height] };
  });
  assert.deepEqual(mainVectorBounds.svg, mainVectorBounds.canvas);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ preview: 'PASS', browser: browser.version(), scenarios: ['low', 'mid', 'high', 'extreme'], viewport_sizes: ['1440×900', '390×844'],
    external_http_sha256: 'PASS', shared_display_state: 'PASS', picking: 'PASS', legacy_app: 'PASS', screenshots: artifacts }, null, 2));
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
