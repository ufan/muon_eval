#!/usr/bin/env node
// Writes gzip copies (`file.gz`, level 9) next to the served text and binary files of a directory, for nginx
// `gzip_static on` (nginx.conf): the server sends the ready-made copy to browsers that accept gzip, with no compression
// work per request. Only compressible files are copied (at least 1 KB and 10 % smaller); stale copies are replaced.
// scripts/package-deploy.sh runs it on the release's dist/. Usage: node scripts/precompress.mjs <dir>
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { gzipSync, constants } from 'node:zlib';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRECOMPRESSED_TYPES = ['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.glb', '.f32'];

export async function precompress(dir, { minBytes = 1024, maxRatio = 0.9 } = {}) {
  const written = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !PRECOMPRESSED_TYPES.includes(extname(entry.name))) continue;
    const file = join(entry.parentPath ?? entry.path, entry.name), bytes = await readFile(file);
    if (bytes.length < minBytes) continue;
    const packed = gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION });
    if (packed.length > bytes.length * maxRatio) continue;
    await writeFile(file + '.gz', packed);
    written.push(file + '.gz');
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !(await stat(dir)).isDirectory()) { console.error('Usage: node scripts/precompress.mjs <dir>'); process.exit(1); }
  const written = await precompress(dir);
  console.log(`${written.length} gzip copies written under ${dir}`);
}
