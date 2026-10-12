# Feature Requirements

What the platform must do, with acceptance criteria. IDs are stable. Statuses: **Needed**, **In progress**, **Done**, **Standing** (a permanent rule every dataset/change must satisfy), **Deferred** (waiting for a trigger), **Open** (needs a decision).

Product goals, users, use cases and non-goals are defined in [`../CONTEXT.md`](../CONTEXT.md) §1; this file does not repeat them. All open work lives here or in the [implementation priority](IMPLEMENTATION_PRIORITY.md); specs and guides carry no task lists (ADR-015).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Roadmap](ROADMAP.md) · [Implementation priority](IMPLEMENTATION_PRIORITY.md)

Last updated: 2026-10-10

---

## C. Correctness and reproducibility

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-C1 | Calculation results must not depend on evaluation history. | The same input gives identical results regardless of what was computed before, in any session or worker. The former flux cache (`muon-response.js`) returned the first value in a quantised bucket (up to ~5% per-pixel error near the horizon); since `legacy-quick-response@2.0.0` the integral is evaluated exactly per input. | Done |
| FR-C2 | Exports must record the actual ray length used. | Legacy results record the 500 m radial cutoff (`legacy-geometry-adapter.js`) as `config.length`/`rayLengthM` with a `radialCutoffBinds` diagnostic; the limitation text is corrected. Cross-backend comparisons disclose the differing `sampling`. | Done |
| FR-C3 | Detector acceptance formula is physically justified and documented. | Per-pixel counts use the two-plane geometric factor: projected area × slope-cell solid angle (cos⁴θ), verified by derivation, an independent Monte Carlo and the flux normalisation ([calculation model spec](specs/CALCULATION_MODEL.md) §10.3). The undeclared edge factor (≈ 0.85, grid-dependent) is removed. Model `legacy-quick-response@3.0.0`. | Done |
| FR-C4 | No dead or misleading computation in the update path. | `quickMetrics()` no longer traces 81 unused rays per update or computes the unused `12000 × sin(el)^1.7` count. | Needed |
| FR-C5 | Every result is reproducible and traceable. | Records at least the items in `CONTEXT.md` §7: app and model versions; dataset release ID and file hashes where available; coordinate convention; device; environment/scenario; stations and poses; sampling, exposure, thresholds, ray length; units; generation time; approximations and warnings. | Needed (legacy backend gaps) |
| FR-C6 | Stale results never overwrite newer state. | Holds under cancellation, caching, workers and late completion (ADR-011). | Standing |

## D. Dataset and geometry contracts

Derived from ADR-008/009. Apply to every new dataset and data-format change (`AGENTS.md` "Adding a dataset").

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-D1 | Separate dataset and schema identities. | Distinct IDs/versions, stable schema URI; different-schema releases of one data version never mix; caches and plans reference the full release ID. | Standing |
| FR-D2 | Explicit coordinate semantics. | Units, source/model frames, elevation datum, azimuth convention declared; points and directions transformed separately; negative determinant handles winding reversal; forward and inverse transforms verified with control points. Precision and control-point format still to be specified. | Standing (format spec Needed) |
| FR-D3 | Strict geometry typing. | Geometry types as a discriminated union with type-specific fields, array lengths, conditional required fields and `additionalProperties` constraints; generic schema extension mechanism defined. | Needed (generic schema) |
| FR-D4 | Separated semantic categories. | Solids, negative volumes, materials, water bodies, scenes, candidate positions, devices and site conditions kept separate; virtual geometry never participates in physics. | Standing |
| FR-D5 | Versioned classification rules. | Material priority, boundary inclusion, numerical tolerances and degeneracy policy are versioned; provenance, confidence, unknowns and typed assertions kept. Material library, density units and priority documented. | Standing (material library Needed) |
| FR-D6 | Evidence-based component mapping. | Components carry stable IDs, material, role, flags and evidenced source-entity mapping; aggregate material ownership is never guessed by name or proximity. | Standing |
| FR-D7 | Manifest binds everything. | Source digest, IR/backend versions, compile options, LOD, scenario, coordinate transform and asset checksums; declares authority between authoring source and canonical release. Dataset manifest and directory convention documented. | Standing (directory spec Needed) |
| FR-D8 | Conformance tolerances live in the dataset baseline. | Not chosen by each implementation; water connectivity, open channels, thin layers, coplanar contacts and compiled topology checked independently. | Standing |
| FR-D9 | Second real dam dataset. | Loaded through the common interface with its own adapter; abstractions revised only from evidence of a shared pattern. | Needed |

## B. Default backend (compiled)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-B1 | Close the capability gaps of the compiled default. | Since OQ-3 the default path lacks: continuous water level (FR-E1), target contours/significance and entity ROI (FR-M3, FR-GE4), coloured internal features (dataset-declared layers, FR-K3) and the flux cloud (re-implement from the shared core, no legacy heuristic copy). Each is restored on the compiled path or explicitly dropped. | Needed |
| FR-B2 | Station continuity across releases. | Stations saved under the legacy release key are not shown on the compiled default; offer station export/import between releases with coordinate validation. | Needed (later) |
| FR-B3 | Legacy compatibility scope. | Legacy-only fixes (e.g. FR-C2 ray cutoff, FR-C4 quick metrics) stay correct and labelled, but new features target the compiled path only. | Standing |

## E. Environment and scenarios

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-E1 | Unified scene resolution for continuous water level and frozen compiled scenarios. | Main app resolves both through one scene model; snapshots are never interpolated as material geometry. | Needed |

## GE. Geometry quality and known risks

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-GE1 | One implementation for hydraulic-cavity display clipping and material classification. | Visual clipping and classification derive from the same geometry; today they are two implementations that can drift. | Needed |
| FR-GE2 | Spillway top/side-wall rules move out of code. | Empirical segment rules in code are moved into the spec or the unified geometry kernel. | Needed |
| FR-GE3 | Complete external terrain. | Reservoir bed, both banks and external rock modelled; engineering bounding box no longer truncates external rock paths. Approximate dimensions (parts of spillway, bottom outlets, observation rooms, lower galleries) keep `grade`/`status`/`source`/`range` metadata. | Needed |
| FR-GE4 | Physical-domain and interface certification. | Authoritative physical-domain face/patch semantics with bounded accuracy, including structure/water clipping limits; canonical entity attribution for aggregate concrete/steel/rock. Until then, finite-model references and sampled depth/boundary diagnostics are never called certified envelopes. | Needed |
| FR-GE5 | Contour quality. | Projection contours from discrete structure masks lose or alias complex overlapping edges; replace with qualified references (ADR-014) where available. | Needed |

## X. Detector model

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-X1 | Formal definition of detector local frame and slopes `sx`, `sy`. | Written definition in `CONTEXT.md`/`specs/CALCULATION_MODEL.md`, matching `detector-pose.js`. | Needed |
| FR-X2 | Asymmetric / non-three-layer readout. | Both axes binned by their own strip count; layer count used in efficiency. Currently fixed `ε³` and `stripsX` on both axes. | Needed (later) |
| FR-X3 | Detector calibration inputs. | Effective area, trigger efficiency and direction-dependent efficiency from calibration, as explicit labelled response parameters (the former empirical edge factor was removed in FR-C3). | Needed (later) |

## V. Physics and validation

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-V1 | Per-dataset / high-risk-change validation. | Passes: schema, checksum and version consistency; control-point forward/inverse transforms; compiler assertions, closure and unexpected overlaps; `conformance_points.json` classification; `conformance_rays.json` per-material lengths; spot checks of ordinary sections, material junctions, closed cavities, open channels, steel gates and complex spillway structures; typical-view visual regression; fixed-station projection regression; component ID and material-budget alignment across GLB, fast kernel, GDML/DD4hep. Each backend records its scope and error; passing part of the tests never implies equivalence to the release compiler. | Standing |
| FR-V2 | Documented fast-model accuracy. | Applicable precision, error range and validation status stated (currently TBD in `CONTEXT.md` §1). | Needed |
| FR-V3 | Flux model provenance. | Formal citation, adopted version and unit check for the modified Gaisser formula; model versions documented for projection, flux and attenuation. | Needed |
| FR-V4 | Energy-loss validation. | Source and material applicability of continuous energy-loss coefficients; comparison with transport simulation. | Needed |
| FR-V5 | Absolute open-sky count benchmark. | Against measured or literature references. | Needed |
| FR-V6 | DDA path error. | Legacy DDA paths compared with analytic geometry / high-precision stepping. | Needed |
| FR-V7 | Angular resolution model. | Spherical convolution or response matrix replaces the 2D Gaussian display smoothing. | Needed (later) |
| FR-V8 | Statistics. | Likelihood, background model and correlated systematics replace single-pixel Gaussian significance. | Needed (later) |
| FR-V9 | Uncertainty propagation. | Geometry, density and response uncertainties propagated to results. | Needed (later) |
| FR-V10 | Measured muon maps. | Import measured maps and calibrate the fast model against them; the reconstruction pipeline (FR-M7) can then run on measured data. | Needed (later) |
| FR-V11 | Independent cross-validation of the fast response model. | E.g. against Geant4 (FR-G2). | Needed |
| FR-V12 | In-pixel ray sampling accuracy. | Each projection pixel is computed from one ray from the detector centre, while the measurement integrates over every native strip-difference direction in the pixel and over entry points across the aligned detector area. The error is measured against a converged reference (all native directions × entry points, counts averaged, not columns) for representative stations and poses, in per-pixel relative error, pull against the counting error of a typical exposure and total count. Either the approximation is documented with its measured bounds in the [calculation model spec](specs/CALCULATION_MODEL.md), or multi-ray sampling becomes an explicit, versioned calculation option with the reference as an L4 test. | In progress |

## P. Plans (deployment schemes)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-P1 | Save/load a complete plan. | Versioned, subject-neutral JSON schema with migrations; distinguishes candidate stations from the selected deployment (ADR-020): full dataset release ID (plus content hash for user-loaded datasets), stations, poses, device, response, environment/scenario, sampling, model version. Round-trip test: load → save gives an identical file. Current exports (including `compiled-deployment-snapshot` v0.1) are not full round-trip plans. | Needed |
| FR-P2 | Plans shareable without a server. | Plan files are diff-friendly and usable from git or a shared folder. | Needed |
| FR-P3 | Team plan sharing with concurrent editing, permissions and audit trail. | Only when server trigger T1 is met (ADR-001). | Deferred |

## S. Scans and ranking

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-S1 | Station/pose scan with progress and cancellation. | Scan definition stored in the plan format; cancellable; uses the same calculation core and result snapshot as single-point evaluation. | Needed |
| FR-S2 | Constraint filtering and relative ranking. | Engineering feasibility (space, transport, power, communications, maintenance), physical observability and safety/compliance recorded as separate dimensions; safety is an engineering input, never derived from projection metrics. Constraint, metric, default comparison set and ranking method definitions written down. | Needed |
| FR-S3 | Robustness against position/pose/device/geometry perturbations. | Perturbation ranges declared in the scan definition; results report spread, not only the nominal value. | Needed |
| FR-S4 | Workstation-scale performance. | A 20 stations × 36 azimuths × 7 elevations × 4 scenarios scan finishes in minutes on one workstation, via direction-map reuse and coarse-to-fine search (ADR-005). Benchmark tracked against the 2026-10-09 baseline (~10.6k rays/s/core). | Needed |
| FR-S5 | Headless batch runner. | Node CLI: reads a plan/scan file, uses all cores, writes versioned results the app can load. Same modules as the browser. | Needed |
| FR-S6 | Distributed or shared scan execution. | Only when server trigger T2 is met. | Deferred |

## H. Anomaly hypotheses and sensitivity (ADR-025)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-H1 | Anomaly definition format. | Versioned schema: region, density model, host constraint, parameters with ranges, optional development steps; stored in the plan (FR-P1) or a study file, never in a dataset release; datasets may ship suggested templates. | Needed |
| FR-H2 | Generic regions. | Sphere, ellipsoid, box, cylinder, extruded polygon and closed mesh regions in the model frame; ray–region intersection exact against analytic fixtures. | Needed |
| FR-H3 | Density models. | Void, relative change, absolute density, material replacement, fluid saturation (porosity × fluid density); per-material columns kept. | Needed |
| FR-H4 | Host clipping. | The change applies only to the declared host materials/entities inside the region, after material precedence; regions outside any host have no effect and are reported. | Needed |
| FR-H5 | Perturbative evaluation. | Baseline traced once per station/pose; variants reuse stored segments; agreement with full retracing on analytic fixtures within the fixture tolerance; same response core as single-point evaluation. | Needed (needs FR-C1) |
| FR-H6 | Sensitivity outputs. | Per pixel and per footprint: N, N′, ΔN, significance (statistical and systematic terms), exposure needed for a chosen significance; footprint outline in each projection. | Needed |
| FR-H7 | Parameter sweeps. | Sweeps over size, density change, position and development step produce sensitivity curves and minimum detectable size/contrast, comparable across plans. | Needed |
| FR-H8 | Systematics. | Nuisance variations from declared uncertainties (density ranges, unknowns, flux model, device efficiency); results with and without systematics. | Needed |
| FR-H9 | View. | Anomaly regions shown in 3D and as projection footprints from the same definition; hiding them in the view never changes physics. | Needed |
| FR-H10 | Kind generators. | Kind-specific parametric shapes (e.g. dam seepage surface, furnace cohesive zone, hearth wall thickness profile) produce generic regions; each needs a kind profile (FR-K10). | Needed (later) |
| FR-H11 | Labelling and identity. | Anomaly definitions are part of the snapshot identity; outputs are labelled simulated hypotheses. | Needed |

## M. Multi-station and reporting

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-M1 | Joint multi-station evaluation. | Coverage overlap, cross-view of targets, added information; joint objective defined. Computed from stored per-station results (ADR-020). | Needed |
| FR-M4 | Show selected stations simultaneously. | Select a subset of plan stations; 3D view shows all of them at once (marker, colour per station, field-of-view cone, ray coverage on the subject); per-station projections side by side; summary table. Clicking a station opens today's detail mode. Switching modes or toggling stations does not recompute unchanged stations. | Needed (next after plans) |
| FR-M10 | Coverage highlight on the subject. | In single- and multi-station views, an option highlights the part of the subject inside each detector's field of view, so users recognise covered regions at a glance: by default the full field of view on subject surfaces only (core field of view and terrain/water as optional toggles), crisp boundary outlines; correct under transparency (each surface tinted at most once: front-facing shell and internal features, minimum opacity for covered regions, no brightness build-up from stacked layers), matching station colour on detector and pyramid edges, below-horizon part marked as no flux; hover shows covering stations and slopes, click jumps to the projection pixel. Geometric acceptance: one colour per station, live while the pose changes. Physical acceptance: brightness from expected counts per steradian of the completed result (log scale, fixed across stations); stale maps never shown as current. Multi-station: per-station colours or combined brightness; overlaps visible. View state only (ADR-026). | Needed |
| FR-M5 | Demonstration mode. | Clean presentation layout for customers: camera presets and guided views, labels, screenshot and short animation export; numbers shown carry their limitations. | Needed (next after plans) |
| FR-M6 | Coverage metrics in 3D. | Per voxel: ray count, station count, path length and angular diversity of crossing rays; displayed as slices/volume on the subject and summarised per plan. | Needed |
| FR-M7 | Simulated multi-projection reconstruction. | From a plan: simulated counts (optional Poisson noise for the exposure) → column density per pixel → 3D density on a voxel grid; SIRT/ART and MLEM first; forward model independent of the simulation geometry (ADR-021); results labelled simulated and fully versioned. | Needed (later) |
| FR-M8 | Reconstruction quality metrics. | Against the dataset's true density: density error, contrast recovery and resolution for chosen targets (e.g. a cavity), detectability; comparable across plans. | Needed (later) |
| FR-M9 | 3D display of reconstruction results. | Slices, isosurfaces and volume rendering overlaid on the subject, anomaly hypotheses and coverage in the same scene (shared camera and depth); difference from truth; same model frame. Three.js first; VTK.js only for a separate analysis view if needed (ADR-021, ADR-027). | Needed (later) |
| FR-M2 | Result data and plan reports. | Report schema; generated from stored results, including limitations and model versions; multi-station overview and reconstruction figures included when available. | Needed |
| FR-M3 | Source-entity ROI significance on the compiled backend. | Requires FR-GE4 entity attribution. | Needed (later) |

## G. Geant4 integration

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-G1 | Export a Geant4 job package. | GDML geometry, detector, pose, macro, physics list, seed, manifest with dataset hash and model version (ADR-007). | Needed (later) |
| FR-G2 | Import Geant4 results for comparison with the fast model. | Imported results linked to their job manifest; side-by-side with fast-model projection. | Needed (later) |
| FR-G3 | Automated Geant4 job queue. | Only when server trigger T3 is met. | Deferred |

## N. Non-functional: performance and browser qualification

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-N1 | Interactive overlay budgets. | Meet the budgets in [`../PROJECTION_VALIDATION.md` §3](specs/PROJECTION_VALIDATION.md#3-performance-budget), measured in desktop and narrow-screen HTTP browsers with recorded hardware; Node timings do not close browser gates. | Needed |
| FR-N2 | Preview chunked-transfer regression. | Latest preview chunked-transfer change passes browser regression, including the narrow-screen overlay check that previously failed. | Needed |
| FR-N3 | Cold start, peak memory and worst-case interaction measured. | Recorded for the real release worst cases. | Needed |
| FR-N5 | Coverage highlight on integrated graphics. | Measured on reference laptops (Intel Core i5 with Iris Xe, and with UHD 620) at 1920×1080 in Chrome/Edge: orbiting with coverage on and 8 stations stays ≥ 30 fps (target 60 fps on Iris Xe); idle uses no GPU (on-demand rendering); automatic quality fallback (lower pixel ratio during interaction, Lambert shading, outlines off) when frame time exceeds budget. | Needed (with FR-M10) |
| FR-N4 | Layout. | Common desktop and narrow screens; WebGL camera aspect and model scale unchanged after sidebar toggle or container resize (`AGENTS.md`). | Standing |

## Q. Quality, tooling and hygiene

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-Q1 | Layered test commands. | `package.json` with `npm test` (L0–L2, < 15 s) and `test:integration`, `test:data`, `test:browser`, `test:all` per [TEST_STRATEGY](specs/TEST_STRATEGY.md); tests moved into layer directories; README updated. | Done |
| FR-Q11 | Every domain invariant is tested. | Each invariant in DOMAIN_MODEL §4 maps to at least one test that fails if it is broken; bug fixes start with a reproducing test (ADR-023). | Standing |
| FR-Q2 | Readable source. | Prettier-formatted modules and CSS in a behaviour-free commit. | Needed |
| FR-Q3 | Static type checking. | `tsc --noEmit --checkJs` passes on pure modules; branded point/direction/frame types (ADR-003). | Needed |
| FR-Q4 | Safe rendering of user text. | Station names and other user/imported text rendered with `textContent`, not `innerHTML`. | Needed |
| FR-Q5 | Azimuth input wraps. | −10° → 350°, 360° → 0° (not clamped to 0/359). | Needed |
| FR-Q6 | No stale data files. | Unused `dist/data/dam_spec.json` and `dist/data/dam_spec.schema.json` (old v0.1.0) removed; README corrected. | Done |
| FR-Q10 | Domain model kept current. | `docs/specs/DOMAIN_MODEL.md` and the `CONTEXT.md` glossary are updated in the same commit as any change to a domain concept, relationship, identity or invariant (ADR-022). | Standing |
| FR-Q9 | English documentation. | All documentation in English (OQ-4); dataset files imported byte for byte from upstream packages excepted. UI text is not documentation and is tracked separately. | Standing |
| FR-Q7 | Dev dependencies documented. | `manifold3d` (Python) listed for `check-interface-artifacts.mjs`; `jsonschema` deprecation (`RefResolver`) addressed. | Needed |
| FR-Q8 | Module dependency boundaries enforced. | Real import boundaries between dataset loading, geometry, device/deployment state, assessment and rendering audited; both backends reuse application ports; calculation runs without DOM/Three.js; views provide no geometric truth; main app does not depend on the standalone preview. Locked by automated tests. | Needed |

## K. Subject generality (ADR-016, ADR-017)

The platform evaluates any imaging subject (dams, blast furnaces, tunnels, …). Support is added kind by kind; these requirements keep the core from closing that path.

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-K1 | No subject-specific logic in generic modules. | Core, plan, scan and export code never branch on a subject kind or name; new code adds no dam terms to generic modules. Existing leaks (17 modules today) are removed as each is touched. | Standing |
| FR-K10 | Kind profile before support. | Before supporting a new subject kind or dam type, write its profile: needs on each axis of the kind variation register (display/interaction, geometry definition/semantics, regions of interest, materials, environment variables, detector placement, physics) and which parts the existing core covers. Generic code changes only where a second real example shows a shared pattern. | Standing |
| FR-K2 | Dataset-declared kind and variables. | Each dataset declares `kind` and its environment variables (name, label, unit, range, frozen variants). UI controls are generated from them; the legacy `upstream`/`downstream` pair becomes one such declaration. | Needed |
| FR-K3 | Dataset-declared layers, targets and capabilities. | Display layers, semantic targets and capability flags come from the dataset/backend declaration, not hard-coded lists such as `['dam','upwater','downwater']`. The declaration format is designed from at least two real examples (ADR-016); until then only the dam's existing lists move out of generic code. | Needed |
| FR-K4 | Material-dependent energy loss. | Energy-loss parameters (or range tables) per material instead of one rock-like `a, b` for all matter; required before high-Z subjects such as blast furnaces (iron, slag). Physics-model revision. | Needed (before non-rock subjects) |
| FR-K5 | Deep overburden and site conditions. | Flux integration valid for large columns (current `10⁵ GeV` upper limit and `Emin` range); altitude/geomagnetic corrections from site conditions. Required before tunnels/underground sites. | Needed (before tunnels) |
| FR-K6 | Detector placement inside or below material. | Stations inside solids or underground and the pose ranges they need (e.g. near-horizontal, zenith) are supported and tested on the compiled path. | Needed (later) |
| FR-K7 | Large terrain. | Kilometre-scale DEM heightfields with level of detail for display and a heightfield ray backend (ADR-010). | Needed (later) |
| FR-K8 | Per-kind baselines. | Each new subject kind ships at least one reference dataset with control points, material points and reference rays, extending the `AGENTS.md` dataset checklist. | Standing |
| FR-K9 | Generic wording in rules and context. | `AGENTS.md` and `CONTEXT.md` describe the generic platform with dams as one kind (done 2026-10-10, OQ-5). UI text still uses dam wording in places; generalise with FR-K2/K3. | Done (docs); UI Needed |

## L. User-loaded geometry (ADR-019)

Not urgent; staged after bundled datasets.

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-L1 | Load a packaged dataset from a local file or folder. | Browser File API, no server; same validation as bundled datasets (schema, checksums, closure/winding, units/frames). | Needed (later) |
| FR-L2 | Unverified labelling. | Packages without conformance baselines are marked unverified in the UI, results and exports. | Needed (later) |
| FR-L3 | Untrusted-input limits. | File size, triangle count and JSON size/depth limits; no code execution; fail closed with a clear message. | Needed (later) |
| FR-L4 | Local persistence and plan references. | Loaded datasets kept locally (IndexedDB); plans reference them by release ID plus content hash and refuse to run against a different file. | Needed (later) |
| FR-L5 | Offline converter. | CLI turns glTF/OBJ/STL (later STEP/IGES via OpenCascade, IFC via IfcOpenShell) plus a material map and frame declaration into a package; CAD input is tessellated, then passed through Manifold booleans and the compiler checks (ADR-009). | Needed (later) |
| FR-L6 | In-app light authoring. | Assign materials/densities to imported meshes, set frames/origin, declare variables. | Needed (later) |

## W. Distribution (ADR-024)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-W1 | Installable offline web app. | Web manifest and service worker cache the app and bundled datasets; after one online visit the app installs and runs offline; updates replace the cache atomically; a dataset release's integrity hashes still verify. | Needed (later) |
| FR-W2 | Downloadable desktop app. | Thin wrapper (Tauri first) packages the same `dist/` + `datasets/`; no logic beyond window, menus, native open/save dialogs and updates; exports and imports work; L5 browser checks plus a per-OS smoke test pass. Target operating systems per OQ-9. | Open (OQ-9) |
| FR-W3 | Signed, updatable installers. | Code signing/notarisation for the target OSes; versioned releases with an update channel. | Open (with FR-W2) |
| FR-W4 | Plans portable between web and desktop. | Export/import of plans (FR-P1) is the transfer path; stored state never assumes one origin. | Needed (with FR-P1) |

## A. Access and security

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-A1 | Access control for sensitive geometry. | Zhouning data is not sensitive now (OQ-1, 2026-10-10). Re-check with the data owner for each new dataset; if required, authenticated hosting before public deployment. | Not needed now |

## Change log

- 2026-10-12: Added FR-V12 in-pixel ray sampling accuracy (owner request); experiment first.
- 2026-10-12: FR-C3 done (owner decision: add cos θ and remove the edge factor in one model revision).
- 2026-10-12: FR-C2 done.
- 2026-10-12: FR-C1 done (`legacy-quick-response@2.0.0`).
- 2026-10-12: FR-M9 overlay in one scene (Three.js first); FR-L5 CAD import via OpenCascade/IfcOpenShell.
- 2026-10-12: FR-N5 integrated-GPU budget for the coverage highlight.
- 2026-10-12: FR-M10 transparency behaviour; physical brightness per steradian (OQ-11).
- 2026-10-12: FR-M10 defaults: full field of view, subject surfaces.
- 2026-10-12: FR-M10 acceptance criteria clarified (surfaces, encoding, interaction).
- 2026-10-12: Added FR-M10 coverage highlight (ADR-026).
- 2026-10-12: FR-H accepted (ADR-025) and scheduled as roadmap Phase 3.
- 2026-10-12: Renamed "deficiency" to "anomaly" (owner); FR-H unchanged otherwise.
- 2026-10-12: Added H (anomaly hypotheses and sensitivity), all Proposed pending OQ-10.
- 2026-10-12: FR-K10 kind profile; FR-K3 to be designed from two real examples.
- 2026-10-10: Added W (distribution) FR-W1…W4.
- 2026-10-10: FR-Q1 done.
- 2026-10-10: FR-Q1 layered test commands; FR-Q11 invariant tests (ADR-023).
- 2026-10-10: Added FR-Q10 (domain model kept current).
- 2026-10-10: Added FR-B1…B3 (compiled default), FR-Q9 (English docs); FR-A1 not needed now; FR-K9 docs done; FR-Q6 done.
- 2026-10-10: FR-M4, FR-M5 prioritised next after the plan format.
- 2026-10-10: Added FR-M4…M9 (simultaneous stations, demonstration mode, coverage metrics, simulated reconstruction); FR-P1 candidates vs selected deployment.
- 2026-10-10: Added K (subject generality) and L (user-loaded geometry); FR-P1 made subject-neutral.
- 2026-10-10: Moved from `docs/planning/` to `docs/` top level; links updated to `specs/` and `guides/`.
- 2026-10-10: Merged open items from `docs/ROADMAP.md`, `GEOMETRY_SPEC_REFACTOR.md` (§2, §7), `CONTEXT.md` §9, `CALCULATION_MODELS.md` §16/§18 and `GEOMETRY_AND_COORDINATES.md` §6. Added sections D, E, GE, X, V, N and FR-C6, FR-M3, FR-Q8.
- 2026-10-10: Initial requirements from review discussion.
