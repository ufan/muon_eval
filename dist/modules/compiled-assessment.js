import { createProjectionPass } from './detector-projection.js';
import { detectorBasis, slopeDirection } from './detector-pose.js';
import { materialBoundaryProfile } from './material-envelopes.js';

// Adapter only: all acceptance, transport and count formulas live in the shared
// numerical core. Never derive physical truth from display or scene objects.
export function createCompiledAssessmentPass(runtime, config, device, response) {
  const { origin, azimuthDeg, elevationDeg, bins, length } = config;
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)
    || !Number.isFinite(length) || length <= 0 || length > 10000
    || !Number.isInteger(bins) || bins < 3 || bins > 65 || bins % 2 === 0) throw new Error('Invalid compiled assessment configuration');
  // These restrictions make current legacy response assumptions explicit.
  if (device.layers !== 3 || device.stripsX !== device.stripsY
    || !Number.isInteger(device.stripsX) || device.stripsX < 2 || bins > 2 * device.stripsX - 1
    || !['width', 'height', 'stripPitch', 'spacing', 'baseline', 'nativeSlopeStep', 'maxSlopeX', 'maxSlopeY'].every(key => Number.isFinite(device[key]) && device[key] > 0)
    || Math.abs(device.baseline - device.spacing * (device.layers - 1)) > 1e-12
    || Math.abs(device.nativeSlopeStep - device.stripPitch / device.baseline) > 1e-12
    || Math.abs(device.maxSlopeX - (device.stripsX - 1) * device.nativeSlopeStep) > 1e-12
    || Math.abs(device.maxSlopeY - (device.stripsY - 1) * device.nativeSlopeStep) > 1e-12) throw new Error('Assessment requires a consistent three-layer symmetric-readout device');
  if (!['gaisser', 'cos2'].includes(response.angularModel)
    || !Number.isFinite(response.exposureDays) || response.exposureDays <= 0 || response.exposureDays > 3650
    || !['layerEfficiency', 'deadLiveFraction'].every(key => Number.isFinite(response[key]) && response[key] >= 0 && response[key] <= 1)
    || !Number.isFinite(response.angularResolutionDeg) || response.angularResolutionDeg < 0
    || !Number.isFinite(response.systematicFraction) || response.systematicFraction < 0) throw new Error('Invalid assessment response');
  const snapshot = { origin: [...origin], azimuthDeg, elevationDeg, bins, length };
  const calculationIdentity = { identity: structuredClone(runtime.identity), backend: runtime.backend,
    scenarioId: runtime.scenarioId, variables: structuredClone(runtime.variables),
    projectionGeometry: structuredClone(runtime.projectionGeometry ?? null) };
  const deviceSnapshot = { ...device }, responseSnapshot = { ...response };
  const basis = detectorBasis(azimuthDeg, elevationDeg);
  const pass = createProjectionPass({ n: bins, device: deviceSnapshot, response: responseSnapshot, includeContext: true,
    sampleRay: (sx, sy) => {
      const direction = slopeDirection(basis, sx, sy);
      const trace = runtime.traceRayModel(snapshot.origin, direction, length);
      return { dir: { x: direction[0], y: direction[1], z: direction[2] }, q: trace };
    } });
  function complete(result) {
  if (result.values.some(v => ![v.count, v.transmission, v.displayCount, v.displayTransmission].every(value => Number.isFinite(value) && value >= 0))) {
    throw new Error('Ray column exceeds the supported quick-response numerical range; shorten the ray or use a validated transport model');
  }
  // Reverse rows for a top-left canvas origin (+sy at the top). Preserve raw
  // values for totals/picking; smoothed values are display-only.
  const pixels = [];
  for (let row = bins - 1; row >= 0; row--) for (let column = 0; column < bins; column++) {
    const value = result.values[row * bins + column];
    pixels.push({ sx: value.sx, sy: value.sy, direction: [value.dir.x, value.dir.y, value.dir.z],
      totals: { ...value.q.totals }, mwe: value.q.mwe, count: value.count, openCount: value.openCount, transmission: value.transmission,
      materialColumns: value.q.materialColumns ? { ...value.q.materialColumns } : null,
      displayCount: value.displayCount, displayTransmission: value.displayTransmission,
      targetLengths: { ...(value.q.entityLengths || {}) },
      materialBoundaries: materialBoundaryProfile(value.q),
      factor: value.factor, nativeRangeX: value.nativeRangeX, nativeRangeY: value.nativeRangeY });
  }
  return { schemaVersion: '0.1.0', kind: 'compiled-detector-assessment', frame: 'model_frame',
    materialContributionUnits: { totals: 'm', materialColumns: 'm.w.e.' },
    ...calculationIdentity, config: snapshot, device: deviceSnapshot, response: responseSnapshot,
    modelVersion: result.modelVersion, totalCount: result.total, weightedTransmission: result.weightedTransmission, pixels,
    semanticAudit: runtime.semanticAudit ? structuredClone(runtime.semanticAudit) : null,
    limitations: ['Quick comparative model, not calibrated counts or full particle transport.',
      'Three-layer symmetric-readout response; full device slope field, independent of the material-map half angle.',
      'No source-entity ROI significance; aggregate mappings remain unresolved.',
      'Paths stop at requested length and published mesh boundaries; omitted external material can overestimate transmission.',
      ...(runtime.limitations || [])] };
  }
  return Object.freeze({ advance: rows => pass.advance(rows), complete });
}

// Preview and main application share the same validation, sampling and result adapter.
export async function evaluateCompiledAssessment(runtime, config, device, response,
  { signal, yieldTask = () => Promise.resolve(), onProgress = () => {} } = {}) {
  const work = createCompiledAssessmentPass(runtime, config, device, response);
  const cancelled = () => { if (signal?.aborted) throw new DOMException('Assessment cancelled', 'AbortError'); };
  let state;
  do {
    cancelled(); state = work.advance(1); onProgress(state.progress); await yieldTask();
  } while (!state.done);
  cancelled();
  return work.complete(state.result);
}
