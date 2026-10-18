import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importSpecifiers, moduleClosure, preloadedModules } from '../../scripts/module-preload.mjs';

// The page preloads exactly the modules its entry reaches, so the browser fetches them in parallel instead of one
// import level at a time (scripts/module-preload.mjs; run it with --write after changing imports).
test('import statements are found, comments and code are not', () => {
  assert.deepEqual(importSpecifiers(`import a from './a.js';\nimport {\n  b,\n  c\n} from "three";\n// import x from './no.js';\n/* import y from './no.js' */\nexport { d } from './d.js';\nimport './side.js';\nconst view = await import('./view.js');\nconst s = 'import z from "./no.js"';\nexport function f() { return x ? '' : y; }`),
    ['./a.js', 'three', './d.js', './side.js', './view.js']);
});

test('dist/index.html preloads exactly the static import closure of app.js', async () => {
  const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
  const closure = await moduleClosure(new URL('../../dist/index.html', import.meta.url).pathname, 'app.js');
  assert.ok(closure.includes('./vendor/three/three.core.js'));
  assert.deepEqual(preloadedModules(html), closure, 'stale modulepreload list: run node scripts/module-preload.mjs --write');
  // Preloads must follow the import map, or bare specifiers inside them would not resolve.
  assert.ok(html.indexOf('<script type="importmap">') < html.indexOf('rel="modulepreload"'));
});
