import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';
import { createApplicationBackend } from '../../dist/modules/application-backends.js';

// Placing a station inside a clicked gallery uses the calculation's own geometry (real compiled model).
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release);
const backend = await createApplicationBackend(dataset, { datasetId: release, backend: 'compiled', scenarioId: 'low' });

test('a click on the upper gallery from above places the station on its floor plus 1 m', () => {
  assert.equal(dataset.features.get('gallery_upper').category, 'void');
  // The gallery's labelled part ends 2.8 m above its floor at z = 57; seen slightly from the side.
  const placed = backend.placeInCavity({ point: [12.5, 122, 59.8], direction: [0.2, 0, -1], featureId: 'gallery_upper' });
  assert.ok(Math.abs(placed.floorZ - 57) < .05, JSON.stringify(placed));
  assert.ok(Math.abs(placed.ceilingZ - 60.5) < .05, JSON.stringify(placed));
  assert.ok(Math.abs(placed.position[2] - 58) < .05);
  // Still inside the gallery: tracing up from the new position runs through air before concrete.
  assert.equal(backend.runtime.traceRayModel(placed.position, [0, 0, 1], 5).segments[0].material, 'air');
  assert.equal(backend.placeInCavity({ point: [12.5, 122, 59.8], direction: [0.2, 0, -1], featureId: 'gallery_lower' }), null);
});
