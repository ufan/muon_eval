# Datasets

Versioned dataset releases, kept outside the application source (ADR-018). Each dataset has a `kind` (currently `dam`) and one directory per release:

```text
datasets/
├─ registry.json                  registry of releases; base_url is relative to this file
└─ <dataset-id>/
   ├─ README.md                   dataset spec: frames, transforms, geometry rules
   └─ <release>/                  spec JSON, schemas, compiled GLB/terrain, conformance baselines
```

Serving: the application fetches `./datasets/registry.json`.

- The development servers in the check scripts and tests (`scripts/static-paths.mjs`) map `/datasets/` to this directory.
- Docker copies this directory into the web root.
- Any other static server (including a local one) that serves only `dist/` needs `node scripts/sync-datasets.mjs` first; it copies the registry and every registered release into `dist/datasets/` (gitignored).

Validation: `python3 scripts/check-dataset-release.py`, `node scripts/check-geometry-conformance.mjs`, `node scripts/check-semantic-mapping.mjs`.

| Dataset | Kind | Releases | Spec |
|---|---|---|---|
| `zhouning-lower-reservoir-dam` | dam | 0.6.1, 0.6.2, 0.6.2+schema0.7.0 | [README](zhouning-lower-reservoir-dam/README.md) |
