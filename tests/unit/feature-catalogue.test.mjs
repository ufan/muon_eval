import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureCatalogue } from '../../dist/modules/feature-catalogue.js';

// Synthetic, subject-neutral declarations in the v0.7 shape (ADR-029).
const vocabulary = {
  classes: {
    tunnel: { zh: '隧洞', en: 'Tunnel', category: 'void', color: '#185FA5', default_imaging_role: 'reference_void' },
    wall: { zh: '墙', en: 'Wall', category: 'structure', color: '#BDB9AE', default_imaging_role: 'background' },
    pool: { zh: '水池', en: 'Pool', category: 'water', color: '#8EC5F2', default_imaging_role: 'time_varying_mass' }
  },
  systems: { access: '通道系统', body: '主体', water: '水体' },
  imaging_roles: { target: '成像目标', reference_void: '参考空腔', time_varying_mass: '时变质量', background: '背景' }
};
const entities = [
  { id: 'tunnel_b', realization: 'solid', semantics: { class: 'tunnel', system: 'access', names: { zh: '乙洞', en: 'Tunnel B' } } },
  { id: 'tunnel_a', realization: 'solid', semantics: { class: 'tunnel', system: 'access', imaging_role: 'target', names: { zh: '甲洞', en: 'Tunnel A' } } },
  { id: 'wall', realization: 'solid', semantics: { class: 'wall', system: 'body' } },
  { id: 'marker', realization: 'virtual', semantics: { class: 'wall', system: 'body' } }
];
const waterBodies = [{ id: 'pool', semantics: { class: 'pool', system: 'water', names: { zh: '池', en: 'Pool' } } }];
// Compiled components: tunnels and the pool have their own; the wall is merged into an aggregate.
const components = [
  { source_entity_id: 'tunnel_a', flags: { physics: true } }, { source_entity_id: 'tunnel_b', flags: { physics: true } },
  { source_entity_id: 'pool', flags: { physics: true } }, { source_entity_id: null, flags: { physics: true } },
  { source_entity_id: 'marker', flags: { physics: false } }
];
const build = (overrides = {}) => buildFeatureCatalogue({ entities, waterBodies, vocabulary, components, ...overrides });

test('one feature per non-virtual entity and water body, from the dataset declarations', () => {
  const catalogue = build();
  assert.deepEqual(catalogue.features.map(f => f.id), ['tunnel_a', 'tunnel_b', 'wall', 'pool']);
  assert.deepEqual(catalogue.get('tunnel_a'), { id: 'tunnel_a', source: 'entity', label: { zh: '甲洞', en: 'Tunnel A' },
    class: 'tunnel', category: 'void', group: 'access', color: '#185FA5', imagingRole: 'target', kind: 'direct' });
  // Missing names fall back to the class label; the role falls back to the class default.
  assert.deepEqual(catalogue.get('wall').label, { zh: '墙', en: 'Wall' });
  assert.equal(catalogue.get('wall').imagingRole, 'background');
  assert.equal(catalogue.get('pool').source, 'water_body');
  assert.equal(catalogue.get('marker'), null);
});

test('direct features have their own physical component; others are aggregate', () => {
  const catalogue = build();
  assert.equal(catalogue.get('tunnel_b').kind, 'direct');
  assert.equal(catalogue.get('pool').kind, 'direct');
  assert.equal(catalogue.get('wall').kind, 'aggregate');
});

test('groups follow the declared systems in declaration order', () => {
  const catalogue = build();
  assert.deepEqual(catalogue.groups, [
    { id: 'access', label: '通道系统', featureIds: ['tunnel_a', 'tunnel_b'] },
    { id: 'body', label: '主体', featureIds: ['wall'] },
    { id: 'water', label: '水体', featureIds: ['pool'] }
  ]);
});

test('the catalogue is immutable and independent of its inputs', () => {
  const input = structuredClone(entities), catalogue = build({ entities: input });
  input[0].semantics.names.en = 'changed';
  assert.equal(catalogue.get('tunnel_b').label.en, 'Tunnel B');
  assert.throws(() => { catalogue.features[0].color = '#000000'; }, TypeError);
  assert.throws(() => { catalogue.features.push({}); }, TypeError);
});

test('invalid declarations fail closed', () => {
  const entity = semantics => [{ id: 'x', realization: 'solid', semantics }];
  for (const [overrides, pattern] of [
    [{ entities: entity({ class: 'unknown', system: 'body' }) }, /class/],
    [{ entities: entity({ class: 'wall', system: 'unknown' }) }, /system/],
    [{ entities: entity({ class: 'wall' }) }, /system/],
    [{ vocabulary: { ...vocabulary, classes: { ...vocabulary.classes, wall: { ...vocabulary.classes.wall, color: 'grey' } } } }, /colour/],
    [{ waterBodies: [...waterBodies, { id: 'wall', semantics: { class: 'pool', system: 'water' } }] }, /Duplicate/],
    [{ entities: entity({ class: 'wall', system: 'body', imaging_role: 'decor' }) }, /imaging role/]
  ]) assert.throws(() => build(overrides), pattern);
});
