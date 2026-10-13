import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureCatalogue } from '../../dist/modules/feature-catalogue.js';
import { featureLayerGroups, recognitionItemForFeature, featuresAlongRay } from '../../dist/modules/feature-layers.js';

// Synthetic, subject-neutral catalogue (ADR-029, FR-M11).
const catalogue = buildFeatureCatalogue({
  vocabulary: {
    classes: {
      tunnel: { zh: '隧洞', en: 'Tunnel', category: 'void', color: '#185FA5', default_imaging_role: 'reference_void' },
      duct: { zh: '管道', en: 'Duct', category: 'void', color: '#378ADD', default_imaging_role: 'background' },
      room: { zh: '房间', en: 'Room', category: 'void', color: '#1D9E75', default_imaging_role: 'target' },
      wall: { zh: '墙', en: 'Wall', category: 'structure', color: '#BDB9AE', default_imaging_role: 'background' },
      pool: { zh: '水池', en: 'Pool', category: 'water', color: '#8EC5F2', default_imaging_role: 'time_varying_mass' }
    },
    systems: { body: '主体', services: '设施', access: '通道', rooms: '房间', water: '水体' },
    imaging_roles: { target: '目标', reference_void: '参考空腔', time_varying_mass: '时变', background: '背景' }
  },
  entities: [
    { id: 'tunnel_a', realization: 'solid', semantics: { class: 'tunnel', system: 'access' } },
    { id: 'tunnel_b', realization: 'solid', semantics: { class: 'tunnel', system: 'access' } },
    { id: 'duct', realization: 'solid', semantics: { class: 'duct', system: 'services' } },
    { id: 'duct_tunnel', realization: 'solid', semantics: { class: 'tunnel', system: 'services' } },
    { id: 'room', realization: 'solid', semantics: { class: 'room', system: 'rooms' } },
    { id: 'wall', realization: 'solid', semantics: { class: 'wall', system: 'body' } }
  ],
  waterBodies: [{ id: 'pool', semantics: { class: 'pool', system: 'water' } }],
  components: ['tunnel_a', 'tunnel_b', 'duct', 'duct_tunnel', 'room', 'pool'].map(id => ({ source_entity_id: id, flags: { physics: true } }))
});

test('feature layers group the direct, non-water features by system', () => {
  assert.deepEqual(featureLayerGroups(catalogue), [
    { id: 'services', label: '设施', featureIds: ['duct', 'duct_tunnel'], defaultVisible: false },
    { id: 'access', label: '通道', featureIds: ['tunnel_a', 'tunnel_b'], defaultVisible: true },
    { id: 'rooms', label: '房间', featureIds: ['room'], defaultVisible: true }
  ]);
});

test('a group is shown by default only when every feature in it is a reference void or imaging target', () => {
  const groups = Object.fromEntries(featureLayerGroups(catalogue).map(g => [g.id, g.defaultVisible]));
  assert.equal(groups.services, false);
  assert.equal(groups.rooms, true);
});

test('the recognition item of a feature is the first feature item listing it', () => {
  const items = [
    { id: 'concrete', kind: 'material', featureIds: null, material: 'concrete' },
    { id: 'tunnels', kind: 'features', featureIds: ['tunnel_a', 'tunnel_b'] },
    { id: 'tunnel_a_only', kind: 'features', featureIds: ['tunnel_a'] }
  ];
  assert.equal(recognitionItemForFeature(items, 'tunnel_a').id, 'tunnels');
  assert.equal(recognitionItemForFeature(items, 'room'), null);
});

test('features along a ray are the listed features it runs through by more than the threshold, in ray order', () => {
  const pixel = { q: { entityLengths: { room: 2, tunnel_a: 0.05, duct: 1, wall: 9 }, segments: [
    { t0: 0, t1: 1, entityIds: ['duct'] }, { t0: 3, t1: 5, entityIds: ['room'] }, { t0: 6, t1: 6.05, entityIds: ['tunnel_a'] }] } };
  assert.deepEqual(featuresAlongRay(pixel, ['room', 'tunnel_a', 'duct'], { threshold: 0.1 }), ['duct', 'room']);
  assert.deepEqual(featuresAlongRay(pixel, ['room', 'tunnel_a'], { threshold: 0 }), ['room', 'tunnel_a']);
});
