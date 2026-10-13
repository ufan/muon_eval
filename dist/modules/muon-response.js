// Quick-assessment formulas. 3.0.0: pixel counts use the projected detector
// area (cos^4 per slope cell) and drop the undeclared 'edge' factor (FR-C3).
// 2.0.0 evaluates the flux integral exactly for every input (FR-C1); 1.0.0
// returned the first value computed in a quantised (cosZ, log10 Emin) bucket.
// Flux units: cm^-2 s^-1 sr^-1 (integrated); energy: GeV; column: m.w.e.
// Model identifier; versions 1.0.0-3.0.0 were first published as
// 'legacy-quick-response@<version>' (same physics per version).
export const RESPONSE_MODEL_VERSION = 'quick-response@3.0.0';

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

export function integratedSurfaceFlux(cosZ, emin, angularModel = 'gaisser') {
  if (cosZ <= 0) return 0;
  emin = Math.max(1, emin);
  const emax = 1e5, n = 44, lo = Math.log(emin), hi = Math.log(emax), step = (hi - lo) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const E = Math.exp(lo + i * step), w = i === 0 || i === n ? .5 : 1;
    sum += w * surfaceSpectrum(E, cosZ, angularModel) * E;
  }
  return sum * step;
}

export function minimumMuonEnergy(mwe) {
  const a = .2, b = 4e-4;
  return a / b * (Math.exp(b * Math.max(0, mwe)) - 1);
}

export function countSignificance(count, counterfactualCount, systematicFraction) {
  return Math.abs(count - counterfactualCount) / Math.sqrt(Math.max(1, count) + (systematicFraction * count) ** 2);
}
