# Architecture Decisions

Decision log for the platform's architecture. Each entry records the context, the decision, its status and what would make us revisit it. Statuses: **Accepted** (agreed or already in force), **Proposed** (recommended, not yet confirmed), **Superseded**, **Open** (needs a decision).

This file holds *why and what we decided*. How the code currently works is specified in [`specs/`](specs/README.md) (see ADR-015).

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
| 011 | Backend switching is an explicit migration; compiled is the default | Accepted |
| 012 | Refactoring principles | Accepted |
| 013 | Native ES modules in `dist/`, no build step (current) | Accepted (to be superseded by 004) |
| 014 | Structural reference lines: material-qualified mesh contours | Accepted |
| 015 | Documentation structure: guidelines on top, specs and guides below; English only | Accepted |
| 016 | Subject-neutral evaluation platform | Accepted (direction) |
| 017 | Compiled geometry package is the generic runtime contract | Proposed |
| 018 | Datasets move to a top-level `datasets/` directory | Accepted, implemented |
| 019 | User-loaded geometry in stages, client-side first | Proposed |
| 020 | Multi-station view composes per-station results | Accepted (priority) / Proposed (design) |
| 021 | Simulated multi-projection reconstruction as a separate pipeline | Proposed |
| 022 | A living domain model separate from the glossary | Accepted |
| 023 | Layered, lightweight test-driven development | Accepted |

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
| T4 Access control (candidate) | Subject geometry judged sensitive by its owner. Zhouning: not sensitive now (OQ-1, 2026-10-10); re-check for each new dataset | Authenticated hosting; may force a server earlier than T1–T3 |

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
- The switch supersedes ADR-013: source moves to `src/` with a built static output. In the same change, update hosting binding (`.openai/hosting.json`), Docker/nginx, `AGENTS.md` checks (`node --check dist/app.js`) and README.

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

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §1, §4); generalised from dams to any imaging subject by ADR-016

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

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §6 and `ARCHITECTURE.md` "explicit main-app backend selection")

**Decision.**
- The main app resolves a full release ID, backend and scenario explicitly; unknown or incompatible combinations fail closed and never fall back to another backend or scenario.
- Changing the default backend is an explicit migration: dataset, device semantics, environment, ROI, rays and response are validated separately before the default entry changes. A working standalone preview never replaces the production backend automatically.
- **Default switched to compiled (OQ-3, owner decision 2026-10-10).** The registry default is the v0.7 release on the compiled GLB/BVH backend; the legacy DDA release stays selectable as a compatibility path. Validation: full test suite and browser acceptance of both apps. Accepted gaps on the default path, tracked as FR-B1: continuous water level (FR-E1), legacy target contours/significance and entity ROI (FR-M3, FR-GE4), coloured internal proxies and the flux cloud. New work targets the compiled path; legacy-only fixes are lower priority.
- Frozen scenarios and continuous environment resolution are different capabilities; finite snapshots must never be interpolated to fake continuous-water material geometry.
- Source geometry, visuals, material classification and rays express the same facts. Camera transforms, visibility, normals, colours and display smoothing never change material paths.
- Result snapshots bind the full effective input; asynchronous cancellation, caches and UI updates never let a stale result overwrite newer state.

## ADR-012 Refactoring principles

**Status:** Accepted (migrated from `ARCHITECTURE.md` "refactoring principles")

- Extract pure functions first without changing UI or numerical results.
- Build regression tests before merging visual geometry with calculation geometry.
- `dam_spec.json` stays independent, versioned, and consumable by both the browser and Geant4.
- Scans call the same calculation core as single-station evaluation; no duplicate algorithm.
- Long tasks support cancellation, progress and caching; prefer Web Workers to avoid blocking the UI.
- UI state is separate from engineering plan state; sidebar expansion and similar never enter scientific result files.

## ADR-013 Native ES modules in `dist/`, no build step (current)

**Status:** Accepted, current practice; planned to be superseded by ADR-004 (migrated from `ARCHITECTURE.md` "main-app source entry points")

**Decision.** Native ES modules live directly in `dist/modules`; there is no separate `src/` mirror and no build step. The module ownership table in [`specs/MODULE_BOUNDARIES.md`](specs/MODULE_BOUNDARIES.md) defines which module owns what and which dependencies are forbidden; `tests/integration/main-architecture.test.mjs` enforces it.

## ADR-014 Structural reference lines: material-qualified mesh contours

**Status:** Accepted (summary; full decision and evidence in [`specs/GEOMETRY_REFERENCES.md`](specs/GEOMETRY_REFERENCES.md#reference-semantics-and-library-choice))

**Decision.** Use material-qualified perspective apparent contours plus separately labelled feature creases and verified patch-boundary references, projected through material into detector-local slope space. Reuse the established mesh-edge/co-face-normal method by adapting the small relevant part of pinned `vtkPolyDataSilhouette` 9.5.2 (BSD-3-Clause notices retained) into a renderer-independent module; native VTK remains the numerical reference. Do not invent a new silhouette algorithm or substitute depth jumps for geometry. Candidate curves are not interfaces until qualified by dataset semantics and shared material classification. Manifold CSG is a development-time tool only, not a browser dependency. Finite-model references are explicitly not certified physical interfaces (FR-GE4).

## ADR-015 Documentation structure: guidelines on top, specifications and guides one level down

**Status:** Accepted (layout requested 2026-10-10; English for all documentation, OQ-4)

**Context.** Decisions, open work, specifications and usage guidance were mixed across `ROADMAP.md`, `GEOMETRY_SPEC_REFACTOR.md`, `ARCHITECTURE.md`, `CALCULATION_MODELS.md`, `CONTEXT.md` and checklists inside reference docs.

**Decision.**

```text
docs/
├─ ARCHITECTURE_DECISIONS.md   ┐
├─ FEATURE_REQUIREMENTS.md     │ guidelines: decisions, requirements,
├─ ROADMAP.md                  │ direction and priority; the only place
├─ IMPLEMENTATION_PRIORITY.md  ┘ for open work
├─ specs/      modular specifications the code must match (index: specs/README.md)
│  └─ datasets/   per-dataset specs
└─ guides/     usage and operation: result interpretation, projection workflow, migration
```

- Specs and guides contain no task lists; they link to the guideline files for open items.
- Specs keep their original language and section numbering where other docs cite them.
- Root entry docs stay: `AGENTS.md` (rules), `CONTEXT.md` (domain context and semantics), `README.md` (usage). The deployment guide moved to `guides/DEPLOYMENT.md`; dataset descriptions live with their data in `datasets/` (ADR-018).
- **All documentation is in English** (OQ-4, 2026-10-10). Dataset release files imported byte for byte from upstream packages are not edited.

**Migration status:**

| Original | Now |
|---|---|
| `docs/ROADMAP.md` | Merged into `ROADMAP.md`, `IMPLEMENTATION_PRIORITY.md`, `FEATURE_REQUIREMENTS.md`; old file removed |
| `docs/GEOMETRY_SPEC_REFACTOR.md` | Merged into ADR-008…011 and FR-D, FR-V; removed |
| `docs/ARCHITECTURE.md` | Decisions → ADR-011…013; module table → `specs/MODULE_BOUNDARIES.md`; rest → `specs/ARCHITECTURE.md` |
| `docs/CALCULATION_MODELS.md` | §2–§13 + §18 prose → `specs/CALCULATION_MODEL.md` (numbering kept); §1, §14–§17 → `guides/RESULT_INTERPRETATION.md`; §18 checklist → FR-V |
| `docs/GEOMETRY_AND_COORDINATES.md` | → `datasets/zhouning-lower-reservoir-dam/README.md` (via `specs/datasets/`, ADR-018); §6 risks → FR-GE |
| `docs/GEOMETRY_REFERENCES.md` | Normative rules → `specs/GEOMETRY_REFERENCE_CONTRACT.md`; decision/evidence/reproduction → `specs/GEOMETRY_REFERENCES.md`; decision summarised in ADR-014 |
| `docs/PROJECTION_DATA.md`, `docs/PROJECTION_VALIDATION.md` | → `specs/` unchanged in content |
| `docs/PROJECTION_WORKFLOW.md`, `docs/MIGRATION_CHECKLIST.md` | → `guides/` unchanged in content |
| `CONTEXT.md` §9 checklist | → requirements; §3–§7 are spec candidates (see `specs/README.md`) |


## ADR-016 Subject-neutral evaluation platform

**Status:** Accepted as direction (owner, 2026-10-10); implemented gradually

**Context.** Only one dam dataset exists today, but the platform is meant to evaluate muography deployments for other dams, blast furnaces, tunnels and future subject types. Dam terms currently leak into generic code: 17 modules mention dam/upstream/downstream/spillway/gallery, including `dataset-loader.js`, `application-selection.js` and the compiled backend's capability list (`layers: ['dam','terrain','upwater','downwater','cone']`). The legacy environment accepts only `upstream`/`downstream` water levels.

**Decision.**
- The core (geometry runtime, ray tracing, response, projection, scans, plans, exports) knows only generic concepts: materials with densities, closed volumes, terrain, dataset-declared variables, stations, poses, devices. It never branches on a subject kind or name.
- Each dataset declares a `kind` (e.g. `dam`, `blast-furnace`, `tunnel`) plus its own variables, display layers, semantic targets and capabilities. UI controls and labels are generated from these declarations.
- Kind-specific knowledge lives in (1) dataset packages, (2) offline compilers that turn source data into the generic package (ADR-017), and (3) where unavoidable, small explicit adapters registered in `application-backends.js`. No plugin system until a second subject kind proves the pattern (consistent with ADR-008, `AGENTS.md`).
- Physics must not silently assume rock-like matter or open-sky geometry: energy loss per material, deep overburden and in-material detector positions are explicit requirements before the corresponding subject kinds are supported (FR-K4…K6).
- Terminology (OQ-5, accepted): keep **dataset** as the generic unit, qualified by `kind`. Do not use "scenario" for the subject, because it already means a frozen environment variant (low/mid/high/extreme). `AGENTS.md` and `CONTEXT.md` were generalised away from dam wording on 2026-10-10.
- The technology choices stand: static browser app, WebGL rendering, framework-free JS core, glTF/GLB runtime geometry, WebAssembly only if measured. Nothing in them is dam-specific.

## ADR-017 Compiled geometry package is the generic runtime contract

**Status:** Proposed

**Context.** Two geometry paths exist. The legacy path interprets the Zhouning parametric dam spec in the browser (`geometry-kernel.js`, `legacy-geometry-adapter.js`) and cannot generalise. The compiled path consumes closed GLB meshes with material metadata, a manifest, terrain heightfields and checksums, and validates closure/winding when building the BVH. Nothing in it is dam-specific except declared names.

**Decision.**
- The runtime contract for every subject kind is the compiled package: manifest (identity, frames, materials, variables/frozen variants, layers, targets, checksums) + GLB physics/display meshes + optional terrain heightfield + optional conformance baselines.
- Source formats (dam parametric spec, CAD, survey, furnace drawings) are converted offline by kind-specific compilers. The browser never runs kind-specific CSG (consistent with ADR-009).
- The legacy dam path remains a bounded compatibility adapter; the compiled path is the default (OQ-3) and new subject kinds go only through it.
- Continuous variables (e.g. water level, burden level) need explicit per-kind resolvers; frozen variants are supported first (ADR-011).

## ADR-018 Datasets move to a top-level `datasets/` directory

**Status:** Accepted and implemented (owner decision OQ-6, 2026-10-10: move now)

**Context.** Dataset releases (spec JSON, schemas, GLB, terrain, conformance baselines) live inside the deployable web root `dist/data/datasets/`, mixed with application code. Their descriptive spec currently sits apart from them in `docs/specs/datasets/`. Binary assets are large (~2.6 MB per GLB, four per release, terrain duplicated across 0.6.1/0.6.2/0.7).

**Decision.**
- Make `datasets/<dataset-id>/<release>/` a top-level source directory: release files, schemas, conformance baselines and the dataset's own spec document (`README.md`, moved from `docs/specs/datasets/`), versioned together. Shared package schemas go in `datasets/_schemas/`.
- Served at `/datasets/`; the registry is `datasets/registry.json` with `base_url` relative to it. The check scripts and tests (`scripts/static-paths.mjs`) map `/datasets/` to the directory, Docker copies it into the web root, and any server that publishes only `dist/` runs `scripts/sync-datasets.mjs` first (output `dist/datasets/`, gitignored). With the build step (ADR-004) this becomes part of the asset pipeline.
- Consider Git LFS or release artifacts for large binaries once more datasets arrive.
- **Cost:** a copy step before serving/deploying; test/script paths and hosting must be updated in the same change.

## ADR-019 User-loaded geometry in stages, client-side first

**Status:** Proposed (owner direction 2026-10-10: needed eventually, not urgent)

**Decision.** Stages, each usable on its own:
1. **Bundled datasets** (today).
2. **Load a packaged dataset from a local file or folder** in the browser via the File API, validated exactly like bundled ones (schema, checksums, closure/winding, units/frames). Stored locally (IndexedDB), referenced in plans by release ID plus content hash. Results from packages without conformance baselines are labelled unverified throughout. Untrusted input has size, triangle and JSON limits, no code execution and fails closed. No server needed, so ADR-001 holds.
3. **Offline converter** (CLI) from common mesh/CAD formats (glTF, OBJ, STL first; IFC/STEP later) with material mapping and frame declaration into the package format, reusing the existing compiler checks.
4. **In-app light authoring**: assign materials/densities to imported meshes, set frames and origin, declare variables.

A server becomes relevant only if loaded geometry must be shared across a team (trigger T1) or protected (T4).

## ADR-020 Multi-station view composes per-station results

**Status:** Accepted for priority and UI modes (owner, 2026-10-10); design details Proposed

**Context.** The UI evaluates one active station at a time (`deployment-state.js` holds candidates plus one `active` index; the controller computes one snapshot). That suits detailed inspection, but a deployment plan is a set of stations, and both customer demonstrations and reconstruction need them shown together.

**Decision.**
- A plan distinguishes **candidates** from the **selected deployment** (a subset with per-station pose and device). The plan schema (FR-P1) carries both.
- Each station is evaluated by the existing single-station core. Results are cached by the station's snapshot key, so switching between overview and detail, or toggling stations, does not recompute unchanged stations. Multi-station metrics are computed from these stored per-station results: no second formula path (ADR-002, ADR-012).
- Two UI modes over the same plan state: **detail** (today's single-station inspection) and **overview** (all selected stations at once).
- **Priority (owner decision 2026-10-10):** the overview comes right after the plan format, ahead of scan performance work. It is built in the current page with existing modules: it is mostly 3D scene and projection canvases, which stay framework-free under ADR-004 anyway, so it does not trigger the build-step switch. Stations are computed sequentially through the async port until scan workers exist.
- Computation for several stations goes through the async, cancellable assessment port and workers (ADR-006 item 2, ADR-005 step 3); a stale station result never appears in the overview.

## ADR-021 Simulated multi-projection reconstruction as a separate pipeline

**Status:** Proposed (owner requirement 2026-10-10)

**Context.** Several projections of the same subject can be combined by tomographic algorithms into a 3D density estimate. Simulating that from a plan gives a second, complementary measure of plan quality: not "what does each detector see" but "what 3D picture could the deployment recover".

**Decision.**
- Pipeline: plan → per-station simulated measurements (expected counts from the shared core; optional Poisson noise for the chosen exposure) → per-pixel column-density estimates → 3D reconstruction on a voxel grid in the model frame → comparison with the dataset's true density.
- **No inverse crime:** the reconstruction's forward model (ray–voxel path lengths on its own grid) is independent of the geometry used to simulate the measurements. Reconstructing with the same exact model that generated the data would overstate quality.
- Algorithms are pure, versioned modules registered explicitly (start with SIRT/ART and MLEM with non-negativity and density bounds; priors and regularisation later). Every result records algorithm, version, settings, voxel grid, noise seed and input snapshot keys.
- Cheaper coverage metrics come first and need no inversion: per voxel, number of rays, number of stations, path length and angular diversity of crossing rays.
- Outputs are always labelled **simulated**. The same pipeline can later take measured data (FR-V10), at which point it becomes a real reconstruction with its own validation.
- Subject-neutral: voxel grid from dataset bounds, densities from dataset materials (ADR-016).
- Sizing estimate: a 2 m grid over a 230 × 100 × 80 m dam is ~230k voxels; 10 stations × 65² rays ≈ 42k rays with a few hundred voxels each gives a sparse system of ~10M non-zeros. That is workable in the browser with typed arrays and a worker; larger grids follow ADR-005 (measure, then WebAssembly).

## ADR-022 A living domain model separate from the glossary

**Status:** Accepted (owner request 2026-10-10)

**Context.** The owner asked for a record of domain modelling kept along with development. `CONTEXT.md` holds product context and the glossary and is required reading for every contributor, so it should stay short and stable. The model (bounded contexts, relationships, identities, invariants, lifecycles, gaps between code and target) changes with development and has so far existed only implicitly in code.

**Decision.**
- `CONTEXT.md` stays the ubiquitous-language entry: product context and term definitions.
- `docs/specs/DOMAIN_MODEL.md` is the living domain model, marking each element Current, Partial or Target, listing invariants and code-vs-model gaps with their requirement IDs, and keeping a change log.
- Any change that adds, removes or changes a domain concept, relationship, identity or invariant updates the model (and the glossary for new terms) in the same commit (`AGENTS.md`, FR-Q10). Decisions that reshape the model are also recorded here as ADRs.

## ADR-023 Layered, lightweight test-driven development

**Status:** Accepted (owner, 2026-10-10); implemented as layered npm scripts and test directories

**Context.** The Node suite has 34 files (about 32 s in parallel, 90 s sequentially): most are fast pure-function tests, a handful load real datasets and take 3–18 s each, and browser acceptance takes minutes. There is no single command, no layering and no record of which tests to run when.

**Decision.**
- Seven layers: L0 static, L1 unit, L2 contract, L3 data conformance, L4 integration, L5 browser acceptance, L6 performance, each with a speed budget and a trigger ([TEST_STRATEGY](specs/TEST_STRATEGY.md)).
- Test first for pure calculation functions, bug fixes (reproduce first), data formats and domain invariants; not for views, layout or exploratory spikes.
- One behaviour is tested once, at the lowest layer that can show it; no geometry mocks (analytic fixtures or real releases); golden baselines change only with a version bump.
- The everyday loop (`npm test`, L0–L2) stays under about 15 s; slow layers run when their inputs change or before merge/release.

---

## Open questions

- **OQ-2 UI framework choice** (Preact vs Svelte), decided when ADR-004 starts.

## Resolved questions

| Question | Decision (2026-10-10) | Recorded in |
|---|---|---|
| OQ-1 Sensitivity of dam geometry | Not sensitive now; re-check for each new dataset | ADR-001 (T4), FR-A1 |
| OQ-3 Default backend switch | Switch to the compiled backend | ADR-011, FR-B1 |
| OQ-4 Documentation language | English for all documentation | ADR-015 |
| OQ-5 Generic terminology | Keep "dataset" + `kind`; generalise `AGENTS.md`/`CONTEXT.md` now | ADR-016, FR-K9 |
| OQ-6 Dataset directory move | Move now | ADR-018 |
| OQ-7 Multi-station overview priority | Ahead of scan performance | ADR-020 |
| OQ-8 Continuous integration | Keep tests local for now | ADR-023, TEST_STRATEGY |

## Change log

- 2026-10-10: ADR-023 accepted; OQ-8 resolved (local tests only).
- 2026-10-10: ADR-023 layered test strategy; OQ-8 continuous integration.
- 2026-10-10: Windows launcher scripts (`serve.ps1`, `.cmd`) removed; references updated in ADR-004 and ADR-018.
- 2026-10-10: ADR-022 living domain model.
- 2026-10-10: Recorded owner decisions OQ-1, OQ-3, OQ-4, OQ-5 (compiled default in ADR-011, English-only docs in ADR-015, terminology in ADR-016); added Resolved questions table.
- 2026-10-10: ADR-018 accepted and implemented (OQ-6).
- 2026-10-10: OQ-7 resolved: multi-station overview ahead of scan performance; recorded in ADR-020.
- 2026-10-10: Added ADR-020 (multi-station view), ADR-021 (simulated reconstruction), OQ-7.
- 2026-10-10: Added ADR-016 (subject-neutral platform), ADR-017 (compiled package as generic contract), ADR-018 (top-level datasets), ADR-019 (user-loaded geometry), OQ-5, OQ-6; ADR-008 generalised.
- 2026-10-10: ADR-015 rewritten for the new layout: guideline files at `docs/` top level, `specs/` and `guides/` below.
- 2026-10-10: Merged decisions from `GEOMETRY_SPEC_REFACTOR.md`, `ARCHITECTURE.md` and `GEOMETRY_REFERENCES.md` (ADR-008…014); added ADR-015 and OQ-3, OQ-4.
- 2026-10-10: Initial log from review discussion (ADR-001…007, OQ-1…2).
