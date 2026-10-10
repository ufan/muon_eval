# Geometry reference methods and artifacts

Decision, evidence, library choices and reproduction for through-material mesh lines, qualification, offline interface construction and source-bound artifacts. The normative rules (reference meanings, qualification, projection, boundary construction, artifact contract and shared-ray gate) are in the [geometry reference contract](GEOMETRY_REFERENCE_CONTRACT.md). Finite-model references are useful deployment context, not certified surveyed interfaces. Native preprocessing libraries are development-only; runtime computation does not depend on DOM or renderer objects.

Related: [Projection data and numerical interpretation](PROJECTION_DATA.md) · [Projection interpretation workflow](../guides/PROJECTION_WORKFLOW.md) · [Projection and reference validation](PROJECTION_VALIDATION.md) · [Unfinished work](../ROADMAP.md).

- [Reference semantics and library choice](#reference-semantics-and-library-choice)
- [Candidate qualification and projection](#candidate-qualification-and-projection)
- [Offline interface construction](#offline-interface-construction)
- [Derived interface artifact contract](#derived-interface-artifact-contract)

## Reference semantics and library choice

### Decision

Select **material-qualified perspective apparent contours plus separately labeled feature creases and verified patch-boundary references**, projected through material into detector-local slope space. Use the established mesh-edge/co-face-normal method; do not create a new silhouette algorithm or substitute depth jumps for geometry.

Reuse path for interface extraction: adapt the small edge-connectivity/normal/selection portion of pinned `vtkPolyDataSilhouette` 9.5.2 into a renderer-independent typed-buffer module, retaining upstream BSD-3-Clause notices and explicit adaptation/version history. Native VTK remains the numerical reference. This is a reviewed source-reuse choice, not a proposed browser VTK dependency. The candidate port now matches all recorded native fixtures; **real physical-interface extraction is not yet accepted**. Reuse only the extraction logic, not camera objects, VTK pipeline scheduling/caches or rendering APIs. Cache by explicit geometry/scenario/station/settings identity.

The upstream method maintains adjacent face normals at an edge. Perspective selection tests their facing signs against the vector from edge midpoint to observer; opposite signs select an apparent contour. Its optional normal-angle test selects feature creases. [Pinned VTK source](https://github.com/Kitware/VTK/blob/v9.5.2/Filters/Hybrid/vtkPolyDataSilhouette.cxx), [API](https://vtk.org/doc/nightly/html/classvtkPolyDataSilhouette.html). The geometric distinction between contour extraction and visibility also has an established treatment in [Bénard and Hertzmann, Line Drawings from 3D Models](https://arxiv.org/abs/1810.01175).

This method identifies **candidate curves**, not winning-material interfaces by itself. Dataset semantics and shared material classification must qualify the interface portions as described below. Unresolved portions remain unresolved; no claim of a complete true air boundary is permitted from component mesh edges alone.

### Small reference comparison and evidence

Reproducible comparison: `scripts/benchmark-structural-reference.mjs` calls `scripts/vtk-structural-reference.py` on the analytic fixture buffers plus a 16-sided prism. No GUI, GPU, external service or rendering visibility participates. It invokes native VTK's feature filter and perspective-origin silhouette filter with border edges and silhouette feature-angle additions disabled. It compares whole 3D edge sets, ignoring segment orientation, to already vendored Three.js r186 `EdgesGeometry` at 30°.

Recorded native run: [structural-reference evidence](../../tests/fixtures/structural-reference.json). Nine components across seven shapes, three views each; all nine feature-edge sets match. Each component's exact buffer-derived SHA-256 is recorded and checked by the default Node test suite. Native silhouette segments are retained for subsequent port regression.

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

### Candidates accepted/rejected for this role

- **VTK 9.5.2:** native reference and selected upstream algorithm for buffered source reuse. BSD-3-Clause; installed in a temporary development directory only, not shipped. The pinned wheel is about 112 MB, so adding it to the static browser application is not justified. [VTK license](https://github.com/Kitware/VTK/blob/v9.5.2/Copyright.txt).
- **Three.js r186 EdgesGeometry:** MIT, already present offline. Feature-edge comparison reference, not the final scientific core interface. It lacks viewpoint selection and uses fixed coordinate hashing, so it is not a complete envelope backend. [Official API](https://threejs.org/docs/pages/EdgesGeometry.html); local source in `dist/vendor/three/three.core.js`.
- **three-edge-projection:** not adopted here. Its documented projection/culling is orthographic/top-down; detector slope perspective and penetrative defaults are different. Reusable clipping/intersection facilities can be revisited if demonstrably needed, without treating the package as a drop-in solution. [Upstream API](https://github.com/gkjohnson/three-edge-projection/blob/main/API.md).
- **OCCT hidden-line removal:** not executed or adopted in this small comparison. Native CAD/optical visibility machinery is not needed for the selected through-material policy. It remains an optional independent future CAD reference, not current validation evidence.
- **D3 contours and existing depth-jump edges:** numerical/diagnostic layers only, not structural extraction.

Native VTK is not a browser dependency. Three objects appear only in the development comparison adapter, constructed from computation-owned buffers; neither scientific calculations nor the selected production module may consume scene geometry.

### Reproduction

Reproduce in a scoped temporary package directory without changing system or application dependencies:

```sh
structural_reference_dir=$(mktemp -d /tmp/muon-structural-reference.XXXXXX)
python3 -m pip install --only-binary=:all: --target "$structural_reference_dir/packages" vtk==9.5.2
PYTHONPATH="$structural_reference_dir/packages" node scripts/benchmark-structural-reference.mjs
```

The script requires VTK 9.5.2 and accepts `--python /path/to/python` for an existing environment. Default Node tests require no Python or VTK installation; they validate live Three geometry/point projection and recorded native evidence tied to fixture hashes. Native regeneration is a separate optional development check, not an assertion that VTK is running during every test invocation.

## Candidate qualification and projection

The core separates candidate extraction, supplied whole-face qualification, and whole-segment projection. Under the user's approved specification v1.1, a separate **finite-model** consumer is connected to the preview UI; it excludes known cap-incident edges and retains unresolved physical-scope warnings. This does not accept certified physical envelopes. No physics formulas, release meshes, original exports or default application backend changed. See [finite-model workflow](../guides/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison) for interfaces, controls and exports.

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

These fixtures validate finite-model splitting and lineage, not real physical-domain scope or geometric accuracy. See [artifact contract](GEOMETRY_REFERENCE_CONTRACT.md#derived-interface-artifact-contract) and [workflow](../guides/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison) for source binding and finite-model consumption.

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

Remaining physical-domain work: qualify remaining real boundary portions using authoritative source/domain semantics, including water and structure clipping caps; source-known rock caps alone do not prove every other face physical. No component-name/bounding-box/midpoint shortcut is permitted. Canonical aggregate entity ownership also stays unresolved. Finite-model consumption and exports are described in ../guides/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison; they do not resolve physical-domain certification.
