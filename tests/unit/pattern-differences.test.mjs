import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotDifferences } from '../../dist/modules/pattern-comparison.js';

// Parameter differences disclosed by comparisons (pattern-comparison.js).
const row = (backendVersion, rayLengthM, extra = {}) => ({ datasetRelease: 'r', geometryVersion: 'g', backendVersion, modelVersion: 'm',
  detector: { w: 1 }, environment: {}, response: {}, sampling: { rayLengthM, grid: { kind: 'detector-aggregated' }, bins: 65 }, ...extra });

test('the compiled ray length follows the station position and is not a setting', () => {
  assert.deepEqual(snapshotDifferences([row('compiled-triangle-bvh@0.1.0', 300), row('compiled-triangle-bvh@0.1.0', 412)]).map(d => d.fields), [[], []]);
  // Other sampling settings still count.
  assert.deepEqual(snapshotDifferences([row('compiled-triangle-bvh@0.1.0', 300), row('compiled-triangle-bvh@0.1.0', 300, { sampling: { rayLengthM: 300, grid: {}, bins: 25 } })])[1].fields, ['sampling']);
});

test('a fixed ray cutoff (retired legacy backend, replayed exports) is still disclosed', () => {
  assert.deepEqual(snapshotDifferences([row('legacy-dda@1.0.0', 500), row('compiled-triangle-bvh@0.1.0', 412)])[1].fields, ['backendVersion', 'sampling']);
  assert.deepEqual(snapshotDifferences([row('legacy-dda@1.0.0', 500), row('legacy-dda@1.0.0', 400)])[1].fields, ['sampling']);
});
