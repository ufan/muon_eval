import { materialFieldFromProjection, mapPatternOverlayToGraph } from './projection-pattern-fields.js';
import { extractContributionContours } from './contribution-contours.js';
import { responsePattern } from './response-patterns.js';
import { drawContributionPaths } from './contribution-view.js';
import { comparePatternResults, createPatternComparisonExport, replayPatternComparison } from './pattern-comparison.js';

export function createMainPatternView({ canvas, host, backendLabel = 'compiled', onExportComparison = () => {}, onExportResult = () => {} }) {
  const wrapper = document.createElement('div'); wrapper.style.cssText = 'grid-column:2;grid-row:1;position:relative;min-width:0';
  canvas.before(wrapper); wrapper.append(canvas); canvas.style.width = '100%'; canvas.style.display = 'block';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'mainPatternOverlay';
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden'; wrapper.append(svg);
  // Expert diagnostics (FR-M14, ADR-030): numeric contour layers, off by default.
  const diagnostics = document.createElement('details'); diagnostics.id = 'expertDiagnostics'; diagnostics.className = 'target-layers';
  diagnostics.innerHTML = '<summary>专家诊断 <span>默认关闭</span></summary><div style="padding:6px;font-size:11px"><label><input id="mainMaterialContours" type="checkbox">材料贡献（自适应检查，不可跨图比较）</label><label><input id="mainResponseContours" type="checkbox">原始透射率等值线 .01/.1/.5/.9</label><p id="mainPatternLegend"></p><p>有限模型参考线与采样包络仅在<a id="workbenchLinkDiagnostics" href="./geometry-preview.html">数据集检查</a>中提供，不授予真实物理界面资格。接受度/开天通量影响计数，采样加密不等于物理分辨率。无安全、可达性或实测标定结论。</p></div>';
  // Comparison of candidates ticked "比较" in the candidate list (FR-P6); rows come from their cached results.
  const controls = document.createElement('details'); controls.id = 'mainPatternControls'; controls.className = 'target-layers';
  controls.innerHTML = '<summary>方案比较 <span id="mainComparisonCount">—</span></summary><div style="padding:6px;font-size:11px"><p class="hint">在候选部署点列表中勾选“比较”。</p><div id="mainComparisonSummary"></div><button id="mainExportComparison" type="button" disabled>导出比较 v1</button><button id="exportResult" type="button" disabled>导出当前结果</button><label>重放比较<input id="mainImportComparison" type="file" accept=".json,application/json"></label><div id="mainReplaySummary"></div><p>后端身份见当前计算记录。</p></div>';
  host.append(controls, diagnostics);
  const $ = id => controls.querySelector(`#${id}`) ?? diagnostics.querySelector(`#${id}`); let current = null, lastMode = 'counts', lastObject, lastSettings;
  const selection = { kind: 'material', id: 'concrete', minimumPathM: .15 };
  const indicatorText = (m, fields) => m ? `混凝土覆盖 ${(100 * m.targetFieldCoverage).toFixed(1)}%采样格 · 计数支持 ${m.targetExpectedCount.toPrecision(4)} · ΔT ${m.transmissionContrast?.toPrecision(3) ?? '未定义'} · 方向质心间距 ${m.targetBackgroundAngularSeparationDeg?.toPrecision(3) ?? '未定义'}° · 参数差异 ${fields.join(', ') || '无'}` : '指标不可用';
  // rows: [{ label, state: 'ready' | 'running' | 'queued' | 'failed' | 'pending' }]; comparison from compareEntries over the ready ones.
  function showCandidates(rows, comparison) {
    const summary = $('mainComparisonSummary'); summary.replaceChildren();
    $('mainComparisonCount').textContent = rows.length ? `${rows.length} 个候选` : '—';
    $('mainExportComparison').disabled = !rows.length || rows.some(row => row.state !== 'ready');
    if (!rows.length) { summary.textContent = '未勾选候选'; return; }
    let ready = 0;
    rows.forEach((row, i) => {
      const p = document.createElement('p');
      p.textContent = `${i + 1}. ${row.label}: ` + (row.state === 'ready' ? indicatorText(comparison.rows[ready].indicators, comparison.differences[ready++].fields)
        : { running: '计算中…', queued: '排队计算', failed: '计算失败', pending: '等待计算' }[row.state]);
      summary.append(p);
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
  const download = (text, name) => { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = window.document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  // Export needs the full results: the page recomputes the compared candidates and passes [{ label, result }].
  $('mainExportComparison').onclick = async () => {
    const button = $('mainExportComparison'); button.disabled = true; button.textContent = '准备完整结果…';
    try { const entries = await onExportComparison(); download(JSON.stringify(createPatternComparisonExport(entries.map(e => ({ ...e, references: [] })), selection)), 'pattern-comparison-v1.json'); }
    catch (error) { $('mainComparisonSummary').append(Object.assign(document.createElement('p'), { textContent: `导出失败: ${error.message}` })); }
    finally { button.textContent = '导出比较 v1'; button.disabled = false; }
  };
  $('exportResult').onclick = () => { if (current) download(JSON.stringify(current), 'detector-assessment-result.json'); onExportResult(current); };
  $('mainImportComparison').onchange = async event => {
    try { const file = event.target.files[0]; if (!file) return; if (file.size > 50 * 1024 * 1024) throw new Error('文件超过50 MB');
      const document = replayPatternComparison(JSON.parse(await file.text()));
      if (document.entries.length > 20 || JSON.stringify(document.comparison.selection) !== JSON.stringify(selection)) throw new Error('当前主界面仅支持混凝土 .15 m ROI，最多20行');
      // A replayed comparison is shown as it was exported; it is not merged with the candidates.
      const comparison = comparePatternResults(document.entries.map(e => e.result), selection), out = $('mainReplaySummary'); out.replaceChildren();
      document.entries.forEach((entry, i) => out.append(Object.assign(window.document.createElement('p'), { textContent: `重放 ${i + 1}. ${entry.label}: ${indicatorText(comparison.rows[i].indicators, comparison.differences[i].fields)}` })));
    } catch (error) { $('mainReplaySummary').textContent = `重放失败: ${error.message}`; }
  };
  showCandidates([], null);
  return { update(result, mode) { current = result; $('exportResult').disabled = false; redraw(mode); }, showCandidates, selection,
    redraw, invalidate() { current = null; svg.replaceChildren(); $('exportResult').disabled = true; $('mainPatternLegend').textContent = backendLabel+' · 等待当前计算'; } };
}
