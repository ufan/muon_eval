# Web import subset of the v0.7.0 release package

Source: `archive/zhouning-dam-spec_v0.6.2+schema0.7.0_20261005_full.zip`.
Release ID: `zhouning-lower-reservoir-dam@0.6.2+schema0.7.0`.

This directory holds the release package's authoritative JSON, frozen schemas, external business data, release reports, the four GLB scenarios, two runtime terrains and the conformance baselines, all imported byte for byte. GDML, raw NPZ, drawings, authoring tools and the Python compiler were not imported because they are not browser runtime dependencies. Recompilation uses the original package's tools and dependencies; this directory is not an authoring source.

`CHECKSUMS.sha256` is the upstream full release manifest and includes files not imported here; do not run a full `sha256sum -c` in this directory. The platform registry's `integrity` pins the SHA-256 of the imported assets. The import check verifies the registry, manifest and schemas together; with `--archive` it also verifies the full upstream manifest and byte-for-byte import consistency.

```bash
python3 scripts/check-dataset-release.py --archive archive/zhouning-dam-spec_v0.6.2+schema0.7.0_20261005_full.zip
node --test tests/data/dataset-v07.test.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0
node --test tests/data/compiled-mesh.test.mjs
node scripts/check-geometry-conformance.mjs --dataset zhouning-lower-reservoir-dam@0.6.2+schema0.7.0 --backend compiled
```

Run these commands from the repository root. Python schema validation is for development only and needs `jsonschema>=4.10`; running the static site needs neither Python nor npm packages.

The registry status is `qualification`. This release is the application's default (compiled backend, OQ-3, 2026-10-10); the legacy-format release v0.6.2 remains selectable. `loadDataset(releaseId)` returns the original spec, IR, terrain and GLBs that are loaded and verified on demand; v0.7 is never converted back to the old format.

The shared compiled mesh backend provides `loadCompiledMeshRuntime(dataset, scenarioId)`, used by the main application and the standalone `/geometry-preview.html`. It builds closure/winding checks and a BVH for each GLB; point queries, material lengths and display share the same model-coordinate buffers. Material-point and ray thresholds are reproduced by the commands above; material classification still differs at the edges of the finite domain, which is not a certification of the real physical domain. The compiled backend's gate does not relax the release package's material tolerances.

The IR's query interface uses model coordinates; analytic primitives keep an explicit `geometryFrame=doc_frame` and are evaluated through the declared affine transform. The IR keeps entities/cavities/water bodies, materials, scenario variables, tolerances, access, sources and unknowns. It is not a completed CSG/mesh IR.

The analytic qualification backend uses the compiled float32 terrain sampling, so terrain boundary errors remain. Qualification and the release package's compiled-backend thresholds are reported separately: point agreement at least 99.9% (only points ≥ 5 m from the terrain surface); concrete/water/steel use the package's ray P95 thresholds, rock temporarily 1.5 m; the report also states whether all of the original package's ray thresholds are met. Passing qualification must never be cited as agreement with the compiled meshes.

The full semantic mapping from material unions to source entities, unified scene resolution for continuous water level and real physical-domain qualification are still unresolved. On this release the main app disables the unsupported continuous water level, legacy target significance and internal proxies; virtual geometry and markers never enter material integration.
