import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadDataset } from '../dist/modules/dataset-loader.js';
import { registryUrl } from './static-paths.mjs';

export { registryUrl };
export const sha256 = bytes => createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
export const readJson = async url => JSON.parse(await readFile(url, 'utf8'));
export async function loadRegisteredDataset(id = null) {
  return loadDataset(id, registryUrl.href, {
    fetch: async url => {
      try { return new Response(await readFile(url)); }
      catch (error) { if (error.code === 'ENOENT') return new Response(null, { status: 404 }); throw error; }
    },
    digest: sha256
  });
}
