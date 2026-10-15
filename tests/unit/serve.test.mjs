import test from 'node:test';
import assert from 'node:assert/strict';
import { contentType, cacheHeaders } from '../../scripts/serve.mjs';

// Local server: correct types, and every file revalidated so an update is never hidden by the cache.
test('content types for the application and dataset files', () => {
  assert.equal(contentType('/modules/app.js'), 'text/javascript; charset=utf-8');
  assert.equal(contentType('/index.html'), 'text/html; charset=utf-8');
  assert.equal(contentType('/style.css'), 'text/css; charset=utf-8');
  assert.equal(contentType('/datasets/registry.json'), 'application/json; charset=utf-8');
  assert.equal(contentType('/x/scene.glb'), 'model/gltf-binary');
  assert.equal(contentType('/x/terrain.f32'), 'application/octet-stream');
});

test('responses must be revalidated; an unchanged file answers 304', () => {
  const stat = { size: 1234, mtimeMs: 1700000000000.5 };
  const fresh = cacheHeaders(stat, undefined);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.headers['Cache-Control'], 'no-cache');
  assert.match(fresh.headers.ETag, /^W\/".+"$/);
  assert.equal(cacheHeaders(stat, fresh.headers.ETag).status, 304);
  assert.equal(cacheHeaders({ ...stat, size: 1235 }, fresh.headers.ETag).status, 200);
});
