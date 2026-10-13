import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRegisteredDataset } from '../../scripts/dataset-fixture.mjs';

// Zhouning release: catalogue built from its own semantics and vocabulary (ADR-029).
const dataset = await loadRegisteredDataset('zhouning-lower-reservoir-dam@0.6.2+schema0.7.0');
const catalogue = dataset.features;

test('the release catalogue lists every non-virtual entity and water body once', () => {
  const physical = [...dataset.geometry.entities.values()].filter(e => e.realization !== 'virtual');
  assert.equal(catalogue.features.length, physical.length + dataset.geometry.waterBodies.size);
  assert.equal(catalogue.features.length, 44);
  // Virtual entities (assumed placeholders) never enter physics and are not features.
  assert.equal(catalogue.get('bank_platform_N'), null);
  assert.equal(catalogue.features.filter(f => f.kind === 'direct').length, 22);
});

test('direct features are exactly the compiled components with a declared source entity', () => {
  const sources = new Set(Object.values(dataset.compiledManifest.scenarios).flatMap(s => s.components)
    .filter(c => c.flags.physics && c.source_entity_id).map(c => c.source_entity_id));
  for (const feature of catalogue.features) assert.equal(feature.kind === 'direct', sources.has(feature.id), feature.id);
  // Merged concrete solids cannot be singled out until FR-GE4.
  for (const id of ['dam_standard', 'spillway_piers_and_chute_walls_C', 'spillway_gates_S']) assert.equal(catalogue.get(id).kind, 'aggregate');
});

test('labels, groups and colours come from the dataset declarations', () => {
  assert.deepEqual(catalogue.get('gallery_upper'), { id: 'gallery_upper', source: 'entity', label: { zh: '上层廊道', en: 'Upper gallery' },
    class: 'gallery', category: 'void', group: 'gallery', color: '#185FA5', imagingRole: 'reference_void', kind: 'direct' });
  assert.equal(catalogue.get('reservoir').source, 'water_body');
  assert.deepEqual(catalogue.groups.map(g => g.id), ['dam', 'flood_release', 'gallery', 'vertical_transport', 'water', 'monitoring']);
  assert.deepEqual(catalogue.groups.find(g => g.id === 'gallery').featureIds, ['adit_N', 'adit_S', 'gallery_link', 'gallery_lower', 'gallery_upper']);
});
