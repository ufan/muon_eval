import test from 'node:test';
import assert from 'node:assert/strict';
import { itemParts, itemContains, sampleTargetPoints } from '../../dist/modules/target-samples.js';

// Target points for the multi-view overview (#15, FR-M15): points inside a recognition item, found with the
// calculation geometry (point classification) inside the item's component bounds.
const components = [
  { min: [0, 0, 0], max: [10, 2, 3], entityIds: ['g1'], material: 'air' },
  { min: [8, 0, 0], max: [10, 20, 3], entityIds: ['g2'], material: 'air' },
  { min: [-5, -5, -5], max: [30, 30, 30], entityIds: [], material: 'concrete' }];

test('an item is looked for in the bounds of each component it owns', () => {
  assert.deepEqual(itemParts({ kind: 'features', featureIds: ['g1', 'g2'] }, components), [{ min: [0, 0, 0], max: [10, 2, 3] }, { min: [8, 0, 0], max: [10, 20, 3] }]);
  assert.deepEqual(itemParts({ kind: 'material', material: 'concrete' }, components), [{ min: [-5, -5, -5], max: [30, 30, 30] }]);
  assert.deepEqual(itemParts({ kind: 'features', featureIds: ['nope'] }, components), []);
  assert.equal(itemContains({ kind: 'features', featureIds: ['g2'] }, { material: 'air', entityIds: ['g2'] }), true);
  assert.equal(itemContains({ kind: 'material', material: 'concrete' }, { material: 'air', entityIds: ['g2'] }), false);
});

test('samples are cell centres inside the item, part by part without repeats, thinned evenly to at most maxPoints', async () => {
  // An L-shaped gallery: inside g1 or g2.
  const inL = ([x, y, z]) => z >= 0 && z <= 3 && ((x >= 0 && x <= 10 && y >= 0 && y <= 2) || (x >= 8 && x <= 10 && y >= 0 && y <= 20));
  const classify = point => ({ material: inL(point) ? 'air' : 'concrete', entityIds: inL(point) ? ['g'] : [] });
  const item = { kind: 'features', featureIds: ['g'] }, parts = itemParts({ kind: 'features', featureIds: ['g1', 'g2'] }, components);
  const points = await sampleTargetPoints({ parts, contains: c => itemContains(item, c), classify, budget: 600, yieldTo: async () => {} });
  assert.ok(points.length > 50 && points.every(p => inL(p.position)), points.length);
  assert.ok(points.some(p => p.position[1] > 10) && points.some(p => p.position[0] < 5), 'both legs sampled');
  assert.deepEqual(points[0].featureIds, ['g']);
  assert.equal(new Set(points.map(p => p.position.join())).size, points.length);
  // One box around both legs would hold mostly concrete: per part, far more points land inside.
  const union = await sampleTargetPoints({ parts: [{ min: [0, 0, 0], max: [10, 20, 3] }], contains: c => itemContains(item, c), classify, budget: 600, yieldTo: async () => {} });
  assert.ok(points.length > union.length, `${points.length} vs ${union.length}`);
  const few = await sampleTargetPoints({ parts, contains: c => itemContains(item, c), classify, budget: 600, maxPoints: 20, yieldTo: async () => {} });
  assert.equal(few.length, 20); assert.ok(few.some(p => p.position[1] > 10) && few.some(p => p.position[0] < 5));
  // Cancelled between chunks.
  const controller = new AbortController();
  await assert.rejects(sampleTargetPoints({ parts, contains: () => true, classify, budget: 600, chunk: 50, signal: controller.signal, yieldTo: async () => controller.abort() }), e => e.name === 'AbortError');
});
