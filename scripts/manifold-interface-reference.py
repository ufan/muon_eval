"""Pinned native CSG air-boundary experiment; no release asset writes.

Input/output JSON on stdin/stdout. Manifold 3.5.4 supplies all mesh Boolean
operations and lineage. This helper is not a new geometry implementation.
"""
import json
import hashlib
import sys
from importlib.metadata import version

import numpy as np
import manifold3d as m3


def checked(solid):
    if solid.status() != m3.Error.NoError:
        raise ValueError(f"Manifold rejected mesh/operation: {solid.status()}")
    return solid


def relations(mesh):
    result = [None] * len(mesh.tri_verts)
    # Native bindings return copied Python lists for these attributes. Cache
    # once: accessing face_id per triangle otherwise causes quadratic copying.
    face_ids, run_indices, original_ids = mesh.face_id, mesh.run_index, mesh.run_original_id
    for run, original in enumerate(original_ids):
        begin, end = int(run_indices[run]) // 3, int(run_indices[run + 1]) // 3
        for face in range(begin, end):
            result[face] = (int(original), int(face_ids[face]))
    if any(row is None for row in result):
        raise ValueError("Incomplete native triangle lineage")
    return result


def evaluate(case):
    inputs, original_sources = {}, {}
    precedence = case["precedence"]
    if len(set(precedence)) != len(precedence) or "air" in precedence:
        raise ValueError("Explicit unique non-air precedence required")
    for component in case["components"]:
        material = component["material"]
        if material not in precedence:
            raise ValueError("Unranked material")
        positions = np.asarray(component["positions"], np.float64).reshape(-1, 3)
        indices = np.asarray(component["indices"], np.uint64).reshape(-1, 3)
        original = m3.Manifold.reserve_ids(1)
        native = m3.Mesh64(vert_properties=positions, tri_verts=indices,
                           run_index=np.asarray([0, indices.size], np.uint64),
                           run_original_id=np.asarray([original], np.uint32),
                           face_id=np.arange(len(indices), dtype=np.uint64))
        solid = checked(m3.Manifold(native))
        original_sources[original] = {**component, "domainFaceIds": set(component.get("domainFaceIds", []))}
        inputs.setdefault(material, []).append(solid)
    occupied, regions, region_sources = m3.Manifold(), [], {}
    winning_volumes = {}
    for material in precedence:
        group = inputs.get(material, [])
        if not group:
            continue
        current = checked(m3.Manifold.batch_boolean(group, m3.OpType.Add))
        winner = checked(current - occupied)
        occupied = checked(occupied + current)
        winning_volumes[material] = winner.volume()
        if winner.is_empty():
            continue
        # Preserve ancestor lineage separately, then label this entire winning
        # volume by its material. Do not trust ambiguous coplanar union source
        # ownership when original material volumes overlap.
        mesh = winner.to_mesh64()
        ancestors = relations(mesh)
        original = m3.Manifold.reserve_ids(1)
        region_sources[original] = (material, ancestors)
        region = m3.Mesh64(vert_properties=np.array(mesh.vert_properties, copy=True),
                           tri_verts=np.array(mesh.tri_verts, copy=True),
                           merge_from_vert=np.asarray(mesh.merge_from_vert, np.uint64),
                           merge_to_vert=np.asarray(mesh.merge_to_vert, np.uint64),
                           run_index=np.asarray([0, mesh.tri_verts.size], np.uint64),
                           run_original_id=np.asarray([original], np.uint32),
                           face_id=np.arange(len(mesh.tri_verts), dtype=np.uint64))
        regions.append(checked(m3.Manifold(region)))
    boundary = checked(m3.Manifold.batch_boolean(regions, m3.OpType.Add))
    mesh = boundary.to_mesh64()
    source_faces, materials, kinds = [], [], []
    for original, face in relations(mesh):
        material, ancestors = region_sources[original]
        ancestor_original, ancestor_face = ancestors[face]
        source = original_sources[ancestor_original]
        if ancestor_face >= len(source["indices"]) // 3:
            raise ValueError("Native ancestor face outside source buffer")
        source_kind = "domain-cap" if ancestor_face in source["domainFaceIds"] else "scope-unqualified"
        materials.append(material)
        kinds.append(source_kind)
        source_faces.append({"componentId": source["componentId"], "faceId": ancestor_face,
                             "sourceMaterial": source["material"], "winningMaterial": material})
    return {"id": case["id"], "positions": mesh.vert_properties[:, :3].reshape(-1).tolist(),
            "indices": mesh.tri_verts.reshape(-1).tolist(), "faceMaterials": materials,
            "sourceFaces": source_faces, "faceScopeKinds": kinds,
            "winningVolumesM3": winning_volumes, "unionVolumeM3": boundary.volume(),
            "nativeToleranceM": boundary.get_tolerance(),
            "limitations": ["Native CSG boundary is air-facing only within the supplied finite mesh model.",
                            "Domain/missing-geometry semantics require independent source qualification.",
                            "Component/face lineage does not establish canonical source-entity ownership."]}


if __name__ == "__main__":
    if version("manifold3d") != "3.5.4":
        raise ValueError("Reference requires manifold3d==3.5.4")
    raw_request = sys.stdin.buffer.read()
    request = json.loads(raw_request)
    json.dump({"manifoldVersion": version("manifold3d"), "numpyVersion": np.__version__,
               "requestSha256": hashlib.sha256(raw_request).hexdigest(),
               "results": [evaluate(case) for case in request["cases"]]}, sys.stdout,
              allow_nan=False, separators=(",", ":"))
