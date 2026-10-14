# Plan format (`muography-plan` 1.0.0)

A plan is the saved, shareable description of one deployment study: which dataset release and scenario it applies to, which detector configurations it uses, the stations with their poses, and which of them form the selected deployment. It is the first of the versioned formats of ADR-006 (FR-P1, FR-P2) and the future API contract for plans.

- Code: `dist/modules/plan-format.js` (validation, migration, canonical text, conversion to and from the app state).
- Schema for other tools: `dist/schemas/muography-plan-1.schema.json` (JSON Schema 2020-12). The code and the schema accept and reject the same documents (tested in `tests/data/plan-format.test.mjs`).

## Document

```json
{
  "format": "muography-plan",
  "schemaVersion": "1.0.0",
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
      "pose": { "azimuthDeg": 0, "elevationDeg": 25 }, "candidateId": "obs_upper", "detector": "default" }
  ],
  "deployment": { "selected": [], "active": "obs_upper" },
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
| `stations` | At least one. `id` is unique in the plan (`[A-Za-z0-9_.-]`, up to 64 characters); `pose` has azimuth 0–359° (from model X+ towards Y+) and elevation 0–90°; `candidateId` names the dataset candidate the station started from, or `null`; `detector` names an entry of `detectors`. |
| `deployment.selected` | Station IDs of the selected deployment (ADR-020), unique; empty until the selection is built (#14). |
| `deployment.active` | The station shown in detail. |
| `anomalies` | Reserved for anomaly hypotheses (FR-H1); empty in 1.0. Their schema arrives as 1.1.0 (older plans need no migration). |

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

- Same major version, same or older minor: loaded (older minors are upgraded by the migration chain in `plan-format.js`).
- Newer minor or major than the app knows: refused with a message to update the app; never guessed.
- Browser storage from before plans (a station list per release and one global device settings record) is converted once per release into a plan; the release's old station list is then removed (the global device record stays for releases not yet converted).
- The exports `compiled-deployment-snapshot` 0.1.0 are not plans (one station, no pose list) and cannot be loaded.

## Identity and links

- **Plan hash**: SHA-256 of the canonical text, written `sha256:<hex>`. A result computed from a plan records the plan hash and the station ID (`plan` member of the result), next to its own snapshot key.
- A plan never embeds results, view state (layers, outlines, camera) or dataset content.

## Not in 1.0

- Scan definitions: their format is designed with the scan work (P5); a scan will reference a plan by its hash.
- Several poses per station: model them as several stations.
- Continuous environment variables: only frozen scenarios exist today (FR-K2).
