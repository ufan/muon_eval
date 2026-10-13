import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRegisteredDataset, readJson, registryUrl, sha256 } from '../../scripts/dataset-fixture.mjs';

// Zhouning display profile (ADR-029): presentation-only, outside the authored
// package integrity and outside result identity.
const release = 'zhouning-lower-reservoir-dam@0.6.2+schema0.7.0';
const dataset = await loadRegisteredDataset(release), registry = await readJson(registryUrl);

test('the profile is registered with its own hash, outside the authored package integrity', async () => {
  const entry = registry.datasets[release].display_profile;
  assert.equal(entry.path, 'display_profile.json');
  assert.equal(Object.hasOwn(registry.datasets[release].integrity, entry.path), false);
  const bytes = await readFile(new URL(`../../datasets/zhouning-lower-reservoir-dam/0.6.2+schema0.7.0/${entry.path}`, import.meta.url));
  assert.equal(sha256(bytes), entry.sha256);
});

test('recognition items resolve against the release catalogue', () => {
  const items = dataset.recognitionItems;
  assert.deepEqual(items.map(i => i.id), ['galleries', 'observation_rooms', 'elevator_shaft', 'flood_release_openings', 'water', 'dam_concrete', 'gates']);
  assert.deepEqual(items.filter(i => i.default).map(i => i.id), ['galleries', 'observation_rooms', 'elevator_shaft']);
  assert.deepEqual(items[0].featureIds, ['adit_N', 'adit_S', 'gallery_link', 'gallery_lower', 'gallery_upper']);
  for (const item of items.filter(i => i.kind === 'features'))
    for (const id of item.featureIds) assert.equal(dataset.features.get(id).kind, 'direct', `${item.id}: ${id}`);
  assert.deepEqual(items.filter(i => i.kind === 'material').map(i => i.material), ['concrete', 'steel']);
});
