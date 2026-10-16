import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPLAY_DEFAULTS, readDisplayState, shownStations } from '../../dist/modules/display-state.js';

test('defaults: other stations hidden, coverage off with the decided multi-view thresholds', () => {
  assert.deepEqual(readDisplayState(null), DISPLAY_DEFAULTS);
  assert.deepEqual(DISPLAY_DEFAULTS, { others: false, coverage: { mode: 'off', core: false, context: false, features: true,
    multi: { map: 'views', errorLevel: 0.1, minViews: 3, goodSpreadDeg: 30, minSpreadDeg: 10 } } });
});

test('saved values are normalised; unknown or out-of-range values fall back', () => {
  const state = readDisplayState({ others: true, coverage: { mode: 'physical', core: true, context: 1, features: false,
    multi: { map: 'class', errorLevel: 0.05, minViews: 42, goodSpreadDeg: -3, minSpreadDeg: 'x' } } });
  assert.deepEqual(state, { others: true, coverage: { mode: 'physical', core: true, context: false, features: false,
    multi: { map: 'class', errorLevel: 0.05, minViews: 9, goodSpreadDeg: 1, minSpreadDeg: 10 } } });
  assert.equal(readDisplayState({ coverage: { mode: 'rainbow' } }).coverage.mode, 'off');
});

test('migrates the former coverage settings: a station set shown with coverage on becomes "other stations shown"', () => {
  assert.equal(readDisplayState({ mode: 'geometric', stations: 'compared' }).others, true);
  assert.equal(readDisplayState({ mode: 'physical', stations: 'all' }).others, true);
  assert.equal(readDisplayState({ mode: 'off', stations: 'deployment' }).others, false, 'the old set was hidden while coverage was off');
  assert.equal(readDisplayState({ mode: 'physical', stations: 'none' }).others, false);
  assert.deepEqual(readDisplayState({ mode: 'physical', core: true, multi: { map: 'spread' } }).coverage,
    { ...DISPLAY_DEFAULTS.coverage, mode: 'physical', core: true, multi: { ...DISPLAY_DEFAULTS.coverage.multi, map: 'spread' } });
});

test('shown stations: the compared candidates in pool order, without the working station, at most eight', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  assert.deepEqual(shownStations({ others: false }, { pool, compared: ['b'] }), { ids: [], hiddenCount: 0, compared: 1 });
  assert.deepEqual(shownStations({ others: true }, { pool, compared: ['c', 'a'], working: 'a' }), { ids: ['c'], hiddenCount: 0, compared: 2 });
  assert.deepEqual(shownStations({ others: true }, { pool, compared: ['c', 'a'], working: null }), { ids: ['a', 'c'], hiddenCount: 0, compared: 2 });
  const many = shownStations({ others: true }, { pool, compared: pool, working: null });
  assert.deepEqual(many, { ids: pool.slice(0, 8), hiddenCount: 2, compared: 10 });
});
