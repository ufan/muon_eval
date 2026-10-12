# Muography Deployment Evaluation

A static web application (all calculation runs in the browser; no server-side computation) for exploring muography detector deployments. Geometry and physics are framework-free JavaScript; Three.js is used only for 3D display. It covers candidate stations, poses, material paths and expected projections for an imaging subject. The bundled Zhouning lower-reservoir dam is the first dataset and validation case; the platform is designed to support other dams and other subject kinds (blast furnaces, tunnels, …) gradually.

## Quick start

Docker:

```bash
docker compose up -d --build
```

Open `http://localhost:8080/`.

Any static HTTP server works once the datasets are copied into `dist/`:

```bash
node scripts/sync-datasets.mjs
python3 -m http.server 8765 --directory dist
```

Open `http://127.0.0.1:8765/`. Do not open `dist/index.html` directly: browsers block ES modules and JSON on `file://` pages. See [the deployment guide](docs/guides/DEPLOYMENT.md) for servers and static hosting.

## Directory layout

- `AGENTS.md`: development rules and verification requirements for all contributors and tools.
- `CONTEXT.md`: use cases, geometry semantics, terminology and current datasets.
- `docs/`: the four guideline documents ([architecture decisions](docs/ARCHITECTURE_DECISIONS.md), [feature requirements](docs/FEATURE_REQUIREMENTS.md), [roadmap](docs/ROADMAP.md), [implementation priority](docs/IMPLEMENTATION_PRIORITY.md)); all open work is tracked only there.
  - `docs/specs/`: modular specifications (architecture, module boundaries, calculation model, geometry reference contract, projection data and validation); index in [specs/README](docs/specs/README.md).
  - `docs/guides/`: result interpretation, projection workflow, deployment and repository migration.
- `datasets/`: versioned dataset releases and their descriptions; registry `datasets/registry.json` ([datasets/README](datasets/README.md)).
- `dist/`: the static application (web root).
  - `index.html`: page and controls; `geometry-preview.html`: standalone compiled-geometry preview.
  - `app.js`: loads the dataset, assembles modules and starts the app; contains no calculation or scene code.
  - `modules/application-selection.js`, `application-backends.js`: explicit release/backend/scenario resolution and bounded assembly; no automatic backend fallback.
  - `modules/deployment-state.js`, `assessment-controller.js`: application input state, calculation snapshots, scheduling and cancellation.
  - `modules/compiled-main-assessment.js`: main-app session for frozen BVH scenarios, reusing the batched evaluation and result adapter of `compiled-assessment.js`.
  - `modules/main-assessment.js`: legacy single-point evaluation with an injected geometry interface, reusing the shared ray/response core.
  - `modules/main-page.js`, `compiled-scene-view.js`, `legacy-scene-view.js`, `projection-canvas-view.js`: DOM, 3D display and result layers; none owns scientific geometry.
  - `style.css`, `projection.css`, `layout-overrides.css`: base, projection and responsive styles.
  - `vendor/`: offline Three.js 0.186.0 and d3-contour.
- `scripts/`: checks, benchmarks and tooling (`sync-datasets.mjs` for static hosting).
- `tests/`: Node test suite.
- `.openai/hosting.json`: optional binding for the current hosted instance; not used at runtime.

## Current capabilities

- Compiled GLB/BVH geometry backend (default) with frozen scenarios, display and calculation sharing the same model buffers; legacy parametric dam backend with continuous water level as a compatibility path.
- Internal features (galleries, observation rooms, elevator shafts) and hollowed voids (spillway openings, chutes) in the 3D view.
- Adding, removing and editing candidate stations, positions and poses; azimuth/elevation inputs synchronized with sliders.
- Configurable detector geometry and response parameters.
- Material classification and water-equivalent column density along rays.
- 25×25 quick preview and 65×65 final projection.
- Expected counts, transmission, material-contribution and response numeric layers; legacy structural significance and target contours on the legacy backend.
- Hovering a projection pixel highlights the 3D ray and material path.
- Station metrics, comparison, versioned snapshot export; legacy 3D flux cloud.
- Docker/Nginx and static-hosting deployment.

## Checks

Layered test commands ([test strategy](docs/specs/TEST_STRATEGY.md)); no npm packages are needed:

```bash
npm test                    # L0 syntax/whitespace + L1 unit + L2 contract, ~5 s; every commit
npm run test:data           # L3 dataset releases, conformance, semantic mapping (needs Python jsonschema>=4.10)
npm run test:integration    # L4 whole calculation chain on real datasets, ~25 s; before push
npm run test:browser        # L5 main app, compiled default and legacy release; minutes
npm run test:all            # everything above
```

Detailed rules are in `AGENTS.md`.

Browser acceptance needs Playwright and Chromium (development only). Point to existing installs with `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs` and `CHROMIUM_PATH=/path/to/chromium`, or pass `--playwright`/`--chromium` to the scripts directly.

- `scripts/check-main-compiled-app.mjs`: default compiled app; all four frozen scenarios, explicit switch to legacy, capability gates, model coordinates, same-result updates, exports, desktop and narrow screens. Screenshots go to a temporary directory.
- `scripts/check-main-app.mjs`: legacy release (`?dataset=zhouning-lower-reservoir-dam%400.6.2&backend=legacy`); desktop/narrow, layers, fast pose changes, devices/stations, persistence and exports.
- `npm run test:browser:preview` (`scripts/check-compiled-preview.mjs`): standalone preview. Its finite-model reference step needs the derived assets in `dist/data/derived-interfaces/`, generated with the `manifold3d` Python package (see [geometry references](docs/specs/GEOMETRY_REFERENCES.md#offline-interface-construction)).

## Selecting a release, backend and scenario

The main app opens on the default release `zhouning-lower-reservoir-dam@0.6.2+schema0.7.0` with the compiled backend and its first frozen scenario. Under "dataset and backend" in the left panel you can choose a release and a low/mid/high/extreme scenario, then load the selection. A URL can select it directly:

```text
/?dataset=zhouning-lower-reservoir-dam%400.6.2%2Bschema0.7.0&backend=compiled&scenario=low
/?dataset=zhouning-lower-reservoir-dam%400.6.2&backend=legacy
```

`+` must be encoded as `%2B`; the UI generates correct URLs. Release, backend and scenario are validated against each other; unknown combinations fail closed and never fall back to another backend or scenario. Switching configuration reloads the page, so an old calculation cannot update a new scene. Candidate stations are stored per full release ID; device settings are independent.

On the compiled backend the main app provides station/pose and device editing, counts/transmission, material-contribution and response numeric layers, material-path hover, comparison and versioned snapshot export. Continuous water level, legacy target contours/source-entity significance, coloured internal proxies and the legacy flux cloud are disabled; counterfactual rules of the old geometry are never applied. Scene and calculation share the GLB model buffers; materials, camera and display toggles never enter physics.

The legacy release keeps continuous water level and the compatibility features. The compiled backend's finite domain, aggregate source-entity attribution and lack of physical calibration remain; neither backend provides construction-grade results or certified physical domains. Current integration boundaries are described in [the architecture spec](docs/specs/ARCHITECTURE.md#current-geometry-backends-and-integration-boundaries); open work is in the [roadmap](docs/ROADMAP.md).

## Standalone geometry preview

`/geometry-preview.html` (over HTTP) shows the shared mesh/BVH backend: four published scenarios, reference-point ray material lengths, cavity/virtual geometry display and component picking. Display and calculation use the same model-coordinate buffers. The preview is independent of the main app and does not support continuous water level or full target significance. Asset verification also runs over LAN HTTP; there are no runtime external dependencies.

- **Column-density maps** at 25×25 / 65×65 in detector-local slope space; clicking a pixel shows the same backend's ray path; JSON export carries release, scenario, pose, sampling and limitations. This map qualifies material paths only; it is not an acceptance-weighted count, transmission or ROI significance.
- **Colour scale**: adaptive log scale robust to outliers (P98 of positive pixels) by default, with the legend listing the upper limit and saturated pixels; a fixed linear scale is available for cross-view comparison. Colour scaling never changes material paths, column densities or exported values.
- **Detector assessment** uses the shared response core to compute acceptance-weighted counts and transmission for all four scenarios, with configurable exposure time and angular flux model and full parameter/version export. The device uses explicitly labelled platform defaults, not a calibration of the model named in the data package. The device's full field of view is independent of the material map's half-angle; display smoothing never changes raw counts, paths or exports.
- **Verified semantic targets** select water bodies/cavities directly mapped from published components and show the projection mask outline and semantic volume length along rays. All four scenarios have 22 direct targets; concrete, steel gates and rock remain aggregated, and 22 entities lack separate compiled ownership. A mask is not material ownership or counterfactual significance. Exports contain per-pixel target lengths and the full audit; `check-semantic-mapping.mjs` produces a reproducible mapping report for all scenarios.
- **Material envelopes** (on by default): white for concrete, orange for near-field rock, computed from material occupancy and air transitions of the same BVH rays, independent of entity mapping or colour contrast; the air-transition depth-jump feature can be turned off. They are limited by angular sampling and published mesh bounds and are not exact CAD edges; display toggles never change results.
- **Material contribution contours**: per-material contours of path length (m) or water-equivalent contribution (m.w.e.), with explicit physical levels or labelled adaptive inspection levels. Each graph uses its own sampling coordinates; separate SVG layers keep CSS-pixel line widths; turning depth/boundary diagnostics off does not affect contribution lines. Legends record levels, coverage and incomplete/ambiguous states. Adaptive levels are not comparable across views. Each graph has its own contour JSON v1 export with fields, levels, source snapshot and completeness; display settings are stored separately and the original raw JSON is unchanged. See [contour controls](docs/guides/PROJECTION_WORKFLOW.md#material-contour-controls) and the [export/replay contract](docs/specs/PROJECTION_DATA.md#contour-export-and-replay).
- **Finite-model interpretation** ([workflow](docs/guides/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison)): approved finite-model reference lines, open-sky/acceptance interpretation, reproducible station/pose comparison and v1 export/replay, including offline generation of the derived preview assets.

## Current hosted instance

`https://zhouning-muon-deployment.zyong06.chatgpt.site/`

This address is only the current hosted instance and is not a development-environment or AI-tool dependency. Keep `.openai/hosting.json` to continue publishing to the same instance (run `node scripts/sync-datasets.mjs` first so `dist/` contains the datasets); ignore it when using another host.
