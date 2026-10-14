// Demonstration mode (#17, FR-M5): text and layout of a presentation screenshot, which always carries the
// identity of what is shown and the limitations of the numbers. Pure: returns drawing operations
// ({ type: 'rect' | 'text' | 'dot', … }, CSS pixels) that the page draws on a canvas; no DOM.
const WIDE = /[⺀-鿿豈-﫿＀-￯　-〿]/;
const units = text => [...text].reduce((sum, c) => sum + (WIDE.test(c) ? 1 : .55), 0);

// Lines of at most `maxUnits` display units (a CJK character is one unit, other characters about half);
// Latin words are kept whole.
export function wrapText(text, maxUnits) {
  const tokens = String(text).match(/[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+|\s+/g) ?? [];
  const lines = [];
  let line = '';
  for (const token of tokens) {
    if (line.trim() && units(line + token) > maxUnits && token.trim()) { lines.push(line.trim()); line = token; }
    else line += token;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

const pad = v => String(v).padStart(2, '0');
const day = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// What the numbers are and are not, with the inputs they depend on.
export function demoFootnote({ release, scenario, exposureDays, detector, date }) {
  return [`快速评估的近似结果，用于部署方案比较，非施工或安全结论。`,
    `数据集 ${release} · 工况 ${scenario} · 曝光 ${exposureDays} 天 · 探测器 ${detector} · ${day(date)}`];
}

export const demoFileName = (datasetId, date) =>
  `muography-demo-${datasetId.replace(/[^A-Za-z0-9.-]+/g, '_')}-${day(date).replaceAll('-', '')}-${pad(date.getHours())}${pad(date.getMinutes())}.png`;

// The next view of a guided sequence (wraps around); an unknown current view starts at the first.
export function cycleView(views, current, step) {
  const i = views.indexOf(current);
  if (i < 0) return views[0];
  return views[(i + step + views.length) % views.length];
}

// Caption at the top left, legend above the footnote band, footnote across the bottom, station labels next to
// their markers ({ text, color, x, y } in image pixels), all kept inside the image.
export function snapshotLayout({ width, height, caption, legend = [], footnote = [], labels = [] }) {
  const base = Math.max(12, Math.round(Math.min(width, height) / 70)), ops = [], margin = Math.round(base * .8);
  const textWidth = (text, size) => units(text) * size;
  // Footnote band.
  const footSize = Math.round(base * .85), footLines = footnote.flatMap(line => wrapText(line, (width - 2 * margin) / footSize)), footLine = Math.round(footSize * 1.45);
  const footHeight = footLines.length ? footLines.length * footLine + margin : 0;
  if (footLines.length) {
    ops.push({ type: 'rect', x: 0, y: height - footHeight, w: width, h: footHeight, fill: '#071018d9' });
    footLines.forEach((text, i) => ops.push({ type: 'text', text, x: margin, y: height - footHeight + margin / 2 + footSize + i * footLine, size: footSize, weight: 400, fill: i < footLines.length - 1 || footLines.length === 1 ? '#e9f2f5' : '#9fb4bf' }));
  }
  // Caption.
  const titleSize = Math.round(base * 1.3), subSize = base, maxUnits = (width - 4 * margin) / titleSize;
  const titleLines = wrapText(caption.title, maxUnits), subLines = caption.subtitle ? wrapText(caption.subtitle, (width - 4 * margin) / subSize) : [];
  const captionWidth = Math.min(width - 2 * margin, Math.max(...titleLines.map(t => textWidth(t, titleSize)), ...subLines.map(t => textWidth(t, subSize)), 0) + 2 * margin);
  const captionHeight = titleLines.length * titleSize * 1.3 + subLines.length * subSize * 1.4 + margin * 1.2;
  ops.push({ type: 'rect', x: margin, y: margin, w: captionWidth, h: Math.min(captionHeight, height - footHeight - 2 * margin), fill: '#071018cc' });
  let y = margin + margin * .6;
  for (const text of titleLines) { y += titleSize * 1.05; ops.push({ type: 'text', text, x: 2 * margin, y, size: titleSize, weight: 700, fill: '#e9f2f5' }); y += titleSize * .25; }
  for (const text of subLines) { y += subSize * 1.15; ops.push({ type: 'text', text, x: 2 * margin, y, size: subSize, weight: 400, fill: '#9fb4bf' }); y += subSize * .25; }
  // Legend, bottom up above the footnote.
  const legendSize = Math.round(base * .9), legendLine = Math.round(legendSize * 1.5);
  const legendLines = legend.flatMap(entry => wrapText(entry.text, (width / 2) / legendSize).map((text, i) => ({ text, color: i ? null : entry.color })));
  if (legendLines.length) {
    const top = height - footHeight - margin - legendLines.length * legendLine, legendWidth = Math.min(width - 2 * margin, Math.max(...legendLines.map(l => textWidth(l.text, legendSize))) + 3 * margin + legendSize);
    ops.push({ type: 'rect', x: margin, y: Math.max(0, top - margin / 2), w: legendWidth, h: legendLines.length * legendLine + margin, fill: '#071018cc' });
    legendLines.forEach((line, i) => {
      const baseline = top + i * legendLine + legendSize;
      if (line.color) ops.push({ type: 'dot', x: 2 * margin, y: baseline - legendSize * .35, r: legendSize * .35, fill: line.color });
      ops.push({ type: 'text', text: line.text, x: 2 * margin + legendSize, y: baseline, size: legendSize, weight: 400, fill: '#e9f2f5' });
    });
  }
  // Station labels.
  const labelSize = Math.round(base * .85);
  for (const label of labels) {
    const w = textWidth(label.text, labelSize) + labelSize, h = labelSize * 1.5;
    const x = Math.min(Math.max(0, label.x + 10), width - w - 1), top = Math.min(Math.max(0, label.y - h / 2), height - footHeight - h - 1);
    ops.push({ type: 'rect', x, y: top, w, h, fill: '#071018cc', stroke: label.color });
    ops.push({ type: 'text', text: label.text, x: x + labelSize / 2, y: top + labelSize * 1.1, size: labelSize, weight: 600, fill: '#e9f2f5' });
  }
  return ops;
}
