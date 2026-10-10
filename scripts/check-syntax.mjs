// L0 static check: `node --check` on every JavaScript entry point (docs/specs/TEST_STRATEGY.md).
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function files(dir, pattern) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter(e => e.isFile() && pattern.test(e.name)).map(e => join(e.parentPath ?? e.path, e.name));
}
const targets = ['dist/app.js', ...await files('dist/modules', /\.js$/), ...await files('scripts', /\.mjs$/), ...await files('tests', /\.mjs$/)];
const check = file => new Promise(resolve => {
  const child = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('close', code => resolve({ file, code, stderr }));
});
const failed = (await Promise.all(targets.map(check))).filter(r => r.code !== 0);
for (const { file, stderr } of failed) console.error(`${file}\n${stderr}`);
console.log(`syntax: ${targets.length - failed.length}/${targets.length} files ok`);
if (failed.length) process.exitCode = 1;
