// This sidecar explicitly accompanies the bounded v0.7 profile in doc_frame.
// Preserve its reference points without adding the legacy detector-height offset.
export function compiledDefaultStations(dataset) {
  if(dataset.geometry?.geometryFrame!=='doc_frame')throw new Error('Compiled candidate source frame must be explicit doc_frame');
  return dataset.candidates.candidates.map(candidate => {
    const point = candidate.example_position ?? candidate.geometry?.position;
    if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite) || candidate.binding !== false)
      throw new Error(`Unsupported compiled candidate ${candidate.id}`);
    const [x, y, z] = dataset.geometry.coordinates.pointToModel(point);
    return { id: candidate.id, candidateId: candidate.id, name: candidate.names?.zh ?? candidate.id, x, y, z, az: 0, el: 25,
      hostEntityId: candidate.host_entity_id, binding: false, rationale: candidate.rationale };
  });
}
