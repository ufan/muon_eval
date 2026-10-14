import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { createApplicationBackend } from '../../dist/modules/application-backends.js';
import { defaultDeviceConfiguration, deviceSettingsData } from '../../dist/modules/device-configuration.js';
import { planFromState } from '../../dist/modules/plan-format.js';
import { planAssessmentInputs } from '../../dist/modules/plan-runner.js';
import { createStudyState } from '../../dist/modules/study-state.js';
import { assessmentKey, compactResult, compareEntries } from '../../dist/modules/candidate-results.js';
import { comparisonIndicators } from '../../dist/modules/pattern-comparison.js';

// Compact per-candidate results (FR-P10) on the real compiled backend.
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release);
const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId: 'low' });
const configuration = defaultDeviceConfiguration();
const plan = planFromState({ release, scenario: 'low', model: configuration.device.model, stations: backend.stations.slice(0, 2), settings: deviceSettingsData(configuration) });
const study = createStudyState({ plan, environment: backend.environment });
const selection = { kind: 'material', id: 'concrete', minimumPathM: .15 };
const evaluate = input => { const pass = backend.assessment.createSession(input).projection('final'); let step; do step = pass.advance(65); while (!step.done); return pass.complete(step.result).patternResult; };

test('the working station, a candidate and the batch runner share one key for the same physics', () => {
  const id = plan.stations[0].id, candidate = study.candidateInput(id);
  assert.equal(assessmentKey(study.snapshot()), assessmentKey(candidate));
  const [runner] = planAssessmentInputs(study.plan, { environment: backend.environment, stations: [id] });
  assert.equal(assessmentKey(runner.input), assessmentKey(candidate));
});

test('the compact form keeps the per-pixel values, indicators and differences at a fraction of the size', () => {
  const entries = plan.stations.map(s => {
    const full = evaluate(study.candidateInput(s.id)), entry = compactResult(full, { selection });
    assert.equal(entry.n, 65); assert.equal(entry.totalCount, full.totalCount); assert.equal(entry.weightedTransmission, full.weightedTransmission);
    assert.deepEqual(entry.plan, { hash: study.candidateInput(s.id).plan.hash, stationId: s.id });
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
