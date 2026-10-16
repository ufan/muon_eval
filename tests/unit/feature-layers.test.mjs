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
    { id: 'services', label: '设施', featureIds: ['duct', 'duct_tunnel'], defaultVisible: false, listed: true },
    { id: 'access', label: '通道', featureIds: ['tunnel_a', 'tunnel_b'], defaultVisible: true, listed: true },
    { id: 'rooms', label: '房间', featureIds: ['room'], defaultVisible: true, listed: true }
  ]);
});

test('groups the display profile hides stay in the result, unlisted and off by default', () => {
  const groups = featureLayerGroups(catalogue, { hiddenGroups: ['access'] });
  assert.deepEqual(groups.map(g => [g.id, g.listed, g.defaultVisible]), [['services', true, false], ['access', false, false], ['rooms', true, true]]);
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
    { t0: .5, t1: 1.5, entityIds: ['duct'] }, { t0: 3, t1: 5, entityIds: ['room'] }, { t0: 6, t1: 6.05, entityIds: ['tunnel_a'] }] } };
  assert.deepEqual(featuresAlongRay(pixel, ['room', 'tunnel_a', 'duct'], { threshold: 0.1 }), ['duct', 'room']);
  assert.deepEqual(featuresAlongRay(pixel, ['room', 'tunnel_a'], { threshold: 0 }), ['room', 'tunnel_a']);
  // The feature the detector sits in is not lit by its own rays.
  const inside = { q: { entityLengths: { room: 2 }, segments: [{ t0: 0, t1: 2, entityIds: ['room'] }] } };
  assert.deepEqual(featuresAlongRay(inside, ['room']), []);
});

test('a feature is in view when its mask in the result is non-empty (the detector space excluded)', async () => {
  const { featuresInView } = await import('../../dist/modules/feature-layers.js');
  const pixel = (lengths, segments) => ({ q: { entityLengths: lengths, totals: {}, segments } });
  const data = { n: 2, values: [
    pixel({ room: 2, tunnel_a: 1 }, [{ t0: 0, t1: 2, entityIds: ['room'] }, { t0: 5, t1: 6, entityIds: ['tunnel_a'] }]),
    pixel({ room: 2 }, [{ t0: 0, t1: 2, entityIds: ['room'] }]),
    pixel({ room: 2, duct: 0.05 }, [{ t0: 0, t1: 2, entityIds: ['room'] }, { t0: 3, t1: 3.05, entityIds: ['duct'] }]),
    pixel({ room: 2 }, [{ t0: 0, t1: 2, entityIds: ['room'] }])
  ] };
  // The room holds the detector; the duct is crossed by less than the threshold.
  assert.deepEqual([...featuresInView(data, ['room', 'tunnel_a', 'duct'], { threshold: 0.1 })], ['tunnel_a']);
  assert.deepEqual([...featuresInView(data, ['room', 'tunnel_a', 'duct'], { threshold: 0 })], ['tunnel_a', 'duct']);
});
