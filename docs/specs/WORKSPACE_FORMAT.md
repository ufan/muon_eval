# Workspace format (`muography-workspace` 2.0.0)

**Status: in use for storage, export and import (ADR-033 step 3, 2026-10-17); the 我的点位 sidebar, the import preview and the study composer follow.** The app stores each release's workspace, converts 1.x storage once, exports workspace selections and still imports [`muography-plan` 1.x](PLAN_FORMAT.md) files. Until the sidebar is rebuilt (step 4), the study UI edits one study through an interim bridge (see [Interim study view](#interim-study-view-step-3)). Owner decisions of 2026-10-17 are included: exposure belongs to the study, sites merge within a study on exact equality, migrated studies keep a 候选池 deployment, and another release of the same dataset imports with a warning.

A workspace holds everything a user has saved for one dataset release:
- **sites:** where a detector can stand;
- **stations:** a site plus a pose and a detector;
- **deployments:** named groups of stations;
- **studies:** a question asked of some deployments under some scenes, with an exposure and an aim.

It is flat: every item is stored once and referenced by ID, so two studies can share a deployment and two stations can share a site. The same format serves as browser storage, as a full export, and as an export of any selection (some stations, some deployments, one study). Any such file can be imported by another person on another host.

- Code: `dist/modules/workspace-format.js` (validation, canonical text, item hashes, IDs, selection closure, 1.x migration), `dist/modules/workspace-store.js` (browser storage, one-time migration) and the interim `dist/modules/workspace-study.js` (plan view of one study, merge of imports). Planned: `dist/modules/workspace-import.js` for the import preview (step 5). All are pure apart from the storage object passed in; tests in `tests/unit/workspace-*.test.mjs`.
- Schema for other tools: [`dist/schemas/muography-workspace-2.schema.json`](../../dist/schemas/muography-workspace-2.schema.json) (JSON Schema 2020-12). Cross-item rules (unique IDs, references, closure, unique scene IDs) are checked by the code only; `tests/data/workspace-format.test.mjs` checks that schema and code agree on everything else.
- Examples: [`examples/workspace-2.0-full.json`](examples/workspace-2.0-full.json) is a whole workspace; [`examples/workspace-2.0-selection.json`](examples/workspace-2.0-selection.json) is one exported deployment.

## Document

```json
{
  "format": "muography-workspace",
  "schemaVersion": "2.0.0",
  "contents": "selection",
  "roots": ["dep-4vq8m2k7x1c9n5tb"],
  "release": { "id": "zhouning-lower-reservoir-dam@0.6.2+schema0.7.0", "contentHash": null },
  "units": { "length": "m", "angle": "deg" },
  "provenance": { "app": "muography-deployment-evaluation", "exportedAt": "2026-10-20T08:30:00Z", "author": "", "workspace": "ws-9d3f1k8m2q7x4c6v" },
  "detectors": [
    { "id": "det-2m7k9x4q1c8v5n3b", "name": "JW-S400-10B",
      "device": { "model": "JW-S400-10B", "layers": 3, "width": 0.4096, "height": 0.4096, "stripPitch": 0.0016, "strips": 256, "spacing": 0.15 },
      "response": { "layerEfficiency": 0.95, "deadLiveFraction": 0.98, "angularResolutionDeg": 0.3, "systematicFraction": 0.03, "angularModel": "gaisser" } }
  ],
  "sites": [
    { "id": "site-7k2m9q4x1c8v5n3b", "name": "上层廊道观测室", "position": [12.5, 122, 57], "frame": "model_frame", "candidateId": "obs_upper", "note": "" }
  ],
  "stations": [
    { "id": "sta-1c8v5n3b7k2m9q4x", "name": "上层廊道 · 仰角 25°", "placement": { "kind": "site", "site": "site-7k2m9q4x1c8v5n3b" },
      "pose": { "azimuthDeg": 0, "elevationDeg": 25 }, "detector": "det-2m7k9x4q1c8v5n3b", "note": "" },
    { "id": "sta-5n3b7k2m9q4x1c8v", "name": "上层廊道 · 仰角 45°", "placement": { "kind": "site", "site": "site-7k2m9q4x1c8v5n3b" },
      "pose": { "azimuthDeg": 0, "elevationDeg": 45 }, "detector": "det-2m7k9x4q1c8v5n3b", "note": "Second pose at the same site" }
  ],
  "deployments": [
    { "id": "dep-4vq8m2k7x1c9n5tb", "name": "上层廊道两个仰角", "stations": ["sta-1c8v5n3b7k2m9q4x", "sta-5n3b7k2m9q4x1c8v"], "note": "" }
  ],
  "studies": []
}
```

### Top level

| Member | Meaning and rules |
|---|---|
| `format`, `schemaVersion` | Exactly `muography-workspace` and a semantic version. |
| `contents` | `workspace`: everything saved for the release (browser storage and full exports). `selection`: an export of part of a workspace. |
| `roots` | For `selection`: the IDs the user chose to export, in their order; at least one, and only stations, deployments or studies. For `workspace`: empty. Lets the import dialog describe a file as "2 个部署组合" rather than as a list of every item it carries. |
| `release` | `id`: full release ID from the dataset registry. `contentHash`: `null` for registered releases; `sha256:<64 hex>` for user-loaded datasets (ADR-019). Positions are only meaningful in this release's frame. |
| `units` | Fixed in 2.0: metres and degrees. Frames are named per position (`frame`). |
| `provenance` | `app`: the application name. `exportedAt`: UTC time of the export, or `null` in browser storage. `author`: optional free text (up to 100 characters, empty by default, never filled in automatically). `workspace`: the ID of the workspace the file came from. Provenance is never part of an item's identity or hash. |
| `detectors`, `sites`, `stations`, `deployments`, `studies` | The items, each an array in the user's order. A `workspace` holds at least one detector; a `selection` holds exactly what its closure needs, which may be no detector at all (a study without deployments). |

### Items

Every item has an `id` (see [Identity](#identity)) and a `name` or `title` (1–200 characters). Every `note` is free text up to 1000 characters and may be empty.

| Item | Members | Rules |
|---|---|---|
| **Detector** | `id`, `name`, `device`, `response` | `device` and `response` as in plan 1.1, ranges unchanged, **without `exposureDays`**: how long one observes is set by the study (or, in the playground, by the session), never by the device. Only entered values are stored; derived values are recomputed on load. |
| **Site** | `id`, `name`, `position`, `frame`, `candidateId`, `note` | `position`: a point `[x, y, z]` in `frame`. `frame` is `model_frame` in 2.0. `candidateId`: the dataset candidate the site started from, or `null`. |
| **Station** | `id`, `name`, `placement`, `pose`, `detector`, `note` | `placement`: `{ "kind": "site", "site": <site id> }`, the only kind in 2.0. `pose`: azimuth 0–359° from model X+ towards Y+, elevation 0–90°. `detector`: a detector ID. Several stations may share a site (several poses or detectors at one place). A station has no exposure: the same station can be observed for 30 days in one study and 90 in another. |
| **Deployment** | `id`, `name`, `stations`, `note` | `stations`: distinct station IDs in the user's order, possibly empty. A station can be in several deployments. |
| **Study** | `id`, `title`, `scenes`, `deployments`, `exposure`, `aim`, `basis`, `note` | `scenes`: at least one `{ "id", "label", "scenario", "anomalies" }`, where `id` is unique within the study (`[A-Za-z0-9_.-]`, up to 64 characters), `label` is up to 100 characters, `scenario` is a frozen scenario ID of the release or `null` for its first, and `anomalies` is reserved (empty in 2.0). `deployments`: distinct deployment IDs being compared, possibly empty. `exposure`: `{ "kind": "constant", "days": <integer 1–3650> }`, the only kind in 2.0: every station of the compared deployments observes that long, in each scene. `aim`: reserved, `null` in 2.0 (ADR-031; its format arrives as 2.1, together with the rule combining several scenes). `basis`: `null`, or `{ "recordedAt": <UTC time>, "items": { <id>: <item hash> } }`, written when the user records a conclusion; it names exactly the items the study then used. |

### Tagged kinds: where future cases attach

`placement` and `exposure` are tagged objects (`kind` plus members), so new kinds can be added in a later minor version without changing existing files:
- **`placement`:** a mount on a moving carrier, for example a TBM, would be a new kind such as `carrier-mount`, referencing a carrier and a mounting pose.
- **`exposure`** (of a study): an observation schedule would be a new kind: periods, each with its own scene and duration, possibly per deployment or station; or the time span of a carrier's trajectory. Counts are summed or integrated over them.

ADR-033 checks these on paper against a TBM, a blast-furnace campaign and staged water levels.

A file using a kind the app does not know has a newer version than the app, and is refused with a message naming the version. Frames work the same way: a carrier frame or a subject-specific frame becomes a new `frame` value with its transform declared, never assumed.

## Identity

- **IDs are global.** The app generates `<prefix>-<16 characters>`, with the prefix `det`, `site`, `sta`, `dep`, `study` or `ws`. The 16 characters are lowercase Crockford base32 from a cryptographic random source (80 bits). Two people's items therefore never collide, and the same item imported twice is recognised. IDs never change, also not on rename. Scene IDs are local to their study.
- **Item hash:** `sha256:<hex>` of the item's canonical text with its `id` removed (`itemHash`). It is computed, never stored, except inside a study's `basis`. References to other items are part of the content, so a station's hash changes when it moves to another site, but not when that site is renamed.
- **Same ID, same hash:** the same item. **Same ID, different hash:** two versions of one item (a conflict on import). **Different ID, same hash:** two items that happen to be equal. They stay separate, except detectors (see [Import](#import)).
- **Workspace hash:** SHA-256 of the canonical text; with selection files, it identifies an export.
- **Results** keep recording their provenance as `plan: { hash, stationId }` until the result format is revised. With workspaces, `hash` is the hash of the selection closure of the evaluated station, and `stationId` its global ID. This remains provenance, not identity: the snapshot key still comes from the inputs alone.

## Canonical text

UTF-8 JSON, 2-space indentation, members in the order of the tables above (top level, then each item as listed), arrays in the user's order, and a final newline. Loading and saving a valid workspace gives a byte-identical file, so files diff cleanly in git or a shared folder. Unknown members are rejected rather than dropped.

## Integrity rules (checked by the code)

- IDs are unique across all items of a document, and every reference resolves within the document:
  - station → site and detector;
  - deployment → stations;
  - study → deployments.
- **Closure:** a `selection` file holds its roots and everything they reference, transitively, and nothing else. A `workspace` file may also hold unreferenced items (saved stations not in any deployment, unused sites).
- A study's scenes name scenarios that exist in the release. This is checked against the open release when loading or importing; on import, a missing scenario is resolved in the preview (see [Import](#import)).
- Deleting is explicit about dependants, and never cascades silently:
  - deleting a site used by stations is refused, and the stations are listed;
  - deleting a station removes it from deployments, after a confirmation listing those deployments and the studies that use them;
  - deleting a deployment removes it from studies, after a confirmation listing them.

## Export

Every export is a self-contained file:

| Export (UI) | `contents` | `roots` |
|---|---|---|
| Selected stations (我的点位) | `selection` | Those station IDs |
| One or several deployments | `selection` | Those deployment IDs |
| A study | `selection` | The study ID |
| Everything (整个工作区) | `workspace` | `[]` |

- The closure is computed from the roots: studies, then deployments, then stations, then sites and detectors, each in workspace order.
- Session state, view state, results and dataset content are never exported. Exposure travels only inside studies: a file of stations or deployments carries none, and the receiver's own playground exposure applies until a study sets one.
- File names follow `muography-<release>-<short description>.json`.
- **Transport:** download a file, or show the text to copy (以文本显示（可复制）, the fallback where downloads are blocked). The receiver uploads, drops or pastes the file (粘贴导入).
- Size limit for import: 5 MB, as for plans.

## Import

Import always **merges into the receiver's workspace for the same release**, after a preview the user confirms. Nothing is written before that, and the whole import is applied in one storage write, or not at all.

1. **Read and check:** size, JSON, schema, integrity rules, version (see below).
2. **Release:** `release.id` must equal the open release; for user-loaded datasets, the content hash must match too.
   - A file for another registered release offers to open that release and import there.
   - **A different release of the same dataset** (same dataset ID; or, for user-loaded datasets, a different content hash) is imported **with a warning**. Positions and poses are taken unchanged as model-frame values of the open release. The preview says so in a banner naming both releases, and the import can still be cancelled. A study scene naming a scenario the open release lacks is listed; the user maps it to an existing scenario or skips that study (default: skip). Conversion with coordinate checks stays a later, explicit step (FR-B2).
   - A file for another dataset is refused, naming its release.
3. **Classify each item against the workspace:**
   - **New:** the ID is unknown.
   - **Identical:** same ID and same hash; skipped.
   - **Conflict:** same ID, different hash.
   - **Detectors:** a detector whose content equals an existing detector is mapped onto that detector, whatever its ID, so sharing files does not multiply identical device setups.
4. **Preview:** counts per kind (new, identical, conflicting), then each conflict with three choices:
   - **保留两者** (default): the imported item gets a fresh ID and the suffix " (导入)" on its name, and references inside the imported set are rewritten to it.
   - **用导入的替换:** the local item takes the imported content. Local items referencing it, including other studies, see the change; the preview lists them.
   - **跳过:** the local item stays. Imported items referencing it use the local version, which the preview says.
5. **Apply:** add and replace items, then append new roots to the session's shown set (stations and deployments) or open the imported study.

Positions are never compared. Two stations at the same coordinates from different people stay separate unless the user merges them. The same goes for sites: 合并站址 is an explicit action that rewrites references, and only with confirmation.

**Plan 1.x files** can still be imported. A plan file is first converted, exactly as stored studies are migrated (below), into a `selection` with one study as root. It then goes through the same preview. Conflicts cannot occur, because all its IDs are fresh.

## Versions

- Same major version, same or older minor: loaded, with older minors upgraded by the migration chain. Only the current version is written.
- Newer minor or major: refused with a message to update the app, naming the file's version; never guessed.
- `muography-plan` 1.0 and 1.1 are read through the 1.x migration below; the app no longer writes them.

## Browser storage

| Key | Content |
|---|---|
| `muon-workspace:<release>` | The workspace, canonical text, `contents: "workspace"`, `provenance.exportedAt: null` |
| `muon-workspace-session:<release>` | Session state: `{ "version": 1, "activeStudy", "activeDeployment", "shown", "exposureDays", "working" }`. `activeStudy` and `activeDeployment` are an ID or `null`. `shown` lists the station IDs shown in 3D. `exposureDays` is the playground exposure (integer 1–3650, default 30), used whenever no study is active. `working` is the draft: `{ "site", "station", "name", "position", "pose", "device", "response" }`, where `site` and `station` are the items it came from, or `null`. Invalid parts are ignored on load. |

- **Playground first:** a release opened for the first time gets a workspace with one detector (the app default) and no sites, stations, deployments or studies. The dataset's candidates are offered as a list to place from, not saved automatically. The working draft can be used without saving anything.
- **Saving the draft:**
  - 存为新点位 makes a new station. It reuses the draft's site if the position is unchanged since the draft was loaded; otherwise it makes a new site.
  - 更新点位 replaces the station's content. If the position changed and other stations share the site, the user chooses between moving the whole site and making a new site for this station.
- The scenario and the exposure chosen in the app are session state for the playground. A study pins its own scenes and exposure; while it is active, the app shows them and its results use them. Exposure is set on its own (曝光时间), no longer in the device dialog.

## Migration from 1.x storage

Runs once per release, when `muon-workspace:<release>` is absent and `muon-studies:<release>` (or older 1.x keys) exist. The 1.x keys are left untouched as a backup; a later version removes them.

For each 1.x study, in the order of `muon-studies`:
1. Parse its plan (1.0 is upgraded to 1.1 by the existing chain).
2. **Detectors:** each named detector becomes a detector without `exposureDays`, named after its 1.x key. Detectors with equal content (ignoring exposure) are merged across studies.
3. **Sites:** one site per distinct pair of exactly equal `position` and equal `candidateId` *within this study* (owner, 2026-10-17). Near-equal positions and stations of different studies are never merged.
4. **Stations:** one station per 1.x station, with a fresh ID, its site and its detector. Name and note are kept. An empty 1.x name becomes `点位 N` (N counted in pool order), since 2.0 names are never empty.
5. **Deployments:** each 1.x deployment becomes a deployment with the same name. One more deployment, `<study title> · 候选池`, holds all of the study's stations in pool order, so the study's grouping survives.
6. **Study:** `title` from the plan, or `工作方案 N`. `scenes: [{ id: "s1", label: <scenario>, scenario: <plan scenario> }]`. `deployments`: the migrated deployments, the 候选池 one first. `exposure`: constant, with the `exposureDays` of the plan's `default` detector. When a detector used by the study's stations had a different value, the study's note records it (`1.x: detector "<key>" used <n> days; this study uses <m> days for all stations`) and the one-time migration report lists it. `aim` and `basis` are `null`.

Session: the active 1.x study's session becomes the workspace session. Its working station becomes the draft (its `exposureDays` becomes the playground exposure), its `compare` list becomes `shown`, its active deployment maps to the new ID, and `activeStudy` is that study.

Nothing is lost silently: every 1.x station, deployment and title has a counterpart, and differing exposures are reported. The migration is tested with the stored-data fixtures of `plan-store.test.mjs`, plus a random-number source injected for IDs.

## Interim study view (step 3)

Until the 我的点位 sidebar replaces the study UI, `workspace-study.js` shows one study as a muography-plan 1.1 view, which the existing study state edits:

- **Pool convention:** a study's first deployment is its candidate pool (`<title> · 候选池`, as migration makes it). The view's candidates are the pool; its deployments are the study's other deployments. A study without a pool, for example one imported from elsewhere, gets one holding the stations its deployments use.
- **Writing back:**
  - A moved station moves its site when it is the site's only user; otherwise it takes a site of the study at exactly that place, or a new one.
  - Stations and deployments the study dropped are deleted only when no other deployment or study uses them; unused sites and detectors go with them.
  - New stations and deployments get global IDs from the start.
- **Exposure:** the device form's exposure sets the study exposure for all its candidates (label 曝光时间 / 天（全方案）).
- **New study:** 新建 adds a study of the dataset candidates and stores it at once. The first study of a release that has no stored data is written with the first change. Deleting a study keeps its stations and deployments in the workspace.
- **Import:**
  - Files are merged as new items, identical items are skipped, and any conflict refuses the whole import (until the preview, step 5).
  - A study root opens that study; deployments or stations open as a new study (导入的部署组合 / 导入的点位).
  - A 1.x plan of another scenario opens that scenario.
- **Export:** the menu exports workspace selections: the study, the current deployment, or all deployments of the study.
- **Result provenance** still records the hash of the plan view and the station's global ID; the closure hash described under [Identity](#identity) arrives with step 4.

## Batch runs

`npm run run-plan` will accept workspace files as well as plan files:
- `--study <id>` runs a study's deployments under each of its scenes;
- `--deployment <id>` and `--stations <ids>` select stations as today.

The output format `muography-plan-run` gains the scene per result (a minor version). Until then, plan files remain the runner's input.

## Not in 2.0

| Item | Where it goes |
|---|---|
| Evaluation aims, and how several scenes are combined | ADR-031, as 2.1 |
| Anomaly hypotheses in scenes | ADR-025 and FR-H1, as a 2.x minor |
| Continuous environment variables | FR-K2 |
| Carrier mounts, trajectories, observation schedules (periods, per-station durations) | New `placement` kinds and study `exposure` kinds when a real case arrives (ADR-033) |
| Conversion between releases | FR-B2 |
| Embedded results | Results stay separate files (13a) |
| Scans | P5 |
| Live multi-user editing | FR-P3, server only |
