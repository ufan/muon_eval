// Demonstration mode (#17, FR-M5): the 3D view alone, with a caption (what is shown), a legend (stations and
// coverage), a footnote with the limitations of the numbers, camera presets and saved views (stepped with ← →),
// and a PNG screenshot that carries the same caption, legend, labels and footnote (demo-snapshot.js).
// View state only: nothing here changes a result. Saved views are kept per release.
import { snapshotLayout, demoFileName, cycleView, tourFrames, orbitFrames } from './demo-snapshot.js';
import { muxWebm } from './webm-muxer.js';

// Text, boxes and dots of a screenshot or animation frame (demo-snapshot.js layout), in CSS pixels.
function drawOps(ctx, ops) {
  for (const op of ops) {
    if (op.type === 'rect') { ctx.fillStyle = op.fill; ctx.fillRect(op.x, op.y, op.w, op.h); if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = 1; ctx.strokeRect(op.x + .5, op.y + .5, op.w - 1, op.h - 1); } }
    else if (op.type === 'dot') { ctx.fillStyle = op.fill; ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, 2 * Math.PI); ctx.fill(); }
    else { ctx.fillStyle = op.fill; ctx.font = `${op.weight} ${op.size}px system-ui, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`; ctx.fillText(op.text, op.x, op.y); }
  }
}
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
// A video type this browser can record (WebM in Chromium and Firefox, MP4 in Safari), or null.
const VIDEO_TYPES = [['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm'], ['video/mp4', 'mp4']];
const videoType = () => typeof MediaRecorder === 'undefined' ? null : VIDEO_TYPES.find(([type]) => MediaRecorder.isTypeSupported(type)) ?? null;

export function createDemoView({ root = document, sceneView, storage, storageKey, datasetId, describe, onToggle = () => {} }) {
  const $ = s => root.querySelector(s), app = $('.app'), bar = $('#demoBar');
  let on = false, current = null, saved = [], panels = { legend: true, note: true };
  // 图例 and 说明 are the user's choice (owner, 2026-10-16), remembered in this browser; exports follow what is shown, except
  // that a hidden 说明 still leaves its first line ("not a construction or safety conclusion") in screenshots and animations.
  const panelsKey = `${storageKey}:panels`;
  try { const p = JSON.parse(storage.getItem(panelsKey)); if (p && typeof p === 'object') panels = { legend: p.legend !== false, note: p.note !== false }; } catch {}
  const exported = ({ caption, legend, footnote }) => ({ caption, legend: panels.legend ? legend : [], footnote: panels.note ? footnote : footnote.slice(0, 1) });
  function syncPanels() { $('#demoLegend').hidden = !on || !panels.legend; $('#demoFootnote').hidden = !on || !panels.note;
    $('#demoLegendToggle').setAttribute('aria-pressed', String(panels.legend)); $('#demoNoteToggle').setAttribute('aria-pressed', String(panels.note)); }
  const togglePanel = key => { panels = { ...panels, [key]: !panels[key] }; try { storage.setItem(panelsKey, JSON.stringify(panels)); } catch {} syncPanels(); };
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
    on = Boolean(value); app.classList.toggle('demo', on);
    // Demonstration mode shows the 3D view alone; the projection stays in the right sidebar (ADR-032).
    if (on) current = $('#viewSelect').value;
    for (const id of ['#demoBar', '#demoCaption']) $(id).hidden = !on; syncPanels();
    sceneView.setDemo(on); renderViews(); render(); onToggle(on);
  }
  function screenshot() {
    const shot = sceneView.capture(); if (!shot) return;
    const { caption, legend, footnote } = exported(describe()), ratio = shot.image.width / shot.width, out = document.createElement('canvas');
    out.width = shot.image.width; out.height = shot.image.height;
    const ctx = out.getContext('2d'); ctx.drawImage(shot.image, 0, 0); ctx.scale(ratio, ratio);
    drawOps(ctx, snapshotLayout({ width: shot.width, height: shot.height, caption, legend, footnote, labels: shot.labels }));
    out.toBlob(blob => download(blob, demoFileName(datasetId, new Date())), 'image/png');
  }
  // Short animation (FR-M5): a guided tour through the presets and saved views, or one turn around the target, each frame
  // drawn with the same caption, legend, labels and footnote as a screenshot. Frames are encoded with exact timestamps
  // (WebCodecs + webm-muxer.js), so the video is smooth at 30 fps however slowly this machine renders; browsers without
  // WebCodecs record in real time instead. Esc cancels.
  let recording = null;
  async function encoderConfig(width, height, fps) {
    if (typeof VideoEncoder === 'undefined') return null;
    for (const [codec, id] of [['vp09.00.10.08', 'V_VP9'], ['vp8', 'V_VP8']]) {
      const config = { codec, width, height, bitrate: 8e6, framerate: fps };
      try { if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, id }; } catch {}
    }
    return null;
  }
  async function record() {
    if (recording) return;
    const start = sceneView.cameraView(); if (!start) return;
    const fps = 30, frames = $('#demoAnimKind').value === 'orbit' ? orbitFrames(start, { fps, seconds: 12 })
      : tourFrames([...presets().map(p => sceneView.presetView(p.id)), ...saved.map(v => ({ position: v.position, target: v.target }))], { fps, moveSeconds: 2, holdSeconds: 1 });
    const box = $('#webgl').getBoundingClientRect(), width = Math.round(box.width / 2) * 2, height = Math.round(box.height / 2) * 2;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'), text = exported(describe()), button = $('#demoRecord'), state = recording = { cancelled: false, stop: null };
    const draw = index => { drawOps(ctx, snapshotLayout({ width, height, ...text, labels: sceneView.drawFrame(frames[index], ctx, width, height) })); };
    const finish = () => { recording = null; sceneView.setRecording(false); sceneView.setCameraView(start); button.textContent = '录制动画'; bar.classList.remove('recording'); };
    sceneView.setRecording(true); bar.classList.add('recording'); button.textContent = '准备录制…';
    const encoding = await encoderConfig(width, height, fps);
    if (encoding) {
      const chunks = []; let failure = null;
      const encoder = new VideoEncoder({ output: chunk => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push({ data, timestampUs: chunk.timestamp, key: chunk.type === 'key' }); },
        error: error => { failure = error; } });
      encoder.configure(encoding.config);
      for (let i = 0; i < frames.length && !state.cancelled && !failure; i++) {
        draw(i);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: i % (2 * fps) === 0 }); frame.close();
        button.textContent = `生成中… ${i + 1}/${frames.length} 帧（Esc 取消）`;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      if (!failure) await encoder.flush().catch(error => { failure = error; });
      encoder.close(); finish();
      if (failure) { console.error(failure); alert('动画编码失败：' + failure.message); return; }
      if (!state.cancelled) download(new Blob([muxWebm({ codec: encoding.id, width, height, frames: chunks, durationUs: frames.length * 1e6 / fps })], { type: 'video/webm' }), demoFileName(datasetId, new Date(), 'webm'));
      return;
    }
    const type = videoType(); if (!type) { finish(); return; }
    const recorder = new MediaRecorder(canvas.captureStream(fps), { mimeType: type[0], videoBitsPerSecond: 8e6 }), chunks = [], seconds = Math.round(frames.length / fps);
    state.stop = () => recorder.stop();
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => { finish(); if (!state.cancelled) download(new Blob(chunks, { type: type[0] }), demoFileName(datasetId, new Date(), type[1])); };
    recorder.start(1000);
    let began = null;
    const step = now => {
      if (state.cancelled || recorder.state !== 'recording') return;
      began ??= now;
      const index = Math.floor((now - began) / 1000 * fps);
      if (index >= frames.length) { recorder.stop(); return; }
      draw(index);
      button.textContent = `录制中… ${Math.min(seconds, Math.floor((now - began) / 1000))}/${seconds} s（Esc 取消）`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  $('#demoMode').onclick = () => setOn(!on);
  $('#demoExit').onclick = () => setOn(false);
  $('#demoShot').onclick = screenshot;
  $('#demoRecord').onclick = record;
  if (!videoType() && typeof VideoEncoder === 'undefined') { $('#demoRecord').disabled = true; $('#demoRecord').title = '此浏览器不支持录制视频'; }
  $('#demoLegendToggle').onclick = () => togglePanel('legend'); $('#demoNoteToggle').onclick = () => togglePanel('note');
  $('#demoSaveView').onclick = () => {
    const view = sceneView.cameraView(); if (!view) return;
    const number = saved.reduce((max, v) => Math.max(max, +v.id.replace(/^view-/, '') || 0), 0) + 1, name = prompt('视角名称', `视角 ${number}`);
    if (name === null) return;
    saved.push({ id: `view-${number}`, name: name.trim().slice(0, 40) || `视角 ${number}`, ...view }); current = `view-${number}`; persist(); renderViews();
  };
  root.addEventListener('keydown', event => {
    if (!on || event.target.closest?.('input, select, textarea') || (recording && event.key !== 'Escape')) return;
    if (event.key === 'Escape' && recording) { recording.cancelled = true; recording.stop?.(); }
    else if (event.key === 'Escape') setOn(false);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(cycleView(sequence(), current, event.key === 'ArrowRight' ? 1 : -1)); }
  });
  return Object.freeze({ render, get on() { return on; } });
}
