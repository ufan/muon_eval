// Reproducible offline preview assets, separate from immutable dataset releases.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Usage: node scripts/package-interface-assets.mjs /path/to/verified/artifacts');
const evidence = JSON.parse(await readFile(new URL('./fixtures/interface-artifact-pins.json', import.meta.url)));
const manifest = JSON.parse(await readFile(join(resolve(sourceDir), 'manifest.json')));
const target = new URL('../dist/data/derived-interfaces/', import.meta.url);
await mkdir(target, { recursive: true });
const entries = [];
for (const row of manifest.scenarios) {
  const pin = evidence.scenarios.find(e => e.id === row.scenarioId);
  if (!pin || pin.fileSha256 !== row.fileSha256 || pin.contentSha256 !== row.contentSha256) throw new Error('Durable evidence pin mismatch');
  if (!row.rayChecks.passed || !row.inputHashesUnchanged) throw new Error('Source evidence did not pass');
  const bytes = await readFile(join(resolve(sourceDir), row.artifact));
  const hash = v => createHash('sha256').update(v).digest('hex');
  if (hash(bytes) !== row.fileSha256) throw new Error('Evidence/file hash mismatch');
  const document = JSON.parse(bytes), compressed = gzipSync(bytes, { level: 9 });
  if (document.contentSha256 !== row.contentSha256) throw new Error('Artifact content pin mismatch');
  const file = `${row.scenarioId}.interface.v1.json.gz`;
  await writeFile(new URL(file, target), compressed);
  entries.push({ releaseId: document.source.identity.release_id, scenarioId: row.scenarioId, file,
    compressedSha256: hash(compressed), byteLength: compressed.length, contentSha256: row.contentSha256,
    sourceCaseId: document.source.sourceCaseId, domainPolicy: document.source.domainPolicy });
}
await writeFile(new URL('manifest.json', target), JSON.stringify({ version: '1.0.0', scope: 'finite-model-not-certified-physical', entries }, null, 2));
console.log(JSON.stringify(entries.map(({ scenarioId, byteLength }) => ({ scenarioId, byteLength }))));
