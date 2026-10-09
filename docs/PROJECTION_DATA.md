# Projection data and numerical interpretation

Developer contract for calculation identity, material contributions, numerical contours, graph coordinates and contour export/replay. These modules consume computation-owned results; display settings never become geometry truth or alter scientific arrays.

Related: [Geometry reference methods and artifacts](GEOMETRY_REFERENCES.md) · [Projection interpretation workflow](PROJECTION_WORKFLOW.md) · [Projection and reference validation](PROJECTION_VALIDATION.md) · [Unfinished work](ROADMAP.md).

- [Calculation contracts](#calculation-contracts)
- [Material contributions](#material-contributions)
- [Numerical contour extraction](#numerical-contour-extraction)
- [Graph mapping](#graph-mapping)
- [Contour export and replay](#contour-export-and-replay)

## Calculation contracts

Implemented and validated by `dist/modules/projection-pattern-contract.js` and `tests/projection-pattern-contract.test.mjs`. These are additive, pure data constructors; existing preview results and v0.1.0 exports are unchanged. This is not a general deployment-plan schema.

### Calculation identity

`createPatternSnapshot(inputs)` requires dataset release, scenario, geometry/backend/model versions and explicit objects for station, pose, detector, environment, sampling and response. Callers must populate these objects with **all effective inputs**, including ray extent, coordinate transform identity, density settings and smoothing parameters where applicable. Use an explicit `type: 'none'` for an inapplicable detector/response, not a missing field. Unknown provenance must be labeled explicitly, not invented.

`key` is a deterministic, sorted-key, full-input JSON string, not a hash or security signature. All supplied inputs participate; arrays preserve order. Nonfinite/lossy JSON values fail. Constructors detach their data from caller inputs. Outputs are ordinary data, not immutable objects; downstream code must treat accepted snapshots as read-only. At integration, runtime identity must be snapshotted before any asynchronous yield. Generation cancellation and cache eviction remain orchestration responsibilities.

### Numerical fields

`createPatternField` records an ID, snapshot, quantity, inferred units, material when applicable, raw/display-smoothed representation, grid, values, valid mask and provenance. Supported quantities are `material-path` (m), `material-column` (m.w.e.), `transmission` (dimensionless), and `expected-count` (events). Material names are dataset-defined, not restricted to concrete/rock. Response fields do not assert material ownership.

Grids carry explicit detector-local `sx`/`sy`, dimensionless slopes. Columns increase in sx; rows decrease in sy; values are row-major. Both axes are strictly monotonic. Uniform samples represent point evaluations, **not physical detector bins**. Detector-aggregated grids additionally require ascending lower/upper slope bounds for each coordinate; successive bins must not overlap. Native readout-index ranges alone are not slope bounds. Weighted centers must remain inside their bounds. No regridding or index-to-slope interpolation is implemented here.

Valid values must be finite/nonnegative; transmission is bounded by one. Invalid samples must be `null` with a false mask; zero means a valid zero. `describePatternField` reports validity, coverage and variation independently. An all-hit field may be varying or constant. Constant is exact equality here, not a numerical-tolerance claim; later extraction must record its tolerance. Partial-field coverage describes only valid samples, not the missing region. Provenance records source and limitations.

### Derived overlays

`createPatternOverlay` accepts four independent semantic types: material contribution, structural reference, response feature and depth diagnostic. It records source ID/kind/snapshot key, algorithm name/version, finite JSON settings (including contour levels or thresholds), a tolerance with explicit units, completeness/limitations and slope-space polylines. Display styles are deliberately outside scientific data.

Source identity must match the snapshot. States are `ready`, `absent`, `outside-field`, `clipped`, `invalid`, and `unresolved`. Absent/outside/invalid/unresolved cannot contain renderable lines. Clipped lines may be useful but must disclose incomplete extent; state selection and truthful provenance are the extractor's responsibility. Constructors do not extract curves, prove completeness, clip geometry, infer physical interfaces or assert detectability. A plotted frame border is not automatically a physical boundary.

Exporters must preserve this schema version and scientific inputs separately from controls/styles. Existing exports are not silently migrated. Library metadata and reproducibility settings are defined in the contour and structural-reference contracts.

## Material contributions

The compiled mesh trace exposes `materialColumns` alongside `totals` and `mwe`. Both projection evaluators copy these columns to each pixel and declare `materialContributionUnits`.

- `totals[materialId]`: winning-material path length in metres.
- `materialColumns[materialId]`: that path's water-equivalent contribution in m.w.e.
- `mwe`: unchanged total column, accumulated in the existing material-registry order.

The integral remains in `compiled-mesh-runtime.js`, where dataset density is already applied to the priority-resolved ray path. Every registered material is included, including steel and arbitrary future IDs; unhit materials have zero contribution. Air keeps its geometric path but contributes zero column, matching the existing transport convention. Void subtraction remains the compiled mesh's responsibility. Component/entity overlap lengths are not additive winning-material contributions and must not be substituted for `totals`.

No additional ray pass, density constants, smoothing, component ownership inference or new response formula was introduced. Columns are raw geometry quantities on each graph's own actual sampling grid. Their sum must agree with total `mwe` within `max(1e-9, 1e-12 × abs(mwe))`; the original total formula remains bit-for-bit identical. Nonfinite/negative contributions and nonfinite totals fail explicitly.

For an injected backend that does not supply contributions, adapters expose `materialColumns: null`, not an empty/all-zero claim. Consumers must treat that as unavailable. The compiled backend supplies the complete registered-material map. Each pixel copies the map, preventing mutation of the trace result. Raw result schema 0.1.0 is extended additively; the separate contour export contract is documented in PROJECTION_DATA.md#contour-export-and-replay. Pattern fields require explicit units and provenance.

### Verification

`tests/material-contributions.test.mjs` independently evaluates the previous total formula and verifies priority overlap, arbitrary `test-alloy`, thin steel, unhit/air paths, inside origins, zero/truncated rays, detached maps, nine rays for nine pixels, unchanged raw/display response, and JSON round trips. Existing material/assessment regression tests verify column accounting and same-trace copies for all four published scenarios (both response models in the assessment test).

## Numerical contour extraction

The offline D3-contour 4.0.2 dependency, licenses and bundle remain unchanged. The contour benchmark sample-coordinate/mask adapter was promoted into this production module; `scripts/contour-benchmark-core.mjs` now calls that same extraction implementation. There is one extraction path, not a benchmark-only scientific duplicate. D3 still owns marching squares; no new contour algorithm was introduced.

### Level policy

Callers must explicitly choose one of:

```js
extractContributionContours(field, {
  mode: 'physical', units: 'm.w.e.', levels: [10, 25, 50]
});
extractContributionContours(field, {
  mode: 'adaptive', fractions: [0.25, 0.5, 0.75]
});
```

Physical levels must use the field's exact units (`m` for path, `m.w.e.` for column), be finite/nonnegative, strictly increasing, and contain 1–16 entries. These example levels are not platform defaults. No universal dam-specific physical levels are adopted.

Adaptive levels use explicit fractions of the valid scalar min/max range: `(1-f) min + f max`. Fractions must be strictly increasing within (0,1), with 1–16 entries; omitted fractions default to 0.25/0.5/0.75. These are **inspection defaults**, not statistical/physical significance thresholds. Every adaptive result labels itself “not comparable across views” and records fractions, source range, resolved levels and units. No colour-scale percentile, histogram or RGB value participates. For cross-view comparisons choose the same explicit physical levels.

All-invalid adaptive input has no resolvable levels/overlays and reports invalid field validity. Constant adaptive fields retain their requested fractions and repeated resolved scalar values as absent (or unresolved if partially valid), never a padded boundary. Values equal to either valid scalar extreme are not accepted as isolines.

### Support, completeness and provenance

- Map D3's half-cell sample coordinates piecewise through actual sx/sy centers, including nonuniform detector centers. Do not extrapolate beyond their hull.
- Suppress padded polygon closures and segments touching cells with invalid corners. Missing values never become zero material or material boundaries.
- Keep sampled holes and polylines; line fragments are not physical feature/component counts.
- Complete constant or out-of-range fields return `absent`, not an assertion that a geometric interface is outside the field. A partially valid constant/out-of-range field is `unresolved` because missing samples could contain a crossing.
- Supported open/hull-limited lines or any partial valid domain return `clipped`; no supported line at an interior level returns `unresolved`. Closed fully supported lines can be `ready`.
- Count valid checkerboard saddle cells at each level and record `ambiguous` topology, incomplete provenance and a warning. Retain pinned D3 connectivity; do not claim an exact physical connection.

Provenance completeness concerns supplied numerical support/curve extent, **not** real-geometry topology or qualified feature localization. Even nonsaddle output records `sampled-not-qualified`. Refined-distance/topology acceptance gates remain open. Invalid/absent/unresolved states never carry fabricated lines. Reports retain source field ID, snapshot key, material/quantity/units, level policy, algorithm 4.0.2, adapter 1.0.0, linear interpolation and mask/hull policies, source limitations and discarded-segment diagnostics.

The zero-valued overlay tolerance describes exact constant/range tests, not zero geometric error. The acceptance numerical regression policy still controls smooth-fixture accuracy. No optical or structural envelope is claimed.

### Library basis

Use pinned offline D3-contour 4.0.2 rather than custom marching squares. The [official API](https://d3js.org/d3-contour/contour) defines centers at (i+0.5,j+0.5); subtract 0.5 and map through actual slope centers. The [pinned source](https://github.com/d3/d3-contour/blob/v4.0.2/src/contours.js) uses fixed saddle connectivity, not an asymptotic decider. Preserve ambiguity warnings and mask/hull filtering; padding closures are not physical envelopes. Attribution and licenses remain in dist/vendor/d3-contour/. Reproduce numerical checks with scripts/benchmark-projection-contours.mjs and tests/contour-benchmark.test.mjs.

## Graph mapping

`dist/modules/projection-pattern-fields.js` provides:

- `prepareProjectionPattern(result)`: validate the graph's rectangular row-major sampling; create its pattern snapshot/grid.
- `materialFieldFromProjection(result, material, quantity)`: create a detached raw pattern material-path or material-column field from material contribution quantities.
- `mapContributionOverlayToGraph(overlay, field, {width, height})`: map contour slope polylines into an equal-cell raster's top-left pixel coordinates without scientific resampling.

### Native grids, not shared pixel indices

Each graph extracts contributions from **its own** computed rays. Material projection uses its actual uniform slope centers/half-angle. Detector assessment uses actual weighted native-strip-bin centers over the device's full field. The adapter verifies detector center/range consistency against the existing `nativeAxisBins` core, and records bounds at half a native slope step beyond each first/last strip difference. It never replaces weighted centers with bin midpoints.

All row/column pixels must agree with the extracted axes, ordered sx increasing and sy decreasing. Missing material contributions become `null`/invalid support, not zero. Negative/nonfinite values, unknown materials, inconsistent native ranges and missing units/provenance fail explicitly. Material fields are representative-direction samples, not bin-integrated material averages, even on detector-aggregated grids. Existing response smoothing is not applied to them.

The current canvases draw equal-width cells. Accordingly each actual slope center maps to `(index + 0.5) × graphSize / bins`; interpolation between centers is piecewise, not an endpoint-only affine mapping. Top sy maps to the top row. Material and detector indices are never interchanged. Long segments are split at sx/sy mapping knots so a piecewise-linear transform is not approximated by one straight screen chord. Dimensions can be rectangular and specified in raster or CSS pixels; callers choose the drawing coordinate system consistently.

Only contours from the matching field ID, quantity/material/units and snapshot are mapped. Out-of-center-hull segments fail instead of being extrapolated or clamped. There is no auxiliary-grid regridding, cross-graph curve transplant or geometric clipper in this unit. Contour extraction removes unsupported/frame-padding segments on the native field. This supports independently extracting and mapping both graphs' own contributions; it does not claim identical sampling error or topology between them.

### Calculation identity and provenance

Compiled runtime metadata now records density values/units, coordinate frame declarations, classification/tolerances, adapter/IR/data versions and asset identity. `loadCompiledMeshRuntime` supplies verified source-spec and scenario-GLB SHA-256 identifiers from the already validated manifest. Direct synthetic buffer construction is explicitly `unverified-buffer`, not represented as a verified release.

Both projection evaluators detach runtime identity, scenario variables and geometry metadata **before their first asynchronous yield**. The result remains the source of all pattern inputs; no current UI/runtime state is consulted after calculation. Pattern identity additionally includes origin/frame, pose, requested ray extent, actual grid/bounds, full detector/response where applicable, model/backend versions and release identity. The material graph explicitly uses no detector/response and its own material-integral version; the assessment graph retains the shared response model version.

Graph dimensions/styles do not enter scientific snapshot identity. Missing native geometry provenance prevents field preparation; it is not filled with guessed dataset facts. Runtime and result data remain plain objects: consumers must not mutate scientific fields/settings. This unit does not add asynchronous caches or prove stale-result scheduling.

These are additive v0.1.0 result metadata and pattern adapters, distinct from the complete contour export format. Main application DDA, geometry buffers, paths, total columns, count formulas and response smoothing are unchanged.

## Contour export and replay

Implementation: `dist/modules/contribution-export.js`; validation/replay tests: `tests/contribution-export.test.mjs`. This is a numerical-pattern format, not a deployment plan or geometry release.

### Download and compatibility

In the HTTP geometry preview, each graph has a new contour JSON button beside its existing raw JSON button. Files are named `material-contribution-contours-<scenario>-v1.json` and `assessment-contribution-contours-<scenario>-v1.json`. Each button exports its own completed calculation; pending/invalidated results disable that graph's button. It cannot silently combine graphs with different snapshots.

The original raw material/assessment downloads remain v0.1.0 and unchanged. They are **not** automatically interpreted as this format. Readers reject unsupported document, generator or pattern versions. Any later incompatible change needs an explicit versioned migration and fixture tests; no guessed/implicit migration is supplied. This contour format has no dedicated browser import UI; combined layer/comparison replay is described in PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison.

### Document shape

| Member | Meaning / requirements |
| --- | --- |
| `schemaVersion` | Exact `1.0.0` |
| `kind` | Exact `material-contribution-pattern-export` |
| `generator` | `compiled-preview-contribution-export`, version `1.0.0` |
| `graphKind` | Original material projection or compiled detector assessment; must match snapshot grid kind |
| `snapshot` | pattern identity and all effective release/scenario/geometry/backend/model, station/pose, density/coordinate/assets, sampling/ray-range, device/environment/response inputs |
| `selection` | Ordered unique registered material IDs, material-path/material-column quantity, explicit effective level policy |
| `entries` | One per selected material, in selection order: complete pattern `field` plus contour `contours` result |
| `display` | Separate visibility, material colours, CSS stroke/halo widths and original raster display metadata; not scientific identity |

Every field records raw scalar values, true/false validity mask (invalid values are null), actual slope centers and detector bin bounds where applicable, units, quantity/material and source provenance. Every contour result retains source snapshot/field ID, valid-domain coverage/variation, resolved scalar levels, adaptive source range/fractions, extraction/adapter version/settings, slope-space lines, validity/completeness/clipping state, ambiguity and limitations. Geometry asset hashes are retained from graph adapter when verified; synthetic/unverified provenance remains explicitly unverified.

Physical policies save exact levels and field units. Adaptive policies save explicit effective fractions, including the default 0.25/0.5/0.75, and each field's resolved levels/range and inspection-only warning. Changing styles/visibility cannot change scientific entries or snapshot identity. Hidden layers still export selected scientific fields. No selected materials produces an explicitly empty selection/entries with the calculation snapshot. Invalid levels prevent a contour download even for hidden/empty selections; errors appear in that graph's contribution legend.

Display coordinates and SVG path commands are not the scientific curve representation: saved lines remain detector-local slopes. The graph adapter maps them to any requested graph dimensions. No screenshots, RGB contour extraction, extra ray pass, source-entity inference or transport formula is introduced.

### Executable validation and replay

```js
import { createContributionExport, replayContributionExport }
  from './dist/modules/contribution-export.js';

const saved = createContributionExport(result, {
  quantity: 'material-column', materials: ['concrete'],
  levelOptions: { mode: 'physical', units: 'm.w.e.', levels: [10, 50] }
});
const replay = replayContributionExport(JSON.parse(JSON.stringify(saved)));
```

`createContributionExport` uses the same shared pure core as preview extraction; it detaches data from caller results/settings/styles. `replayContributionExport` requires finite JSON, validates snapshot identity, registered/unique materials, quantity/units, raw fields, grid/source linkage, complete explicit level policies and matching entry counts. It then reruns pinned D3 4.0.2/adapter 1.0.0 using saved fields and rejects any difference in saved contours, levels, states or provenance. Key order does not affect comparison. No geometry loading, DOM, renderer or ray tracing is needed.

Replay proves consistency of the **saved numerical fields and extractor**, not authenticity of the file, correctness of real geometry, physical accuracy or signal detectability. It is not a digital signature. No file is executed and no external dependency/service is contacted. Very large untrusted inputs require a separate resource-limit policy before any future public import UI.
