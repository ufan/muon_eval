import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../scripts/dataset-fixture.mjs';
import { loadCompiledMeshRuntime } from '../dist/modules/compiled-mesh-runtime.js';
import { evaluateMaterialProjection } from '../dist/modules/material-projection.js';
import { evaluateCompiledAssessment } from '../dist/modules/compiled-assessment.js';
import { defaultAssessmentDevice, defaultAssessmentResponse } from '../dist/modules/detector-defaults.js';
import { createContributionExport, replayContributionExport } from '../dist/modules/contribution-export.js';

const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
const runtime = await loadCompiledMeshRuntime(dataset, 'low');
const config = { origin: dataset.geometry.coordinates.pointToModel(dataset.candidates.candidates[0].example_position),
  azimuthDeg: 180, elevationDeg: 30, halfAngleDeg: 30, bins: 3, length: 700 };
const material = await evaluateMaterialProjection(runtime, config);
const detector = await evaluateCompiledAssessment(runtime, config, defaultAssessmentDevice(), defaultAssessmentResponse());
const selection = { quantity: 'material-column', materials: ['concrete', 'rock', 'steel'], levelOptions: { mode: 'adaptive' } };

test('both graph exports replay exact lines/coverage/provenance after JSON round trips without rays', () => {
  for (const result of [material, detector]) for (const quantity of ['material-path', 'material-column']) {
    const saved = structuredClone(result), doc = createContributionExport(result, { ...selection, quantity });
    const roundtrip = JSON.parse(JSON.stringify(doc)), replay = replayContributionExport(roundtrip);
    assert.deepEqual(replay.entries, doc.entries); assert.deepEqual(replay.snapshot, doc.snapshot);
    assert.deepEqual(doc.selection.levelOptions, { mode: 'adaptive', fractions: [0.25, 0.5, 0.75] });
    doc.entries.forEach(({ field }) => {
      assert.deepEqual(field.values, result.pixels.map(p => p[quantity === 'material-path' ? 'totals' : 'materialColumns'][field.material]));
      assert.equal(field.snapshot.key, doc.snapshot.key);
    });
    assert.equal(doc.entries[0].field.grid.kind, result === detector ? 'detector-aggregated' : 'uniform-samples');
    assert.deepEqual(result, saved);
    doc.entries[0].field.values[0] = 999; assert.deepEqual(result, saved);
  }
});

test('display changes are separate from scientific identity; hidden layers and empty selections remain honest', () => {
  const a = createContributionExport(material, selection);
  const display = { visible: false, colors: { concrete: '#123456' }, strokeWidthCss: 2, haloWidthCss: 4, raster: { colorScale: 'different' } };
  const b = createContributionExport(material, selection, display);
  assert.deepEqual(a.snapshot, b.snapshot); assert.deepEqual(a.entries, b.entries); assert.notDeepEqual(a.display, b.display);
  display.colors.concrete = 'changed'; assert.equal(b.display.colors.concrete, '#123456');
  assert.deepEqual(replayContributionExport(b).entries, a.entries);
  const empty = createContributionExport(material, { ...selection, materials: [] });
  assert.equal(empty.entries.length, 0); assert.equal(replayContributionExport(empty).entries.length, 0);
  assert.throws(() => createContributionExport(material, { ...selection, materials: [], levelOptions: { mode: 'physical', units: 'm', levels: [] } }));
});

test('explicit levels, partial masks, constants and all-invalid fields retain numerical statuses', () => {
  const levels = { mode: 'physical', units: 'm.w.e.', levels: [1, 10, 100] };
  const doc = createContributionExport(material, { ...selection, levelOptions: levels });
  assert.deepEqual(doc.selection.levelOptions, levels); assert.deepEqual(replayContributionExport(doc).entries, doc.entries);
  for (const mode of ['partial', 'constant', 'invalid']) {
    const changed = structuredClone(material);
    changed.pixels.forEach((p, i) => p.materialColumns.concrete = mode === 'invalid' || mode === 'partial' && i === 0 ? null : 2);
    const saved = createContributionExport(changed, { ...selection, materials: ['concrete'] });
    const replay = replayContributionExport(saved);
    assert.deepEqual(replay.entries, saved.entries);
    assert.equal(saved.entries[0].contours.description.validity, mode === 'invalid' ? 'invalid' : mode === 'partial' ? 'partial' : 'complete');
    assert.ok(saved.entries[0].contours.overlays.every(o => !o.lines.length));
  }
});

test('unknown versions, altered lines/levels/source/units and lossy JSON are rejected', () => {
  const good = createContributionExport(material, selection);
  for (const mutate of [d => d.schemaVersion = '2.0.0', d => d.kind = 'old-raw-result',
    d => d.graphKind = 'compiled-detector-assessment',
    d => d.snapshot.key = 'stale', d => d.entries[0].field.units = 'm',
    d => d.entries[0].field.snapshot = createContributionExport(detector, selection).snapshot,
    d => d.entries[0].contours.overlays[0].state = 'invalid',
    d => d.entries[0].contours.overlays[0].algorithm.version = 'future',
    d => d.entries[0].contours.overlays[0].lines.push([[0, 0], [1, 1]]),
    d => d.selection.levelOptions.fractions = [0.1, 0.5, 0.9], d => d.entries[0].field.values[0] = Infinity,
    d => d.display.strokeWidthCss = NaN, d => d.entries[0].contours.overlays[0].provenance.complete = 'yes',
    d => d.selection.materials.push('concrete')]) {
    const changed = structuredClone(good); mutate(changed); assert.throws(() => replayContributionExport(changed));
  }
  assert.throws(() => replayContributionExport(material), /unsupported/);
});
