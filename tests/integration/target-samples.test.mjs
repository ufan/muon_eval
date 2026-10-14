import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { createApplicationBackend } from '../../dist/modules/application-backends.js';
import { itemContains } from '../../dist/modules/target-samples.js';

// Target points for the multi-view overview (#15) on the real compiled model: every recognition item of the
// display profile gets points inside it, by the calculation geometry.
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release);
const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId: 'low' });

test('each recognition item gets points that classify inside it', async () => {
  const started = performance.now(), samples = await backend.targetSamples({ items: dataset.recognitionItems, yieldTo: async () => {} });
  const seconds = (performance.now() - started) / 1000;
  for (const item of dataset.recognitionItems) {
    const points = samples.get(item.id);
    assert.ok(points.length >= 100, `${item.id}: ${points.length} points`);
    assert.ok(points.every(p => itemContains(item, backend.runtime.classifyModel(p.position))), item.id);
  }
  assert.ok(seconds < 10, `${seconds.toFixed(1)} s`);
  console.log(`target samples: ${[...samples].map(([id, p]) => `${id} ${p.length}`).join(', ')} in ${seconds.toFixed(2)} s`);
});
