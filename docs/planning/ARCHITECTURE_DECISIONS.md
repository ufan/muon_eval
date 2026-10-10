# Architecture Decisions

Decision log for the platform's architecture. Each entry records the context, the decision, its status and what would make us revisit it. Statuses: **Accepted** (agreed), **Proposed** (recommended, not yet confirmed), **Superseded**, **Open** (needs a decision).

Related: [Feature requirements](FEATURE_REQUIREMENTS.md) · [Roadmap](ROADMAP.md) · [Implementation priority](IMPLEMENTATION_PRIORITY.md) · current architecture in [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

Last updated: 2026-10-10

---

## ADR-001 Stay an offline static app; no backend for now

**Status:** Accepted

**Context.** All computation runs in one browser. The app is served as a static folder (`dist/`) through local HTTP, Docker/nginx or static hosting. `AGENTS.md` requires offline operation without runtime CDN or external services.

**Decision.** Do not build a server or a React-plus-backend stack yet. Add a backend only when one of these triggers is actually observed:

| Trigger | Signal to watch | Cheaper step to try first |
|---|---|---|
| T1 Shared plans across a team | "Which file is current?" confusion; need for concurrent editing, permissions, sign-off/audit trail | Versioned plan JSON (schema version + full dataset release ID) kept in git or a shared folder |
| T2 Scans too big for one PC | Scans regularly don't finish overnight on a good workstation; several people need big scans at once; results must be shared, not recomputed | Headless Node batch runner on a workstation, using all cores (see ADR-005, ADR-006) |
| T3 Geant4 runs | Geant4 validation becomes routine (e.g. per shortlisted site) rather than occasional | "Export Geant4 job package" + manual cluster run + result import (ADR-007) |
| T4 Access control (candidate) | Dam geometry judged sensitive by its owner | Authenticated hosting; may force a server earlier than T1–T3 (see OQ-1) |

**If a backend is built:** keep it small (file/object storage + job queue, possibly a small database for plans/users). Workers run the same calculation modules. The browser app stays usable offline for single-person, single-site work.

## ADR-002 Calculation core stays framework-free and runs in browser and Node

**Status:** Accepted

**Context.** Calculation modules (`dist/modules/*` such as `muon-response.js`, `detector-projection.js`, `dda-ray-tracer.js`, `triangle-bvh.js`, `compiled-assessment.js`) have no DOM or Three.js dependency and already run under `node --test` and `scripts/`.

**Decision.** Keep the calculation core as plain modules with no UI framework or rendering dependency. Every consumer (interactive UI, scans, ranking, export, batch runner, any future server worker) uses this one core; no second copy of formulas in another language or layer.

## ADR-003 Static type checking without a build step first

**Status:** Proposed

**Context.** An external review suggested Vite + TypeScript first to catch unit and point-versus-direction mistakes. In practice the frame mix-ups that matter here (document vs model coordinates with x/y swap; `{x,y,z}` legacy vs `[x,y,z]` compiled) are only caught by deliberately branded types. The known result-changing issues (flux cache, ray cutoff, acceptance factor) are not type errors and need physics tests.

**Decision.**
- Add `// @ts-check` + JSDoc types to the pure calculation modules and run `tsc --noEmit --checkJs` in tests. `dist/` remains the runnable source.
- Introduce branded types for `ModelPoint`, `DocPoint`, `Direction` (and frame tags). Do not brand physical units (metres, m.w.e.) unless a concrete bug justifies it.
- Reformat the dense one-line source with Prettier in a separate, behaviour-free commit.

**Revisit when:** a build step is adopted (ADR-004); at that point converting to `.ts` becomes cheap.

## ADR-004 Build step and UI framework arrive together with the first new screen

**Status:** Proposed

**Decision.**
- Adopt Vite plus a small UI framework (Preact or Svelte; choose at that time) when building the first new plan or scan screen, not before.
- Use the framework for new form/list/table screens only. The 3D scene and projection canvas stay framework-free. The old page is migrated piece by piece.
- Framework state must not own calculation inputs or results; the existing deployment state and assessment controller remain the source.
- The switch moves source to `src/` with a built static output. In the same change, update hosting binding (`.openai/hosting.json`), Docker/nginx, `serve.ps1`, `AGENTS.md` checks (`node --check dist/app.js`) and README.

## ADR-005 Performance strategy: algorithm first, native code last

**Status:** Proposed

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
4. Only if still needed: Rust or C++ compiled to WebAssembly, so the same binary runs in browser and server. A Node-only native addon (Embree) or GPU only at much larger scale.

Any replacement tracer must pass the existing `conformance_rays.json` / `conformance_points.json` checks before being trusted.

## ADR-006 Prepare server seams now, build no server code

**Status:** Proposed

**Context.** Already server-friendly: framework-free core runnable in Node; `createSession(input)` takes a detached snapshot; versioned JSON results with identity/model version; SHA-256-verified dataset releases; message-passing Workers; `main-page.js` takes `storage` as a parameter.

**Decision.** Close these gaps before any server work, since each is cheap now and expensive later:
1. Plan / scan / result schemas, versioned with migrations; they become the future API contract.
2. Asynchronous, cancellable assessment port (Promise + AbortSignal, as `evaluateCompiledAssessment` already does); only `assessment-controller.js` changes.
3. Deterministic calculation: no result may depend on evaluation history (see FR-C1).
4. Traceable results for every backend: legacy results need equivalent identity and must record the actual ray cutoff, or server scans are compiled-backend only.
5. Headless batch runner (Node CLI: plan in, results out) that later becomes the server worker unchanged.
6. Server language: Node reusing the same modules. If Python is preferred for orchestration, it calls Node/WebAssembly workers; formulas are never reimplemented.

## ADR-007 Geant4 runs as an external job, not inside the app

**Status:** Proposed

**Decision.** The app exports a Geant4 job package (geometry e.g. GDML, detector, pose, macro, physics list, seed, manifest with dataset hash and model version). Runs happen externally (cluster). The app imports result JSON linked to the exact inputs. Automate with a job queue only when T3 is met.

---

## Open questions

- **OQ-1 Sensitivity of dam geometry.** The current public instance serves full geometry to anyone with the URL. Confirm with the data owner whether access control is required; if so, T4 applies.
- **OQ-2 UI framework choice** (Preact vs Svelte), decided when ADR-004 starts.

## Change log

- 2026-10-10: Initial log from review discussion (ADR-001…007, OQ-1…2).
