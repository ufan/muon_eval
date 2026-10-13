import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { frozenCalculationBaseline } from '../fixtures/frozen-calculation-baseline.mjs';
import { cosThetaStar, gaisserFlux, integratedSurfaceFlux, minimumMuonEnergy, countSignificance } from '../../dist/modules/muon-response.js';
import { nativeAxisBins, applyProjectionResolution, createProjectionPass } from '../../dist/modules/detector-projection.js';

const device = { layers: 3, width: .4096, height: .4096, stripsX: 256, stripsY: 256,
  nativeSlopeStep: .0016 / .30, maxSlopeX: 255 * .0016 / .30, maxSlopeY: 255 * .0016 / .30 };
const response = { layerEfficiency: .95, deadLiveFraction: .98, angularResolutionDeg: .3,
  systematicFraction: .03, exposureDays: 30, angularModel: 'gaisser' };
const sampleRay = (sx, sy) => ({ dir: { x: sx, y: sy, z: .55 / Math.sqrt(1 + sx * sx + sy * sy) },
  q: { mwe: 100 + 50 * (sx + 1.4) + 300 * (sy + 1.4), totals: { concrete: 20 } } });

// Frozen orchestration formula (app.js before extraction, revised by
// quick-response@3.0.0: projected area, no edge factor). Test-only.
function referencePass(n, device, response, sampleRay) {
  const baseline = frozenCalculationBaseline(device, response), bins = baseline.nativeAxisBins(n);
  const areaCm2 = device.width * device.height * 1e4, seconds = response.exposureDays * 86400;
  const response0 = response.layerEfficiency ** 3 * response.deadLiveFraction, values = [];
  let total = 0, openTotal = 0;
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const bx = bins[col], by = bins[row], sx = bx.slope, sy = by.slope;
    const acceptanceWeight = bx.sumWeight * by.sumWeight, { dir, q } = sampleRay(sx, sy);
    const open = baseline.integratedSurfaceFlux(dir.z, 1), through = baseline.integratedSurfaceFlux(dir.z, baseline.minimumMuonEnergy(q.mwe));
    const cosTheta = 1 / Math.sqrt(1 + sx * sx + sy * sy), dOmega = device.nativeSlopeStep ** 2 * acceptanceWeight * cosTheta ** 3;
    const factor = areaCm2 * cosTheta * seconds * dOmega * response0;
    const count = through * factor, openCount = open * factor, transmission = open > 0 ? through / open : 0;
    total += count; openTotal += openCount;
    values.push({ sx, sy, dir, q, count, transmission, factor, sigByTarget: {},
      nativeRangeX: [bx.first, bx.last], nativeRangeY: [by.first, by.last] });
  }
  baseline.applyProjectionResolution(values, n);
  return { n, values, total, weightedTransmission: openTotal > 0 ? total / openTotal : 0 };
}

test('spectrum, energy loss and integrated flux exactly match the frozen formulas', () => {
  for (const angularModel of ['gaisser', 'cos2']) {
    const baseline = frozenCalculationBaseline(device, { ...response, angularModel });
    for (const cosZ of [0, .01, .101, .102, .5, .99, 1]) {
      assert.equal(cosThetaStar(cosZ), baseline.cosThetaStar(cosZ));
      for (const energy of [1, 10, 100, 10000]) assert.equal(gaisserFlux(energy, cosZ), baseline.gaisserFlux(energy, cosZ));
      for (const mwe of [-1, 0, 50, 500, 2000]) {
        const energy = minimumMuonEnergy(mwe);
        assert.equal(energy, baseline.minimumMuonEnergy(mwe));
        assert.equal(integratedSurfaceFlux(cosZ, energy, angularModel), baseline.integratedSurfaceFlux(cosZ, energy));
      }
    }
  }
});

test('native strip bins and Gaussian smoothing exactly match the baseline', () => {
  for (const n of [25, 65]) {
    const baseline = frozenCalculationBaseline(device, response);
    assert.deepEqual(nativeAxisBins(n, device), baseline.nativeAxisBins(n));
    for (const angularResolutionDeg of [.01, .3, 3, 20]) {
      const settings = { ...response, angularResolutionDeg };
      const values = Array.from({ length: n * n }, (_, i) => ({ count: i % 13, transmission: (i % 5) / 5 }));
      const expected = structuredClone(values);
      frozenCalculationBaseline(device, settings).applyProjectionResolution(expected, n);
      applyProjectionResolution(values, n, device, settings);
      assert.deepEqual(values, expected);
    }
  }
});

test('complete 25/65-bin count projections exactly match the frozen formulas with both flux models', () => {
  for (const n of [25, 65]) for (const angularModel of ['gaisser', 'cos2']) {
    const settings = { ...response, angularModel };
    const expected = referencePass(n, device, settings, sampleRay);
    const pass = createProjectionPass({ n, device, response: settings, sampleRay });
    let state;
    do { state = pass.advance(3); } while (!state.done);
    const { modelVersion, ...actual } = state.result;
    assert.equal(modelVersion, 'quick-response@3.0.0');
    assert.deepEqual(actual, expected);
    assert.strictEqual(pass.advance(3).result, state.result);
  }
});

test('exposure/area/efficiency scaling, open sky, horizon and significance retain existing behavior', () => {
  const evaluate = (d = device, r = response, z = 1) => createProjectionPass({ n: 25, device: d, response: r,
    sampleRay: () => ({ dir: { z }, q: { mwe: 0 } }) }).advance(25).result;
  const base = evaluate();
  assert.equal(base.weightedTransmission, 1);
  assert.equal(evaluate(device, { ...response, exposureDays: 60 }).total, base.total * 2);
  assert.equal(evaluate({ ...device, width: device.width * 2 }).total, base.total * 2);
  assert.equal(evaluate(device, { ...response, layerEfficiency: 0 }).total, 0);
  assert.equal(evaluate(device, response, 0).total, 0);
  assert.equal(evaluate(device, response, -1).weightedTransmission, 0);
  assert.equal(countSignificance(100, 80, .03), 20 / Math.sqrt(100 + 3 ** 2));
});

test('batch scheduling does not change results; settings are snapshotted and bin caches are parameterized', () => {
  const d = { ...device }, r = { ...response };
  const pass = createProjectionPass({ n: 25, device: d, response: r, sampleRay });
  d.width = 9; r.exposureDays = 3000;
  let state;
  do { state = pass.advance(1); } while (!state.done);
  const other = createProjectionPass({ n: 25, device, response, sampleRay }).advance(25).result;
  assert.deepEqual(state.result, other);
  const cache = new Map();
  assert.notDeepEqual(nativeAxisBins(25, device, cache), nativeAxisBins(25, { ...device, nativeSlopeStep: .1 }, cache));
  assert.throws(() => pass.advance(0), /Invalid/);
  assert.throws(() => createProjectionPass({ n: 999, device, response, sampleRay }), /Invalid/);
});

test('shared numerical modules have no DOM or rendering imports', async () => {
  for (const file of ['muon-response.js', 'detector-projection.js']) {
    const source = await readFile(new URL(`../../dist/modules/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(document|window)\s*\.|from\s+['"][^'"]*three/i);
  }
});

test('main entry and extracted modules parse explicitly as browser ES modules', async () => {
  for (const file of ['app.js', 'modules/muon-response.js', 'modules/detector-projection.js']) {
    const source = await readFile(new URL(`../../dist/${file}`, import.meta.url), 'utf8');
    const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
    assert.equal(checked.status, 0, `${file}: ${checked.stderr}`);
  }
});
