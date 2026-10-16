// Keyboard shortcuts of the main view (ADR-032): C, R, V toggle 视锥, 射线 and 覆盖; arrow keys nudge azimuth
// (left/right) and elevation (up/down) by 1°, with Shift by 5°. Pure: maps a key event to an action, or null when
// the user is typing in a field, holds a modifier chord, or presses another key.
const TOGGLES = { c: 'cone', r: 'ray', v: 'coverage' };
const NUDGES = { ArrowLeft: ['az', -1], ArrowRight: ['az', 1], ArrowUp: ['el', 1], ArrowDown: ['el', -1] };

export function shortcutFor(event) {
  const target = event.target ?? {};
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const toggle = TOGGLES[String(event.key).toLowerCase()];
  if (toggle && String(event.key).length === 1) return { toggle };
  const nudge = NUDGES[event.key];
  return nudge ? { nudge: nudge[0], by: nudge[1] * (event.shiftKey ? 5 : 1) } : null;
}
