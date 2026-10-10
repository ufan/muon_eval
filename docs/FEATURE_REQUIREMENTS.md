# Feature Requirements

What the platform must do, with acceptance criteria. IDs are stable. Statuses: **Needed**, **In progress**, **Done**, **Standing** (a permanent rule every dataset/change must satisfy), **Deferred** (waiting for a trigger), **Open** (needs a decision).

Product goals, users, use cases and non-goals are defined in [`../CONTEXT.md`](../CONTEXT.md) §1; this file does not repeat them. All open work lives here or in the [implementation priority](IMPLEMENTATION_PRIORITY.md); specs and guides carry no task lists (ADR-015).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Roadmap](ROADMAP.md) · [Implementation priority](IMPLEMENTATION_PRIORITY.md)

Last updated: 2026-10-10

---

## C. Correctness and reproducibility

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-C1 | Calculation results must not depend on evaluation history. | The same input gives identical results regardless of what was computed before, in any session or worker. Today the flux cache (`muon-response.js`) returns the first value in a quantised bucket: measured up to ~5% per-pixel error near the horizon (cosZ 0.1, Emin 5 GeV), while [calculation model spec](specs/CALCULATION_MODEL.md) §2 says "last few digits". Fix is labelled as a physics-model revision with a new `RESPONSE_MODEL_VERSION`. | Needed |
| FR-C2 | Exports must record the actual ray length used. | Legacy results record the 500 m radial cutoff (`legacy-geometry-adapter.js`); the "not a radial cutoff" limitation text is corrected. Cross-backend comparisons state the different ray lengths, or the legacy cap is aligned with the compiled enclosing length. | Needed |
| FR-C3 | Detector acceptance formula is physically justified and documented. | Decide whether the per-pixel count includes the projected-area cos θ factor (currently cos³θ; planar detectors normally need cos⁴θ, ~1.7× at the default field edge, ~2.2× at corners). Either fix (model revision) or document the omission in [calculation model spec](specs/CALCULATION_MODEL.md) §10. | Open |
| FR-C4 | No dead or misleading computation in the update path. | `quickMetrics()` no longer traces 81 unused rays per update or computes the unused `12000 × sin(el)^1.7` count. | Needed |
| FR-C5 | Every result is reproducible and traceable. | Records at least the items in `CONTEXT.md` §7: app and model versions; dataset release ID and file hashes where available; coordinate convention; device; environment/scenario; stations and poses; sampling, exposure, thresholds, ray length; units; generation time; approximations and warnings. | Needed (legacy backend gaps) |
| FR-C6 | Stale results never overwrite newer state. | Holds under cancellation, caching, workers and late completion (ADR-011). | Standing |

## D. Dataset and geometry contracts

Derived from ADR-008/009. Apply to every new dataset and data-format change (`AGENTS.md` "新增坝体数据集").

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
| FR-X3 | Detector calibration inputs. | Effective area, trigger efficiency and direction-dependent efficiency from calibration, replacing the empirical edge factor. | Needed (later) |

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
| FR-V10 | Measured muon maps. | Import measured maps and calibrate the fast model against them. | Needed (later) |
| FR-V11 | Independent cross-validation of the fast response model. | E.g. against Geant4 (FR-G2). | Needed |

## P. Plans (deployment schemes)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-P1 | Save/load a complete plan. | Versioned, subject-neutral JSON schema with migrations: full dataset release ID (plus content hash for user-loaded datasets), stations, poses, device, response, environment/scenario, sampling, model version. Round-trip test: load → save gives an identical file. Current exports (including `compiled-deployment-snapshot` v0.1) are not full round-trip plans. | Needed |
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

## M. Multi-station and reporting

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-M1 | Joint multi-station evaluation. | Coverage overlap, cross-view of targets, added information; joint objective defined. | Needed |
| FR-M2 | Result data and plan reports. | Report schema; generated from stored results, including limitations and model versions; animation only on real demand. | Needed |
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
| FR-N4 | Layout. | Common desktop and narrow screens; WebGL camera aspect and model scale unchanged after sidebar toggle or container resize (`AGENTS.md`). | Standing |

## Q. Quality, tooling and hygiene

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-Q1 | One test command. | `package.json` with `npm test` running all `tests/*.test.mjs` and the fast checks; README updated. | Needed |
| FR-Q2 | Readable source. | Prettier-formatted modules and CSS in a behaviour-free commit. | Needed |
| FR-Q3 | Static type checking. | `tsc --noEmit --checkJs` passes on pure modules; branded point/direction/frame types (ADR-003). | Needed |
| FR-Q4 | Safe rendering of user text. | Station names and other user/imported text rendered with `textContent`, not `innerHTML`. | Needed |
| FR-Q5 | Azimuth input wraps. | −10° → 350°, 360° → 0° (not clamped to 0/359). | Needed |
| FR-Q6 | No stale data files. | Unused `dist/data/dam_spec.json` and `dist/data/dam_spec.schema.json` (old v0.1.0) removed or clearly marked; README corrected. | Needed |
| FR-Q7 | Dev dependencies documented. | `manifold3d` (Python) listed for `check-interface-artifacts.mjs`; `jsonschema` deprecation (`RefResolver`) addressed. | Needed |
| FR-Q8 | Module dependency boundaries enforced. | Real import boundaries between dataset loading, geometry, device/deployment state, assessment and rendering audited; both backends reuse application ports; calculation runs without DOM/Three.js; views provide no geometric truth; main app does not depend on the standalone preview. Locked by automated tests. | Needed |

## K. Subject generality (ADR-016, ADR-017)

The platform evaluates any imaging subject (dams, blast furnaces, tunnels, …). Support is added kind by kind; these requirements keep the core from closing that path.

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-K1 | No subject-specific logic in generic modules. | Core, plan, scan and export code never branch on a subject kind or name; new code adds no dam terms to generic modules. Existing leaks (17 modules today) are removed as each is touched. | Standing |
| FR-K2 | Dataset-declared kind and variables. | Each dataset declares `kind` and its environment variables (name, label, unit, range, frozen variants). UI controls are generated from them; the legacy `upstream`/`downstream` pair becomes one such declaration. | Needed |
| FR-K3 | Dataset-declared layers, targets and capabilities. | Display layers, semantic targets and capability flags come from the dataset/backend declaration, not hard-coded lists such as `['dam','upwater','downwater']`. | Needed |
| FR-K4 | Material-dependent energy loss. | Energy-loss parameters (or range tables) per material instead of one rock-like `a, b` for all matter; required before high-Z subjects such as blast furnaces (iron, slag). Physics-model revision. | Needed (before non-rock subjects) |
| FR-K5 | Deep overburden and site conditions. | Flux integration valid for large columns (current `10⁵ GeV` upper limit and `Emin` range); altitude/geomagnetic corrections from site conditions. Required before tunnels/underground sites. | Needed (before tunnels) |
| FR-K6 | Detector placement inside or below material. | Stations inside solids or underground and the pose ranges they need (e.g. near-horizontal, zenith) are supported and tested on the compiled path. | Needed (later) |
| FR-K7 | Large terrain. | Kilometre-scale DEM heightfields with level of detail for display and a heightfield ray backend (ADR-010). | Needed (later) |
| FR-K8 | Per-kind baselines. | Each new subject kind ships at least one reference dataset with control points, material points and reference rays, extending the `AGENTS.md` dataset checklist. | Standing |
| FR-K9 | Generic wording in rules and context. | `AGENTS.md`, `CONTEXT.md` and UI text describe the generic platform with dams as one kind (timing: OQ-5). | Open |

## L. User-loaded geometry (ADR-019)

Not urgent; staged after bundled datasets.

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-L1 | Load a packaged dataset from a local file or folder. | Browser File API, no server; same validation as bundled datasets (schema, checksums, closure/winding, units/frames). | Needed (later) |
| FR-L2 | Unverified labelling. | Packages without conformance baselines are marked unverified in the UI, results and exports. | Needed (later) |
| FR-L3 | Untrusted-input limits. | File size, triangle count and JSON size/depth limits; no code execution; fail closed with a clear message. | Needed (later) |
| FR-L4 | Local persistence and plan references. | Loaded datasets kept locally (IndexedDB); plans reference them by release ID plus content hash and refuse to run against a different file. | Needed (later) |
| FR-L5 | Offline converter. | CLI turns glTF/OBJ/STL (later IFC/STEP) plus a material map and frame declaration into a package, reusing compiler checks. | Needed (later) |
| FR-L6 | In-app light authoring. | Assign materials/densities to imported meshes, set frames/origin, declare variables. | Needed (later) |

## A. Access and security

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-A1 | Access control for sensitive geometry. | Depends on data owner's answer (OQ-1). If required: authenticated hosting before further public deployment. | Open |

## Change log

- 2026-10-10: Added K (subject generality) and L (user-loaded geometry); FR-P1 made subject-neutral.
- 2026-10-10: Moved from `docs/planning/` to `docs/` top level; links updated to `specs/` and `guides/`.
- 2026-10-10: Merged open items from `docs/ROADMAP.md`, `GEOMETRY_SPEC_REFACTOR.md` (§2, §7), `CONTEXT.md` §9, `CALCULATION_MODELS.md` §16/§18 and `GEOMETRY_AND_COORDINATES.md` §6. Added sections D, E, GE, X, V, N and FR-C6, FR-M3, FR-Q8.
- 2026-10-10: Initial requirements from review discussion.
