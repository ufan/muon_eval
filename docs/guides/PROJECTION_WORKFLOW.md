# Projection interpretation workflow

User and integration guide for reading material/response maps, configuring reference layers, comparing sites and poses, and exporting/replaying results. Start here for operation; use the data and geometry documents for implementation details.

Related: [Projection data and numerical interpretation](../specs/PROJECTION_DATA.md) · [Geometry reference methods and artifacts](../specs/GEOMETRY_REFERENCES.md) · [Projection and reference validation](../specs/PROJECTION_VALIDATION.md) · [Unfinished work](../ROADMAP.md).

- [Material contour controls](#material-contour-controls)
- [Finite-model interpretation and comparison](#finite-model-interpretation-and-comparison)

## Material contour controls

The preview consumes shared contribution fields, extraction and graph mapping; rendering remains view-only.

### Usage and meaning

Open `/geometry-preview.html` through HTTP. Under **Material contribution contours**:

- Enable/disable the contribution layer independently of sampled boundary/depth diagnostics.
- Select materials independently; options come from the loaded dataset registry, excluding air. Concrete/rock and the first available material are initially selected; material availability, not a dam's dimensions or components, governs the options.
- Choose raw material path (m) or water-equivalent contribution (m.w.e.).
- Use adaptive inspection levels, or enter 1–16 increasing comma-separated physical levels in the selected units. Physical levels are shared across both graphs; adaptive ranges/levels are resolved independently for each material and graph.

Per-graph legends list material/colour, quantity, actual levels/units, valid-region hit coverage, variation, validity, curve state and saddle ambiguity. Constant/out-of-range fields do not manufacture lines. Empty selections, hidden layers, pending calculations and invalid physical-level input have explicit messages. Adaptive legends warn that levels are not comparable across views. None of these lines is an accepted geometry envelope or a detectable-signal claim.

The old envelope controls are relabeled **Sampled boundary diagnostics**. Their existing algorithms remain unchanged; Finite-model references are a separate explicitly scoped layer; see PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison. The numerical contribution layer does not depend on those controls or colour normalization.

### Rendering and state

Separate SVG layers sit exactly over each scientific raster, with pointer events disabled so pixel picking still reaches the canvas. Each contour uses a 1.5 CSS-pixel colour stroke plus a 3.5 CSS-pixel dark halo. `vector-effect="non-scaling-stroke"` keeps stroke width independent of bin count, CSS resizing and device pixel ratio. Each graph's own coordinate mapping supplies paths; SVG viewBox uses that graph's bin count. CSS clips the overlay to its graph; paths remain open rather than adding frame closures.

The line layer does not write scientific arrays/configuration. Worker clients scope asynchronous work and bounded caches to result identities and settings; invalidation clears old overlays. Visibility/style changes do not trace rays. DOM rendering remains on the main thread. Cold/worst-case performance remains unqualified; see [acceptance budgets](../specs/PROJECTION_VALIDATION.md#acceptance-requirements) and [unfinished work](../ROADMAP.md). Separate [versioned contour downloads](../specs/PROJECTION_DATA.md#contour-export-and-replay) preserve scientific fields, lines and settings.

## Finite-model interpretation and comparison

Reference scope: finite-model material–air lines can be used for rapid deployment comparison, with known artificial caps excluded and remaining physical-domain scope visibly unresolved. It does not certify surveyed interfaces, terrain completeness, detector resolution, significance, construction safety or measured-data calibration.

### Geometry references

The pinned Manifold 3.5.4 preprocessing path unions winning-material regions using the scientific material priority, removes contacts, splits partial water contacts and retains component/triangle ancestors. Source-bound artifact v1.0.0 stays `qualification-only-not-physical-envelope`; it is not relabeled as physically certified. The new consumer `finite-model-references.js` explicitly interprets it as a **finite-model reference** under the approved policy.

VTK 9.5.2 source-reuse selects perspective apparent contours and optional 30° creases. Material-patch rims also survive, including coplanar rims. No optical occlusion is applied, so useful cavity/internal/far-side lines remain. Every edge incident to a known domain cap is excluded. Other structure/water boundary semantics stay unknown; no midpoint, name or bounding-box rule invents positive physical qualification. Known terrain cap lineage is negative evidence only. Terrain outside the published volume is omitted, not extrapolated.

Whole segments are clipped before perspective division against the current graph's actual sample-center slope hull, the positive-depth exclusion (0.001 m) and radial ray range. No frame or cap perimeter is manufactured. Near depth is a numerical setting, not an accuracy estimate. Graph mapping splits at actual slope-center knots; the two graphs never share pixel indices. Mapping clamps only 1e-12-scale boundary roundoff, not out-of-field geometry.

`ready`/`clipped` means renderable **finite-model** line segments, never physical qualification. `outside-field`, `absent`, `unresolved` and invalid assets differ. Physical completeness is always false. An overlapping concrete/rock patch rim may legitimately appear in both material layers. Per-line hover and exports record reasons, model endpoints, clipping intervals and ancestor component/face IDs. Canonical entity ownership remains null.

The worker loads one scenario cache, verifies compressed bytes and the existing content/source/scenario/native-input/domain bindings, and performs connectivity/selection off the UI thread. Request IDs and calculation snapshots reject stale poses; scenario changes replace the worker. Visibility/depth diagnostics do not retrace rays. SVG strokes use CSS pixel widths and clipping.

### Offline assets and reproduction

Derived runtime assets are separate from immutable dataset releases, under `dist/data/derived-interfaces/`. Four gzip files are approximately 1.36 MB each (decoded qualification JSON approximately 17.5 MB). They are generated runtime packaging, not new source geometry or a reason to commit temporary benchmark outputs. Keep the packaging script, pinned source evidence and manifests; regenerate when needed. No browser Manifold, CDN, server computation or runtime installation.

```sh
# If pinned artifacts already exist:
node scripts/package-interface-assets.mjs /path/to/verified/interface-artifacts

# Otherwise reproduce in a temporary native environment as documented in
# docs/specs/GEOMETRY_REFERENCE_CONTRACT.md#derived-interface-artifact-contract, then package the new output directory.
PYTHONPATH=/path/to/native/packages node scripts/check-interface-artifacts.mjs
node scripts/package-interface-assets.mjs /path/printed/by/the/check
```

Packaging verifies the durable file/content pins and passing ray-evidence receipts. Unknown or altered sources fail closed; regenerating changed evidence is a deliberate qualification operation, not automatic acceptance. Browser gzip support (`DecompressionStream`) is required; unsupported/missing assets report unresolved references while existing scientific maps remain usable. Serve over HTTP, not `file://`.

### Numerical response interpretation

`response-patterns.js` reuses the same pinned D3 contour adapter as material contributions, extracting numbers rather than colors. Raw transmission, raw counts, open-sky counts, raw `N/Nopen` and the existing display-smoothed transmission are explicitly distinct fields. Defaults are fixed transmission levels .01/.1/.5/.9 and count levels 1/10/100/1000 events; editable levels retain units and provenance. Raw totals/fields never change when levels change.

Open-sky counts are retained directly from `evaluateProjectionPixel` with opt-in context; no response formula is copied or reconstructed by dividing by transmission. They include acceptance, directional flux, area, exposure and efficiency. `N/Nopen` is undefined with zero open support. Transmission above 1 (possible under `legacy-quick-response@1.0.0`, whose quantised flux cache was removed in 2.0.0) is invalid for attenuation interpretation and never clamped; raw results/export preserve it. Unsupported/nonfinite/negative samples fail explicitly. Legends disclose validity and limitations.

Adjacent-bin inspection shows raw transmission difference, counts in both bins, open-sky support, angular separation, native strip-difference ranges and the existing display angular-resolution parameter. These are diagnostics, not independent-bin significance, feature width, physical resolution or calibrated detectability. Increasing the sample grid does not increase detector resolution. Existing display smoothing and counterfactual/significance formulas are not changed or extended.

Method policy: retain numerical D3 isolines; do not adopt Canny/OpenCV/WASM. No edge detector is used, so there is no unbenchmarked detector adoption. Analytic open-sky fixtures have varying acceptance/counts but constant attenuation, whereas the opening/material fixtures have attenuation contrast. Three fixed level sets (.01/.1/.5/.9, .005/.05/.25/.75, .02/.2/.6/.95) exercise threshold sensitivity at unchanged raw values. An RGB or gradient edge map adds no material attribution; adopting an edge detector later requires a separate demonstrated-value benchmark against these scalar isolines. Upstream/library research and licenses remain in the [contour contract](../specs/PROJECTION_DATA.md#numerical-contour-extraction) and [structural policy](../specs/GEOMETRY_REFERENCES.md#reference-semantics-and-library-choice).

### Reproducible deployment comparison

Definitions are in pure `pattern-comparison.js`; single-site and array/batch consumers call the same function. No scan optimizer or automatic rank is claimed. An ROI is explicitly `{kind: material|semantic, id, minimumPathM}`. Preview/main UI currently expose material ROIs (main defaults concrete, .15 m); only directly mapped semantic targets are accepted by the pure API. An accumulated material ROI is not canonical source-entity ownership.

| Indicator | Definition / units / mask |
| --- | --- |
| Target field coverage | Number of representative samples with ROI path strictly greater than the threshold / all graph samples; bin fraction, not solid-angle area |
| Supported coverage | Valid attenuation samples in the ROI / all valid attenuation samples; undefined with no valid support |
| Expected count support | Sum raw expected counts in supported ROI bins; events for recorded exposure; open-sky sum shown alongside |
| Transmission contrast | Mean raw T in supported ROI bins minus mean raw T in valid background bins; dimensionless; undefined if either group empty; not a counterfactual |
| Angular separation | Angle between normalized unweighted mean direction vectors of supported ROI and background; degrees; undefined for missing/zero centroids; not feature width |
| Pose/site sensitivity | Against row 0, mean absolute raw T change on corresponding jointly valid samples and ROI coverage change; only when controlled settings and actual grids agree; not a derivative or uncertainty propagation |

Comparison discloses differences in full dataset/release, geometry/backend/model, detector, environment, response (including exposure/resolution), and sampling. Station/pose changes are the comparison variables. All response contours use the same explicit levels. No adaptive contribution levels enter ranking; those remain inspection-only. Different settings remain visible but disable controlled sensitivity. Engineering access and safety are separate unevaluated inputs.

The main application retains legacy DDA. `legacy-pattern-adapter.js` reads its completed shared-core pass, converts document directions through an explicit model-direction adapter, and attaches immutable starting station/device/response/environment/trace settings. Its field kind/backend are `legacy-detector-assessment` / `legacy-dda@1.0.0`, not compiled. Legacy rays stop at the 500 m radial cutoff or the recorded finite box, whichever is nearer; `rayLengthM` records the 500 m cutoff and `radialCutoffBinds` whether it is shorter than the box's enclosing distance, which is a diagnostic only. Compiled results trace to a length enclosing their whole mesh, so a legacy/compiled comparison discloses differing `sampling`. Main-app accepted numerical layers and saved comparisons reuse the same pure contracts/modules. Compiled finite-model reference lines remain in the preview; overlaying different compiled geometry onto legacy results would be inconsistent. Default dataset/backend migration is still a separate task.

### Export and replay

The explicit batch API `pattern-comparison-batch.js` snapshots configurations and calls `evaluateCompiledAssessment` for every site/pose, with shared progress/cancellation and no formula copies. It returns the same `comparePatternResults` definitions as single-site consumers, not a scan optimizer.

- Existing raw result and material contour exports stay available; old formats are not silently migrated.
- `projection-pattern-layers` v1 saves each graph's raw result, exact numerical fields/levels, reference settings/curves/line provenance, response representation/context, snapshots, warnings and separate display choices. Numeric replay re-extracts D3 fields. Supplying the validated pinned artifact also reconstructs and verifies structural lines; without it, stored structural replay is explicitly **integrity-only**, not independent geometry validation.
- `projection-pattern-comparison` v1 saves labelled raw assessments, settings, reference availability, shared indicators, fixed response contours, disclosed differences and sampled sensitivity. Import/replay recomputes interpretation and rejects unknown versions, altered digests or disagreement. It does not rerun ray tracing; independent physics reruns need the recorded dataset/backend. Digest integrity is not authentication.
- Preview and main UI allow up to 20 saved rows and a 50 MB import limit. Imported files update saved comparisons, not live station/scientific fields. Measured-muogram import/calibration is not implemented.

### Verification boundary

Tests cover all six analytic geometries, internal/external/off-axis views, 25/65/129 geometry mapping (129 is a geometry-only display grid, not a new live scientific evaluator), source line endpoints and cap exclusions, partial-water native CSG evidence, all four real packaged scenarios, response attribution/zero support/thresholds, backend identity, unchanged science and both export schemas. Existing strict analytic/native regressions and the recorded 864-ray source-bound consistency gate remain in force. None of these establish survey accuracy or exhaustive real-surface correctness.

HTTP browser acceptance includes independent controls with depth diagnostics off, fixed stroke widths, hover provenance, response context, saved comparisons/download/import, pose/scenario cancellation, desktop/narrow display and main-app numeric integration. Runtime costs are recorded separately from cold preprocessing; browser performance on every deployment machine is not guaranteed. Remaining work is listed in [ROADMAP](../ROADMAP.md).
