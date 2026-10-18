#!/usr/bin/env bash
# Build a complete static release without changing the checkout or live service.
set -euo pipefail
if [[ ${1:-} == --help ]]; then
  echo 'Usage: bash scripts/package-deploy.sh [NEW_ARCHIVE.tar.gz]'
  echo 'PYTHON selects Python 3.9-3.12; requires Node >=22, pip, tar and network access.'
  exit 0
fi
[[ $# -le 1 ]] || { echo 'Too many arguments' >&2; exit 1; }
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
python=${PYTHON:-python3}
for tool in node tar "$python"; do command -v "$tool" >/dev/null; done
node -e 'if (+process.versions.node.split(".")[0] < 22) throw Error("Node >=22 required")'
"$python" -c 'import sys; assert (3,9) <= sys.version_info[:2] <= (3,12), "Use Python 3.9-3.12 for NumPy 1.26.4 wheels"'
"$python" -m pip --version >/dev/null
output=$("$python" -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "${1:-$repo/site-deploy-$(date +%Y%m%d-%H%M%S).tar.gz}")
[[ ! -e "$output" && ! -L "$output" ]] || { echo "Refusing to overwrite: $output" >&2; exit 1; }
[[ -d $(dirname -- "$output") && -w $(dirname -- "$output") ]] || { echo 'Output parent must exist and be writable' >&2; exit 1; }
# Publishing inside an input directory would contaminate future packages.
case "$output" in "$repo/dist/"*|"$repo/datasets/"*|"$repo/scripts/"*|"$repo/tests/"*) echo 'Choose an archive location outside input directories' >&2; exit 1;; esac
for input in dist datasets scripts tests package.json; do [[ -e "$repo/$input" ]] || { echo "Missing: $input" >&2; exit 1; }; done
work=$(mktemp -d "${TMPDIR:-/tmp}/muon-deploy.XXXXXX")
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
mkdir "$work/repo"
for input in dist datasets scripts tests package.json; do cp -R -- "$repo/$input" "$work/repo/"; done
cd "$work/repo"
# Discard only staging copies of generated assets; all output must be fresh.
rm -rf -- dist/datasets dist/data/derived-interfaces
printf '%s\n' 'Installing isolated, pinned native tooling...'
"$python" -m pip install --only-binary=:all: --target "$work/packages" manifold3d==3.5.4 numpy==1.26.4
printf '%s\n' 'Generating artifacts and checking shared-ray consistency...'
PYTHONPATH="$work/packages" PYTHONNOUSERSITE=1 node scripts/check-interface-artifacts.mjs --python "$(command -v "$python")" --output-dir "$work/artifacts"
node scripts/package-interface-assets.mjs "$work/artifacts"
node scripts/sync-datasets.mjs
node --check dist/app.js
node --input-type=module <<'JS'
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const root = 'dist/data/derived-interfaces/';
const m = JSON.parse(await readFile(root + 'manifest.json'));
if (m.version !== '1.0.0' || m.scope !== 'finite-model-not-certified-physical' || m.entries.length !== 4 ||
    ['low', 'mid', 'high', 'extreme'].some(id => !m.entries.some(e => e.scenarioId === id))) throw Error('Incomplete interface manifest');
for (const e of m.entries) {
  const b = await readFile(root + e.file);
  if (b.length !== e.byteLength || createHash('sha256').update(b).digest('hex') !== e.compressedSha256) throw Error('Corrupt packaged artifact');
  if (JSON.parse(gunzipSync(b)).contentSha256 !== e.contentSha256) throw Error('Content pin mismatch');
}
await access('dist/index.html');
const registry = JSON.parse(await readFile('dist/datasets/registry.json'));
for (const entry of Object.values(registry.datasets)) {
  const base = new URL(entry.base_url, new URL('file://' + process.cwd() + '/dist/datasets/'));
  for (const [name, expected] of Object.entries(entry.integrity ?? {})) {
    const b = await readFile(new URL(name, base));
    if (createHash('sha256').update(b).digest('hex') !== expected) throw Error('Dataset integrity failure: ' + name);
  }
}
console.log('Packaged interfaces and dataset integrity verified.');
JS
# Ready-made gzip copies for nginx gzip_static (nginx.conf): written after verification, from the verified files.
node scripts/precompress.mjs dist
# Create and inspect the archive before publishing it. Exclusive creation avoids
# overwriting another release even if the destination appeared during generation.
tar -czf "$work/release.tar.gz" dist
tar -tzf "$work/release.tar.gz" >/dev/null
"$python" - "$work/release.tar.gz" "$output" <<'PY'
import shutil, sys
with open(sys.argv[1], 'rb') as source, open(sys.argv[2], 'xb') as target:
    try:
        shutil.copyfileobj(source, target)
    except BaseException:
        import os
        os.unlink(sys.argv[2])
        raise
PY
printf 'Deployable archive: %s\n' "$output"
printf '%s\n' 'Archive contains dist/. Extract into a new server release directory; no service was changed.'
