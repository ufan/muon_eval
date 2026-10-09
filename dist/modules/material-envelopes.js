// @ts-check
// Boundary profiles come from winning BVH material intervals, not rendering.
export function materialBoundaryProfile(trace) {
  const profile = {};
  for (const material of ['concrete', 'rock']) {
    const airDepths = [];
    for (let i = 1; i < (trace.segments || []).length; i++) {
      const before = trace.segments[i - 1], after = trace.segments[i];
      if ((before.material === material && after.material === 'air') || (before.material === 'air' && after.material === material)) airDepths.push(after.t0);
    }
    profile[material] = { length: trace.totals[material] || 0, airDepths };
  }
  return profile;
}

export function materialEnvelopeEdges(pixels, bins, material, { tolerance = 1e-6, depthEdges = true, depthJumpM = 4, relativeJump = .25 } = {}) {
  if (!['concrete', 'rock'].includes(material) || !Number.isInteger(bins) || pixels.length !== bins * bins) throw new Error('Invalid material envelope grid');
  const edges = [];
  const compare = (a, b) => {
    const pa = a.materialBoundaries?.[material], pb = b.materialBoundaries?.[material];
    if (!pa || !pb) return null;
    if ((pa.length > tolerance) !== (pb.length > tolerance)) return 'material-silhouette';
    if (Boolean(pa.airDepths.length) !== Boolean(pb.airDepths.length)) return 'air-interface-silhouette';
    if (!depthEdges) return null;
    if (pa.airDepths.length !== pb.airDepths.length) return 'air-interface-topology';
    if (pa.airDepths.some((depth, i) => Math.abs(depth - pb.airDepths[i]) > Math.max(depthJumpM, relativeJump * Math.min(depth, pb.airDepths[i])))) return 'air-interface-depth';
    return null;
  };
  for (let y = 0; y < bins; y++) for (let x = 0; x < bins; x++) {
    const pixel = pixels[y * bins + x];
    if (x + 1 < bins) {
      const reason = compare(pixel, pixels[y * bins + x + 1]);
      if (reason) edges.push({ x0: x + 1, y0: y, x1: x + 1, y1: y + 1, reason });
    }
    if (y + 1 < bins) {
      const reason = compare(pixel, pixels[(y + 1) * bins + x]);
      if (reason) edges.push({ x0: x, y0: y + 1, x1: x + 1, y1: y + 1, reason });
    }
  }
  return edges;
}
