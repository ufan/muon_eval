# Projection and reference validation

Numerical tolerances, feature-scale rules, performance targets and analytical fixtures. Requirements and regression scopes are not claims of survey accuracy, physical detectability or completed browser qualification. Remaining work belongs in ROADMAP.md, not in a completed-task log.

Related: [Projection data and numerical interpretation](PROJECTION_DATA.md) · [Geometry reference methods and artifacts](GEOMETRY_REFERENCES.md) · [Projection interpretation workflow](PROJECTION_WORKFLOW.md) · [Unfinished work](ROADMAP.md).

- [Acceptance requirements](#acceptance-requirements)
- [Analytical fixtures](#analytical-fixtures)

## Acceptance requirements

### 1. Numerical gates

| Check | Acceptance limit | Scope / evidence |
| --- | --- | --- |
| Analytic fixture ray paths and columns | Absolute error ≤ 1e-6 m and ≤ 1e-6 m.w.e. | Exactly representable synthetic meshes only; retain its intersection/point tolerance of 1e-8 m |
| Affine scalar-field contour mapping | Scalar residual ≤ 1e-12 for the dimensionless affine fixture | Both actual slope-center grids; no endpoint-only mapping |
| Smooth circle localization | Maximum retained-vertex radial error ≤ 0.05 times the maximum adjacent slope-center gap; error decreases at 25 → 65 → 129 bins | Radius 0.4, level 0.16 fixture only; both grids. This is a regression threshold, not a general error bound |
| Structural source-reuse parity | Same native candidate edge identities/counts; endpoint error ≤ 1e-6 m, ignoring segment orientation | Fixture buffers and recorded native VTK 9.5.2 outputs, before material qualification/clipping; test port parity |
| Perspective mapping arithmetic | Absolute slope error ≤ 1e-12 against independently evaluated known-point formulas | Well-conditioned fixture points with forward depth ≥ 1 m; no precision claim near the observer plane |
| Contribution accounting | Absolute sum error ≤ max(1e-9 m.w.e., 1e-12 × absolute total column) | Every material, same traces/densities and snapshot; this is floating-point accounting, not physical accuracy |
| Overlay independence | Scientific arrays and snapshot identity unchanged exactly | Colour/visibility/line-width toggles must not recalculate or mutate scientific inputs/results |

Actual sx/sy centers, row ordering, units, invalid mask, source identity, and algorithm/settings provenance are exact contract checks, not approximate acceptance criteria. Invalid values are never zero material. Reject nonfinite outputs.

### 2. Feature-scale and topology policy

Use local spacing from the actual axes, not nominal bin count or an assumed uniform detector grid. For a feature crossing a region, report its narrowest width divided by the largest adjacent center gap in that region. A width below **three intervals** is flagged as undersampled; three intervals is a conservative inspection rule, not a guarantee of recoverability. Where width cannot be established, report resolution unknown rather than inventing a width estimate.

Changing samples does not change detector angular resolution. Keep sampling spacing and configured detector response resolution separately visible/exported. Do not substitute the current example device's resolution for every device. Angular comparisons use normalized ray directions (angle between rays), not slope magnitude interpreted as degrees.

For sharp openings, terrain breakpoints and partial material interfaces, no universal metre residual or topology guarantee is accepted. Before using feature location/topology in an engineering comparison:

- Compare against an analytic boundary where available, otherwise a separately refined reference on the same domain and explicit physical levels (adaptive levels must not change during refinement).
- Measure symmetric curve distance in local-bin units, including segment interiors, not only scalar residual at vertices. Require ≤ **0.5 coarse interval** and stable hole/component correspondence on two successive refinements for a location-qualified feature. Reference spacing must be ≤ one quarter of the coarse spacing in the evaluated region.
- Exclude unsupported, ambiguous, mask-adjacent and domain-clipped portions from location-qualified claims. Record their extent/completeness; do not silently remove them to claim full-curve accuracy. Refinement stability alone is not proof of real-geometry topology.

D3 saddle cases remain explicitly ambiguous unless independently resolved; preserve the pinned library behavior but do not label it an exact physical connection. Constant/all-hit fields can legitimately have no contour. No grid-frame closures, invalid-hole borders or terrain domain caps may become physical references. Unsupported portions yield partial/unresolved states even when other lines are useful.

Distance/refinement gates require independent measurements; vertex-only scalar residuals do not establish them.

Structural qualification must record geometry scale, dataset precision and classification offsets/error bounds. The synthetic 1e-8 m point tolerance is not a default for real releases. Require positive-depth, field and ray-range clipping before perspective division; test crossing segments, not just endpoints. Near-plane ill-conditioning must be clipped or unresolved with recorded settings. Domain provenance missing from the current release still blocks certified physical rock-envelope claims. Under the approved specification v1.1, finite-model references instead exclude known cap-incident edges and visibly disclose unresolved physical scope; finite-model acceptance does not relax numerical/source-binding gates or claim survey accuracy.

### 3. Performance budget

| Workload | Budget | Acceptance meaning |
| --- | --- | --- |
| One field, three levels, 65 bins, extraction + adapter | P95 ≤ 10 ms target | Extraction and adapter only; verify production fields separately |
| One field, three levels, 129 bins | P95 ≤ 20 ms target | Optional refinement; not required live resolution |
| Two materials × three levels × two graphs at 65 bins | P95 ≤ 100 ms target, after scalar fields are available | Must measure whole production batch; do not multiply individual timings and call it evidence |
| Main-thread overlay work | Each uninterrupted chunk ≤ 8 ms target | Yield or use a worker when needed; scheduling/cancellation must be tested in browser |
| Overlay-control feedback | Visible acknowledgement ≤ 100 ms; cached overlay redraw ≤ 100 ms P95 target | No ray recomputation for visibility/style changes |
| Changed station/pose/environment | Invalidate stale overlay immediately; acknowledge pending work ≤ 100 ms | Full ray/response/BVH time measured separately; no full-calculation latency promise yet |

All times above are chosen interactive engineering budgets, not established browser performance. Performance checks must measure desktop and narrow-screen HTTP previews, recording browser/OS/CPU, viewport, device-pixel ratio, dataset/scenario, bins, materials/levels, warm/cold caches, segment counts, iterations and cancellation behavior. Include complex opening/terrain fields and real-release worst cases, not only a circle. Report extraction, clipping/mapping, drawing, full calculation and cold BVH loading separately. A slower machine may require asynchronous computation/refinement; do not reduce correctness or silently change physical levels to meet a time target.

No stale result may replace a newer snapshot, even if cancellation finishes late. Pending/unresolved states must be visible. CSS-pixel line width and camera/container resizing remain independent visual acceptance gates. Recorded Node timings do not close browser performance gates.

### 4. Verification

Run `node --test tests/*.test.mjs`, `node --check dist/app.js`, and `git diff --check`. Run the contour benchmark with `node scripts/benchmark-projection-contours.mjs` (JSON to stdout); preserve pinned inputs and report hardware when comparing timings. Native structural-reference reproduction is described in its decision document and is not a runtime requirement.

## Analytical fixtures

Sources: `tests/projection-pattern-fixtures.mjs`; tests: `tests/projection-pattern-fixtures.test.mjs`. Synthetic model-frame coordinates and metre lengths; no real-dam constants or data release changes. Reuses the existing cube mesh helper and production compiled mesh/BVH runtime.

| ID | Exact geometry | Central +X chord from origin |
| --- | --- | --- |
| slab | 2≤x≤6, −4≤y,z≤4 | 4 m concrete |
| wedge | 2≤x≤6+y/4, −4≤y,z≤4 | 4 m concrete |
| cavity | slab minus 3≤x≤5, −1≤y,z≤1 | 1+1 m concrete, separated by 2 m air |
| opening | slab with through-opening −1<y<1 over its full z extent | No concrete |
| material-junction | slab split at x=4: concrete then rock | 2 m concrete + 2 m rock |
| terrain | 2≤x≤10, −4≤y≤4, −4≤z≤1+x/4 | 8 m rock |

Synthetic densities are concrete 2.4, rock 2.65, air zero (g/cm³). The terrain's inclined top is physical; side/bottom faces only bound the synthetic domain. Domain metadata must survive later structural-reference benchmarks. Cavity negative volume is represented by a reversed inner shell, not an air component overwriting concrete. The opening uses disjoint solid components.

Each fixture exposes an external view at [0,0,0], internal view at [4,0,0], and off-axis external view at [0,−0.5,0.25], azimuth 17°, elevation 11°. “Internal” describes the position within the fixture extent: concrete for slab/wedge, cavity/opening air, and rock for terrain. It does not imply every origin is an installable station. Units, frame, fixture identity and terrain-domain caveat are explicit.

### Independent reference and checks

The test-only analytical oracle intersects the ray with the fixture's plane inequalities, using double precision. It subtracts the contained cavity interval and sums disjoint material volumes; it does not call BVH, mesh triangle intersection or material projection. This deliberately limited oracle is not a general CSG engine and must not be shipped into production as an alternative algorithm.

Hand-calculated central chords, oblique slab/wedge formulas, cavity exit intervals, representative material points, surface tangency and finite ray truncation anchor the oracle. For +X-forward slopes, an oblique slab chord is `4 sqrt(1+sx²+sy²)` while the wedge chord is `6/(dx−dy/4)−2/dx`, provided the ray exits through those planes.

All six fixtures compare every ray in 25×25, 65×65 and 129×129 slope grids over [−0.6,+0.6]² for all three views: 386,838 comparisons. Checks include every material length, water-equivalent sum and total-length conservation. The existing material-projection evaluator also verifies full-field concrete occupancy with varying thickness in slab/wedge. These checks do not validate contour topology, convergence of extracted curves, browser rendering, calibrated detector resolution or structural-reference algorithms.

Fixture-only absolute tolerance is 10⁻⁶ m (and 10⁻⁶ m.w.e. for column checks); BVH intersection/point tolerance is 10⁻⁸ m. Coordinates are exactly representable in Float32. These tolerances do not establish real-dataset or contour acceptance accuracy; see PROJECTION_VALIDATION.md#acceptance-requirements. No new dependencies, scientific formulas, preview behavior or export formats change.

Run: `node --test tests/projection-pattern-fixtures.test.mjs`. Contour tests independently cover actual grid coordinates, invalid scalar regions, constant fields and saddle ambiguity; these are not geometry-ray claims.
