# Three.js (vendored)

Three.js r186 (`REVISION = '186'`), MIT licence (`LICENSE.txt`), from the official `build/three.module.js` and `build/three.core.js`.

The two files are minified (esbuild 0.28 `--minify --format=esm --legal-comments=inline`, no bundling, licence header kept) to cut the first download from 2.1 MB to 0.77 MB; the code is otherwise unchanged and `three.module.js` still imports `./three.core.js`. The addons under `addons/` are unminified copies from the same release. To update: take the new release's two build files, minify them the same way, and run the main browser test.
