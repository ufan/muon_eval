import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { loadDataset } from './dataset-loader.js';
import { loadCompiledMeshRuntime } from './compiled-mesh-runtime.js';
import { createCompiledGeometryView } from './compiled-geometry-view.js';
import { detectorBasis, evaluateMaterialProjection } from './material-projection.js';
import { projectionColorScale } from './projection-color-scale.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from './detector-defaults.js';
import { evaluateCompiledAssessment } from './compiled-assessment.js';
import { materialEnvelopeEdges } from './material-envelopes.js';
import { createNumericPatternClient } from './numeric-pattern-client.js';
import { drawContributionPaths } from './contribution-view.js';
import { createContributionExport } from './contribution-export.js';
import { createPatternPreview } from './pattern-preview.js';
import { createDemandRender } from './demand-render.js';
import { timePatternWork } from './pattern-timing.js';
import { resolveApplicationSelection, selectionHref, APP_PAGES } from './application-selection.js';

const $ = id => document.getElementById(id), viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); viewport.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x09131d);
scene.add(new THREE.HemisphereLight(0xe3f4ff, 0x34404a, 2.5));
const sunlight = new THREE.DirectionalLight(0xffffff, 2); sunlight.position.set(200, 400, 200); scene.add(sunlight);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20000), controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const requestRender = createDemandRender(() => { controls.update(); renderer.render(scene, camera); });
controls.addEventListener('change', requestRender);
let dataset, runtime, view, rayGroup = new THREE.Group(), sequence = 0, busy = false;
let projectionController, projectionResult;
let assessmentResult;
let displayedTrace;
const patterns = createPatternPreview({ getResults: () => ({ material: projectionResult, assessment: assessmentResult }),
  getStationLabel: () => $('station').selectedOptions[0]?.textContent || 'Station' });
const contributionWork = createNumericPatternClient(), contributionColors = new Map();
const palette = ['#fff069', '#ff80db', '#79edff', '#a7ff91', '#ffb17b'];
function configureContributionMaterials() {
  const previous = new Set([...$('contributionMaterials').querySelectorAll('input:checked')].map(input => input.value));
  const initialized = contributionColors.size > 0;
  contributionColors.clear(); $('contributionMaterials').replaceChildren();
  const materials = [...dataset.geometry.materials.keys()].filter(id => id !== 'air');
  materials.forEach((material, index) => {
    const color = palette[index % palette.length]; contributionColors.set(material, color);
    const label = document.createElement('label'); label.className = 'check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = material;
    input.checked = initialized ? previous.has(material) : ['concrete', 'rock'].includes(material) || index === 0;
    const text = document.createElement('span'); text.textContent = material; text.style.color = color;
    label.append(input, text); $('contributionMaterials').append(label);
  });
}
function drawContributions(result, graph) {
  return timePatternWork(`contributions:${graph}`, () => drawContributionsNow(result, graph));
}
function drawContributionsNow(result, graph) {
  const svg = $(`${graph}ContributionOverlay`), legend = $(`${graph}ContributionLegend`);
  svg.replaceChildren(); legend.replaceChildren();
  if (!result) { legend.textContent = 'Contribution contours pending calculation.'; return; }
  if (!$('contributionVisible').checked) { legend.textContent = 'Contribution contours hidden; scientific values unchanged.'; return; }
  try {
    const quantity = $('contributionQuantity').value, units = quantity === 'material-path' ? 'm' : 'm.w.e.';
    const mode = $('contributionMode').value;
    const levelsText = $('contributionLevels').value.trim();
    if (mode === 'physical' && (!levelsText || levelsText.split(',').some(v => !v.trim()))) throw new Error('Enter increasing comma-separated physical levels.');
    const options = mode === 'physical' ? { mode, units, levels: levelsText.split(',').map(Number) } : { mode };
    let pending = false;
    const layers = [], selected = [...$('contributionMaterials').querySelectorAll('input:checked')].map(input => input.value);
    for (const material of selected) {
      const key = JSON.stringify([material, quantity, options]);
      const entry = contributionWork.read(result, graph, key, 'contribution', { material, quantity, levelOptions: options }, () => {
        if ((graph === 'material' ? projectionResult : assessmentResult) === result) drawContributions(result, graph);
      });
      if (!entry) { pending = true; continue; }
      const { field, contours } = entry, color = contributionColors.get(material);
      const line = document.createElement('p'); line.style.color = color;
      const statuses = [...new Set(contours.overlays.map(o => o.state))].join(', ') || 'invalid';
      const ambiguous = contours.overlays.some(o => o.provenance.ambiguousCells > 0);
      line.textContent = `${material} · ${quantity === 'material-path' ? 'path' : 'column'} · ${contours.levelPolicy.levels.map(v => Number(v.toPrecision(5))).join(', ') || 'no valid levels'} ${units} · ${contours.description.coverage}/${contours.description.variation}/${contours.description.validity} · ${statuses}${ambiguous ? ' · ambiguous saddle topology' : ''}`;
      legend.append(line);
      contours.overlays.forEach((overlay, index) => layers.push({ material, color, overlay, mapped: entry.mapped[index], pathData: entry.pathData[index] }));
    }
    const note = document.createElement('p'); note.textContent = pending ? 'Preparing current contribution contours in worker…' : selected.length
      ? `${mode === 'adaptive' ? 'Adaptive inspection; not comparable across views.' : 'Explicit physical levels.'} Raw material samples on this graph’s own grid. Clipped lines/incomplete or unresolved fields have limited support; no extrapolation beyond sample centers.`
      : 'No contribution material selected.';
    legend.append(note); drawContributionPaths(svg, layers, result.config.bins);
  } catch (error) { svg.replaceChildren(); legend.textContent = `Contribution contours unavailable: ${error.message}`; }
}
function redrawContributions() {
  $('contributionLevels').disabled = $('contributionMode').value !== 'physical';
  $('contributionLevels').labels[0].textContent = `Explicit levels (${$('contributionQuantity').value === 'material-path' ? 'm' : 'm.w.e.'}), increasing, comma-separated`;
  drawContributions(projectionResult, 'material'); drawContributions(assessmentResult, 'assessment');
}
const assessmentDevice = defaultAssessmentDevice();
$('assessmentDevice').textContent = `${assessmentDevice.model} assessment defaults · 409.6×409.6 mm · 3 layers · 256 strips/axis · 1.6 mm pitch · 0.15 m spacing · 95% layer efficiency · 2% dead loss · 0.3° resolution. Full field ${(2 * Math.atan(assessmentDevice.maxSlopeX) * 180 / Math.PI).toFixed(1)}° per axis. Not a dataset instrument calibration.`;
scene.add(rayGroup);
const observer = new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer.setSize(width, height);
  requestRender();
}); observer.observe(viewport);
const toScene = point => new THREE.Vector3(point[0], point[2], -point[1]);
function clearRay() { displayedTrace = null; $('targetRay').textContent = ''; for (const child of [...rayGroup.children]) { child.geometry.dispose(); child.material.dispose(); rayGroup.remove(child); } requestRender(); }
function focus() {
  if (!runtime) return;
  const structure = runtime.components.find(c => c.metadata.material_id === 'concrete'), bounds = structure?.bvh.bounds || runtime.bounds;
  const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2), size = Math.max(...bounds.max.map((value, axis) => value - bounds.min[axis]));
  const radius = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis])) / 2;
  const halfFov = Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(camera.aspect, 1));
  const distance = radius / Math.sin(halfFov) * 1.15;
  const target = toScene(center); controls.target.copy(target); camera.position.copy(target).add(new THREE.Vector3(1.2, 0.8, 1.2).normalize().multiplyScalar(distance));
  camera.near = Math.max(0.01, size / 10000); camera.far = Math.max(2000, size * 30); camera.updateProjectionMatrix(); controls.update();
  requestRender();
}
function trace() {
  if (!runtime || busy) return;
  try {
    const config = projectionConfig();
    const direction = detectorBasis(config.azimuthDeg, config.elevationDeg).forward;
    displayRay(config.origin, direction, config.length);
    void project(config);
  } catch (error) { invalidateProjection(); clearRay(); $('paths').replaceChildren(); $('column').textContent = ''; $('status').textContent = error.message; }
}
function displayRay(origin, direction, length) {
    const result = runtime.traceRayModel(origin, direction, length); clearRay();
    const colors = { concrete: 0xbdb9ae, steel: 0xc0392b, water: 0x408cdc, rock: 0x7a6f5e, air: 0xfa45ae };
    for (const segment of result.segments) {
      const ends = [segment.t0, segment.t1].map(t => toScene(origin.map((value, axis) => value + t * direction[axis])));
      const geometry = new THREE.BufferGeometry().setFromPoints(ends);
      rayGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: colors[segment.material], depthTest: false, transparent: true, opacity: segment.material === 'air' ? 0.3 : 1 })));
    }
    $('paths').replaceChildren(...Object.entries(result.totals).map(([material, distance]) => {
      const row = document.createElement('tr'); for (const text of [material, distance.toFixed(3)]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); } return row;
    }));
    $('column').textContent = `Column density: ${result.mwe.toFixed(2)} m.w.e.`;
    displayedTrace = result; showTargetRay();
    requestRender();
}
function showTargetRay() {
  const id = $('semanticTarget').value;
  $('targetRay').textContent = id && displayedTrace ? `Selected target ${id}: ${(displayedTrace.entityLengths[id] || 0).toFixed(3)} m semantic-volume intersection. This is not a counterfactual material budget.` : '';
}
function drawTargetOutline(context, result) {
  const id = $('semanticTarget').value;
  if (!id) return;
  const n = result.config.bins, threshold = result.semanticAudit.maskThresholdM;
  const inside = (x, y) => x >= 0 && x < n && y >= 0 && y < n && (result.pixels[y * n + x].targetLengths[id] || 0) > threshold;
  context.fillStyle = '#35ffdf';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inside(x, y)) {
    if (!inside(x - 1, y)) context.fillRect(x, y, .3, 1);
    if (!inside(x + 1, y)) context.fillRect(x + .7, y, .3, 1);
    if (!inside(x, y - 1)) context.fillRect(x, y, 1, .3);
    if (!inside(x, y + 1)) context.fillRect(x, y + .7, 1, .3);
  }
}
function projectionConfig() {
  const candidate = dataset.candidates.candidates.find(c => c.id === $('station').value);
  const origin = dataset.geometry.coordinates.pointToModel(candidate.example_position);
  for (const id of ['azimuth', 'elevation', 'length', 'halfAngle']) if (!$(id).value.trim()) throw new Error('Projection inputs must not be empty');
  const config = { origin, azimuthDeg: Number($('azimuth').value), elevationDeg: Number($('elevation').value),
    length: Number($('length').value), halfAngleDeg: Number($('halfAngle').value), bins: Number($('projectionBins').value) };
  if (!Number.isFinite(config.length) || config.length < 1 || config.length > 10000) throw new Error('Ray length must be between 1 and 10000 m');
  return config;
}
function drawMaterialEnvelopes(context, result) {
  const settings = { tolerance: result.semanticAudit?.maskThresholdM || 1e-6, depthEdges: $('envelopeDepthEdges').checked,
    depthJumpM: 4, relativeJump: .25 };
  const selected = [];
  for (const [material, id, color] of [['concrete', 'concreteEnvelope', '#ffffff'], ['rock', 'rockEnvelope', '#ff9648']]) {
    if (!$(id).checked) continue;
    selected.push(material);
    const edges = materialEnvelopeEdges(result.pixels, result.config.bins, material, settings);
    context.save(); context.strokeStyle = color; context.lineWidth = .22; context.beginPath();
    for (const edge of edges) { context.moveTo(edge.x0, edge.y0); context.lineTo(edge.x1, edge.y1); }
    context.stroke(); context.restore();
  }
  return { materials: selected, ...settings, profile: 'BVH winning material silhouettes and adjacent air-interface depth/topology' };
}
function invalidateProjection() {
  contributionWork.invalidate();
  patterns.invalidate();
  $('exportMaterialContours').disabled = true; $('exportAssessmentContours').disabled = true;
  projectionController?.abort(); projectionResult = null; $('exportProjection').disabled = true;
  $('projectionPixel').textContent = ''; $('projectionStatus').textContent = '';
  $('projectionScaleLegend').textContent = '';
  assessmentResult = null; $('exportAssessment').disabled = true;
  for (const id of ['assessmentStatus', 'assessmentSummary', 'assessmentLegend', 'assessmentPixel']) $(id).textContent = '';
  const assessmentCanvas = $('assessmentProjection'); assessmentCanvas.getContext('2d').clearRect(0, 0, assessmentCanvas.width, assessmentCanvas.height);
  const canvas = $('materialProjection'); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  redrawContributions();
}
async function project(config) {
  invalidateProjection();
  const controller = new AbortController(); projectionController = controller;
  const frozenRuntime = runtime;
  const response = { ...defaultAssessmentResponse(), exposureDays: $('assessmentExposure').value.trim() ? Number($('assessmentExposure').value) : NaN,
    angularModel: $('assessmentAngular').value };
  try {
    const result = await evaluateMaterialProjection(frozenRuntime, config, { signal: controller.signal,
      yieldTask: () => new Promise(resolve => setTimeout(resolve, 0)),
      onProgress: progress => { $('projectionStatus').textContent = `Computing ${Math.round(progress * 100)}%…`; } });
    if (controller.signal.aborted) return;
    projectionResult = result;
    drawMaterialProjection();
    $('projectionStatus').textContent = `${result.config.bins}×${result.config.bins} complete · ${result.scenarioId}`;
    $('exportProjection').disabled = false;
    $('exportMaterialContours').disabled = false;
    try {
      const assessment = await evaluateCompiledAssessment(frozenRuntime, config, assessmentDevice, response, { signal: controller.signal,
        yieldTask: () => new Promise(resolve => setTimeout(resolve, 0)),
        onProgress: progress => { $('assessmentStatus').textContent = `Computing ${Math.round(progress * 100)}%…`; } });
      if (controller.signal.aborted) return;
      assessmentResult = assessment; drawAssessment();
      $('assessmentStatus').textContent = `${assessment.config.bins}×${assessment.config.bins} complete · ${assessment.scenarioId}`;
      $('assessmentSummary').textContent = `${assessment.response.exposureDays} days · total ${assessment.totalCount.toPrecision(5)} expected events · weighted transmission ${(100 * assessment.weightedTransmission).toFixed(3)}%`;
      $('exportAssessment').disabled = false;
      $('exportAssessmentContours').disabled = false;
    } catch (error) { if (!controller.signal.aborted) $('assessmentStatus').textContent = error.message; }
  } catch (error) { if (!controller.signal.aborted) $('projectionStatus').textContent = error.message; }
}
function drawAssessment() {
  if (!assessmentResult) return;
  const mode = $('assessmentMode').value, canvas = $('assessmentProjection'), context = canvas.getContext('2d');
  canvas.width = canvas.height = assessmentResult.config.bins;
  const image = context.createImageData(canvas.width, canvas.height);
  assessmentResult.pixels.forEach((pixel, index) => {
    const value = mode === 'counts' ? pixel.displayCount : pixel.displayTransmission;
    const t = Math.min(1, Math.max(0, mode === 'counts' ? (Math.log10(Math.max(.1, value)) + 1) / 6 : (Math.log10(Math.max(1e-6, value)) + 6) / 6));
    image.data.set([Math.round(12 + 243 * t), Math.round(25 + 195 * t), Math.round(40 + 40 * t), 255], index * 4);
  });
  context.putImageData(image, 0, 0);
  drawTargetOutline(context, assessmentResult);
  const envelopes = drawMaterialEnvelopes(context, assessmentResult);
  $('assessmentLegend').textContent = mode === 'counts' ? 'Fixed logarithmic scale: 0.1–100,000 events per pixel (smoothed display).' : 'Fixed logarithmic scale: transmission 10⁻⁶–1 (smoothed display).';
  assessmentResult.display = { mode, colorScale: { transform: 'log10', lower: mode === 'counts' ? .1 : 1e-6, upper: mode === 'counts' ? 1e5 : 1 }, smoothed: true,
    semanticTarget: $('semanticTarget').value || null, envelopes };
  drawContributions(assessmentResult, 'assessment');
  patterns.refresh('assessment');
}
function drawMaterialProjection() {
  if (!projectionResult) return;
  const scale = projectionColorScale(projectionResult.pixels.map(pixel => pixel.mwe), $('projectionScale').value);
  const canvas = $('materialProjection'), context = canvas.getContext('2d');
  canvas.width = canvas.height = projectionResult.config.bins;
  const pixels = context.createImageData(canvas.width, canvas.height);
  projectionResult.pixels.forEach((pixel, index) => {
    const t = scale.normalize(pixel.mwe);
    pixels.data.set([Math.round(12 + 243 * t), Math.round(25 + 195 * t), Math.round(40 + 40 * t), 255], index * 4);
  });
  context.putImageData(pixels, 0, 0);
  drawTargetOutline(context, projectionResult);
  const envelopes = drawMaterialEnvelopes(context, projectionResult);
  const { normalize, ...metadata } = scale;
  $('projectionScaleLegend').textContent = `${scale.mode === 'adaptive' ? 'Adaptive log · positive-pixel P98' : 'Fixed linear'}: 0–${scale.upper.toPrecision(4)} m.w.e. · ${scale.clipped} pixels above range (color saturated; actual values unchanged).`;
  // View metadata is separate from the physical calculation configuration.
  projectionResult.display = { colorScale: metadata, semanticTarget: $('semanticTarget').value || null, envelopes };
  drawContributions(projectionResult, 'material');
  patterns.refresh('material');
}
function overlays() { view?.setOverlays({ air: $('air').checked, virtual: $('virtual').checked }); requestRender(); }
async function update() {
  invalidateProjection();
  $('semanticTarget').disabled = true; $('semanticSummary').textContent = 'Loading semantic mapping…';
  const token = ++sequence; busy = true; $('trace').disabled = true; $('status').textContent = 'Loading compiled scenario…';
  if (view) view.group.visible = false;
  clearRay(); $('paths').replaceChildren(); $('column').textContent = ''; $('picked').textContent = 'Click a surface to inspect its component.';
  try {
    const next = await loadCompiledMeshRuntime(dataset, $('scenario').value);
    if (token !== sequence) return;
    const nextView = createCompiledGeometryView(next);
    if (view) { scene.remove(view.group); view.dispose(); }
    runtime = next; view = nextView; scene.add(view.group); overlays(); focus();
    const selectedTarget = $('semanticTarget').value;
    $('semanticTarget').replaceChildren(new Option('None', ''), ...runtime.semanticAudit.targets.map(target => new Option(target.name, target.id)));
    if (runtime.semanticAudit.targets.some(target => target.id === selectedTarget)) $('semanticTarget').value = selectedTarget;
    $('semanticTarget').disabled = false;
    const audit = runtime.semanticAudit;
    $('semanticSummary').textContent = `${audit.targets.length} directly mapped targets. Unresolved aggregates: ${audit.unresolvedComponents.join(', ')}. ${audit.unmappedPhysicalEntities.length} canonical physical entities lack individual compiled attribution. ROI significance unavailable.`;
    $('status').textContent = `${runtime.components.length} components · upstream ${runtime.variables.water_up_level} m`;
    busy = false; $('trace').disabled = false; trace();
  } catch (error) { if (token === sequence) { $('status').textContent = error.message; busy = true; } }
}
// Shared selection contract with the main app (ADR-030): same URL parameters, links both ways.
function syncSelection() {
  const selection = { datasetId: $('release').value, scenarioId: $('scenario').value || null };
  $('mainAppLink').href = selectionHref(APP_PAGES.main, selection);
  history.replaceState(null, '', selectionHref(APP_PAGES.workbench, selection));
}
async function selectRelease(preferredScenario = null) {
  invalidateProjection(); clearRay(); $('paths').replaceChildren(); $('column').textContent = '';
  $('semanticTarget').disabled = true; $('semanticSummary').textContent = 'Loading semantic mapping…';
  ++sequence; busy = true; $('trace').disabled = true; $('scenario').disabled = true;
  const token = sequence;
  try {
    const next = await loadDataset($('release').value);
    if (token !== sequence) return;
    dataset = next;
    configureContributionMaterials();
    $('scenario').replaceChildren(...[...dataset.geometry.scenarios.values()].map(s => new Option(`${s.label} (${s.variables.water_up_level} m)`, s.id)));
    if (preferredScenario !== null) {
      if (!dataset.geometry.scenarios.has(preferredScenario)) throw new Error(`Unknown compiled scenario ${preferredScenario}`);
      $('scenario').value = preferredScenario;
    }
    syncSelection();
    $('station').replaceChildren(...dataset.candidates.candidates.map(c => new Option(c.names?.en || c.names?.zh || c.id, c.id)));
    $('scenario').disabled = false; await update();
  } catch (error) { if (token === sequence) $('status').textContent = error.message; }
}
$('release').addEventListener('change', () => selectRelease()); $('scenario').addEventListener('change', () => { syncSelection(); update(); });
$('air').addEventListener('change', overlays); $('virtual').addEventListener('change', overlays); $('focus').addEventListener('click', focus);
$('trace').addEventListener('click', trace); $('station').addEventListener('change', trace);
$('projectionScale').addEventListener('change', drawMaterialProjection);
$('assessmentMode').addEventListener('change', drawAssessment);
$('semanticTarget').addEventListener('change', () => { drawMaterialProjection(); drawAssessment(); showTargetRay(); });
for (const id of ['concreteEnvelope', 'rockEnvelope', 'envelopeDepthEdges']) $(id).addEventListener('change', () => { drawMaterialProjection(); drawAssessment(); });
for (const id of ['contributionVisible', 'contributionQuantity', 'contributionMode', 'contributionMaterials']) $(id).addEventListener('change', redrawContributions);
$('contributionLevels').addEventListener('change', redrawContributions);
for (const id of ['assessmentExposure', 'assessmentAngular']) $(id).addEventListener('input', trace);
for (const id of ['azimuth', 'elevation', 'length', 'halfAngle', 'projectionBins']) $(id).addEventListener('input', trace);
$('materialProjection').addEventListener('click', event => {
  if (!projectionResult || busy) return;
  const rect = event.currentTarget.getBoundingClientRect(), { bins } = projectionResult.config;
  const column = Math.min(bins - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * bins)));
  const row = Math.min(bins - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * bins)));
  const pixel = projectionResult.pixels[row * bins + column];
  displayRay(projectionResult.config.origin, pixel.direction, projectionResult.config.length);
  $('projectionPixel').textContent = `sx ${pixel.sx.toFixed(3)}, sy ${pixel.sy.toFixed(3)} · ${pixel.mwe.toFixed(2)} m.w.e.`;
});
$('exportProjection').addEventListener('click', () => {
  if (!projectionResult) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(projectionResult, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `material-projection-${projectionResult.scenarioId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('assessmentProjection').addEventListener('click', event => {
  if (!assessmentResult || busy) return;
  const rect = event.currentTarget.getBoundingClientRect(), { bins } = assessmentResult.config;
  const column = Math.min(bins - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * bins)));
  const row = Math.min(bins - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * bins)));
  const pixel = assessmentResult.pixels[row * bins + column];
  displayRay(assessmentResult.config.origin, pixel.direction, assessmentResult.config.length);
  $('assessmentPixel').textContent = `sx ${pixel.sx.toFixed(3)}, sy ${pixel.sy.toFixed(3)} · ${pixel.mwe.toFixed(2)} m.w.e. · ${pixel.count.toPrecision(5)} events/${assessmentResult.response.exposureDays} days · ${(100 * pixel.transmission).toFixed(4)}% transmission (raw)`;
});
function exportContours(result, graph) {
  if (!result) return;
  try {
    const quantity = $('contributionQuantity').value, mode = $('contributionMode').value;
    const text = $('contributionLevels').value.trim();
    if (mode === 'physical' && (!text || text.split(',').some(v => !v.trim()))) throw new Error('Enter increasing comma-separated physical levels.');
    const levelOptions = mode === 'physical' ? { mode, units: quantity === 'material-path' ? 'm' : 'm.w.e.', levels: text.split(',').map(Number) } : { mode };
    const materials = [...$('contributionMaterials').querySelectorAll('input:checked')].map(input => input.value);
    const exported = createContributionExport(result, { quantity, materials, levelOptions }, {
      visible: $('contributionVisible').checked, colors: Object.fromEntries(contributionColors), strokeWidthCss: 1.5, haloWidthCss: 3.5,
      raster: structuredClone(result.display || {}) });
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${graph}-contribution-contours-${result.scenarioId}-v1.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { $(`${graph}ContributionLegend`).textContent = `Contour export unavailable: ${error.message}`; }
}
$('exportMaterialContours').addEventListener('click', () => exportContours(projectionResult, 'material'));
$('exportAssessmentContours').addEventListener('click', () => exportContours(assessmentResult, 'assessment'));
$('exportAssessment').addEventListener('click', () => {
  if (!assessmentResult) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(assessmentResult, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `detector-assessment-${assessmentResult.scenarioId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
renderer.domElement.addEventListener('click', event => {
  if (!view || busy) return;
  const rect = renderer.domElement.getBoundingClientRect(), raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
  const hit = raycaster.intersectObjects([...view.meshes.values()].filter(mesh => mesh.visible && mesh.userData.pick))[0];
  if (hit) {
    const record = hit.object.userData.semanticRecord;
    $('picked').textContent = `${record?.name || hit.object.userData.componentId} · ${hit.object.userData.componentId} · ${hit.object.userData.materialId || 'reference'} · source mapping: ${hit.object.userData.sourceMapping} · source entity: ${record?.sourceEntityId || 'unresolved/display-only'}`;
  }
});
try {
  const response = await fetch('./datasets/registry.json');
  if (!response.ok) throw new Error('Unable to load dataset registry');
  const registry = await response.json();
  $('release').replaceChildren(...Object.entries(registry.datasets).filter(([, entry]) => entry.adapter === 'dam-spec-v07').map(([id]) => new Option(id, id)));
  if (!$('release').options.length) throw new Error('No native compiled releases are registered');
  const selection = resolveApplicationSelection(registry, location.search);
  $('release').value = selection.datasetId;
  await selectRelease(selection.scenarioId);
} catch (error) { $('status').textContent = error.message; }
