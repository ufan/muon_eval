# Zhouning lower-reservoir dam: coordinates and geometry rules

Dataset `zhouning-lower-reservoir-dam`, kind `dam`. Releases: `0.6.1`, `0.6.2` (legacy parametric format, legacy DDA backend) and `0.6.2+schema0.7.0` (native v0.7 format with compiled GLB/BVH scenarios; the application default). Import notes for the v0.7 release are in [0.6.2+schema0.7.0/IMPORT.md](0.6.2+schema0.7.0/IMPORT.md).

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

### Legacy Three.js scene frame

Three.js uses Y as vertical. The current conversion `P([x_doc,y_doc,z_doc])` is:

```text
scene.x = 115.5 - x_doc
scene.y = z_doc - 198
scene.z = -y_doc
```

Direction vectors must use the matching direction conversion; a point transform must never be applied to a vector.

### Compiled path in the main application

Candidate reference points of v0.7 still come from the explicit `doc_frame` sidecar and enter `model_frame` through the Geometry IR's point transform; the old application's 0.4 m example station offset is not added. The default pose is a platform initial value and does not pose as the sidecar's deployment recommendation.

GLB/BVH positions, indices and rays are all in `model_frame`; the compiled view applies only the Z-up → Y-up rotation `scene = (X, Z, -Y)`, with no model-coordinate translation or scaling. Directions are only rotated and never take the elevation offset. The scene uses the same model buffers as the BVH; hiding or transparency never changes material classification, paths or integrals.

The legacy procedural clipping, mesh display and target counterfactual heuristics are not used on this path. The compiled path loads only published frozen scenarios and never modifies meshes from the continuous water-level slider; source-entity targets/significance are not provided. The main-app UI uses the declared `model_frame` labels and never treats fixed screen left/right as a fact about the banks.

## 2. Geometry semantics

In `dam_spec.json` (legacy format):

- `solids` are positive volumes: dam body, piers, platforms and other concrete solids;
- `voids` are negative volumes hollowed out of solids: galleries, shafts, openings, spillway orifices and chutes;
- the actual material test is `solidContains && !voidContains`;
- below the foundation surface is usually rock; upstream/downstream water is determined by water level and spatial extent.

Main supported types:

- `extrusion_x`: a 2D `profile_yz` extruded over an X range along the dam axis;
- `box`: a set of axis-aligned boxes;
- `sweep_xz`: a gallery swept along an X–Z path;
- `chute`: a chute negative volume defined by a Y–Z floor polyline.

## 3. Display rules

- The dam is displayed as positive-volume surfaces.
- Galleries, observation rooms and elevator shafts can be shown as coloured internal auxiliary structures.
- Spillway orifices, bottom outlets and chute negative volumes must never be displayed as filled solids.
- Hydraulic cavities are clipped by the dam shader; chute floors and side walls get separately generated visible inner surfaces.
- `addVoids()` may show only internal targets of type `/gallery|obs|elevator/`.
- Edge lines are auxiliary and must not create structural boundaries that do not exist.

## 4. Calculation rules (legacy backend)

- Rays are first intersected with the engineering bounding box, then advance with main-grid DDA.
- The main cell size is 5 m; near material changes it subdivides adaptively to about 0.5 m.
- Ray paths accumulate `concrete`, `water`, `rock` and `air` separately.
- Water equivalent is computed from path lengths and the material densities in `dam_spec.json`.
- Target structure lengths and masks are used for projection outlines and counterfactual significance estimates.

The compiled backend's rules are in the [calculation model spec](../../docs/specs/CALCULATION_MODEL.md).

## 5. Checklist when changing geometry

1. Change the spec (`dam_spec.json` / `dam_spec_v070.json`) first; never hard-code dimensions in rendering code first.
2. Check the schema, spec assertions and `unknowns`.
3. Check that surfaces of ordinary and special sections are continuous.
4. Check that negative volumes are really subtracted from material classification.
5. Check that visual clipping agrees with the `voidContains()` boundary.
6. Spot-check the central ray's concrete length and intersected targets.
7. Check that projection outlines agree with the 3D structure orientation.
8. Keep `grade`, `status`, `source` and optional `range` for uncertain dimensions; never fake precision.

## 6. Known geometry risks

Known geometry risks are tracked as requirements FR-GE in [`docs/FEATURE_REQUIREMENTS.md`](../../docs/FEATURE_REQUIREMENTS.md).
