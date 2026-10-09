import { prepareProjectionPattern } from './projection-pattern-fields.js';
import { numericPatternInput } from './numeric-pattern-work.js';
import { responseFeatureContext } from './response-patterns.js';
import { createNumericPatternClient } from './numeric-pattern-client.js';
import { createPatternComparisonExport, replayPatternComparison } from './pattern-comparison.js';
import { drawContributionPaths } from './contribution-view.js';
import { createPatternLayerExport } from './pattern-layer-export.js';
import { timePatternWork, deferPatternWork } from './pattern-timing.js';
import { createPatternCaptureStore } from './pattern-capture-store.js';
import { postPatternInputChunks } from './pattern-input-chunks.js';

export function createPatternPreview({ getResults, getStationLabel }) {
  const $ = id => document.getElementById(id), cache = new WeakMap(), pending = new WeakMap(), responseWork = createNumericPatternClient();
  let worker, workerKey, nextId = 0, generation = 0, entries = [];
  let comparisonWorker, comparisonRevision = 0, comparisonNextId = 0;
  const comparisonIds = new WeakMap(), comparisonSent = new Set();
  const captureStore = createPatternCaptureStore(), noReferences = [];
  const requests = new Map();
  const enabled = () => ['concrete', 'rock'].filter(m => $(`finite${m === 'concrete' ? 'Concrete' : 'Rock'}`).checked);
  function geometryWorker(result) {
    const key = `${result.identity.release_id}/${result.scenarioId}`;
    if (workerKey !== key) {
      worker?.terminate(); requests.clear(); workerKey = key;
      worker = new Worker(new URL('./finite-reference-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const request = requests.get(data.id); requests.delete(data.id);
        if (!request || request.generation !== generation || getResults()[request.graph] !== request.result) return;
        pending.delete(request.result);
        if (data.error) { cache.set(request.result, { error: data.error }); drawReference(request.graph); return; }
        if (data.snapshotKey !== prepareProjectionPattern(request.result).snapshot.key) return;
        cache.set(request.result, { overlays: data.overlays, allLayers: data.allLayers, includeCreases: request.includeCreases }); drawReference(request.graph);
      };
      worker.onerror = event => {
        for (const request of requests.values()) if (request.generation === generation) {
          cache.set(request.result, { error: event.message || 'Reference worker failed' }); pending.delete(request.result); drawReference(request.graph);
        }
        requests.clear();
      };
    }
    return worker;
  }
  function drawReference(graph) {
    return timePatternWork(`references:${graph}`, () => drawReferenceNow(graph));
  }
  function drawReferenceNow(graph) {
    const result = getResults()[graph], svg = $(`${graph}ReferenceOverlay`), legend = $(`${graph}ReferenceLegend`);
    svg.replaceChildren();
    if (!result) { legend.textContent = 'Finite-model references: waiting for current calculation.'; return; }
    const includeCreases = $('finiteCreases').checked, stored = cache.get(result);
    if (stored?.error) { legend.textContent = `Unresolved finite-model references: ${stored.error}`; return; }
    if (!stored || stored.includeCreases !== includeCreases) {
      if (pending.get(result) !== includeCreases) {
        const { snapshot, grid } = prepareProjectionPattern(result), id = ++nextId;
        const materials = ['concrete', 'rock'].filter(m => Object.hasOwn(result.projectionGeometry.materials, m));
        const instance = geometryWorker(result);
        for (const [oldId, old] of requests) if (old.result === result) {
          requests.delete(oldId); instance.postMessage({ id: oldId, inputChunk: 'cancel' });
        }
        requests.set(id, { result, graph, generation, includeCreases }); pending.set(result, includeCreases);
        const requestGeneration = generation;
        const current = () => requests.has(id) && generation === requestGeneration && worker === instance && getResults()[graph] === result;
        const failed = error => { requests.delete(id); pending.delete(result); cache.set(result, { error: error.message }); drawReference(graph); };
        deferPatternWork(`reference-input:${graph}`, () => {
          try {
            const input = numericPatternInput(result);
            postPatternInputChunks(instance, { id, snapshot, grid, materials, includeCreases, featureAngleDeg: 30, nearDepthM: .001 }, input,
              { name: `reference-submit:${graph}`, current, failed });
          } catch (error) { failed(error); }
        }, current);
      }
      legend.textContent = 'Preparing source-bound finite-model references in worker…'; return;
    }
    const allLayers = stored.allLayers;
    const layers = allLayers.filter(l => enabled().includes(l.material));
    drawContributionPaths(svg, layers, result.config.bins);
    cache.set(result, { ...stored, layers, allLayers });
    $(`export${graph === 'material' ? 'Material' : 'Assessment'}Patterns`).disabled = false;
    legend.textContent = `${layers.map(l => `${l.material}: ${l.overlay.state}, ${l.overlay.lines.length} finite references, ${l.overlay.provenance.excludedCapEdges} cap-incident edges excluded`).join(' · ') || 'Reference layers hidden'}. Physical scope unresolved; known caps excluded; missing external terrain not represented.`;
  }
  function drawResponse() {
    return timePatternWork('response:assessment', drawResponseNow);
  }
  function drawResponseNow() {
    const result = getResults().assessment, svg = $('assessmentResponseOverlay'); svg.replaceChildren();
    if (!result) { $('responseLegend').textContent = 'Response contours: waiting for current assessment.'; return; }
    try {
      const selected = $('responseContext').value, counts = ['counts', 'open-sky'].includes(selected);
      const text = $('responseLevels').value.trim();
      if (!text || text.split(',').some(v => !v.trim())) throw new Error('Enter increasing response levels');
      const key = JSON.stringify([selected, text]);
      const entry = responseWork.read(result, 'assessment', key, 'response', { quantity: counts ? 'expected-count' : 'transmission',
        representation: selected === 'smoothed' ? 'display-smoothed' : 'raw',
        context: selected === 'open-sky' || selected === 'normalized' ? selected : 'through', levels: text.split(',').map(Number) },
        () => { if (getResults().assessment === result) drawResponse(); });
      if (!entry) { $('responseLegend').textContent = 'Preparing current response contours in worker…'; return; }
      const pattern = entry, layers = pattern.contours.overlays.map((overlay, index) => ({ material: 'response', color: '#65ffb0', overlay,
        mapped: entry.mapped[index], pathData: entry.pathData[index] }));
      if ($('responseContours').checked) drawContributionPaths(svg, layers, result.config.bins);
      const openTotal = result.pixels.reduce((s, p) => s + p.openCount, 0);
      $('responseLegend').textContent = `${selected} · ${pattern.field.representation} · levels ${text} ${pattern.field.units} · ${pattern.contours.description.validity}, ${pattern.field.provenance.invalidSampleCount} unsupported/out-of-model-range samples. Open-sky ${openTotal.toPrecision(5)} events includes acceptance + directional flux. N/Nopen undefined at zero support; T>1 is invalid, not clamped. Smoothing is not calibrated; no significance claim.`;
    } catch (error) { $('responseLegend').textContent = `Response contours unavailable: ${error.message}`; }
  }
  function selection() { return { kind: 'material', id: $('comparisonMaterial').value, minimumPathM: Number($('comparisonThreshold').value) }; }
  function resetComparisonWorker() {
    comparisonRevision++; comparisonWorker?.terminate(); comparisonWorker = null; comparisonSent.clear();
  }
  function showComparison() {
    const host = $('comparisonSummary'); host.replaceChildren(); $('exportComparison').disabled = !entries.length;
    if (!entries.length) { resetComparisonWorker(); host.textContent = 'No saved assessments.'; return; }
    const revision = ++comparisonRevision;
    host.textContent = `Preparing comparison for ${entries.length} saved assessments…`;
    if (!comparisonWorker) {
      comparisonWorker = new Worker(new URL('./comparison-summary-worker.js', import.meta.url), { type: 'module' });
      const created = comparisonWorker;
      comparisonWorker.onmessage = ({ data }) => {
        if (created !== comparisonWorker || data.revision !== comparisonRevision) return;
        if (data.error) { host.textContent = data.error; $('exportComparison').disabled = true; return; }
        timePatternWork('comparison-display', () => renderComparison(data.comparison));
      };
      comparisonWorker.onerror = event => { if (created !== comparisonWorker) return; resetComparisonWorker(); host.textContent = event.message || 'Comparison worker failed'; $('exportComparison').disabled = true; };
    }
    const instance = comparisonWorker, current = () => comparisonRevision === revision && comparisonWorker === instance;
    const selected = selection();
    const rowId = entry => {
      const key = entry.result.pixels;
      if (!comparisonIds.has(key)) comparisonIds.set(key, ++comparisonNextId);
      return comparisonIds.get(key);
    };
    const ids = entries.map(rowId), needed = new Set();
    const wanted = entries.filter(entry => {
      const id = rowId(entry); if (comparisonSent.has(id) || needed.has(id)) return false;
      needed.add(id); return true;
    });
    const failed = error => { if (current()) { resetComparisonWorker(); host.textContent = error.message; $('exportComparison').disabled = true; } };
    function sendNext(index) {
      if (!current()) return;
      if (index >= wanted.length) {
        try { instance.postMessage({ kind: 'compare', revision, ids, selection: selected }); } catch (error) { failed(error); }
        return;
      }
      const entry = wanted[index], id = rowId(entry);
      deferPatternWork('comparison-input', () => {
        try {
          const result = numericPatternInput(entry.result);
          result.semanticAudit = entry.result.semanticAudit;
          result.pixels.forEach((pixel, i) => { pixel.direction = entry.result.pixels[i].direction; pixel.targetLengths = entry.result.pixels[i].targetLengths; });
          deferPatternWork('comparison-submit', () => {
            try { instance.postMessage({ kind: 'add', id, result }); comparisonSent.add(id); sendNext(index + 1); }
            catch (error) { failed(error); }
          }, current);
        } catch (error) { failed(error); }
      }, current);
    }
    sendNext(0);
  }
  function renderComparison(comparison) {
    const host = $('comparisonSummary'); host.replaceChildren();
    try {
      const notice = document.createElement('p'); notice.textContent = comparison.comparable
        ? 'Controlled comparison: detector, exposure, levels, model, environment and sampling match.'
        : 'Unequal settings: interpret differences with caution; see each row.'; host.append(notice);
      comparison.rows.forEach((row, i) => {
        const p = document.createElement('p'), m = row.indicators, format = v => v === null ? 'undefined' : v.toPrecision(4);
        p.textContent = `${i + 1}. ${entries[i].label} · ${row.snapshot.inputs.backendVersion}/${row.snapshot.inputs.scenario} · ROI ${(100 * m.targetFieldCoverage).toFixed(1)}% bins · expected support ${format(m.targetExpectedCount)} events · raw T contrast ${format(m.transmissionContrast)} · centroid separation ${format(m.targetBackgroundAngularSeparationDeg)}° · changed settings: ${comparison.differences[i].fields.join(', ') || 'none'}`;
        host.append(p);
      });
      const sensitivity = document.createElement('p'); sensitivity.textContent = `Baseline pose/site sensitivity: ${comparison.sensitivity.map(s => `row ${s.index + 1}: ${s.state}, mean |ΔT| ${s.meanAbsoluteTransmissionChange ?? 'undefined'}, coverage Δ ${s.coverageChange ?? 'undefined'}`).join(' · ') || 'add another row'}. Sampling is not physical resolution; accessibility/safety not evaluated.`; host.append(sensitivity);
    } catch (error) { host.textContent = error.message; $('exportComparison').disabled = true; }
  }
  function download(exported, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  for (const id of ['finiteConcrete', 'finiteRock', 'finiteCreases']) $(id).addEventListener('change', () => { drawReference('material'); drawReference('assessment'); });
  for (const graph of ['material', 'assessment']) $(`export${graph === 'material' ? 'Material' : 'Assessment'}Patterns`).addEventListener('click', () => {
    const result = getResults()[graph]; if (!result) return;
    try {
      const quantity = $('contributionQuantity').value, mode = $('contributionMode').value, units = quantity === 'material-path' ? 'm' : 'm.w.e.';
      const levelsText = $('contributionLevels').value.trim();
      if (mode === 'physical' && (!levelsText || levelsText.split(',').some(v => !v.trim()))) throw new Error('Enter increasing contribution levels');
      const contributionSelection = { quantity, materials: [...$('contributionMaterials').querySelectorAll('input:checked')].map(i => i.value),
        levelOptions: mode === 'physical' ? { mode, units, levels: levelsText.split(',').map(Number) } : { mode } };
      const selected = $('responseContext').value;
      const responseOptions = graph === 'assessment' ? { quantity: ['counts', 'open-sky'].includes(selected) ? 'expected-count' : 'transmission',
        representation: selected === 'smoothed' ? 'display-smoothed' : 'raw', context: ['open-sky', 'normalized'].includes(selected) ? selected : 'through',
        levels: $('responseLevels').value.split(',').map(Number) } : null;
      if (responseOptions && (!$('responseLevels').value.trim() || $('responseLevels').value.split(',').some(v => !v.trim()))) throw new Error('Enter increasing response levels');
      const exported = createPatternLayerExport(result, { references: cache.get(result)?.overlays || [], contributionSelection, responseOptions },
        { finiteMaterials: enabled(), responseVisible: $('responseContours').checked, contributionVisible: $('contributionVisible').checked, raster: result.display || {} });
      download(exported, `${graph}-pattern-layers-v1.json`);
    } catch (error) { $(`${graph}ReferenceLegend`).textContent = `Pattern export unavailable: ${error.message}`; }
  });
  for (const id of ['responseContours', 'responseLevels']) $(id).addEventListener('change', drawResponse);
  $('responseContext').addEventListener('change', () => { $('responseLevels').value = ['counts', 'open-sky'].includes($('responseContext').value) ? '1, 10, 100, 1000' : '0.01, 0.1, 0.5, 0.9'; drawResponse(); });
  for (const id of ['comparisonMaterial', 'comparisonThreshold']) $(id).addEventListener('change', showComparison);
  $('captureComparison').addEventListener('click', () => {
    const result = getResults().assessment; if (!result || entries.length >= 20) return;
    entries.push(captureStore.capture(result, cache.get(result)?.overlays || noReferences,
      `${getStationLabel()} / az ${result.config.azimuthDeg}° el ${result.config.elevationDeg}°`)); showComparison();
  });
  $('clearComparison').addEventListener('click', () => { entries = []; captureStore.clear(); showComparison(); });
  $('exportComparison').addEventListener('click', () => {
    try { download(createPatternComparisonExport(entries, selection()), 'projection-pattern-comparison-v1.json'); }
    catch (error) { $('comparisonSummary').textContent = `Export unavailable: ${error.message}`; }
  });
  $('importComparison').addEventListener('change', async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 50 * 1024 * 1024) throw new Error('Comparison exceeds 50 MB');
      const document = replayPatternComparison(JSON.parse(await file.text()));
      if (document.entries.length > 20) throw new Error('At most 20 comparison rows');
      resetComparisonWorker(); captureStore.clear(); entries = document.entries; const selected = document.comparison.selection;
      if (selected.kind !== 'material') throw new Error('Preview UI supports material ROI comparisons only');
      if (![...$('comparisonMaterial').options].some(o => o.value === selected.id)) $('comparisonMaterial').add(new Option(selected.id, selected.id));
      $('comparisonMaterial').value = selected.id; $('comparisonThreshold').value = selected.minimumPathM; showComparison();
    } catch (error) { $('comparisonSummary').textContent = `Replay rejected: ${error.message}`; }
  });
  for (const graph of ['material', 'assessment']) $(`${graph === 'material' ? 'material' : 'assessment'}Projection`).addEventListener('mousemove', event => {
    const result = getResults()[graph], stored = result && cache.get(result); if (!result) return;
    const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * result.config.bins,
      y = (event.clientY - rect.top) / rect.height * result.config.bins;
    let nearest = null, best = 4;
    for (const layer of stored?.layers || []) layer.mapped.lines.forEach((line, index) => {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1].map((v, j) => v * (j ? rect.height : rect.width) / result.config.bins), b = line[i].map((v, j) => v * (j ? rect.height : rect.width) / result.config.bins);
        const p = [event.clientX - rect.left, event.clientY - rect.top], d = b.map((v, j) => v - a[j]);
        const t = Math.max(0, Math.min(1, p.reduce((s, v, j) => s + (v - a[j]) * d[j], 0) / (d[0] ** 2 + d[1] ** 2 || 1)));
        const distance = Math.hypot(...p.map((v, j) => v - a[j] - t * d[j]));
        if (distance < best) { best = distance; nearest = { material: layer.material, source: layer.overlay.provenance.lineSources[index] }; }
      }
    });
    $(`${graph}ReferenceHover`).textContent = nearest ? `${nearest.material} finite reference · ${nearest.source.reasons.join(', ')} · ancestor ${nearest.source.ancestors.map(a => `${a.componentId}/face ${a.faceId}`).join(' + ')} · canonical entity unresolved · physical scope unresolved` : 'Hover within 4 CSS pixels of a finite reference to inspect its source.';
    if (graph === 'assessment') {
      const n = result.config.bins, col = Math.max(0, Math.min(n - 1, Math.floor(x))), row = Math.max(0, Math.min(n - 1, Math.floor(y))), at = row * n + col;
      const neighbour = col < n - 1 ? at + 1 : at - 1, context = responseFeatureContext(result, at, neighbour);
      $('responseFeatureContext').textContent = `Adjacent bins: ${context.state} · ΔT ${context.transmissionDifference?.toPrecision(4) ?? 'undefined'} · expected counts ${context.expectedCounts.map(v => v.toPrecision(4)).join(' / ')} · open sky ${context.openSkyCounts.map(v => v.toPrecision(4)).join(' / ')} · separation ${context.angularSeparationDeg.toPrecision(4)}° · display σ ${context.displayAngularResolutionDeg}°. No significance/resolve claim.`;
    }
  });
  return {
    refresh(graph) {
      const result = getResults()[graph];
      if (result && graph === 'assessment') {
        const select = $('comparisonMaterial'); if (!select.options.length) select.replaceChildren(...Object.keys(result.projectionGeometry.materials).filter(m => m !== 'air').map(m => new Option(m, m)));
        $('captureComparison').disabled = false;
      }
      drawReference(graph); if (graph === 'assessment') drawResponse();
    },
    invalidate() { responseWork.invalidate(); generation++; requests.clear(); $('captureComparison').disabled = true;
      $('exportMaterialPatterns').disabled = true; $('exportAssessmentPatterns').disabled = true;
      for (const graph of ['material', 'assessment']) { $(`${graph}ReferenceOverlay`).replaceChildren(); $(`${graph}ReferenceLegend`).textContent = 'Waiting for current calculation'; $(`${graph}ReferenceHover`).textContent = ''; }
      $('assessmentResponseOverlay').replaceChildren(); $('responseLegend').textContent = 'Waiting for current calculation'; $('responseFeatureContext').textContent = '';
    }
  };
}
