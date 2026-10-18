import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateWorkspace } from '../../dist/modules/workspace-format.js';

// The published JSON Schema and the app's validator accept and reject the same workspaces
// (docs/specs/WORKSPACE_FORMAT.md). Cross-item rules (references, closure) are the validator's alone.
const schema = fileURLToPath(new URL('../../dist/schemas/muography-workspace-2.schema.json', import.meta.url));
const example = async name => JSON.parse(await readFile(new URL(`../../docs/specs/examples/${name}`, import.meta.url), 'utf8'));
const full = await example('workspace-2.0-full.json'), selection = await example('workspace-2.0-selection.json');
const variant = (mutate, from = full) => { const doc = structuredClone(from); mutate(doc); return doc; };
const schemaAccepts = docs => JSON.parse(execFileSync('python3', ['-c', `
import json, sys, jsonschema
schema = json.load(open(sys.argv[1]))
jsonschema.Draft202012Validator.check_schema(schema)
validator = jsonschema.Draft202012Validator(schema)
print(json.dumps([validator.is_valid(doc) for doc in json.load(sys.stdin)]))`, schema], { input: JSON.stringify(docs) }));
const appAccepts = doc => { try { validateWorkspace(doc); return true; } catch { return false; } };

test('schema and validator agree on structural rules', () => {
  const cases = [full, selection,
    variant(d => { d.extra = 1; }), variant(d => { d.format = 'muography-plan'; }), variant(d => { d.schemaVersion = '2.1.0'; }),
    variant(d => { d.contents = 'all'; }), variant(d => { d.roots = [d.stations[0].id]; }), variant(d => { d.release.contentHash = 'md5:1'; }),
    variant(d => { d.units.length = 'mm'; }), variant(d => { d.provenance.exportedAt = 'today'; }), variant(d => { d.provenance.workspace = 'ws-1'; }),
    variant(d => { d.detectors = []; d.stations = []; d.deployments = []; d.studies = []; }),
    variant(d => { d.detectors[0].response.exposureDays = 30; }), variant(d => { d.detectors[0].device.strips = 2.5; }),
    variant(d => { d.detectors[0].response.systematicFraction = 0; }), variant(d => { d.sites[0].frame = 'doc_frame'; }),
    variant(d => { d.sites[0].position = [1, 2]; }), variant(d => { d.sites[0].name = ''; }), variant(d => { d.sites[0].id = 'site-ilou000000000000'; }),
    variant(d => { d.stations[0].placement.kind = 'carrier-mount'; }), variant(d => { d.stations[0].exposure = { kind: 'constant', days: 30 }; }),
    variant(d => { d.stations[0].pose.elevationDeg = 91; }), variant(d => { d.stations[0].id = 'station-3'; }),
    variant(d => { d.deployments[0].stations.push(d.deployments[0].stations[0]); }), variant(d => { d.deployments[0].note = 'x'.repeat(1001); }),
    variant(d => { d.studies[0].scenes = []; }), variant(d => { d.studies[0].scenes[0].anomalies = [{}]; }), variant(d => { d.studies[0].aim = {}; }),
    variant(d => { d.studies[0].exposure = { kind: 'periods', periods: [] }; }), variant(d => { d.studies[0].exposure.days = 2.5; }),
    variant(d => { delete d.studies[0].exposure; }),
    variant(d => { d.studies[0].basis = { recordedAt: '2026-10-17T08:00:00Z', items: { [d.stations[0].id]: `sha256:${'a'.repeat(64)}` } }; }),
    variant(d => { d.studies[0].basis = { recordedAt: '2026-10-17', items: {} }; }),
    variant(d => { d.roots = []; }, selection), variant(d => { d.roots = [d.sites[0].id]; }, selection),
    variant(d => { d.release.contentHash = `sha256:${'b'.repeat(64)}`; d.provenance.author = '张工'; }, selection)];
  const verdicts = schemaAccepts(cases);
  cases.forEach((doc, i) => assert.equal(verdicts[i], appAccepts(doc), `case ${i}`));
  assert.deepEqual([verdicts[0], verdicts[1], verdicts.at(-1)], [true, true, true]);
});

test('cross-item rules are enforced by the validator only', () => {
  const cases = [variant(d => { d.stations[1].id = d.stations[0].id; }),
    variant(d => { d.stations[0].placement.site = 'site-0000000000000000'; }), variant(d => { d.stations[0].detector = 'det-0000000000000000'; }),
    variant(d => { d.deployments[0].stations = ['sta-0000000000000000']; }), variant(d => { d.studies[0].deployments = ['dep-0000000000000000']; }),
    variant(d => { d.studies[0].scenes[1].id = d.studies[0].scenes[0].id; }),
    variant(d => { d.sites.push({ ...d.sites[0], id: 'site-0000000000000000' }); }, selection),
    variant(d => { d.roots = ['dep-0000000000000000']; }, selection)];
  assert.deepEqual(schemaAccepts(cases), cases.map(() => true));
  for (const doc of cases) assert.equal(appAccepts(doc), false);
});
