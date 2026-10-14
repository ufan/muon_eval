# Implementation Priority

Ordered work queue. Top items first; each item references its requirement (FR) or decision (ADR). Statuses: **Todo**, **In progress**, **Done**, **Blocked**. Per `AGENTS.md`, one feature or explainable refactor per commit, and physics-formula, geometry or data-format changes are labelled in the commit message.

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md) · [Roadmap](ROADMAP.md)

Last updated: 2026-10-12

---

## P0 — Result correctness (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 1 | Make flux integration history-independent | FR-C1 | Physics-model revision `quick-response@2.0.0`; frozen baseline tests and `specs/CALCULATION_MODEL.md` §2/§9 updated | Done |
| 2 | Record the legacy 500 m ray cutoff in exports; fix limitation text | FR-C2, FR-C5 | `legacy-pattern-adapter.js`, `legacy-geometry-adapter.js`; legacy compatibility path only since OQ-3 | Done |
| 3 | Projected-area cos θ factor; remove the edge factor | FR-C3 | Model revision `quick-response@3.0.0`; evidence in `specs/CALCULATION_MODEL.md` §10.3 | Done |
| 3a | Measure in-pixel ray sampling error against a converged reference; document or plan a sampling option | FR-V12 | `scripts/experiment-pixel-sampling.mjs`; results in `specs/CALCULATION_MODEL.md` §11.6 | Done |
| 4 | Retire the legacy backend (owner decision; covers FR-C4: `quickMetrics()` removed with it) | FR-B3, FR-C4 | Remove old geometry (releases 0.6.1/0.6.2, analytic kernel, DDA, legacy adapters/scene view); keep the UI with legacy-only features gated; list migration targets MT-1…MT-6 | Done |

## Standing rules

- ADR-023: test first for pure functions, bug fixes, formats and invariants; P0 fixes (#1–#4) each start with a failing test.
- FR-Q10: changes to domain concepts update `docs/specs/DOMAIN_MODEL.md` in the same commit.
- FR-K1: every change keeps generic modules free of subject-specific (dam) logic; when touching a module that has such leaks, prefer moving them into the dataset declaration or a bounded adapter.

## P1 — Tooling, hygiene and boundaries (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 5 | `package.json` with layered test scripts; tests moved into `tests/unit`, `tests/contract`, `tests/integration` | FR-Q1, ADR-023 | `npm test` = L0–L2 under ~15 s; classification in TEST_STRATEGY §2 | Done |
| 6 | Bounded module-dependency audit | FR-Q8 | Was "next priority" in the former `docs/ROADMAP.md`; no projection or performance features in this item | Todo |
| 7 | Prettier reformat (behaviour-free commit) | FR-Q2 | Separate commit, no logic changes | Todo |
| 8 | `@ts-check` + JSDoc + `tsc --noEmit` on pure modules; branded point/direction/frame types | FR-Q3, ADR-003 | Start with `coordinates.js`, `detector-pose.js`, tracers | Todo |
| 9 | Small fixes: `textContent` for names, azimuth wrap, document dev dependencies | FR-Q4, Q5, Q7 | One commit each (stale files removed, FR-Q6 done) | Todo |
| 10 | Formal `sx`/`sy` and detector-frame definition | FR-X1 | Documentation only; prerequisite for plan schema | Todo |

## P2 — Plans and server seams (Phase 1)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 11 | Plan / scan / result schemas with versions and migrations | FR-P1, FR-P2, ADR-006, FR-K1 | Becomes the future API contract; subject-neutral, references datasets by release ID (+ content hash) | Todo |
| 11b | One "导出" menu on the versioned result format; comparison moves into it | FR-P4, ADR-030 | Right after #11 | Todo |
| 12 | Async, cancellable assessment port | ADR-006 | `createLocalAssessmentPort`: `open(input).evaluate(quality, {signal, onProgress}) → Promise`, AbortError on cancel; the controller uses only the port. A worker or server port implements the same interface | Done |
| AN1 | Anomaly schema as part of the plan format | FR-H1, FR-H11 | Design together with #11 | Todo |
| 13 | Headless batch runner (Node CLI) | FR-S5, ADR-006 | Plan in, results out; future server worker | Todo |

## P3 — Multi-station overview and demonstration (Phase 2)

Moved ahead of scan performance by owner decision (OQ-7). Built in the current page with existing modules; stations are computed one after another through the async port (#12); workers arrive with P5.

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 14 | Plan state: candidates vs selected deployment; per-station result cache keyed by snapshot | ADR-020, FR-P1 | Needs #11, #12; no recompute for unchanged stations; stale results never shown | Todo |
| 15 | Overview mode in 3D: all selected stations, colour per station, field-of-view cones, ray coverage on the subject; summary table; click → detail mode | FR-M4 | Reuses scene views; subject-neutral labels (FR-K1) | Todo |
| 15a | Coverage highlight: geometric (live, single colour per station) and physical (count/sr brightness from the result) via projective texturing; slope-mapping L1 test against `detector-pose.js` | FR-M10, ADR-026 | Single-station first (no plan needed), then multi-station with #15; measure FR-N5 on an Intel i5 laptop | Todo |
| 15b-1 | Feature catalogue builder in the dataset adapter (from `semantics` and `vocabulary`; direct/aggregate from compiled components) | ADR-029, FR-K3 | Test first: L1 on a synthetic spec; L3 on Zhouning (44 features, 22 direct; virtual placeholders excluded) | Done |
| 15b-2 | Display profile: schema, optional loading and validation; Zhouning profile with ~5 recognition items | ADR-029 | Schema in `datasets/schemas/`; resolver `display-profile.js` (L1); Zhouning profile (7 items) with its own registry hash outside the authored package integrity (L3, release check); added to the existing release (owner: option a) | Done |
| 15b-3 | Recognition masks per result: item length field, mask at T, image coverage, in-view flag (pure) | FR-M12 | `recognition-layers.js`; L1 tests incl. strict threshold, material items, border-closed rings, crossing order | Done |
| 15b-4 | 3D feature layer (after 15b-5): replaces the single "galleries, rooms, shaft" checkbox with catalogue groups; feature meshes in class colours, group panel expandable to features, per-feature hover/pick | FR-M11 | L5 check; layer toggles never change results; takes over the two-way outline ↔ 3D link from 15b-5, incl. emphasising the features crossed by the hovered ray. `feature-layers.js` (L1, L3); groups shown by default when all their features are reference voids or targets; in-view emphasis moves to 15a | Done |
| 15b-5 | Projection outlines and the profile-driven item list (next, with 15b-3): replaces the hard-coded "target structure layers" panel with the recognition items from the display profile (defaults on, visible-item filter, all-features search), contour of the item length at T, legend with T, hover list of crossed items, two-way linking | FR-M12 | Outline = d3-contour of the padded mask (ADR-029, as implemented); fixed-order list with out-of-view items greyed; selection and T persist per release; L5 in `check-main-compiled-app.mjs`. Linking moved to 15b-4; numbered 3D markers built then dropped (owner) | Done |
| 15b-6 | Material items (concrete, steel) and the material envelope overlay in the main app | FR-M12 | Material items already work (15b-3; steel item left out by owner). Envelope toggle built, then removed after review (owner): it stays in the geometry preview | Done |
| 15c | Statistical precision contour (1/√N at 5 % and 10 %); move existing contour layers under "专家诊断", off by default; two-way links between main app and preview with the shared `dataset`/`scenario` parameters | FR-M13, FR-M14, ADR-030 | `precision-contours.js` (L1); "专家诊断" and "方案比较" sections; `selectionHref` (L1); L5 in both browser checks | Done |
| 16 | Per-station projections side by side | FR-M4 | Reuses `projection-canvas-view.js` | Todo |
| 17 | Demonstration mode: clean layout, camera presets, labels, screenshot export | FR-M5 | Short animation export later | Todo |

## P4 — Anomaly hypotheses and sensitivity (Phase 3)

Before scan performance by owner decision (OQ-10). AN1 is in P2 with the plan format; its prerequisite #1 (FR-C1) is done.

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| AN2 | Generic regions, host clipping and density models (pure modules, test first) | FR-H2…H4 | Analytic fixtures at L2 | Todo |
| AN3 | Perturbative evaluation over stored traces; sensitivity outputs | FR-H5, FR-H6 | #1 (FR-C1) done; include edge-adaptive in-pixel sampling (FR-V12, spec §11.6) with the experiment reference as an L4 test | Todo |
| AN4 | Anomaly in 3D view and projection footprint | FR-H9 | Same definition as physics | Todo |
| AN5 | Sweeps and systematics | FR-H7, FR-H8 | Feeds scans (P4) and reconstruction | Todo |

## P5 — Scan performance and features (Phase 4)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 18 | Benchmark script tracking rays/s and pose time | FR-S4 | Baseline 2026-10-09: ~10.6k rays/s/core, 0.44 s per 65×65 pose | Todo |
| 19 | Direction-map reuse per station/scenario + coarse-to-fine | ADR-005 step 1 | Validate against direct tracing | Todo |
| 20 | JS tracer optimisation (top-level BVH, flat arrays, no per-ray allocation) | ADR-005 step 2 | Must pass conformance rays/points | Todo |
| 21 | Worker-parallel evaluation (Node + browser) | ADR-005 step 3 | Also speeds up the multi-station overview | Todo |
| 22 | Scan constraints, ranking, robustness | FR-S1…S3 | Write metric/ranking definitions first | Todo |

## Pending browser regressions (fit in when touching the preview)

| Item | Ref | Status |
|---|---|---|
| Preview chunked-transfer browser regression incl. failed narrow-screen overlay check | FR-N2 | Todo |
| Cold start, peak memory, worst-case interaction measurements | FR-N3 | Todo |

## Later (Phases 5–8, parallel and conditional tracks)

| Item | Ref | Gate |
|---|---|---|
| Plan/scan screens with Vite + Preact/Svelte | ADR-004 | Phase 5, after P2 formats exist |
| 3D coverage metrics per voxel | FR-M6 | Phase 6 |
| Multi-station joint evaluation, reports | FR-M1, FR-M2 | Phase 6 |
| Simulated reconstruction (SIRT/MLEM), quality metrics, 3D result display | FR-M7…M9, ADR-021 | Phase 7 |
| Physics validation items | FR-V2…V11 | Phase 8 |
| Geant4 job package export / result import | FR-G1, FR-G2, ADR-007 | Phase 8 |
| Continuous-water scene resolution | FR-E1 | Geometry track |
| Physical-domain certification, entity attribution, compiled ROI | FR-GE4, FR-M3 | Geometry track; needs data evidence |
| Geometry debt (cavity, spillway rules, terrain, contours) | FR-GE1…GE3, GE5 | Geometry track |
| Second dam dataset | FR-D9 | When data is available |
| Dataset-declared kind/variables/layers/targets; compiled package as generic contract | FR-K2, K3, ADR-017 | Generalisation G1, after P2 |
| Material-dependent energy loss, deep-overburden flux, in-material stations, large terrain | FR-K4…K7 | Before the first non-dam subject (G3) |
| Load packaged dataset from file; converter; in-app authoring | FR-L1…L6 | User-geometry track U1–U3, not urgent |
| Compiled backend migration targets MT-1…MT-6 | FR-B1 | MT-2/MT-5 → #15b; MT-1 deferred; MT-4 replaced by #15a; MT-3 → anomalies (P4); MT-6 → plan format (#11) |
| Station export/import between releases | FR-B2 | With the plan format (#11) or later |
| WebAssembly tracer | ADR-005 step 4 | Only if P5 measurements insufficient |
| Server backend | ADR-001 | Only when T1–T4 observed |
| Access control | FR-A1 | Answer to OQ-1 |
| Installable offline web app (PWA) | FR-W1, ADR-024 | When offline use is needed; small |
| Desktop installer via thin Tauri wrapper | FR-W2, W3 | Answer to OQ-9 |
| Preview performance extensions | Roadmap "Deferred" | Paused |
| Content-hashed file names and long-lived caching | ADR-004 | With the build step; until then servers send `no-cache` |
| W1 Dataset workbench: slim the preview to dataset checks with pass/fail, same style and language, delete its duplicated station/comparison/export paths | FR-D10, ADR-030 | After 15c and 11b, or with the first second-kind dataset |

## Done

| Item | Ref | Commit |
|---|---|---|
| Back-side muons counted: pixels are lines, evaluated at their sky end (#4a), model `quick-response@4.0.0` | FR-C7 | this commit |
| Legacy backend retired; old geometry releases removed (#4) | FR-B3, FR-C4 | `6a13fb0`, `2026c9c` |
| In-pixel ray sampling error measured (#3a) | FR-V12 | `d887d4d` |
| Projected-area factor added, edge factor removed (#3), model `quick-response@3.0.0` | FR-C3 | `3aa22b4` |
| Legacy 500 m ray cutoff recorded in exports (#2) | FR-C2 | `cbbc1b0` |
| History-independent flux integral (#1), model `quick-response@2.0.0` | FR-C1 | `5de4693` |
| Datasets moved to top-level `datasets/` with sync script | ADR-018 | `dc48ed3` |
| Compiled backend made the default | OQ-3, ADR-011 | `eba2f6f` |
| Stale v0.1.0 `dam_spec` files removed | FR-Q6 | `03436ee` |
| All documentation in English; `AGENTS.md`/`CONTEXT.md` generalised | OQ-4, OQ-5, FR-K9 | `85b0dfe` |
| Living domain model created | ADR-022, FR-Q10 | `14c9f8f` |
| Windows launcher scripts removed (re-add when needed) | owner request | `b4c48f6` |
| Layered test commands and test directories (#5) | FR-Q1, ADR-023 | `6589a4c` |

## Change log

- 2026-10-14: #12 done (async, cancellable assessment port).
- 2026-10-14: Stale-module fix: `no-cache` revalidation in `nginx.conf` and the new `npm run serve`; per-file stamps reverted, content hashing deferred to the build step (owner).
- 2026-10-14: 15c done (precision lines, expert diagnostics drawer, two-way links). Next: P2 #11/#12.
- 2026-10-14: ADR-030: 15c extended (links), 11b export menu, W1 dataset workbench; after 15c, P2 #11/#12 come next because #15/#16 depend on them.
- 2026-10-14: Material envelope overlay removed from the main app (owner); FR-K11 recorded.
- 2026-10-14: Detector's own space excluded from outlines, crossings and 3D emphasis (owner, ADR-029).
- 2026-10-14: #4a done (FR-C7, back-side muons, `quick-response@4.0.0`); next: detector's own space excluded from outlines, envelope removed from the main app (owner order).
- 2026-10-14: 15b-6 done (material envelope overlay in the main app); #15b complete.
- 2026-10-13: 15b-4 done (3D feature layer, hover/pick, two-way linking).
- 2026-10-13: Numbered 3D entry markers dropped (owner); hover list leads with length inside each item.
- 2026-10-13: 15b-3 and 15b-5 done (recognition layers, profile-driven outline panel); two-way linking moved to 15b-4.
- 2026-10-13: Zhouning profile defaults changed (owner); order: 15b-3 + 15b-5 (profile-driven GUI) next, then 15b-4.
- 2026-10-13: 15b-2 done (display profile).
- 2026-10-13: 15b-1 done (feature catalogue); 15b-2 release decision: profile added to the existing release (option a).
- 2026-10-13: #15b split into 15b-1…15b-6 after ADR-029 was accepted; overview table and coverage emphasis follow with #15/#15a/#16.
- 2026-10-13: #15b subject features (MT-2, MT-5) in P3, design discussion first.
- 2026-10-12: #4 replaced by legacy retirement (owner): done; migration targets added under Later.
- 2026-10-12: #3a done; edge-adaptive sampling attached to AN3.
- 2026-10-12: Added #3a (FR-V12) ahead of #4.
- 2026-10-12: #3 done (owner decision: both changes as one model revision).
- 2026-10-12: #2 done.
- 2026-10-12: #1 done.
- 2026-10-12: #15a includes FR-N5 measurement.
- 2026-10-12: Added #15a coverage highlight in P3.
- 2026-10-12: Anomaly work placed as P4 (Phase 3) before scans (now P5); AN1 moved into P2 with the plan format; phase references renumbered.
- 2026-10-12: Renamed "deficiency" to "anomaly"; items AN1–AN5.
- 2026-10-12: Proposed anomaly items AN1–AN5 pending OQ-10.
- 2026-10-10: Desktop distribution items under Later.
- 2026-10-10: #5 done.
- 2026-10-10: #5 extended to layered scripts; standing rule ADR-023.
- 2026-10-10: Standing rule FR-Q10; Done table updated.
- 2026-10-10: Legacy-only notes on #2 and #4; #9 narrowed; compiled-default gaps and station import added under Later; Done table added.
- 2026-10-10: New P3 multi-station overview (#14–#17) ahead of scan performance (now P4, #18–#22) by owner decision; phase references updated.
- 2026-10-10: Added multi-station overview, coverage metrics and simulated reconstruction under Later; phases renumbered.
- 2026-10-10: Added standing rule FR-K1; generalisation and user-geometry items under Later; #11 made subject-neutral.
- 2026-10-10: Moved from `docs/planning/` to `docs/` top level; links updated to `specs/` and `guides/`.
- 2026-10-10: Merged former `docs/ROADMAP.md`: dependency audit (#6), browser regressions, geometry-track and deferred items; added #10 (FR-X1); renumbered.
- 2026-10-10: Initial priority list from review discussion.
