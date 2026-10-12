# Roadmap (Big Direction)

The direction of the platform in phases. Each phase states its goal and exit criteria; ordering of individual tasks lives in [Implementation priority](IMPLEMENTATION_PRIORITY.md). This file replaces the former `docs/ROADMAP.md` (ADR-015).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md)

Last updated: 2026-10-10

---

## Guiding principles

- A rapid evaluation and comparison tool; never construction-grade, safety-certification or approval conclusions.
- Offline static app; no large framework or plugin system without proven need; one calculation core shared by every consumer (ADR-001, ADR-002, ADR-012).
- Correctness and reproducibility before features; tests before extracting pure modules; measure before optimising (ADR-005).
- A subject-neutral platform: dams first, then other subjects such as blast furnaces and tunnels. Every decision keeps that path open, but each kind is supported only when it is actually added (ADR-016). Today's code knows one RCC dam; subjects may differ in display/interaction, geometry semantics and regions of interest, so generic abstractions wait for real second examples.
- Standing rules apply in every phase: FR-C6, FR-B3, FR-D1…D8, FR-K1, FR-K8, FR-K10, FR-Q9…Q11, FR-V1, FR-N4.
- Abstractions are validated by real datasets (a second dam, then a second kind), not by guesses (ADR-008).
- Server, WebAssembly and Geant4 automation are conditional, unlocked only by observed triggers.

## Where we are

The foundation dependency chain (ADR-008/011) is largely in place:

```text
data contract + coordinate adapters → pure geometry query interfaces
  → compiled runtime + shared display buffers → main-app calculation/state integration
  → scans and on-demand parallelism   ← next
```

- Dataset registry, release IDs, checksum-verified loading; v0.7.0 release with compiled GLB/BVH backend.
- Main app runs the compiled GLB/BVH backend by default (frozen scenarios); legacy DDA with continuous water level stays selectable as a compatibility path; shared response core.
- Dataset releases live in the top-level `datasets/` directory; all documentation is in English.
- Calculation, state, scheduling and views separated into modules; numeric pattern layers and finite-model references in the preview.
- Not done: continuous water on compiled geometry, physical-domain certification, entity-level ROI on compiled, full plan save/load, scans.

## Phase 0 — Trustworthy results and basic tooling

**Goal:** results are deterministic, traceable and documented; the codebase is checkable and its module boundaries are enforced.
**Covers:** FR-C1…C5, FR-Q1…Q8.
**Exit:** history-independent results; ray length recorded in all exports; acceptance factor decided; `npm test` runs everything; formatted source; type checking on pure modules; module-dependency audit locked by tests.

## Phase 1 — Plans as first-class, versioned data

**Goal:** a complete deployment plan can be saved, loaded, shared as a file and migrated across versions.
**Covers:** FR-P1, FR-P2; ADR-006 seams (schemas, async cancellable assessment port). Station export/import between releases (FR-B2) uses the same format.
**Exit:** round-trip plan tests; plan/scan/result schemas stable enough to serve as a future API contract.

## Phase 2 — Multi-station overview and demonstration

**Goal:** show the selected deployment as a whole: all selected stations at once for overview and customer demonstration, with each detector's field-of-view coverage highlighted on the subject. Prioritised ahead of scanning by the owner (2026-10-10).
**Covers:** FR-M4, FR-M5, FR-M10 (coverage highlight), FR-N5 (integrated-GPU budget); ADR-020, ADR-026. The single-station coverage highlight needs no plan format and can land before the rest of this phase.
**Depends on:** plan schema with selected deployment, async cancellable assessment port (Phase 1). Built in the current page; does not wait for the new UI stack (ADR-004) or scan workers.
**Exit:** overview and detail modes over one plan; per-station results cached; coverage highlight (geometric and physical, per steradian) in single- and multi-station views, correct under transparency and measured on an Intel Core i5 laptop; demonstration layout with camera presets and screenshot export.

## Phase 3 — Anomaly hypotheses and sensitivity

**Goal:** evaluate whether a plan would detect a specified anomaly, with quantified sensitivity and systematics (ADR-025). Placed before scanning because scan ranking and reconstruction quality are defined by sensitivity to anomalies (OQ-10, 2026-10-12).
**Covers:** FR-H1…H11 (H10 kind generators later). The anomaly format (FR-H1) is designed together with the plan format in Phase 1.
**Depends on:** FR-C1 (history-independent flux, priority #1, done); plan format (Phase 1).
**Exit:** generic regions and density models with host clipping; perturbative evaluation matching full retracing on analytic fixtures; sensitivity outputs, sweeps and systematics; anomalies shown in 3D and as projection footprints.

## Phase 4 — Workstation-scale scanning

**Goal:** large station/pose scans with constraints, ranking and robustness on one workstation.
**Covers:** FR-S1…S5; ADR-005 steps 1–3.
**Exit:** headless batch runner; reference scan in minutes; feasibility, observability and safety reported as separate dimensions.

## Phase 5 — New planning and scan screens

**Goal:** usable UI for plans, scans and comparisons.
**Covers:** ADR-004 (Vite + small framework introduced here, old page migrated gradually); FR-N1…N4.
**Exit:** plan and scan screens built on the Phase 1 and Phase 4 formats; hosting/Docker/docs updated for the build step.

## Phase 6 — Multi-station evaluation, coverage and reports

**Goal:** evaluate the deployment as a whole: joint metrics, 3D coverage, shareable reports.
**Covers:** FR-M1, FR-M2, FR-M6; ADR-020. Uses Phase 4 workers for many stations.

## Phase 7 — Simulated multi-projection reconstruction

**Goal:** a second dimension of plan quality: what 3D density picture the deployment could recover.
**Covers:** FR-M7…M9; ADR-021. Coverage metrics (Phase 6) come first; reconstruction algorithms are added incrementally.

## Phase 8 — Physics validation

**Goal:** know how accurate the fast model is.
**Covers:** FR-V2…V11 (FR-V12 measured in Phase 0), FR-G1, FR-G2 (Geant4 export package and result import), FR-X1…X3.

## Parallel track — Geometry and scene fidelity

Can advance alongside Phases 1–4 when data or evidence becomes available.

- Unified continuous-water / frozen-scenario scene resolution (FR-E1).
- Physical-domain and interface certification, aggregate entity attribution (FR-GE4), then compiled entity ROI (FR-M3).
- Geometry debt: single cavity implementation, spillway rules into spec, complete terrain, contour quality (FR-GE1…GE3, GE5).
- Second real dam dataset (FR-D9) and the pending contract specs in FR-D2, D3, D5, D7.
- Close the compiled default's capability gaps (FR-B1).

## Generalisation track (ADR-016…018)

Gradual; each stage is triggered by real need, not built ahead.

| Stage | Content | When |
|---|---|---|
| G0 | No new dam-specific code in generic modules (FR-K1); plan/scan schemas subject-neutral (FR-P1) | Now, standing |
| G1 | Dataset-declared kind, variables, layers, targets, capabilities (FR-K2, K3); compiled package as the generic contract (ADR-017); datasets as top-level directory (ADR-018, done) | After Phase 1 formats exist |
| G2 | Second dam dataset, preferably of a different dam type, validates the abstractions (FR-D9); kind profile first (FR-K10) | When data is available |
| G3 | First non-dam subject (blast furnace or tunnel): kind profile first (FR-K10), then its physics prerequisites (FR-K4…K7), display/interaction and ROI needs, and baselines (FR-K8) | When a real project needs it |

## User-loaded geometry track (ADR-019)

Not urgent. U1: load a packaged dataset from file (FR-L1…L4). U2: offline converter from common formats (FR-L5). U3: in-app material/frame authoring (FR-L6). U1 can start after G1.

## Conditional tracks (unlocked by triggers, any time after Phase 1)

| Track | Unlocked by | Content |
|---|---|---|
| Server backend | T1 shared plans, T2 scan scale, T3 routine Geant4, T4 access control | Small backend: storage + job queue; workers reuse the core (FR-P3, FR-S6, FR-G3) |
| WebAssembly tracer | Phase 4 measurements still insufficient | Rust/C++ → WASM; must pass conformance rays/points (ADR-005 step 4) |
| Access control | OQ-1 answer | Authenticated hosting (FR-A1) |
| Desktop distribution | A real offline or installer need (OQ-9) | PWA first (FR-W1); thin Tauri wrapper when an installer is needed (FR-W2, W3); plans move between web and desktop by export/import (FR-W4); never a fork of the app (ADR-024) |

## Deferred

- Preview performance extensions are paused and are not a driver for the main architecture refactor.

## Change log

- 2026-10-12: Phase 2 now covers the coverage highlight (FR-M10) and its GPU budget (FR-N5); FR-H11, FR-B2, FR-W4 and standing rules referenced.
- 2026-10-12: Anomaly hypotheses placed as Phase 3 (OQ-10); scanning and later phases renumbered 4–8.
- 2026-10-12: Renamed "deficiency" to "anomaly".
- 2026-10-12: Proposed anomaly-hypothesis phase (ADR-025), placement pending OQ-10.
- 2026-10-12: Evidence-driven generalisation noted; G2/G3 start with a kind profile.
- 2026-10-10: Desktop distribution added as a conditional track.
- 2026-10-10: "Where we are" updated (compiled default, `datasets/`, English docs); default-switch item replaced by FR-B1.
- 2026-10-10: Multi-station overview and demonstration moved ahead of scanning as Phase 2 (owner decision, OQ-7); later phases renumbered 3–7.
- 2026-10-10: Phase 4 extended to multi-station overview/demonstration/coverage; new Phase 5 simulated reconstruction; physics validation renumbered to Phase 6.
- 2026-10-10: Added subject-neutral principle, generalisation track (G0–G3) and user-loaded geometry track (U1–U3).
- 2026-10-10: Moved from `docs/planning/` to `docs/` top level; links updated to `specs/` and `guides/`.
- 2026-10-10: Merged former `docs/ROADMAP.md` (milestones, follow-up features, validation boundaries) and the dependency order from `GEOMETRY_SPEC_REFACTOR.md` §6; added "Where we are", Phase 5 scope, geometry parallel track and Deferred.
- 2026-10-10: Initial roadmap from review discussion.
