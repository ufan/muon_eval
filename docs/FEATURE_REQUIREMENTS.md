# Feature Requirements

What the platform must do, with acceptance criteria. IDs are stable. Statuses: **Needed**, **In progress**, **Done**, **Standing** (a permanent rule every dataset/change must satisfy), **Deferred** (waiting for a trigger), **Open** (needs a decision).

Product goals, users, use cases and non-goals are defined in [`../CONTEXT.md`](../CONTEXT.md) §1; this file does not repeat them. All open work lives here or in the [implementation priority](IMPLEMENTATION_PRIORITY.md); specs and guides carry no task lists (ADR-015).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Roadmap](ROADMAP.md) · [Implementation priority](IMPLEMENTATION_PRIORITY.md)

Last updated: 2026-10-10

---

## C. Correctness and reproducibility

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-C1 | Calculation results must not depend on evaluation history. | The same input gives identical results regardless of what was computed before, in any session or worker. The former flux cache (`muon-response.js`) returned the first value in a quantised bucket (up to ~5% per-pixel error near the horizon); since `quick-response@2.0.0` the integral is evaluated exactly per input. | Done |
| FR-C2 | Exports must record the actual ray length used. | Legacy results record the 500 m radial cutoff (`legacy-geometry-adapter.js`) as `config.length`/`rayLengthM` with a `radialCutoffBinds` diagnostic; the limitation text is corrected. Cross-backend comparisons disclose the differing `sampling`. The legacy backend was later retired (FR-B3). | Done |
| FR-C3 | Detector acceptance formula is physically justified and documented. | Per-pixel counts use the two-plane geometric factor: projected area × slope-cell solid angle (cos⁴θ), verified by derivation, an independent Monte Carlo and the flux normalisation ([calculation model spec](specs/CALCULATION_MODEL.md) §10.3). The undeclared edge factor (≈ 0.85, grid-dependent) is removed. Model `quick-response@3.0.0`. | Done |
| FR-C4 | No dead or misleading computation in the update path. | `quickMetrics()` no longer traces 81 unused rays per update or computes the unused `12000 × sin(el)^1.7` count. Resolved by retiring the legacy backend (FR-B3), which removed `quickMetrics()`. | Done |
| FR-C5 | Every result is reproducible and traceable. | Records at least the items in `CONTEXT.md` §7: app and model versions; dataset release ID and file hashes where available; coordinate convention; device; environment/scenario; stations and poses; sampling, exposure, thresholds, ray length; units; generation time; approximations and warnings. | Needed (legacy backend gaps) |
| FR-C6 | Stale results never overwrite newer state. | Holds under cancellation, caching, workers and late completion (ADR-011). | Standing |
| FR-C7 | Counts follow the detector's direction ambiguity. | A pixel is a line through the detector; without time-of-flight its counts come from the sky end of the line, so lines below the horizon in front count muons arriving from behind (`quick-response@4.0.0`, `CALCULATION_MODEL.md` §11.2a). The projection core rejects rays below the horizon, so no adapter can drop the back side. A direction-resolving device option is added only for a real device. | Done |

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
| FR-D10 | Dataset workbench. | A second page checks a release before use (ADR-030): the dataset's control points, material points and reference rays with pass/fail, agreement of 3D display, point classification and ray paths, component picking, scenario switch and semantic audit; same style and language as the main app; opened from the main app with the same `dataset`/`scenario` selection and linking back; reads no hidden state of the main app. | Partly done: two-way links and shared selection (15c); checks screen open (W1) |

## B. Default backend (compiled)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-B1 | Close the capability gaps of the compiled backend. | Every migration target in the table below is restored on the compiled path (re-implemented from the shared core and the compiled geometry, never by copying a legacy heuristic) or explicitly dropped by the owner. Until then its UI control stays visible and gated by the backend's capabilities. | Needed |
| FR-B2 | Station continuity across releases. | Stations are stored per release ID; offer station export/import between releases with coordinate validation (stations saved under the retired legacy releases are no longer shown). | Needed (later) |
| FR-B3 | Retire the legacy backend. | The legacy parametric geometry (releases 0.6.1/0.6.2, analytic kernel, DDA tracer, legacy adapters and scene view) is removed; the compiled backend is the only scientific backend; the main-app UI is kept, with legacy-only features gated as migration targets. Previously exported legacy results can still be replayed. | Done |

### Migration targets from the retired legacy backend

Features the legacy backend had and the compiled backend does not provide yet. Their controls stay in the UI, gated. The last commit containing the legacy implementation is `e938091`, for reference only: legacy heuristics are not copied.

| # | Feature (UI) | Legacy behaviour | Compiled path | Required? |
|---|---|---|---|---|
| MT-1 | Continuous upstream water level (slider in the environment layers) | Any level 260–305 m re-classified the parametric geometry | Frozen scenarios only; needs FR-E1 (one scene model for continuous variables and frozen variants) and FR-K2 (dataset-declared variables) | Deferred (owner, 2026-10-12): not needed at this stage |
| MT-2 | Target structure layers (elevator, spillway, platform, water, dam, gallery outlines on the projection) | Hard-coded dam target IDs with DDA-cell masks and edge heuristics | Merged into FR-M12 (feature outlines in projections) on the subject-feature catalogue (ADR-029) | Migrated (15b-3, 15b-5) |
| MT-3 | Structural significance projection mode | Counterfactual column (fill/empty a target) with single-pixel Gaussian significance | Replaced by anomaly hypotheses and sensitivity (FR-H1…H11, ADR-025); entity ROI significance needs FR-M3 | Superseded by FR-H |
| MT-4 | 3D muon flux cloud (volumetric heat cloud, combined contribution / transmission modes) | 17 × 17 sampled rays drawn as particles | Replaced by the physical coverage highlight (FR-M10, ADR-026); no separate cloud | Superseded (owner, 2026-10-12) |
| MT-5 | Gallery, observation room and elevator shaft layer (coloured internal features) | Legacy proxy meshes | Merged into FR-M11 (subject features in the 3D view) on the subject-feature catalogue (ADR-029) | Migrated (15b-4) |
| MT-6 | Legacy deployment plan JSON (water level, device, candidates, active ray) | `legacy-deployment-adapter.js` | Superseded by the compiled snapshot export now and the versioned plan format (FR-P1) later | Superseded |
| — | DDA main grid size control; coarse 9 × 9 quick metrics | DDA-specific; quick metrics traced 81 unused rays (FR-C4) | Not applicable: no DDA; the 25² preview replaces quick metrics | Dropped |

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
| FR-V6 | DDA path error. | Legacy DDA paths compared with analytic geometry / high-precision stepping. | Dropped (DDA retired, FR-B3) |
| FR-V7 | Angular resolution model. | Spherical convolution or response matrix replaces the 2D Gaussian display smoothing. | Needed (later) |
| FR-V8 | Statistics. | Likelihood, background model and correlated systematics replace single-pixel Gaussian significance. | Needed (later) |
| FR-V9 | Uncertainty propagation. | Geometry, density and response uncertainties propagated to results. | Needed (later) |
| FR-V10 | Measured muon maps. | Import measured maps and calibrate the fast model against them; the reconstruction pipeline (FR-M7) can then run on measured data. | Needed (later) |
| FR-V11 | Independent cross-validation of the fast response model. | E.g. against Geant4 (FR-G2). | Needed |
| FR-V12 | In-pixel ray sampling accuracy. | Each projection pixel is computed from one ray from the detector centre, while the measurement integrates over every native strip-difference direction in the pixel and over entry points across the aligned detector area. The error is measured against a converged reference (all native directions × entry points, counts averaged, not columns) for representative stations and poses, in per-pixel relative error, pull against the counting error of a typical exposure and total count. Either the approximation is documented with its measured bounds in the [calculation model spec](specs/CALCULATION_MODEL.md), or multi-ray sampling becomes an explicit, versioned calculation option with the reference as an L4 test. Measured 2026-10-12 ([calculation model spec](specs/CALCULATION_MODEL.md) §11.6): totals within ±0.6%; 0.4–2.8% of pixels > 2σ, 91% of them at material edges; entry position negligible. Bounds documented; edge-adaptive sampling is needed before per-pixel anomaly sensitivity (with AN3). | Done (measurement); option with AN3 |

## P. Plans (deployment schemes)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-P1 | Save/load a complete plan. | Versioned, subject-neutral JSON schema with migrations; distinguishes candidate stations from the selected deployment (ADR-020): full dataset release ID (plus content hash for user-loaded datasets), stations, poses, device, response, environment/scenario, sampling, model version. Round-trip test: load → save gives an identical file. Current exports (including `compiled-deployment-snapshot` v0.1) are not full round-trip plans. | Done (`muography-plan` 1.0.0, PLAN_FORMAT.md; storage, export and import in the app; byte-identical round trip tested); 1.1.0 adds named deployments and candidate notes (#14a); selection UI with #14c |
| FR-P5 | Study workflow. | The app supports one observation task from start to finish, without leaving the main page: (1) sketch: place stations roughly on the geometry and see their geometric coverage together; (2) detail: tune one working station (position, pose, detector) and save as many candidates as wanted, more than needed; (3) combinations: try different subsets of the candidates as named deployments, in the same or a later session; (4) export one final deployment or several alternatives. Steps can be revisited in any order (owner, 2026-10-14). | Done (14a–14d) for steps 1–4 with single-station results; multi-station evaluation with #15 |
| FR-P6 | Candidate pool and working station. | A candidate is one position + pose + detector with a name and a note; several poses at one site are several candidates, grouped by location in the list. A saved candidate is fixed: selecting it loads it into the working station; changes are applied with "update candidate" or "save as new candidate". Hence a candidate's cached result stays valid until the candidate is explicitly changed. The device form edits the working station's detector; "应用到全部候选" writes it to every candidate. | Done (14b) |
| FR-P7 | Named deployments. | A study holds any number of named deployments, each a subset of its candidates; a candidate can belong to several. Deleting a candidate removes it from every deployment. Switching deployments never recomputes an unchanged candidate. | Done (format 14a, UI 14c) |
| FR-P8 | Several studies per release. | Browser storage keeps several studies per release (new observation tasks on the same model): create, switch, rename, delete; importing a plan file creates a study and never overwrites one silently. A new release starts with a fresh study; copying candidates from a study of another release is deferred (owner, 2026-10-14), and would warn that the geometry may have changed. | Done (14a, 14c); copying from another release deferred |
| FR-P9 | Export a study or deployments. | Export the whole study, one deployment or several deployments as plan files (a deployment file holds only its member candidates and the detectors they use); plus results and comparisons through the export menu (FR-P4). | Plans done (14c: header menu "导出方案"); results and comparisons join the menu with 11b |
| FR-P10 | Session result cache. | One result per candidate, keyed by the snapshot key, kept in memory in a compact form (≈ 0.5 MB per 65² result instead of 13.8 MB for the full in-app result); the full form is rebuilt only for the station shown in detail. Results are recomputed in the background when a study is opened (≈ 0.6 s per candidate at 65², 0.1 s at 25², on one 2.1 GHz core). Persistent storage of results (IndexedDB) is deferred until a session's recomputation exceeds about 30–60 s (much more than 50 candidates, finer sampling, or anomaly variants); batch-runner results can fill the cache (owner, 2026-10-14; measurements in ADR-020). | Done (14b): compact entry ≈ 90 KB (per-pixel counts, transmission, display values, m.w.e., side; indicators; snapshot inputs), path segments added when a view needs them (#16); filling from a batch run open |
| FR-P2 | Plans shareable without a server. | Plan files are diff-friendly and usable from git or a shared folder. | Done (canonical text, 2-space indent, fixed member order) |
| FR-P3 | Team plan sharing with concurrent editing, permissions and audit trail. | Only when server trigger T1 is met (ADR-001). | Deferred |
| FR-P4 | One export menu. | The main app offers one "导出" menu on the versioned plan/result format (#11): plan; full result of the current station (result plus pattern layers); comparison of saved stations or poses. Replaces the preview's separate export buttons (ADR-030). | Needed (after #11) |

## S. Scans and ranking

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-S1 | Station/pose scan with progress and cancellation. | Scan definition stored in the plan format; cancellable; uses the same calculation core and result snapshot as single-point evaluation. | Needed |
| FR-S2 | Constraint filtering and relative ranking. | Engineering feasibility (space, transport, power, communications, maintenance), physical observability and safety/compliance recorded as separate dimensions; safety is an engineering input, never derived from projection metrics. Constraint, metric, default comparison set and ranking method definitions written down. | Needed |
| FR-S3 | Robustness against position/pose/device/geometry perturbations. | Perturbation ranges declared in the scan definition; results report spread, not only the nominal value. | Needed |
| FR-S4 | Workstation-scale performance. | A 20 stations × 36 azimuths × 7 elevations × 4 scenarios scan finishes in minutes on one workstation, via direction-map reuse and coarse-to-fine search (ADR-005). Benchmark tracked against the 2026-10-09 baseline (~10.6k rays/s/core). | Needed |
| FR-S5 | Headless batch runner. | Node CLI: reads a plan/scan file, uses all cores, writes versioned results the app can load. Same modules as the browser. Plans: `npm run run-plan -- plan.json --out dir` writes one result per station, a reproducible run summary (`muography-plan-run` 1.0.0) and optionally a comparison the app replays; output is byte-identical for any thread count ([PLAN_FORMAT](specs/PLAN_FORMAT.md#batch-runs)). | Done (plans). Open: scan files (P5, #22); opening results and run folders in the app and result size (13a, with FR-P4); plans for user-loaded datasets (FR-L4); comparison ROI beyond concrete .15 m in the app (FR-K11) |
| FR-S6 | Distributed or shared scan execution. | Only when server trigger T2 is met. | Deferred |

## H. Anomaly hypotheses and sensitivity (ADR-025)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-H1 | Anomaly definition format. | Versioned schema: region, density model, host constraint, parameters with ranges, optional development steps; stored in the plan (FR-P1) or a study file, never in a dataset release; datasets may ship suggested templates. | Needed |
| FR-H2 | Generic regions. | Sphere, ellipsoid, box, cylinder, extruded polygon and closed mesh regions in the model frame; ray–region intersection exact against analytic fixtures. | Needed |
| FR-H3 | Density models. | Void, relative change, absolute density, material replacement, fluid saturation (porosity × fluid density); per-material columns kept. | Needed |
| FR-H4 | Host clipping. | The change applies only to the declared host materials/entities inside the region, after material precedence; regions outside any host have no effect and are reported. | Needed |
| FR-H5 | Perturbative evaluation. | Pixels at anomaly-footprint and material edges sampled over their native directions (FR-V12); baseline traced once per station/pose; variants reuse stored segments; agreement with full retracing on analytic fixtures within the fixture tolerance; same response core as single-point evaluation. | Needed (needs FR-C1) |
| FR-H6 | Sensitivity outputs. | Per pixel and per footprint: N, N′, ΔN, significance (statistical and systematic terms), exposure needed for a chosen significance; footprint outline in each projection. | Needed |
| FR-H7 | Parameter sweeps. | Sweeps over size, density change, position and development step produce sensitivity curves and minimum detectable size/contrast, comparable across plans. | Needed |
| FR-H8 | Systematics. | Nuisance variations from declared uncertainties (density ranges, unknowns, flux model, device efficiency); results with and without systematics. | Needed |
| FR-H9 | View. | Anomaly regions shown in 3D and as projection footprints from the same definition; hiding them in the view never changes physics. | Needed |
| FR-H10 | Kind generators. | Kind-specific parametric shapes (e.g. dam seepage surface, furnace cohesive zone, hearth wall thickness profile) produce generic regions; each needs a kind profile (FR-K10). | Needed (later) |
| FR-H11 | Labelling and identity. | Anomaly definitions are part of the snapshot identity; outputs are labelled simulated hypotheses. | Needed |

## M. Multi-station and reporting

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-M1 | Joint multi-station evaluation. | Coverage overlap, cross-view of targets, added information; joint objective defined. Computed from stored per-station results (ADR-020). First step: overview table of recognition item × station (in view, coverage, counts in mask, median counting error, seen by *n* stations; ADR-029 Q6). | Partly done (#15: overview table per recognition item × station with in view, image share, counts in mask, median counting error and seen by *n* stations, plus the item's multi-view numbers; joint objective open) |
| FR-M4 | Show selected stations simultaneously. | Select a subset of plan stations; 3D view shows all of them at once (marker, colour per station, field-of-view cone, ray coverage on the subject); per-station projections side by side; summary table. Clicking a station opens today's detail mode. Switching modes or toggling stations does not recompute unchanged stations. | Partly done: all stations in 3D with colours, field-of-view edges and pyramids, coverage (14d, 15d, 15e); summary table with click-to-detail from a station name (#15); per-station projections side by side open (#16), click on a 3D marker open |
| FR-M10 | Coverage highlight on the subject. | In single- and multi-station views, an option highlights the part of the subject inside each detector's field of view, so users recognise covered regions at a glance: by default the full field of view on subject surfaces only (core field of view and terrain/water as optional toggles), crisp boundary outlines; correct under transparency (each surface tinted at most once: front-facing shell; subject features keep their class colour and are emphasised when in view instead of tinted (ADR-029); minimum opacity for covered regions, no brightness build-up from stacked layers), matching station colour on detector and pyramid edges, below-horizon part marked as no flux; hover shows covering stations and slopes, click jumps to the projection pixel. Geometric acceptance: one colour per station, live while the pose changes. Physical acceptance: brightness from expected counts per steradian of the completed result (log scale, fixed across stations); stale maps never shown as current. Multi-station: per-station colours or combined brightness; overlaps visible. View state only (ADR-026). | Partly done: single station, geometric and physical, outlines, no-flux marking, options, hover readout and click to the projection pixel, pyramid edges (15a); multi-station geometric view (14d: count of covering stations, per-station edge colours, up to 8 others); multi-station physical maps (15d) |
| FR-M5 | Demonstration mode. | Clean presentation layout for customers: camera presets and guided views, labels, screenshot and short animation export; numbers shown carry their limitations. | Needed (next after plans) |
| FR-M6 | Coverage metrics in 3D. | Per voxel: ray count, station count, path length and angular diversity of crossing rays; displayed as slices/volume on the subject and summarised per plan. | Needed |
| FR-M7 | Simulated multi-projection reconstruction. | From a plan: simulated counts (optional Poisson noise for the exposure) → column density per pixel → 3D density on a voxel grid; SIRT/ART and MLEM first; forward model independent of the simulation geometry (ADR-021); results labelled simulated and fully versioned. | Needed (later) |
| FR-M8 | Reconstruction quality metrics. | Against the dataset's true density: density error, contrast recovery and resolution for chosen targets (e.g. a cavity), detectability; comparable across plans. | Needed (later) |
| FR-M9 | 3D display of reconstruction results. | Slices, isosurfaces and volume rendering overlaid on the subject, anomaly hypotheses and coverage in the same scene (shared camera and depth); difference from truth; same model frame. Three.js first; VTK.js only for a separate analysis view if needed (ADR-021, ADR-027). | Needed (later) |
| FR-M2 | Result data and plan reports. | Report schema; generated from stored results, including limitations and model versions; multi-station overview and reconstruction figures included when available. | Needed |
| FR-M3 | Source-entity ROI significance on the compiled backend. | Requires FR-GE4 entity attribution. | Needed (later) |
| FR-M15 | Multi-view coverage of a target. | For deployments whose fields of view overlap on purpose: per point, the number of usable views (pixel counts N ≥ 100, i.e. ≤ 10 % counting error; option 5 %), the angular spread of the usable views, and a summary class (good ≥ 3 views and ≥ 30°; insufficient < 2 views or < 10°; limited otherwise), shown on surfaces, target features and a slice plane; default physical multi-station mode, with 主导站点 and 总计数 as alternatives (ADR-026, owner 2026-10-14). Heuristic, labelled as such; per-target numbers in the overview table. | Done (15d: all five maps on subject surfaces, thresholds, legend, hover; 15e: slice plane and shown target features; #15: per-target numbers in 多站总览) |
| FR-M16 | Slice plane through the subject. | A movable, orientable plane through the interior shows coverage (geometric or multi-view) at interior points, so targets inside the structure can be judged directly; a view only. | Done (15e: 切面 under 覆盖范围, horizontal or across X/Y, shown only where the plane cuts matter by the calculation geometry; hover) |
| FR-M11 | Subject features in the 3D view. | Features from the feature catalogue (ADR-029) drawn from the same compiled components the tracer uses (never proxies), in their dataset class colours; one layer checkbox per feature group, expandable to features; gallery, monitoring and vertical-transport groups visible by default; hover/pick identifies the feature, class and imaging role; linked with projection outlines both ways; emphasised (full opacity) when in view of a selected station; hiding never changes physics. Replaces legacy MT-5. | Done (in-view emphasis with the coverage highlight, single station, 2026-10-14) |
| FR-M13 | Statistical precision contour. | On the projection, contours of the relative counting error 1/√N for the current exposure at fixed levels 5 % and 10 % (stated in the legend), showing in which directions the exposure gives usable statistics; drawn with the contour pipeline from the result's own counts; display only. | Done (15c): `precision-contours.js`; toggle "统计精度线" under the projection, off by default, remembered per release |
| FR-M14 | Expert diagnostics placement. | The material-contribution and response contour layers are grouped under an "Expert diagnostics" ("专家诊断") section, off by default; kept and tested, no new features (ADR-029 Q5). Later members per ADR-030: finite-model reference outlines, a detector-independent column view, the sampled envelope after FR-K11. | Done (15c) for the contour layers; later members open |
| FR-M12 | Feature outlines in projections. | Recognition items from the display profile (or derived defaults), listed only when visible in the current projection; mask = central-ray length inside the item > T (display setting, default 0.1 m); outline = contour of that length at T via the contour pipeline, item colour, line pattern and label for same-colour items, optional fill and sampled-pixel view; hover lists crossed items in ray order with length inside and entry distance (no 3D markers; crossed features are emphasised in 3D with FR-M11); material items for merged solids ("Dam concrete", "Gates") until FR-GE4; the detector's own space is left out of masks; the material envelope overlay stays in the geometry preview. Replaces legacy MT-2; the same mechanism later draws anomaly footprints (FR-H9). | Done (15b-3…15b-6) except the optional fill and sampled-pixel view; the material envelope overlay stays in the geometry preview (owner, ADR-029) |

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
| FR-N5 | Coverage highlight on integrated graphics. | Measured on reference laptops (Intel Core i5 with Iris Xe, and with UHD 620) at 1920×1080 in Chrome/Edge: orbiting with coverage on and 8 stations stays ≥ 30 fps (target 60 fps on Iris Xe); idle uses no GPU (on-demand rendering); automatic quality fallback (lower pixel ratio during interaction, Lambert shading, outlines off) when frame time exceeds budget. | Partly done: on-demand rendering (idle draws nothing; browser check counts draw calls); quality fallback and the laptop measurement open |
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
| FR-K11 | Material roles instead of material IDs. | Generic code refers to roles the dataset declares for its materials (e.g. empty medium outside and inside cavities, structure, host ground, fluid), never to IDs such as `air`, `concrete`, `rock`, `steel`. Material envelopes generalise from "concrete/rock vs air" to interfaces between declared roles or density classes, so a blast furnace (refractory, burden, iron, slag, gas) or a tunnel in strata (several rock layers, voids) works without code changes. Today the leaks are `material-envelopes.js` (concrete/rock vs air), `compiled-scene-view.js` (look and layers), `main-page.js` (centre-ray concrete path), `main-pattern-view.js` (the comparison ROI is fixed to concrete, 0.15 m, so the app replays only such comparisons, including batch-run ones), `pattern-preview.js`, `reference-view-layers.js`; the runtime's `air` as the zero-density outside medium matches the v0.7 policy (`outside_model`) and should be read from it. Designed with the second subject kind (FR-K10). | Needed (before a second subject kind) |
| FR-K2 | Dataset-declared kind and variables. | Each dataset declares `kind` and its environment variables (name, label, unit, range, frozen variants). UI controls are generated from them; the legacy `upstream`/`downstream` pair becomes one such declaration. | Needed |
| FR-K3 | Dataset-declared layers, targets and capabilities. | Display layers, semantic targets and capability flags come from the dataset/backend declaration, not hard-coded lists such as `['dam','upwater','downwater']`; the subject-feature catalogue (ADR-029) is its first consumer (FR-M11, FR-M12). The declaration format is designed from at least two real examples (ADR-016); until then only the dam's existing lists move out of generic code. | Needed |
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
| FR-L4 | Local persistence and plan references. | Loaded datasets kept locally (IndexedDB); plans reference them by release ID plus content hash and refuse to run against a different file. The batch runner (FR-S5) accepts such plans once the dataset package can be loaded from a path in Node; until then it refuses them. | Needed (later) |
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

- 2026-10-14: FR-M15 (multi-view coverage) and FR-M16 (slice plane) added (owner decisions).
- 2026-10-14: FR-M16 done; FR-M15 now also on the slice plane and shown target features (15e).
- 2026-10-14: FR-M15 done (per-target numbers); FR-M1 and FR-M4 partly done with the #15 overview table; FR-M10 status corrected (multi-station physical maps done with 15d).
- 2026-10-14: FR-P5…P10 added: the study workflow (sketch, detail, combinations, export), fixed candidates with a working station, named deployments, several studies per release, deployment export, session result cache (owner decisions).
- 2026-10-14: FR-S5 done for plans; open parts recorded (13a, FR-L4, FR-K11, P5).
- 2026-10-14: FR-M11 in-view emphasis done.
- 2026-10-14: FR-N5 partly done (on-demand rendering).
- 2026-10-14: FR-M14 done for the contour layers ("专家诊断" drawer; comparison in its own "方案比较" section).
- 2026-10-14: FR-M13 done (precision lines).
- 2026-10-14: FR-D10 (dataset workbench) and FR-P4 (one export menu) added; FR-M14 extended (ADR-030).
- 2026-10-14: FR-M10 single-station coverage done (15a).
- 2026-10-14: FR-P1, FR-P2 done (plan format, storage, export/import).
- 2026-10-14: FR-K11 added (material roles; generality of the envelope/air-interface concept, owner question).
- 2026-10-14: FR-C7 added and done (back-side muons; model `quick-response@4.0.0`).
- 2026-10-14: FR-M12 done except optional fill and sampled-pixel view (15b-6: material envelope overlay).
- 2026-10-13: FR-M11 done (15b-4) except in-view emphasis; MT-2 and MT-5 migrated.
- 2026-10-13: FR-M12: no 3D entry markers (owner).
- 2026-10-13: FR-M12 partly done (15b-3, 15b-5).
- 2026-10-13: FR-M10, FR-M11, FR-M12 updated to the accepted ADR-029 design.
- 2026-10-13: FR-M13 statistical precision contour, FR-M14 expert diagnostics placement (contour policy, ADR-029 Q5).
- 2026-10-13: FR-M12 uses recognition items from a display profile (ADR-029 Q3).
- 2026-10-13: MT-2 and MT-5 needed (owner); merged into FR-M12 and FR-M11 on the subject-feature catalogue (ADR-029, proposed); FR-K3 linked.
- 2026-10-13: Model identifier renamed `legacy-quick-response@3.0.0` → `quick-response@3.0.0` (same physics; owner).
- 2026-10-12: MT-1 deferred; MT-4 superseded by the coverage highlight (owner).
- 2026-10-12: FR-B3 legacy backend retired (owner); migration targets MT-1…MT-6 listed under B; FR-B1 reworded; FR-C4 done; FR-V6 dropped.
- 2026-10-12: FR-V12 measured and documented; edge-adaptive sampling tied to AN3.
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
