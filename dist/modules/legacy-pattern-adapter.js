// @ts-check
// No legacy tracing/response formulas: adapt the completed shared-core pass.
export function adaptLegacyPatternResult({ pass, identity, materials, station, device, response, environment, traceSettings, directionToModel }) {
  if (typeof directionToModel !== 'function') throw new Error('Explicit legacy direction-frame adapter required');
  const n = pass.n;
  const registry = Object.fromEntries(Object.entries(materials).map(([id, material]) => [id, { density: material.density }]));
  // traceRay's existing fallback steel density is supplied by its caller, not
  // invented here; every accumulated material must have explicit metadata.
  const pixels = [];
  for (let row = n - 1; row >= 0; row--) for (let col = 0; col < n; col++) {
    const p = pass.values[row * n + col];
    const columns = Object.fromEntries(Object.entries(p.q.totals).map(([id, length]) => {
      if (!Object.hasOwn(registry, id) || !Number.isFinite(length) || length < 0) throw new Error('Legacy material metadata missing');
      return [id, id === 'air' ? 0 : length * registry[id].density];
    }));
    const direction = directionToModel(p.dir);
    if (!Array.isArray(direction) || direction.length !== 3 || !direction.every(Number.isFinite)) throw new Error('Invalid model direction');
    pixels.push({ sx: p.sx, sy: p.sy, direction, totals: { ...p.q.totals }, materialColumns: columns,
      mwe: p.q.mwe, count: p.count, openCount: p.openCount, transmission: p.transmission,
      displayCount: p.displayCount, displayTransmission: p.displayTransmission, factor: p.factor,
      nativeRangeX: [...p.nativeRangeX], nativeRangeY: [...p.nativeRangeY], targetLengths: { ...p.q.targetLengths } });
  }
  return { schemaVersion: '0.1.0', kind: 'legacy-detector-assessment', frame: 'model_frame',
    identity: structuredClone(identity), backend: 'legacy-dda@1.0.0', scenarioId: 'legacy-continuous-water',
    variables: structuredClone(environment), config: { origin: [station.x, station.y, station.z], azimuthDeg: station.az,
      elevationDeg: station.el, bins: n, length: null },
    device: { ...device }, response: { ...response }, modelVersion: pass.modelVersion,
    totalCount: pass.total, weightedTransmission: pass.weightedTransmission,
    materialContributionUnits: { totals: 'm', materialColumns: 'm.w.e.' },
    projectionGeometry: { version: '1.0.0', geometryVersion: 'legacy-dda@1.0.0', materials: registry,
      assetIdentity: { status: 'legacy-source-model', releaseId: identity.release_id }, traceSettings: structuredClone(Object.fromEntries(Object.entries(traceSettings).filter(([key]) => key !== 'maximumRayDistanceM'))) },
    diagnostics: { enclosingMaximumRayDistanceM: traceSettings.maximumRayDistanceM },
    pixels, semanticAudit: null, limitations: ['Legacy DDA source model, not the compiled BVH backend; no compiled finite-reference assets available here.',
      'Column contributions use existing dataset densities and DDA path lengths; geometry uncertainty is unchanged.',
      'Raw results share the existing count/response core. Display smoothing is approximate; no measured-data calibration.',
      'Legacy trace domain is finite; rayLengthM=null means the recorded domain box, not a radial cutoff. The diagnostic enclosing distance is not a comparison setting.'] };
}
