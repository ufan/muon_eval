# Architecture

## Current shape

The project is a static web application without a build step:

```text
app.js: release/backend/scenario selection and dependency assembly
  ├─ application-selection → application-backends → dataset-loader
  │   ├─ compiled-mesh-runtime → compiled-glb / triangle-bvh          (default)
  │   └─ legacy-geometry-adapter → geometry-kernel / dda-ray-tracer    (compatibility)
  ├─ deployment-state → device-configuration / detector-defaults
  ├─ compiled-main-assessment or main-assessment → shared detector-projection / muon-response
  ├─ assessment-controller: snapshots, cancellation, progress and result publication
  └─ main-page → compiled- or legacy-scene-view / projection-canvas-view / main-pattern-view
```

The application is served from `dist/`; dataset releases are served from the top-level `datasets/` directory at `/datasets/` (ADR-018). At runtime nothing contacts a CDN or backend API.

This document describes the current implementation and its target boundaries, not a log of completed tasks. Architecture decisions (including long-term geometry data principles) are in [ARCHITECTURE_DECISIONS](../ARCHITECTURE_DECISIONS.md); open work, requirements and priorities are kept only in the guideline documents at the top of `docs/`; other specs are listed in the [spec index](README.md).

## Core data flow

```text
dataset → computation-owned geometry adapter → view adapter → Three.js
stations / device / environment → immutable deployment-state
                   → controller captures a snapshot
                   → assessment session: (legacy: flux cloud / quick metrics) / 25² → 65²
                   → same result → DOM / canvas / Three.js / export
```

Dependency-direction rules are in the [module boundaries spec](MODULE_BOUNDARIES.md).

Inputs are owned by deployment-state and published read-only; views own selection, colour, camera and layer state. Each assessment session copies the station, device, response and environment and binds one geometry context; the preview and final passes consume the same session. When inputs change, the controller cancels pending batches and invalidates the old generation, so stale results cannot be published. Flux/bin caches are owned by the assessment instance and cleared explicitly when device settings change.

The procedural surfaces, coordinate display offsets and camera presets of the legacy scene are bounded compatibility adapters, not generic platform constants; the legacy default stations/poses and old plan JSON conventions belong to legacy-deployment-adapter. None of them is material or ray truth. The compiled main-app view reuses the computation-owned buffers of compiled-geometry-view; geometry-preview is standalone and not a main-app dependency.

## Current calculation strategy

The spectrum, integrated flux, continuous energy loss and significance formulas are in `dist/modules/muon-response.js`; native strip-difference acceptance, pixel counts, batched projection and display-resolution convolution are in `detector-projection.js`. Neither depends on the DOM or Three.js; they support different geometry backends through injected directions and ray results. `dda-ray-tracer.js` provides pure DDA traversal; `legacy-geometry-adapter.js` binds the legacy dataset/environment; `deployment-state.js` manages inputs, `assessment-controller.js` manages cancellation/scheduling, and `main-page.js` and the separate views consume results. Quick preview and final projection both call the same `createProjectionPass`.

The formulas, parameters, UI outputs and limits of each step are in the [calculation model spec](CALCULATION_MODEL.md); the meaning and use of results are in the [result interpretation guide](../guides/RESULT_INTERPRETATION.md).

- Updates run about 160 ms after a station/pose change.
- Projection computes a 25×25 quick preview, then the 65×65 final result.
- The 65×65 pixels aggregate the device's native strip-readout slope grid.
- Projection yields to the event loop between batches so the page does not freeze.
- Flux integrals and native slope bins are cached in memory.
- Device and candidate-station state is stored in `localStorage`, stations per full release ID.
- `dist/modules/dataset-loader.js` loads releases by full release ID from `datasets/registry.json`; v0.7 releases go through `dataset-validation.js` and `dam-spec-v07.js` into a versioned IR. `coordinates.js` provides independent forward/inverse point and direction transforms.
- `compiled-glb.js` decodes the GLB of a frozen scenario, `triangle-bvh.js` builds a pure-CPU spatial index over computation-owned model-coordinate buffers, and `compiled-mesh-runtime.js` provides point material classification, material segments and density integration. `compiled-geometry-view.js` uses the same position/index arrays directly; display toggles never enter calculation. `geometry-preview.html` is the standalone preview entry.
- `geometry-v07-qualification.js` is an analytic qualification backend for native v0.7 (arch sweeps, structural clipping, filled scenarios, upstream seed connectivity), using compiled terrain sampling; it does not replace production geometry. The import schema gate is `scripts/check-dataset-release.py`; HTTP loading and failure-path tests are in `tests/data/dataset-v07.test.mjs`.
- Legacy material point classification is provided by `dist/modules/geometry-kernel.js`, falling back to far-field terrain outside the near field. The control-point and 200-reference-ray regression entry is `scripts/check-geometry-conformance.mjs`; its targets are resolved from the dataset registry, not bound to a version directory.

## Current geometry backends and integration boundaries

| Entry / backend | Current use | Key limits |
| --- | --- | --- |
| Compiled mesh/BVH (default) | Default main app and standalone preview: frozen scenarios, model classification, material paths and shared device assessment | No continuous water level; aggregate source-entity attribution unresolved; the main app disables legacy targets/significance, internal proxies and the flux cloud |
| Legacy DDA (compatibility) | Legacy-format release selected explicitly: continuous water-level UI, single-station response and compatible numeric layers | Dam-specific parametric interpreter; DDA and dataset adapter are pure modules; scheduling, state and display are separated; calculation keeps legacy semantics |
| v0.7 analytic qualification | Loads spec and versioned IR by full release ID; validates analytic entities | Bounded dataset adapter, not a general v0.7 CSG executor; terrain approximation and water interval filling are not a full connectivity algorithm |

`dda-ray-tracer.js` has no runtime imports and no dependency on the DOM, Three.js, projection or compiled geometry. `createDdaRayTracer` takes explicit coordinate bounds, `maxDistanceM`, ordered densities, target IDs and `classifyPoint(x,y,z,environment)`; the returned synchronous tracer takes plain `{x,y,z}` points, unit directions and `{cellM,refineM,environment}`. `legacy-geometry-adapter.js` keeps the old document-coordinate domain, elevation 150–600 m, the 500 m distance limit and the steel fallback; these are legacy compatibility settings, not platform defaults. The adapter depends only on the geometry kernel and tracer and copies the spec, identity and terrain buffers on creation; the coordinate swap and elevation offset come from the bounded supported declaration, and directions never take translation. `bindEnvironment` returns, per calculation, immutable identity, materials, environment, coordinate transforms, `traceDoc`/`traceModel` and `traceSettings`; it never reads the DOM or current UI.

The legacy environment supports only a variable `upstream` and a dataset-fixed `downstream`; other environment fields, non-finite water levels, non-legacy datasets and unsupported coordinate conventions fail closed, without faking full hydraulic connectivity or continuous compiled scenarios. One preview/final calculation calls coordinates, classification/tracing, metadata and pattern adaptation through the same bound context; display controls never enter the tracer. Direction arithmetic in the pure detector-pose module keeps the old Vector3 operation order without a Three.js dependency; legacy scene geometry transforms belong to the view.

Traversal keeps the entry offset, three-point sampling, up to eight subdivision levels, per-material cell merging and the 10,000-iteration guard. It therefore remains a legacy approximation, not exact interface tracing; missed thin structures, cell merging that ignores target labels and the historical guard behaviour were not changed in the extraction. `tests/integration/dda-ray-tracer.test.mjs` verifies real reference directions, boundary/reverse/parallel grids, different water levels, full 25/65 projections and dependency boundaries against frozen test baselines. Test baselines live only in `tests/fixtures` and are never referenced at runtime.

The registry distinguishes different schemas of the same data version by full release ID. The loader verifies source/manifest/asset digests, scenarios and cross-references; the main app first resolves the full release/backend/scenario, then calls `loadDataset(releaseId)`. `loadDefaultDataset` is kept only for legacy compatibility calls and is not used for main-app assembly. Control points and reference rays are based on the dataset resolved from the registry.

GLB decoding accepts only supported frozen static indexed triangles, handling node transforms, accessor layout and winding reversal; external buffers, sparse accessors, compression, animation/skinning and unregistered nodes fail closed. Physical components are checked against the manifest, materials and closure/winding/net volume; virtual geometry gets no physical BVH. Positions/indices are owned by computation; the view only uses the shared buffers and the Z-up → Y-up display transform, and owns normals and materials.

The BVH merges hits on shared triangle edges, accumulates no length for tangent/on-surface contact, and supports origins inside solids and closed cavities. Component intervals are resolved by explicit material priority; component intersection length, semantic occupancy length and winning-material length are different quantities. Direct targets depend only on canonical IDs and explicit source mapping; aggregate concrete/steel/rock never fakes entity ownership.

The two preview graphs are the uniform-slope material integral and the shared response assessment under device strip-difference acceptance; they are not aligned by pixel index. The compiled device adapter is limited to the supported three-layer symmetric readout; uncalibrated parameters are never guessed from dataset names. Adaptive/fixed material colour scales never change scientific values; per-face normals only control visual sharp edges. The sampled occupancy/air-depth edges of `material-envelopes.js` are display diagnostics, not certified envelopes; see the [projection workflow](../guides/PROJECTION_WORKFLOW.md).

### Geometry verification entry points

Reproduction entry points (no single-run scores or performance logs are kept here):

```sh
python3 scripts/check-dataset-release.py
node --test tests/data/dataset-v07.test.mjs tests/data/compiled-mesh.test.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0 --backend compiled
node scripts/check-semantic-mapping.mjs
```

The Zhouning release IDs in these commands are dataset examples, not platform rules. The conformance script reports whether qualification and release thresholds are met and keeps the maximum error; the analytic migration tolerance must not stand in for the compiled release tolerance. Control-point checks exclude points within 5 m of the terrain surface, so that band is not covered; the exact numerical policy is defined by the script and dataset baselines and is not a survey-accuracy claim.

Optional HTTP browser check: `node scripts/check-compiled-preview.mjs`, accepting `--playwright /absolute/path/to/playwright/index.mjs`. Playwright/Chromium are development dependencies only; screenshots go to a temporary directory. It checks desktop/narrow layouts, shared display/calculation, picking, scenarios, cancellation and the main app. Open regressions and performance limits are in the [feature requirements](../FEATURE_REQUIREMENTS.md) (FR-N); old test results are never cited as passing.

## Current projection and interpretation modules

`dist/modules/material-projection.js` is a local-slope projection evaluator independent of the DOM/Three.js that reuses the mesh ray core through the injected runtime's `traceRayModel`. The preview consumes its material-path and column-density maps; it does not replace the main app's device-weighted count projection.

`compiled-assessment.js` is a pure adapter from the BVH to the shared `createProjectionPass`, using the model vertical direction cosine and material column density, providing counts/transmission, display smoothing, metadata and cancellation for the four frozen scenarios. The device/response defaults in `detector-defaults.js` are independent of the dataset and shared by the main app and preview. `createCompiledAssessmentPass` provides the same validation, direction sampling, batched advance and result adaptation; `evaluateCompiledAssessment` is the async wrapper for preview/batch calls, and compiled-main-assessment provides sessions for the main controller. The two paths duplicate neither formulas nor tracing. Source-entity ROI is not available yet.

`legacy-target-interpretation.js` consumes the same legacy trace and bound material snapshot, independent of geometry backends, the DOM, Three.js and projection modules; it references only the shared muon-response maths. `createLegacyTargetInterpreter` copies ordered target IDs and water/concrete densities and derives `edgeProfile`, `targetMask` and `counterfactualMwe` without rewriting raw paths or cells. Whole cells with `t0 < 2 m` are excluded from target adjustment (not split at 2 m); the mask uses strictly greater than 0.15 m; the first dense/concrete entry still includes near cells; a missing entry keeps the legacy internal representation `Infinity`.

`evaluateLegacyTargetSignificance` takes an explicit flux and systematic error; a miss or `dam` returns zero, other targets call the shared minimum-energy and significance formulas. Selection belongs to view state, the significance cache to the assessment session, the final-result gate to the controller and target-outline drawing to projection-canvas-view. Water removal, filling cavities with concrete, removing non-dam concrete and clamping at zero are old-model heuristics that prove neither source-entity ownership nor detectability; the module is not used for compiled entity ROI.

`semantic-mapping.js` audits only explicit canonical source IDs and builds the direct-target index; runtime point/ray queries and render picking use the same IDs. Both projections record each ray's semantic volume intersection length for direct-target outlines; entity ownership of aggregate materials and counterfactual ROI significance remain unresolved.

`projection-pattern-fields.js` turns the same calculation's native grid, material paths/column density and the pre-snapshotted geometry metadata into standardized fields, and maps the D3 numerical contours of `contribution-contours.js` onto each graph's own equal-width display cells. Detector-weighted slope centres are mapped piecewise, never aligned with the material graph by pixel index; the two graphs are extracted independently without resampling or a copied response formula. The preview adds independent material/quantity/level controls; `contribution-view.js` only consumes mapped line data to produce fixed-CSS-pixel-width SVG; caches scoped to results and extraction settings never modify scientific arrays. `contribution-export.js` provides a separate v1 contour export and offline replay validation; display styles do not enter scientific identity and old result exports are not migrated. Worst-case browser performance is still to be verified.

Asynchronous layer computation: `numeric-pattern-work.js` reuses the pure fields, D3 extraction and native-grid mapping core above; `numeric-pattern-worker.js` keeps only each graph's current reduced scalar inputs and never retraces rays. `numeric-pattern-client.js` manages asynchronous work with result identity, settings keys and bounded caches; when inputs change it terminates the worker and clears tasks so stale results cannot update the current graph. The UI only inserts SVG paths, legends and provenance prepared by the worker. The structural-reference worker likewise performs field validation, mapping and path-text preparation and keeps the raw slope-space lines for export. Diagnostics from `pattern-timing.js` never enter scientific results; `demand-render.js` schedules 3D rendering on demand and keeps camera damping. Open items are in the [implementation priority](../IMPLEMENTATION_PRIORITY.md); these changes do not represent physical-interface certification.

The structural-reference pure core is split into `structural-reference-candidates.js` (reused/validated VTK candidate edges), `structural-reference-qualification.js` (validation and filtering of explicit whole-face qualification records) and `structural-reference-projection.js` (whole-segment field/radial-range clipping before perspective division). These modules do not depend on a renderer and do not modify ray/response results; they serve explicit face qualification and finite-model consumers. The finite-model preview is connected; real physical-interface certification is not done. The compiler domain-cap development audit and its limits are in the [structural reference contract](GEOMETRY_REFERENCE_CONTRACT.md#candidate-qualification-and-projection).

Development has validated [Manifold CSG reuse](GEOMETRY_REFERENCES.md#offline-interface-construction): volumes are split by the shared material priority, then the global finite mesh–air boundary is extracted, keeping input component/triangle lineage and handling partial contact faces. It is not a browser runtime dependency and does not replace the scientific meshes; derived-asset source binding and finite-model consumption are implemented, but they do not represent real physical-domain certification. The qualification adapter can explicitly enable coplanar material-transition edges between two qualified air interfaces and never treats domain caps or unknown faces as physical outlines.

The [derived interface artifact](GEOMETRY_REFERENCE_CONTRACT.md#derived-interface-artifact-contract) v1.0.0 implements source/scenario/geometry hashes, native input receipts, domain policy and face-lineage binding, plus pure-module validation; the development generator writes to a fresh temporary directory by default and never changes release assets. Loaded Float64 derived buffers are checked with the same `triangle-bvh.js` for air/non-air intervals; the consistency check compares non-air intervals, endpoints and lengths and requires the scientific buffers to be unchanged. The artifact does not grant physical-envelope qualification; finite-model reference lines are used in the preview; real physical-domain certification and worst-case browser performance are not done. The BVH accepts both Float32 and Float64; existing scientific inputs remain Float32 with unchanged numerical behaviour.

Decisions on the geometry data contract, Geometry IR, runtime artifacts and DD4hep/GDML backends are ADR-008…011 and ADR-016/017 in [ARCHITECTURE_DECISIONS](../ARCHITECTURE_DECISIONS.md); data-contract requirements are FR-D in the feature requirements.

Finite-model operation and contracts are in the [projection workflow](../guides/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison): `finite-reference-worker.js` validates the separate derived assets and `finite-model-references.js` consumes finite-model boundaries (without granting real physical-interface qualification). Separate reference lines, response numeric contours, open-sky context, hover lineage and v1 layer/comparison export are connected. `response-patterns.js` uses the open-sky counts kept directly by the shared response; `pattern-comparison.js` defines common metrics and `pattern-comparison-batch.js` reuses the single-station scientific core for explicit small batches. `legacy-pattern-adapter.js` and `main-pattern-view.js` bring compatible numeric layers and comparison into the main app, keeping the legacy DDA identity on the legacy backend; compiled reference lines are still shown only in the standalone preview. Physics formulas and released geometry are unchanged.

## Explicit main-app backend selection

application-selection validates the full release ID and compatible backend against the registry; without an explicit selection it uses the registry default, which is the compiled v0.7 release (OQ-3, 2026-10-10). The backend follows from the release: compiled for `dam-spec-v07` releases, legacy otherwise. application-backends is bounded dependency assembly, not a plugin system: compiled binds one GLB/BVH runtime for a registered frozen scenario (the first scenario when none is given); legacy keeps the original coordinates/DDA/continuous-water behaviour. Wrong scenarios, unknown releases or incompatible backends fail closed without trying another backend.

The main controller consumes only the createSession/projection/advance/complete ports. A compiled session captures the same station, device, response and frozen variables and rejects other environment values; 25² and 65² both reuse compiled-assessment. The ray length is the distance from the station to the farthest corner of the finite model bounds, enclosing all published meshes; exceeding the supported range is an error, never a silent truncation. Unknown material outside the domain can still lead to overestimated transmission.

The UI disables, from capabilities, the unsupported continuous water level, legacy targets/significance, coloured internal proxies and flux cloud. Model coordinates and scientific results never use Three.js objects; views consume only buffers and same-result segments. Switching release/scenario reloads the full page, clearing old tasks; station storage is isolated per release ID and device configuration is independent. The legacy plan export format is kept; the compiled-deployment-snapshot v0.1 records source, assets, model domain, scenario, device and central ray, without claiming full plan save/load.

Both backends, the four scenarios, rejection paths and numerical consistency are tested in `tests/integration/main-compiled-backend.test.mjs`; HTTP acceptance is `scripts/check-main-compiled-app.mjs` (default compiled app) and `scripts/check-main-app.mjs` (legacy release). Material points and reference rays keep using the release conformance thresholds; passing the P95 threshold does not mean zero maximum error or a certified physical domain.

## Main-app source entry points

The module ownership and forbidden-dependency table is the [module boundaries spec](MODULE_BOUNDARIES.md).

## Refactoring principles

Moved to [ARCHITECTURE_DECISIONS ADR-012](../ARCHITECTURE_DECISIONS.md#adr-012-refactoring-principles).

## Recommended test layers

1. Unit tests: coordinate round trips, point classification, material density, device slope grid.
2. Geometry regression: material labels/lengths at selected points and standard rays.
3. Projection regression: total count, transmission and selected pixels for a fixed spec, station and device.
4. UI smoke tests: switching stations/poses, sidebar, projection modes, save/load.
5. Visual regression: typical perspective, upstream elevation, cross-section and plan views.
