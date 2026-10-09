# Offline contour generator

Pinned `d3-contour@4.0.2`, contour-generator entry only, bundled with the used functions of `d3-array@3.2.4`. Both ISC licenses are included unmodified. `internmap@2.0.3` is the resolved d3-array dependency; tree shaking removes it from this bundle (its license is retained for provenance). No density-estimation API, DOM, external imports, CDN or runtime installation. This is an intentional offline dependency asset, not a temporary release package.

Source: [d3-contour v4.0.2](https://github.com/d3/d3-contour/tree/v4.0.2), [d3-array v3.2.4](https://github.com/d3/d3-array/tree/v3.2.4). Algorithm source is unchanged; esbuild transforms/concatenates it. Only generated source comments are normalized to relative `node_modules/…` paths, with a version/license pointer prepended.

Bundle: `contours.js`, 10,980 bytes; SHA-256 `5bab3d13d94192dbdde6bb5d55bf16b16457e414d4b0c0b5cefd1736c376f92d`.

Rebuild in a new temporary directory, not the application root:

```sh
contour_build_dir=$(mktemp -d /tmp/muon-contour-build.XXXXXX)
npm install --prefix "$contour_build_dir" --ignore-scripts --no-audit --no-fund --save-exact d3-contour@4.0.2 d3-array@3.2.4 internmap@2.0.3 esbuild@0.25.10
cd "$contour_build_dir"
node node_modules/esbuild/bin/esbuild node_modules/d3-contour/src/contours.js --bundle --format=esm --platform=browser --target=es2020 --outfile=contours.js
```

Prepend the existing one-line version/license pointer, retain the licenses, verify the hash, then update the vendor file through a reviewed patch. esbuild is a temporary development tool only (MIT); no project-wide build or npm dependency is introduced. Benchmark and scientific tests run directly with Node using the checked-in asset.

Adoption scope and hazards: `docs/PROJECTION_DATA.md#numerical-contour-extraction`. This module exports the contour generator as its default export; application entries consume it through the shared contour adapter.
