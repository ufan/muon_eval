"""Offline import gate: pinned bytes, source/profile schemas, and artifact contracts.

Requires jsonschema (development only); never resolves schema references over HTTP.
The archive remains authoring/reference material, not a browser dependency.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

import jsonschema

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def check(release_id, archive=None):
    registry = load(ROOT / 'datasets/registry.json')
    entry = registry['datasets'][release_id]
    base = (ROOT / 'datasets' / entry['base_url']).resolve()
    if entry.get('adapter') != 'dam-spec-v07':
        raise ValueError('This import gate requires a native v0.7 release')
    for relative, expected in entry['integrity'].items():
        data = (base / relative).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f'Checksum mismatch: {relative}')
    spec = load(base / entry['spec'])
    manifest = load(base / entry['compiled_manifest'])
    for document in [spec['dataset'], manifest]:
        if document['release_id'] != release_id:
            raise ValueError('Release identity mismatch')
    if manifest['input']['spec_sha256'] != entry['integrity'][entry['spec']]:
        raise ValueError('Compiled manifest refers to a different source spec')
    required = [entry[key] for key in ['spec', 'schema', 'profile', 'artifact_schema',
                                     'deployment_candidates', 'site_conditions', 'detector_models', 'compiled_manifest']]
    required += [entry[name][key] for name in ['terrain_near', 'terrain_far'] for key in ['header', 'data']]
    required += list(entry['conformance'].values())
    required += ['compiled/' + scenario['glb'] for scenario in manifest['scenarios'].values()]
    for relative in required:
        if relative not in entry['integrity'] or not (base / relative).is_file():
            raise ValueError(f'Missing required Web asset or checksum: {relative}')
    for relative in entry['conformance'].values():
        reference = load(base / relative)
        if reference['release_id'] != release_id or reference['spec_sha256'] != entry['integrity'][entry['spec']]:
            raise ValueError('Conformance baseline refers to a different source release')
    schemas = {path.name: load(path) for path in (base / 'schema').glob('*.schema.json')}
    # RefResolver also supports the older jsonschema installed on offline hosts.
    # Only bundled schema names/IDs may resolve; unexpected URLs fail closed.
    store = {key: value for name, value in schemas.items() for key in [name, value.get('$id', name)]}
    def deny_remote(uri):
        raise ValueError(f'External schema resolution is disabled: {uri}')
    for name in [Path(entry['schema']).name, Path(entry['profile']).name]:
        schema = schemas[name]
        resolver = jsonschema.RefResolver(base_uri='', referrer=schema, store=store,
                                         handlers={'http': deny_remote, 'https': deny_remote, 'file': deny_remote})
        jsonschema.Draft202012Validator(schema, resolver=resolver).validate(spec)
    artifact_schema = schemas[Path(entry['artifact_schema']).name]
    artifact_files = {'manifest': entry['compiled_manifest'],
                      'terrainHeader': entry['terrain_near']['header'],
                      'conformancePoints': entry['conformance']['points'],
                      'conformanceRays': entry['conformance']['rays'],
                      'conformanceCheck': 'compiled/conformance_check.json'}
    for definition, relative in artifact_files.items():
        validator = jsonschema.Draft202012Validator({'$schema': artifact_schema['$schema'],
                                                     '$defs': artifact_schema['$defs'],
                                                     '$ref': '#/$defs/' + definition})
        validator.validate(load(base / relative))
    jsonschema.Draft202012Validator({'$defs': artifact_schema['$defs'], '$ref': '#/$defs/terrainHeader'}).validate(load(base / entry['terrain_far']['header']))
    for name, expected in manifest['outputs'].items():
        path = base / 'compiled' / name
        # The web subset intentionally omits GDML; imported files must match.
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Manifest output mismatch: {name}')
    if archive:
        with zipfile.ZipFile(archive) as package:
            prefix = next(name for name in package.namelist() if name.endswith('/CHECKSUMS.sha256')).rsplit('/', 1)[0] + '/'
            checksums = package.read(prefix + 'CHECKSUMS.sha256').decode().splitlines()
            for line in checksums:
                expected, relative = line.split(maxsplit=1)
                relative = relative.lstrip('*')
                if hashlib.sha256(package.read(prefix + relative)).hexdigest() != expected:
                    raise ValueError(f'Archive checksum mismatch: {relative}')
            for relative in entry['integrity']:
                if package.read(prefix + relative) != (base / relative).read_bytes():
                    raise ValueError(f'Import differs from archive: {relative}')
    profile_entry = entry.get('display_profile')
    if profile_entry:
        # Presentation-only sidecar added by the platform (ADR-029): own hash, never part of the authored package.
        if profile_entry['path'] in entry['integrity']:
            raise ValueError('Display profile must not be part of the authored package integrity')
        data = (base / profile_entry['path']).read_bytes()
        if hashlib.sha256(data).hexdigest() != profile_entry['sha256']:
            raise ValueError('Checksum mismatch: display profile')
        profile_schema = load((base / profile_entry['schema']).resolve())
        jsonschema.Draft202012Validator(profile_schema).validate(json.loads(data))
    print(f'{release_id}: hashes, source/profile schemas, display profile and artifact contracts PASS')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', default='zhouning-lower-reservoir-dam@0.6.2+schema0.7.0')
    parser.add_argument('--archive', type=Path)
    arguments = parser.parse_args()
    check(arguments.dataset, arguments.archive)
