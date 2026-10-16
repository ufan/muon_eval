// View data from the calculation's ordered material intervals. Never infer a
// surface at the detector origin, the trace cutoff, or an unknown interval.
export function raySurfaceCrossings(trace) {
  const crossings = [];
  for (let i = 1; i < trace.segments.length; i++) {
    const before = trace.segments[i - 1], after = trace.segments[i];
    if (before.t1 !== after.t0 || before.material === after.material) continue;
    crossings.push({ distanceM: after.t0,
      kind: before.material === 'air' ? 'entry' : after.material === 'air' ? 'exit' : 'interface',
      fromMaterial: before.material, toMaterial: after.material });
  }
  return crossings;
}
