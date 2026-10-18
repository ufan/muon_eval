import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, mkdir, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { precompress } from '../../scripts/precompress.mjs';

// Build-time .gz copies for nginx gzip_static (deploy/, docs/guides/DEPLOYMENT.md): same bytes after decompression,
// only for compressible files of the served types, and a stale copy is replaced.
test('compressible files of served types get a .gz copy that decompresses to the original', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'precompress-')), text = 'const value = 1;\n'.repeat(500);
  await mkdir(join(dir, 'modules'));
  await writeFile(join(dir, 'modules', 'a.js'), text);
  await writeFile(join(dir, 'tiny.css'), 'a{}');
  await writeFile(join(dir, 'mesh.glb'), Buffer.alloc(8000, 7));
  await writeFile(join(dir, 'noise.f32'), randomBytes(4000));
  await writeFile(join(dir, 'photo.png'), Buffer.alloc(8000, 1));
  await writeFile(join(dir, 'modules', 'a.js.gz'), 'stale');
  const written = await precompress(dir);
  assert.deepEqual(written.map(f => f.replace(dir, '')).sort(), ['/mesh.glb.gz', '/modules/a.js.gz']);
  assert.equal(gunzipSync(await readFile(join(dir, 'modules', 'a.js.gz'))).toString(), text);
  assert.ok((await stat(join(dir, 'mesh.glb.gz'))).size < 200);
  const names = (await readdir(dir)).sort();
  assert.ok(!names.includes('tiny.css.gz') && !names.includes('noise.f32.gz') && !names.includes('photo.png.gz'));
});
