// Multi-station overview section (#15, FR-M4, FR-M1, FR-M15): one entry per recognition item with the
// multi-view numbers of the shown stations, expandable to each station's own numbers. Rows come from
// overview-table.js; a station name opens that station as the working station.
const percent = (v, digits = 0) => v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(100 * v).toFixed(digits)}%`;
const CLASS_COLORS = { good: '#1a9850', limited: '#fdae61', insufficient: '#d73027', none: '#3c3c3c' };
const CLASS_TEXT = { good: '良好', limited: '有限', insufficient: '不足', none: '未被看到' };

export function createOverviewPanel({ root = document, onSelectStation = () => {}, onHoverItem = () => {} }) {
  const $ = s => root.querySelector(s), host = $('#overviewTable'), status = $('#overviewStatus');
  const open = new Set();
  function stationRow(s) {
    const tr = document.createElement('tr'), name = document.createElement('td');
    if (s.id === 'working') name.textContent = s.name;
    else { const button = document.createElement('button'); button.type = 'button'; button.className = 'link'; button.dataset.overviewStation = s.id;
      button.textContent = s.name; button.title = '设为工作点位，查看其投影'; button.onclick = () => onSelectStation(s.id); name.append(button); }
    if (s.detectorInside) name.append(Object.assign(document.createElement('small'), { textContent: ' · 位于其中', title: '点位所在的构件不计入（与投影轮廓相同）' }));
    const cells = s.state === 'pending' ? ['计算中…', '', ''] : s.inView ? [percent(s.coverage, s.coverage < .01 ? 1 : 0), formatCount(s.counts), percent(s.medianError, 1)] : ['视野外', '', ''];
    tr.append(name, ...cells.map(text => Object.assign(document.createElement('td'), { textContent: text })));
    if (s.state !== 'ready' || !s.inView) tr.className = 'out';
    return tr;
  }
  function itemBlock(row, minViews) {
    const details = document.createElement('details'), summary = document.createElement('summary'), m = row.multi;
    details.className = 'overview-item'; details.dataset.overviewItem = row.id; details.open = open.has(row.id);
    details.ontoggle = () => { details.open ? open.add(row.id) : open.delete(row.id); };
    const bar = m ? `<span class="class-bar" title="${Object.entries(m.classShares).map(([k, v]) => `${CLASS_TEXT[k]} ${percent(v)}`).join(' · ')}">${
      Object.entries(m.classShares).map(([k, v]) => v > 0 ? `<i style="--c:${CLASS_COLORS[k]};flex:${v}"></i>` : '').join('')}</span>` : '';
    summary.innerHTML = `<b><i class="swatch" style="--c:${row.color}"></i>${escape(row.label.zh)}</b>${bar}<span class="numbers">`
      + `<span title="成像中出现该目标的点位数">${row.seenBy} 站</span>`
      + `<span title="目标内部采样点中有 ≥${minViews} 个可用视角的比例">≥${minViews} 视角 ${m ? percent(m.shareMinViews) : '—'}</span>`
      + `<span title="≥2 个可用视角的点上，可用视角最大张角的中位数">张角 ${m?.medianSpreadDeg == null ? '—' : m.medianSpreadDeg.toFixed(0) + '°'}</span>`
      + `<span title="有可用视角的点上，最弱可用视角计数误差的中位数">误差 ${m ? percent(m.medianWeakestError, 1) : '—'}</span>`
      + `${m?.pending ? '<em>部分点位计算中</em>' : ''}</span>`;
    summary.onmouseenter = () => onHoverItem(row.id); summary.onmouseleave = () => onHoverItem(null);
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>点位</th><th title="目标在投影图像中所占的像素比例">图像占比</th><th title="目标掩膜内的预计计数">计数</th><th title="目标掩膜内像素计数误差 1/√N 的中位数">误差中位</th></tr></thead>';
    const body = document.createElement('tbody'); body.append(...row.stations.map(stationRow)); table.append(body);
    details.append(summary, table);
    return details;
  }
  return Object.freeze({
    render({ rows, minViews, message }) {
      status.textContent = message;
      host.replaceChildren(...rows.map(row => itemBlock(row, minViews)));
    }
  });
}

function formatCount(v) { return v > 999999 ? (v / 1e6).toFixed(2) + 'M' : v > 999 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)); }
function escape(text) { return String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); }
