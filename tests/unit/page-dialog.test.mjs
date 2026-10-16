import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName } from '../../dist/modules/page-dialog.js';

test('a cancelled name stays cancelled', () => {
  assert.equal(normalizeName(null, '组合 1'), null);
});

test('names are trimmed, empty names fall back, long names are cut', () => {
  assert.equal(normalizeName('  方案 A  ', 'x'), '方案 A');
  assert.equal(normalizeName('   ', '视角 2'), '视角 2');
  assert.equal(normalizeName('abcdef', 'x', 3), 'abc');
  assert.equal(normalizeName('a'.repeat(300), 'x').length, 200);
});
