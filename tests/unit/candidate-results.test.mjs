import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentKey, createResultCache, createCandidateQueue, compareEntries, entryCountsBottomFirst, compactItemLengths } from '../../dist/modules/candidate-results.js';

// Per-candidate session result cache (FR-P10, ADR-020).
const input = (el = 25, extra = {}) => ({ station: { id: 'a', name: 'A', x: 1, y: 2, z: 3, az: 0, el }, device: { model: 'm', width: .4, stripsX: 256 },
  response: { exposureDays: 30 }, environment: { level: 290 }, plan: { hash: 'sha256:' + '0'.repeat(64), stationId: 'a' }, ...extra });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('the key covers every effective input and nothing else', () => {
  const key = assessmentKey(input());
  assert.equal(assessmentKey(input()), key);
  // Names, ids and the plan reference are provenance, not physics; member order is irrelevant.
  assert.equal(assessmentKey({ ...input(), station: { el: 25, az: 0, z: 3, y: 2, x: 1, id: 'other', name: 'B' }, plan: null }), key);
  assert.notEqual(assessmentKey(input(26)), key);
  assert.notEqual(assessmentKey({ ...input(), response: { exposureDays: 31 } }), key);
  assert.notEqual(assessmentKey({ ...input(), environment: { level: 291 } }), key);
  assert.notEqual(assessmentKey({ ...input(), device: { ...input().device, width: .5 } }), key);
  assert.notEqual(assessmentKey(input(), 'preview'), key);
});

test('the cache keeps entries by key and drops those no longer needed', () => {
  const cache = createResultCache();
  cache.set('a', { bytes: 10 }); cache.set('b', { bytes: 5 });
  assert.equal(cache.size, 2); assert.equal(cache.bytes, 15); assert.deepEqual(cache.get('a'), { bytes: 10 });
  cache.retain(['b', 'c']);
  assert.equal(cache.has('a'), false); assert.equal(cache.size, 1); assert.equal(cache.bytes, 5);
});

// A port whose evaluations finish only when the test says so.
function fakePort() {
  const opened = [];
  return { opened, open(i) { const job = { input: i, quality: null, signal: null };
    opened.push(job);
    return { evaluate(quality, { signal }) { job.quality = quality; job.signal = signal;
      return new Promise((resolve, reject) => { job.finish = () => resolve({ el: i.station.el }); job.fail = reject;
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))); }); } }; } };
}

test('the queue evaluates one candidate at a time at final quality, in request order', async () => {
  const port = fakePort(), entries = [];
  const queue = createCandidateQueue({ port, compact: full => ({ compact: full.el }), onEntry: (key, entry) => entries.push([key, entry]) });
  queue.request([{ key: 'k25', input: input(25) }, { key: 'k30', input: input(30) }]);
  await tick();
  assert.equal(port.opened.length, 1); assert.equal(port.opened[0].quality, 'final');
  assert.equal(queue.state('k25'), 'running'); assert.equal(queue.state('k30'), 'queued');
  port.opened[0].finish(); await tick(); await tick();
  assert.deepEqual(entries, [['k25', { compact: 25 }]]); assert.equal(queue.state('k25'), null);
  assert.equal(port.opened.length, 2); port.opened[1].finish(); await tick(); await tick();
  assert.deepEqual(entries.map(e => e[0]), ['k25', 'k30']); assert.equal(queue.idle, true);
});

test('a new request drops stale jobs and cancels a running one that is no longer wanted', async () => {
  const port = fakePort(), entries = [];
  const queue = createCandidateQueue({ port, compact: full => full, onEntry: key => entries.push(key) });
  queue.request([{ key: 'old', input: input(25) }, { key: 'gone', input: input(26) }]);
  await tick();
  queue.request([{ key: 'new', input: input(30) }]);
  assert.equal(port.opened[0].signal.aborted, true);
  await tick(); await tick();
  assert.equal(port.opened.length, 2); assert.equal(port.opened[1].input.station.el, 30);
  // A running job that is still wanted keeps running.
  queue.request([{ key: 'new', input: input(30) }, { key: 'later', input: input(31) }]);
  assert.equal(port.opened[1].signal.aborted, false);
  port.opened[1].finish(); await tick(); await tick();
  assert.deepEqual(entries, ['new']);
  queue.dispose(); assert.equal(port.opened[2].signal.aborted, true);
});

test('pause yields to the working station; resume restarts the interrupted job; failures are reported once', async () => {
  const port = fakePort(), errors = [], entries = [];
  const queue = createCandidateQueue({ port, compact: full => full, onEntry: key => entries.push(key), onError: (key, error) => errors.push([key, error.message]) });
  queue.request([{ key: 'a', input: input(25) }, { key: 'b', input: input(26) }]);
  await tick();
  queue.pause();
  assert.equal(port.opened[0].signal.aborted, true); assert.equal(queue.state('a'), 'queued');
  await tick(); assert.equal(port.opened.length, 1);
  queue.resume(); await tick();
  assert.equal(port.opened.length, 2); assert.equal(port.opened[1].input.station.el, 25);
  port.opened[1].fail(new Error('ray range')); await tick(); await tick();
  assert.deepEqual(errors, [['a', 'ray range']]); assert.equal(queue.state('a'), 'failed');
  // Asking again for a failed key does not retry it in this session.
  queue.request([{ key: 'a', input: input(25) }, { key: 'b', input: input(26) }]);
  await tick(); assert.equal(port.opened.at(-1).input.station.el, 26);
});

test('cached candidates compare through the shared indicators and parameter differences', () => {
  const entry = (detector, coverage) => ({ indicators: { targetFieldCoverage: coverage }, snapshotInputs: { datasetRelease: 'r', geometryVersion: 'g', backendVersion: 'b',
    modelVersion: 'm', detector, environment: {}, sampling: {}, response: {} } });
  const comparison = compareEntries([{ label: 'A', entry: entry({ w: 1 }, .2) }, { label: 'B', entry: entry({ w: 2 }, .3) }]);
  assert.deepEqual(comparison.rows.map(r => [r.label, r.indicators.targetFieldCoverage]), [['A', .2], ['B', .3]]);
  assert.deepEqual(comparison.differences.map(d => d.fields), [[], ['detector']]);
  assert.equal(comparison.comparable, false);
  assert.throws(() => compareEntries([]), /at least one/);
});

test('cached counts are handed to views bottom row first, as in the projection values', () => {
  const n = 3, entry = { n, pixels: { count: Float32Array.from([7, 8, 9, 4, 5, 6, 1, 2, 3]) } };
  assert.deepEqual([...entryCountsBottomFirst(entry)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(entryCountsBottomFirst(undefined), null);
});

test('compact entries keep each recognition item\'s ray lengths, sparse, and the items the detector sits in', () => {
  // n = 2, values bottom row first; item g is a gallery, item c the concrete material.
  const seg = (t0, t1, material, entityIds) => ({ t0, t1, material, entityIds });
  const q = (g, concrete, segments = []) => ({ q: { entityLengths: g ? { g } : {}, totals: { concrete }, segments } });
  const values = [q(0, 5), q(2, 6), q(0, 0), q(1.5, 4)];
  const items = [{ id: 'gal', kind: 'features', featureIds: ['g'] }, { id: 'con', kind: 'material', material: 'concrete' }, { id: 'none', kind: 'features', featureIds: ['x'] }];
  const recognition = compactItemLengths({ n: 2, values }, items);
  // Top row first: [values[2], values[3], values[0], values[1]].
  assert.deepEqual([...recognition.items.gal.index], [1, 3]); assert.deepEqual([...recognition.items.gal.length], [1.5, 2]);
  assert.deepEqual([...recognition.items.con.index], [1, 2, 3]);
  assert.equal(recognition.items.none, undefined); assert.deepEqual(recognition.detectorItems, []); assert.deepEqual(recognition.detectorFeatures, []);
  // A detector inside the gallery: the centre pixel's ray starts in it.
  const inside = compactItemLengths({ n: 1, values: [q(3, 0, [seg(0, 1, 'air', ['g']), seg(1, 9, 'concrete', [])])] }, items);
  assert.deepEqual(inside.detectorItems, ['gal']); assert.deepEqual(inside.detectorFeatures, ['g']);
});
