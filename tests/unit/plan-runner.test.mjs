import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan, planHash } from '../../dist/modules/plan-format.js';
import { selectPlanStations, planAssessmentInputs, planRunSummary, resultFileName, RUN_SUMMARY_VERSION } from '../../dist/modules/plan-runner.js';
import { parseRunArguments } from '../../scripts/run-plan.mjs';

// Headless batch runner (FR-S5, ADR-006): plan in, results out.
const plan = parsePlan(await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8'));
const environment = { water_up_level: 290 };

test('stations are chosen as all, the selected deployment, the active station or by id', () => {
  assert.deepEqual(selectPlanStations(plan, 'all').map(s => s.id), ['north', 'station-2']);
  assert.deepEqual(selectPlanStations(plan, 'selected').map(s => s.id), ['north']);
  assert.deepEqual(selectPlanStations(plan, 'active').map(s => s.id), ['station-2']);
  assert.deepEqual(selectPlanStations(plan, ['station-2', 'north']).map(s => s.id), ['station-2', 'north']);
  assert.throws(() => selectPlanStations(plan, ['missing']), /missing/);
  assert.throws(() => selectPlanStations(plan, ['north', 'north']), /twice/);
  assert.throws(() => selectPlanStations({ ...plan, deployment: { ...plan.deployment, selected: [] } }, 'selected'), /no selected deployment/);
  assert.throws(() => selectPlanStations(plan, 'some'), /Unknown station choice/);
});

test('each station becomes one assessment input carrying its plan reference', () => {
  const inputs = planAssessmentInputs(plan, { environment, stations: 'all' }), hash = planHash(plan);
  assert.deepEqual(inputs.map(i => i.stationId), ['north', 'station-2']);
  const [north] = inputs;
  assert.deepEqual(north.input.station, { id: 'north', name: '北侧点位', x: 12.5, y: 122, z: 57, az: 0, el: 25, candidateId: 'north' });
  assert.deepEqual(north.input.plan, { hash, stationId: 'north' });
  assert.deepEqual(north.input.environment, environment);
  assert.notEqual(north.input.environment, environment);
  // Derived device values come from the one configuration path, never from the file.
  const { device, response } = north.input;
  assert.equal(device.model, 'test-telescope');
  assert.equal(device.stripsX, 256); assert.equal(device.stripsY, 256);
  assert.ok(Math.abs(device.baseline - .3) < 1e-12);
  assert.ok(Math.abs(device.nativeSlopeStep - .0016 / .3) < 1e-15);
  assert.deepEqual(response, { layerEfficiency: .95, deadLiveFraction: .98, angularResolutionDeg: .3, systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' });
});

test('a station uses its own named detector', () => {
  const doc = structuredClone(plan);
  doc.detectors.long = structuredClone(doc.detectors.default);
  doc.detectors.long.response.exposureDays = 90;
  doc.detectors.long.device.strips = 128;
  doc.stations[1].detector = 'long';
  const [north, second] = planAssessmentInputs(parsePlan(JSON.stringify(doc)), { environment, stations: 'all' });
  assert.equal(north.input.response.exposureDays, 30);
  assert.equal(second.input.response.exposureDays, 90);
  assert.equal(second.input.device.stripsX, 128);
});

test('the run summary is reproducible: no clock, ordered stations, result digests', () => {
  const hash = planHash(plan);
  const result = (stationId, totalCount) => ({ kind: 'compiled-detector-assessment', modelVersion: 'quick-response@4.0.0', scenarioId: 'low',
    identity: { id: 'subject@1.0.0' }, config: { bins: 25 }, plan: { hash, stationId }, totalCount, weightedTransmission: .25 });
  const stations = [{ stationId: 'north', name: '北侧点位', file: 'north.result.json', sha256: 'a'.repeat(64), result: result('north', 10) },
    { stationId: 'station-2', name: '新候选点 2', file: 'station-2.result.json', sha256: 'b'.repeat(64), result: result('station-2', 20) }];
  const summary = planRunSummary({ plan, quality: 'preview', stations, comparison: null });
  assert.equal(summary.format, 'muography-plan-run'); assert.equal(summary.schemaVersion, RUN_SUMMARY_VERSION);
  assert.deepEqual(summary.plan, { hash, title: 'Synthetic study' });
  assert.deepEqual(summary.scene, { release: 'subject@1.0.0', scenario: 'low' });
  assert.equal(summary.quality, 'preview'); assert.equal(summary.bins, 25); assert.equal(summary.modelVersion, 'quick-response@4.0.0');
  assert.deepEqual(summary.stations[1], { id: 'station-2', name: '新候选点 2', file: 'station-2.result.json', sha256: 'b'.repeat(64), totalCount: 20, weightedTransmission: .25 });
  assert.equal(summary.comparison, null);
  assert.deepEqual(Object.keys(summary), ['format', 'schemaVersion', 'plan', 'scene', 'quality', 'bins', 'modelVersion', 'stations', 'comparison', 'limitations']);
  // Every result must belong to this plan and scenario.
  assert.throws(() => planRunSummary({ plan, quality: 'preview', stations: [{ ...stations[0], result: { ...result('north', 1), plan: { hash: 'sha256:' + '0'.repeat(64), stationId: 'north' } } }], comparison: null }), /another plan/);
  assert.throws(() => planRunSummary({ plan, quality: 'preview', stations: [{ ...stations[0], result: { ...result('north', 1), scenarioId: 'high' } }], comparison: null }), /scenario/);
});

test('result files are named after the station id', () => {
  assert.equal(resultFileName('station-2'), 'station-2.result.json');
  assert.throws(() => resultFileName('../x'), /station id/);
});

test('command-line arguments are explicit and checked', () => {
  assert.deepEqual(parseRunArguments(['plan.json', '--out', 'runs/a']),
    { planPath: 'plan.json', outDir: 'runs/a', stations: 'all', quality: 'final', workers: null, compare: null });
  assert.deepEqual(parseRunArguments(['plan.json', '--out', 'o', '--stations', 'north,station-2', '--quality', 'preview', '--workers', '2', '--compare', 'material:concrete:0.15']),
    { planPath: 'plan.json', outDir: 'o', stations: ['north', 'station-2'], quality: 'preview', workers: 2, compare: { kind: 'material', id: 'concrete', minimumPathM: .15 } });
  assert.equal(parseRunArguments(['p', '--out', 'o', '--stations', 'selected']).stations, 'selected');
  for (const argv of [[], ['p'], ['p', '--out'], ['p', '--out', 'o', '--quality', 'best'], ['p', '--out', 'o', '--workers', '0'],
    ['p', '--out', 'o', '--compare', 'concrete'], ['p', '--out', 'o', '--compare', 'material:concrete:-1'], ['p', '--out', 'o', '--bogus'], ['p', 'q', '--out', 'o']]) {
    assert.throws(() => parseRunArguments(argv), /Usage|Unknown|must/, JSON.stringify(argv));
  }
});
