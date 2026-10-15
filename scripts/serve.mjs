// Local static server for development (no dependencies): the application from dist/
// and dataset releases from datasets/ at /datasets/ (ADR-018), so no dataset sync is
// needed. Every response carries `Cache-Control: no-cache`: the browser keeps its
// copy but revalidates it, so an updated module is never hidden by the cache.
//   node scripts/serve.mjs [--port 8765] [--host 127.0.0.1]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStaticPath } from './static-paths.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm'
};
export const contentType = path => TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';

// Weak validator from size and modification time; 304 when the browser's copy is current.
export function cacheHeaders({ size, mtimeMs }, ifNoneMatch) {
  const etag = `W/"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
  return { status: ifNoneMatch === etag ? 304 : 200, headers: { 'Cache-Control': 'no-cache', ETag: etag } };
}

export function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), file = resolveStaticPath(path);
      if (!file) { response.writeHead(403).end(); return; }
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404).end(); return; }
      const { status, headers } = cacheHeaders(info, request.headers['if-none-match']);
      response.writeHead(status, { ...headers, 'Content-Type': contentType(file.pathname), 'X-Content-Type-Options': 'nosniff' });
      response.end(status === 304 || request.method === 'HEAD' ? undefined : await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
  const port = Number(option('--port', 8765)), host = option('--host', '127.0.0.1');
  createStaticServer().listen(port, host, () => console.log(`Serving dist/ and datasets/ at http://${host}:${port}/ (Ctrl+C to stop)`));
}
