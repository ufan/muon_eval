# Implementation Priority

Ordered work queue. Top items first; each item references its requirement (FR) or decision (ADR). Statuses: **Todo**, **In progress**, **Done**, **Blocked**. Per `AGENTS.md`, one feature or explainable refactor per commit, and physics-formula, geometry or data-format changes are labelled in the commit message.

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md) · [Roadmap](ROADMAP.md)

Last updated: 2026-10-10

---

## P0 — Result correctness (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 1 | Make flux integration history-independent | FR-C1 | Physics-model revision; bump `RESPONSE_MODEL_VERSION`; update frozen baseline tests and `specs/CALCULATION_MODEL.md` §2/§9 | Todo |
| 2 | Record the legacy 500 m ray cutoff in exports; fix limitation text | FR-C2, FR-C5 | `legacy-pattern-adapter.js`, `legacy-geometry-adapter.js` | Todo |
| 3 | Decide the cos θ projected-area factor | FR-C3 | Needs owner decision; then fix as model revision or document | Blocked (decision) |
| 4 | Remove dead work in `quickMetrics()` | FR-C4 | Keep only `center` and `dirDoc` | Todo |

## P1 — Tooling, hygiene and boundaries (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 5 | `package.json` with `npm test` | FR-Q1 | Glob `tests/*.test.mjs` plus fast checks | Todo |
| 6 | Bounded module-dependency audit | FR-Q8 | Was "next priority" in the former `docs/ROADMAP.md`; no projection or performance features in this item | Todo |
| 7 | Prettier reformat (behaviour-free commit) | FR-Q2 | Separate commit, no logic changes | Todo |
| 8 | `@ts-check` + JSDoc + `tsc --noEmit` on pure modules; branded point/direction/frame types | FR-Q3, ADR-003 | Start with `coordinates.js`, `detector-pose.js`, tracers | Todo |
| 9 | Small fixes: `textContent` for names, azimuth wrap, remove stale `dist/data/dam_spec*.json`, document dev dependencies | FR-Q4…Q7 | One commit each | Todo |
| 10 | Formal `sx`/`sy` and detector-frame definition | FR-X1 | Documentation only; prerequisite for plan schema | Todo |

## P2 — Plans and server seams (Phase 1)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 11 | Plan / scan / result schemas with versions and migrations | FR-P1, FR-P2, ADR-006 | Becomes the future API contract | Todo |
| 12 | Async, cancellable assessment port | ADR-006 | Change limited to `assessment-controller.js` | Todo |
| 13 | Headless batch runner (Node CLI) | FR-S5, ADR-006 | Plan in, results out; future server worker | Todo |

## P3 — Scan performance and features (Phase 2)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 14 | Benchmark script tracking rays/s and pose time | FR-S4 | Baseline 2026-10-09: ~10.6k rays/s/core, 0.44 s per 65×65 pose | Todo |
| 15 | Direction-map reuse per station/scenario + coarse-to-fine | ADR-005 step 1 | Validate against direct tracing | Todo |
| 16 | JS tracer optimisation (top-level BVH, flat arrays, no per-ray allocation) | ADR-005 step 2 | Must pass conformance rays/points | Todo |
| 17 | Worker-parallel scans (Node + browser) | ADR-005 step 3 | | Todo |
| 18 | Scan constraints, ranking, robustness | FR-S1…S3 | Write metric/ranking definitions first | Todo |

## Pending browser regressions (fit in when touching the preview)

| Item | Ref | Status |
|---|---|---|
| Preview chunked-transfer browser regression incl. failed narrow-screen overlay check | FR-N2 | Todo |
| Cold start, peak memory, worst-case interaction measurements | FR-N3 | Todo |

## Later (Phases 3–5, parallel and conditional tracks)

| Item | Ref | Gate |
|---|---|---|
| Plan/scan screens with Vite + Preact/Svelte | ADR-004 | After P2 formats exist |
| Multi-station evaluation, reports | FR-M1, FR-M2 | Phase 4 |
| Physics validation items | FR-V2…V11 | Phase 5 |
| Geant4 job package export / result import | FR-G1, FR-G2, ADR-007 | Phase 5 |
| Continuous-water scene resolution | FR-E1 | Geometry track |
| Physical-domain certification, entity attribution, compiled ROI | FR-GE4, FR-M3 | Geometry track; needs data evidence |
| Geometry debt (cavity, spillway rules, terrain, contours) | FR-GE1…GE3, GE5 | Geometry track |
| Second dam dataset | FR-D9 | When data is available |
| Default backend switch | OQ-3 | Decision first |
| WebAssembly tracer | ADR-005 step 4 | Only if P3 measurements insufficient |
| Server backend | ADR-001 | Only when T1–T4 observed |
| Access control | FR-A1 | Answer to OQ-1 |
| Preview performance extensions | Roadmap "Deferred" | Paused |

## Change log

- 2026-10-10: Moved from `docs/planning/` to `docs/` top level; links updated to `specs/` and `guides/`.
- 2026-10-10: Merged former `docs/ROADMAP.md`: dependency audit (#6), browser regressions, geometry-track and deferred items; added #10 (FR-X1); renumbered.
- 2026-10-10: Initial priority list from review discussion.
