// Demonstration mode (#17, FR-M5): the 3D view alone, with a caption (what is shown), a legend (stations and
// coverage), a footnote with the limitations of the numbers, camera presets and saved views (stepped with ← →),
// and a PNG screenshot that carries the same caption, legend, labels and footnote (demo-snapshot.js).
// View state only: nothing here changes a result. Saved views are kept per release.
import { snapshotLayout, demoFileName, cycleView } from './demo-snapshot.js';

export function createDemoView({ root = document, sceneView, storage, storageKey, datasetId, describe, onToggle = () => {} }) {
  const $ = s => root.querySelector(s), app = $('.app'), bar = $('#demoBar');
  let on = false, current = null, saved = [];
  try { saved = (JSON.parse(storage.getItem(storageKey)) ?? []).filter(v => typeof v?.id === 'string' && Array.isArray(v.position) && Array.isArray(v.target)); } catch {}
  const persist = () => { try { storage.setItem(storageKey, JSON.stringify(saved)); } catch {} };
  // Presets are the page's own view list (#viewSelect), so their names come from the dataset's views.
  const presets = () => [...$('#viewSelect').options].map(o => ({ id: o.value, name: o.textContent }));
  const sequence = () => [...presets().map(p => p.id), ...saved.map(v => v.id)];
  function show(id) {
    const view = saved.find(v => v.id === id);
    if (view) sceneView.setCameraView(view); else sceneView.setView(id);
    current = id;
    for (const button of bar.querySelectorAll('[data-demo-view]')) button.classList.toggle('active', button.dataset.demoView === id);
  }
  function renderViews() {
    $('#demoPresets').replaceChildren(...presets().map(p => button(p.name, () => show(p.id), { demoView: p.id })));
    $('#demoSaved').replaceChildren(...saved.map(v => {
      const wrap = document.createElement('span'); wrap.className = 'demo-saved';
      const remove = button('×', () => { saved = saved.filter(x => x.id !== v.id); persist(); renderViews(); }, { demoRemove: v.id });
      remove.title = `删除视角「${v.name}」`; wrap.append(button(v.name, () => show(v.id), { demoView: v.id }), remove); return wrap;
    }));
    for (const b of bar.querySelectorAll('[data-demo-view]')) b.classList.toggle('active', b.dataset.demoView === current);
  }
  function button(text, onclick, data = {}) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = onclick; Object.assign(b.dataset, data); return b;
  }
  function render() {
    if (!on) return;
    const { caption, legend, footnote } = describe();
    $('#demoCaption').innerHTML = ''; $('#demoCaption').append(Object.assign(document.createElement('b'), { textContent: caption.title }), Object.assign(document.createElement('span'), { textContent: caption.subtitle }));
    $('#demoLegend').replaceChildren(...legend.map(entry => { const line = document.createElement('div'); if (entry.color) { const dot = document.createElement('i'); dot.style.setProperty('--c', entry.color); line.append(dot); } line.append(entry.text); return line; }));
    $('#demoFootnote').replaceChildren(...footnote.map(text => Object.assign(document.createElement('div'), { textContent: text })));
  }
  function setOn(value) {
    on = Boolean(value); app.classList.toggle('demo', on); app.classList.remove('demo-projection'); if (on) current = $('#viewSelect').value;
    for (const id of ['#demoBar', '#demoCaption', '#demoLegend', '#demoFootnote']) $(id).hidden = !on;
    $('#demoProjection').setAttribute('aria-pressed', 'false');
    sceneView.setDemo(on); renderViews(); render(); onToggle(on);
  }
  function screenshot() {
    const shot = sceneView.capture(); if (!shot) return;
    const { caption, legend, footnote } = describe(), ratio = shot.image.width / shot.width, out = document.createElement('canvas');
    out.width = shot.image.width; out.height = shot.image.height;
    const ctx = out.getContext('2d'); ctx.drawImage(shot.image, 0, 0); ctx.scale(ratio, ratio);
    for (const op of snapshotLayout({ width: shot.width, height: shot.height, caption, legend, footnote, labels: shot.labels })) {
      if (op.type === 'rect') { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = 1; ctx.strokeRect(op.x + .5, op.y + .5, op.w - 1, op.h - 1); } }
      else if (op.type === 'dot') { ctx.fillStyle = op.fill; ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, 2 * Math.PI); ctx.fill(); }
      else { ctx.fillStyle = op.fill; ctx.font = `${op.weight} ${op.size}px system-ui, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`; ctx.fillText(op.text, op.x, op.y); }
    }
    out.toBlob(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = demoFileName(datasetId, new Date()); a.click(); URL.revokeObjectURL(a.href); }, 'image/png');
  }
  $('#demoMode').onclick = () => setOn(!on);
  $('#demoExit').onclick = () => setOn(false);
  $('#demoShot').onclick = screenshot;
  $('#demoProjection').onclick = () => { const shown = app.classList.toggle('demo-projection'); $('#demoProjection').setAttribute('aria-pressed', String(shown)); };
  $('#demoSaveView').onclick = () => {
    const view = sceneView.cameraView(); if (!view) return;
    const number = saved.reduce((max, v) => Math.max(max, +v.id.replace(/^view-/, '') || 0), 0) + 1, name = prompt('视角名称', `视角 ${number}`);
    if (name === null) return;
    saved.push({ id: `view-${number}`, name: name.trim().slice(0, 40) || `视角 ${number}`, ...view }); current = `view-${number}`; persist(); renderViews();
  };
  root.addEventListener('keydown', event => {
    if (!on || event.target.closest?.('input, select, textarea')) return;
    if (event.key === 'Escape') setOn(false);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(cycleView(sequence(), current, event.key === 'ArrowRight' ? 1 : -1)); }
  });
  return Object.freeze({ render, get on() { return on; } });
}
