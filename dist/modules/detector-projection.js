import { integratedSurfaceFlux, minimumMuonEnergy, RESPONSE_MODEL_VERSION } from './muon-response.js';

export function nativeAxisBins(n, device, cache = new Map()) {
  // Both axes deliberately use stripsX, matching the current symmetric device
  // UI. Rectangular/asymmetric readout is a separate model change.
  const key = `${n}/${device.stripsX}/${device.nativeSlopeStep}`;
  if (cache.has(key)) return cache.get(key);
  const count = 2 * device.stripsX - 1, bins = [];
  for (let i = 0; i < n; i++) {
    const first = Math.floor(i * count / n) - (device.stripsX - 1);
    const last = Math.floor((i + 1) * count / n) - 1 - (device.stripsX - 1);
    let sumWeight = 0, weightedSlope = 0;
    for (let d = first; d <= last; d++) {
      const weight = (device.stripsX - Math.abs(d)) / device.stripsX, slope = d * device.nativeSlopeStep;
      sumWeight += weight; weightedSlope += weight * slope;
    }
    bins.push({ slope: weightedSlope / sumWeight, sumWeight, first, last });
  }
  cache.set(key, bins);
  return bins;
}

export function evaluateProjectionPixel({ bx, by, dir, q, device, response, flux, includeContext = false }) {
  const sx = bx.slope, sy = by.slope, acceptanceWeight = bx.sumWeight * by.sumWeight;
  const areaCm2 = device.width * device.height * 1e4, seconds = response.exposureDays * 86400;
  // Fixed three-layer coincidence is retained, even if device.layers differs.
  const response0 = response.layerEfficiency ** 3 * response.deadLiveFraction;
  const open = flux(dir.z, 1), through = flux(dir.z, minimumMuonEnergy(q.mwe));
  const dOmega = device.nativeSlopeStep ** 2 * acceptanceWeight / (1 + sx * sx + sy * sy) ** 1.5;
  const edge = .85 + .15 * Math.sqrt(Math.max(0, acceptanceWeight / (device.stripsX * device.stripsY)));
  const factor = areaCm2 * seconds * dOmega * response0 * edge;
  const count = through * factor, openCount = open * factor, transmission = open > 0 ? through / open : 0;
  return { value: { sx, sy, dir, q, count, ...(includeContext ? { openCount } : {}), transmission, factor, sigByTarget: {},
    nativeRangeX: [bx.first, bx.last], nativeRangeY: [by.first, by.last] }, openCount };
}

export function applyProjectionResolution(values, n, device, response) {
  const slopePerPixel = 2 * Math.max(device.maxSlopeX, device.maxSlopeY) / Math.max(1, n - 1);
  const sigma = (response.angularResolutionDeg * (Math.PI / 180)) / Math.max(1e-6, slopePerPixel);
  if (sigma < .2) {
    for (const v of values) { v.displayCount = v.count; v.displayTransmission = v.transmission; }
    return;
  }
  const radius = Math.min(6, Math.max(1, Math.ceil(2.5 * sigma))), source = values.map(v => [v.count, v.transmission]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let wc = 0, c = 0, t = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= n || yy < 0 || yy >= n) continue;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)), q = source[yy * n + xx];
      wc += w; c += w * q[0]; t += w * q[1];
    }
    values[y * n + x].displayCount = c / wc;
    values[y * n + x].displayTransmission = t / wc;
  }
}

// Scheduling and cancellation belong to the caller. sampleRay injects any
// geometry backend; only its direction.z (model vertical cosine) and mwe matter.
export function createProjectionPass({ n, device, response, sampleRay, flux, axisBinCache, includeContext = false }) {
  device = { ...device }; response = { ...response };
  if (!Number.isInteger(n) || n < 1 || n > 2 * device.stripsX - 1) throw new Error('Invalid detector projection size');
  const cache = new Map();
  flux ||= (cosZ, energy) => integratedSurfaceFlux(cosZ, energy, response.angularModel, cache);
  const binsX = nativeAxisBins(n, device, axisBinCache), binsY = nativeAxisBins(n, device, axisBinCache);
  const values = []; let total = 0, openTotal = 0, row = 0, result;
  function advance(rows) {
    if (!Number.isInteger(rows) || rows < 1) throw new Error('Invalid projection batch size');
    if (result) return { done: true, progress: 1, result };
    const end = Math.min(n, row + rows);
    for (; row < end; row++) for (let column = 0; column < n; column++) {
      const bx = binsX[column], by = binsY[row], { dir, q } = sampleRay(bx.slope, by.slope);
      const evaluated = evaluateProjectionPixel({ bx, by, dir, q, device, response, flux, includeContext });
      total += evaluated.value.count; openTotal += evaluated.openCount; values.push(evaluated.value);
    }
    if (row === n) {
      applyProjectionResolution(values, n, device, response);
      result = { n, values, total, weightedTransmission: openTotal > 0 ? total / openTotal : 0,
        modelVersion: RESPONSE_MODEL_VERSION };
    }
    return { done: row === n, progress: row / n, result };
  }
  return { advance };
}
