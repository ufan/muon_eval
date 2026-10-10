# Specifications

Modular, detailed specifications of the platform. The code must match them: a change to formulas, data formats, contracts, module boundaries or tolerances updates the relevant spec in the same commit, with a version bump where the spec defines one.

The guideline documents sit one level up in [`docs/`](../): [architecture decisions](../ARCHITECTURE_DECISIONS.md), [feature requirements](../FEATURE_REQUIREMENTS.md), [roadmap](../ROADMAP.md) and [implementation priority](../IMPLEMENTATION_PRIORITY.md). Specs contain no task lists; open work is tracked only in those files. Usage and operation guides are in [`../guides/`](../guides/).

Last updated: 2026-10-10

## Index

| Module | Spec | Language | Contents |
|---|---|---|---|
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | 中文 | Current module layout, data flow, geometry backends and integration boundaries |
| Architecture | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) | 中文 | Module ownership and forbidden dependencies; enforced by `tests/main-architecture.test.mjs` |
| Calculation | [CALCULATION_MODEL.md](CALCULATION_MODEL.md) | 中文 | Calculation chain, formulas and parameters of `legacy-quick-response@1.0.0` and its compiled adapter |
| Geometry | [GEOMETRY_REFERENCE_CONTRACT.md](GEOMETRY_REFERENCE_CONTRACT.md) | English | Reference-line meanings, qualification, projection clipping, material–air boundary construction, derived artifact v1.0.0, shared-ray gate |
| Geometry | [GEOMETRY_REFERENCES.md](GEOMETRY_REFERENCES.md) | English | Supporting record for the contract: decision, library comparison, evidence, real-release audit, reproduction |
| Projection | [PROJECTION_DATA.md](PROJECTION_DATA.md) | English | Calculation identity, numerical fields, overlays, material contributions, contour extraction, graph mapping, contour export v1.0.0 |
| Projection | [PROJECTION_VALIDATION.md](PROJECTION_VALIDATION.md) | English | Numerical gates, feature-scale policy, performance budgets, analytical fixtures |
| Datasets | [datasets/zhouning-lower-reservoir-dam.md](datasets/zhouning-lower-reservoir-dam.md) | 中文 | Zhouning frames and transforms, geometry types, display and calculation rules, change checklist |

`specs/datasets/` holds the *description* of each dataset (frames, transforms, geometry rules); the data itself is in `dist/data/datasets/`. ADR-018 proposes moving both into one top-level `datasets/<id>/<release>/` directory so each dataset and its description are versioned together.

Machine-readable specs live with the data: dataset schemas under `dist/data/datasets/<id>/<version>/` (e.g. `schema/dam-dataset.schema.json`) and the registry `dist/data/datasets.json`.

## Not yet extracted (candidates)

- `CONTEXT.md` §3–§7: platform geometry semantics, coordinate/direction semantics, projection terms and the minimum reproducibility record. They are normative but `AGENTS.md` makes `CONTEXT.md` required reading, so they stay there for now.
- `AGENTS.md` "新增坝体数据集" checklist: could become a dataset onboarding spec once a second dataset exists.
- Plan / scan / result schemas (FR-P1): new specs, to be written here when designed.
