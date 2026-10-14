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
| 024 | Desktop distribution as a thin wrapper over the unchanged web app | Proposed |
| 025 | Anomaly hypotheses in the physical scene; perturbative sensitivity evaluation | Accepted |
| 026 | Coverage highlight by GPU projective texturing of acceptance and count maps | Proposed |
| 027 | Three.js for display only; geometry and physics in own framework-free modules | Accepted (retrospective) |
| 028 | Retire the legacy backend; keep its UI with gated migration targets | Accepted, implemented |
| 029 | One subject-feature catalogue for 3D layers, projection outlines, picking, coverage and ROI | Accepted; implemented (15b-1…15b-6; envelope overlay kept in the preview only); optional fill and sampled-pixel view open |
| 030 | Two entry points: planning app and dataset workbench, one selection contract | Accepted (owner, 2026-10-14); links and drawer done (15c); 11b, W1 open |

---

## ADR-001 Stay an offline static app; no backend for now

**Status:** Accepted

**Context.** All computation runs in one browser. The app is served as a static folder (`dist/`) through local HTTP, Docker/nginx or static hosting. `AGENTS.md` requires offline operation without runtime CDN or external services.

"Static" describes the server, not the app: the server only delivers files, while the application is fully interactive and computes everything in the browser. Rationale (recorded retrospectively 2026-10-12; the original choice predates this log):

- *Where it is used.* Field sites, plant networks and customer intranets are often offline or restricted; a static bundle runs from any web server, a laptop or (ADR-024) a desktop wrapper without installing a runtime.
- *Interactivity.* Pose changes re-run ray tracing and response on the user's machine with no network round trip; a 65×65 projection takes ~0.4 s locally (ADR-005).
- *Operations and cost.* No application server, database, sessions or scaling to run, patch and secure; hosting is file serving. Each user brings their own compute.
- *Data handling.* Datasets and plans stay in the user's browser unless exported; there is no server-side store to protect.
- *Reproducibility.* A deployment is a fixed set of versioned files plus checksummed dataset releases.

Costs accepted: no shared plans or central results, compute bounded by one machine, the whole dataset is downloaded, and nothing can be kept secret from the user. Those are exactly the triggers below.

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

**Context.** Calculation modules (`dist/modules/*` such as `muon-response.js`, `detector-projection.js`, `triangle-bvh.js`, `compiled-assessment.js`) have no DOM or Three.js dependency and already run under `node --test` and `scripts/`.

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
- **Caching until then (2026-10-14).** File names carry no content hash, so servers send `Cache-Control: no-cache` for scripts and stylesheets (`nginx.conf`, `scripts/serve.mjs`): browsers revalidate and get a 304 for unchanged files. Content-hashed file names with long-lived caching come with this build step; hand-maintained per-file stamps were tried and reverted (owner).

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
2. Asynchronous, cancellable assessment port (Promise + AbortSignal, as `evaluateCompiledAssessment` already does); only `assessment-controller.js` changes. *Done 2026-10-14:* `createLocalAssessmentPort` (`open(input)` → `evaluate(quality, { signal, onProgress })` → Promise, AbortError on cancel); the controller depends only on the port.
3. Deterministic calculation: no result may depend on evaluation history (FR-C1).
4. Traceable results for every backend (the legacy backend recorded its ray cutoff, FR-C2, before it was retired, ADR-028).
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

**Compiler tooling (2026-10-12).** The current dam compiler (`dam_v07.compiler`, Python) builds meshes with Manifold (booleans, guaranteed watertight output) and trimesh. OpenCascade (OCCT) is a B-rep CAD kernel: exact solids, sweeps, fillets and, above all, STEP/IGES import (and IFC through IfcOpenShell, which is built on OCCT). It is the right tool for **CAD-sourced subjects** (furnace or tunnel design models, BIM) and for the user-geometry converter (FR-L5), as an offline front end: CAD import or B-rep construction → tessellation → Manifold for material-priority booleans and face lineage → package validation (closure, winding, conformance). It is not a replacement for the mesh pipeline: B-rep booleans are slower and need healing to guarantee closed meshes, and DEM terrain is mesh-native. Offline use goes through native OCCT (pythonOCC, CadQuery/build123d); the WebAssembly port opencascade.js only matters if geometry is built in the browser (in-app authoring, ADR-019 stage 4).

DD4hep XML does not replace the strict JSON contract: Compact XML has no fixed schema and its semantics depend on the detector constructor. It suits simulation assembly, not storing dam provenance, unknowns and engineering assertions. The browser does not reimplement the full CSG of `compile_spec.py`; the short-term parametric interpreter is a migration compatibility layer only.

## ADR-010 Hybrid geometry/ray kernel

**Status:** Accepted (migrated from `GEOMETRY_SPEC_REFACTOR.md` §5)

**Decision.**
- Terrain: regular height field, bilinear sampling (the legacy 3D DDA tracer was retired with ADR-028).
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
- **Legacy backend retired (owner decision 2026-10-12, ADR-028).** The compiled backend is the only scientific backend; the gaps above are migration targets MT-1…MT-6.
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

**Limits of current evidence (owner, 2026-10-12).** The code implements one subject: a single roller-compacted-concrete dam (Zhouning), with transverse sections, galleries, observation rooms, an elevator shaft, spillway orifices and a chute, described by one dam-specific schema (`org.jianweikeyi.dam-geometry`). Other subjects, and even other dam types, may need different:

- **display and user interaction**: cut-away and section views, internal versus external viewpoints, what a user picks and edits;
- **geometry definition and semantics**: parametric sections versus layered shells versus long linear excavations under terrain; what counts as a cavity, a target or an environment volume; time-varying contents;
- **regions of interest**: discrete cavities and galleries versus continuous zones (e.g. a furnace's cohesive zone or burden profile) versus anomalies in overburden;
- and with them physics, environment variables and where detectors can be placed.

Consequences:

- Generalisation is evidence-driven. Nothing is abstracted from the single dam except what the compiled package already needs (materials, closed meshes, frames, scenarios). The dataset-declared kind, variables, layers and targets (FR-K2, K3) are designed from at least two real examples, not from this dam alone.
- Known differences are recorded in the kind variation register ([DOMAIN_MODEL §7](specs/DOMAIN_MODEL.md#7-kind-variation-register)), marked observed or assumed, before any code generalises them.
- Before supporting a new kind or a new dam type, write its kind profile (FR-K10): what it needs on each variation axis, and which parts the existing core already covers. Kind-specific needs stay in its dataset, compiler and bounded adapters until a second example shows a shared pattern.
- Today's "generic" interfaces, including the compiled package contract (ADR-017), are provisional and may change when the second kind arrives.

## ADR-017 Compiled geometry package is the generic runtime contract

**Status:** Proposed

**Context.** Two geometry paths exist. The legacy path interprets the Zhouning parametric dam spec in the browser (`geometry-kernel.js`, `legacy-geometry-adapter.js`) and cannot generalise. The compiled path consumes closed GLB meshes with material metadata, a manifest, terrain heightfields and checksums, and validates closure/winding when building the BVH. Nothing in it is dam-specific except declared names.

**Decision.**
- The runtime contract for every subject kind is the compiled package: manifest (identity, frames, materials, variables/frozen variants, layers, targets, checksums) + GLB physics/display meshes + optional terrain heightfield + optional conformance baselines.
- Source formats (dam parametric spec, CAD, survey, furnace drawings) are converted offline by kind-specific compilers. The browser never runs kind-specific CSG (consistent with ADR-009).
- The contract is provisional: it is derived from one dam and is expected to change when a second kind arrives (ADR-016, limits of current evidence).
- The compiled path is the only runtime path; the legacy dam path was retired (ADR-028) and new subject kinds go only through the compiled package.
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
- Display: slices, isosurfaces and volume rendering in the same Three.js scene as the subject, anomaly hypotheses and coverage, so they share camera and depth (3D textures and a ray-marching shader in WebGL2; marching-cubes isosurfaces). VTK.js is a fallback for a separate analysis view if advanced volume rendering is required (ADR-027).
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

## ADR-024 Desktop distribution as a thin wrapper over the unchanged web app

**Status:** Proposed (owner question 2026-10-10: mainly an online service, may need a standalone desktop app)

**Context.** The app is a static site with only relative URLs and no external calls; it uses ES module workers, blob downloads for exports, file inputs for imports and `localStorage`. It cannot run from `file://` (modules, workers and JSON fetches are blocked), so any desktop form must serve `dist/` and `datasets/` from a real origin. The Windows launcher scripts were removed (2026-10-10); a desktop package would replace them properly.

**Decision.** Desktop support is a packaging layer, never a fork: the wrapper serves the same `dist/` + `datasets/` build and adds only a window, menus, native open/save dialogs, update checks and (later) local dataset storage. No calculation, geometry or domain logic in the wrapper (ADR-002). Stages, each triggered by need:
1. **Installable web app (PWA)**: a web manifest and a service worker that caches the app and bundled datasets, so users can "install" it from the online service and use it offline. No installer, no signing; works in Chromium-based browsers and partly in Safari/Firefox. Cheapest; try first.
2. **Thin native wrapper with Tauri** when a real downloadable installer is needed (offline distribution, IT-managed machines, native file access for user-loaded datasets ADR-019). Serves the files through its asset protocol; uses the system webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), so installers stay small (~10 MB plus datasets). Exports need a small save-dialog bridge because downloads behave differently per webview.
3. **Electron instead of Tauri** only if WebGL/worker behaviour of the system webviews proves inconsistent (mainly Linux WebKitGTK) or an in-process Node batch runner is wanted. Bundles Chromium, so behaviour matches the browser tests exactly, at ~100 MB+ per installer.

**Consequences.** One build serves the online service and the desktop package; browser acceptance (L5) covers the wrapper's content, plus a short smoke test per packaged OS. Code signing and notarisation (Windows, macOS) are the main recurring cost of stages 2–3. `localStorage` in a wrapper belongs to the app's own origin, so plans move between web and desktop by export/import (FR-P1).

## ADR-025 Anomaly hypotheses in the physical scene; perturbative sensitivity evaluation

**Status:** Accepted (owner requirement 2026-10-12; term "anomaly" and placement before scanning decided, OQ-10). Details may be refined during implementation.

**Context.** Detectors are deployed to investigate a structural anomaly of the subject. Without an explicit anomaly the tool can only say what a station sees, not whether a plan would detect the problem. Owner examples: voids, loosened or densified zones without clear structural features; a blast furnace's cohesive-zone shape and hearth wall thickness changes; development of a seepage (saturated) zone. Today the only related mechanism is the legacy counterfactual significance, a dam-specific heuristic on predefined targets that does not exist on the compiled default (FR-B1). Both backends already keep per-ray segments (material, entry and exit distance), so an anomaly can be applied to a stored trace without retracing the subject.

**Decision.**
- **Concept.** A *anomaly hypothesis* is a user- or dataset-supplied, parameterised change of the subject's physical state: a **region** (geometry), a **density model** (what changes inside it), a **host constraint** (which materials/entities it may affect) and **parameters** with ranges (size, position, density, time/development step). It is not part of the immutable dataset release.
- **Scene.** The physical scene becomes: release + environment state + active anomaly hypotheses. An anomaly is part of the physical state when active, independent of whether the view shows it; the view renders it from the same definition (glossary rule: view state never changes physics).
- **Geometry.** Generic regions first: analytic primitives (sphere, ellipsoid, box, cylinder, extruded polygon) and closed meshes (BVH, same rules as compiled components). Host clipping applies after material classification: the change acts only on the resolved host material inside the region, so "positive minus negative volumes" and material precedence stay intact. Kind-specific shapes (cohesive-zone surfaces, hearth wall thickness profiles, seepage surfaces) are produced by **kind generators** that output generic regions; they follow ADR-016 (kind profile first).
- **Density models.** Void (density → 0), relative change (Δρ/ρ: loosening, densification), absolute replacement, material replacement, and fluid saturation (porosity × fluid density, for seepage). Per-material columns are kept so FR-K4 material-dependent energy loss can apply later.
- **Evaluation.** Perturbative: trace the baseline scene once per station/pose; for each anomaly variant compute the column change from region ∩ host segments along each stored ray, then recompute counts with the shared response core. Outputs per pixel and per region footprint: baseline and perturbed counts, ΔN, significance with statistical and systematic terms, and exposure time needed to reach a chosen significance. Sweeps over size, density, position and development step give sensitivity curves and minimum detectable size/contrast. Exactness is checked against full retracing on analytic fixtures (L2).
- **Systematics.** Nuisance variations come from declared uncertainties: dataset density ranges and unknowns, flux model, device efficiency, geometry approximations. Results report significance with and without them, so the final observation states what is detectable and under which assumptions.
- **Uses.** Becomes the main objective for scan ranking (FR-S2), multi-station comparison (ADR-020) and the ground truth for simulated reconstruction (ADR-021). It also gives the compiled default an anomaly-based sensitivity that does not need entity attribution, replacing the legacy counterfactual heuristic over time.
- **Prerequisite.** FR-C1 (history-independent flux), done: the former quantised flux cache could map small column changes to the same cached value, making ΔN artificially zero or noisy.
- **Labelling.** Every result based on an anomaly is labelled as a simulated hypothesis with its full definition in the snapshot identity.

## ADR-026 Coverage highlight by GPU projective texturing of acceptance and count maps

**Status:** Proposed (owner requirement 2026-10-12, FR-M10)

**Context.** In single- and multi-station views the user wants to see which part of the subject each detector's field of view covers: a single colour for geometric acceptance, and a brightness scale for physical acceptance (more expected counts = brighter). Muography looks *through* material, so every surface a ray crosses inside the field of view is covered; there is no occlusion. Each result pixel already carries its direction, slope bounds, expected count and solid-angle factor; both scene views use standard Three.js materials.

**Decision.**
- **Projective texturing, no new ray tracing.** Each detector acts as a projector. An overlay pass re-renders the subject and terrain meshes (same model buffers, additive blending, polygon offset) with a small shader: for each fragment, `d = p − origin`; if `d·forward > 0`, compute `sx = d·right / d·forward`, `sy = d·up / d·forward` and look up a 2D texture in slope space. Because occlusion is ignored, front, back and internal surfaces along a ray are all highlighted, matching through-material coverage. The overlay is view state: toggling it never changes physics.
- **Geometric acceptance (single colour).** Texture = the device's acceptance weight per slope, generated by the shared core (`nativeAxisBins`), not a shader copy of the formula; the region is shown where the weight is above zero, in one colour per station. It depends only on device and pose, so it updates live while the pose is dragged, before any ray calculation. Directions below the horizon carry no flux; the legend says so.
- **Physical acceptance (brightness).** Texture = expected count per unit solid angle from the completed result (`count / dΩ`, raw, not display-smoothed), shown on a fixed logarithmic brightness scale so stations and plans compare. Per steradian keeps brightness independent of binning (25² preview vs 65² final). The texture is bound to the result's snapshot key: while a newer pose is still computing, the stale map is dimmed or replaced by the geometric view, never shown as current.
- **Multi-station.** Up to N projectors in one pass (texture array, uniforms per station). Geometric mode: colour per station, overlaps show blended colours or a "number of covering stations" mode. Physical mode: either per-station hue with brightness, or one combined brightness of summed counts per steradian.
- **Consistency.** The JS mirror of the shader's direction→slope mapping is tested against the core's slope→direction mapping (`detector-pose.js`) at L1, so view and calculation agree on directions.
- **Interior coverage later.** Surface highlighting shows where rays cross surfaces, not how deeply a volume is probed. Volume coverage (per-voxel counts, stations, angular diversity) comes from stored traces in a worker (FR-M6, ADR-021) and is a separate layer.
- **Replaces the legacy flux cloud** (migration target MT-4, owner decision 2026-10-12). The physical highlight serves the same purpose from the shared result, closing that part of FR-B1 without copying the legacy heuristic.

**What is tested, what is highlighted and how users read it (clarified 2026-10-12).** Goal: a user recognises at a glance which part of the subject each deployed detector sees.

- *No search.* Coverage is a per-point test, not a search over rays: a surface point `p` is covered by a station when its direction from the detector `d = p − origin` points forward (`d·forward > 0`), its slopes lie inside the device range (`|sx| ≤ maxSlopeX`, `|sy| ≤ maxSlopeY`), it lies within the ray length, and (for physical coverage) the direction is above the horizon. This is the same set of points that the detector's rays would cross, evaluated backwards from the point, so the cost is per screen pixel and independent of the number of rays.
- *Which surfaces.* By default only the subject's own surfaces (for the dam: dam body and its structures), not terrain, water or air; a toggle adds terrain and water, since rays do continue into the hillside. Internal surfaces (galleries, cavities) are tinted when internal display is on. The dataset will declare which layers count as "subject" (FR-K3); until then the dam layer is used.
- *What the eye sees.* Normal depth-tested rendering shows the footprint on the surfaces facing the camera, like a spotlight cast from the detector onto the subject. Turning the camera around shows the footprint on the far side too, because rays cross the subject; that is intended (through-material coverage), and the legend says so.
- *Defaults (owner, 2026-10-12):* full field of view only, on subject surfaces only. The core field of view and terrain/water are optional toggles.
- *Visual encoding.* (1) a tint over the full field of view (mixed into the surface colour, see Transparency); (2) optionally, a stronger tint over the core field of view (half the maximum slope per axis, the existing `coreFov` definition), off by default; (3) crisp outlines of the shown boundaries with constant screen width; (4) the detector marker and the pyramid edges in the same station colour, ending where they first enter the subject; (5) the part below the horizon shown hatched or desaturated as "no muon flux". In physical mode a log brightness ramp of counts per steradian replaces the flat tints; outlines stay.
- *Interaction.* Hovering a tinted point shows which stations cover it, its slopes in each detector and (physical mode) the expected counts per steradian; clicking jumps to the matching projection pixel. This is the reverse of the existing pixel → ray link, so 3D view and projection image can be read together.
- *Multi-station.* Each station keeps its colour for tint and outline; overlaps show blended colours, with an optional "number of covering stations" mode.

**Transparency (2026-10-12).** The subject can be made transparent (dam opacity slider; materials are double-sided, transparent below opacity 1 and stop writing depth below 0.72). An additive overlay pass would then stack the highlight on the front face, the back face and every internal surface, so brightness would show the number of layers rather than counts. Therefore:

- *Tint inside the surface's own material, not an additive overlay.* The coverage term is injected into the subject materials' shaders (as the retired legacy view did for clipping) and **mixes** the surface colour towards the highlight colour; the surface keeps its own opacity. Each surface is tinted at most once and composites exactly like the surface itself, so the existing transparency sorting applies unchanged. (This replaces the "overlay pass with additive blending" sketched above.)
- *Which layers are tinted.* Outer shell: only its front-facing side (`gl_FrontFacing`), so a covered line of sight through a transparent dam shows one tinted shell, not two. Internal features (galleries, rooms, shafts, cavities): *revised by ADR-029 (2026-10-13)* — not tinted; they keep their class colour and are drawn full-opacity when in view of a selected station and faded otherwise, so with a transparent shell the user still sees directly which internal features lie in the field of view, without a second colour code on them.
- *Readable at low opacity.* Covered regions keep a minimum opacity (e.g. 0.35) and the outline is drawn at full opacity, so the highlight does not vanish when the shell is almost transparent. Uncovered surfaces keep the user's opacity.
- *Physical brightness is read on one layer.* Counts per steradian map to the tint's colour value, not to added light, so overlapping translucent layers do not brighten each other. The legend states that brightness refers to each tinted surface.
- *Pyramid edges.* Drawn solid where visible and dashed where hidden behind opaque surfaces, instead of the current always-on-top lines.
- *Water and terrain* (when toggled on) follow the same rules; water stays visually secondary (lower tint strength) so the subject reads first.

**GPU cost on integrated graphics (2026-10-12).** The scene is small: 33 components with ~131k triangles (~65k vertices) plus two terrain grids (281×287 and 201×201, ~240k triangles), drawn at device pixel ratio ≤ 2 with antialiasing and on-demand rendering (no frames while idle). Per fragment and station the coverage test is a few dot products, two divisions, range checks and one 65×65 texture lookup (~30 operations), small next to the existing physically based lighting of `MeshStandardMaterial`. Estimate at 1920×1080, overdraw ~3 under transparency and 8 stations: of the order of 5–10 GFLOP per frame, i.e. ~0.3–0.6 TFLOPS for 60 fps. Intel Iris Xe (11th gen Core i5 and later, ~1.5–2 TFLOPS) has ample headroom; older UHD 620 (8th gen, ~0.4 TFLOPS) is expected to stay interactive (≥30 fps) with a few stations, with 60 fps not guaranteed at high pixel ratio. This is an estimate, not a measurement (the development container only has a software renderer), so FR-N5 requires measuring on reference hardware. Safeguards: on-demand rendering; pixel ratio capped lower (e.g. 1.25) during camera interaction; a cheaper subject material (Lambert) and outline-off quality setting when frame time exceeds budget; stations beyond the per-pass limit drawn in an extra pass.

## ADR-027 Three.js for display only; geometry and physics in own framework-free modules

**Status:** Accepted, recorded retrospectively (2026-10-12)

**Context.** The README called the project "a static Three.js web application", which suggests Three.js does the geometry work. It does not: only the view modules (`compiled-geometry-view`, `compiled-scene-view`, `projection-canvas-view`, `geometry-preview`; formerly also `legacy-scene-view`) import it. GLB decoding, closure/winding validation, the BVH, ray–mesh intervals, material classification, DDA tracing, response and projection are the project's own modules with no Three.js dependency (ADR-002; enforced by `tests/integration/main-architecture.test.mjs`). Heavy geometry construction (CSG of the parametric spec, terrain stitching) happens offline in the dataset compiler; Manifold and VTK are development-time references only (ADR-009, ADR-014).

**Decision and rationale.**
- *Display: Three.js (vendored, pinned, MIT).* Mature WebGL2 renderer with a very large user base, native glTF/GLB support matching the runtime package format (ADR-017), standard materials plus custom shaders (needed for the coverage highlight, ADR-026), orbit controls, and a modest size that can be vendored offline without a build step. It is a library, not an engine, so it does not impose an application structure.
- *Geometry and physics: own modules.* Scientific results must be reproducible, testable in Node without a browser, independent of renderer versions, and use the semantics we need (closed-mesh validation, double precision where required, winning-material intervals, entity lineage). Renderer objects never enter results, so the display library can change without touching physics.

**Alternatives considered.**

| Option | Role it could play | Why not (now) |
|---|---|---|
| Babylon.js | Display | Capable full engine but larger and more opinionated; no feature we need that Three.js lacks |
| Raw WebGL / WebGPU | Display | Far more code for the same result; WebGPU can be adopted later through Three.js |
| CesiumJS | Display of georeferenced, kilometre-scale terrain | Globe/ECEF-oriented and heavy; worth re-evaluating if large georeferenced terrain becomes central (tunnels, FR-K7) |
| VTK.js | Scientific visualisation, volume rendering | Strong for volumes (ray-cast volume rendering, transfer functions, slices, isosurfaces) and can also draw meshes. But a second WebGL stack in the same view has its own canvas and depth buffer, so it cannot correctly interleave a volume with the Three.js subject, anomaly and coverage layers; and it is a large second API. Reconstruction display starts in Three.js; VTK.js is the fallback for a separate analysis view if advanced volume rendering is needed (FR-M9) |
| Unity / Unreal (WebGL export) | Display | Heavy runtime and toolchain, not a geometry truth source (ADR-010) |
| three-mesh-bvh | Ray queries | Tied to Three.js geometry objects; we need renderer-independent buffers, closure checks, interval semantics and Node tests |
| opencascade.js (OCCT), Manifold in the browser | CAD/CSG at runtime | Large WebAssembly payloads; CSG belongs to the offline compiler (ADR-009). OCCT itself is useful offline, see ADR-009 |

**Revisit when.** A display need that Three.js serves poorly appears (large georeferenced terrain, heavy volume rendering), or WebGPU compute becomes worthwhile for batch rays (ADR-005, ADR-010).

---

## ADR-028 Retire the legacy backend; keep its UI with gated migration targets

**Status:** Accepted, implemented (owner decision 2026-10-12)

**Context.** Since OQ-3 the compiled GLB/BVH backend is the default. The legacy backend interpreted the Zhouning parametric spec in the browser (analytic kernel, 3D DDA tracer, legacy adapters and scene view) on separate releases 0.6.1/0.6.2. It cannot generalise to other subjects (ADR-016, ADR-017), doubled test and maintenance effort, and carried legacy-only fixes (FR-C2, FR-C4). Some of its features have no compiled counterpart yet.

**Decision.**
- Remove the old geometry: releases 0.6.1/0.6.2, `geometry-kernel.js`, `dda-ray-tracer.js`, `legacy-geometry-adapter.js`, `main-assessment.js`, `legacy-scene-view.js` and the legacy-only interpretation, pattern and plan adapters. The compiled backend is the only scientific backend; selection fails closed for anything else.
- Keep the main-app UI, styling and display unchanged. Features the compiled backend does not provide yet stay visible and gated by backend capabilities, together with the generic hooks they use (optional controller hooks, projection target drawing, capability gates).
- Track those features as migration targets MT-1…MT-6 ([feature requirements](FEATURE_REQUIREMENTS.md), section B). Each is re-implemented on the compiled path from the shared core and compiled geometry, superseded, or explicitly dropped by the owner; legacy heuristics are not copied back. The last commit with the legacy implementation (`e938091`) is the reference.
- Previously exported legacy results can still be replayed; their numbers are not comparable with current models (FR-C1…C3 revisions).

**Consequences.** One geometry path to test and document; legacy-only requirements resolved (FR-C4) or dropped (FR-V6); continuous water level is unavailable until MT-1/FR-E1; stations saved under the legacy release IDs are no longer shown (FR-B2).

---

## ADR-029 One subject-feature catalogue for 3D layers, projection outlines, picking, coverage and ROI

**Status:** Accepted (design settled with the owner in seven steps, 2026-10-13); catalogue (`feature-catalogue.js`, 15b-1) and display profile with recognition items (`display-profile.js`, `datasets/schemas/display-profile.schema.json`, 15b-2) implemented; the profile has its own registry hash outside the authored package integrity; consumers pending. Display profile is added to the existing release without changing its ID (owner, option a).

**Context.** Two legacy features are needed on the compiled backend: coloured internal features in 3D (MT-5) and target outlines on projections (MT-2). Several existing requirements need the same underlying idea, a named part of the subject: dataset-declared layers and targets (FR-K3), the coverage highlight on subject surfaces and internal features (FR-M10, ADR-026), cross-view of targets across stations (FR-M1), anomaly footprints in 3D and projections (FR-H9), source-entity ROI significance (FR-M3) and reconstruction targets (FR-M8). What exists today:
- The v0.7 spec gives every entity a semantic class (solids: dam body, piers, gates, platforms, …; voids: galleries, adits, observation rooms, elevator shaft, spillway bays/chutes, outlet conduits/tunnels/channels, gate chambers) and water bodies.
- Compiled components carry `sourceEntityIds`; voids and water bodies are separate components (22 direct targets verified by `semantic-mapping.js`), while all concrete solids are merged into one aggregate component, so individual solids cannot be told apart yet (FR-GE4).
- Every compiled ray already records its length per source entity (`entityLengths`, exported as `targetLengths`); the preview shows direct-target projection outlines; the main app shows none and hides void components.
- The legacy implementation used hard-coded dam IDs (elevator, spillway, platform, water, dam, gallery), DDA-cell masks and edge heuristics; it is not reused (ADR-028).

**Decision.**

*Catalogue (data).*
- A **feature catalogue** is built once per release by a generic builder in the dataset adapter from the release's own declarations: per entity and water body `semantics.class/system/imaging_role/names`; `vocabulary.classes` (colour, category); `vocabulary.systems` (group labels). One entry per entity or water body: ID, bilingual label, class, group (= system), colour (= class colour), imaging role, `direct` (own compiled component) or `aggregate` (merged; unavailable until FR-GE4). No new geometry data; generic code reads only these v0.7 fields, never dam IDs.
- An optional **display profile** sidecar (`display_profile.json`, registered, schema-validated and hashed like other sidecars, outside the geometry spec and outside result identity) declares **recognition items**: id, bilingual label, members (IDs) or a semantic/material selection (e.g. system + category; `material: concrete`), default on/off. Without a profile, one item per class among features with imaging role `reference_void` or `target` is derived.
- All consumers (3D feature layer, outlines, picking/hover, coverage emphasis, overview table, later ROI metrics FR-M3 and reconstruction targets FR-M8) read the catalogue; none keeps its own ID list.

*3D view (FR-M11).*
- Feature components are drawn from the compiled buffers in their class colours; the layer panel has one checkbox per feature group, expandable to individual features; aggregate features are not listed (the dam-concrete layer covers them); gallery, monitoring and vertical-transport groups visible by default. Context surfaces (dam, rock, water) keep the legacy-look palette.
- Picking and hover are per feature ("Upper gallery · gallery · reference void").

*Projection outlines (FR-M12).*
- Users choose **recognition items**, not catalogue entries. Only items with a non-empty mask in the current projection are listed, sorted by image coverage; default-on items are outlined at once; an "all features…" search reaches direct features. Choices are view state, remembered per release, later saved with the plan (FR-P1).
- **Mask** of an item: pixels whose central ray's length inside the item (sum over members, `L`) exceeds **T**, a display setting with default 0.1 m (`conformance_length_m.concrete`), named in the legend, adjustable, independent of pixel size, never changing results.
- **Outline** = contour of `L` at level `T`, extracted with the existing contour pipeline (d3-contour on the native grid, display mapping, constant-width SVG, contour export v1), closed at the image border; optional "show sampled pixels" staircase; legend states edges are accurate to about half a pixel (FR-V12).
- **Overlaps**: masks are independent and may overlap; outlines only by default, in item colour; same-colour items distinguished by line pattern and labels; nearer items drawn on top; optional translucent fill. Hover lists recognition items crossed by the pixel's ray in ray order with the length inside each item (the physically relevant number: material traversed, or for a void the material missing from the path) and the distance from the detector to its entry (a locating aid for order and near/far), expandable to all features. No point markers in 3D (owner, 2026-10-13: they add nothing to the drawn ray and pile up at the detector); the 3D answer is emphasising the crossed features themselves (two-way link, 15b-4).
- **Merged solids**: material items (`concrete` → "Dam concrete", `steel` → "Gates") use the same rule and are labelled as material outlines; the material envelope overlay stays in the geometry preview (see *As implemented (15b-6)*); per-solid outlines arrive with FR-GE4 without design change.

*Contours (policy).* The contour mechanism is kept (outlines, anomaly footprints FR-H9, significance FR-H6). Existing material-contribution and response contour layers move to "Expert diagnostics", off by default, no new features (FR-M14). Decision-oriented lines take priority: outlines (FR-M12), statistical precision contour 1/√N at 5 %/10 % (FR-M13), anomaly significance (FR-H6).

*Several stations (FR-M1, FR-M4).* One shared selection for all stations; each station's projection draws its own outlines; an overview table lists item × station (in view, image coverage, counts in mask, median counting error, "seen by *n* stations"); outlines from different stations are never merged into one projection.

*Coverage and linking (FR-M10).*
- Linked selection both ways: hovering an outline or hover-list entry emphasises the same features in 3D; clicking a feature in 3D toggles its item's outline.
- With coverage on, the coverage tint applies to context surfaces only; feature meshes keep their class colour and are full-opacity when in view of a selected station, faded otherwise; items seen by ≥ 2 stations get a marker.
- **"In view"** has one definition: the item's mask in that station's result is non-empty; before a result exists, a geometric bounding-box test inside the field of view, labelled approximate. The projection list, the overview table and the 3D emphasis all use it.

*Identity.* Masks, outlines and table values are derived from a result and bound to its snapshot key; selections, threshold and styles are view state.

*As implemented (15b-3, 15b-5, 2026-10-13).* Three deliberate differences from the text above, kept unless review says otherwise:
- **List.** All profile items are listed in a fixed order (profile order, then added features) instead of only in-view items sorted by coverage; out-of-view items are greyed and marked "out of view", so the list does not jump while the user changes pose. The "all features…" search is a selector of the direct features not already an item. `visibleRecognitionLayers` keeps the in-view ordering for the overview table.
- **Outline.** The outline is the boundary of the mask itself: the 0/1 mask, padded with one empty pixel on every side, contoured by d3-contour at level 0.5 (`recognition-layers.js`). It therefore agrees exactly with the strict `L > T` mask (a contour of `L` at `T` would lean towards the long side of each edge and use `≥`), and padding closes regions that touch the image border along it. It does not go through the sampled-contour overlay contract, which deliberately leaves segments at the image border open; outline export with contour export v1 is deferred.
- **Not yet built.** Optional translucent fill, the sampled-pixel staircase, nearer-on-top ordering (outlines draw in list order), the hover list's expansion to all features and the two-way 3D link (with 15b-4).

*As implemented (15b-4, 2026-10-13).*
- **Which features.** The 3D feature layer holds the direct features whose category is not `water` (`feature-layers.js`); water bodies stay context surfaces with their own layers. A component of such a feature is drawn only by the feature layer, never by a material layer, so a water-filled conduit appears in its class colour rather than as reservoir water.
- **Default visibility.** Generic rule instead of named groups: a group is shown by default when every feature in it is a reference void or imaging target. For Zhouning this gives the groups named above (galleries, vertical transport, monitoring) and leaves flood release off. Visibility is view state, remembered per release.
- **Linking.** Hovering a projection pixel emphasises (lights, and shows even if hidden) the features its ray runs through by more than T; hovering a recognition item or a layer row emphasises its features; hovering a feature in 3D shows "label · class · imaging role" and thickens its item's outline; clicking a feature toggles its item's outline, or adds the feature as an item when no item lists it.
- **Not yet.** Full opacity when in view of a selected station is part of the coverage work (FR-M10, 15a). Features inside an opaque dam are only visible with the dam made translucent (dam opacity slider).

*As implemented (15b-6, 2026-10-14).*
- **Material items** use the 15b-3 mechanism unchanged. The Zhouning profile keeps only "Dam concrete"; a steel ("Gates") item was left out by the owner, as gates are not observation targets.
- **Material envelope overlay: not in the main app (owner, 2026-10-14).** Built in 15b-6, then removed after review: its silhouette edges duplicate the material item outline ("Dam concrete" is exactly the concrete silhouette), and what remains are unlabelled air-interface depth edges ("some surface at a different depth here") that users could not attribute to any object, densest where they matter least. Identified outlines (profile items plus any direct feature from "其他构件…") carry the useful part. The overlay stays an expert diagnostic in the geometry preview; a main-app version would come back only under expert diagnostics (FR-M14), depth edges only, in a neutral colour, and after its material semantics are generalised (FR-K11).
- **Colour rule.** Hues are reserved for named features and items (their dataset class colours); overlays without identity (horizon, diagnostics) use neutral greys/white, so they can never be confused with a feature.

**The detector's own space (owner, 2026-10-14).** For a feature item, the connected stretch of a ray that starts at the detector inside the item is not counted: a detector in a gallery would otherwise see that gallery in every upward pixel (68–100 % of the image), which is correct but carries no information. Only a re-entry further out counts, for the mask, the hover crossings (entry distance measured to the re-entry) and the 3D emphasis. The readout names the items containing the detector instead. Material items are unaffected; counts are unaffected.

**Consequences.** One mechanism replaces legacy MT-2/MT-5 and serves later anomaly footprints and multi-station evaluation; a small display-profile schema is added; FR-GE4 later upgrades merged solids without redesign.

## ADR-030 Two entry points: planning app and dataset workbench, one selection contract

**Status.** Accepted (owner, 2026-10-14).

**Context.** `geometry-preview.html` grew as a developer page next to the main app. It is reachable only by URL, has its own release picker, uses only the dataset's built-in candidates and the default device, is in English, and shares code but no state with the main app. It mixes four jobs: dataset checks (scenario switch, component picking, cavity/virtual display, reference-ray material lengths, semantic audit), detector-independent and detector calculations, expert overlays (finite-model reference outlines, sampled envelope, contribution and response contours), and seven export buttons plus a comparison table. The main app already duplicates part of the overlays and the comparison ("数值图案与方案比较").

**Decision.**
- **Two pages, two jobs.** The main app (`index.html`) plans deployments on a trusted release. The **dataset workbench** (today `geometry-preview.html`, later named "数据集检查") checks a release before anyone trusts it: the `AGENTS.md` dataset checklist (control points, material points, reference rays, display = classification = ray paths) as a pass/fail screen, plus picking, scenario switch and semantic audit (FR-D10). They stay separate pages: different audience and moment, the workbench's heavy diagnostics stay out of the planning app, and a static site needs no router. Merging is reconsidered only if the UI framework (OQ-2) brings routing anyway.
- **One selection contract.** Both pages read the same URL parameters (`dataset`, `scenario`) through `application-selection.js`, and link to each other with the current selection ("数据集检查" / "打开主应用").
- **No hidden shared state.** The workbench never reads the main app's stations, device or view state from browser storage. When the versioned plan/result format exists (#11) it can open an exported plan or result file as an explicit input.
- **Each feature in one place.**
  - Expert overlays for the current station and result move into a "专家诊断" section of the main app, off by default (FR-M14): contribution and response contours now; finite-model reference outlines and a detector-independent column view when they can be served for the main app; the sampled envelope only after FR-K11, in a neutral colour.
  - Exports become one "导出" menu in the main app on the versioned result format (FR-P4): plan, full result of the current station (result plus pattern layers), comparison of saved stations or poses.
  - After both, the workbench loses its own station, comparison and export paths and keeps only the dataset-check job, in the main app's style and language.

**Consequences.** Users get one planning tool and one dataset-acceptance tool that open the same release from each other; no feature or calculation path exists twice; the dataset checklist for a second subject kind becomes a screen rather than a document.

---

## Open questions

- **OQ-2 UI framework choice** (Preact vs Svelte), decided when ADR-004 starts.
- **OQ-9 Desktop distribution need.** Is an installable offline web app (ADR-024 stage 1) enough, or is a downloadable installer required? For which operating systems, and must it work fully offline?

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
| OQ-11 Physical-coverage brightness unit | Expected counts per steradian (2026-10-12) | ADR-026, FR-M10 |
| OQ-10 Anomaly term and placement | "Anomaly"; placed after the plan format and multi-station overview, before scan performance (2026-10-12) | ADR-025, ROADMAP Phase 3 |

## Change log

- 2026-10-14: ADR-006 item 2 implemented (assessment port).
- 2026-10-14: ADR-004: caching rule until the build step (no-cache revalidation; content hashing deferred to the build).
- 2026-10-14: ADR-030 accepted: planning app and dataset workbench as two entry points with one selection contract (owner).
- 2026-10-14: ADR-029: material envelope overlay removed from the main app (owner); colour rule: hues only for named features.
- 2026-10-14: ADR-029: the detector's own space is excluded from feature masks and crossings (owner).
- 2026-10-14: ADR-029 implementation notes for 15b-6 (material envelope overlay in the main app).
- 2026-10-13: ADR-029 implementation notes for 15b-4 (feature-layer rule, default visibility, linking).
- 2026-10-13: ADR-029: numbered 3D entry markers dropped (owner); hover list leads with length.
- 2026-10-13: ADR-029 implementation notes for 15b-3/15b-5 (fixed list order, outline = mask boundary, items not yet built).
- 2026-10-13: ADR-029 accepted after seven-step discussion; consolidated decision text replaces the question list.
- 2026-10-13: ADR-029 proposed (subject-feature catalogue for MT-2/MT-5 and related requirements), open for discussion.
- 2026-10-12: ADR-028 legacy backend retired (owner); ADR-010, ADR-011, ADR-017, ADR-027 and ADR-006 item 4 updated.
- 2026-10-12: VTK.js and OpenCascade assessed: reconstruction display in Three.js first (VTK.js fallback); OCCT as offline CAD front end of compilers and the converter (ADR-009, ADR-021, ADR-027).
- 2026-10-12: ADR-001 rationale for "static" recorded; ADR-027 Three.js for display only (retrospective); README wording corrected.
- 2026-10-12: ADR-026 GPU cost estimate for integrated graphics and safeguards.
- 2026-10-12: OQ-11 resolved (per steradian); ADR-026 transparency handling: tint mixed into surface materials, front-facing shell plus internal features, minimum opacity, dashed hidden edges.
- 2026-10-12: ADR-026 defaults set (full field of view, subject surfaces); OQ-11 explanation added.
- 2026-10-12: ADR-026 clarified: per-point coverage test, highlighted surfaces, visual encoding and interaction.
- 2026-10-12: ADR-026 coverage highlight; OQ-11.
- 2026-10-12: ADR-025 accepted; OQ-10 resolved (placement before scanning).
- 2026-10-12: Term "anomaly" adopted instead of "deficiency" (owner); OQ-10 now covers placement only.
- 2026-10-12: ADR-025 anomaly hypotheses and perturbative sensitivity; OQ-10.
- 2026-10-12: ADR-016 extended with "limits of current evidence" (one RCC dam); ADR-017 marked provisional.
- 2026-10-10: ADR-024 desktop distribution; OQ-9.
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
