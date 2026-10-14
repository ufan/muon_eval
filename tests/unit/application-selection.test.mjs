import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApplicationSelection, selectionHref, APP_PAGES } from '../../dist/modules/application-selection.js';

// ADR-030: the planning app and the dataset workbench share one selection contract.
const registry = { default_dataset: 'subject@1', datasets: { 'subject@1': { adapter: 'dam-spec-v07' }, 'subject@2': { adapter: 'dam-spec-v07' } } };

test('links to either page carry the same release and scenario', () => {
  const selection = { datasetId: 'subject@2', scenarioId: 'high' };
  for (const page of Object.values(APP_PAGES)) {
    const href = selectionHref(page, selection);
    assert.ok(href.startsWith(page + '?'));
    const resolved = resolveApplicationSelection(registry, href.slice(page.length));
    assert.deepEqual([resolved.datasetId, resolved.scenarioId], ['subject@2', 'high']);
  }
  assert.equal(selectionHref(APP_PAGES.workbench, { datasetId: 'subject@1', scenarioId: null }), './geometry-preview.html?dataset=subject%401&backend=compiled');
});

test('only the two application pages can be linked', () => {
  assert.throws(() => selectionHref('https://example.com/', { datasetId: 'subject@1' }), /page/);
});
