import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { createApplicationBackend } from '../../dist/modules/application-backends.js';

// Slice-plane mask on the calculation geometry (15e, FR-M16), real compiled model.
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release);
const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId: 'low' });

test('a section across Y through the upper gallery is matter around the gallery and empty inside it', async () => {
  // Extent around the gallery cross-section: x 2.5–22.5, z 52–66 at y = 122 (gallery floor z 57, vault top 60.5).
  const extent = { min: [2.5, 0, 52], max: [22.5, 200, 66] }, resolution = 40;
  const mask = await backend.sliceMask({ axis: 'y', value: 122, extent, resolution, yieldTo: async () => {} });
  const at = (x, z) => mask[Math.floor((z - 52) / 14 * resolution) * resolution + Math.floor((x - 2.5) / 20 * resolution)];
  assert.equal(at(12.5, 58.5), 0, 'inside the gallery');
  assert.equal(at(12.5, 54), 1, 'concrete below the floor');
  assert.equal(at(12.5, 63), 1, 'concrete above the vault');
  assert.ok(mask.reduce((s, m) => s + m, 0) > resolution * resolution / 2);
});
