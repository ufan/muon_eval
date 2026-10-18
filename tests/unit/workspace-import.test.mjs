import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePlan } from '../../dist/modules/plan-format.js';
import { migrateStudies, serializeWorkspace, selectWorkspace, selectionFromPlan } from '../../dist/modules/workspace-format.js';
import { mergeSelection, importedFocus } from '../../dist/modules/workspace-import.js';

// Merge-only import (WORKSPACE_FORMAT.md, Import; the preview arrives with ADR-033 step 5).
const planText = await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8');
const workspaceOf = () => migrateStudies({ release: 'subject@1.0.0', studies: [{ id: 's', plan: parsePlan(planText), session: null }] }).workspace;

test('merging a selection: new items added, identical skipped, conflicts refused, equal detectors reused', () => {
  const ws = workspaceOf(), dep = ws.studies[0].deployments[1];
  const selection = selectWorkspace(ws, [dep], {});
  const same = mergeSelection(ws, selection);
  assert.deepEqual([same.added, same.skipped], [0, 4]);
  assert.equal(serializeWorkspace(same.workspace), serializeWorkspace(ws));
  const changed = structuredClone(selection); changed.stations[0].name = 'Changed';
  assert.throws(() => mergeSelection(ws, changed), /conflict/i);
  // From someone else: fresh IDs, the same device under another detector ID.
  const other = workspaceOf(), foreign = selectWorkspace(other, [other.studies[0].id], {});
  const merged = mergeSelection(ws, foreign);
  assert.equal(merged.added, foreign.sites.length + foreign.stations.length + foreign.deployments.length + 1);
  assert.equal(merged.workspace.detectors.length, 1);
  assert.ok(merged.workspace.stations.filter(s => foreign.stations.some(f => f.id === s.id)).every(s => s.detector === ws.detectors[0].id));
});

test('the imported stations to show: the deployments of a study, deployments, stations, or a whole workspace', () => {
  const ws = workspaceOf(), [pool, single, both] = ws.studies[0].deployments, depById = id => ws.deployments.find(d => d.id === id);
  assert.deepEqual(importedFocus(selectWorkspace(ws, [ws.studies[0].id])), { stations: depById(pool).stations, deployment: pool });
  assert.deepEqual(importedFocus(selectWorkspace(ws, [both, single])), { stations: depById(both).stations, deployment: both });
  assert.deepEqual(importedFocus(selectWorkspace(ws, [ws.stations[1].id])), { stations: [ws.stations[1].id], deployment: null });
  assert.deepEqual(importedFocus(ws), { stations: ws.stations.map(s => s.id), deployment: null });
  const fromPlan = selectionFromPlan(parsePlan(planText));
  assert.equal(importedFocus(fromPlan).stations.length, 2);
});
