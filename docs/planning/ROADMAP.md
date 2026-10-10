# Roadmap (Big Direction)

The direction of the platform in phases. Each phase states its goal and exit criteria; ordering of individual tasks lives in [Implementation priority](IMPLEMENTATION_PRIORITY.md). This file replaces the former `docs/ROADMAP.md` (ADR-015).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md)

Last updated: 2026-10-10

---

## Guiding principles

- A rapid evaluation and comparison tool; never construction-grade, safety-certification or approval conclusions.
- Offline static app; no large framework or plugin system without proven need; one calculation core shared by every consumer (ADR-001, ADR-002, ADR-012).
- Correctness and reproducibility before features; tests before extracting pure modules; measure before optimising (ADR-005).
- Abstractions are validated by a second real dam dataset, not by guesses (ADR-008).
- Server, WebAssembly and Geant4 automation are conditional, unlocked only by observed triggers.

## Where we are

The foundation dependency chain (ADR-008/011) is largely in place:

```text
data contract + coordinate adapters → pure geometry query interfaces
  → compiled runtime + shared display buffers → main-app calculation/state integration
  → scans and on-demand parallelism   ← next
```

- Dataset registry, release IDs, checksum-verified loading; v0.7.0 release with compiled GLB/BVH backend.
- Main app runs legacy DDA by default, compiled backend explicitly for frozen scenarios; shared response core.
- Calculation, state, scheduling and views separated into modules; numeric pattern layers and finite-model references in the preview.
- Not done: continuous water on compiled geometry, physical-domain certification, entity-level ROI on compiled, full plan save/load, scans.

## Phase 0 — Trustworthy results and basic tooling

**Goal:** results are deterministic, traceable and documented; the codebase is checkable and its module boundaries are enforced.
**Covers:** FR-C1…C5, FR-Q1…Q8.
**Exit:** history-independent results; ray length recorded in all exports; acceptance factor decided; `npm test` runs everything; formatted source; type checking on pure modules; module-dependency audit locked by tests.

## Phase 1 — Plans as first-class, versioned data

**Goal:** a complete deployment plan can be saved, loaded, shared as a file and migrated across versions.
**Covers:** FR-P1, FR-P2; ADR-006 seams (schemas, async cancellable assessment port).
**Exit:** round-trip plan tests; plan/scan/result schemas stable enough to serve as a future API contract.

## Phase 2 — Workstation-scale scanning

**Goal:** large station/pose scans with constraints, ranking and robustness on one workstation.
**Covers:** FR-S1…S5; ADR-005 steps 1–3.
**Exit:** headless batch runner; reference scan in minutes; feasibility, observability and safety reported as separate dimensions.

## Phase 3 — New planning and scan screens

**Goal:** usable UI for plans, scans and comparisons.
**Covers:** ADR-004 (Vite + small framework introduced here, old page migrated gradually); FR-N1…N4.
**Exit:** plan and scan screens built on the Phase 1–2 formats; hosting/Docker/docs updated for the build step.

## Phase 4 — Multi-station evaluation and reports

**Goal:** evaluate plans as sets of stations and produce shareable reports.
**Covers:** FR-M1, FR-M2.

## Phase 5 — Physics validation

**Goal:** know how accurate the fast model is.
**Covers:** FR-V2…V11, FR-G1, FR-G2 (Geant4 export package and result import), FR-X1…X3.

## Parallel track — Geometry and scene fidelity

Can advance alongside Phases 1–4 when data or evidence becomes available.

- Unified continuous-water / frozen-scenario scene resolution (FR-E1).
- Physical-domain and interface certification, aggregate entity attribution (FR-GE4), then compiled entity ROI (FR-M3).
- Geometry debt: single cavity implementation, spillway rules into spec, complete terrain, contour quality (FR-GE1…GE3, GE5).
- Second real dam dataset (FR-D9) and the pending contract specs in FR-D2, D3, D5, D7.
- Default backend switch decision (OQ-3, ADR-011).

## Conditional tracks (unlocked by triggers, any time after Phase 1)

| Track | Unlocked by | Content |
|---|---|---|
| Server backend | T1 shared plans, T2 scan scale, T3 routine Geant4, T4 access control | Small backend: storage + job queue; workers reuse the core (FR-P3, FR-S6, FR-G3) |
| WebAssembly tracer | Phase 2 measurements still insufficient | Rust/C++ → WASM; must pass conformance rays/points (ADR-005 step 4) |
| Access control | OQ-1 answer | Authenticated hosting (FR-A1) |

## Deferred

- Preview performance extensions are paused and are not a driver for the main architecture refactor.

## Change log

- 2026-10-10: Merged former `docs/ROADMAP.md` (milestones, follow-up features, validation boundaries) and the dependency order from `GEOMETRY_SPEC_REFACTOR.md` §6; added "Where we are", Phase 5 scope, geometry parallel track and Deferred.
- 2026-10-10: Initial roadmap from review discussion.
