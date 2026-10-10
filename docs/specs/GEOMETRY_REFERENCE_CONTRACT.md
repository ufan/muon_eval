# Geometry reference contract

Normative rules for structural reference lines and derived interface artifacts: exact reference meanings, material qualification, perspective/through-material projection, material–air boundary construction, the derived artifact format and its shared-ray gate. Finite-model references are deployment context, not certified surveyed interfaces.

Decision rationale, library comparison, evidence tables, real-release audits and reproduction commands are in [Geometry reference methods and evidence](GEOMETRY_REFERENCES.md). Section names match that document so anchors such as `#derived-interface-artifact-contract` exist in both.

## Reference semantics

### Exact reference meanings

Let the qualified material classifier define the winning material at a model-frame point. A concrete–air (or rock–air) interface is a surface patch whose opposite open sides are those two winning materials, after void subtraction, material priority and the selected environmental scenario. A component carrying a concrete/rock label does not establish that every one of its faces is such an interface.

The structural layer may contain only these explicitly identified reference types:

1. **Apparent contour:** shared edge of two qualified interface faces whose perspective facing signs differ. Preserve separate surfaces/cavity sheets; do not reduce them to the outer boundary of a binary ray-hit mask.
2. **Feature crease:** a qualified interface edge passing a recorded face-normal angle threshold. This is an engineering shape reference, not an “outer envelope” or promised signal. Keep it independently identifiable from apparent contours; expose the chosen threshold. The 30° used in this experiment is not an adopted production default.
3. **Verified physical patch boundary:** an interface/opening rim with established provenance. Do not automatically output all open mesh edges. An air/another-material patch transition may be a useful reference, but it must be labeled with its actual semantics rather than turning a contact face into air.

Exclude triangulation diagonals, same-material internal seams, virtual/proxy geometry and mere component boundaries. Exclude terrain/domain caps from physical references. Keep clipping/missing-domain warnings separately. At an actual triple-material junction, eligible air-interface portions can remain, but adjacency must describe the qualified patches, not an unqualified cap normal.

The selected method is a **triangulated-mesh reference**, not smooth-CAD exactness. Gradual faceting can supply apparent contours even when creases are disabled. Any later smooth-surface/curvature features, inferred internal entity boundaries or exact CAD hidden lines require separate scope/validation.

### Material qualification, domain policy and acceptance constraints

Candidate normals/adjacency must come from the same closed, consistently wound buffers as material tracing. Retain triangle/co-face/component identity through extraction. Do not use averaged visual normals, display geometry, source-name guesses or view flags.

Prefer explicit physical-interface/domain provenance where available. For material overlaps, scenario-dependent water contacts and partial face interfaces, qualify using the shared winning-material core with recorded offset/error bounds on **face-interior sides**, not arbitrary edge-axis probes. A single midpoint result cannot certify a whole edge or face. Subdivide/clip only with verified geometry operations and recorded convergence/error bounds. If a contact splits a face, the original component adjacency is insufficient: retain a verified split patch/rim or mark that portion unresolved. Do not invent an intersection seam by projecting every component edge.

Domain clipping and a genuine physical face both appear as material→air at the edge of a finite mesh. Classification alone cannot distinguish them. The current compiled decoder/manifest supplies component metadata, not a complete per-face physical/domain map. Physical certification requires verified domain mappings from release metadata/adapter evidence; where not possible, emit incomplete/unresolved rock references and a domain warning. Do not infer a physical boundary merely from the mesh bounding box. A planar finite terrain fixture may have **no accepted physical line** after all its perimeter caps are excluded; do not manufacture a skyline to make the control visibly active.

Source entity ownership remains independent: aggregate concrete/rock components do not become canonical entities because a reference edge is found. Per-material line attribution can be valid while per-entity attribution stays unavailable.

Physical-interface certification requires tests of thin/overlapping materials, water replacement, openings and dataset-specific complex geometry, with unresolved cases disclosed. Method selection alone is not physical qualification.

### Perspective/through-material policy

Keep eligible internal and far-side references even behind intervening material. Do not run optical hidden-line removal by default. Source depth and reference type should remain inspectable; geometric lines do not imply count contrast. Optical visibility, if later offered, is a separate labeled setting.

Select candidates in 3D, then clip segments in detector-local camera coordinates against positive forward depth and the actual graph's slope field **before division**. A line crossing the observer plane must be clipped, not discarded because one endpoint is behind, nor allowed to produce infinite slope. Clip each graph against its own coordinates/bin extent; do not align grids by index. Clip requested ray range consistently and disclose its effect; numerical endpoint tests are not proof of spherical ray-range clipping.

No clip-plane segment or plot-frame border becomes a new physical reference. Boundary-only/overlapping/absent/outside-field/unresolved states must be distinguishable. All-hit rays and zero apparent silhouettes are legitimate outcomes, especially for internal observers. Crease references and numerical contribution contours provide different useful information in those cases.

## Candidate qualification and projection

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

## Offline interface construction

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

Packaging uses [file/content pins](../../scripts/fixtures/interface-artifact-pins.json). Reproduce full artifacts with the generator; temporary outputs are not committed task records.
