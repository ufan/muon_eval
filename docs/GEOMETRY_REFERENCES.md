# Geometry reference methods and artifacts

Developer reference for through-material mesh lines, qualification, offline interface construction and source-bound artifacts. Finite-model references are useful deployment context, not certified surveyed interfaces. Native preprocessing libraries are development-only; runtime computation does not depend on DOM or renderer objects.

Related: [Projection data and numerical interpretation](PROJECTION_DATA.md) · [Projection interpretation workflow](PROJECTION_WORKFLOW.md) · [Projection and reference validation](PROJECTION_VALIDATION.md) · [Unfinished work](ROADMAP.md).

- [Reference semantics and library choice](#reference-semantics-and-library-choice)
- [Candidate qualification and projection](#candidate-qualification-and-projection)
- [Offline interface construction](#offline-interface-construction)
- [Derived interface artifact contract](#derived-interface-artifact-contract)

## Reference semantics and library choice

### 1. Decision

Select **material-qualified perspective apparent contours plus separately labeled feature creases and verified patch-boundary references**, projected through material into detector-local slope space. Use the established mesh-edge/co-face-normal method; do not create a new silhouette algorithm or substitute depth jumps for geometry.

Reuse path for interface extraction: adapt the small edge-connectivity/normal/selection portion of pinned `vtkPolyDataSilhouette` 9.5.2 into a renderer-independent typed-buffer module, retaining upstream BSD-3-Clause notices and explicit adaptation/version history. Native VTK remains the numerical reference. This is a reviewed source-reuse choice, not a proposed browser VTK dependency. The candidate port now matches all recorded native fixtures; **real physical-interface extraction is not yet accepted**. Reuse only the extraction logic, not camera objects, VTK pipeline scheduling/caches or rendering APIs. Cache by explicit geometry/scenario/station/settings identity.

The upstream method maintains adjacent face normals at an edge. Perspective selection tests their facing signs against the vector from edge midpoint to observer; opposite signs select an apparent contour. Its optional normal-angle test selects feature creases. [Pinned VTK source](https://github.com/Kitware/VTK/blob/v9.5.2/Filters/Hybrid/vtkPolyDataSilhouette.cxx), [API](https://vtk.org/doc/nightly/html/classvtkPolyDataSilhouette.html). The geometric distinction between contour extraction and visibility also has an established treatment in [Bénard and Hertzmann, Line Drawings from 3D Models](https://arxiv.org/abs/1810.01175).

This method identifies **candidate curves**, not winning-material interfaces by itself. Dataset semantics and shared material classification must qualify the interface portions as described below. Unresolved portions remain unresolved; no claim of a complete true air boundary is permitted from component mesh edges alone.

### 2. Exact reference meanings

Let the qualified material classifier define the winning material at a model-frame point. A concrete–air (or rock–air) interface is a surface patch whose opposite open sides are those two winning materials, after void subtraction, material priority and the selected environmental scenario. A component carrying a concrete/rock label does not establish that every one of its faces is such an interface.

The structural layer may contain only these explicitly identified reference types:

1. **Apparent contour:** shared edge of two qualified interface faces whose perspective facing signs differ. Preserve separate surfaces/cavity sheets; do not reduce them to the outer boundary of a binary ray-hit mask.
2. **Feature crease:** a qualified interface edge passing a recorded face-normal angle threshold. This is an engineering shape reference, not an “outer envelope” or promised signal. Keep it independently identifiable from apparent contours; expose the chosen threshold. The 30° used in this experiment is not an adopted production default.
3. **Verified physical patch boundary:** an interface/opening rim with established provenance. Do not automatically output all open mesh edges. An air/another-material patch transition may be a useful reference, but it must be labeled with its actual semantics rather than turning a contact face into air.

Exclude triangulation diagonals, same-material internal seams, virtual/proxy geometry and mere component boundaries. Exclude terrain/domain caps from physical references. Keep clipping/missing-domain warnings separately. At an actual triple-material junction, eligible air-interface portions can remain, but adjacency must describe the qualified patches, not an unqualified cap normal.

The selected method is a **triangulated-mesh reference**, not smooth-CAD exactness. Gradual faceting can supply apparent contours even when creases are disabled. Any later smooth-surface/curvature features, inferred internal entity boundaries or exact CAD hidden lines require separate scope/validation.

### 3. Small reference comparison and evidence

Reproducible comparison: `scripts/benchmark-structural-reference.mjs` calls `scripts/vtk-structural-reference.py` on the analytic fixture buffers plus a 16-sided prism. No GUI, GPU, external service or rendering visibility participates. It invokes native VTK's feature filter and perspective-origin silhouette filter with border edges and silhouette feature-angle additions disabled. It compares whole 3D edge sets, ignoring segment orientation, to already vendored Three.js r186 `EdgesGeometry` at 30°.

Recorded native run: [structural-reference evidence](../tests/fixtures/structural-reference.json). Nine components across seven shapes, three views each; all nine feature-edge sets match. Each component's exact buffer-derived SHA-256 is recorded and checked by the default Node test suite. Native silhouette segments are retained for subsequent port regression.

| Shape | Creases (30°) | Native silhouettes, external / internal | Interpretation |
| --- | ---: | ---: | --- |
| Slab | 12 | 4 / 0 | Triangulation diagonals are excluded; an internal observer need not have an outer contour |
| Wedge | 12 | 4 / 0 | Shape creases and outer contour are different references |
| Cavity shell | 24 | 8 / 0 | Outer and inner surfaces are retained without optical hidden-line removal; internal crease references can still matter |
| Through-opening, each side | 12 | 6 / 4 | Preserve opening topology and observer dependence |
| Concrete–rock junction, each component | 12 | 4 / 0 | Per-component edges alone do not establish air-interface semantics |
| Finite terrain | 12 | 4 / 0 | Library output includes domain caps unless excluded separately |
| Gently faceted prism | 32 | 14 / 0 | Two external apparent-contour edges are absent from the sharp-crease set |

Off-axis-origin cases are also recorded; the prism produces 16 silhouettes, again two outside its crease set. Pose affects projection/field clipping, while mesh facing selection depends on observer position, not the detector's azimuth alone.

Important negative result: six axis-only offset probes at an edge midpoint fail to find the cavity air sector for 12 valid inner creases. A separate two-axis offset confirms actual air. These probes are retained as a **diagnostic counterexample**, not the chosen material qualification algorithm. Likewise, a concrete–rock face-interior probe detects contact rather than air, but that does not certify the entire face or its perimeter.

The adapter's point projection test verifies perspective scaling and point translation: `sx=(p−o)·right / ((p−o)·forward)`, and similarly for sy. Undefined/backward points are explicitly rejected in the experiment. Whole-line clipping is not implemented or accepted by these endpoint checks.

### 4. Candidates accepted/rejected for this role

- **VTK 9.5.2:** native reference and selected upstream algorithm for buffered source reuse. BSD-3-Clause; installed in a temporary development directory only, not shipped. The pinned wheel is about 112 MB, so adding it to the static browser application is not justified. [VTK license](https://github.com/Kitware/VTK/blob/v9.5.2/Copyright.txt).
- **Three.js r186 EdgesGeometry:** MIT, already present offline. Feature-edge comparison reference, not the final scientific core interface. It lacks viewpoint selection and uses fixed coordinate hashing, so it is not a complete envelope backend. [Official API](https://threejs.org/docs/pages/EdgesGeometry.html); local source in `dist/vendor/three/three.core.js`.
- **three-edge-projection:** not adopted here. Its documented projection/culling is orthographic/top-down; detector slope perspective and penetrative defaults are different. Reusable clipping/intersection facilities can be revisited if demonstrably needed, without treating the package as a drop-in solution. [Upstream API](https://github.com/gkjohnson/three-edge-projection/blob/main/API.md).
- **OCCT hidden-line removal:** not executed or adopted in this small comparison. Native CAD/optical visibility machinery is not needed for the selected through-material policy. It remains an optional independent future CAD reference, not current validation evidence.
- **D3 contours and existing depth-jump edges:** numerical/diagnostic layers only, not structural extraction.

Native VTK is not a browser dependency. Three objects appear only in the development comparison adapter, constructed from computation-owned buffers; neither scientific calculations nor the selected production module may consume scene geometry.

### 5. Material qualification, domain policy and acceptance constraints

Candidate normals/adjacency must come from the same closed, consistently wound buffers as material tracing. Retain triangle/co-face/component identity through extraction. Do not use averaged visual normals, display geometry, source-name guesses or view flags.

Prefer explicit physical-interface/domain provenance where available. For material overlaps, scenario-dependent water contacts and partial face interfaces, qualify using the shared winning-material core with recorded offset/error bounds on **face-interior sides**, not arbitrary edge-axis probes. A single midpoint result cannot certify a whole edge or face. Subdivide/clip only with verified geometry operations and recorded convergence/error bounds. If a contact splits a face, the original component adjacency is insufficient: retain a verified split patch/rim or mark that portion unresolved. Do not invent an intersection seam by projecting every component edge.

Domain clipping and a genuine physical face both appear as material→air at the edge of a finite mesh. Classification alone cannot distinguish them. The current compiled decoder/manifest supplies component metadata, not a complete per-face physical/domain map. Physical certification requires verified domain mappings from release metadata/adapter evidence; where not possible, emit incomplete/unresolved rock references and a domain warning. Do not infer a physical boundary merely from the mesh bounding box. A planar finite terrain fixture may have **no accepted physical line** after all its perimeter caps are excluded; do not manufacture a skyline to make the control visibly active.

Source entity ownership remains independent: aggregate concrete/rock components do not become canonical entities because a reference edge is found. Per-material line attribution can be valid while per-entity attribution stays unavailable.

Physical-interface certification requires tests of thin/overlapping materials, water replacement, openings and dataset-specific complex geometry, with unresolved cases disclosed. Method selection alone is not physical qualification.

### 6. Perspective/through-material policy

Keep eligible internal and far-side references even behind intervening material. Do not run optical hidden-line removal by default. Source depth and reference type should remain inspectable; geometric lines do not imply count contrast. Optical visibility, if later offered, is a separate labeled setting.

Select candidates in 3D, then clip segments in detector-local camera coordinates against positive forward depth and the actual graph's slope field **before division**. A line crossing the observer plane must be clipped, not discarded because one endpoint is behind, nor allowed to produce infinite slope. Clip each graph against its own coordinates/bin extent; do not align grids by index. Clip requested ray range consistently and disclose its effect; numerical endpoint tests are not proof of spherical ray-range clipping.

No clip-plane segment or plot-frame border becomes a new physical reference. Boundary-only/overlapping/absent/outside-field/unresolved states must be distinguishable. All-hit rays and zero apparent silhouettes are legitimate outcomes, especially for internal observers. Crease references and numerical contribution contours provide different useful information in those cases.

### 7. Reproduction

Reproduce in a scoped temporary package directory without changing system or application dependencies:

```sh
structural_reference_dir=$(mktemp -d /tmp/muon-structural-reference.XXXXXX)
python3 -m pip install --only-binary=:all: --target "$structural_reference_dir/packages" vtk==9.5.2
PYTHONPATH="$structural_reference_dir/packages" node scripts/benchmark-structural-reference.mjs
```

The script requires VTK 9.5.2 and accepts `--python /path/to/python` for an existing environment. Default Node tests require no Python or VTK installation; they validate live Three geometry/point projection and recorded native evidence tied to fixture hashes. Native regeneration is a separate optional development check, not an assertion that VTK is running during every test invocation.

## Candidate qualification and projection

The core separates candidate extraction, supplied whole-face qualification, and whole-segment projection. Under the user's approved specification v1.1, a separate **finite-model** consumer is connected to the preview UI; it excludes known cap-incident edges and retains unresolved physical-scope warnings. This does not accept certified physical envelopes. No physics formulas, release meshes, original exports or default application backend changed. See [finite-model workflow](PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison) for interfaces, controls and exports.

### Candidate and qualification boundary

`structural-reference-candidates.js` adapts the reviewed VTK 9.5.2 indexed co-face method; its fixture outputs match the recorded native reference. It does not establish a physical interface.

`structural-reference-qualification.js` consumes an explicit face map v1.0.0 tied to the exact indexed mesh SHA-256 and an explicit scenario key. The hash uses UTF-8 JSON of `{positions: Array.from(...), indices: Array.from(...)}`, matching the native fixture evidence convention. The caller must use a scenario key identifying the dataset release and effective environment, not an unversioned display name. Every indexed triangle must be labeled physical-interface, material-contact, domain-cap, or unresolved, with an evidence description. Physical/contact records require the two distinct winning side materials, whole-face-open-sides scope, and a finite nonnegative error bound in metres. These are **supplied assertions**, not proofs generated or independently verified by this consumer. Zero error in analytic fixtures does not claim real-release precision.

Only candidates with two whole-face-qualified target-material/air co-faces are returned. Contacts/caps are excluded; unknown co-faces stay unresolved. No edge-axis or midpoint probes can promote a face. Partial water/contact faces must remain unresolved until verified splitting/whole-patch qualification is available. Neither material labels nor face-map acceptance invent entity ownership: sourceEntityId remains null. Through-material references are retained without optical culling. Feature inclusion and angle must be explicit; no production angle default is adopted.

The `complete-supplied-face-map` value describes supplied face-map coverage, **not a complete envelope**. Adapter v1.1.0 supports explicitly enabled physical patch rims between two already-qualified material/air co-faces, including coplanar transitions; domain/open-border rims are excluded. Contact splitting is not performed by this consumer. Domain warnings persist even if all map records are known. Open indexed borders prevent complete qualification and are excluded, not implicitly welded or certified.

### Whole-line projection

`structural-reference-projection.js` uses the established parametric clipping formulation described by [Liang, Barsky and Slater (Berkeley technical report)](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1992/Archive/CSD-92-688.pdf). This is a compact application of those inequalities, not a new clipping algorithm or copied library implementation. The requested radial ray range uses analytic line/sphere intersection, as described in [PBRT's sphere treatment](https://www.pbr-book.org/4ed/Shapes/Spheres); closest-approach distance avoids directly subtracting quadratic discriminant terms.

For model-relative point p, define x=p·right, y=p·up, z=p·forward. Intersect the source segment's parameter interval with `z >= nearDepthM`, `sxMin*z <= x <= sxMax*z`, and `syMin*z <= y <= syMax*z` **before** division. Then intersect with the sphere `|p| <= rayLengthM`. A radial range is not a far-forward plane: endpoints outside the sphere may enclose an eligible middle segment. Perspective slopes are computed only on surviving endpoints.

Caller supplies each graph's actual finite slope bounds, positive nearDepthM and rayLengthM. Near depth is an explicit numerical exclusion/settings value, not a claimed geometry accuracy. No hidden default or graph-index alignment is used. Output retains original source parameter interval, model endpoints, slope endpoints, endpoint radial distances, and active scope. Projection cannot establish or change interface qualification. Empty, point-projected and tangent-only contacts return outside-field with an explanatory reason. No frame/clip-plane edge is created.

Tests cover exact perspective examples (1e-12 slope checks at metre-scale depth), rotated/translated frames, observer-plane crossings, both-endpoints-outside field/range segments, tangency, orientation reversal, and 1,000 deterministic scope/source-line checks. This is double-precision arithmetic, not an exact/interval predicate library; arbitrary extreme-coordinate or ill-conditioned near-tangent cases are not certified. Nonfinite arithmetic fails explicitly. Complex-feature convergence and browser performance require separate validation.

### Real-release domain audit

`node scripts/audit-structural-reference-domain.mjs` checks the archived compiler's SHA-256 against its reviewed pin and the release manifest, loads verified release meshes, and audits all four scenarios. The script is development-only and dataset/compiler-specific; no dam dimensions enter the generic core.

Reviewed archive member: `dam_v07/compiler.py`, SHA-256 `264500a53ebe203468a2b9ec3feffb4562e76e26587ec376aef98ae9830d5045`. Its `heightfield()` explicitly builds bottom and ring caps; `Compiler.__init__()` declares the sampled rock grid; `to_model()` declares the coordinate mapping. Boolean operations/export do not retain face lineage. This source is evidence for **negative domain exclusions**, not proof of every remaining physical interface.

Important: the declared doc-x maximum is 831 m, but the sampled grid ends at 830 m. A bounding-box/declaration-only inference could miss the actual cap. The audit reconstructs reviewed grid endpoints and checks inserted breakline ranges; only triangles exactly coplanar with the five source-derived model cap planes are counted. It does not introduce an arbitrary near-plane tolerance.

All four scenarios contain the same 120,800 rock triangles:

| Domain plane | Faces excluded by exact coplanarity |
| --- | ---: |
| doc-x minimum | 356 |
| doc-x sampled maximum | 356 |
| doc-y minimum | 348 |
| doc-y sampled maximum | 348 |
| doc-z bottom | 58,458 |
| Remaining unresolved faces | 60,934 |

Thus 59,866 known domain-cap faces are exclusion candidates; **zero physical-air faces are certified by this audit**. Tests pin these counts across verified scenarios and reject changed compiler/frame/component semantics. Near-plane or otherwise unmatched triangles remain unresolved. The audit does not supply a production face map or modify release assets.

### Future physical-certification dependency

Before claiming real physical envelopes: establish authoritative physical-domain face/patch semantics and bounded accuracy, including structure/water clipping limits. Existing sampled depth/boundary diagnostics must not be renamed as certified envelopes. The approved finite-model preview is a separate explicit claim; its source-bound Manifold splitting, worker cancellation, cap exclusion, clipping and exports do not resolve physical certification.

## Offline interface construction

### Established library reuse

Use pinned **Manifold 3.5.4**, development-only Python wheel in a temporary directory, for mesh Booleans and face lineage. Its [mesh API](https://manifoldcad.org/docs/html/structmanifold_1_1_mesh_g_l_p.html) provides original-mesh runs and face IDs, and its [Manifold API](https://manifoldcad.org/docs/html/classmanifold_1_1_manifold.html) supplies union/difference/split operations. No custom triangle intersection or CSG implementation is added. This dependency is not shipped to the browser; no runtime CDN/service or application installation is required. The release compiler records its Manifold version as `unknown`, so this is an independent pinned reference, not a claim to reproduce the original compiler environment.

Native helper: `scripts/manifold-interface-reference.py`. Driver: `scripts/benchmark-interface-csg.mjs`. Recorded evidence: `tests/fixtures/interface-csg.json`. Native environment used Manifold 3.5.4 and NumPy 1.26.4. Default Node tests use the recorded output and current input hashes, not a native installation.

### Material-air boundary construction

1. Import computation-owned, consistently wound indexed meshes with unique original IDs and explicit triangle face IDs. Ignore air components and visual/proxy objects, as the shared classifier does for dense occupancy.
2. Union same-material components and process the shared material precedence. For each material, subtract the union of higher-priority dense volumes, obtaining its winning region. Do not rely on arbitrary coplanar union source selection to decide the winning material.
3. Save ancestor component/face lineage from that region. Relabel the entire winning region with its material while retaining an explicit map back to the saved ancestors.
4. Union the labeled winning regions. Internal material-contact faces disappear; partially exposed faces are split by the established Boolean operation. Output co-faces now describe the global model-air boundary, rather than independent overlapping component boundaries.
5. Resolve every output triangle through native original/face IDs to its winning material and ancestor component/triangle. Known domain-cap lineage is preserved as a negative exclusion. Other output scope is deliberately `scope-unqualified`.

This includes cavity/opening sheets: no optical hidden-line removal is run. A canonical source entity is not created from a component/triangle reference, particularly for aggregate concrete and rock.

The helper uses Mesh64 to avoid an additional Float32 cast during derived-reference operations. This does not improve the source GLB's precision. Native tolerances are recorded, **not promoted to validated real-geometry error bounds**. The real scientific mesh buffers remain untouched. Complete positive physical-interface/domain qualification and real ray/surface consistency must precede production promotion.

### Verified patch rims

`structural-reference-qualification.js` qualification adapter v1.1.0 adds explicit `includePatchBoundaries` (default false). When enabled, it examines indexed co-face adjacency after supplied whole-face qualification. An edge between target-material/air and another material/air physical patch receives the separate reason `physical-patch-boundary` and both patch materials. This includes coplanar transitions omitted by angle/silhouette selection. It requires **two already-qualified physical air-interface patches**; it does not split contacts itself or emit domain/open-border rims.

Analytic concrete–rock junction: four coplanar physical patch rims at x=4 appear only when this option is enabled, separately labeled from creases. Finite planar terrain still produces no accepted perimeter skyline: its domain caps cannot qualify rims. Cavity inner and far-side creases remain retained. The supplied face-map consumer still validates assertions rather than independently proving them.

### Evidence and acceptance boundary

Nine synthetic inputs cover slab, wedge, cavity, through-opening, material junction, finite terrain, partial water contact, overlapping material priority and identical-volume priority. Recorded buffers retain indexed closure/winding. Tests verify analytic ray chords, component/face lineage bounds, matching input hashes and native summaries, exact priority volumes, and whole exposed patch geometry.

Partial water contact: the concrete near face at x=2 is exposed only for z>=0, with area 8 m². No unsplit lower contact triangle is presented as concrete-air. Overlap example: concrete keeps 64 m³ and water keeps 28 m³. Identical overlap: only higher-priority concrete owns the external boundary. Explicit terrain fixture cap IDs remain traceable through the native operations.

All four real scenarios completed with zero indexed border edges and consistent winding in the VTK candidate adapter:

| Scenario | Derived boundary triangles | Concrete / rock boundary triangles | Domain-cap lineage triangles | Remaining scope-unqualified triangles |
| --- | ---: | ---: | ---: | ---: |
| low | 122,702 | 2,453 / 117,295 | 59,873 | 62,829 |
| mid | 122,756 | 2,447 / 117,142 | 59,866 | 62,890 |
| high | 122,332 | 2,433 / 116,790 | 59,866 | 62,466 |
| extreme | 121,964 | 2,378 / 116,525 | 59,866 | 62,098 |

Counts describe **derived global boundary triangles**, including finite-domain caps, not accepted physical interfaces or source mesh triangle counts. Splitting can change the number of descendants: low has 59,873 domain descendants from 59,866 original known caps. Do not replace the original cap audit counts or imply the scientific mesh changed. Real input hashes include all dense component coordinates/indices/materials, precedence and original cap IDs. Tests regenerate hashes from verified release assets. Real native buffers are not stored in the repository; only summaries and small synthetic output buffers are recorded.

These fixtures validate finite-model splitting and lineage, not real physical-domain scope or geometric accuracy. See [artifact contract](GEOMETRY_REFERENCES.md#derived-interface-artifact-contract) and [workflow](PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison) for source binding and finite-model consumption.

### Reproduction

Use an isolated development directory; no system installation needed:

```sh
interface_reference_dir=$(mktemp -d /tmp/muon-manifold-reference.XXXXXX)
python3 -m pip install --only-binary=:all: --target "$interface_reference_dir/packages" manifold3d==3.5.4 numpy==1.26.4
PYTHONPATH="$interface_reference_dir/packages" node scripts/benchmark-interface-csg.mjs --real
node --test tests/interface-csg.test.mjs
```

Add `--output tests/fixtures/interface-csg.json` only when deliberately regenerating evidence. The driver can take `--python /path/to/python`. Generated evidence is a regression reference, not a signature or independent real-physics validation.

Implementation constraint: Python bindings copy native list attributes. Cache original/face/run lists once per mesh to avoid quadratic copying.

## Derived interface artifact contract

### Artifact v1.0.0

`dist/modules/derived-interface-artifact.js` is renderer/native-independent. Creation consumes a pinned native result and the current scientific runtime. Validation returns detached Float64 boundary buffers and explicit scope/lineage. Its only eligibility is `qualification-only-not-physical-envelope`; neither creation nor loading can promote faces to accepted physical envelopes.

The document contains:

- Full dataset identity, scenario ID/variables, backend, geometry version, source spec/GLB digests, coordinates, densities, classification and tolerances from the runtime snapshot.
- An explicit versioned domain policy, native source-case ID and native input digest; dense source component IDs/materials/triangle counts/mesh digests and ordered original domain-face IDs.
- Pinned generator identity/version, Manifold and NumPy versions.
- Double-precision derived positions, indexed triangles, winning face materials, ancestor component/triangle lineage, native tolerance and per-face `domain-cap` or `scope-unqualified`.
- A canonical finite-JSON content SHA-256 and mandatory limitations. The temporary output manifest separately records each file's byte SHA-256.

Native transport now returns the SHA-256 of the exact raw input request. The driver checks it and each returned case ID, then attaches a case-input digest. Artifact creation independently recomputes that digest from the current source buffers/material precedence/domain IDs and rejects wrong/stale native input receipts. This is consistency binding to the trusted preprocessing procedure, **not a cryptographic signature or independent proof of its mathematics**.

Loading requires an externally pinned content digest and the current runtime/domain policy/source-case identity. Unknown artifact/generator versions, altered content, source/scenario/policy mismatches, source buffer/domain mismatches, malformed indices, open/wrongly wound/degenerate boundaries, invalid lineage and asserted positive physical scope fail closed. Ancestor records accept component/face references only; invented entity ownership is rejected. Validation uses current source buffers but needs no native library. Physical-envelope rendering remains ineligible.

`triangle-bvh.js` now accepts Float64 as well as Float32 positions using the same geometry queries. Float32 scientific inputs remain unchanged. This avoids an extra rounding of derived vertices; it does not improve the original GLB precision or change any formula. Existing science regressions and explicit Float32/Float64 checks pass.

### Shared-ray gate

`scripts/check-interface-artifacts.mjs` generates artifacts in a fresh temporary directory by default, writes without overwriting existing outputs, reads the actual files back, validates pinned content/current source, and checks the loaded boundary using the **same** `createTriangleBVH` math as scientific tracing. It compares merged non-air intervals from `runtime.traceRayModel` with derived global boundary intervals, testing interval counts, both endpoint positions and total dense length. Equal path length alone is insufficient; a displaced-slab counterexample is caught by endpoint checks.

Each scenario uses all six native-release example candidate origins plus three dataset-bounds-derived external origins. At each origin it tests eight azimuths and three elevations with fixed non-axis-aligned slope offsets: 216 rays/scenario, 864 total. Negative-elevation rays are geometry diagnostics, not detector flux predictions. The requested length is derived from dataset bounds. Full individual inputs/results are written beside each temporary artifact.

Numerical acceptance threshold is 1e-4 m, taken from the source analytic point-classification tolerance; scientific intersection tolerance remains 1e-5 m. This is a declared regression scope, not surveyed accuracy. No tangent/boundary discrepancy is silently discarded. Scientific component buffer hashes must remain identical before/after each run. Analytic fixtures separately retain their 1e-6 m gate for internal/external observers and cavity/opening cases.

Packaging uses [file/content pins](../scripts/fixtures/interface-artifact-pins.json). Reproduce full artifacts with the generator; temporary outputs are not committed task records.

### Reproduction and limits

After installing the pinned temporary native environment described in [CSG reuse](GEOMETRY_REFERENCES.md#offline-interface-construction):

```sh
PYTHONPATH=<temporary-native-packages> node scripts/check-interface-artifacts.mjs
node --test tests/derived-interface-artifact.test.mjs
node --test tests/*.test.mjs
node --check dist/app.js
git diff --check
```

Optional `--python /path/to/python` and `--output-dir /path/to/fresh-directory`. Existing output files are not overwritten. This is a development generator/validator, not a dataset migration, release revision, artifact HTTP loader or preview integration. Native package versions are distinct from the original compiler's unrecorded Manifold version.

Remaining physical-domain work: qualify remaining real boundary portions using authoritative source/domain semantics, including water and structure clipping caps; source-known rock caps alone do not prove every other face physical. No component-name/bounding-box/midpoint shortcut is permitted. Canonical aggregate entity ownership also stays unresolved. Finite-model consumption and exports are described in PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison; they do not resolve physical-domain certification.
