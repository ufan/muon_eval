import test from 'node:test';
import assert from 'node:assert/strict';
import { contributionPathData, drawContributionPaths } from '../dist/modules/contribution-view.js';

test('SVG paths preserve fragments, coordinates and open lines without closing a frame', () => {
  assert.equal(contributionPathData([[[0.5, 1], [2, 3]], [[4, 5], [6, 7]]]), 'M0.5,1 L2,3 M4,5 L6,7');
  assert.equal(contributionPathData([]), '');
  assert.ok(!contributionPathData([[[0, 0], [1, 1]]]).includes('Z'));
});

test('cached SVG serialization preserves exact paths and styling', () => {
  const previous = globalThis.document;
  globalThis.document = { createElementNS: () => ({ attributes: {}, dataset: {},
    setAttribute(key, value) { this.attributes[key] = value; } }) };
  const svg = () => ({ children: [], replaceChildren() { this.children = []; },
    setAttribute() {}, append(node) { this.children.push(node); } });
  try {
    const layer = { material: 'rock', color: '#ffae58', overlay: { settings: { level: 0 }, state: 'ready' },
      mapped: { lines: [[[.5, 1], [2, 3]]] } };
    const fresh = svg(), cached = svg();
    drawContributionPaths(fresh, [layer], 65);
    drawContributionPaths(cached, [{ ...layer, pathData: contributionPathData(layer.mapped.lines) }], 65);
    assert.deepEqual(cached.children.map(n => [n.attributes, n.dataset]), fresh.children.map(n => [n.attributes, n.dataset]));
    assert.equal(cached.children.length, 2);
  } finally { globalThis.document = previous; }
});
