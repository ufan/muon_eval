# Calculation model

This spec defines the calculation chain, formulas and parameters by which the current fast-evaluation model (`legacy-quick-response@1.0.0` and its compiled adapter) turns subject data, detector position and pose into rays, projections and numerical metrics. It is a normative description the code must match, not a promise of full muon transport or detector calibration.

- Any change to formulas, default parameters or numerical behaviour is a model revision: increase the model version, update the frozen baseline tests and label it in the commit message.
- The meaning of results, their limits, parameter sensitivity and usage advice are in the [result interpretation guide](../guides/RESULT_INTERPRETATION.md).
- Known open corrections to this spec (history-dependent cache, ray-length recording, the acceptance cos θ factor) are FR-C1…C3 in the [feature requirements](../FEATURE_REQUIREMENTS.md).
- Section numbers follow the former `CALCULATION_MODELS.md` so existing references (§2–§13) stay valid.
- The bundled Zhouning dam is the worked example; dam-specific items (water levels, concrete, dam targets) are the dam kind's instance of the generic quantities.

## 2. Overall calculation chain

```text
dataset + environment state
        ↓
coordinate transform and material classification
        ↓
station position + azimuth/elevation + detector parameters
        ↓
detector-local slope grid (sx, sy) → ray directions in space
        ↓
compiled BVH material segments, or legacy DDA adaptive subdivision
        ↓
path lengths per material (e.g. concrete/water/rock/air)
        ↓
water-equivalent column density X
        ↓
continuous energy loss → minimum surface energy to penetrate, Emin
        ↓
surface muon spectrum integrals: open-sky flux and transmitted flux
        ↓
transmission, solid angle, area, exposure and detection efficiency
        ↓
expected counts per direction
        ↓
projections, structure outlines, significance, flux cloud and side-panel metrics
```

The legacy calculation entry is `dist/modules/main-assessment.js`, which takes station, device, response and environment snapshots and an injected geometry interface; the compiled entry is `compiled-main-assessment.js` over `compiled-assessment.js`. Direction arithmetic is in `detector-pose.js`, rays come from the bound geometry context, and legacy target interpretation is in `legacy-target-interpretation.js`. `dist/app.js` only assembles dependencies.

`dist/modules/muon-response.js` holds the spectrum, integral, energy-loss and significance formulas; `detector-projection.js` holds native strip-difference binning, pixel response, batched projection and Gaussian display smoothing. `assessment-controller.js` manages cancellation and publication without reading the DOM or importing a geometry backend. The quick preview and final result share one input/environment snapshot; `main-page.js` only receives results to update the DOM. The model identifier is `legacy-quick-response@1.0.0`; module boundaries do not change the physics model.

Existing approximations are kept: counts use a fixed three-layer efficiency `ε³`; both axes are binned with `stripsX` (the current UI has symmetric readout); and the integrated flux is cached with quantization by model/zenith angle/energy. A quantization bucket returns the value of its first call, so cache history can change results (measured up to ~5% per pixel near the horizon; FR-C1); the main app still shares this cache. The fixed `10⁵ GeV` integration upper limit and the old behaviour at extreme energies are unchanged and need a separate model revision rather than a silent change during refactoring. Tests with frozen old formulas verify exact numerical agreement for both angular models, 25/65 grids, per-pixel counts/transmission and display smoothing.

## 3. Inputs, state and versions

### 3.1 Dataset

Data come from the selected release in `datasets/registry.json`, including:

- positive volumes (`solids`);
- negative volumes (`voids`);
- foundation surfaces, environment water bodies and material densities;
- candidate stations and initial device parameters;
- geometry sources, confidence grades, unknowns and assertions.

The current Zhouning dataset is an LOD2 parametric model based on photographs, public information and empirical assumptions; compiled releases add closed GLB meshes per frozen scenario. Coordinate and geometry rules are in [`datasets/zhouning-lower-reservoir-dam/README.md`](../../datasets/zhouning-lower-reservoir-dam/README.md). Future datasets enter this calculation chain through the same semantic interface.

### 3.2 Environment state

On the legacy backend the upstream water level is set by a slider and the downstream level is fixed to the spec value. On the compiled backend only the complete variables of a published scenario (including water levels and gate states) can be selected, and the continuous slider is disabled. Compiled meshes are never interpolated, and arbitrary override values are never recorded as a computed environment.

The model includes no time-dependent corrections for atmospheric pressure, temperature, reservoir water density or ground moisture.

### 3.3 Detector and response parameters

Defaults and adjustable UI parameters:

| Parameter | Current default | Where it acts |
| --- | ---: | --- |
| Layers | 3 | Baseline and multi-layer coincidence efficiency |
| Sensitive area | 409.6 × 409.6 mm | Count normalization and 3D display |
| Strip width/pitch | 1.6 mm | Native slope step |
| Readout strips per direction | 256 | Native slope grid and field of view |
| Layer spacing | 0.15 m | Total baseline, 0.30 m with three layers |
| Single-layer efficiency | 95% | Three-layer coincidence efficiency `ε³` |
| Dead-time loss | 2% | Effective live-time fraction 0.98 |
| Angular resolution | 0.3° | Gaussian smoothing of the displayed projection |
| Systematic error | 3% | Denominator of structural significance |
| Exposure time | 30 days | Linear scaling of expected counts |
| Surface angular distribution | Modified Gaisser | Open-sky and transmitted flux |

Parameters are stored in browser `localStorage`. Exported plans include device and response snapshots.

## 4. Coordinates, pose and ray directions

### 4.1 Station coordinates

The UI uses a normalized right-handed model frame. For the Zhouning dataset:

- `X+`: downstream;
- `Y+`: northwest / left bank;
- `Z+`: increasing elevation, with `Z = engineering elevation − 198 m` for this dataset.

Legacy classification uses document coordinates internally with a single conversion at the entry; compiled classification and rays use `model_frame` directly, and the GLB and display reuse the model buffers. Transform details are in the dataset README.

### 4.2 Central direction

Azimuth `az` increases from model `X+` towards `Y+`; elevation `el` increases upward from the horizontal plane. The central unit direction is:

```text
d0 = (cos(el) cos(az), cos(el) sin(az), sin(el))
```

The UI currently limits azimuth to `0–359°` and elevation to `0–90°`, so only upward rays are computed. The surface flux model returns zero below the horizon.

### 4.3 Detector-local slopes

Each projection direction is built from the central direction, the local right direction and the local up direction:

```text
d(sx, sy) = normalize(d0 + sx · right + sy · up)
```

`sx` and `sy` are dimensionless slopes, not angles; they are the local rightward and upward offsets. The corresponding off-axis angle is about `atan(sqrt(sx² + sy²))`.

Total baseline and native slope step:

```text
baseline = layerSpacing × (layers - 1)
nativeSlopeStep = stripPitch / baseline
maxSlopeX = (stripsX - 1) × nativeSlopeStep
maxSlopeY = (stripsY - 1) × nativeSlopeStep
```

The full field of view shown in the UI is:

```text
FOV = 2 atan(maxSlope)
```

Note: this is the geometric range spanned by strip-difference combinations. Large-slope directions have fewer strip pairs, so acceptance falls off naturally; the field of view is not uniformly sensitive.

## 5. Legacy material geometry and point classification

For any point in space the legacy backend classifies in this order:

1. inside a positive volume, outside all negative volumes and above the dam foundation surface: concrete;
2. below the foundation surface: rock;
3. inside the upstream/downstream water area and below the corresponding water level: water;
4. otherwise: air.

The concrete geometry here is `union(solids) − union(voids)`. Negative volumes themselves have no material; galleries, observation rooms, elevator shafts, openings and chutes are formed by subtracting concrete.

The same point can also carry target labels such as dam, gallery, elevator shaft, spillway, platform and water body. Labels are used for outlines, hover markers and counterfactual significance and do not change the base material classification.

### Current assumptions

- Uniform density within each material region;
- no reinforcement, equipment, sediment or small components;
- rock approximated by a simplified foundation surface and boundaries;
- the full reservoir bed and both banks are not modelled in 3D;
- results at geometric junctions depend on sampling tolerance.

## 6. Legacy ray tracing and path integration

### 6.1 Tracing range

Rays are first intersected with the current engineering bounding box.

The bounds are the `traceSettings.boundsDoc` returned by legacy-geometry-adapter: laterally from terrainNear's origin/shape/spacing, vertically the legacy compatibility domain 150–600 m, with a 500 m range limit. The spec's dam dimensions must never replace this actual calculation domain.

No material is accumulated outside the box. If real rock or water extends beyond it, the column density is underestimated. This range is an implementation detail of the current dataset and should in future be declared by the dataset.

### 6.2 DDA and boundary subdivision

Rays advance along the main grid with 3D DDA:

- main cell size: 5 m;
- final-projection boundary subdivision target: 0.5 m;
- quick-preview boundary subdivision target: 1.5 m;
- maximum recursive subdivision depth: 8.

Within each main-grid segment the program checks material and target labels near the start, middle and end. If all three agree, the whole segment is accumulated as one class; otherwise it is bisected recursively down to the subdivision scale or depth limit.

This is faster than a fixed small step but still a numerical approximation: structures smaller than the sampling scale, falling exactly between check points, or with very thin sharp corners can be missed. 0.5 m is the termination scale of subdivision, not an absolute 0.5 m accuracy for every path length.

### 6.3 Path output

Each ray accumulates:

- concrete path `Lconcrete`;
- water path `Lwater`;
- rock path `Lrock`;
- air path `Lair`;
- intersection length with each target label;
- crossed grid segments with entry/exit distances.

"Central-ray concrete path" in the side panel shows only the concrete length along the projection's central direction, not the total material length.

"Central-ray main-grid cells" currently shows the number of classified segments recorded for the central ray; because one main cell can produce several segments through boundary subdivision, it is not necessarily the number of geometrically distinct voxels.

"Effective ray path range" is the minimum and maximum concrete path over all valid directions of the final 65×65 projection.

## 7. Water-equivalent column density

Water equivalent `X` is the sum of path lengths times relative density:

```text
X [m.w.e.] = Lconcrete ρconcrete + Lwater ρwater + Lrock ρrock
```

Path lengths are in metres and densities in `g/cm³`, which relative to water at `1 g/cm³` gives metres of water equivalent numerically. Air does not contribute to column density. On the compiled backend the same sum runs over every registered material of the dataset (`materialColumns`), not a fixed list.

Current Zhouning defaults:

- concrete: 2.4 g/cm³, assumed range 2.35–2.45;
- water: 1.0 g/cm³;
- rock: 2.65 g/cm³, assumed range 2.55–2.75.

"Central-ray column density m.w.e." in the side panel shows `X` of the central direction, rounded to an integer. It depends on geometric length, material type, density and water level.

## 8. Continuous energy loss and minimum penetrating energy

A continuous-slowing-down approximation converts column density into the minimum surface energy needed to penetrate the path:

```text
dE/dX ≈ a + bE
Emin(X) = (a / b) [exp(bX) - 1]
```

Current coefficients:

```text
a = 0.2 GeV / m.w.e.
b = 4 × 10⁻⁴ / m.w.e.
```

`Emin` is at least 1 GeV in the integration.

This is a mean continuous energy-loss model. It does not describe energy-loss fluctuations, stochastic radiative processes, multiple scattering, muon decay, charge differences or detailed material-composition effects; one rock-like `a, b` is used for all materials (FR-K4). For thick paths the real transmission can deviate systematically from this approximation.

## 9. Surface muon flux model

### 9.1 Modified Gaisser mode

The default is the Modified Gaisser parameterization in the code. The spectral shape includes:

- an approximately `E^-2.7` energy spectrum;
- π/K meson terms;
- a low-energy correction;
- an effective zenith-angle `cos(θ*)` correction.

The code integrates in log energy from `Emin` to `10⁵ GeV` in 44 intervals to obtain the integrated flux in that zenith direction. For performance, `cosZ` and `log10(Emin)` are quantized and cached, so nearby inputs can reuse the same integral value (see FR-C1).

### 9.2 cos²θ mode

The optional `cos²θ` mode multiplies the vertical Gaisser spectrum by `cos²θ`:

```text
I(E, θ) = I_Gaisser(E, θ=0) cos²θ
```

This is a rougher angular distribution for comparison. Its absolute normalization is not recalibrated, and it must not be understood as a more accurate option.

### 9.3 Open-sky and transmitted flux

For each direction:

```text
Φopen    = ∫ from 1 GeV to 10⁵ GeV I(E, θ) dE
Φthrough = ∫ from max(1 GeV, Emin(X)) to 10⁵ GeV I(E, θ) dE
T        = Φthrough / Φopen
```

`T` is the transmission in the projection. It is a relative flux ratio within the current model, not "the probability that a ray passes through the dam", and does not include detector efficiency, which is applied at the count stage.

## 10. Detector acceptance and expected counts

### 10.1 Native strip-difference grid

Each direction axis has `2N - 1` strip differences, where `N` is the number of strips per direction. The combination weight of strip difference `d` is:

```text
w(d) = (N - |d|) / N
slope(d) = d × nativeSlopeStep
```

The central direction can be produced by the most strip pairs, edge directions by fewer. To produce a 25×25 or 65×65 projection, several native strip differences are aggregated by weight into one display pixel, with the pixel slope taken as the weighted mean.

### 10.2 Pixel solid angle

The current approximation is:

```text
dΩ = nativeSlopeStep² × Wx × Wy / (1 + sx² + sy²)^(3/2)
```

where `Wx` and `Wy` are the sums of the native strip-difference weights aggregated into the pixel. The denominator is the Jacobian from the local slope plane to solid angle. Whether a further projected-area factor `cos θ` belongs here is open (FR-C3).

### 10.3 Response and counts

The base response factor is:

```text
response = layerEfficiency³ × deadLiveFraction
```

Expected counts per pixel:

```text
Npixel = Φthrough × activeArea × exposureSeconds × dΩ
         × response × edgeFactor
```

The current edge correction is:

```text
edgeFactor = 0.85 + 0.15 sqrt(acceptanceWeight / (stripsX × stripsY))
```

It lowers the edge of the field of view further. It is an empirical approximation, not an efficiency map from detailed trigger/reconstruction simulation.

The absolute expected count depends on the surface flux normalization, unit consistency, the device's effective area, independent three-layer efficiencies, dead time and the edge model above. Not included:

- energy-dependent detection efficiency;
- direction-dependent trigger and reconstruction efficiency calibration;
- noise, accidental coincidences and non-muon background;
- data-quality selection and run interruptions;
- angular migration from multiple scattering.

The side panel's expected count is the sum of `Npixel` over all 65×65 pixels. On the legacy backend, right after a station/pose change, a 9×9 empirical estimate is shown first; the compiled backend does not provide this old heuristic. The formal integrated total replaces it once the final projection completes. Use the values after the projection status shows completion.

## 11. Projection generation and image interpretation

### 11.1 Two-stage calculation

To keep the UI responsive, projection runs in two stages:

| Stage | Pixels | Boundary subdivision | Use |
| --- | ---: | ---: | --- |
| Quick preview | 25×25 | 1.5 m | Immediate feedback after a pose change |
| Final projection | 65×65 | 0.5 m | Final image and side-panel metrics |

The boundary subdivision column applies only to DDA; on the compiled backend both stages use the same BVH meshes and intersection tolerance, and only the device-grid aggregation changes, not physical geometric accuracy.

65×65 is a display/aggregation resolution, not the detector's native channel count. The default 256-strip readout has 511 native strip differences per axis.

### 11.2 Axes

- Horizontal axis `sx`: positive towards the detector's local right;
- vertical axis `sy`: positive towards the detector's local up;
- the centre pixel corresponds to the set azimuth and elevation;
- the image is not an orthographic plan of the subject but a **detector direction/slope-space map**.

### 11.3 Expected-count map

Each pixel shows the expected count after angular-resolution smoothing, with a fixed logarithmic colour mapping:

```text
t = clamp[(log10(max(0.1, N)) + 1) / 6, 0, 1]
```

It covers roughly `0.1–10⁵` counts. The colours support visual comparison across stations, but larger values cannot be distinguished after saturation. The `count` in the hover readout currently uses the raw pre-smoothing pixel count and can differ slightly from the pixel's displayed colour.

### 11.4 Transmission map

Each pixel shows the smoothed `T = Φthrough / Φopen` on a fixed `10⁻⁶–1` logarithmic colour scale:

```text
t = clamp[(log10(max(10⁻⁶, T)) + 6) / 6, 0, 1]
```

High transmission usually means low column density, but it can also come from rays missing the target, missing geometry or an engineering bounding box that is too short; a bright area alone does not prove a cavity.

### 11.5 Angular-resolution smoothing

The configured angular resolution is converted into a Gaussian `σ` in projection pixels, and counts and transmission are convolved in 2D, truncated at about `2.5σ` and at most 6 pixels.

The conversion approximates angle by the local slope step, which is not a strict spherical convolution at large slopes; at the image border only in-image pixels are renormalized. Significance is currently not convolved with the same resolution.

## 12. Legacy target structures, outlines and significance

### 12.1 Target mask

A pixel enters a target's mask when its ray's accumulated intersection length with the target label exceeds 0.15 m. Targets are elevator shafts, galleries, spillway, platform, water body and dam.

### 12.2 Outlines

Outlines are the outer boundaries of the discrete target masks. Where target entry depth or intersection length changes beyond a threshold between neighbouring pixels, internal feature lines are drawn as well:

- dam: entry-depth difference of about 4 m or concrete-length difference of about 5 m;
- water body: about 2 m / 2 m;
- other targets: about 1.5 m / 0.75 m.

These thresholds are display heuristics. An outline is "the discrete intersection boundary between rays and a semantic target", not a CAD edge, and is not guaranteed to show every small structure.

### 12.3 Counterfactual significance

For a selected non-dam target the program builds a simplified counterfactual column density:

- cavity target: replace its air path with concrete;
- concrete component target: remove its concrete column;
- water-body target: remove its water column.

It then computes the counterfactual count `Ncf`; single-pixel significance is:

```text
S = |N - Ncf| / sqrt(max(1, N) + (fsys N)²)
```

The default systematic fraction is `fsys = 3%`. When several targets are selected, a pixel shows the largest `S`, not a joint likelihood.

The "selected ROI" summary in the UI is:

```text
SROI = sqrt(sum over pixels of Smax²)
```

This combination assumes statistically independent pixels, whereas angular smoothing, systematic errors and reconstruction create correlation. It is a heuristic score for structural contrast, not a strict discovery significance or confidence level.

## 13. Legacy 3D flux cloud

The flux cloud uses 17×17 regular local slope directions, sparser than the final projection. It has two display quantities:

### Combined received contribution

```text
contribution = triangularAcceptance × Φthrough / Φvertical,open
```

The triangular acceptance is largest at the centre of the field of view and falls to zero at the edge; the reference flux is the vertical open-sky integrated flux with a 1 GeV minimum energy.

### Subject-only transmission

```text
transmission = Φthrough / Φopen
```

The flux cloud uses a fixed logarithmic colour mapping. Point count and extension length also grow with the displayed quantity, so it is a 3D visual encoding of directional contribution; it does not represent a real cloud of muons in space or local flux changes along the ray path.

Directions below 0.1% of the current station's peak are hidden. Because the threshold is relative to the station's own peak, the number of shown directions is not suitable as an absolute cross-station metric; the fixed colour scale and "weighted transmission" are better for comparison.

The weighted transmission in the flux-cloud information is, over the 17×17 samples:

```text
Tweighted = sum(acceptance × Φthrough) / sum(acceptance × Φopen)
```

## 14. Compiled assessment and pattern interpretation layer

The pattern interpretation layer provides raw and existing display-smoothed response contours, open-sky counts taken directly from the shared pixel calculation, `N/Nopen` context and reproducible station/pose comparison; definitions and limits are in the [finite-model workflow](../guides/PROJECTION_WORKFLOW.md#finite-model-interpretation-and-comparison). Zero open-sky support and the original fast model's out-of-range `T>1` are not faked as valid attenuation; the raw scientific results are kept. Comparison uses only explicit ROIs, raw transmission/counts, representative sampling-grid coverage and direction-centroid distance, and adds no significance or measured-calibration model. Geometry reference lines are finite-model interpretation, not certified real physical interfaces. The shared core's open-sky context is an optional output; the exact regression of the old default scientific results is kept.

Frozen scenarios of the native format call the same compiled-assessment batched evaluation/result adaptation in the main app (the default backend) and in the standalone `/geometry-preview.html`, using closed GLB/BVH material paths through `compiled-assessment.js`. The column-density map's arbitrary half-angle is not used for device counts: counts use the full strip-difference space of the three-layer symmetric-readout device, and native-bin directions generally differ from the uniform material-map directions. The UI can switch between expected counts and transmission, displayed with the existing Gaussian smoothing; total counts, weighted transmission, pixel picking and raw values in JSON are not smoothed.

The preview configuration defaults to the independent platform device/response and does not automatically use the incomplete instrument parameters in the data package sidecar. The model is not field-calibrated; material outside the published meshes or beyond the ray length is not included, which can overestimate transmission. The compiled adapter reports non-finite or negative responses explicitly (for example extreme column densities beyond the old integration energy range) without modifying the old formulas; three-layer asymmetric devices, source-entity ROI significance and continuous water level are not supported. The main app disables the old target heuristics and flux cloud on the compiled backend; material and response numeric layers still consume the same scientific result. The main app's ray length encloses every corner of the published bounds from the station and is recorded in the result; it still does not compensate for missing material outside the domain.
