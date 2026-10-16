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
| 11 | Plan / scan / result schemas with versions and migrations | FR-P1, FR-P2, ADR-006, FR-K1 | `muography-plan` 1.0.0 (PLAN_FORMAT.md, schema, `plan-format.js`, `plan-store.js`); storage, export and import in the app; results record their plan (hash + station). Scan format deferred to P5 (owner) | Done |
| 11b | One "导出" menu on the versioned result format; comparison moves into it | FR-P4, ADR-030 | Right after #11; do 13a with it | Todo |
| 12 | Async, cancellable assessment port | ADR-006 | `createLocalAssessmentPort`: `open(input).evaluate(quality, {signal, onProgress}) → Promise`, AbortError on cancel; the controller uses only the port. A worker or server port implements the same interface | Done |
| AN1 | Anomaly schema as part of the plan format | FR-H1, FR-H11 | Field `anomalies` reserved (empty) in plans 1.0 and 1.1; schema designed with P4 as plan 1.2.0 (owner; 1.1.0 went to deployments, 14a) | Todo |
| 13 | Headless batch runner (Node CLI) | FR-S5, ADR-006 | `scripts/run-plan.mjs` on the pure `plan-runner.js`: plan in; per-station results, run summary and optional replayable comparison out; worker threads, byte-identical for any thread count. Six stations at 65² in about 6 s on four cores. Scan input with P5. Known limits are tracked in 13a, #14, FR-L4, FR-K11 and the pending browser regressions | Done |
| 13a | Open run outputs in the app; smaller result files | FR-S5, FR-P4 | With 11b (same versioned result format and export/import menu). (1) The app cannot open a single `<station>.result.json` or a run folder (`summary.json`); today only `comparison.json` replays. (2) Sizes: a 65² result is 3–4 MB of JSON and `comparison.json` embeds every result (22 MB for 6 stations), so about 14 stations exceed the app's 50 MB import limit, and replay stops at 20 rows. Fix: comparison references result files by SHA-256 (as `summary.json` does) instead of embedding them, and a compact result encoding; limits set from measurements | Todo |
| 11c | Workspace 2.0: playground-first workflow, flat shared workspace, selection export and import preview | FR-P11, FR-P12, ADR-033 | Steps: (1) design documents (WORKSPACE_FORMAT.md, schema, ADR-033, DOMAIN_MODEL §2.3a) — drafted 2026-10-16, owner decisions settled 2026-10-17; (2) `workspace-format.js` + migration, test-first — done 2026-10-17; (3) storage switch-over; (4) 我的点位 and deployment sidebar (mock-ups first); (5) selection export and import preview; (6) study composer with scenes. Aims follow ADR-031 (2.1) | In design |

## P3 — Multi-station overview and demonstration (Phase 2)

Moved ahead of scan performance by owner decision (OQ-7). Built in the current page with existing modules; stations are computed one after another through the async port (#12); workers arrive with P5.

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 14a | Plan format 1.1.0 (named deployments, candidate notes; active station moves out of the plan) and several studies per release in browser storage, with migration from 1.0 and from one plan per release | FR-P1, FR-P7, FR-P8, ADR-020 | Data format; test first (L1 format and store, L3 schema). Minimal study picker (switch, new) in 候选部署点; import creates a study; runner takes `--deployment <id>` | Done |
| 14b | Working station vs fixed candidates (update / save as new); per-candidate compact result cache with status; comparison of candidates replaces the separate "方案比较" rows | FR-P6, FR-P10, ADR-020 | `study-state.js` (working station, save as new, update, delete, apply detector to all; detectors shared by value), `candidate-results.js` (input key, compact entry ≈ 90 KB at 65², cache, background queue that yields to the working station). List shows each candidate's status and totals; ticking 比较 compares cached candidates; the comparison export recomputes full results; "导出当前结果" exports the working result. Open: filling the cache from a batch run (#13), path segments in the compact form (with #16) | Done |
| 14c | Named deployments UI (new, copy, rename, delete, membership); study picker complete (rename, delete, import); export of a study or of deployments | FR-P7, FR-P8, FR-P9 | 部署组合 section (members ticked from the candidates, "比较本组合的点位"); 工作方案 rename/delete; header menu 导出方案 ▾ (whole study, current deployment, all deployments). Multi-station metrics come with #15 | Done |
| 14d | Sketching: place the working station by clicking the model; geometric coverage of several candidates at once | FR-P5, FR-M10 | "在模型上点选位置" (one click; on a cavity feature, category `void`, even seen through the semi-transparent concrete, terrain or water, the station goes inside it: middle of the cavity along the line of sight, floor + 1 m, at most half the clear height, from the calculation's trace in `station-placement.js`; elsewhere 0.5 m off the clicked surface on the viewer's side; a note says which; Esc cancels); 环境图层 → 覆盖范围 → 其他点位 (compared, current deployment or all candidates, up to 8): surfaces shaded by the number of covering stations, each station's field-of-view edge and marker in its colour, swatches in the list, hover lists the covering stations. Pure parts in `coverage-map.js` (L1) | Done |
| 15 | Overview mode in 3D: all selected stations, colour per station, field-of-view cones, ray coverage on the subject; summary table; click → detail mode | FR-M4, FR-M1 | Reuses scene views; subject-neutral labels (FR-K1). 3D side done with 14d, 15d, 15e. Summary table done: 多站总览 section, per recognition item the working station and the stations of 其他点位 (`overview-table.js`, L1), target points from the calculation geometry (`target-samples.js`, L1, L4), item lengths kept sparse in the compact cache (L1, L4); a station name opens it as the working station; one button shows the class map in 3D. Other stations' markers in 3D carry name labels; a click on a label or marker opens that station (`screen-pick.js`, L1) | Done |
| 15a | Coverage highlight: geometric (live, single colour per station) and physical (count/sr brightness from the result) via projective texturing; slope-mapping L1 test against `detector-pose.js` | FR-M10, ADR-026 | Single station done (owner: ahead of #13): `coverage-map.js` (L1), `coverage-shader.js`, controls in 环境图层. Hover readout, click to the projection pixel, pyramid edges, on-demand rendering and in-view feature emphasis done. Multi-station geometric coverage done with 14d, multi-station physical maps with 15d. Open: FR-N5 measurement on an Intel i5 laptop | Partly done |
| 15b-1 | Feature catalogue builder in the dataset adapter (from `semantics` and `vocabulary`; direct/aggregate from compiled components) | ADR-029, FR-K3 | Test first: L1 on a synthetic spec; L3 on Zhouning (44 features, 22 direct; virtual placeholders excluded) | Done |
| 15b-2 | Display profile: schema, optional loading and validation; Zhouning profile with ~5 recognition items | ADR-029 | Schema in `datasets/schemas/`; resolver `display-profile.js` (L1); Zhouning profile (7 items) with its own registry hash outside the authored package integrity (L3, release check); added to the existing release (owner: option a) | Done |
| 15b-3 | Recognition masks per result: item length field, mask at T, image coverage, in-view flag (pure) | FR-M12 | `recognition-layers.js`; L1 tests incl. strict threshold, material items, border-closed rings, crossing order | Done |
| 15b-4 | 3D feature layer (after 15b-5): replaces the single "galleries, rooms, shaft" checkbox with catalogue groups; feature meshes in class colours, group panel expandable to features, per-feature hover/pick | FR-M11 | L5 check; layer toggles never change results; takes over the two-way outline ↔ 3D link from 15b-5, incl. emphasising the features crossed by the hovered ray. `feature-layers.js` (L1, L3); groups shown by default when all their features are reference voids or targets; in-view emphasis moves to 15a | Done |
| 15b-5 | Projection outlines and the profile-driven item list (next, with 15b-3): replaces the hard-coded "target structure layers" panel with the recognition items from the display profile (defaults on, visible-item filter, all-features search), contour of the item length at T, legend with T, hover list of crossed items, two-way linking | FR-M12 | Outline = d3-contour of the padded mask (ADR-029, as implemented); fixed-order list with out-of-view items greyed; selection and T persist per release; L5 in `check-main-compiled-app.mjs`. Linking moved to 15b-4; numbered 3D markers built then dropped (owner) | Done |
| 15b-6 | Material items (concrete, steel) and the material envelope overlay in the main app | FR-M12 | Material items already work (15b-3; steel item left out by owner). Envelope toggle built, then removed after review (owner): it stays in the geometry preview | Done |
| 15c | Statistical precision contour (1/√N at 5 % and 10 %); move existing contour layers under "专家诊断", off by default; two-way links between main app and preview with the shared `dataset`/`scenario` parameters | FR-M13, FR-M14, ADR-030 | `precision-contours.js` (L1); "专家诊断" and "方案比较" sections; `selectionHref` (L1); L5 in both browser checks | Done |
| 15d | Physical multi-station coverage: 多视角覆盖 (usable views, 视角张角, summary class; default), 主导站点, 总计数, from each station's cached counts | FR-M15, ADR-026 | `coverage-map.js` per-point reference (L1), shader variant `COV_MULTI` with a nine-slot loop over a float texture of each station's counts; 环境图层 → 覆盖范围 物理 → 多站物理 (default 多视角覆盖：可用视角数), error level, class thresholds, legend, hover | Done |
| 15e | Slice plane through the interior for geometric and multi-view coverage; coverage on target features | FR-M16, FR-M15 | `slice-plane.js` (plane, mask; L1, real model L4), mask from `classifyModel` (density > 0.01 g/cm³) in chunks after the slider rests, abortable; plane in the coverage pass with two-sided shading; feature meshes tinted (构件表面着色, on by default); 环境图层 → 切面 | Done |
| 16 | Per-station projections side by side | FR-M4 | 多站总览 → 并排查看各点位投影: one tile per overview station from its cached compact result (no recomputation), the main projection's fixed colour scale (now shared in `projection-tiles.js`, L1), horizon, selected outlines from the cached item lengths, optional precision lines; hover shows pixel values; a station name opens it. Hover crossings need path segments in the cache (follow-up) | Done |
| 17 | Demonstration mode: clean layout, camera presets, labels, screenshot export | FR-M5 | 演示模式 in the header: the 3D view alone with the overview's stations; caption (release title, study, deployment, station count), legend (station colours, coverage map), footnote with the limitations and inputs (release, scenario, exposure, detector, date); the page's view presets and saved camera views per release, stepped with ← →; working station labelled; projection panel on demand; PNG screenshot with the same caption, legend, labels and footnote (`demo-snapshot.js`, L1); Esc leaves. Short animations (录制动画): a guided tour through the presets and saved views or one turn around the target, frames drawn with the same overlays and encoded with exact timestamps (WebCodecs + own `webm-muxer.js`, L1), so the WebM plays smoothly at 30 fps however slowly the machine renders; real-time MediaRecorder fallback; Esc cancels | Done |
| 17a | Evaluation aims: regions (recognition item + optional model-frame limits) and aims (metric, aggregation, parameters incl. required resolution) in the plan (`muography-plan` 1.2, data format); metric library on target points; aim numbers in 多站总览; templates for multi-view overlap and extent; 15d class thresholds move into the overlap template | FR-M17, ADR-031 | Test first: plan migration 1.1 → 1.2 (L1), region clipping, metrics, aggregations and resolution cells (L1), real-model region samples (L4) | Deferred (specification later) |

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
| 22 | Scan constraints, ranking, robustness | FR-S1…S3 | Write metric/ranking definitions first; includes pose sweeps ranked by the user's evaluation aim (FR-M17, ADR-031, owner 2026-10-14) | Todo |

## Pending browser regressions (fit in when touching the preview)

| Item | Ref | Status |
|---|---|---|
| Preview chunked-transfer browser regression incl. failed narrow-screen overlay check | FR-N2 | Todo |
| Cold start, peak memory, worst-case interaction measurements | FR-N3 | Todo |
| A runner `comparison.json` replays in the main app (方案比较 → 重放比较); checked so far only with the same module in Node | FR-S5 | Todo (with 13a) |

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

- 2026-10-17: 11c step 2 done: `workspace-format.js` (validation, canonical text, item hashes, IDs, selection closure, 1.x migration) with unit and schema-agreement tests.
- 2026-10-16: 11c added (workspace 2.0, ADR-033); design documents drafted.
- 2026-10-14: 15d done (physical multi-station maps on subject surfaces).
- 2026-10-14: 15e done (slice plane, coverage on shown target features).
- 2026-10-14: #15 summary table done (多站总览: per-item station numbers and multi-view numbers, click a station to open it); stale notes on multi-station physical coverage in #15 and 15a corrected.
- 2026-10-14: #15 done (station labels in 3D; a click on a marker or label opens the station).
- 2026-10-14: #16 done (projections side by side from the cache; colour scale shared with the main projection).
- 2026-10-14: #17 done (demonstration mode with presets, saved views, labels, limitations footnote and PNG screenshots; animation export later).
- 2026-10-14: #17 animation export done (tour and orbit, WebM at exact 30 fps).
- 2026-10-14: 17a added (regions and extent coverage, FR-M17); pose sweeps go to scanning (#22).
- 2026-10-14: 17a reframed as user-defined evaluation aims (ADR-031): the app supplies regions, metrics, aggregations and templates; the aim is the user's.
- 2026-10-14: 17a deferred until the owner specifies aims; meanwhile new metrics and views must not build in an aim (ADR-031).
- 2026-10-14: 15d (multi-view coverage, default mode) and 15e (slice plane) added after the coverage colour discussion (owner).
- 2026-10-14: Geometric multi-station coverage in one red ramp (1 to 5+ stations); physical multi-station plan recorded for #15 (dominant station by default, total as option).
- 2026-10-14: Optional translucent solid field-of-view pyramid (实心视锥, owner); extended beyond the concrete (at least 72 m, 20 m past the last exit).
- 2026-10-14: Field-of-view edges as screen-width lines with an on/off option (owner).
- 2026-10-14: Placement inside a clicked cavity (owner).
- 2026-10-14: 14d done (click-to-place, multi-station geometric coverage); #14 complete.
- 2026-10-14: 14c done (deployments UI, study rename/delete, plan export menu).
- 2026-10-14: After 14b (owner): 候选部署点 open by default; the position-dependent compiled ray length is no longer reported as a sampling difference.
- 2026-10-14: 14b done (working station, fixed candidates, per-candidate cache, comparison from the list).
- 2026-10-14: 14a done (plan 1.1.0, several studies per release).
- 2026-10-14: #14 replaced by 14a–14d after the study-workflow review (owner): fixed candidates, named deployments, several studies per release, recompute with a compact session cache.
- 2026-10-14: #13 done (headless batch runner); its known limits recorded as 13a and on #14, FR-L4, FR-K11 and the browser regressions.
- 2026-10-14: On-demand rendering and in-view feature emphasis done.
- 2026-10-14: 15a hover/click link and pyramid edges done.
- 2026-10-14: 15a single-station coverage done ahead of #13 (owner).
- 2026-10-14: #11 done (plan format 1.0.0, storage, export/import, result provenance); AN1 deferred to P4 as plan 1.1.0.
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
