import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureCatalogue } from '../../dist/modules/feature-catalogue.js';
import { resolveRecognitionItems, resolveFeatureLayerOptions, resolveAxisLabels } from '../../dist/modules/display-profile.js';

// Synthetic, subject-neutral catalogue (ADR-029).
const catalogue = buildFeatureCatalogue({
  vocabulary: {
    classes: {
      tunnel: { zh: '隧洞', en: 'Tunnel', category: 'void', color: '#185FA5', default_imaging_role: 'reference_void' },
      room: { zh: '房间', en: 'Room', category: 'void', color: '#1D9E75', default_imaging_role: 'reference_void' },
      wall: { zh: '墙', en: 'Wall', category: 'structure', color: '#BDB9AE', default_imaging_role: 'background' },
      pool: { zh: '水池', en: 'Pool', category: 'water', color: '#8EC5F2', default_imaging_role: 'time_varying_mass' }
    },
    systems: { access: '通道', body: '主体', water: '水体' },
    imaging_roles: { target: '目标', reference_void: '参考空腔', time_varying_mass: '时变', background: '背景' }
  },
  entities: [
    { id: 'tunnel_a', realization: 'solid', semantics: { class: 'tunnel', system: 'access' } },
    { id: 'tunnel_b', realization: 'solid', semantics: { class: 'tunnel', system: 'access' } },
    { id: 'room', realization: 'solid', semantics: { class: 'room', system: 'access' } },
    { id: 'wall', realization: 'solid', semantics: { class: 'wall', system: 'body' } }
  ],
  waterBodies: [{ id: 'pool', semantics: { class: 'pool', system: 'water' } }],
  components: ['tunnel_a', 'tunnel_b', 'room', 'pool'].map(id => ({ source_entity_id: id, flags: { physics: true } }))
});
const materials = ['concrete', 'steel', 'water', 'air'];
const label = (zh, en) => ({ zh, en });
const profile = items => ({ profile_version: '1.0', recognition_items: items });

test('members, semantic selections and materials resolve to recognition items', () => {
  const items = resolveRecognitionItems(profile([
    { id: 'tunnels', label: label('隧洞', 'Tunnels'), select: { system: 'access', class: 'tunnel' }, default: true },
    { id: 'room', label: label('房间', 'Room'), members: ['room'], default: false },
    { id: 'concrete', label: label('混凝土', 'Concrete'), material: 'concrete', color: '#AAA79C', default: false }
  ]), catalogue, materials);
  assert.deepEqual(items, [
    { id: 'tunnels', label: label('隧洞', 'Tunnels'), kind: 'features', featureIds: ['tunnel_a', 'tunnel_b'], material: null, color: '#185FA5', default: true },
    { id: 'room', label: label('房间', 'Room'), kind: 'features', featureIds: ['room'], material: null, color: '#1D9E75', default: false },
    { id: 'concrete', label: label('混凝土', 'Concrete'), kind: 'material', featureIds: null, material: 'concrete', color: '#AAA79C', default: false }
  ]);
  assert.throws(() => { items[0].featureIds.push('x'); }, TypeError);
});

test('an explicit colour overrides the first member class colour', () => {
  const [item] = resolveRecognitionItems(profile([{ id: 'r', label: label('间', 'R'), members: ['room'], color: '#123456', default: true }]), catalogue, materials);
  assert.equal(item.color, '#123456');
});

test('without a profile, one default-off item per reference-void or target class of direct features', () => {
  assert.deepEqual(resolveRecognitionItems(null, catalogue, materials), [
    { id: 'room', label: label('房间', 'Room'), kind: 'features', featureIds: ['room'], material: null, color: '#1D9E75', default: false },
    { id: 'tunnel', label: label('隧洞', 'Tunnel'), kind: 'features', featureIds: ['tunnel_a', 'tunnel_b'], material: null, color: '#185FA5', default: false }
  ]);
});

test('invalid profiles fail closed', () => {
  const ok = { id: 'r', label: label('间', 'R'), members: ['room'], default: true };
  for (const [document, pattern] of [
    [{ profile_version: '2.0', recognition_items: [ok] }, /version/],
    [profile([]), /recognition item/],
    [profile([ok, ok]), /Duplicate/],
    [profile([{ ...ok, id: 'Bad Id' }]), /ID/],
    [profile([{ ...ok, label: { zh: '间' } }]), /label/],
    [profile([{ ...ok, default: 'yes' }]), /default/],
    [profile([{ ...ok, members: ['missing'] }]), /Unknown feature/],
    [profile([{ ...ok, members: ['wall'] }]), /aggregate/],
    [profile([{ ...ok, members: ['room', 'room'] }]), /Duplicate member/],
    [profile([{ ...ok, members: undefined, select: { system: 'body' } }]), /matches no direct feature/],
    [profile([{ ...ok, members: undefined, select: { colour: 'red' } }]), /select/],
    [profile([{ ...ok, members: undefined, material: 'concrete' }]), /colour/],
    [profile([{ ...ok, members: undefined, material: 'gold', color: '#FFD700' }]), /material/],
    [profile([{ ...ok, select: { system: 'access' } }]), /exactly one/],
    [profile([{ ...ok, color: 'blue' }]), /colour/]
  ]) assert.throws(() => resolveRecognitionItems(document, catalogue, materials), pattern);
});

test('feature-layer options: hidden groups must name known feature groups', () => {
  assert.deepEqual(resolveFeatureLayerOptions(null, catalogue), { hiddenGroups: [] });
  assert.deepEqual(resolveFeatureLayerOptions({ profile_version: '1.0', recognition_items: [] }, catalogue), { hiddenGroups: [] });
  assert.deepEqual(resolveFeatureLayerOptions({ profile_version: '1.1', feature_layers: { hidden_groups: ['access'] } }, catalogue), { hiddenGroups: ['access'] });
  assert.throws(() => resolveFeatureLayerOptions({ profile_version: '1.1', feature_layers: { hidden_groups: ['nope'] } }, catalogue), /Unknown feature group nope/);
  assert.throws(() => resolveFeatureLayerOptions({ profile_version: '1.1', feature_layers: { hidden_groups: ['access', 'access'] } }, catalogue), /Duplicate/);
  assert.throws(() => resolveFeatureLayerOptions({ profile_version: '1.1', feature_layers: { hidden_groups: [] } }, catalogue), /at least one/);
});

test('axis labels: optional, need a zh/en label for X, Y, Z and the origin', () => {
  const label = (zh, en) => ({ zh, en });
  const axes = { X: label('东', 'East'), Y: label('北', 'North'), Z: label('上', 'Up'), origin: label('基点', 'Datum') };
  assert.equal(resolveAxisLabels(null), null);
  assert.equal(resolveAxisLabels({ profile_version: '1.1', recognition_items: [] }), null);
  assert.deepEqual(resolveAxisLabels({ profile_version: '1.1', axes }), axes);
  assert.throws(() => resolveAxisLabels({ profile_version: '1.1', axes: { ...axes, Z: undefined } }), /axis Z/);
  assert.throws(() => resolveAxisLabels({ profile_version: '1.1', axes: { ...axes, origin: label('', 'Datum') } }), /origin/);
});
