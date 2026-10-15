import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createPatternFixture } from '../projection-pattern-fixtures.mjs';
import { csgInterfaceCases } from '../../scripts/benchmark-interface-csg.mjs';
import { createDerivedInterfaceArtifact, validateDerivedInterfaceArtifact } from '../../dist/modules/derived-interface-artifact.js';
import { prepareFiniteModelReferences, extractFiniteModelReferences } from '../../dist/modules/finite-model-references.js';
import { evaluateMaterialProjection, detectorBasis } from '../../dist/modules/material-projection.js';
import { evaluateCompiledAssessment } from '../../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../../dist/modules/detector-defaults.js';
import { prepareProjectionPattern, materialFieldFromProjection, mapPatternOverlayToGraph } from '../../dist/modules/projection-pattern-fields.js';
import { responsePattern, responseFieldFromProjection, responseFeatureContext } from '../../dist/modules/response-patterns.js';
import { comparePatternResults, createPatternComparisonExport, replayPatternComparison, createImmutablePatternComparisonEvaluator } from '../../dist/modules/pattern-comparison.js';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../../dist/modules/compiled-mesh-runtime.js';
import { sha256Portable } from '../../dist/modules/sha256.js';
import { createPatternSnapshot, createPatternField } from '../../dist/modules/projection-pattern-contract.js';
import { createPatternLayerExport, replayPatternLayerExport } from '../../dist/modules/pattern-layer-export.js';
import { evaluatePatternComparisonBatch } from '../../dist/modules/pattern-comparison-batch.js';
const evidence = JSON.parse(await readFile(new URL('../fixtures/interface-csg.json', import.meta.url)));
const config = { origin: [0, 0, 0], azimuthDeg: 0, elevationDeg: 30, length: 30, bins: 25, halfAngleDeg: 65 };
const device = defaultAssessmentDevice(), response = defaultAssessmentResponse();
function fixture(id) { const f = createPatternFixture(id); f.runtime.identity.release_id = 'fixture@1'; return f; }
function derived(id, runtime) {
  const row = csgInterfaceCases().find(c => c.id === id), native = { ...evidence.fixtureMeshes.find(c => c.id === id),
    inputSha256: evidence.results.find(c => c.id === id).inputSha256 };
  const context = { runtime, sourceCaseId: id, domainFaces: Object.fromEntries(row.components.map(c => [c.componentId, c.domainFaceIds || []])),
    domainPolicy: { id: 'analytic-fixture', version: '1.0.0' }, generator: { name: 'manifold-priority-interface', version: '1.0.0', manifoldVersion: evidence.manifoldVersion, numpyVersion: evidence.numpyVersion } };
  const doc = createDerivedInterfaceArtifact(native, context);
  return validateDerivedInterfaceArtifact(doc, { ...context, expectedSha256: doc.contentSha256 });
}

test('finite references preserve analytic through-material/cavity/opening rims at 25/65/129, without cap/frame rims or source mutations', async () => {
  for (const id of ['slab', 'wedge', 'cavity', 'opening', 'material-junction', 'terrain']) {
    const f = fixture(id), artifact = derived(id, f.runtime), prepared = prepareFiniteModelReferences(artifact);
    const before = f.runtime.components.map(c => Array.from(c.positions));
    for (const view of f.views) {
      let baseline;
      for (const bins of [25, 65, 129]) {
        const result = await evaluateMaterialProjection(f.runtime, { ...config, ...view, bins: Math.min(bins, 65) });
        let fields = prepareProjectionPattern(result);
        if (bins === 129) {
          const max = fields.grid.sx.at(-1), grid = { kind: 'uniform-samples', sx: Array.from({ length: bins }, (_, i) => max * (2 * i / (bins - 1) - 1)), sy: Array.from({ length: bins }, (_, i) => max * (1 - 2 * i / (bins - 1))) };
          fields = { grid, snapshot: createPatternSnapshot({ ...fields.snapshot.inputs, sampling: { ...fields.snapshot.inputs.sampling, grid, bins } }) };
        }
        const materials = id === 'terrain' ? ['rock'] : id === 'material-junction' ? ['concrete', 'rock'] : ['concrete'];
        const curves = extractFiniteModelReferences(prepared, { ...fields, materials });
        const identities = curves.map(o => o.provenance.lineSources.map(s => s.edgeId));
        if (baseline) assert.deepEqual(identities, baseline); baseline = identities;
        for (const overlay of curves) {
          assert.equal(overlay.provenance.complete, false); assert.equal(overlay.provenance.physicalScope, 'unresolved');
          assert.equal(overlay.provenance.lineSources.length, overlay.lines.length);
          for (const [i, source] of overlay.provenance.lineSources.entries()) {
            assert.equal(source.sourceEntityId, null);
            assert.ok(source.faceIds.every(f => artifact.faceScopeKinds[f] !== 'domain-cap'));
            const basis = detectorBasis(view.azimuthDeg, view.elevationDeg);
            source.segmentModel.forEach((point, j) => {
              const p = point.map((v, k) => v - view.origin[k]), dot = v => p.reduce((sum, x, k) => sum + x * v[k], 0);
              const expected = [dot(basis.right) / dot(basis.forward), dot(basis.up) / dot(basis.forward)];
              expected.forEach((v, k) => assert.ok(Math.abs(v - overlay.lines[i][j][k]) < 1e-12));
            });
          }
          const field = bins === 129 ? createPatternField({ id: 'fine-reference-grid', snapshot: fields.snapshot, grid: fields.grid, quantity: 'material-column', material: overlay.settings.material, values: Array(bins * bins).fill(0), valid: Array(bins * bins).fill(true), provenance: { source: 'geometry-mapping-grid-only', limitations: ['No fine-grid material values are asserted.'] } }) : materialFieldFromProjection(result, overlay.settings.material);
          const mapped = mapPatternOverlayToGraph(overlay, field, { width: 310, height: 250 });
          assert.ok(mapped.lines.flat().every(([x, y]) => x >= 0 && x <= 310 && y >= 0 && y <= 250));
          if (id === 'terrain') { assert.equal(overlay.lines.length, 0); assert.ok(overlay.provenance.excludedCapEdges > 0); }
        }
      }
    }
    assert.deepEqual(f.runtime.components.map(c => Array.from(c.positions)), before);
  }
});

test('finite reference stale source/pose identity fails and absence differs from outside-field and unresolved domain', async () => {
  const f = fixture('slab'), prepared = prepareFiniteModelReferences(derived('slab', f.runtime));
  const result = await evaluateMaterialProjection(f.runtime, { ...config, azimuthDeg: 180 });
  const request = { ...prepareProjectionPattern(result), materials: ['concrete'] };
  assert.equal(extractFiniteModelReferences(prepared, request)[0].state, 'outside-field');
  assert.equal(extractFiniteModelReferences(prepared, { ...request, materials: ['rock'] })[0].state, 'absent');
  const changed = structuredClone(request); changed.snapshot.key = 'stale'; assert.throws(() => extractFiniteModelReferences(prepared, changed));
});

test('response contours distinguish acceptance from attenuation, raw from smoothing, and zero/invalid support at 25/65', async () => {
  for (const bins of [25, 65]) {
    // Station above the slab (top z = 4): neither end of any line reaches it, so the view is open sky
    // (since quick-response@4.0.0 lines below the horizon are traced from behind the detector).
    const f = fixture('slab'), result = await evaluateCompiledAssessment(f.runtime, { ...config, bins, origin: [10, 0, 10] }, device, { ...response, angularResolutionDeg: 5 });
    const before = structuredClone(result), open = responsePattern(result, { quantity: 'expected-count', context: 'open-sky', levels: [1, 10, 100] });
    const attenuation = responsePattern(result);
    assert.ok(result.pixels.filter(p => p.openCount > 0).every(p => p.count === p.openCount && p.transmission === 1));
    assert.equal(attenuation.contours.description.variation, 'constant');
    assert.equal(open.contours.description.variation, 'varying');
    assert.ok(open.contours.overlays.some(o => o.lines.length > 0));
    const normalized = responseFieldFromProjection(result, 'transmission', 'raw', 'normalized');
    normalized.values.forEach((v, i) => assert.equal(v, result.pixels[i].openCount > 0 ? 1 : null));
    const smoothed = responsePattern(result, { representation: 'display-smoothed' });
    assert.equal(smoothed.field.representation, 'display-smoothed'); assert.equal(smoothed.field.provenance.context, 'through');
    assert.deepEqual(result, before);
    const feature = responseFeatureContext(result, Math.floor(bins * bins / 2), Math.floor(bins * bins / 2) + 1);
    assert.equal(feature.transmissionDifference, 0); assert.ok(feature.angularSeparationDeg > 0);
    assert.throws(() => responseFeatureContext(result, 0, 2));
    const zero = structuredClone(result); zero.pixels.forEach(p => { p.openCount = 0; p.count = 0; });
    assert.ok(responseFieldFromProjection(zero).values.every(v => v === null));
    assert.ok(responsePattern(zero).contours.overlays.every(o => o.state === 'invalid'));
    const invalid = structuredClone(result); invalid.pixels[0].openCount = -1; assert.throws(() => responseFieldFromProjection(invalid));
  }
});

test('material response contrast, explicit threshold sensitivity and count support do not imply significance', async () => {
  const f = fixture('opening'), result = await evaluateCompiledAssessment(f.runtime, config, device, response);
  const before = structuredClone(result);
  for (const levels of [[.01, .1, .5, .9], [.005, .05, .25, .75], [.02, .2, .6, .95]]) {
    const pattern = responsePattern(result, { levels });
    assert.deepEqual(pattern.contours.levelPolicy.levels, levels);
    assert.ok(pattern.contours.description.max > pattern.contours.description.min);
    assert.ok(pattern.contours.overlays.every(o => o.semantic === 'response-feature' && o.provenance.limitations.some(s => s.includes('acceptance'))));
  }
  assert.deepEqual(result, before);
});

test('comparison indicators/pose sensitivity share single-site definitions and round-trip raw/settings/layers; unequal settings disclosed', async () => {
  const f = fixture('opening'), a = await evaluateCompiledAssessment(f.runtime, config, device, response);
  const b = await evaluateCompiledAssessment(f.runtime, { ...config, azimuthDeg: 15 }, device, response);
  const selection = { kind: 'material', id: 'concrete', minimumPathM: .15 };
  const refs = extractFiniteModelReferences(prepareFiniteModelReferences(derived('opening', f.runtime)), { ...prepareProjectionPattern(a), materials: ['concrete'] });
  const comparison = comparePatternResults([a, b], selection);
  const cachedCompare = createImmutablePatternComparisonEvaluator();
  assert.deepEqual(cachedCompare([a], selection), comparePatternResults([a], selection));
  assert.deepEqual(cachedCompare([a, b], selection), comparison);
  assert.deepEqual(cachedCompare([a, b], selection), comparison);
  for (const levels of [[.05, .2, .7], [.01, .1, .5, .9]]) {
    const changed = { ...selection, minimumPathM: selection.minimumPathM + .1 };
    assert.deepEqual(cachedCompare([a, b], changed, levels), comparePatternResults([a, b], changed, levels));
  }
  assert.equal(comparison.comparable, true); assert.equal(comparison.sensitivity[0].state, 'ready');
  const doc = createPatternComparisonExport([{ label: 'baseline', result: a, references: refs }, { label: 'pose', result: b }], selection);
  assert.deepEqual(replayPatternComparison(JSON.parse(JSON.stringify(doc))), doc);
  assert.deepEqual(doc.comparison, comparison);
  const artifact = derived('opening', f.runtime);
  const layers = createPatternLayerExport(a, { references: refs, contributionSelection: { quantity: 'material-column', materials: ['concrete'], levelOptions: { mode: 'physical', units: 'm.w.e.', levels: [1, 5, 10] } }, responseOptions: { levels: [.1, .5, .9] } });
  assert.equal(replayPatternLayerExport(JSON.parse(JSON.stringify(layers)), { referenceArtifact: artifact }).referenceVerification, 'reconstructed-from-source-bound-artifact');
  assert.equal(replayPatternLayerExport(layers).referenceVerification, 'stored-integrity-only');
  const changed = structuredClone(doc); changed.entries[0].references[0].lines[0][0][0] += 1; assert.throws(() => replayPatternComparison(changed));
  const exposure = await evaluateCompiledAssessment(f.runtime, config, device, { ...response, exposureDays: 60 });
  const mismatch = comparePatternResults([a, exposure], selection); assert.equal(mismatch.comparable, false);
  assert.ok(mismatch.differences[1].fields.includes('response')); assert.equal(mismatch.sensitivity[0].state, 'incomparable');
  assert.throws(() => comparePatternResults([a], { ...selection, id: 'invented' }));
});

test('explicit batch/single sites reuse the same response core and indicators, snapshot settings and cancel', async () => {
  const f = fixture('slab'), configs = [{ ...config, bins: 3 }, { ...config, bins: 3, azimuthDeg: 15 }],
    selection = { kind: 'material', id: 'concrete', minimumPathM: .15 }, expected = [];
  for (const c of configs) expected.push(await evaluateCompiledAssessment(f.runtime, c, device, response));
  const progress = [], supplied = structuredClone(configs);
  const batch = await evaluatePatternComparisonBatch(f.runtime, supplied, device, response, selection,
    { yieldTask: async () => { supplied[1].azimuthDeg = 99; }, onProgress: fraction => progress.push(fraction) });
  assert.deepEqual(batch.results, expected); assert.deepEqual(batch.comparison, comparePatternResults(expected, selection));
  assert.equal(progress.at(-1), 1);
  const controller = new AbortController();
  await assert.rejects(evaluatePatternComparisonBatch(f.runtime, configs, device, response, selection,
    { signal: controller.signal, yieldTask: async () => controller.abort() }), { name: 'AbortError' });
});

test('all four packaged real scenarios bind source hashes, exclude cap-incident edges and project on their own grids', async t => {
  const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
  const root = new URL('../../dist/data/derived-interfaces/', import.meta.url);
  try { await access(new URL('manifest.json', root)); } catch { t.skip('Generated assets absent: run documented qualification + packaging commands for the real-asset gate'); return; }
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
  for (const entry of manifest.entries) {
    const bytes = await readFile(new URL(entry.file, root)); assert.equal(sha256Portable(bytes), entry.compressedSha256);
    const doc = JSON.parse(gunzipSync(bytes)); const runtime = await loadCompiledMeshRuntime(dataset, entry.scenarioId);
    const context = { runtime, domainFaces: Object.fromEntries(doc.inputs.map(i => [i.componentId, i.domainFaceIds])), domainPolicy: entry.domainPolicy, sourceCaseId: entry.sourceCaseId, expectedSha256: entry.contentSha256 };
    const artifact = validateDerivedInterfaceArtifact(doc, context), prepared = prepareFiniteModelReferences(artifact);
    const realConfig = { ...config, origin: dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position), azimuthDeg: 180, length: 700, halfAngleDeg: 30, bins: 3 };
    const result = await evaluateMaterialProjection(runtime, realConfig), saved = structuredClone(result);
    const curves = extractFiniteModelReferences(prepared, { ...prepareProjectionPattern(result), materials: ['concrete', 'rock'] });
    assert.ok(curves.some(o => o.lines.length));
    for (const overlay of curves) {
      assert.ok(overlay.provenance.lineSources.every(s => s.faceIds.every(i => artifact.faceScopeKinds[i] !== 'domain-cap')));
      mapPatternOverlayToGraph(overlay, materialFieldFromProjection(result, overlay.settings.material), { width: 3, height: 3 });
    }
    assert.deepEqual(result, saved);
  }
});
