# Feature Requirements

What the platform must do, with acceptance criteria. IDs are stable; statuses: **Needed**, **In progress**, **Done**, **Deferred**, **Open** (needs a decision).

Related: [Architecture decisions](ARCHITECTURE_DECISIONS.md) · [Roadmap](ROADMAP.md) · [Implementation priority](IMPLEMENTATION_PRIORITY.md) · detailed open items (Chinese) in [`../ROADMAP.md`](../ROADMAP.md)

Last updated: 2026-10-10

---

## C. Correctness and reproducibility

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-C1 | Calculation results must not depend on evaluation history. | The same input gives identical results regardless of what was computed before, in any session or worker. Today the flux cache (`muon-response.js`) returns the first value in a quantised bucket: measured up to ~5% per-pixel error near the horizon (cosZ 0.1, Emin 5 GeV). Fix is labelled as a physics-model revision with a new `RESPONSE_MODEL_VERSION`. | Needed |
| FR-C2 | Exports must record the actual ray length used. | Legacy results record the 500 m radial cutoff (`legacy-geometry-adapter.js`); the "not a radial cutoff" limitation text is corrected. Cross-backend comparisons state the different ray lengths, or the legacy cap is aligned with the compiled enclosing length. | Needed |
| FR-C3 | Detector acceptance formula is physically justified and documented. | Decide whether the per-pixel count includes the projected-area cos θ factor (currently cos³θ; planar detectors normally need cos⁴θ, ~1.7× at the default field edge, ~2.2× at corners). Either fix (model revision) or document the omission in `CALCULATION_MODELS.md` §10. | Open |
| FR-C4 | No dead or misleading computation in the update path. | `quickMetrics()` no longer traces 81 unused rays per update or computes the unused `12000 × sin(el)^1.7` count. | Needed |
| FR-C5 | Every backend's results are traceable to exact inputs. | Results carry dataset release ID, file hashes where available, backend, model version, sampling and ray-length settings. | Needed |

## P. Plans (deployment schemes)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-P1 | Save/load a complete plan. | Versioned JSON schema with migrations: full dataset release ID, stations, poses, device, response, environment/scenario, sampling, model version. Round-trip test: load → save gives an identical file. | Needed |
| FR-P2 | Plans shareable without a server. | Plan files are diff-friendly and usable from git or a shared folder. | Needed |
| FR-P3 | Team plan sharing with concurrent editing, permissions and audit trail. | Only when server trigger T1 is met (ADR-001). | Deferred |

## S. Scans and ranking

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-S1 | Station/pose scan with progress and cancellation. | Scan definition stored in the plan format; cancellable; uses the same calculation core as single-point evaluation. | Needed |
| FR-S2 | Constraint filtering and relative ranking. | Engineering accessibility, physical observability and safety/construction conditions recorded as separate dimensions. | Needed |
| FR-S3 | Robustness against position/pose/scenario perturbations. | Perturbation ranges declared in the scan definition; results report spread, not only the nominal value. | Needed |
| FR-S4 | Workstation-scale performance. | A 20 stations × 36 azimuths × 7 elevations × 4 scenarios scan finishes in minutes on one workstation, via direction-map reuse and coarse-to-fine search (ADR-005). Benchmark tracked against the 2026-10-09 baseline (~10.6k rays/s/core). | Needed |
| FR-S5 | Headless batch runner. | Node CLI: reads a plan/scan file, uses all cores, writes versioned results the app can load. Same modules as the browser. | Needed |
| FR-S6 | Distributed or shared scan execution. | Only when server trigger T2 is met. | Deferred |

## M. Multi-station and reporting

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-M1 | Joint multi-station evaluation. | Complementarity/redundancy analysis across stations of one plan. | Needed |
| FR-M2 | Result data and plan reports. | Report generated from stored results, including limitations and model versions; animation only on real demand. | Needed |

## G. Geant4 integration

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-G1 | Export a Geant4 job package. | Geometry (e.g. GDML), detector, pose, macro, physics list, seed, manifest with dataset hash and model version (ADR-007). | Needed (later) |
| FR-G2 | Import Geant4 results for comparison with the fast model. | Imported results linked to their job manifest; side-by-side with fast-model projection. | Needed (later) |
| FR-G3 | Automated Geant4 job queue. | Only when server trigger T3 is met. | Deferred |

## Q. Quality, tooling and hygiene

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-Q1 | One test command. | `package.json` with `npm test` running all `tests/*.test.mjs` and the fast checks; README updated. | Needed |
| FR-Q2 | Readable source. | Prettier-formatted modules and CSS in a behaviour-free commit. | Needed |
| FR-Q3 | Static type checking. | `tsc --noEmit --checkJs` passes on pure modules; branded point/direction/frame types (ADR-003). | Needed |
| FR-Q4 | Safe rendering of user text. | Station names and other user/imported text rendered with `textContent`, not `innerHTML`. | Needed |
| FR-Q5 | Azimuth input wraps. | −10° → 350°, 360° → 0° (not clamped to 0/359). | Needed |
| FR-Q6 | No stale data files. | Unused `dist/data/dam_spec.json` and `dist/data/dam_spec.schema.json` (old v0.1.0) removed or clearly marked; README corrected. | Needed |
| FR-Q7 | Dev dependencies documented. | `manifold3d` (Python) listed for `check-interface-artifacts.mjs`; `jsonschema` deprecation (`RefResolver`) addressed. | Needed |

## A. Access and security

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-A1 | Access control for sensitive geometry. | Depends on data owner's answer (OQ-1). If required: authenticated hosting before further public deployment. | Open |

## Change log

- 2026-10-10: Initial requirements from review discussion.
