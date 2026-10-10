# Roadmap (Big Direction)

The direction of the platform in phases. Each phase states its goal and exit criteria; ordering of individual tasks lives in [Implementation priority](IMPLEMENTATION_PRIORITY.md). Detailed open items and validation boundaries (Chinese) remain in [`../ROADMAP.md`](../ROADMAP.md).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md)

Last updated: 2026-10-10

---

## Guiding principles

- A rapid evaluation and comparison tool, not construction-grade or safety-certification output.
- Offline static app; one calculation core shared by every consumer (ADR-001, ADR-002).
- Correctness and reproducibility before features; measure before optimising (ADR-005).
- Abstractions are validated by a second real dam dataset, not by guesses.
- Server, WebAssembly and Geant4 automation are conditional, unlocked only by observed triggers.

## Phase 0 — Trustworthy results and basic tooling

**Goal:** results are deterministic, traceable and documented; the codebase is checkable.
**Covers:** FR-C1…C5, FR-Q1…Q7.
**Exit:** history-independent results; ray length recorded in all exports; acceptance factor decided; `npm test` runs everything; formatted source; type checking on pure modules.

## Phase 1 — Plans as first-class, versioned data

**Goal:** a complete deployment plan can be saved, loaded, shared as a file and migrated across versions.
**Covers:** FR-P1, FR-P2; ADR-006 seams (schemas, async cancellable assessment port).
**Exit:** round-trip plan tests; the plan/scan/result schemas are stable enough to serve as a future API contract.

## Phase 2 — Workstation-scale scanning

**Goal:** large station/pose scans with ranking and robustness on one workstation.
**Covers:** FR-S1…S5; ADR-005 steps 1–3.
**Exit:** headless batch runner; reference scan in minutes; constraints and robustness reported as separate dimensions.

## Phase 3 — New planning and scan screens

**Goal:** usable UI for plans, scans and comparisons.
**Covers:** ADR-004 (Vite + small framework introduced here, old page migrated gradually).
**Exit:** plan and scan screens built on the Phase 1–2 formats; hosting/Docker/docs updated for the build step.

## Phase 4 — Multi-station evaluation and reports

**Goal:** evaluate plans as sets of stations and produce shareable reports.
**Covers:** FR-M1, FR-M2.

## Phase 5 — Physics validation with Geant4

**Goal:** cross-check the fast model against full transport for shortlisted sites.
**Covers:** FR-G1, FR-G2 (export package and result import).

## Conditional tracks (unlocked by triggers, any time after Phase 1)

| Track | Unlocked by | Content |
|---|---|---|
| Server backend | T1 shared plans, T2 scan scale, T3 routine Geant4, T4 access control | Small backend: storage + job queue; workers reuse the core (FR-P3, FR-S6, FR-G3) |
| WebAssembly tracer | Phase 2 measurements still insufficient | Rust/C++ → WASM; must pass conformance rays/points (ADR-005 step 4) |
| Access control | OQ-1 answer | Authenticated hosting (FR-A1) |

## Continuous

- Second real dam dataset to validate dataset/adapter abstractions.
- Bounded module-dependency audit (current next milestone in [`../ROADMAP.md`](../ROADMAP.md)).

## Change log

- 2026-10-10: Initial roadmap from review discussion.
