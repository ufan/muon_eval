import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../scripts/dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
import { evaluateMaterialProjection } from '../dist/modules/material-projection.js';
import { evaluateCompiledAssessment } from '../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../dist/modules/detector-defaults.js';
import { prepareProjectionPattern, materialFieldFromProjection, mapContributionOverlayToGraph, mapPatternOverlayToGraph } from '../dist/modules/projection-pattern-fields.js';
import { prepareReferenceViewLayers } from '../dist/modules/reference-view-layers.js';
import { contributionPathData } from '../dist/modules/contribution-view.js';
import { prepareNumericPattern, numericPatternInput } from '../dist/modules/numeric-pattern-work.js';
import { responsePattern } from '../dist/modules/response-patterns.js';
import { extractContributionContours } from '../dist/modules/contribution-contours.js';
import { createPatternOverlay } from '../dist/modules/projection-pattern-contract.js';

const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
const config = { origin: dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position),
  azimuthDeg: 180, elevationDeg: 30, halfAngleDeg: 30, bins: 25, length: 700 };
const device = defaultAssessmentDevice(), response = defaultAssessmentResponse();
const runtime = await loadCompiledMeshRuntime(dataset, 'low');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('worker numeric inputs preserve exact fields, contours, mapping and raw result immutability', async () => {
  for (const bins of [25, 65]) {
    const material = await evaluateMaterialProjection(runtime, { ...config, bins });
    const detector = await evaluateCompiledAssessment(runtime, { ...config, bins }, device, response);
    for (const result of [material, detector]) {
      const before = structuredClone(result), input = structuredClone(numericPatternInput(result));
      assert.throws(() => prepareNumericPattern('unknown', input, {}), /Unknown numeric/);
      const field = materialFieldFromProjection(result, 'concrete');
      const levelOptions = { mode: 'physical', units: 'm.w.e.', levels: [1, 10, 100] };
      const prepared = prepareNumericPattern('contribution', input, { material: 'concrete', quantity: 'material-column', levelOptions });
      assert.deepEqual(prepared.field, field); assert.deepEqual(prepared.contours, extractContributionContours(field, levelOptions));
      prepared.contours.overlays.forEach((overlay, i) => {
        assert.deepEqual(prepared.mapped[i], mapContributionOverlayToGraph(overlay, field, { width: bins, height: bins }));
        assert.equal(prepared.pathData[i], contributionPathData(prepared.mapped[i].lines));
      });
      assert.deepEqual(result, before);
    }
    for (const context of ['through', 'open-sky', 'normalized']) {
      const options = { context, quantity: context === 'open-sky' ? 'expected-count' : 'transmission', levels: [.01, .1, .5] };
      const prepared = prepareNumericPattern('response', structuredClone(numericPatternInput(detector)), options);
      assert.deepEqual(prepared.field, responsePattern(detector, options).field);
      assert.deepEqual(prepared.contours, responsePattern(detector, options).contours);
    }
  }
});

test('worker reference view preparation exactly preserves mapping, SVG text, source and stale-field rejection', async () => {
  for (const bins of [25, 65]) {
    for (const result of [await evaluateMaterialProjection(runtime, { ...config, bins }),
      await evaluateCompiledAssessment(runtime, { ...config, bins }, device, response)]) {
      const field = materialFieldFromProjection(result, 'concrete');
      const base = extractContributionContours(field, { mode: 'physical', units: 'm.w.e.', levels: [1] }).overlays[0];
      const overlay = createPatternOverlay({ ...base, semantic: 'structural-reference', state: 'ready',
        lines: [[[field.grid.sx[0], field.grid.sy[0]], [field.grid.sx.at(-1), field.grid.sy.at(-1)]]] });
      const saved = structuredClone({ overlay, field });
      const [layer] = prepareReferenceViewLayers(structuredClone([overlay]), structuredClone([field]), bins);
      const mapped = mapPatternOverlayToGraph(overlay, field, { width: bins, height: bins });
      assert.deepEqual(layer.mapped, mapped); assert.deepEqual(layer.overlay, overlay);
      assert.equal(layer.pathData, contributionPathData(mapped.lines));
      assert.deepEqual({ overlay, field }, saved);
      assert.throws(() => prepareReferenceViewLayers([overlay], [], bins), /material field/);
      assert.throws(() => prepareReferenceViewLayers([base], [field], bins), /Structural/);
      const changed = structuredClone(result); changed.config.azimuthDeg++;
      assert.throws(() => prepareReferenceViewLayers([overlay], [materialFieldFromProjection(changed, 'concrete')], bins), /mismatch/);
    }
  }
});

test('published scenarios prepare raw fields on each actual grid with complete asset/density identity', async () => {
  for (const scenarioId of ['low', 'mid', 'high', 'extreme']) {
    const r = await loadCompiledMeshRuntime(dataset, scenarioId);
    const material = await evaluateMaterialProjection(r, config);
    const detector = await evaluateCompiledAssessment(r, config, device, response);
    for (const result of [material, detector]) {
      const saved = structuredClone(result), prepared = prepareProjectionPattern(result);
      assert.equal(prepared.snapshot.inputs.datasetRelease, dataset.id);
      assert.equal(prepared.snapshot.inputs.scenario, scenarioId);
      assert.match(prepared.snapshot.inputs.environment.geometry.assetIdentity.glbSha256, /^[a-f0-9]{64}$/);
      assert.match(prepared.snapshot.inputs.environment.geometry.assetIdentity.specSha256, /^[a-f0-9]{64}$/);
      assert.equal(prepared.snapshot.inputs.environment.geometry.materials.steel.density, dataset.geometry.materials.get('steel').density);
      for (const materialId of dataset.geometry.materials.keys()) for (const quantity of ['material-path', 'material-column']) {
        const field = materialFieldFromProjection(result, materialId, quantity);
        assert.deepEqual(field.values, result.pixels.map(p => p[quantity === 'material-path' ? 'totals' : 'materialColumns'][materialId]));
        assert.ok(field.valid.every(Boolean));
        field.values[0] = 999;
      }
      assert.deepEqual(result, saved);
      result.pixels.forEach((p, i) => {
        assert.equal(prepared.grid.sx[i % config.bins], p.sx);
        assert.equal(prepared.grid.sy[Math.floor(i / config.bins)], p.sy);
      });
    }
    assert.notEqual(prepareProjectionPattern(material).snapshot.key, prepareProjectionPattern(detector).snapshot.key);
    assert.notDeepEqual(prepareProjectionPattern(material).grid.sx, prepareProjectionPattern(detector).grid.sx);
    const grid = prepareProjectionPattern(detector).grid;
    detector.pixels.forEach((p, i) => {
      const x = grid.sxBounds[i % config.bins], y = grid.syBounds[Math.floor(i / config.bins)];
      assert.deepEqual(x, [(p.nativeRangeX[0] - 0.5) * device.nativeSlopeStep, (p.nativeRangeX[1] + 0.5) * device.nativeSlopeStep]);
      assert.deepEqual(y, [(p.nativeRangeY[0] - 0.5) * device.nativeSlopeStep, (p.nativeRangeY[1] + 0.5) * device.nativeSlopeStep]);
    });
  }
});

test('affine contours align with their own graph at 25/65 bins, rectangular sizes and +sy top', async () => {
  for (const n of [25, 65]) {
    const synthetic = { ...runtime, traceRayModel: (_, direction) => {
      // Pose zero: sx=direction.y/direction.x, sy=direction.z/direction.x.
      const value = 4 + direction[1] / direction[0];
      return { totals: { concrete: value }, materialColumns: { concrete: value }, mwe: value };
    } };
    const c = { ...config, origin: [0, 0, 0], azimuthDeg: 0, elevationDeg: 0, bins: n };
    for (const result of [await evaluateMaterialProjection(synthetic, c), await evaluateCompiledAssessment(synthetic, c, device, response)]) {
      const field = materialFieldFromProjection(result, 'concrete');
      const extracted = extractContributionContours(field, { mode: 'physical', units: 'm.w.e.', levels: [4.123] });
      const overlay = extracted.overlays[0];
      const mapped = mapContributionOverlayToGraph(overlay, field, { width: 500, height: 300 });
      let low = 0; while (field.grid.sx[low + 1] < 0.123) low++;
      const expectedX = (low + 0.5 + (0.123 - field.grid.sx[low]) / (field.grid.sx[low + 1] - field.grid.sx[low])) * 500 / n;
      assert.ok(mapped.lines.flat().length > 10);
      mapped.lines.flat().forEach(([x, y]) => { near(x, expectedX); assert.ok(y >= 150 / n && y <= 300 - 150 / n + 1e-10); });
      const small = mapContributionOverlayToGraph(overlay, field, { width: 250, height: 150 });
      mapped.lines.forEach((line, i) => line.forEach(([x, y], j) => { near(x / 2, small.lines[i][j][0]); near(y / 2, small.lines[i][j][1]); }));
      const centerLine = createPatternOverlay({ ...overlay, lines: [[
        [field.grid.sx[2], field.grid.sy[1]], [field.grid.sx[2], field.grid.sy[n - 2]]]] });
      const positioned = mapContributionOverlayToGraph(centerLine, field, { width: n, height: n });
      assert.deepEqual(positioned.lines[0][0], [2.5, 1.5]);
      assert.deepEqual(positioned.lines[0].at(-1), [2.5, n - 1.5]);
    }
  }
});

test('long mapped segments split at nonuniform slope knots instead of cutting graph corners', async () => {
  const result = await evaluateCompiledAssessment(runtime, { ...config, bins: 3 }, device, response);
  const field = materialFieldFromProjection(result, 'concrete');
  const grid = field.grid;
  const base = extractContributionContours(field, { mode: 'adaptive' }).overlays[0];
  const overlay = createPatternOverlay({ ...base, state: 'ready', lines: [[[grid.sx[0], grid.sy[0]], [grid.sx.at(-1), grid.sy.at(-1)]]] });
  const mapped = mapContributionOverlayToGraph(overlay, field, { width: 3, height: 3 });
  assert.ok(mapped.lines[0].length >= 3);
  assert.deepEqual(mapped.lines[0][0], [0.5, 0.5]); assert.deepEqual(mapped.lines[0].at(-1), [2.5, 2.5]);
});

test('missing contributions are invalid support, and malformed grids/units/cross-snapshot overlays fail closed', async () => {
  const result = await evaluateCompiledAssessment(runtime, { ...config, bins: 3 }, device, response);
  const good = materialFieldFromProjection(result, 'steel');
  const missing = structuredClone(result); missing.pixels[0].materialColumns = null;
  const field = materialFieldFromProjection(missing, 'steel');
  assert.equal(field.values[0], null); assert.equal(field.valid[0], false);
  assert.throws(() => materialFieldFromProjection(result, 'not-a-material'));
  for (const mutate of [r => r.pixels[3].sx += 0.1, r => r.pixels[0].nativeRangeX[0]++,
    r => r.materialContributionUnits.materialColumns = 'm', r => r.pixels[0].materialColumns.steel = NaN,
    r => r.projectionGeometry = null]) {
    const bad = structuredClone(result); mutate(bad); assert.throws(() => materialFieldFromProjection(bad, 'steel'));
  }
  const overlay = extractContributionContours(good, { mode: 'physical', units: 'm.w.e.', levels: [1] }).overlays[0];
  const altered = structuredClone(result); altered.config.origin[0] += 1;
  assert.throws(() => mapContributionOverlayToGraph(overlay, materialFieldFromProjection(altered, 'steel'), { width: 300, height: 300 }), /mismatch/);
  assert.throws(() => mapContributionOverlayToGraph(overlay, good, { width: 0, height: 300 }));
  const outside = createPatternOverlay({ ...overlay, state: 'ready', lines: [[[100, 100], [101, 101]]] });
  assert.throws(() => mapContributionOverlayToGraph(outside, good, { width: 300, height: 300 }), /hull/);
});

test('calculation identity is captured before yields and snapshot keys include all effective metadata', async () => {
  const fake = { ...runtime, identity: structuredClone(runtime.identity), variables: structuredClone(runtime.variables),
    projectionGeometry: structuredClone(runtime.projectionGeometry) };
  const identity = structuredClone(fake.identity), geometry = structuredClone(fake.projectionGeometry);
  const result = await evaluateMaterialProjection(fake, { ...config, bins: 3 }, { yieldTask: () => {
    fake.identity.release_id = 'changed'; fake.variables.water_up_level = -1;
    fake.projectionGeometry.materials.steel.density = 999;
  } });
  assert.deepEqual(result.identity, identity); assert.deepEqual(result.projectionGeometry, geometry);
  const base = prepareProjectionPattern(result).snapshot.key;
  for (const mutate of [r => r.config.length++, r => r.config.elevationDeg++, r => r.config.origin[0]++,
    r => r.variables.water_up_level++, r => r.projectionGeometry.materials.steel.density++,
    r => r.projectionGeometry.assetIdentity.glbSha256 = 'other', r => r.backend += '-other']) {
    const changed = structuredClone(result); mutate(changed); assert.notEqual(prepareProjectionPattern(changed).snapshot.key, base);
  }
  const assessment = await evaluateCompiledAssessment(runtime, { ...config, bins: 3 }, device, response);
  const changed = structuredClone(assessment); changed.response.exposureDays++;
  assert.notEqual(prepareProjectionPattern(changed).snapshot.key, prepareProjectionPattern(assessment).snapshot.key);
});
