# Zhouning lower-reservoir dam: coordinates and geometry rules

Dataset `zhouning-lower-reservoir-dam`, kind `dam`. Release: `0.6.2+schema0.7.0` (native v0.7 format with compiled GLB/BVH scenarios). The earlier legacy parametric releases `0.6.1` and `0.6.2` were retired with the legacy backend (ADR-028); they remain in git history. Import notes for the v0.7 release are in [0.6.2+schema0.7.0/IMPORT.md](0.6.2+schema0.7.0/IMPORT.md). A display profile (`display_profile.json`, seven recognition items: galleries, elevator shaft and dam concrete on by default; observation rooms, flood-release openings, water and steel gates off (owner, 2026-10-13)) was added by the platform on 2026-10-13; it is not part of the authored package and changes no geometry or result.

## 1. Three coordinate frames

### Document frame `doc_frame`

- `x_doc`: along the dam axis; 0 at the southeast end / section ⑩, increasing towards the northwest / section ①, about 0–231 m.
- `y_doc`: horizontal axis perpendicular to the dam axis; about 0 at the upstream face of ordinary sections, positive downstream.
- `z_doc`: engineering elevation.
- By the spec's definition this frame is left-handed and is used only for entering and interpreting engineering documents.

### Model frame `model_frame`

- `X = y_doc`: pointing downstream, bearing about 47°.
- `Y = x_doc`: pointing northwest / left bank, bearing about 317°.
- `Z = z_doc - 198`: up; elevation datum ▽198 m.
- This right-handed frame is used by the program, exported plans and a future Geant4 interface.

Inverse transform:

```text
x_doc = Y
y_doc = X
z_doc = Z + 198
```

### Compiled path in the main application

Candidate reference points of v0.7 still come from the explicit `doc_frame` sidecar and enter `model_frame` through the Geometry IR's point transform; the old application's 0.4 m example station offset is not added. The default pose is a platform initial value and does not pose as the sidecar's deployment recommendation.

GLB/BVH positions, indices and rays are all in `model_frame`; the compiled view applies only the Z-up → Y-up rotation `scene = (X, Z, -Y)`, with no model-coordinate translation or scaling. Directions are only rotated and never take the elevation offset. The scene uses the same model buffers as the BVH; hiding or transparency never changes material classification, paths or integrals.

The compiled path loads only published frozen scenarios; the continuous water-level slider, target layers/significance and internal-feature layer of the retired legacy backend are shown disabled as migration targets (MT-1, MT-2, MT-5). The main-app UI uses the declared `model_frame` labels and never treats fixed screen left/right as a fact about the banks.

## 2. Geometry semantics

`dam_spec_v070.json` declares entities, materials, water bodies, markers, nodes, sources and scenario variables (schema `schema/dam-dataset.schema.json`, profile `schema/zhouning.profile.schema.json`; import notes in [IMPORT.md](0.6.2+schema0.7.0/IMPORT.md)). Material is positive volumes minus negative volumes resolved by material priority; the offline compiler turns each frozen scenario into closed meshes (`compiled/scene_*.glb`) that the BVH, classification and display share.

- Negative volumes (galleries, shafts, openings, spillway orifices, chutes) are hollowed out of material and never shown as filled solids.
- Below the foundation and terrain surface is rock; upstream and tail water follow the scenario's water levels.
- Terrain heightfields (`compiled/terrain_*.f32`) are model-frame grids with bilinear sampling.

## 3. Display rules

- The dam is displayed from the compiled scenario meshes; hiding or transparency never changes calculation.
- Galleries, observation rooms and elevator shafts are internal features; a coloured internal-feature layer in the main app is migration target MT-5.
- Edge lines are auxiliary and must not create structural boundaries that do not exist.

## 4. Calculation rules

The compiled backend's rules are in the [calculation model spec](../../docs/specs/CALCULATION_MODEL.md) (§14). The legacy DDA rules (5 m cells with adaptive subdivision, 500 m radial cutoff) were retired with releases 0.6.1/0.6.2.

## 5. Checklist when changing geometry

1. Change the spec (`dam_spec_v070.json`) and recompile the release first; never hard-code dimensions in rendering code.
2. Check the schema, spec assertions and `unknowns`.
3. Check that surfaces of ordinary and special sections are continuous.
4. Check that negative volumes are really subtracted from material classification.
5. Check that the displayed meshes and point classification agree (`scripts/check-geometry-conformance.mjs`).
6. Spot-check the central ray's concrete length and intersected targets.
7. Check that projection outlines agree with the 3D structure orientation.
8. Keep `grade`, `status`, `source` and optional `range` for uncertain dimensions; never fake precision.

## 6. Known geometry risks

Known geometry risks are tracked as requirements FR-GE in [`docs/FEATURE_REQUIREMENTS.md`](../../docs/FEATURE_REQUIREMENTS.md).
