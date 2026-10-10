// Copies the dataset registry and every registered release from datasets/ into
// dist/datasets/ for static hosts that can only publish dist/ (ADR-018).
// The check scripts, tests and Docker read datasets/ directly instead.
import { cp, rm, readFile, mkdir } from 'node:fs/promises';
import { datasetsRoot, distRoot, registryUrl } from './static-paths.mjs';

const target = new URL('datasets/', distRoot);
const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(registryUrl, new URL('registry.json', target));
for (const [id, entry] of Object.entries(registry.datasets)) {
  const relative = entry.base_url.replace(/^\.\//, '');
  await cp(new URL(relative, datasetsRoot), new URL(relative, target), { recursive: true });
  console.log(`synced ${id}`);
}
