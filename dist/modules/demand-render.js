// Three.js' on-demand pattern: coalesce invalidations and allow change events
// during controls.update() to schedule the next damping frame.
export function createDemandRender(render, schedule = requestAnimationFrame) {
  let pending = false;
  return function requestRender() {
    if (pending) return;
    pending = true;
    schedule(() => { pending = false; render(); });
  };
}
