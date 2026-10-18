// What the 3D view shows (ADR-032): one owner for whether the other stations are shown and how coverage is drawn.
// The other stations are always the compared candidates (the 比较 boxes are the only membership); the chips, the
// candidate list, the 3D view and the 多站 tab read this state instead of keeping their own copies. View state only,
// remembered per release in the browser; never part of a plan or a result. Pure.
import { MAX_EXTRA_COVERAGE } from './coverage-map.js';

const MODES = ['off', 'geometric', 'physical'], MAPS = ['views', 'spread', 'class', 'dominant', 'total'];

// back: show what lines from behind the detector record (后方来向) in the projections, coverage and 多站 numbers.
export const DISPLAY_DEFAULTS = Object.freeze({ others: false, back: true, coverage: Object.freeze({ mode: 'off', core: false, context: false, features: true,
  multi: Object.freeze({ map: 'views', errorLevel: 0.1, minViews: 3, goodSpreadDeg: 30, minSpreadDeg: 10 }) }) });

const integer = (value, low, high, fallback) => { const v = Math.round(Number(value)); return Number.isFinite(v) && value !== null && value !== '' ? Math.min(high, Math.max(low, v)) : fallback; };

function readCoverage(c = {}) {
  const d = DISPLAY_DEFAULTS.coverage, m = c.multi ?? {};
  return { mode: MODES.includes(c.mode) ? c.mode : d.mode, core: c.core === true, context: c.context === true, features: c.features !== false,
    multi: { map: MAPS.includes(m.map) ? m.map : d.multi.map, errorLevel: m.errorLevel === 0.05 ? 0.05 : 0.1,
      minViews: integer(m.minViews, 2, 9, d.multi.minViews), goodSpreadDeg: integer(m.goodSpreadDeg, 1, 179, d.multi.goodSpreadDeg),
      minSpreadDeg: integer(m.minSpreadDeg, 0, 179, d.multi.minSpreadDeg) } };
}

// Saved state, or the former coverage settings ({ mode, stations, core, … }), where a station set other than 'none'
// was shown only while coverage was on; 'deployment' and 'all' map to the compared candidates.
export function readDisplayState(saved) {
  if (!saved || typeof saved !== 'object') return structuredClone(DISPLAY_DEFAULTS);
  if ('coverage' in saved || 'others' in saved) return { others: saved.others === true, back: saved.back !== false, coverage: readCoverage(saved.coverage) };
  const coverage = readCoverage(saved);
  return { others: coverage.mode !== 'off' && ['compared', 'deployment', 'all'].includes(saved.stations), back: true, coverage };
}

// The other stations to show: the compared candidates in pool order, without the one loaded as the working station,
// capped at the coverage slots; hiddenCount says how many compared candidates did not fit.
export function shownStations(state, { pool, compared = [], working = null }) {
  const chosen = new Set(compared), all = pool.filter(id => chosen.has(id) && id !== working);
  if (!state.others) return { ids: [], hiddenCount: 0, compared: compared.length };
  return { ids: all.slice(0, MAX_EXTRA_COVERAGE), hiddenCount: Math.max(0, all.length - MAX_EXTRA_COVERAGE), compared: compared.length };
}
