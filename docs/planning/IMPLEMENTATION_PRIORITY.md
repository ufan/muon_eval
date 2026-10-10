# Implementation Priority

Ordered work queue. Top items first; each item references its requirement (FR) or decision (ADR). Statuses: **Todo**, **In progress**, **Done**, **Blocked**. Per `AGENTS.md`, one feature or explainable refactor per commit, and physics-formula, geometry or data-format changes are labelled in the commit message.

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Feature requirements](FEATURE_REQUIREMENTS.md) · [Roadmap](ROADMAP.md)

Last updated: 2026-10-10

---

## P0 — Result correctness (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 1 | Make flux integration history-independent | FR-C1 | Physics-model revision; bump `RESPONSE_MODEL_VERSION`; update frozen baseline tests and `CALCULATION_MODELS.md` §6 | Todo |
| 2 | Record the legacy 500 m ray cutoff in exports; fix limitation text | FR-C2, FR-C5 | `legacy-pattern-adapter.js`, `legacy-geometry-adapter.js` | Todo |
| 3 | Decide the cos θ projected-area factor | FR-C3 | Needs owner decision; then fix as model revision or document | Blocked (decision) |
| 4 | Remove dead work in `quickMetrics()` | FR-C4 | Keep only `center` and `dirDoc` | Todo |

## P1 — Tooling and hygiene (Phase 0)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 5 | `package.json` with `npm test` | FR-Q1 | Glob `tests/*.test.mjs` plus fast checks | Todo |
| 6 | Prettier reformat (behaviour-free commit) | FR-Q2 | Separate commit, no logic changes | Todo |
| 7 | `@ts-check` + JSDoc + `tsc --noEmit` on pure modules; branded point/direction/frame types | FR-Q3, ADR-003 | Start with `coordinates.js`, `detector-pose.js`, tracers | Todo |
| 8 | Small fixes: `textContent` for names, azimuth wrap, remove stale `dist/data/dam_spec*.json`, document dev dependencies | FR-Q4…Q7 | Can be one commit each | Todo |
| 9 | Bounded module-dependency audit | `../ROADMAP.md` | Existing next milestone; lock import boundaries with tests | Todo |

## P2 — Plans and server seams (Phase 1)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 10 | Plan / scan / result schemas with versions and migrations | FR-P1, FR-P2, ADR-006 | Becomes the future API contract | Todo |
| 11 | Async, cancellable assessment port | ADR-006 | Change limited to `assessment-controller.js` | Todo |
| 12 | Headless batch runner (Node CLI) | FR-S5, ADR-006 | Plan in, results out; future server worker | Todo |

## P3 — Scan performance and features (Phase 2)

| # | Item | Ref | Notes | Status |
|---|---|---|---|---|
| 13 | Benchmark script tracking rays/s and pose time | FR-S4 | Baseline 2026-10-09: ~10.6k rays/s/core, 0.44 s per 65×65 pose | Todo |
| 14 | Direction-map reuse per station/scenario + coarse-to-fine | ADR-005 step 1 | Validate against direct tracing | Todo |
| 15 | JS tracer optimisation (top-level BVH, flat arrays, no per-ray allocation) | ADR-005 step 2 | Must pass conformance rays/points | Todo |
| 16 | Worker-parallel scans (Node + browser) | ADR-005 step 3 | | Todo |
| 17 | Scan constraints, ranking, robustness | FR-S1…S3 | | Todo |

## Later (Phases 3–5 and conditional tracks)

| Item | Ref | Gate |
|---|---|---|
| Plan/scan screens with Vite + Preact/Svelte | ADR-004 | After P2 formats exist |
| Multi-station evaluation, reports | FR-M1, FR-M2 | Phase 4 |
| Geant4 job package export / result import | FR-G1, FR-G2, ADR-007 | Phase 5 |
| WebAssembly tracer | ADR-005 step 4 | Only if P3 measurements insufficient |
| Server backend | ADR-001 | Only when T1–T4 observed |
| Access control | FR-A1 | Answer to OQ-1 |

## Change log

- 2026-10-10: Initial priority list from review discussion.
