# Module boundaries

Ownership and dependency rules for the main application's modules. `tests/integration/main-architecture.test.mjs` checks the dependency graph and pure-module boundaries automatically; when a module's responsibility changes, update this spec and that test together. The overall current implementation is described in [the architecture spec](ARCHITECTURE.md); related decisions are ADR-002, ADR-012 and ADR-013.

## Dependency direction

Calculation modules never import views; geometry modules never import assessment or projection. The controller accepts only assessment ports and callbacks and never imports a concrete geometry backend, the DOM or a renderer. Views never trace rays or classify materials; Three.js objects never enter scientific results. Shared pure direction modules do not create a view–assessment dependency.

## Module ownership

Native ES modules without a build step; files live directly in `dist/modules` with no separate `src/` mirror (decision ADR-013, planned to be superseded by ADR-004).

| Module | Owns | Must not depend on |
| --- | --- | --- |
| application-selection / application-backends | Release/backend/scenario resolution and bounded dependency assembly | View implementations, formula copies |
| dataset-loader / feature-catalogue / display-profile / compiled-mesh-runtime | Release assets, coordinates, environment binding, material/ray truth | DOM, Three.js, projection, application controller |
| detector-defaults / device-configuration / detector-pose | Device defaults, device-form constraints, pure directions | Datasets, DOM, scene |
| deployment-state | Stations, device, response, environment; immutable inputs and commands | Views, geometry backends |
| muon-response / detector-projection | Shared physics approximations, device grid and pixel response | DOM, scene, concrete geometry backends |
| compiled-main-assessment | Same-result single-point assessment sessions; explicit geometry ports, shared core, result adapters | DOM, Three.js, concrete backend construction |
| assessment-controller | Input snapshots, scheduling, cancellation, progress and publication | Concrete backends, view implementations |
| compiled-deployment-adapter | Bounded dataset station/export conventions | DOM, scene |
| main-page | DOM binding, storage adapter, view state; calls state commands | Scientific formulas, ray implementations, scheduling loops |
| compiled-scene-view / projection-canvas-view / main-pattern-view | Scene, canvas/SVG and legends | Scientific geometry implementations, ray intersection |
| app.js | Loading, construction, injection, start-up and start-up error display | Calculation and scene implementations |

The main application's dependency graph, pure-module boundaries, snapshot/cancellation and whole-chain numerical regression are tested in `tests/unit/main-architecture.test.mjs` and `tests/integration/main-compiled-backend.test.mjs`; HTTP desktop/narrow acceptance is `scripts/check-main-compiled-app.mjs`. The standalone geometry preview is not part of main-app assembly and has not become a platform dependency.
