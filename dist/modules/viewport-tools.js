// Floating controls over the 3D view (ADR-032): the 图层 popover and the 视锥/射线/覆盖/切面 chip bar.
// View state only. One popover is open at a time; an outside click or Esc closes it. While the pointer is away
// from the 3D view and no popover is open, the controls fade after a short delay (CSS skips the animation under
// reduced motion). The controls themselves are the page's existing inputs, bound by main-page.js.
export function createViewportTools({ root = document, idleMs = 2000 } = {}) {
  const viewport = root.querySelector('#viewport'), triggers = [...root.querySelectorAll('.vt-group [aria-controls]')];
  const popoverOf = trigger => root.getElementById(trigger.getAttribute('aria-controls'));
  let idleTimer = null;
  const anyOpen = () => triggers.some(trigger => !popoverOf(trigger).hidden);
  function close(except = null) {
    for (const trigger of triggers) if (trigger !== except) { popoverOf(trigger).hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  }
  function toggle(trigger) {
    const popover = popoverOf(trigger), open = popover.hidden;
    close(trigger); popover.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
    if (open) wake();
  }
  function wake() { clearTimeout(idleTimer); idleTimer = null; viewport.classList.remove('tools-idle'); }
  // Touch screens have no hover to bring the controls back, so they never fade there.
  const touchOnly = globalThis.matchMedia?.('(hover: none)').matches ?? false;
  function sleepSoon() { if (touchOnly) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!anyOpen()) viewport.classList.add('tools-idle'); }, idleMs); }
  for (const trigger of triggers) trigger.addEventListener('click', event => { event.stopPropagation(); toggle(trigger); });
  const outside = event => { if (anyOpen() && !event.target.closest('.vt-group')) { close(); if (!viewport.matches(':hover')) sleepSoon(); } };
  const escape = event => { if (event.key === 'Escape' && anyOpen()) { const open = triggers.find(trigger => !popoverOf(trigger).hidden); close(); open.focus(); } };
  root.addEventListener('click', outside); root.addEventListener('keydown', escape);
  viewport.addEventListener('pointerenter', wake); viewport.addEventListener('pointerleave', sleepSoon);
  viewport.addEventListener('focusin', wake);
  // 视锥 and 切面: their options only act while the layer is on, so the ▾ is disabled (and its popover closed) while it
  // is off, instead of opening an empty or ineffective frame (owner review 2026-10-16).
  const splits = [...root.querySelectorAll('.vt-split')].map(label => ({ box: label.querySelector('input'), more: label.nextElementSibling }));
  function syncSplits() {
    for (const { box, more } of splits) {
      more.disabled = !box.checked; more.title = box.checked ? more.getAttribute('aria-label') : `先打开${label(box)}`;
      if (!box.checked && !popoverOf(more).hidden) { popoverOf(more).hidden = true; more.setAttribute('aria-expanded', 'false'); }
    }
  }
  const label = box => box.closest('label').textContent.trim();
  for (const { box } of splits) box.addEventListener('change', syncSplits);
  syncSplits();
  // The coverage chip names the active mode, so the state is visible without opening the popover.
  const mode = root.querySelector('#coverageMode'), chip = root.querySelector('#coverageButton'), state = root.querySelector('#coverageChipState');
  const syncCoverage = () => { const on = mode.value !== 'off'; state.textContent = '：' + mode.selectedOptions[0].textContent.replace(/（.*$/, ''); chip.classList.toggle('active', on); };
  mode.addEventListener('change', syncCoverage); mode.addEventListener('coverage-applied', syncCoverage); syncCoverage();
  return Object.freeze({ close, syncCoverage, syncSplits,
    dispose() { clearTimeout(idleTimer); root.removeEventListener('click', outside); root.removeEventListener('keydown', escape); } });
}
