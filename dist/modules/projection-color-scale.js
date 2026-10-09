// @ts-check
// Display-only mapping: never rescale scientific pixel values.
export function projectionColorScale(values, mode = 'adaptive') {
  if (!['adaptive', 'fixed'].includes(mode) || !values.every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid projection color scale');
  const positive = values.filter(value => value > 0).sort((a, b) => a - b);
  // Discrete percentile keeps a single outlier out of the display range,
  // including in mostly empty fields of view.
  const upper = mode === 'fixed' ? 2000 : positive[Math.floor(0.98 * (positive.length - 1))] || 1;
  const clipped = values.filter(value => value > upper).length;
  const normalize = value => {
    const fraction = Math.max(0, Math.min(1, value / upper));
    return mode === 'adaptive' ? Math.log1p(100 * fraction) / Math.log1p(100) : fraction;
  };
  return { mode, upper, clipped, normalize, transform: mode === 'adaptive' ? 'log1p(100*x/upper)/log1p(100)' : 'linear',
    percentile: mode === 'adaptive' ? 98 : null };
}
