// Development-only experiment (FR-V12): how much does tracing one ray per
// projection pixel, from the detector centre, differ from averaging counts
// over the pixel's native strip-difference directions and over entry points
// across the aligned detector area? No application state is written.
//
// Usage: node scripts/experiment-pixel-sampling.mjs [--scenario low] [--bins 65]
//   [--k 8] [--p 4] [--poses "az,el;az,el"] [--stations id,id] [--workers 4] [--json out.json]
// k: sub-directions per pixel axis (k = native bins per pixel = exact native sampling)
// p: entry points per detector axis (1 = centre only)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFile } from 'node:fs/promises';
import { loadRegisteredDataset } from './dataset-fixture.mjs';
import { createApplicationBackend } from '../dist/modules/application-backends.js';
import { defaultDeviceConfiguration } from '../dist/modules/device-configuration.js';
import { enclosingCompiledRayLength } from '../dist/modules/compiled-main-assessment.js';
import { detectorBasis, slopeDirection } from '../dist/modules/detector-pose.js';
import { nativeAxisBins, evaluateProjectionPixel } from '../dist/modules/detector-projection.js';
import { integratedSurfaceFlux } from '../dist/modules/muon-response.js';

const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';

async function load(scenarioId) {
  const dataset = await loadRegisteredDataset(release);
  const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId });
  return { runtime: backend.runtime, stations: backend.stations, ...defaultDeviceConfiguration() };
}

// Split a pixel's native range into k blocks, built exactly like nativeAxisBins
// builds a pixel (weighted mean slope, summed weight).
function subBins(first, last, k, stripsX, step) {
  const count = last - first + 1, out = [];
  for (let b = 0; b < k; b++) {
    const lo = first + Math.floor(b * count / k), hi = first + Math.floor((b + 1) * count / k) - 1;
    if (hi < lo) continue;
    let sumWeight = 0, weightedSlope = 0;
    for (let d = lo; d <= hi; d++) { const w = (stripsX - Math.abs(d)) / stripsX; sumWeight += w; weightedSlope += w * d * step; }
    out.push({ slope: weightedSlope / sumWeight, sumWeight, first: lo, last: hi });
  }
  return out;
}

async function workerMain() {
  const { scenarioId, stationId, az, el, bins, k, p, rows } = workerData;
  const { runtime, stations, device, response } = await load(scenarioId);
  const station = stations.find(s => s.id === stationId), origin = [station.x, station.y, station.z];
  const basis = detectorBasis(az, el), flux = (z, e) => integratedSurfaceFlux(z, e, response.angularModel);
  const axis = nativeAxisBins(bins, device), out = [];
  const trace = (start, direction) => runtime.traceRayModel(start, direction, enclosingCompiledRayLength(start, runtime.bounds));
  for (const row of rows) for (let col = 0; col < bins; col++) {
    const bx = axis[col], by = axis[row];
    const centreDir = slopeDirection(basis, bx.slope, by.slope), centre = trace(origin, centreDir);
    const base = evaluateProjectionPixel({ bx, by, dir: { z: centreDir[2] }, q: centre, device, response, flux }).value;
    let count = 0, open = 0, minFirst = Infinity;
    for (const sx of subBins(bx.first, bx.last, k, device.stripsX, device.nativeSlopeStep))
      for (const sy of subBins(by.first, by.last, k, device.stripsX, device.nativeSlopeStep)) {
        const dir = slopeDirection(basis, sx.slope, sy.slope);
        // Entry points over the area aligned on both outer planes for this direction.
        const hx = (device.width - device.baseline * Math.abs(sx.slope)) / 2, hy = (device.height - device.baseline * Math.abs(sy.slope)) / 2;
        let sum = 0, sumOpen = 0;
        for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
          const u = p === 1 ? 0 : -hx + (i + .5) * 2 * hx / p, v = p === 1 ? 0 : -hy + (j + .5) * 2 * hy / p;
          const start = origin.map((o, a) => o + u * basis.right[a] + v * basis.up[a]);
          const q = trace(start, dir), r = evaluateProjectionPixel({ bx: sx, by: sy, dir: { z: dir[2] }, q, device, response, flux });
          sum += r.value.count; sumOpen += r.openCount;
          const firstMaterial = q.segments?.find(s => s.material !== 'air')?.t0;
          if (Number.isFinite(firstMaterial)) minFirst = Math.min(minFirst, firstMaterial);
        }
        count += sum / (p * p); open += sumOpen / (p * p);
      }
    out.push({ row, col, base: base.count, ref: count, open, mwe: centre.mwe, firstMaterialM: Number.isFinite(minFirst) ? minFirst : null });
  }
  parentPort.postMessage(out);
}

function quantile(values, q) { const s = [...values].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; }

function summarise(pixels) {
  const valid = pixels.filter(x => x.ref > 0 && Number.isFinite(x.base) && Number.isFinite(x.ref));
  const totalBase = valid.reduce((s, x) => s + x.base, 0), totalRef = valid.reduce((s, x) => s + x.ref, 0);
  const rel = valid.map(x => Math.abs(x.base / x.ref - 1)), pull = valid.map(x => Math.abs(x.base - x.ref) / Math.sqrt(x.ref));
  const weightedRel = valid.reduce((s, x) => s + x.ref * Math.abs(x.base / x.ref - 1), 0) / totalRef;
  const near = valid.filter(x => x.firstMaterialM !== null && x.firstMaterialM < 10);
  return { pixels: valid.length, totalRelative: totalBase / totalRef - 1, countWeightedMeanAbsRelative: weightedRel,
    p50AbsRelative: quantile(rel, .5), p95AbsRelative: quantile(rel, .95), maxAbsRelative: Math.max(...rel),
    p95AbsPull: quantile(pull, .95), maxAbsPull: Math.max(...pull),
    fractionPullAbove1: pull.filter(x => x > 1).length / valid.length, fractionPullAbove2: pull.filter(x => x > 2).length / valid.length,
    nearFieldPixels: near.length, nearFieldP95AbsRelative: quantile(near.map(x => Math.abs(x.base / x.ref - 1)), .95),
    meanCountPerPixel: totalRef / valid.length };
}

async function main() {
  const args = process.argv.slice(2), value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const scenarioId = value('--scenario', 'low'), bins = +value('--bins', 65), k = +value('--k', 8), p = +value('--p', 4);
  const workers = +value('--workers', 4), json = value('--json', null);
  const { stations, response } = await load(scenarioId);
  const stationIds = value('--stations', stations.map(s => s.id).join(',')).split(',');
  const poses = value('--poses', '90,30;270,30;0,30;90,60').split(';').map(t => t.split(',').map(Number));
  const results = [];
  for (const stationId of stationIds) for (const [az, el] of poses) {
    const started = Date.now(), chunks = Array.from({ length: workers }, (_, w) => Array.from({ length: bins }, (_, r) => r).filter(r => r % workers === w));
    const parts = await Promise.all(chunks.map(rows => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { scenarioId, stationId, az, el, bins, k, p, rows } });
      worker.once('message', resolve); worker.once('error', reject);
    })));
    const pixels = parts.flat(), summary = summarise(pixels);
    results.push({ stationId, az, el, scenarioId, bins, k, p, exposureDays: response.exposureDays, seconds: (Date.now() - started) / 1000, summary,
      ...(json ? { pixels } : {}) });
    const f = x => (100 * x).toFixed(2) + '%';
    console.log(`${stationId.padEnd(28)} az ${String(az).padStart(3)} el ${String(el).padStart(2)} | total ${f(summary.totalRelative).padStart(7)} | |rel| wmean ${f(summary.countWeightedMeanAbsRelative).padStart(6)} p95 ${f(summary.p95AbsRelative).padStart(7)} max ${f(summary.maxAbsRelative).padStart(8)} | pull p95 ${summary.p95AbsPull.toFixed(2)} max ${summary.maxAbsPull.toFixed(1)} >1σ ${f(summary.fractionPullAbove1)} >2σ ${f(summary.fractionPullAbove2)} | near ${summary.nearFieldPixels} p95 ${f(summary.nearFieldP95AbsRelative || 0)} | N/px ${summary.meanCountPerPixel.toFixed(0)} | ${results.at(-1).seconds.toFixed(0)} s`);
  }
  if (json) await writeFile(json, JSON.stringify({ release, generated: new Date().toISOString(), results }, null, 1));
}

if (isMainThread) await main(); else await workerMain();
