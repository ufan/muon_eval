# Plan format (`muography-plan` 1.1.0)

A plan is the saved, shareable description of one deployment study (FR-P5): which dataset release and scenario it applies to, which detector configurations it uses, the candidate pool (stations with their poses) and the named deployments drawn from it. It is the first of the versioned formats of ADR-006 (FR-P1, FR-P2) and the future API contract for plans.

- Code: `dist/modules/plan-format.js` (validation, migration, canonical text, conversion to and from the app state).
- Schema for other tools: `dist/schemas/muography-plan-1.schema.json` (JSON Schema 2020-12; accepts 1.0 and 1.1 documents). The code and the schema accept and reject the same documents (tested in `tests/data/plan-format.test.mjs`).

## Document

```json
{
  "format": "muography-plan",
  "schemaVersion": "1.1.0",
  "title": "Upper gallery study",
  "scene": { "release": "zhouning-lower-reservoir-dam@0.6.2+schema0.7.0", "contentHash": null, "scenario": "low" },
  "units": { "length": "m", "angle": "deg", "frame": "model_frame" },
  "detectors": {
    "default": {
      "device": { "model": "JW-S400-10B", "layers": 3, "width": 0.4096, "height": 0.4096, "stripPitch": 0.0016, "strips": 256, "spacing": 0.15 },
      "response": { "layerEfficiency": 0.95, "deadLiveFraction": 0.98, "angularResolutionDeg": 0.3, "systematicFraction": 0.03, "exposureDays": 30, "angularModel": "gaisser" }
    }
  },
  "stations": [
    { "id": "obs_upper", "name": "上层廊道观测室点位", "position": [12.5, 122, 57],
      "pose": { "azimuthDeg": 0, "elevationDeg": 25 }, "candidateId": "obs_upper", "detector": "default", "note": "" },
    { "id": "obs_upper_steep", "name": "上层廊道观测室 · 陡角", "position": [12.5, 122, 57],
      "pose": { "azimuthDeg": 0, "elevationDeg": 45 }, "candidateId": "obs_upper", "detector": "default", "note": "Second pose at the same site" }
  ],
  "deployments": [
    { "id": "two-poses", "name": "Upper gallery, two poses", "stations": ["obs_upper", "obs_upper_steep"] }
  ],
  "anomalies": []
}
```

| Member | Meaning and rules |
|---|---|
| `format`, `schemaVersion` | Exactly `muography-plan` and a semantic version. |
| `title` | Free text, up to 200 characters. |
| `scene.release` | Full release ID from the dataset registry (never the dataset ID alone). |
| `scene.contentHash` | `null` for registered releases (they are hash-verified by the registry); `sha256:<64 hex>` for user-loaded datasets (ADR-019), which must match the loaded file. |
| `scene.scenario` | Frozen scenario ID, or `null` for the release's first scenario. |
| `units` | Fixed in 1.0: metres, degrees, model frame. Positions are model-frame points; conversion from survey frames is the dataset adapter's job. |
| `detectors` | Named detector configurations; `default` is required. Only parameters a user enters are stored; derived values (baseline, slope step, field of view) are recomputed on load, so they cannot contradict each other. Values are applied through the app's one device-configuration path. |
| `stations` | The candidate pool; at least one. `id` is unique in the plan (`[A-Za-z0-9_.-]`, up to 64 characters); `pose` has azimuth 0–359° (from model X+ towards Y+) and elevation 0–90°; `candidateId` names the dataset candidate the station started from, or `null`; `detector` names an entry of `detectors`; `note` is free text up to 1000 characters (may be empty). Several poses at one site are several stations (FR-P6). |
| `deployments` | Named deployments (FR-P7), possibly none. Each has an `id` unique among deployments, a `name` (1–200 characters) and `stations`: distinct station IDs of this plan, in the user's order, possibly empty. A station can belong to several deployments; removing a station removes it from all of them. |
| `anomalies` | Reserved for anomaly hypotheses (FR-H1); empty in 1.x. Their schema arrives as 1.2.0 (older plans need no migration). |

### Ranges

| Field | Range |
|---|---|
| `device.layers` | 3 (the current response model) |
| `device.width`, `device.height` | 0.01–5 m |
| `device.stripPitch` | 0.00005–0.1 m |
| `device.strips` | integer 2–4096 (both axes) |
| `device.spacing` | 0.01–5 m |
| `response.layerEfficiency`, `response.deadLiveFraction` | 0.01–1 |
| `response.angularResolutionDeg` | 0.01–20 |
| `response.systematicFraction` | greater than 0, at most 1 |
| `response.exposureDays` | integer 1–3650 |
| `response.angularModel` | `gaisser` or `cos2` |

The ranges are those of the device settings form, so a plan never holds a value the app would silently change.

## Canonical text

Plans are written as UTF-8 JSON with 2-space indentation, members in the order of the table above (and of the example), and a final newline. Loading and saving a valid plan gives a byte-identical file (FR-P1), so plans diff cleanly in git or a shared folder (FR-P2). Unknown members are rejected rather than dropped.

## Versions and migration

- Same major version, same or older minor: loaded (older minors are upgraded by the migration chain in `plan-format.js`). Only the current version is written, so loading a 1.0 file and saving it gives a 1.1.0 file.
- **1.0 → 1.1:** `deployment.selected`, when not empty, becomes one deployment `deployment-1` (named `deployment-1`); every station gets an empty `note`; `deployment.active` leaves the plan (in browser storage it moves to the study's session state). 1.0 had no other content, so nothing else changes.
- Newer minor or major than the app knows: refused with a message to update the app; never guessed.
- Browser storage from before plans (a station list per release and one global device settings record) is converted once per release into a plan; the release's old station list is then removed (the global device record stays for releases not yet converted).
- The exports `compiled-deployment-snapshot` 0.1.0 are not plans (one station, no pose list) and cannot be loaded.

## Studies in browser storage

Each release keeps several studies (FR-P8). Keys (all values UTF-8 text in `localStorage`):

| Key | Content |
|---|---|
| `muon-studies:<release>` | `{ "version": 1, "active": "<study id>", "studies": ["study-1", …] }` |
| `muon-plan:<release>:<study id>` | The study's plan, canonical text |
| `muon-session:<release>:<study id>` | Session state next to the plan: `{ "activeStation", "working", "compare" }`: the working station's source candidate, the working station itself (name, position, pose, model, device settings) and the candidates ticked for comparison (later: active deployment). Invalid parts are ignored on load |

- Study IDs are local (`study-N`, never reused while the old one exists); they are not part of the plan, so the same file can be imported twice as two studies.
- Importing a plan always creates a new study of its release and makes it active; nothing is overwritten.
- The scenario of a stored plan follows the scenario chosen in the app.
- Older storage is converted once: the single plan per release (`muon-plan:<release>`, 1.0) becomes `study-1` with its active station moved to the session; station lists from before plans (`muon-candidates:<release>`) also become `study-1`.
- Code: `dist/modules/plan-store.js` (pure apart from the storage object passed in).

## Identity and links

- **Plan hash**: SHA-256 of the canonical text, written `sha256:<hex>`.
- **Results**: a `compiled-detector-assessment` result records `plan: { hash, stationId }` (or `null` when computed without a plan). This is provenance, not identity: the result's snapshot key is derived from its own inputs (`prepareProjectionPattern`), so the same physics from two plans has the same key. The member is additive; the result schema stays 0.1.0.
- A plan never embeds results, session state (active station, working station), view state (layers, outlines, camera) or dataset content. Selecting another station therefore does not change the plan hash.
- **Extracting deployments** (`extractDeployments`): a plan holding only the chosen deployments, their member stations in pool order and the detectors they use (`default` is always kept). Used for exporting one or several deployments (FR-P9).

## Batch runs

The headless runner (FR-S5, ADR-006) evaluates a plan's stations with the same modules as the app:

```bash
npm run run-plan -- plan.json --out runs/study [--stations all|<id,id> | --deployment <id>] [--quality final|preview] [--workers N] [--compare material:<id>:<min path m>]
```

- Only registered releases (`contentHash: null`); the scenario is the plan's, or the release's first. Each station uses its own named detector, applied through the app's device-configuration path.
- Stations are spread over worker threads (default: all cores); the output is byte-identical for any thread count.
- Output directory (a run never overwrites another; an existing `summary.json` is refused):
  - `<station id>.result.json`: the `compiled-detector-assessment` result, with its `plan` reference;
  - `comparison.json` with `--compare`: a `projection-pattern-comparison` export of all stations; with `material:concrete:0.15` the app replays it in 方案比较 → 重放比较 (at most 20 stations);
  - `summary.json`, format `muography-plan-run` 1.0.0: plan hash and title, release and scenario, quality and bins, model version, and per station its ID, name, file, SHA-256 of the file, total count and weighted transmission. It holds no clock or host data, so a run is reproducible from the plan, the release and the code version.
- Code: `dist/modules/plan-runner.js` (pure: station choice, inputs, summary) and `scripts/run-plan.mjs` (files, threads).
- Known limits (tracked in `docs/IMPLEMENTATION_PRIORITY.md`): the app opens only `comparison.json`, not single results or run folders, and large runs exceed its import limits (13a); no user-loaded datasets (FR-L4); no scan files (P5).

## Not in 1.1

- Scan definitions: their format is designed with the scan work (P5); a scan will reference a plan by its hash.
- Continuous environment variables: only frozen scenarios exist today (FR-K2).
