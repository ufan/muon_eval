# Specifications

Modular, detailed specifications of the platform. The code must match them: a change to formulas, data formats, contracts, module boundaries or tolerances updates the relevant spec in the same commit, with a version bump where the spec defines one.

The guideline documents sit one level up in [`docs/`](../../): [architecture decisions](../ARCHITECTURE_DECISIONS.md), [feature requirements](../FEATURE_REQUIREMENTS.md), [roadmap](../ROADMAP.md) and [implementation priority](../IMPLEMENTATION_PRIORITY.md). Specs contain no task lists; open work is tracked only in those files. Usage and operation guides are in [`../guides/`](../guides/).

Last updated: 2026-10-16

## Index

| Module | Spec | Contents |
|---|---|---|
| Domain | [DOMAIN_MODEL.md](DOMAIN_MODEL.md) | Bounded contexts, entities, identities, invariants, lifecycles; current vs target and gaps |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | Current module layout, data flow, geometry backends and integration boundaries |
| Architecture | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) | Module ownership and forbidden dependencies; enforced by `tests/integration/main-architecture.test.mjs` |
| Calculation | [CALCULATION_MODEL.md](CALCULATION_MODEL.md) | Calculation chain, formulas and parameters of `quick-response@4.0.0` and its compiled adapter |
| Geometry | [GEOMETRY_REFERENCE_CONTRACT.md](GEOMETRY_REFERENCE_CONTRACT.md) | Reference-line meanings, qualification, projection clipping, material–air boundary construction, derived artifact v1.0.0, shared-ray gate |
| Geometry | [GEOMETRY_REFERENCES.md](GEOMETRY_REFERENCES.md) | Supporting record for the contract: decision, library comparison, evidence, real-release audit, reproduction |
| Projection | [PROJECTION_DATA.md](PROJECTION_DATA.md) | Calculation identity, numerical fields, overlays, material contributions, contour extraction, graph mapping, contour export v1.0.0 |
| Plans | [PLAN_FORMAT.md](PLAN_FORMAT.md) | `muography-plan` 1.0.0: members, ranges, canonical text, versions and migration, plan hash; schema in `dist/schemas/` |
| Plans | [WORKSPACE_FORMAT.md](WORKSPACE_FORMAT.md) | Proposed `muography-workspace` 2.0.0 (ADR-033): flat per-release workspace, items and global IDs, selection export, import merge rules, storage, migration from 1.x; schema in `dist/schemas/`, examples in `examples/` |
| Testing | [TEST_STRATEGY.md](TEST_STRATEGY.md) | Test layers L0–L6, budgets, triggers, when to test first, current tests by layer |
| Projection | [PROJECTION_VALIDATION.md](PROJECTION_VALIDATION.md) | Numerical gates, feature-scale policy, performance budgets, analytical fixtures |

Dataset specs live with their data in the top-level [`datasets/`](../../datasets/README.md) directory (ADR-018): each dataset's `README.md` describes its frames, transforms and geometry rules, next to its machine-readable schemas, releases and the registry `datasets/registry.json`.

## Not yet extracted (candidates)

- `CONTEXT.md` §3–§7: platform geometry semantics, coordinate/direction semantics, projection terms and the minimum reproducibility record. They are normative but `AGENTS.md` makes `CONTEXT.md` required reading, so they stay there for now.
- `AGENTS.md` "Adding a dataset" checklist: could become a dataset onboarding spec once a second dataset exists.
- Scan and result schemas: the scan format is designed with the scan work (P5); results keep their own versioned kinds and link to plans (PLAN_FORMAT.md).
