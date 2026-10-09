// Existing quick-assessment formulas, extracted without recalibration.
// Flux units: cm^-2 s^-1 sr^-1 (integrated); energy: GeV; column: m.w.e.
export const RESPONSE_MODEL_VERSION = 'legacy-quick-response@1.0.0';

export function cosThetaStar(c) {
  c = Math.max(0, Math.min(1, c));
  const p1 = .102573, p2 = -.068287, p3 = .958633, p4 = .0407253, p5 = .817285;
  return Math.sqrt((c * c + p1 * p1 + p2 * c ** p3 + p4 * c ** p5) / (1 + p1 * p1 + p2 + p4));
}

export function gaisserFlux(E, cosZ) {
  if (cosZ <= 0) return 0;
  const cs = cosThetaStar(cosZ), shift = 1 + 3.64 / (E * cs ** 1.29), spectrum = .14 * (E * shift) ** -2.7;
  const mesons = 1 / (1 + 1.1 * E * cs / 115) + .054 / (1 + 1.1 * E * cs / 850);
  return spectrum * mesons;
}

export function surfaceSpectrum(E, cosZ, angularModel = 'gaisser') {
  return angularModel === 'cos2' ? gaisserFlux(E, 1) * cosZ * cosZ : gaisserFlux(E, cosZ);
}

export function integratedSurfaceFlux(cosZ, emin, angularModel = 'gaisser', cache = new Map()) {
  if (cosZ <= 0) return 0;
  emin = Math.max(1, emin);
  // Preserve legacy quantization and first-sample cache behavior exactly.
  const key = angularModel + '/' + Math.round(cosZ * 100) + '/' + Math.round(Math.log10(emin) * 40);
  if (cache.has(key)) return cache.get(key);
  const emax = 1e5, n = 44, lo = Math.log(emin), hi = Math.log(emax), step = (hi - lo) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const E = Math.exp(lo + i * step), w = i === 0 || i === n ? .5 : 1;
    sum += w * surfaceSpectrum(E, cosZ, angularModel) * E;
  }
  const result = sum * step;
  cache.set(key, result);
  return result;
}

export function minimumMuonEnergy(mwe) {
  const a = .2, b = 4e-4;
  return a / b * (Math.exp(b * Math.max(0, mwe)) - 1);
}

export function countSignificance(count, counterfactualCount, systematicFraction) {
  return Math.abs(count - counterfactualCount) / Math.sqrt(Math.max(1, count) + (systematicFraction * count) ** 2);
}
