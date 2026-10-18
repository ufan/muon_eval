// Coverage highlight (FR-M10, ADR-026): which surface points a station probes, as a
// per-point test (no ray search). Pure JS mirror of the scene shader, tested against
// detector-pose.js so the highlight and the projection agree on directions.
// A projection pixel is a line through the detector; its muons come from the line's
// sky end (quick-response@4.0.0), so points above the detector are probed in front of
// and behind it, and points in front below the detector's horizon receive no flux.
import { nativeAxisBins, pixelSolidAngle } from './detector-projection.js';
import { detectorBasis } from './detector-pose.js';

// Fixed log10 range of counts per steradian for the physical brightness, so stations
// and plans compare on one scale: 10^3 to 10^7.5 spans the 0.5–99.5 % range measured
// over the Zhouning stations at 0°, 25° and 60° elevation with the default device and
// 30-day exposure (10^2.7 to 10^7.3; 2026-10-14). Longer exposures brighten everything.
export const COVERAGE_LOG_RANGE = Object.freeze([3, 7.5]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Slopes of the detector line through `point`; the same from either end of the line.
export function lineSlopes(point, origin, basis) {
  const d = point.map((v, i) => v - origin[i]), f = dot(d, basis.forward);
  if (Math.abs(f) < 1e-12) return null;
  return { sx: dot(d, basis.right) / f, sy: dot(d, basis.up) / f, side: f > 0 ? 'front' : 'back' };
}

// 'probed' | 'no-flux' | 'outside' (model frame, z up). With back: false (后方来向 hidden, a view option) points seen
// only through a line behind the detector count as outside.
export function classifyCoverage(point, origin, basis, device, { back = true } = {}) {
  const slopes = lineSlopes(point, origin, basis);
  if (!slopes || Math.abs(slopes.sx) > device.maxSlopeX || Math.abs(slopes.sy) > device.maxSlopeY) return 'outside';
  if (point[2] > origin[2]) return back || slopes.side === 'front' ? 'probed' : 'outside';
  return slopes.side === 'front' ? 'no-flux' : 'outside';
}

// Projection bin that aggregates this slope (exact inverse of nativeAxisBins), or null.
export function slopeBin(slope, n, device) {
  const strips = device.stripsX, count = 2 * strips - 1, j = Math.round(slope / device.nativeSlopeStep) + strips - 1;
  if (j < 0 || j >= count) return null;
  return Math.ceil((j + 1) * n / count) - 1;
}

// Expected counts per steradian of each pixel (raw counts, not display-smoothed), in
// the projection's own order (bottom row first).
export function countsPerSteradian(values, n, device) {
  const bins = nativeAxisBins(n, device), out = new Float64Array(n * n);
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) out[iy * n + ix] = values[iy * n + ix].count / pixelSolidAngle(bins[ix], bins[iy], device);
  return out;
}

export function coverageBrightness(countsPerSr) {
  const [low, high] = COVERAGE_LOG_RANGE;
  if (!(countsPerSr > 0)) return 0;
  return Math.min(1, Math.max(0, (Math.log10(countsPerSr) - low) / (high - low)));
}

// What one station sees at a surface point (model frame): status, line slopes and side,
// and, with a result, the projection pixel holding that line and its counts per steradian.
export function coverageReadout(point, station, device, result, { back = true } = {}) {
  const origin = [station.x, station.y, station.z], basis = detectorBasis(station.az, station.el);
  const status = classifyCoverage(point, origin, basis, device, { back }), slopes = lineSlopes(point, origin, basis);
  const readout = { status, sx: slopes?.sx ?? null, sy: slopes?.sy ?? null, side: slopes?.side ?? null, ix: null, iy: null, countsPerSr: null };
  if (status === 'outside' || !result) return readout;
  const ix = slopeBin(slopes.sx, result.n, device), iy = slopeBin(slopes.sy, result.n, device);
  if (ix === null || iy === null) return readout;
  const bins = nativeAxisBins(result.n, device);
  return { ...readout, ix, iy, countsPerSr: result.values[iy * result.n + ix].count / pixelSolidAngle(bins[ix], bins[iy], device) };
}

// Sketching (14d, FR-P5). A picked surface point (model frame) becomes a station point
// `offsetM` off the surface on the viewer's side; `rayDirection` points from the viewer.
export function placementPoint(point, normal, rayDirection, offsetM = 0.5) {
  if (![...point, ...normal, ...rayDirection, offsetM].every(Number.isFinite)) throw new Error('Placement needs finite values');
  const length = Math.hypot(...normal);
  if (!(length > 0)) throw new Error('Placement needs a surface normal');
  const sign = dot(normal, rayDirection) > 0 ? -1 : 1;
  return point.map((v, i) => v + sign * offsetM * normal[i] / length);
}

// Ids of the stations ({ id, x, y, z, az, el, device }) that probe a surface point.
export function coveringStations(point, stations, options = {}) {
  return stations.filter(s => classifyCoverage(point, [s.x, s.y, s.z], detectorBasis(s.az, s.el), s.device, options) === 'probed').map(s => s.id);
}

// Candidates shown next to the working station: 'none' | 'compared' | 'deployment' | 'all', in
// pool order, without the working station's own unchanged candidate, at most MAX_EXTRA_COVERAGE.
export const MAX_EXTRA_COVERAGE = 8;
export function coverageStationSet(mode, { pool, compared = [], deployment = [], exclude = null }) {
  const source = { none: [], compared, deployment, all: pool }[mode];
  if (!source) throw new Error(`Unknown coverage station set ${mode}`);
  const chosen = new Set(source);
  return pool.filter(id => chosen.has(id) && id !== exclude).slice(0, MAX_EXTRA_COVERAGE);
}

// Multi-view coverage (15d, FR-M15, ADR-026). A station gives a usable view of a point when the
// projection pixel holding its line through the point has N ≥ (1/errorLevel)² counts, the
// counting-error level of the precision lines. A planning heuristic, not a reconstruction guarantee.
export function usableCounts(errorLevel) {
  if (!(errorLevel > 0 && errorLevel < 1)) throw new Error('Counting error level must be in (0, 1)');
  return Math.round((1 / errorLevel) ** 2);
}

// What one station ({ id, x, y, z, az, el, device, n, counts }) records at a point: null when the point
// is not probed; otherwise the pixel's counts (null while the station's result is pending), counts per
// steradian and the unit direction from the station to the point. `counts` is the result's per-pixel
// counts, bottom row first (as in the projection's own values).
export function stationViewAt(point, station, { back = true } = {}) {
  const origin = [station.x, station.y, station.z], basis = detectorBasis(station.az, station.el);
  if (classifyCoverage(point, origin, basis, station.device, { back }) !== 'probed') return null;
  const d = point.map((v, i) => v - origin[i]), length = Math.hypot(...d), direction = d.map(v => v / length);
  if (!station.counts) return { id: station.id, counts: null, countsPerSr: null, direction };
  const { sx, sy } = lineSlopes(point, origin, basis), ix = slopeBin(sx, station.n, station.device), iy = slopeBin(sy, station.n, station.device);
  if (ix === null || iy === null) return { id: station.id, counts: null, countsPerSr: null, direction };
  const bins = nativeAxisBins(station.n, station.device), counts = station.counts[iy * station.n + ix];
  return { id: station.id, counts, countsPerSr: counts / pixelSolidAngle(bins[ix], bins[iy], station.device), direction };
}

// seen / usable / pending station ids, the largest angle between usable views, the weakest usable
// view's counting error, the dominant station (most counts per steradian), the summed counts per
// steradian, and the class: 'none' (not seen), 'insufficient' (< 2 usable views or spread < minSpreadDeg),
// 'good' (≥ minViews usable views and spread ≥ goodSpreadDeg) or 'limited'.
export function multiViewCoverage(point, stations, { errorLevel = .1, minViews = 3, goodSpreadDeg = 30, minSpreadDeg = 10, back = true } = {}) {
  const views = stations.map(s => stationViewAt(point, s, { back })).filter(Boolean), threshold = usableCounts(errorLevel);
  const measured = views.filter(v => v.counts !== null), usable = measured.filter(v => v.counts >= threshold);
  let spread = 0;
  for (let i = 0; i < usable.length; i++) for (let j = i + 1; j < usable.length; j++) {
    spread = Math.max(spread, Math.acos(Math.max(-1, Math.min(1, dot(usable[i].direction, usable[j].direction)))) * 180 / Math.PI);
  }
  const dominant = measured.reduce((best, v) => !best || v.countsPerSr > best.countsPerSr ? v : best, null);
  const cls = !views.length ? 'none' : usable.length < 2 || spread < minSpreadDeg ? 'insufficient'
    : usable.length >= minViews && spread >= goodSpreadDeg ? 'good' : 'limited';
  return { seen: views.map(v => v.id), usable: usable.map(v => v.id), pending: views.filter(v => v.counts === null).map(v => v.id),
    spreadDeg: spread, weakestError: usable.length ? Math.max(...usable.map(v => 1 / Math.sqrt(v.counts))) : null,
    dominant: dominant ? { id: dominant.id, countsPerSr: dominant.countsPerSr } : null,
    totalCountsPerSr: measured.reduce((t, v) => t + v.countsPerSr, 0), class: cls };
}

// Counts per steradian of every pixel from a counts array (bottom row first), for the physical maps.
export function perSteradianMap(counts, n, device) {
  const bins = nativeAxisBins(n, device), out = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) out[iy * n + ix] = counts[iy * n + ix] / pixelSolidAngle(bins[ix], bins[iy], device);
  return out;
}
