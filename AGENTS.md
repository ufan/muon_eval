# AGENTS.md

General development rules for any AI coding tool or human developer working in this repository. They do not depend on a particular vendor, model, editor, command-line tool or hosting platform. The rules apply to a **muography deployment evaluation platform that loads datasets of different kinds**: dams first, then other imaging subjects such as blast furnaces and tunnels. No subject's dimensions, coordinates or business assumptions may become platform rules.

Domain context, terminology and the current datasets are recorded in `CONTEXT.md`; each dataset has its own description in `datasets/<dataset-id>/README.md`.

## Purpose

The project is used to:

- load the geometry of an imaging subject (a dam and its appurtenant structures, a blast furnace, a tunnel and its overburden, …): material regions, cavities and internal features;
- configure muon detectors, candidate stations and observation poses;
- estimate ray material paths, water-equivalent column density, transmission and expected counts;
- produce expected projections in the detector-local slope space;
- scan, compare and export stations, poses and multi-station deployment plans, including simultaneous multi-station views and simulated reconstruction.

It is a rapid evaluation and plan-comparison tool for engineering deployment, not a full particle-transport simulation, engineering CAD, construction design or safety-assessment system. Approximate results must never be described as construction-grade conclusions.

## Read first

1. `CONTEXT.md`: use cases, geometry semantics, terminology and current datasets; then `docs/specs/DOMAIN_MODEL.md` for how domain concepts relate and what must always hold.
2. `README.md`: how to run, current capabilities and directory entry points.
3. The four guideline documents at the top of `docs/`: `ARCHITECTURE_DECISIONS.md`, `FEATURE_REQUIREMENTS.md`, `ROADMAP.md`, `IMPLEMENTATION_PRIORITY.md`.
4. `docs/specs/`: the specs relevant to the task (current architecture and module boundaries, calculation model, geometry reference contract, projection data and validation); index in `docs/specs/README.md`.
5. The dataset's own description; the current example is `datasets/zhouning-lower-reservoir-dam/README.md`.
6. `docs/guides/`: result interpretation, projection workflow, deployment and `MIGRATION_CHECKLIST.md`.

Check `git status --short` before changing anything, keep the user's existing changes, and never assume the working tree is clean.

## Data and geometry rules

- Every subject is loaded as an explicit, versioned dataset with a declared `kind`. Never hard-code a project's dimensions, section counts, names, coordinates or kind-specific terms in generic UI, renderer or calculation modules.
- Generic code depends only on normalized model coordinates and geometry interfaces. Converting raw survey/CAD coordinates, axis conventions and elevation datums is the job of the dataset adapter layer.
- Points, directions, angles, elevations and lengths use explicit types or field semantics; translation applies to points only, never to directions.
- Solid material is "positive volumes minus negative volumes". Negative volumes hollow out material and are not shown as filled material by default.
- Visual geometry, material classification and ray intersection express the same geometric facts. When changing solids, cavities or boundaries, verify all three.
- Whether internal structures are shown is dataset and scene configuration, not material truth; hidden geometry never changes ray results.
- Uncertain dimensions, approximate outlines, data sources and confidence are kept as metadata; unknowns are never hidden behind unexplained constants.
- Detector configuration is independent of the dataset; changing the subject never changes the meaning of device parameters.
- Physics must not silently assume one kind of subject (for example rock-like matter or open-sky geometry); kind-specific physics prerequisites are explicit requirements.

## Adding a dataset

A new dataset must at least:

1. Define a stable dataset ID, `kind`, version, units, source frame, model frame, elevation datum and azimuth convention.
2. Map solids, material regions, cavities, internal features, environment volumes (water, burden, overburden, …) and candidate areas to the generic geometry semantics; declare its environment variables, display layers and semantic targets.
3. Record sources, approximations, unknowns and automatically checkable assertions.
4. Provide forward and inverse coordinate transforms, verified with known control points.
5. Provide representative material points, cavity points and reference rays as regression baselines.
6. Verify that 3D display, point classification, ray paths and projection outlines agree.
7. Prefer adding a dataset adapter, offline compiler or configuration; never change the generic calculation core for a single dataset.

Raise something to a higher-level generic interface only after a second real dataset (or a second subject kind) proves a shared pattern; do not over-design on speculation.

## Changes and verification

- After changing JavaScript, run at least `node --check dist/app.js`; check every affected entry point and run the related tests.
- Run `git diff --check` before committing.
- After changing a data spec, validate it against its schema and check `assertions`, `unknowns`, versions and coordinate metadata.
- After changing layout, check common desktop sizes and narrow screens; after a sidebar toggle or container resize, confirm the WebGL camera aspect ratio and model scale are unchanged.
- After changing stations, poses, device parameters, environment or geometry, confirm the final projection and derived assessment are updated from the same calculation result.
- High-risk geometry changes need spot checks of at least: ordinary solids, boundary turns, material junctions, openings/cavities, internal features and the dataset's own complex structures.
- A new dataset must add control-point, material-point and reference-ray tests; screenshots alone are never acceptance.

## Architecture constraints

- The application is an offline static site; do not add runtime CDN or external-service dependencies unless requirements change.
- Refactor gradually and prefer extracting testable pure calculation modules.
- Single-point evaluation, batch scans, ranking, multi-station views, reconstruction, export and reports all reuse the same calculation core; no divergent formula copies.
- Keep datasets, devices, deployment plans, environments, view state and calculation results separate; save/load formats need explicit schema versions and a migration strategy.
- The rendering layer is never a source of geometric truth; the calculation layer never needs the DOM or Three.js scene objects to run.
- Scans focus on relative comparison, constraint filtering and robustness; engineering accessibility, physical observability and safety/construction conditions are separate dimensions.

## Git, migration and deployment

- Never test by double-clicking `dist/index.html`; always serve over HTTP.
- Do not commit release archives, caches or regenerable files.
- Hosting-platform binding files are optional deployment adapters, not domain configuration; changing AI tools or hosting must not affect the application, datasets or core documentation.
- A repository migration keeps at least `.git/`, `AGENTS.md`, `CONTEXT.md`, `README.md`, `docs/`, application source, `datasets/` and required deployment configuration.
- One feature or one explainable refactoring unit per commit; geometry, physics-formula and data-format changes are labelled explicitly in the commit message.
- All documentation is written in English.
- When a change adds, removes or changes a domain concept, relationship, identity or invariant, update `docs/specs/DOMAIN_MODEL.md` (and the `CONTEXT.md` glossary for new terms) in the same commit.

## Recommended order of evolution

The authoritative order is `docs/ROADMAP.md` and `docs/IMPLEMENTATION_PRIORITY.md`. In short: trustworthy results and tests first, then versioned plans, then the multi-station overview, scanning, new screens, multi-station evaluation, simulated reconstruction and physics validation.

Avoid introducing large frameworks or complex plugin systems for hypothetical futures; a second real dataset, a second subject kind and real scan needs are the test of whether an abstraction is worth it.
