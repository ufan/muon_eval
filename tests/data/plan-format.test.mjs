import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePlan } from '../../dist/modules/plan-format.js';

// The published JSON Schema and the app's validator accept and reject the same plans
// (docs/specs/PLAN_FORMAT.md). Cross-member rules are the validator's alone.
const schema = fileURLToPath(new URL('../../dist/schemas/muography-plan-1.schema.json', import.meta.url));
const base = JSON.parse(await readFile(new URL('../fixtures/plans/two-stations.json', import.meta.url), 'utf8'));
const variant = mutate => { const doc = structuredClone(base); mutate(doc); return doc; };
const schemaAccepts = docs => JSON.parse(execFileSync('python3', ['-c', `
import json, sys, jsonschema
schema = json.load(open(sys.argv[1]))
jsonschema.Draft202012Validator.check_schema(schema)
validator = jsonschema.Draft202012Validator(schema)
print(json.dumps([validator.is_valid(doc) for doc in json.load(sys.stdin)]))`, schema], { input: JSON.stringify(docs) }));
const appAccepts = doc => { try { validatePlan(doc); return true; } catch { return false; } };

test('schema and validator agree on structural rules', () => {
  const cases = [base,
    variant(d => { d.extra = 1; }), variant(d => { d.format = 'other'; }), variant(d => { d.scene.contentHash = 'md5:1'; }),
    variant(d => { d.units.frame = 'doc_frame'; }), variant(d => { delete d.detectors.default; }),
    variant(d => { d.detectors.default.device.strips = 2.5; }), variant(d => { d.detectors.default.response.systematicFraction = 0; }),
    variant(d => { d.stations = []; }), variant(d => { d.stations[0].id = 'bad id'; }), variant(d => { d.stations[0].position = [1, 2]; }),
    variant(d => { d.stations[0].pose.elevationDeg = 91; }), variant(d => { d.deployment.selected = ['north', 'north']; }),
    variant(d => { d.anomalies = [{}]; }), variant(d => { d.scene.scenario = null; d.scene.contentHash = 'sha256:' + 'a'.repeat(64); })];
  const verdicts = schemaAccepts(cases);
  cases.forEach((doc, i) => assert.equal(verdicts[i], appAccepts(doc), `case ${i}`));
  assert.deepEqual([verdicts[0], verdicts.at(-1)], [true, true]);
});

test('cross-member rules are enforced by the validator only', () => {
  const cases = [variant(d => { d.stations[1].id = 'north'; }), variant(d => { d.stations[0].detector = 'other'; }),
    variant(d => { d.deployment.active = 'ghost'; }), variant(d => { d.deployment.selected = ['ghost']; })];
  assert.deepEqual(schemaAccepts(cases), [true, true, true, true]);
  for (const doc of cases) assert.equal(appAccepts(doc), false);
});
