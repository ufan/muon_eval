import { createCompiledAssessmentPass } from './compiled-assessment.js';
import { detectorBasis, slopeDirection } from './detector-pose.js';

// Enclose every finite published mesh, not an arbitrary transport cutoff.
export function enclosingCompiledRayLength(origin, bounds) {
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)
    || !bounds || !['min', 'max'].every(key => Array.isArray(bounds[key]) && bounds[key].length === 3 && bounds[key].every(Number.isFinite))
    || bounds.min.some((value, axis) => value > bounds.max[axis])) throw new Error('Invalid compiled trace domain');
  const length = Math.hypot(...origin.map((value, axis) => Math.max(Math.abs(value - bounds.min[axis]), Math.abs(value - bounds.max[axis]))));
  if (length <= 0 || length > 10000) throw new Error('Compiled trace domain exceeds supported assessment range');
  return length;
}

// Controller-facing adapter; runtime is injected and never built from a scene.
export function createCompiledMainAssessment({ runtime }) {
  const variables = structuredClone(runtime.variables);
  const sameEnvironment = input => input && Object.keys(input).length === Object.keys(variables).length
    && Object.entries(variables).every(([key, value]) => input[key] === value);
  return Object.freeze({
    createSession(input) {
      const { station, device, response, environment, plan = null } = structuredClone(input);
      if (!sameEnvironment(environment)) throw new Error('Compiled assessment only accepts the selected frozen scenario variables');
      const origin = [station.x, station.y, station.z], length = enclosingCompiledRayLength(origin, runtime.bounds);
      const config = { origin, azimuthDeg: station.az, elevationDeg: station.el, length };
      const basis = detectorBasis(station.az, station.el);
      return Object.freeze({
        quickMetrics: () => null,
        centralRay: () => runtime.traceRayModel(origin, slopeDirection(basis, 0, 0), length),
        projection(quality) {
          if (!['preview', 'final'].includes(quality)) throw new Error('Unknown assessment quality');
          const work = createCompiledAssessmentPass(runtime, { ...config, bins: quality === 'preview' ? 25 : 65 }, device, response, { plan });
          return { advance: work.advance, complete: result => ({ ...result, quality, patternResult: work.complete(result) }) };
        },
        ensureTargetSignificance() { throw new Error('Source-entity significance is unavailable for the compiled backend'); },
      });
    },
    clearCaches() {}, // No compiled response state outlives a pass.
  });
}
