// Content stamps for the static pages (no build step): every script and stylesheet
// is referenced as `file?v=<content hash>`, so browsers fetch a changed file after an
// update instead of reusing a cached copy. Module imports inside the page are
// stamped through the page's import map; dedicated workers do not use the page's
// import map, so modules loaded only inside a worker keep plain URLs.
//   node scripts/stamp-assets.mjs           rewrite the pages
//   node scripts/stamp-assets.mjs --check   fail if a stamp is stale (npm run check)
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const PAGES = ['index.html', 'geometry-preview.html'];
const SKIP = new Set(['datasets', 'data']); // dataset releases are versioned and hashed separately

export async function assetVersions(root) {
  const versions = new Map();
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    const path = join(entry.parentPath ?? entry.path, entry.name), rel = relative(root, path).split(sep).join('/');
    if (!entry.isFile() || !/\.(js|css)$/.test(entry.name) || SKIP.has(rel.split('/')[0])) continue;
    versions.set(rel, createHash('sha256').update(await readFile(path)).digest('hex').slice(0, 10));
  }
  return new Map([...versions].sort(([a], [b]) => a.localeCompare(b)));
}

const stamped = (versions, path) => {
  const clean = path.replace(/^\.\//, '').replace(/\?.*$/, '');
  if (!versions.has(clean)) throw new Error(`No stamp for ${path}: file not found in dist`);
  return `./${clean}?v=${versions.get(clean)}`;
};

export function stampHtml(html, versions) {
  // Stylesheets and the entry script.
  html = html.replace(/(href|src)="(\.\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g, (_, attr, path) => `${attr}="${stamped(versions, path)}"`);
  // Import map: bare names first (their prefixes expanded to each file), then every
  // script by its path, so bare and relative imports of a file share one URL.
  return html.replace(/<script type="importmap">(.*?)<\/script>/s, (_, json) => {
    const imports = {}, previous = JSON.parse(json).imports;
    for (const [key, value] of Object.entries(previous)) {
      if (key.startsWith('./')) continue;
      if (key.endsWith('/')) {
        imports[key] = value;
        const prefix = value.replace(/^\.\//, '');
        for (const path of versions.keys()) if (path.startsWith(prefix) && path.endsWith('.js')) imports[key + path.slice(prefix.length)] = stamped(versions, path);
      } else imports[key] = stamped(versions, value);
    }
    for (const path of versions.keys()) if (path.endsWith('.js')) imports[`./${path}`] = stamped(versions, path);
    return `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../dist/', import.meta.url)), check = process.argv.includes('--check');
  const versions = await assetVersions(root);
  const stale = [];
  for (const page of PAGES) {
    const path = join(root, page), html = await readFile(path, 'utf8'), next = stampHtml(html, versions);
    if (next === html) continue;
    if (check) stale.push(page); else await writeFile(path, next);
  }
  if (stale.length) { console.error(`Stale asset stamps in ${stale.join(', ')}: run npm run stamp`); process.exitCode = 1; }
  else console.log(`stamps: ${versions.size} files, ${PAGES.length} pages ${check ? 'current' : 'written'}`);
}
