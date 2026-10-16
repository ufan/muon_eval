// Task modes (ADR-032): 单站考察 shows the working station in the right sidebar; 多站评估 replaces it with the
// multi-station analysis panel. View state only, remembered per release in this browser; never changes results.
export const TASK_MODES = Object.freeze(['single', 'multi']);

export function createTaskMode({ root = document, storage, storageKey, onChange = () => {} }) {
  const $ = s => root.querySelector(s), app = $('.app');
  const tabs = { single: $('#modeSingle'), multi: $('#modeMulti') }, panels = { single: $('#singlePanel'), multi: $('#multiPanel') };
  let mode = 'single';
  function show(next, { persist = true } = {}) {
    if (!TASK_MODES.includes(next) || next === mode) return;
    const previous = mode; mode = next;
    for (const key of TASK_MODES) { panels[key].hidden = key !== mode; tabs[key].setAttribute('aria-selected', String(key === mode)); }
    app.classList.toggle('multi', mode === 'multi');
    if (persist) try { storage.setItem(storageKey, mode); } catch {}
    onChange(mode, previous);
  }
  for (const key of TASK_MODES) tabs[key].addEventListener('click', () => show(key));
  let saved = null;
  try { saved = storage.getItem(storageKey); } catch {}
  return Object.freeze({ get mode() { return mode; }, show, restore() { if (saved === 'multi') show('multi', { persist: false }); } });
}
