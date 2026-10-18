import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { createApplicationBackend } from '../../dist/modules/application-backends.js';
import { defaultDeviceConfiguration, deviceSettingsData } from '../../dist/modules/device-configuration.js';
import { planFromState } from '../../dist/modules/plan-format.js';
import { planAssessmentInputs } from '../../dist/modules/plan-runner.js';
import { migrateStudies } from '../../dist/modules/workspace-format.js';
import { createWorkspaceState } from '../../dist/modules/workspace-state.js';
import { assessmentKey, compactResult, compactItemLengths, compareEntries } from '../../dist/modules/candidate-results.js';
import { computeRecognitionLayers } from '../../dist/modules/recognition-layers.js';
import { stationItemSummary } from '../../dist/modules/overview-table.js';
import { comparisonIndicators } from '../../dist/modules/pattern-comparison.js';

// Compact per-candidate results (FR-P10) on the real compiled backend.
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release);
const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId: 'low' });
const configuration = defaultDeviceConfiguration();
const plan = planFromState({ release, scenario: 'low', model: configuration.device.model, stations: backend.stations.slice(0, 2), settings: deviceSettingsData(configuration) });
// The app's view of the same two stations: the workspace converted from the plan (fresh IDs, same physics).
const study = createWorkspaceState({ workspace: migrateStudies({ release, studies: [{ id: 's', plan, session: null }] }).workspace, environment: backend.environment });
const ids = study.plan.stations.map(s => s.id);
const selection = { kind: 'material', id: 'concrete', minimumPathM: .15 };
const evaluate = input => { const pass = backend.assessment.createSession(input).projection('final'); let step; do step = pass.advance(65); while (!step.done); return pass.complete(step.result).patternResult; };

test('the working station, a candidate and the batch runner share one key for the same physics', () => {
  const candidate = study.candidateInput(ids[0]);
  assert.equal(assessmentKey(study.snapshot()), assessmentKey(candidate));
  const [runner] = planAssessmentInputs(plan, { environment: backend.environment, stations: [plan.stations[0].id] });
  assert.equal(assessmentKey(runner.input), assessmentKey(candidate));
});

test('the compact form keeps the per-pixel values, indicators and differences at a fraction of the size', () => {
  const entries = plan.stations.map((s, i) => {
    const full = evaluate(study.candidateInput(ids[i])), entry = compactResult(full, { selection });
    assert.equal(entry.n, 65); assert.equal(entry.totalCount, full.totalCount); assert.equal(entry.weightedTransmission, full.weightedTransmission);
    assert.deepEqual(entry.plan, { hash: study.candidateInput(ids[i]).plan.hash, stationId: ids[i] });
    full.pixels.forEach((p, i) => {
      assert.equal(entry.pixels.count[i], Math.fround(p.count)); assert.equal(entry.pixels.transmission[i], Math.fround(p.transmission));
      assert.equal(entry.pixels.mwe[i], Math.fround(p.mwe)); assert.equal(entry.pixels.side[i], p.side === 'back' ? 1 : 0);
    });
    assert.deepEqual(entry.indicators, comparisonIndicators(full, selection));
    assert.ok(entry.bytes < 150e3, `${entry.bytes} bytes`);
    return { label: s.name, entry };
  });
  const comparison = compareEntries(entries);
  // Same detector, response and scenario; the ray length follows the station position and is no difference.
  assert.deepEqual(comparison.differences.map(d => d.fields), [[], []]);
  assert.equal(comparison.comparable, true);
});

test('item lengths in the compact form give the same masks as the full result at any threshold, at 6 bytes per pixel with any length', () => {
  const pass = backend.assessment.createSession(study.candidateInput(ids[0])).projection('final');
  let step; do step = pass.advance(65); while (!step.done);
  const data = pass.complete(step.result), items = dataset.recognitionItems;
  const entry = compactResult(data.patternResult, { selection, recognition: compactItemLengths(data, items) });
  for (const threshold of [.1, 1]) for (const layer of computeRecognitionLayers(data, items, { threshold })) {
    const summary = stationItemSummary(entry, layer.id, threshold);
    assert.equal(summary.maskPixels, layer.maskPixels, `${layer.id} at ${threshold} m`);
  }
  const itemBytes = Object.values(entry.items).reduce((sum, item) => sum + item.index.byteLength + item.length.byteLength, 0);
  console.log(`item lengths: ${Object.entries(entry.items).map(([id, item]) => `${id} ${item.index.length} px`).join(', ')}; ${itemBytes} bytes; entry ${entry.bytes} bytes`);
  assert.ok(itemBytes <= 6 * 65 * 65 * items.length);
});
