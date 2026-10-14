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

// 'probed' | 'no-flux' | 'outside' (model frame, z up).
export function classifyCoverage(point, origin, basis, device) {
  const slopes = lineSlopes(point, origin, basis);
  if (!slopes || Math.abs(slopes.sx) > device.maxSlopeX || Math.abs(slopes.sy) > device.maxSlopeY) return 'outside';
  if (point[2] > origin[2]) return 'probed';
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
export function coverageReadout(point, station, device, result) {
  const origin = [station.x, station.y, station.z], basis = detectorBasis(station.az, station.el);
  const status = classifyCoverage(point, origin, basis, device), slopes = lineSlopes(point, origin, basis);
  const readout = { status, sx: slopes?.sx ?? null, sy: slopes?.sy ?? null, side: slopes?.side ?? null, ix: null, iy: null, countsPerSr: null };
  if (status === 'outside' || !result) return readout;
  const ix = slopeBin(slopes.sx, result.n, device), iy = slopeBin(slopes.sy, result.n, device);
  if (ix === null || iy === null) return readout;
  const bins = nativeAxisBins(result.n, device);
  return { ...readout, ix, iy, countsPerSr: result.values[iy * result.n + ix].count / pixelSolidAngle(bins[ix], bins[iy], device) };
}
