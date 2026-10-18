#!/usr/bin/env node
// Keeps the <link rel="modulepreload"> list of a page equal to the static import closure of its entry module, so the
// browser fetches every module at once instead of discovering them one import level at a time (each level costs a
// round trip; on high-latency hosts the chain dominated the first load). Run with --write after changing imports;
// tests/unit/module-preload.test.mjs fails when the list is stale.
//   node scripts/module-preload.mjs [--write] [page.html=dist/index.html] [entry=app.js]
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const START = '<!-- modulepreload:start -->', END = '<!-- modulepreload:end -->';

// Imports, re-exports and literal dynamic imports of a module source, comments removed (examples in comments are not imports).
export function importSpecifiers(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // A statement starting a line: `import 'x'`, `import … from 'x'` or `export … from 'x'` (bindings may span lines).
  const statements = [...code.matchAll(/^[ \t]*(?:import\s*['"]([^'"]+)['"]|(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"])/gm)].map(m => m[1] ?? m[2]);
  // Dynamic imports with a literal path (the entry imports its view modules this way).
  return [...statements, ...[...code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1])];
}

const importMapOf = html => JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{"imports":{}}').imports;
function resolveSpecifier(specifier, fromFile, root, imports) {
  if (specifier.startsWith('.')) return resolve(dirname(fromFile), specifier);
  const key = Object.keys(imports).filter(k => k === specifier || (k.endsWith('/') && specifier.startsWith(k))).sort((a, b) => b.length - a.length)[0];
  if (!key) throw new Error(`Unmapped import ${specifier} in ${fromFile}`);
  return resolve(root, imports[key] + specifier.slice(key.length));
}

// Every module the entry reaches through its imports, as page-relative paths in a stable order.
export async function moduleClosure(page = 'dist/index.html', entry = 'app.js') {
  const pagePath = resolve(page), root = dirname(pagePath), imports = importMapOf(await readFile(pagePath, 'utf8'));
  const seen = new Set(), queue = [resolve(root, entry)];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importSpecifiers(await readFile(file, 'utf8'))) queue.push(resolveSpecifier(specifier, file, root, imports));
  }
  return [...seen].map(file => './' + relative(root, file).split('\\').join('/')).sort();
}

export const preloadBlock = modules => `${START}${modules.map(href => `<link rel="modulepreload" href="${href}">`).join('')}${END}`;
export function preloadedModules(html) {
  const block = html.slice(html.indexOf(START), html.indexOf(END));
  return [...block.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m => m[1]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), write = args.includes('--write'), [page = 'dist/index.html', entry = 'app.js'] = args.filter(a => a !== '--write');
  const modules = await moduleClosure(page, entry), html = await readFile(page, 'utf8');
  if (!write) { console.log(modules.join('\n')); process.exit(0); }
  if (!html.includes(START)) throw new Error(`${page} has no ${START} marker`);
  await writeFile(page, html.slice(0, html.indexOf(START)) + preloadBlock(modules) + html.slice(html.indexOf(END) + END.length));
  console.log(`${page}: ${modules.length} modules preloaded`);
}
