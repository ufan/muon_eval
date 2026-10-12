# Implementation Priority

Ordered work queue. Top items first; each item references its requirement (FR) or decision (ADR). Statuses: **Todo**, **In progress**, **Done**, **Blocked**. Per `AGENTS.md`, one feature or explainable refactor per commit, and physics-formula, geometry or data-format changes are labelled in the commit message.

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md) · [Roadmap](ROADMAP.md)

Last updated: 2026-10-10

---

## P0 — Result correctness (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 1 | Make flux integration history-independent | FR-C1 | Physics-model revision; bump `RESPONSE_MODEL_VERSION`; update frozen baseline tests and `specs/CALCULATION_MODEL.md` §2/§9 | Todo |
| 2 | Record the legacy 500 m ray cutoff in exports; fix limitation text | FR-C2, FR-C5 | `legacy-pattern-adapter.js`, `legacy-geometry-adapter.js`; legacy compatibility path only since OQ-3 | Todo |
| 3 | Decide the cos θ projected-area factor | FR-C3 | Needs owner decision; then fix as model revision or document | Blocked (decision) |
| 4 | Remove dead work in `quickMetrics()` | FR-C4 | Keep only `center` and `dirDoc`; legacy path only | Todo |

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
| 12 | Async, cancellable assessment port | ADR-006 | Change limited to `assessment-controller.js` | Todo |
| 13 | Headless batch runner (Node CLI) | FR-S5, ADR-006 | Plan in, results out; future server worker | Todo |

## P3 — Multi-station overview and demonstration (Phase 2)

Moved ahead of scan performance by owner decision (OQ-7). Built in the current page with existing modules; stations are computed one after another through the async port (#12); workers arrive with P4.

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 14 | Plan state: candidates vs selected deployment; per-station result cache keyed by snapshot | ADR-020, FR-P1 | Needs #11, #12; no recompute for unchanged stations; stale results never shown | Todo |
| 15 | Overview mode in 3D: all selected stations, colour per station, field-of-view cones, ray coverage on the subject; summary table; click → detail mode | FR-M4 | Reuses scene views; subject-neutral labels (FR-K1) | Todo |
| 16 | Per-station projections side by side | FR-M4 | Reuses `projection-canvas-view.js` | Todo |
| 17 | Demonstration mode: clean layout, camera presets, labels, screenshot export | FR-M5 | Short animation export later | Todo |

## Proposed — Anomaly hypotheses (ADR-025; placement pending OQ-10)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| AN1 | Anomaly schema as part of the plan format | FR-H1, FR-H11 | Design together with #11 | Proposed |
| AN2 | Generic regions, host clipping and density models (pure modules, test first) | FR-H2…H4 | Analytic fixtures at L2 | Proposed |
| AN3 | Perturbative evaluation over stored traces; sensitivity outputs | FR-H5, FR-H6 | Needs #1 (FR-C1) | Proposed |
| AN4 | Anomaly in 3D view and projection footprint | FR-H9 | Same definition as physics | Proposed |
| AN5 | Sweeps and systematics | FR-H7, FR-H8 | Feeds scans (P4) and reconstruction | Proposed |

## P4 — Scan performance and features (Phase 3)

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

## Later (Phases 4–7, parallel and conditional tracks)

| Item | Ref | Gate |
|---|---|---|
| Plan/scan screens with Vite + Preact/Svelte | ADR-004 | Phase 4, after P2 formats exist |
| 3D coverage metrics per voxel | FR-M6 | Phase 5 |
| Multi-station joint evaluation, reports | FR-M1, FR-M2 | Phase 5 |
| Simulated reconstruction (SIRT/MLEM), quality metrics, 3D result display | FR-M7…M9, ADR-021 | Phase 6 |
| Physics validation items | FR-V2…V11 | Phase 7 |
| Geant4 job package export / result import | FR-G1, FR-G2, ADR-007 | Phase 7 |
| Continuous-water scene resolution | FR-E1 | Geometry track |
| Physical-domain certification, entity attribution, compiled ROI | FR-GE4, FR-M3 | Geometry track; needs data evidence |
| Geometry debt (cavity, spillway rules, terrain, contours) | FR-GE1…GE3, GE5 | Geometry track |
| Second dam dataset | FR-D9 | When data is available |
| Dataset-declared kind/variables/layers/targets; compiled package as generic contract | FR-K2, K3, ADR-017 | Generalisation G1, after P2 |
| Material-dependent energy loss, deep-overburden flux, in-material stations, large terrain | FR-K4…K7 | Before the first non-dam subject (G3) |
| Load packaged dataset from file; converter; in-app authoring | FR-L1…L6 | User-geometry track U1–U3, not urgent |
| Compiled default capability gaps: flux cloud, internal features, target outlines/ROI, continuous water | FR-B1, FR-E1, FR-M3 | After P3; parts depend on FR-K3 and FR-GE4 |
| Station export/import between releases | FR-B2 | With the plan format (#11) or later |
| WebAssembly tracer | ADR-005 step 4 | Only if P4 measurements insufficient |
| Server backend | ADR-001 | Only when T1–T4 observed |
| Access control | FR-A1 | Answer to OQ-1 |
| Installable offline web app (PWA) | FR-W1, ADR-024 | When offline use is needed; small |
| Desktop installer via thin Tauri wrapper | FR-W2, W3 | Answer to OQ-9 |
| Preview performance extensions | Roadmap "Deferred" | Paused |

## Done

| Item | Ref | Commit |
|---|---|---|
| Datasets moved to top-level `datasets/` with sync script | ADR-018 | `dc48ed3` |
| Compiled backend made the default | OQ-3, ADR-011 | `eba2f6f` |
| Stale v0.1.0 `dam_spec` files removed | FR-Q6 | `03436ee` |
| All documentation in English; `AGENTS.md`/`CONTEXT.md` generalised | OQ-4, OQ-5, FR-K9 | `85b0dfe` |
| Living domain model created | ADR-022, FR-Q10 | `14c9f8f` |
| Windows launcher scripts removed (re-add when needed) | owner request | `b4c48f6` |
| Layered test commands and test directories (#5) | FR-Q1, ADR-023 | `6589a4c` |

## Change log

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
