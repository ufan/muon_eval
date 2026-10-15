// Per-station projections side by side (#16, FR-M4): one tile per station of the overview set, drawn from its
// cached compact result on the main projection's fixed colour scale, with the horizon, the selected recognition
// outlines and (optionally) the precision lines. A station name opens that station as the working station.
import { outlineRings } from './recognition-layers.js';
import { precisionContours } from './precision-contours.js';
import { colorLevel, heatRgb, entryMask, entryCountField, entryPixel } from './projection-tiles.js';

const SVG = 'http://www.w3.org/2000/svg', SIZE = 240;
const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const formatCount = v => v > 999999 ? (v / 1e6).toFixed(2) + 'M' : v > 999 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));

export function createProjectionTiles({ root = document, onOpenStation = () => {} }) {
  const $ = s => root.querySelector(s), dialog = $('#tilesDialog'), grid = $('#tilesGrid'), readout = $('#tilesReadout');
  let mode = 'counts', last = null;
  const path = (d, cls) => { const p = document.createElementNS(SVG, 'path'); p.setAttribute('d', d); if (cls) p.classList.add(cls); return p; };
  function drawImage(canvas, entry) {
    const ctx = canvas.getContext('2d'), n = entry.n, image = ctx.createImageData(n, n), values = mode === 'counts' ? entry.pixels.displayCount : entry.pixels.displayTransmission;
    values.forEach((v, i) => { const rgb = heatRgb(colorLevel(mode, v)); image.data.set([...rgb.map(c => Math.round(c * 255)), 255], i * 4); });
    const scratch = document.createElement('canvas'); scratch.width = scratch.height = n; scratch.getContext('2d').putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
  }
  function overlay(entry, { items, threshold, precision }) {
    const svg = document.createElementNS(SVG, 'svg'), n = entry.n;
    svg.setAttribute('viewBox', `0 0 ${n} ${n}`); svg.classList.add('tile-outlines');
    if (entry.pixels.side.some(Boolean)) {
      const onBorder = (a, b) => (a[0] === b[0] && (a[0] === 0 || a[0] === n)) || (a[1] === b[1] && (a[1] === 0 || a[1] === n));
      let line = '';
      for (const ring of outlineRings(entry.pixels.side, n)) for (let i = 1; i < ring.length; i++) if (!onBorder(ring[i - 1], ring[i])) line += `M${ring[i - 1].join(',')}L${ring[i].join(',')}`;
      svg.append(path(line, 'horizon'));
    }
    if (precision) for (const { relativeError, lines } of precisionContours(entryCountField(entry))) {
      if (!lines.length) continue;
      const p = path(lines.map(l => 'M' + l.map(q => q.join(',')).join('L')).join(''), 'precision'); p.dataset.level = String(relativeError); svg.append(p);
    }
    for (const item of items) {
      const mask = entryMask(entry, item.id, threshold);
      if (!mask.some(Boolean)) continue;
      const p = path(outlineRings(mask, n).map(ring => 'M' + ring.map(q => q.join(',')).join('L') + 'Z').join(''));
      p.setAttribute('stroke', item.color); p.dataset.item = item.id; svg.append(p);
    }
    return svg;
  }
  function tile(station, state) {
    const figure = document.createElement('figure'), caption = document.createElement('figcaption'), entry = station.entry;
    figure.className = 'tile'; figure.dataset.tile = station.id; figure.style.setProperty('--c', station.color);
    const name = station.id === 'working' ? `<b>${escape(station.name)}</b>` : `<button type="button" class="link" data-tile-station="${escape(station.id)}" title="设为工作点位">${escape(station.name)}</button>`;
    caption.innerHTML = `<i class="swatch"></i>${name}<small>${entry ? `${formatCount(entry.totalCount)} 计数 · 透射 ${(100 * entry.weightedTransmission).toFixed(2)}%` : '计算中…'}</small>`;
    caption.querySelector('[data-tile-station]')?.addEventListener('click', () => { dialog.close(); onOpenStation(station.id); });
    const frame = document.createElement('div'); frame.className = 'tile-image';
    if (entry) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE; drawImage(canvas, entry);
      canvas.addEventListener('mousemove', event => {
        const box = canvas.getBoundingClientRect(), n = entry.n, ix = Math.min(n - 1, Math.max(0, Math.floor((event.clientX - box.left) / box.width * n))),
          iy = Math.min(n - 1, Math.max(0, n - 1 - Math.floor((event.clientY - box.top) / box.height * n))), p = entryPixel(entry, ix, iy);
        readout.textContent = `${station.name} · 像素 (${ix + 1},${iy + 1}) · ${Math.round(p.count)} 事件/${state.exposureDays}天 · 透射 ${(100 * p.transmission).toFixed(3)}% · 柱密度 ${p.mwe.toFixed(0)} m.w.e.${p.side === 'back' ? ' · 后方来向' : ''}`;
      });
      frame.append(canvas, overlay(entry, state));
    } else frame.classList.add('pending');
    figure.append(caption, frame);
    return figure;
  }
  function draw() {
    if (!last || !dialog.open) return;
    const { stations, items } = last;
    for (const button of dialog.querySelectorAll('[data-tiles-mode]')) button.classList.toggle('active', button.dataset.tilesMode === mode);
    grid.replaceChildren(...stations.map(s => tile(s, last)));
    $('#tilesLegend').innerHTML = `${mode === 'counts' ? `${last.exposureDays} 天预计计数，对数刻度 0.1–10⁵` : '透射率，对数刻度 10⁻⁶–1'}，各图相同 · 虚线：地平线（下方为后方来向）`
      + `${last.precision ? ' · 白线：计数误差 10%（虚）/ 5%（实）' : ''}${items.length ? ` · 轮廓：${items.map(i => `<i class="swatch" style="--c:${i.color}"></i>${escape(i.label.zh)}`).join(' ')}（长度 > ${last.threshold} m）` : ''}`;
  }
  for (const button of dialog.querySelectorAll('[data-tiles-mode]')) button.addEventListener('click', () => { mode = button.dataset.tilesMode; draw(); });
  $('#tilesClose').addEventListener('click', () => dialog.close());
  grid.addEventListener('mouseleave', () => { readout.textContent = '悬停查看像素数值；点击点位名称将其设为工作点位。'; });
  return Object.freeze({
    open(state) { last = state; dialog.showModal(); draw(); grid.dispatchEvent(new Event('mouseleave')); },
    // While open, follows the station set and the results as they arrive.
    update(state) { last = state; draw(); },
    get isOpen() { return dialog.open; }
  });
}
