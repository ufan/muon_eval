// DOM/renderer-independent detector-local slope sampling. This is geometry
// qualification, not a detector acceptance or muon-count model.
import { materialBoundaryProfile } from './material-envelopes.js';
import { detectorBasis, slopeDirection } from './detector-pose.js';
export { detectorBasis, slopeDirection } from './detector-pose.js';

export async function evaluateMaterialProjection(runtime, config, { signal, yieldTask = () => Promise.resolve(), onProgress = () => {} } = {}) {
  const { origin, azimuthDeg, elevationDeg, halfAngleDeg, bins, length } = config;
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)
    || !Number.isFinite(halfAngleDeg) || halfAngleDeg <= 0 || halfAngleDeg >= 89
    || !Number.isInteger(bins) || bins < 3 || bins > 65 || bins % 2 === 0
    || !Number.isFinite(length) || length <= 0 || length > 10000) throw new Error('Invalid material projection configuration');
  const snapshot = { origin: [...origin], azimuthDeg, elevationDeg, halfAngleDeg, bins, length };
  const calculationIdentity = { identity: structuredClone(runtime.identity), backend: runtime.backend,
    scenarioId: runtime.scenarioId, variables: structuredClone(runtime.variables),
    projectionGeometry: structuredClone(runtime.projectionGeometry ?? null) };
  const basis = detectorBasis(azimuthDeg, elevationDeg), maxSlope = Math.tan(halfAngleDeg * Math.PI / 180);
  const pixels = [];
  const checkCancelled = () => { if (signal?.aborted) throw new DOMException('Projection cancelled', 'AbortError'); };
  for (let row = 0; row < bins; row++) {
    checkCancelled();
    const sy = maxSlope * (1 - 2 * row / (bins - 1)); // top row is local +up
    for (let column = 0; column < bins; column++) {
      const sx = maxSlope * (2 * column / (bins - 1) - 1), direction = slopeDirection(basis, sx, sy);
      const trace = runtime.traceRayModel(snapshot.origin, direction, length);
      pixels.push({ sx, sy, direction, totals: { ...trace.totals }, mwe: trace.mwe,
        materialColumns: trace.materialColumns ? { ...trace.materialColumns } : null,
        targetLengths: { ...(trace.entityLengths || {}) }, materialBoundaries: materialBoundaryProfile(trace) });
    }
    onProgress((row + 1) / bins);
    await yieldTask();
  }
  checkCancelled();
  return { schemaVersion: '0.1.0', kind: 'material-column-projection', frame: 'model_frame',
    materialContributionUnits: { totals: 'm', materialColumns: 'm.w.e.' },
    ...calculationIdentity, config: snapshot, maxSlope, pixels,
    semanticAudit: runtime.semanticAudit ? structuredClone(runtime.semanticAudit) : null,
    limitations: ['Uniform slope samples, not detector-weighted counts or transmission.',
      'Material paths stop at the requested ray length and published mesh boundaries.', ...(runtime.limitations || [])] };
}
