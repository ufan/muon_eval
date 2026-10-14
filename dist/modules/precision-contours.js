// Statistical precision contours (FR-M13): where the relative counting error
// 1/sqrt(N) of a pixel reaches fixed levels (default 10 % and 5 %) for the current
// exposure. Display only; computed from a finished projection's own raw counts.
// Lines are in display pixel units ([0, n], top row first) like the outlines.
import contours from '../vendor/d3-contour/contours.js';

export const PRECISION_LEVELS = Object.freeze([.1, .05]);
const LOG_FLOOR = -3; // log10 of counts for empty pixels (well below any level)

export function countsForRelativeError(relativeError) {
  if (!Number.isFinite(relativeError) || relativeError <= 0 || relativeError >= 1) throw new Error('Invalid relative error level');
  return (1 / relativeError) ** 2;
}

export function precisionContours({ n, values }, levels = PRECISION_LEVELS) {
  if (!Number.isInteger(n) || n < 1 || values?.length !== n * n) throw new Error('Invalid projection field');
  // Log counts (counts vary over orders of magnitude), padded by repeating the edge
  // values so lines run straight to the image border instead of closing along it.
  const size = n + 2, field = new Float64Array(size * size);
  const at = (r, c) => {
    const count = values[(n - 1 - r) * n + c].count;
    if (!Number.isFinite(count) || count < 0) throw new Error('Invalid pixel count');
    return Math.max(LOG_FLOOR, Math.log10(count));
  };
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
    field[r * size + c] = at(Math.min(n - 1, Math.max(0, r - 1)), Math.min(n - 1, Math.max(0, c - 1)));
  const generator = contours().size([size, size]).smooth(true);
  const toDisplay = ([x, y]) => [Math.max(0, Math.min(n, x - 1)), Math.max(0, Math.min(n, y - 1))];
  const onBorder = (a, b) => (a[0] === b[0] && (a[0] === 0 || a[0] === n)) || (a[1] === b[1] && (a[1] === 0 || a[1] === n));
  return levels.map(relativeError => {
    const minCounts = countsForRelativeError(relativeError), lines = [];
    for (const polygon of generator.contour(field, Math.log10(minCounts)).coordinates) for (const ring of polygon) {
      const points = ring.map(toDisplay);
      let line = [];
      for (let i = 1; i < points.length; i++) {
        if (onBorder(points[i - 1], points[i])) { if (line.length > 1) lines.push(line); line = []; continue; }
        if (!line.length) line.push(points[i - 1]);
        line.push(points[i]);
      }
      if (line.length > 1) lines.push(line);
    }
    return { relativeError, minCounts, lines };
  });
}
