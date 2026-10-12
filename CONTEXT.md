# CONTEXT.md

Domain context for the project: product purpose, geometry semantics, physical quantities and terminology (the glossary). The domain model itself (contexts, relationships, identities, invariants, lifecycles) is kept in `docs/specs/DOMAIN_MODEL.md` and updated with development. It is written for human developers and any AI tool, independent of vendor or product. It may be completed gradually; unknown or undecided content is marked `TBD` rather than guessed.

A subject's dimensions and coordinates are never platform rules here. Dataset-specific content belongs in "Current datasets" below or in the dataset's own `datasets/<dataset-id>/README.md`.

## 1. Product context

### Goal

Help users explore, filter and compare muography detector deployment plans for an imaging subject, using a common data model and fast approximate calculation. Subjects are described by datasets of a declared **kind**: dams first; blast furnaces, tunnels and other subjects later. Support for each kind is added gradually.

### Main users (to be completed)

- Muon detection and data-analysis staff;
- Engineering, survey and structural specialists for the subject (dam, plant, tunnel, …);
- Staff responsible for field deployment, operation and plan review;
- Potential customers, through demonstrations of a deployment.

### General use cases

1. Load a dataset and check its coordinates, geometry semantics and material definitions.
2. Configure the detector and its response parameters.
3. Create or select candidate stations, adjust position and pose and inspect the expected projection.
4. Scan feasible regions or the pose space, filtering candidates by constraints and relative metrics.
5. Show several selected stations at once to see the whole deployment, compare coverage and demonstrate the plan.
6. Simulate multi-projection reconstruction to judge what 3D picture a deployment could recover.
7. Save reproducible deployment plans and export data, animations or evaluation reports.
8. Eventually, load new subject geometry rather than only choosing bundled datasets.

### Non-goals and boundaries

- Does not replace full particle-transport simulation such as Geant4.
- Does not replace engineering CAD/BIM, survey databases or construction design.
- Does not on its own give structural-safety, construction-safety or regulatory conclusions.
- Applicable accuracy, error range and validation status of the current fast model: `TBD` (FR-V2).

## 2. Core objects

| Object | General meaning | Key contents |
| --- | --- | --- |
| Dataset | A versioned collection describing one imaging subject: coordinates, geometry, materials and metadata | ID, `kind`, version, units, coordinate transforms, sources, unknowns |
| Kind | The type of subject a dataset describes (`dam`, `blast-furnace`, `tunnel`, …) | Kind-specific variables, layers and targets are declared by the dataset, not by generic code |
| Scenario | A frozen environment variant of a dataset (e.g. water levels low/mid/high/extreme) | Variable values; the compiled geometry for that variant |
| Scene | A dataset release combined with one environment state (a scenario or environment variable values). It fixes the physical geometry and materials used in calculation | Release, scenario or variable values. Which material regions exist follows from the environment state (e.g. water level, gate states), never from display choices |
| View state | How a scene and its results are displayed | Layer visibility, colours, transparency, camera, overlays, selection. Not part of the scene or of any calculation input |
| Detector configuration | Device geometry and response parameters, independent of the subject | Sensitive area, strip pitch, readout count, layer spacing, efficiency, angular model, dead time |
| Station | A detector reference point with engineering meaning | Coordinates, name, accessibility/installation constraints, area |
| Pose | The detector's orientation at a station | Azimuth, elevation, local basis |
| Assessment | One station evaluated in a scene: the scene combined with a detector configuration, a station and a pose | Calculation settings; produces a projection result |
| Deployment plan | A scene combined with one or more stations, each with a pose and a detector configuration; distinguishes candidate stations from the selected deployment | Scene (release + environment), stations, poses, devices, calculation settings |
| Scan | Batch calculation and comparison over a constrained parameter space | Ranges, steps, constraints, metrics, ranking, robustness |

Note: "scenario" means a frozen environment variant, never the subject itself; the subject is a dataset of some kind.

Composition: **scene** = dataset release + environment state; **assessment** = scene + detector configuration + station + pose; **deployment plan** = scene + stations (each with pose and detector configuration). Display options belong to the **view state**, which is never part of any of these.

How these objects relate, their identities, invariants and lifecycles are modelled in [`docs/specs/DOMAIN_MODEL.md`](docs/specs/DOMAIN_MODEL.md); this file keeps the glossary. Object identifiers, required fields and file schemas: `TBD` (FR-P1).

## 3. Geometry semantics

### Basic types

- **Solid**: a positive volume that occupies space and has a material.
- **Void**: space subtracted from solids; it has no material by default and is not shown as a filled body.
- **Material region**: a region of uniform density or composition that contributes to ray column density.
- **Internal feature**: a cavity or component with engineering meaning (e.g. galleries, observation rooms, elevator shafts in a dam; tapholes or cooling channels in a furnace).
- **Environment volume**: media that change between scenes or lie outside the subject: reservoir and tail water, furnace burden, overburden, air, surrounding rock.
- **Visual proxy**: auxiliary geometry drawn for recognition or interaction; it never takes part in material calculation implicitly.
- **Target / ROI**: a structure or region the user wants to identify, cover or compare in projections or scans.
- **Boundary / contour**: the boundary of a material or semantic region in 3D space, ray space or the projection plane.

### Geometric truth

Display options belong to the view state, not the scene: hiding a material region, internal feature or environment volume changes only what is drawn and never removes it from classification, ray paths, column density or any other calculation.

Material geometry is defined by positive volumes, negative volumes, material priority and boundary rules together. The render mesh is not the only truth: display, point classification, ray intersection and projection contours must all trace back to the same data definition.

Boundary inclusion, overlapping-material priority, tolerances and degenerate geometry handling: `TBD` (FR-D5).

## 4. Coordinate and direction semantics

Every dataset declares:

- the source frame's name, units, origin, handedness and axes;
- the normalized model frame and the forward and inverse transforms between them;
- the elevation datum, zero point and display convention;
- the relation of true north, the subject's main axis (e.g. a dam axis) and azimuth;
- the adaptation to Three.js/render coordinates;
- known control points and transform error.

A right-handed model frame is recommended, but no data source may be assumed to use the same axes as the current example.

Keep these strictly apart:

- **Point**: affected by rotation and translation;
- **Direction**: affected by rotation only;
- **Orientation**: defines a local basis or equivalent rotation;
- **Azimuth**: zero direction, positive sense and range defined by the coordinate convention;
- **Elevation angle**: angle above the horizontal plane; sign and valid range stated explicitly;
- **Elevation datum value**: a spatial coordinate, never to be confused with the pose's elevation angle.

## 5. Ray and projection terms

| Term | Draft definition |
| --- | --- |
| Ray | A directed line from the detector reference point along a local direction |
| Material path length | Total geometric length of a ray inside one material region |
| Column density / water equivalent (m.w.e.) | Areal density integrated along the ray, expressed as equivalent water thickness |
| Open-sky flux | Reference muon flux with no target material |
| Transmission | Expected flux after the material divided by the reference flux |
| Expected count | Expected number of events for a given device response and exposure time |
| Local slopes `sx`, `sy` | 2D parameterization of a ray direction in the detector-local frame; exact definition `TBD` (FR-X1) |
| Projection bin | One discrete direction cell in local direction space |
| Structural significance | How distinguishable a target is from a reference hypothesis; statistical definition `TBD` |
| ROI | A selected region in the projection, in space or in the scan parameter domain |

Flux model, attenuation model, count units, exposure time and statistical assumptions are versioned explicitly in calculation modules and output metadata.

The current calculation chain, formulas, parameters and UI outputs are specified in `docs/specs/CALCULATION_MODEL.md`; their interpretation is in `docs/guides/RESULT_INTERPRETATION.md`.

## 6. Evaluation semantics

Keep these dimensions separate rather than collapsing them into one absolute score:

- **Single-station physical metrics**: raw quantities such as paths, column density, transmission, counts and direction coverage.
- **Relative scan metrics**: quantiles, ranks, Pareto position or relative improvement within the same constraints and dataset.
- **Robustness**: stability of results when position, pose, device parameters or geometry uncertainty change.
- **Multi-station complementarity**: coverage overlap, crossing views of targets and added information.
- **Reconstruction quality** (simulated): density error, contrast recovery and resolution achievable from all projections together.
- **Engineering feasibility**: space, transport, power, communications, maintenance and site-work conditions.
- **Safety and compliance**: independent engineering inputs, never derived automatically from projection metrics.

Scan constraints, default comparison set and recommended ranking method: `TBD` (FR-S2).

## 7. Minimum reproducibility record

A reproducible calculation or export records at least:

- application version and calculation-model version;
- dataset ID, kind, release and geometry/material versions;
- coordinate convention and any transform version;
- detector configuration;
- environment state or scenario;
- all stations and poses;
- sampling grid, exposure time, thresholds and other calculation settings;
- output quantities, units and generation time;
- known approximations, warnings and unresolved items.

## 8. Current datasets

The bundled Zhouning lower-reservoir dam dataset is the first validation case, not the platform's default semantics.

- Dataset registry: `datasets/registry.json`. The default release is `zhouning-lower-reservoir-dam@0.6.2+schema0.7.0` on the compiled GLB/BVH backend, with frozen scenarios low/mid/high/extreme.
- The legacy release `zhouning-lower-reservoir-dam@0.6.2` (directory `datasets/zhouning-lower-reservoir-dam/0.6.2/`) remains selectable as a compatibility path with the legacy DDA backend and continuous water level.
- Continuous water level on compiled geometry and aggregate source-entity attribution are unresolved.
- Coordinates and geometry rules: `datasets/zhouning-lower-reservoir-dam/README.md`.
- Dataset ID, data version, schema version and release ID are recorded separately; one data version may have release packages in different formats, so caches and plan references always use the full release ID.

Every future dataset, of any kind, gets metadata and a description at the same level and is loaded through the common interface.

## 9. Open definitions

Domain definitions still to be written are tracked as requirements in [`docs/FEATURE_REQUIREMENTS.md`](docs/FEATURE_REQUIREMENTS.md) (FR-D, FR-K, FR-X1, FR-V3, FR-S2/S3, FR-M1/M2, FR-P1, FR-D9). This file keeps only settled semantics; `TBD` items are filled in here once their requirements are done.
