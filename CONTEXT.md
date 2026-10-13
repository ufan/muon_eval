# CONTEXT.md

Domain context for the project: product purpose, geometry semantics, physical quantities and terminology (the glossary). The domain model itself (contexts, relationships, identities, invariants, lifecycles) is kept in `docs/specs/DOMAIN_MODEL.md` and updated with development. It is written for human developers and any AI tool, independent of vendor or product. It may be completed gradually; unknown or undecided content is marked `TBD` rather than guessed.

A subject's dimensions and coordinates are never platform rules here. Dataset-specific content belongs in "Current datasets" below or in the dataset's own `datasets/<dataset-id>/README.md`.

## 1. Product context

### Goal

Help users explore, filter and compare muography detector deployment plans for an imaging subject, using a common data model and fast approximate calculation. Subjects are described by datasets of a declared **kind**: dams first; blast furnaces, tunnels and other subjects later. Support for each kind is added gradually. The current implementation knows one roller-compacted-concrete dam; other subjects (and other dam types) may need different display and interaction, geometry semantics and regions of interest, recorded in the kind variation register of `docs/specs/DOMAIN_MODEL.md`.

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
| Anomaly (hypothesis) | A structural problem of the subject that the deployment is meant to investigate (voids, loosened or densified zones, seepage, furnace cohesive zone, hearth wall thinning, …), modelled as a parameterised change of the subject's physical state (proposed, ADR-025) | Region, density model (void, loosening, densification, saturation, replacement), host materials, size/position/density/development parameters |
| Geometric / physical acceptance | Geometric: which directions the detector can register at all (device geometry only). Physical: expected muon counts per direction, including flux, transmission and response | Used for the coverage highlight (FR-M10) |
| Sensitivity | How well a plan would detect an anomaly: change in counts and its significance against statistical and systematic uncertainty | ΔN, significance, exposure to reach a threshold, minimum detectable size/contrast |
| Scan | Batch calculation and comparison over a constrained parameter space | Ranges, steps, constraints, metrics, ranking, robustness |

Note: "scenario" means a frozen environment variant, never the subject itself; the subject is a dataset of some kind.

Composition: **scene** = dataset release + environment state (+ active anomaly hypotheses, proposed ADR-025); **assessment** = scene + detector configuration + station + pose; **deployment plan** = scene + stations (each with pose and detector configuration). Display options belong to the **view state**, which is never part of any of these.

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
- **Subject feature**: a named part of the subject declared by the dataset; see §3.1.
- **Boundary / contour**: the boundary of a material or semantic region in 3D space, ray space or the projection plane.

### 3.1 Subject features and how they are referenced

How the app names and finds parts of the subject (design in ADR-029). Example values are from the Zhouning dam.

| Term | Meaning | Example |
| --- | --- | --- |
| Entity | One part of the subject as written in the dataset spec, with a stable ID. Solid, void or virtual | `gallery_upper`, `dam_standard`, `spillway_piers_and_chute_walls_C` |
| Water body | A body of water declared by the dataset; treated like an entity for naming | `reservoir`, `tailwater` |
| Semantic class | What kind of thing an entity is, from the dataset's vocabulary; carries a display colour | `gallery` (`#185FA5`), `elevator_shaft`, `pier` |
| System | The dataset's grouping of classes by engineering function | gallery, monitoring, vertical transport, flood release, dam, water |
| Imaging role | What an entity means for imaging, declared by the dataset: `target`, `reference_void` (a known void, useful to check a plan), `time_varying_mass`, `background`, `detector_site` | Galleries and rooms are `reference_void`; water is `time_varying_mass` |
| Component | One closed mesh in a compiled scenario, with one material; what the ray tracer and the 3D view actually use | `gallery_upper` (air), `concrete` (all concrete solids merged), `rock` |
| Direct / aggregate | A *direct* entity has its own component, so it can be drawn and measured on its own; an *aggregate* entity is merged into a shared component (e.g. every concrete solid is inside `concrete`) and cannot be singled out until FR-GE4 | 22 direct (voids, water); 23 aggregate (dam body, piers, gates, …) |
| Subject feature | A named part of the subject that the app can show, select or measure: one entry per entity or water body, with label, class, group, colour, imaging role and direct/aggregate | "Upper gallery" |
| Feature catalogue | The list of all subject features of one release, built once by the dataset adapter from the dataset's own declarations. Every consumer (3D layer, projection outlines, picking, coverage, metrics) reads it; none keeps its own list | 45 features for the Zhouning release |
| Feature group | The catalogue's grouping for display, equal to the dataset's system | "Gallery" group = both galleries, the link gallery, two adits |
| Internal feature | A subject feature inside the subject with engineering meaning (galleries, rooms, shafts, tapholes) | "Lower observation room" |
| Display profile | An optional sidecar file of a release with presentation choices, separate from the geometry spec and never part of result identity (proposed, ADR-029) | `display_profile.json` |
| Recognition item | One entry of the short list offered for outlining on projections: one subject feature or several merged into one outline, declared in the display profile | "Galleries" = upper, lower and link gallery |

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

### 5.1 Display terms: what is drawn where

The app has two pictures: the **3D view** of the subject and the **projection** (the detector's image). These terms say which picture something belongs to.

| Term | Picture | Meaning |
| --- | --- | --- |
| Projection | 2D | The image a detector at one station and pose would record: one value per direction, laid out by local slopes `sx` (right) and `sy` (up). Not a map or plan of the subject. Shown as expected counts or transmission |
| Pixel | 2D | One cell of the displayed projection (25 × 25 preview, 65 × 65 final); each pixel combines several native projection bins |
| Layer (3D) | 3D | A group of things in the 3D view that one checkbox shows or hides: terrain, dam concrete, water, detector cone, a feature group. Hiding a layer never changes a result |
| Overlay / numeric layer | 2D | Lines or shapes drawn on top of a projection from the same result: material contribution contours, response contours, feature outlines, later anomaly footprints |
| Feature mask | 2D | For one recognition item (or subject feature) and one result: the set of projection pixels whose central ray passes through it by more than the threshold length T (default 0.1 m, display setting) |
| Outline | 2D | The boundary of a feature mask drawn on the projection in the feature's colour, so users see *where in the image* a gallery appears |
| Contour | 2D | A line of equal value of a numerical field on the projection, like a height contour on a map (e.g. 10 m of concrete, transmission 0.1, 10 % counting error). Levels are *physical* (explicit, comparable between stations) or *adaptive* (chosen per image, not comparable). An outline is the contour of a recognition item's length field at level T |
| Material envelope | 2D | The sampled edge where a material starts or ends along neighbouring rays (e.g. concrete vs air); a display diagnostic, not a CAD edge |
| Picking / hover | both | Pointing at something to identify it: a feature in 3D, or a pixel in the projection, which also draws that pixel's ray in 3D |
| Coverage highlight | 3D | Tinting the parts of the subject inside a detector's field of view (FR-M10) |

### 5.2 Words with several meanings

| Word | Meanings in this project | Prefer |
| --- | --- | --- |
| Target | (1) what a user wants to find or check (glossary "Target / ROI"); (2) a subject feature selected for outlining on the projection; (3) the dataset imaging role `target`; (4) "semantic targets": direct features verified in the preview; (5) legacy hard-coded target structures (retired) | (1) *target / ROI*; (2) *projection target* or *outlined feature*; (3) *imaging role `target`*; (4) *direct feature* |
| Feature | (1) subject feature (§3.1); (2) a capability of the app | Say *subject feature* for (1), *capability* for (2) |
| Layer | (1) 3D layer (checkbox); (2) numeric layer / overlay on the projection; (3) detector layer (a physical plane of the device) | *3D layer*, *overlay*, *detector layer* |
| Projection | (1) the detector image (§5.1); (2) a map projection or coordinate projection | (1) only; for geometry say *transform* |
| Contour / outline / envelope / boundary | All are lines; they differ in source (§5.1). *Boundary* is the general word for any of them in 3D or 2D | Use the specific term |

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
- The earlier legacy releases 0.6.1 and 0.6.2 (parametric format, legacy DDA backend with continuous water level) were retired (ADR-028); continuous water level is a migration target (MT-1).
- Continuous water level on compiled geometry and aggregate source-entity attribution are unresolved.
- Coordinates and geometry rules: `datasets/zhouning-lower-reservoir-dam/README.md`.
- Dataset ID, data version, schema version and release ID are recorded separately; one data version may have release packages in different formats, so caches and plan references always use the full release ID.

Every future dataset, of any kind, gets metadata and a description at the same level and is loaded through the common interface.

## 9. Open definitions

Domain definitions still to be written are tracked as requirements in [`docs/FEATURE_REQUIREMENTS.md`](docs/FEATURE_REQUIREMENTS.md) (FR-D, FR-K, FR-X1, FR-V3, FR-S2/S3, FR-M1/M2, FR-P1, FR-D9). This file keeps only settled semantics; `TBD` items are filled in here once their requirements are done.
