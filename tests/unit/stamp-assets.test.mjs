import test from 'node:test';
import assert from 'node:assert/strict';
import { stampHtml } from '../../scripts/stamp-assets.mjs';

// Content stamps so browsers fetch changed files after an update (static site, no build).
const versions = new Map([
  ['app.js', 'a1'], ['style.css', 'c1'], ['modules/x.js', 'm1'], ['modules/y.js', 'm2'],
  ['vendor/three/three.module.js', 't1'], ['vendor/three/three.core.js', 't2'], ['vendor/three/addons/controls/OrbitControls.js', 'o1']
]);
const page = '<head><link rel="stylesheet" href="./style.css?v=11"><script type="importmap">{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/three/addons/"}}</script></head><body><script type="module" src="./app.js?v=49"></script></body>';

test('every script file is mapped to its stamped URL; bare and relative names share one URL', () => {
  const html = stampHtml(page, versions);
  const map = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]).imports;
  assert.equal(map['./modules/x.js'], './modules/x.js?v=m1');
  assert.equal(map.three, './vendor/three/three.module.js?v=t1');
  assert.equal(map['./vendor/three/three.module.js'], map.three);
  assert.equal(map['three/addons/controls/OrbitControls.js'], './vendor/three/addons/controls/OrbitControls.js?v=o1');
  assert.equal(map['./vendor/three/three.core.js'], './vendor/three/three.core.js?v=t2');
  assert.match(html, /href="\.\/style\.css\?v=c1"/);
  assert.match(html, /src="\.\/app\.js\?v=a1"/);
});

test('stamping is idempotent and fails closed on unknown files', () => {
  const once = stampHtml(page, versions);
  assert.equal(stampHtml(once, versions), once);
  assert.throws(() => stampHtml(page.replace('style.css', 'missing.css'), versions), /missing\.css/);
});
