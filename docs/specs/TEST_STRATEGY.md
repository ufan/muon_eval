# Test strategy

A layered, lightweight test-driven approach (ADR-023). Tests are written first where that is cheap and catches real mistakes, each behaviour is tested once at the lowest layer that can show it, and slow layers run only when their inputs change or before a merge or release.

Last updated: 2026-10-10

## 1. Layers

| Layer | What it proves | Inputs | Speed budget | Runs |
|---|---|---|---|---|
| L0 Static | Syntax, whitespace, (later) types and doc links | Source only | seconds | Every commit |
| L1 Unit | Pure functions behave as specified | Synthetic values; no dataset I/O, no recorded fixtures | < 1 s per file, < 10 s total | Every commit; the TDD loop |
| L2 Contract | Formats, frozen baselines and analytic oracles stay exact | Recorded fixtures, analytic geometry, schemas | < 5 s per file | Every commit |
| L3 Data conformance | A dataset release is valid and its geometry agrees with its baselines | Real releases in `datasets/` | minutes | When `datasets/`, geometry loaders or tracers change; before release |
| L4 Integration | Modules wired together give the same result end to end, without a browser | Real releases | < 20 s per file, < 60 s suite (parallel) | Before push/merge |
| L5 Browser acceptance | The app works in a real browser: loading, interaction, cancellation, layouts, exports | Served app + Playwright/Chromium | minutes | Before merge of UI/flow changes; before release |
| L6 Performance | Throughput and latency against budgets and baselines | Benchmarks | minutes | On demand, when performance work is done; informational unless a budget in PROJECTION_VALIDATION applies |

Layout and visual checks (desktop and narrow screens, camera aspect after resize, `AGENTS.md`) are covered by L5 screenshots plus a manual look; screenshots alone are never acceptance for geometry or physics.

## 2. Current tests by layer

Measured 2026-10-10 (single file, sequential). The full Node suite takes about 32 s in parallel.

| Layer | Files |
|---|---|
| L0 | `node --check` on every entry point; `git diff --check` |
| L1 | `muon-response`, `detector-projection`, `main-architecture`, `feature-catalogue`, `display-profile`, `recognition-layers`, `feature-layers`, `precision-contours`, `application-selection`, `serve`, `plan-format`, `plan-store`, `plan-runner`, `workspace-format`, `workspace-store`, `workspace-state`, `workspace-import`, `candidate-results`, `pattern-differences`, `station-placement`, `coverage-map`, `slice-plane`, `target-samples`, `overview-table`, `screen-pick`, `projection-tiles`, `demo-snapshot`, `webm-muxer`, `contribution-contours`, `contribution-view`, `demand-render`, `numeric-pattern-client`, `pattern-capture-store`, `pattern-input-chunks`, `pattern-timing`, `projection-color-scale`, `projection-pattern-contract`, `structural-reference-projection`, `structural-reference-qualification` (each ≈ 0.1–0.3 s) |
| L2 | `calculation-core` (frozen formulas), `projection-pattern-fixtures` (analytic oracle, ≈ 4 s), `contour-benchmark`, `derived-interface-artifact`, `interface-csg`, `structural-reference-benchmark`, `structural-reference-candidates` (recorded native evidence) |
| L3 | `scripts/check-dataset-release.py`, `scripts/check-geometry-conformance.mjs`, `scripts/check-semantic-mapping.mjs`, `scripts/check-interface-artifacts.mjs` (needs `manifold3d`); tests `plan-format` and `workspace-format` (schema and validator agree, via Python `jsonschema`), `dataset-v07`, `feature-catalogue`, `display-profile`, `compiled-mesh`, `semantic-mapping`, `structural-reference-domain` |
| L4 | `main-compiled-backend`, `compiled-assessment`, `projection-pattern-fields`, `material-projection`, `material-envelopes`, `material-contributions`, `contribution-export`, `pattern-interpretation`, `plan-runner` (CLI equals in-app evaluation, any thread count), `candidate-results` (compact form, shared keys), `station-placement` (cavity placement on the real model), `slice-plane` (section mask through a gallery), `target-samples` (points inside each recognition item) |
| L5 | `scripts/check-main-compiled-app.mjs`, `scripts/check-compiled-preview.mjs` (finite-model step needs derived assets) |
| L6 | `scripts/benchmark-*.mjs` |

Some L4 files test behaviour that could be shown at L1/L2 with synthetic inputs. Move such cases down when touching those files, keeping one real-dataset check per module at L4.

## 3. When to write a test first

Test first:

- **Pure calculation functions** (coordinates, directions, flux, acceptance, tracing rules, contour extraction, metrics): write the failing L1 test from the spec, then the code.
- **Every bug fix**: first a test that reproduces the bug and fails, at the lowest layer that shows it. Example: FR-C1 started with an L1 test (`tests/unit/muon-response.test.mjs`) showing that a projection pixel's count changed with the pixels evaluated before it.
- **Data formats and contracts** (plan/scan/result schemas, exports): write the round-trip and rejection tests (L2) with the schema.
- **Domain invariants** in [DOMAIN_MODEL.md](DOMAIN_MODEL.md) §4: each invariant has at least one test that would fail if it were broken.

Not test first:

- Views, layout and styling: verify with L5 acceptance and a manual look.
- Exploratory spikes: allowed without tests, but code that is kept gets tests before merge.

## 4. Rules that keep it light

- **One behaviour, one layer.** Test a rule where it lives; higher layers test wiring and one representative end-to-end case, not every branch again.
- **No geometry mocks.** Use the analytic fixtures (`tests/projection-pattern-fixtures.mjs`) or a real release; never a hand-written fake tracer for physics assertions.
- **Golden baselines change only deliberately.** Updating a frozen baseline is a model or data revision: bump the version and say so in the commit message (`AGENTS.md`).
- **Deterministic.** Fixed seeds, no wall-clock or ordering dependence; a flaky test is fixed or removed, never retried.
- **Speed budgets are enforced by layer.** A test that outgrows its layer's budget moves up a layer or gets smaller inputs.
- **Generic tests stay subject-neutral.** Dataset-specific expectations (e.g. Zhouning counts) belong in L3/L4 tests named for the dataset; L1/L2 use synthetic or analytic inputs (FR-K1).

## 5. Running

Tests live in layer directories: `tests/unit`, `tests/contract`, `tests/data`, `tests/integration`. Shared helpers (`tests/*-fixtures.mjs`) and recorded evidence (`tests/fixtures/`) stay at `tests/` because scripts use them too.

| Command | Layers | Use | Measured 2026-10-10 |
|---|---|---|---|
| `npm test` | L0–L2 | Every commit | ~5 s |
| `npm run test:data` | L3 | After data/geometry/tracer changes | ~11 s |
| `npm run test:integration` | L4 | Before push | ~22 s |
| `npm run test:browser` | L5 (main app) | Before merging UI/flow changes; before release | ~60 s |
| `npm run test:browser:preview` | L5 (standalone preview; needs derived assets) | When the preview changes | — |
| `npm run test:all` | L0–L5 | Before release | |

Single layers: `npm run test:unit`, `npm run test:contract`. L0 is `npm run check` (`scripts/check-syntax.mjs` runs `node --check` on all entry points, scripts and tests, then `git diff --check`). Browser tests take `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` from the environment when Playwright is not resolvable as a package. Tests run locally; there is no continuous integration (OQ-8).

## 6. Gaps

- No type checking at L0 yet (FR-Q3).
- Some L4 files contain cases that belong at L1/L2 (§2); move them down when touching those files.
