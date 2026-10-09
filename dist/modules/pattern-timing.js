// @ts-check
// Diagnostic User Timing entries only; never part of scientific results.
export function timePatternWork(name, work) {
  const start = performance.now();
  try { return work(); }
  finally {
    performance.measure(`pattern:${name}`, { start, end: performance.now() });
    performance.clearMeasures(`pattern:${name}`);
  }
}

export function deferPatternWork(name, work, current = () => true, schedule = callback => setTimeout(callback, 0)) {
  schedule(() => { if (current()) timePatternWork(name, work); });
}
