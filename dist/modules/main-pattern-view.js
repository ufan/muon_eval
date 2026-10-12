import { materialFieldFromProjection, mapPatternOverlayToGraph } from './projection-pattern-fields.js';
import { extractContributionContours } from './contribution-contours.js';
import { responsePattern } from './response-patterns.js';
import { drawContributionPaths } from './contribution-view.js';
import { comparePatternResults, createPatternComparisonExport, replayPatternComparison } from './pattern-comparison.js';

export function createMainPatternView({ canvas, host, backendLabel = 'compiled' }) {
  const wrapper = document.createElement('div'); wrapper.style.cssText = 'grid-column:2;grid-row:1;position:relative;min-width:0';
  canvas.before(wrapper); wrapper.append(canvas); canvas.style.width = '100%'; canvas.style.display = 'block';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'mainPatternOverlay';
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden'; wrapper.append(svg);
  const controls = document.createElement('details'); controls.id = 'mainPatternControls'; controls.className = 'target-layers';
  controls.innerHTML = '<summary>数值图案与方案比较</summary><div style="padding:6px;font-size:11px"><label><input id="mainMaterialContours" type="checkbox">材料贡献（自适应检查，不可跨图比较）</label><label><input id="mainResponseContours" type="checkbox">原始透射率等值线 .01/.1/.5/.9</label><button id="mainCaptureComparison" type="button" disabled>保存本站姿态</button><button id="mainExportComparison" type="button" disabled>导出比较 v1</button><button id="mainClearComparison" type="button">清空</button><label>重放比较<input id="mainImportComparison" type="file" accept=".json,application/json"></label><p id="mainPatternLegend"></p><div id="mainComparisonSummary"></div><p>后端身份见当前计算记录；有限模型参考线仅在<a href="./geometry-preview.html">几何预览</a>中提供，不授予真实物理界面资格。接受度/开天通量影响计数，采样加密不等于物理分辨率。无安全、可达性或实测标定结论。</p></div>';
  host.append(controls);
  const $ = id => controls.querySelector(`#${id}`); let current = null, entries = [], lastMode = 'counts', lastObject, lastSettings;
  const selection = { kind: 'material', id: 'concrete', minimumPathM: .15 };
  function showRows() {
    const summary = $('mainComparisonSummary'); summary.replaceChildren(); $('mainExportComparison').disabled = !entries.length;
    if (!entries.length) { summary.textContent = '未保存方案'; return; }
    const comparison = comparePatternResults(entries.map(e => e.result), selection);
    comparison.rows.forEach((row, i) => {
      const p = document.createElement('p'), m = row.indicators;
      p.textContent = `${i + 1}. ${entries[i].label}: 混凝土覆盖 ${(100 * m.targetFieldCoverage).toFixed(1)}%采样格 · 计数支持 ${m.targetExpectedCount.toPrecision(4)} · ΔT ${m.transmissionContrast?.toPrecision(3) ?? '未定义'} · 方向质心间距 ${m.targetBackgroundAngularSeparationDeg?.toPrecision(3) ?? '未定义'}° · 参数差异 ${comparison.differences[i].fields.join(', ') || '无'}`; summary.append(p);
    });
  }
  function redraw(mode = lastMode) {
    lastMode = mode;
    const settings = [mode, $('mainMaterialContours').checked, $('mainResponseContours').checked].join('/');
    if (current === lastObject && settings === lastSettings) return;
    lastObject = current; lastSettings = settings; svg.replaceChildren(); if (!current) return;
    const layers = [], n = current.config.bins;
    try {
      if ($('mainMaterialContours').checked) for (const material of ['concrete', 'rock'].filter(m => Object.hasOwn(current.projectionGeometry.materials, m))) {
        const field = materialFieldFromProjection(current, material);
        for (const overlay of extractContributionContours(field, { mode: 'adaptive' }).overlays) layers.push({ material,
          color: material === 'concrete' ? '#fff069' : '#79edff', overlay, mapped: mapPatternOverlayToGraph(overlay, field, { width: n, height: n }) });
      }
      if ($('mainResponseContours').checked && mode !== 'significance') {
        const pattern = responsePattern(current);
        for (const overlay of pattern.contours.overlays) layers.push({ material: 'response', color: '#65ffb0', overlay,
          mapped: mapPatternOverlayToGraph(overlay, pattern.field, { width: n, height: n }) });
      }
      drawContributionPaths(svg, layers, n);
      $('mainPatternLegend').textContent = `${current.backend} · ${current.config.bins}² · 开天 ${current.pixels.reduce((s, p) => s + p.openCount, 0).toPrecision(5)} 事件（接受度+方向通量）。材料为原始 m.w.e.；响应线为原始 T，颜色为既有平滑显示。${mode === 'significance' ? '显著度模式不叠加响应线。' : ''}`;
    } catch (error) { $('mainPatternLegend').textContent = `图案未解析: ${error.message}`; }
  }
  for (const id of ['mainMaterialContours', 'mainResponseContours']) $(id).onchange = () => redraw();
  $('mainCaptureComparison').onclick = () => { if (!current || entries.length >= 20) return;
    entries.push(structuredClone({ label: `X${current.config.origin[0]} Y${current.config.origin[1]} Z${current.config.origin[2]} az${current.config.azimuthDeg} el${current.config.elevationDeg}`, result: current, references: [] })); showRows(); };
  $('mainClearComparison').onclick = () => { entries = []; showRows(); };
  $('mainExportComparison').onclick = () => { const document = createPatternComparisonExport(entries, selection), url = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' }));
    const link = window.document.createElement('a'); link.href = url; link.download = entries.every(entry => entry.result.kind === 'legacy-detector-assessment') ? 'legacy-pattern-comparison-v1.json' : 'pattern-comparison-v1.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  $('mainImportComparison').onchange = async event => {
    try { const file = event.target.files[0]; if (!file) return; if (file.size > 50 * 1024 * 1024) throw new Error('文件超过50 MB');
      const document = replayPatternComparison(JSON.parse(await file.text()));
      if (document.entries.length > 20 || JSON.stringify(document.comparison.selection) !== JSON.stringify(selection)) throw new Error('当前主界面仅支持混凝土 .15 m ROI，最多20行');
      entries = document.entries; showRows();
    } catch (error) { $('mainComparisonSummary').textContent = `重放失败: ${error.message}`; }
  };
  return { update(result, mode) { current = result; $('mainCaptureComparison').disabled = false; redraw(mode); },
    redraw, invalidate() { current = null; svg.replaceChildren(); $('mainCaptureComparison').disabled = true; $('mainPatternLegend').textContent = backendLabel+' · 等待当前计算'; } };
}
