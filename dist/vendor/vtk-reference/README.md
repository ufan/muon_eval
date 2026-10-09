# VTK structural-reference adaptation

Source: [VTK v9.5.2 vtkPolyDataSilhouette.cxx](https://github.com/Kitware/VTK/blob/v9.5.2/Filters/Hybrid/vtkPolyDataSilhouette.cxx), `RequestData` connectivity and selection. Upstream contribution: Thierry Carrard, CEA/DIF. BSD-3-Clause; see LICENSE.

Adapted in `../../modules/structural-reference-candidates.js` on 2026-10-06. No VTK runtime dependency. Triangle-only pure JavaScript, normalized triangle normals, indexed point identity without welding, specified observer origin, optional feature-angle selection. Camera/scene integration, mutable caches, vector mode and border emission are omitted. Repeated directed edge sides and degenerate/nonfinite triangles throw instead of upstream overwriting normals. Open indexed borders are explicitly reported and excluded. Candidate segments retain point/face IDs and selection reasons.

Native VTK 9.5.2 recorded fixture evidence is the parity oracle. The adaptation does not qualify physical interfaces, resolve source ownership, split contact faces, clip perspective segments, or perform optical visibility. It must not be wired directly into an envelope layer.
