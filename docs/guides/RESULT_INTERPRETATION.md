# Interpreting and using results

For developers and end users: what the current fast-evaluation results mean, where they apply, how sensitive they are to parameters, what is uncertain and how to use them. The formulas and calculation chain themselves are in the [calculation model spec](../specs/CALCULATION_MODEL.md) ("spec §N" below refers to its sections).

After reading this, a user should be able to answer: what a given image shows, how a given number is obtained, which step a parameter change affects, and which assumptions a result depends on.

## 1. Scope and limits of conclusions

The current model is suitable for:

- quickly comparing candidate stations, poses and device configurations;
- judging whether the field of view covers the target structure;
- estimating material lengths, column density, transmission trends and count magnitudes in different directions;
- screening plans for later high-fidelity simulation, site surveys and deployment design.

The current model is not:

- particle-by-particle Monte Carlo transport such as Geant4;
- an engineering digital twin with full terrain, material inhomogeneity and complete CAD/BIM;
- a final performance prediction calibrated with measured background, trigger, reconstruction efficiency and environmental changes;
- an automatic conclusion about structural safety, construction safety or deployment accessibility.

Expected counts and significance are therefore **comparison metrics and magnitude estimates within one model**. Until geometry, flux, detector response and field data are validated, they must not be used on their own as engineering commitments.

## 2. Exact meaning of the side-panel metrics

| UI metric | Source of the final value | How to read it |
| --- | --- | --- |
| Central-ray concrete path | Centre pixel of the 65×65 projection | Total concrete length along the central viewing direction |
| Central-ray column density (m.w.e.) | Centre pixel of the 65×65 projection | Water-equivalent sum of concrete, water and rock along the central direction |
| Expected count | Sum over all 65×65 pixels | Total event magnitude for the current device, exposure and fast physics model |
| Weighted field transmission | `sum(Nthrough)/sum(Nopen)` | Whole-field transmission weighted by area, solid angle and response |
| Central-ray main-grid cells | Number of segments recorded for the centre ray | Auxiliary information about computational complexity/path segmentation, not a physical performance metric |
| Effective ray path range | Minimum–maximum concrete length over the projection | The span of concrete thickness covered by the current field of view |

The side-panel heading "station assessment" does not mean a relative scan ranking has been done. These are mostly single-station raw or derived metrics; future scans compare quantiles, ranks, robustness and multi-objective trade-offs under common constraints.

### Lines from behind the detector (后方来向)

A projection pixel is a line through the detector; below the horizon line of the map, its muons come from the sky behind the detector (the detector cannot tell the direction without time-of-flight). The 后方来向 chip in the viewport tools hides everything these lines record, as a view option only:
- the back part of the projection map and of the side-by-side cards is drawn blank, has no readout, and outlines and precision lines stop at the horizon;
- coverage shading (geometric, physical and multi-station) and the 3D readout leave out points seen only through a line from behind;
- the field of view loses its back edges;
- the 多站 numbers (image share, counts, usable views and their spread) count only lines from in front.

Results and exports never change; the counts of those pixels are still part of every result. Use it to judge what a deployment records from in front alone.

### The hovered pixel's 3D ray

Hovering a pixel of the expected projection draws that pixel's ray in the 3D view: from the detector outward along the pixel's direction, as traced by the same calculation that gives the readout numbers. The readout's "坝体混凝土 · 穿行 32.4 m · 距探测器 4.7 m 处进入" is the concrete stretch of the ray that starts 4.7 m from the detector and runs 32.4 m. The ray disappears when the pointer leaves the projection, unless the pixel is pinned.

**The ray in 3D.** Each stretch is a tube colored by the material it passes through:

| Color | Material | Profile label |
| --- | --- | --- |
| Yellow | Concrete | 混凝土 |
| Light green | Rock (terrain and surrounding rock) | 岩石 |
| Blue | Water (reservoir, tailwater) | 水 |
| Orange-red | Steel | 钢 |
| Cyan | Air inside the path (the gallery the detector sits in, or a cavity the ray crosses) | 空气 |
| White | A material without a defined ray color | the material's ID |

- **Solid or ghosted.** Where nothing is between the camera and the tube, it is drawn solid and lit. Where a surface hides it, only a dimmed, ghosted copy shows through. A stretch that looks ghosted is behind or inside the subject from the current viewpoint; rotate the view to see how this changes.
- **Rings and labels** mark each surface crossing taken from the calculation: 入 where the ray enters material from air, 出 where it leaves material into air, 界 at an interface between two materials, each with its distance from the detector in metres.
- **Exit stub.** After the last exit, a thin cyan stub (at most a quarter of the ray's length) shows the ray continuing into open air. It is not part of the attenuating path.
- **Constant size.** Tube thickness and ring size stay constant on screen at any zoom; they are not measurements.
- **Linked components.** Components the ray crosses (galleries, rooms and so on) are highlighted while the ray is shown.
- These colors belong to the ray only. They differ from the subject's display colors, the recognition outline colors and the feature-layer colors. The pink arrow is the detector's pointing axis (the centre of the field of view), not a traced ray.

**Depth profile in the readout.** Under the readout a bar runs from the detector (0 m) to the end of the drawn ray, in the same colors as the tube. Wide stretches carry their material name; hover over any stretch for its material and distance range. White ticks mark the surface crossings, with their distances under the bar. Empty gaps in the bar mean the calculation has no interval there; they are never filled in.

**Pinning and side view.** A click on a projection pixel pins it: its ray and profile stay after the pointer leaves the projection, and the pixel is outlined. Clicking the same pixel again unpins it. A pixel picked from the 3D coverage is pinned the same way. While a pixel is pinned, "侧视射线" moves the camera to look at its ray side-on, framed to its full length, so a ray that points roughly away from the camera is no longer foreshortened. Any camera drag cancels the move.

## 3. Parameter sensitivity and choices

| Parameter change | Main effect | Advice |
| --- | --- | --- |
| Station position | Geometric intersections, all material paths and contours | Make sure coordinates and the station's engineering meaning are reliable first |
| Azimuth/elevation | Target coverage, zenith-angle flux and paths | Adjust in small steps and wait for the final projection |
| Water level / scenario | Water paths, column density and water-body outlines | Record the scenario in results |
| Material density | Column density, minimum energy, transmission and counts | Use measured values and keep the uncertainty range |
| Sensitive area | Counts change roughly linearly | Enter the actual effective area, not the housing size |
| Strip pitch / count / layer spacing | Slope step, field of view and pixel acceptance | The combination must match the real readout geometry |
| Single-layer efficiency | Three-layer coincidence changes as `ε³` | Do not substitute single-layer efficiency for a system efficiency calibration |
| Dead-time loss | Total counts change linearly | Use the effective live-time fraction |
| Exposure time | Counts linear, significance sub-linear | Keep it the same when comparing plans |
| Angular resolution | Image smoothing and structure visibility | Currently smooths counts/transmission only; raw rays are unchanged |
| Systematic error | Affects structural significance only | Should come from calibration or a sensitivity range, not be tuned freely |
| Angular flux model | Zenith dependence and absolute counts | Gaisser by default; cos² only for rough comparison |

Developers must not "optimize" how a plan looks by tuning systematic error, efficiencies or colour scales. Parameter changes need a physical or calibration basis and must appear in exported results.

## 4. Main current uncertainties and technical debt

### Geometry

- some chute, bottom-outlet, observation-room and lower-gallery dimensions are approximate or assumed;
- the full reservoir bed, both banks and external rock terrain are missing;
- the engineering bounding box can truncate external rock paths.

### Physics

- Continuous energy loss ignores stochastic transport and scattering;
- the surface flux model and its unit normalization have not been checked against measured data at this site;
- materials are represented by mean density only;
- atmospheric, seasonal and charge-ratio corrections are not included.

### Detector

- Three-layer efficiency is treated as independent identical efficiencies `ε³`;
- geometric acceptance is the ideal two-plane factor (cos⁴θ per slope cell, since model 3.0.0); real detectors lose further efficiency toward the field edge, not modelled here;
- trigger, noise, reconstruction, energy- and direction-dependent efficiencies are not modelled;
- angular resolution is an approximate 2D Gaussian display smoothing.

### Statistics

- Significance uses a single-pixel Gaussian approximation and one proportional systematic error;
- ROI combination ignores pixel correlation and multiple testing;
- selecting several targets takes the maximum, not a joint fit;
- there is no uncertainty propagation for geometry, density or response parameters.

## 5. Using and verifying results

### End users

1. Confirm the dataset release, station, pose, device and scenario/water level.
2. Wait until the final projection is done before recording side-panel metrics.
3. Look at counts, transmission, target outlines and the hovered 3D ray together; never judge structure from a single brightness image.
4. Compare stations only under identical parameters and constraints.
5. Run sensitivity checks on density, position, angle and geometry extent for leading candidates.
6. Confirm the final plan with high-fidelity simulation or measured data.

### Developers

Any change to the calculation chain establishes at least these regression quantities:

- forward and inverse transforms of control points;
- material classification of representative points;
- per-material path lengths and column density of reference rays;
- `Emin` at fixed `X`;
- spectrum and integrated flux at fixed energy/zenith angle;
- field of view, solid-angle weights and open-sky counts at fixed device parameters;
- centre pixel, total count and weighted transmission at a fixed station;
- target counterfactual counts and significance;
- consistent trends between the 25×25 preview and the 65×65 final result.

When the model or default parameters change, increase the corresponding model version and state in exports and the change log that values are not directly comparable with the old version.

## 6. Further validation

Validation material still to be produced is tracked as requirements in [`../FEATURE_REQUIREMENTS.md`](../FEATURE_REQUIREMENTS.md): FR-V (physics and validation), FR-X (detector), FR-S2/FR-M1 (scans and multi-station).
