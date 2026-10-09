// @ts-check
import { createPatternSnapshot, createPatternField, createPatternOverlay } from './projection-pattern-contract.js';
import { nativeAxisBins } from './detector-projection.js';

// Prepare one graph's native field; never resample another graph by pixel index.
export function prepareProjectionPattern(result) {
  const detector = ['compiled-detector-assessment', 'legacy-detector-assessment'].includes(result.kind);
  if ((!detector && result.kind !== 'material-column-projection') || result.frame !== 'model_frame'
    || result.schemaVersion !== '0.1.0' || result.projectionGeometry?.version !== '1.0.0') throw new Error('Unsupported projection pattern result/provenance');
  const n = result.config.bins;
  if (!Number.isInteger(n) || n < 3 || result.pixels.length !== n * n) throw new Error('Invalid projection shape');
  const sx = result.pixels.slice(0, n).map(p => p.sx), sy = Array.from({ length: n }, (_, row) => result.pixels[row * n].sy);
  const grid = { kind: detector ? 'detector-aggregated' : 'uniform-samples', sx, sy };
  if (detector) {
    const bins = nativeAxisBins(n, result.device), step = result.device.nativeSlopeStep;
    grid.sxBounds = bins.map(b => [(b.first - 0.5) * step, (b.last + 0.5) * step]);
    grid.syBounds = grid.sxBounds.toReversed();
    result.pixels.forEach((p, i) => {
      const bx = bins[i % n], by = bins[n - 1 - Math.floor(i / n)];
      if (p.sx !== bx.slope || p.sy !== by.slope
        || p.nativeRangeX?.[0] !== bx.first || p.nativeRangeX?.[1] !== bx.last
        || p.nativeRangeY?.[0] !== by.first || p.nativeRangeY?.[1] !== by.last) throw new Error('Inconsistent detector sampling');
    });
  }
  result.pixels.forEach((p, i) => {
    if (p.sx !== sx[i % n] || p.sy !== sy[Math.floor(i / n)]) throw new Error('Nonrectangular projection grid');
  });
  const snapshot = createPatternSnapshot({ datasetRelease: result.identity.release_id,
    scenario: result.scenarioId, geometryVersion: result.projectionGeometry.geometryVersion,
    backendVersion: result.backend, modelVersion: detector ? result.modelVersion : 'material-integral@1.0.0',
    station: { frame: result.frame, origin: result.config.origin },
    pose: { azimuthDeg: result.config.azimuthDeg, elevationDeg: result.config.elevationDeg },
    detector: detector ? result.device : { type: 'none' },
    environment: { variables: result.variables, geometry: result.projectionGeometry, datasetIdentity: result.identity },
    sampling: { rayLengthM: result.config.length, grid, bins: n,
      ...(detector ? {} : { halfAngleDeg: result.config.halfAngleDeg }) },
    response: detector ? result.response : { type: 'none' } });
  const probe = createPatternField({ id: 'grid-validation', snapshot, quantity: 'material-path', material: 'grid-validation',
    grid, values: Array(n * n).fill(0), valid: Array(n * n).fill(true), provenance: { source: result.kind, limitations: [] } });
  return { snapshot, grid: probe.grid, resultKind: result.kind };
}

export function materialFieldFromProjection(result, material, quantity = 'material-column') {
  if (!['material-path', 'material-column'].includes(quantity)) throw new Error('Invalid material field quantity');
  const prepared = prepareProjectionPattern(result);
  if (!Object.hasOwn(result.projectionGeometry.materials, material)) throw new Error('Unknown registered material');
  const key = quantity === 'material-path' ? 'totals' : 'materialColumns';
  if (result.materialContributionUnits?.[key] !== (key === 'totals' ? 'm' : 'm.w.e.')) throw new Error('Missing contribution units');
  const values = result.pixels.map(p => {
    if (!p[key] || !Object.hasOwn(p[key], material)) return null;
    const v = p[key][material];
    if (v !== null && (!Number.isFinite(v) || v < 0)) throw new Error('Invalid contribution sample');
    return v;
  });
  const limitations = [...(result.limitations || [])];
  if (result.projectionGeometry.assetIdentity.status === 'unverified-buffer') limitations.push('Geometry buffers have no verified asset hash.');
  return createPatternField({ id: `${result.kind}:${quantity}:${material}`, snapshot: prepared.snapshot,
    quantity, material, grid: prepared.grid, values, valid: values.map(v => v !== null),
    provenance: { source: result.kind, limitations, adapterVersion: '1.0.0',
      samplingMeaning: 'raw winning-material path at representative sample direction, not a bin-integrated material average' } });
}

// Equal-width raster cells do not imply equally spaced slopes. Invert the
// extraction's actual-center mapping; outer half-cells are not extrapolated.
function graphCoordinateMapper(axis) {
  const sign = axis.at(-1) > axis[0] ? 1 : -1, tolerance = 1e-12 * Math.max(1, ...axis.map(Math.abs));
  return value => {
    let v = sign * value;
    if (!Number.isFinite(value) || v < sign * axis[0] - tolerance || v > sign * axis.at(-1) + tolerance) throw new Error('Contour outside graph sample hull');
    // Only roundoff from homogeneous clipping is clamped; no extrapolation.
    v = Math.max(sign * axis[0], Math.min(sign * axis.at(-1), v)); value = sign * v;
    let low = 0;
    while (low < axis.length - 2 && v > sign * axis[low + 1]) low++;
    return low + 0.5 + (value - axis[low]) / (axis[low + 1] - axis[low]);
  };
}

export function mapContributionOverlayToGraph(overlay, field, { width, height }) {
  if (overlay.semantic !== 'material-contribution' || field.representation !== 'raw') throw new Error('Contribution source required');
  return mapPatternOverlayToGraph(overlay, field, { width, height });
}

export function mapPatternOverlayToGraph(overlay, field, { width, height }) {
  const checked = createPatternField(field), curve = createPatternOverlay(overlay);
  const structural = curve.semantic === 'structural-reference';
  if (field.schemaVersion !== checked.schemaVersion || field.units !== checked.units
    || (!structural && (curve.settings.quantity !== checked.quantity || curve.settings.material !== checked.material || curve.settings.units !== checked.units || curve.source.id !== checked.id))
    || curve.snapshot.key !== checked.snapshot.key) throw new Error('Contour/graph source mismatch');
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid graph dimensions');
  const { sx, sy } = checked.grid;
  const mapX = graphCoordinateMapper(sx), mapY = graphCoordinateMapper(sy);
  const map = ([x, y]) => [mapX(x) * width / sx.length, mapY(y) * height / sy.length];
  const lines = curve.lines.map(line => {
    // Split at coordinate-map knots so long slope segments cannot be rendered
    // as straight chords across a nonlinear graph mapping.
    const output = [map(line[0])];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], times = new Set([1]);
      for (const [axis, coords] of [[0, sx], [1, sy]]) {
        if (a[axis] === b[axis]) continue;
        for (const knot of coords) { const t = (knot - a[axis]) / (b[axis] - a[axis]); if (t > 0 && t < 1) times.add(t); }
      }
      for (const t of [...times].sort((x, y) => x - y)) output.push(map(t === 1 ? b : a.map((v, axis) => v + t * (b[axis] - v))));
    }
    return output;
  });
  return { snapshotKey: checked.snapshot.key, sourceFieldId: checked.id, width, height,
    coordinates: 'graph-pixels/top-left', mapping: 'piecewise-actual-slope-centers', state: curve.state, lines };
}
