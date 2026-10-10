# Architecture Decisions

Decision log for the platform's architecture. Each entry records the context, the decision, its status and what would make us revisit it. Statuses: **Accepted** (agreed or already in force), **Proposed** (recommended, not yet confirmed), **Superseded**, **Open** (needs a decision).

This file holds *why and what we decided*. How the code currently works is described in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and the other reference docs (see ADR-015).

Related: [Feature requirements](FEATURE_REQUIREMENTS.md) · [Roadmap](ROADMAP.md) · [Implementation priority](IMPLEMENTATION_PRIORITY.md)

Last updated: 2026-10-10

| ADR | Title | Status |
|---|---|---|
| 001 | Stay an offline static app; no backend for now | Accepted |
| 002 | Calculation core stays framework-free and runs in browser and Node | Accepted |
| 003 | Static type checking without a build step first | Proposed |
| 004 | Build step and UI framework arrive with the first new screen | Proposed |
| 005 | Performance strategy: algorithm first, native code last | Proposed |
| 006 | Prepare server seams now, build no server code | Proposed |
| 007 | Geant4 runs as an external job, not inside the app | Proposed |
| 008 | Dams are explicit, versioned data products | Accepted |
| 009 | Format responsibilities | Accepted |
| 010 | Hybrid geometry/ray kernel | Accepted |
| 011 | Backend switching is an explicit migration | Accepted |
| 012 | Refactoring principles | Accepted |
| 013 | Native ES modules in `dist/`, no build step (current) | Accepted (to be superseded by 004) |
| 014 | Structural reference lines: material-qualified mesh contours | Accepted |
| 015 | Documentation structure: planning set + reference docs | Proposed |

---

## ADR-001 Stay an offline static app; no backend for now

**Status:** Accepted

**Context.** All computation runs in one browser. The app is served as a static folder (`dist/`) through local HTTP, Docker/nginx or static hosting. `AGENTS.md` requires offline operation without runtime CDN or external services.

**Decision.** Do not build a server or a React-plus-backend stack yet. Add a backend only when one of these triggers is actually observed:

| Trigger | Signal to watch | Cheaper step to try first |
|---|---|---|
| T1 Shared plans across a team | "Which file is current?" confusion; need for concurrent editing, permissions, sign-off/audit trail | Versioned plan JSON (schema version + full dataset release ID) kept in git or a shared folder |
| T2 Scans too big for one PC | Scans regularly don't finish overnight on a good workstation; several people need big scans at once; results must be shared, not recomputed | Headless Node batch runner on a workstation, using all cores (ADR-005, ADR-006) |
| T3 Geant4 runs | Geant4 validation becomes routine (e.g. per shortlisted site) rather than occasional | "Export Geant4 job package" + manual cluster run + result import (ADR-007) |
| T4 Access control (candidate) | Dam geometry judged sensitive by its owner | Authenticated hosting; may force a server earlier than T1–T3 (OQ-1) |

**If a backend is built:** keep it small (file/object storage + job queue, possibly a small database for plans/users). Workers run the same calculation modules. The browser app stays usable offline for single-person, single-site work.

## ADR-002 Calculation core stays framework-free and runs in browser and Node

**Status:** Accepted

**Context.** Calculation modules (`dist/modules/*` such as `muon-response.js`, `detector-projection.js`, `dda-ray-tracer.js`, `triangle-bvh.js`, `compiled-assessment.js`) have no DOM or Three.js dependency and already run under `node --test` and `scripts/`.

**Decision.** Keep the calculation core as plain modules with no UI framework or rendering dependency. Every consumer (single-point evaluation, scans, ranking, comparison, export, batch runner, any future server worker) uses this one core; no second copy of formulas in another language or layer. Rendering is never a source of geometric truth.

## ADR-003 Static type checking without a build step first

**Status:** Proposed

**Context.** An external review suggested Vite + TypeScript first to catch unit and point-versus-direction mistakes. In practice the frame mix-ups that matter here (document vs model coordinates with x/y swap; `{x,y,z}` legacy vs `[x,y,z]` compiled) are only caught by deliberately branded types. The known result-changing issues (flux cache, ray cutoff, acceptance factor) are not type errors and need physics tests.

**Decision.**
- Add `// @ts-check` + JSDoc types to the pure calculation modules and run `tsc --noEmit --checkJs` in tests. `dist/` remains the runnable source (ADR-013).
- Introduce branded types for `ModelPoint`, `DocPoint`, `Direction` (and frame tags). Do not brand physical units (metres, m.w.e.) unless a concrete bug justifies it.
- Reformat the dense one-line source with Prettier in a separate, behaviour-free commit.

**Revisit when:** a build step is adopted (ADR-004); converting to `.ts` then becomes cheap.

## ADR-004 Build step and UI framework arrive with the first new screen

**Status:** Proposed

**Decision.**
- Adopt Vite plus a small UI framework (Preact or Svelte; OQ-2) when building the first new plan or scan screen, not before.
- Use the framework for new form/list/table screens only. The 3D scene and projection canvas stay framework-free. The old page is migrated piece by piece.
- Framework state must not own calculation inputs or results; the existing deployment state and assessment controller remain the source. UI state (e.g. sidebar expansion) never enters scientific result files.
- The switch supersedes ADR-013: source moves to `src/` with a built static output. In the same change, update hosting binding (`.openai/hosting.json`), Docker/nginx, `serve.ps1`, `AGENTS.md` checks (`node --check dist/app.js`) and README.

## ADR-005 Performance strategy: algorithm first, native code last

**Status:** Proposed (refines ADR-010's "WebAssembly only after benchmarks")

**Context (measured 2026-10-09, one Node core, compiled backend, mid scenario, 25 physical components, ~130k triangles).**

| Measure | Value |
|---|---|
| Ray tracing | ~10,600 rays/s (~5 material segments/ray) |
| Uncached flux integral | ~74,000/s (not the bottleneck) |
| Scenario load + BVH build | 0.54 s |
| One 65×65 pose / one 25×25 pose | 0.44 s / 0.13 s |

A robustness-scale scan (~200k poses at 65×65 ≈ 850M rays) is ~22 h on one core.

**Decision.** Apply gains in this order and measure after each:
1. Algorithm: per-station, per-scenario direction map (e.g. 0.5° hemisphere grid, ~130k rays) reused across all poses at that station; coarse-to-fine search (25×25 scan, 65×65 refine of the best). Position perturbations invalidate the map.
2. JS tracer optimisation: single top-level BVH instead of 25 per-component traversals, flat typed-array nodes, no per-ray allocations/sorts/`JSON.stringify`.
3. Parallelism: Worker threads (Node) / Web Workers (browser).
4. Only if still needed: Rust or C++ compiled to WebAssembly, so the same binary runs in browser and server. A Node-only native addon (Embree) or GPU compute only at much larger scale.

Any replacement tracer must pass the existing `conformance_rays.json` / `conformance_points.json` checks before being trusted.

## ADR-006 Prepare server seams now, build no server code

**Status:** Proposed

**Context.** Already server-friendly: framework-free core runnable in Node; `createSession(input)` takes a detached snapshot; versioned JSON results with identity/model version; SHA-256-verified dataset releases; message-passing Workers; `main-page.js` takes `storage` as a parameter.

**Decision.** Close these gaps before any server work, since each is cheap now and expensive later:
1. Plan / scan / result schemas, versioned with migrations; they become the future API contract.
2. Asynchronous, cancellable assessment port (Promise + AbortSignal, as `evaluateCompiledAssessment` already does); only `assessment-controller.js` changes.
3. Deterministic calculation: no result may depend on evaluation history (FR-C1).
4. Traceable results for every backend: legacy results need equivalent identity and must record the actual ray cutoff, or server scans are compiled-backend only.
5. Headless batch runner (Node CLI: plan in, results out) that later becomes the server worker unchanged.
6. Server language: Node reusing the same modules. If Python is preferred for orchestration, it calls Node/WebAssembly workers; formulas are never reimplemented.

## ADR-007 Geant4 runs as an external job, not inside the app

**Status:** Proposed

**Decision.** The app exports a Geant4 job package (geometry as GDML per ADR-009, detector, pose, macro, physics list, seed, manifest with dataset hash and model version). Runs happen externally (cluster). The app imports result JSON linked to the exact inputs. Detector sensitive layers, segmentation, readout and alignment are assembled independently of the dam geometry; cross-validate with material budgets and simulation output. Geant4 results never widen the fast model's scientific claims. Automate with a job queue only when T3 is met.

## ADR-008 Dams are explicit, versioned data products

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §1, §4)

**Decision.**
- Each dam is loaded as an explicit, versioned dataset. The UI does not simultaneously interpret the source spec, run CSG, stitch terrain, build display meshes, classify materials and intersect rays. Generic code never hard-codes a dam's dimensions, section count or survey coordinates.
- Authoring inputs handle manual maintenance and parameter derivation. The published canonical JSON is the immutable, versioned geometry and semantics source. A normalized Geometry IR and every backend artifact bind to the same source version, scenario and coordinate convention, and are verified with shared control points and reference rays. A proposed backend is never described as an integrated capability.
- Target module flow:

```text
dataset registry → dataset loader (schema/version/checksum validation)
  → normalized Geometry IR (coordinates/transforms, material/priority model,
     entity/component index, scenario-resolved volumes, provenance/uncertainty)
  → backends: mesh/render · fast ray · GDML · DD4hep
```

- Higher-level generic interfaces are introduced only after a second real dam dataset proves the shared pattern; no speculative framework or plugin system.

Requirements derived from this decision are FR-D1…D9.

## ADR-009 Format responsibilities

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §3)

| Layer | Format | Responsibility |
|---|---|---|
| Authoring | `build_spec.py`, survey/CAD/DEM inputs | Parameter derivation, provenance, manual maintenance |
| Canonical release | `dam_spec.json` + schema | Engineering geometry, semantics, state, provenance, unknowns |
| Geometry IR | Versioned intermediate model | Normalized coordinates, resolved instances, material priority, component mapping |
| Web runtime | GLB + terrain f32 + runtime manifest | Display, picking, fast material queries and rays |
| Geant4 exchange | GDML | Material-geometry snapshot of a frozen scenario |
| DD4hep assembly | Compact XML + constructor | Detector, readout, sensitive layers, conditions, DDG4 assembly |
| BIM/GIS exchange | IFC, CityJSON, GeoPackage, … | Exchange with engineering and GIS tools; never the calculation truth |

DD4hep XML does not replace the strict JSON contract: Compact XML has no fixed schema and its semantics depend on the detector constructor. It suits simulation assembly, not storing dam provenance, unknowns and engineering assertions. The browser does not reimplement the full CSG of `compile_spec.py`; the short-term parametric interpreter is a migration compatibility layer only.

## ADR-010 Hybrid geometry/ray kernel

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §5)

**Decision.**
- Terrain: regular height field, bilinear sampling, 2D grid / DDA traversal.
- Complex dam bodies: compiled closed triangle meshes + BVH.
- Simple detectors and regular solids: analytic intersection.
- Material overlaps are resolved by the compiler via priority, not by running full CSG inside the ray loop.
- Batch projection in Web Workers; WebAssembly evaluated only after data scale proves a bottleneck (ordering detailed in ADR-005).
- WebGL/WebGPU stays responsible for rendering; it takes on computation only if large-scale batch-ray benchmarks prove it worthwhile.
- C++/WASM is not the first step: establish a pure-JS conformance baseline, profiling and backend interfaces first. Unity/Unreal are not suitable as geometry truth or calculation core; they could later be an extra Geometry IR consumer for immersive demos.

## ADR-011 Backend switching is an explicit migration

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §6 and `ARCHITECTURE.md` "显式主应用后端选择")

**Decision.**
- The main app resolves a full release ID, backend and scenario explicitly; unknown or incompatible combinations fail closed and never fall back to another backend or scenario.
- Changing the default backend is an explicit migration: dataset, device semantics, environment, ROI, rays and response are validated separately before the default entry changes. A working standalone preview never replaces the production backend automatically. (Whether and when to switch the default: OQ-3.)
- Frozen scenarios and continuous environment resolution are different capabilities; finite snapshots must never be interpolated to fake continuous-water material geometry.
- Source geometry, visuals, material classification and rays express the same facts. Camera transforms, visibility, normals, colours and display smoothing never change material paths.
- Result snapshots bind the full effective input; asynchronous cancellation, caches and UI updates never let a stale result overwrite newer state.

## ADR-012 Refactoring principles

**Status:** Accepted (migrated from `ARCHITECTURE.md` "重构原则")

- Extract pure functions first without changing UI or numerical results.
- Build regression tests before merging visual geometry with calculation geometry.
- `dam_spec.json` stays independent, versioned, and consumable by both the browser and Geant4.
- Scans call the same calculation core as single-station evaluation; no duplicate algorithm.
- Long tasks support cancellation, progress and caching; prefer Web Workers to avoid blocking the UI.
- UI state is separate from engineering plan state; sidebar expansion and similar never enter scientific result files.

## ADR-013 Native ES modules in `dist/`, no build step (current)

**Status:** Accepted, current practice; planned to be superseded by ADR-004 (migrated from `ARCHITECTURE.md` "主应用源码入口")

**Decision.** Native ES modules live directly in `dist/modules`; there is no separate `src/` mirror and no build step. The module ownership table in `../ARCHITECTURE.md` defines which module owns what and which dependencies are forbidden; `tests/main-architecture.test.mjs` enforces it.

## ADR-014 Structural reference lines: material-qualified mesh contours

**Status:** Accepted (summary; full decision and evidence in [`../GEOMETRY_REFERENCES.md`](../GEOMETRY_REFERENCES.md#reference-semantics-and-library-choice))

**Decision.** Use material-qualified perspective apparent contours plus separately labelled feature creases and verified patch-boundary references, projected through material into detector-local slope space. Reuse the established mesh-edge/co-face-normal method by adapting the small relevant part of pinned `vtkPolyDataSilhouette` 9.5.2 (BSD-3-Clause notices retained) into a renderer-independent module; native VTK remains the numerical reference. Do not invent a new silhouette algorithm or substitute depth jumps for geometry. Candidate curves are not interfaces until qualified by dataset semantics and shared material classification. Manifold CSG is a development-time tool only, not a browser dependency. Finite-model references are explicitly not certified physical interfaces (FR-GE4).

## ADR-015 Documentation structure: planning set + reference docs

**Status:** Proposed

**Context.** Planning content (decisions, open work, priorities) was spread across `ROADMAP.md`, `GEOMETRY_SPEC_REFACTOR.md`, `ARCHITECTURE.md`, `CONTEXT.md` and checklists inside reference docs.

**Decision.**
- **Planning set** (`docs/planning/`, maintained as decisions change): architecture decisions, feature requirements, roadmap, implementation priority. All open work, decisions and priorities live only here.
- **Reference docs** describe the current implementation and contracts and are updated with the code: `ARCHITECTURE.md` (current modules), `CALCULATION_MODELS.md`, `GEOMETRY_AND_COORDINATES.md`, `GEOMETRY_REFERENCES.md`, `PROJECTION_DATA.md`, `PROJECTION_WORKFLOW.md`, `PROJECTION_VALIDATION.md`. They contain no task lists; they link to the planning set for open items.
- **Project entry docs** stay at the root: `AGENTS.md` (rules), `CONTEXT.md` (domain glossary and semantics), `README.md` (usage). Operational: `MIGRATION_CHECKLIST.md`, `部署说明.md`.

**Migration status:**

| Original | Status |
|---|---|
| `docs/ROADMAP.md` | Fully merged into roadmap, priority and requirements; removed |
| `docs/GEOMETRY_SPEC_REFACTOR.md` | Fully merged into ADR-008…011 and FR-D, FR-V; removed |
| `docs/ARCHITECTURE.md` | Decisions moved (ADR-011…013); current-state description stays |
| `CONTEXT.md` §9 checklist | Moved to requirements; glossary stays |
| `docs/CALCULATION_MODELS.md` §18 checklist | Moved to FR-V; formulas and §16 uncertainties stay |
| `docs/GEOMETRY_AND_COORDINATES.md` §6 risks | Moved to FR-GE; coordinate rules stay |
| `docs/GEOMETRY_REFERENCES.md` §1 decision | Summarised in ADR-014; detail stays |
| `docs/PROJECTION_VALIDATION.md` budgets | Referenced by FR-N1; detail stays |
| `docs/PROJECTION_DATA.md`, `PROJECTION_WORKFLOW.md` | Reference only; links updated |
| `docs/MIGRATION_CHECKLIST.md` | Operational, unchanged |

**Open:** language. Planning set is English; reference docs are Chinese and English mixed (OQ-4).

---

## Open questions

- **OQ-1 Sensitivity of dam geometry.** The current public instance serves full geometry to anyone with the URL. Confirm with the data owner whether access control is required; if so, T4 applies.
- **OQ-2 UI framework choice** (Preact vs Svelte), decided when ADR-004 starts.
- **OQ-3 Default backend switch.** Whether and when the main app's default moves from legacy DDA to the compiled backend, and the acceptance evidence required (ADR-011).
- **OQ-4 Documentation language.** One language for all docs, or English planning set with Chinese reference docs.

## Change log

- 2026-10-10: Merged decisions from `GEOMETRY_SPEC_REFACTOR.md`, `ARCHITECTURE.md` and `GEOMETRY_REFERENCES.md` (ADR-008…014); added ADR-015 and OQ-3, OQ-4.
- 2026-10-10: Initial log from review discussion (ADR-001…007, OQ-1…2).
