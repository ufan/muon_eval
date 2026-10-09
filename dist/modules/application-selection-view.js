import { applicationSelectionSearch } from './application-selection.js';

export function createApplicationSelectionView({ registry, selection, scenarios, backendLabel, description, title, frame, root=document, navigate=search=>{location.search=search;} }) {
  const panel=root.createElement('section');panel.className='application-selection';
  panel.innerHTML='<h2>数据集与计算后端</h2><label>发布版本<select id="datasetSelect"></select></label><label>几何后端<select id="backendSelect"></select></label><label id="scenarioSelectLabel">冻结工况<select id="scenarioSelect"></select></label><button id="loadSelection" type="button">载入所选配置</button><p id="applicationBackendInfo" class="hint"></p>';
  root.querySelector('.left').prepend(panel);const $=id=>panel.querySelector('#'+id);
  const option=(select,value,label)=>{const node=root.createElement('option');node.value=value;node.textContent=label;select.append(node);};
  for(const [id,entry] of Object.entries(registry.datasets))if(!entry.adapter||entry.adapter==='dam-spec-v07')option($('datasetSelect'),id,id);
  $('datasetSelect').value=selection.datasetId;
  function configureBackend(){const entry=registry.datasets[$('datasetSelect').value],backend=entry.adapter==='dam-spec-v07'?'compiled':'legacy';$('backendSelect').replaceChildren();option($('backendSelect'),backend,backend==='compiled'?'Compiled GLB / BVH':'Legacy analytic / DDA');
    const current=$('datasetSelect').value===selection.datasetId;const available=current&&backend==='compiled';$('scenarioSelectLabel').hidden=!available;$('scenarioSelect').disabled=!available;}
  for(const scenario of scenarios)option($('scenarioSelect'),scenario.id,`${scenario.label} · ${Object.entries(scenario.variables).map(([key,value])=>`${key}=${value}`).join(' / ')}`);
  if(selection.scenarioId)$('scenarioSelect').value=selection.scenarioId;
  configureBackend();$('datasetSelect').onchange=configureBackend;
  $('loadSelection').onclick=()=>navigate(applicationSelectionSearch({datasetId:$('datasetSelect').value,backend:$('backendSelect').value,scenarioId:$('scenarioSelect').disabled?null:$('scenarioSelect').value}));
  $('applicationBackendInfo').textContent=`${selection.datasetId} · ${backendLabel} · ${description}`;
  if(title){root.querySelector('.title').textContent=title+' · 缪子部署评估';root.title=title+' · 缪子部署评估';}
  if(frame){
    for(const [index,axis] of ['X','Y','Z'].entries()){
      const label=root.querySelector('#'+axis.toLowerCase()).closest('label');label.firstChild.textContent=axis+' 模型坐标 / m';label.title=frame[axis]??'model_frame';
      const definition=root.querySelectorAll('.axis-definitions span')[index];definition.lastChild.textContent=axis+'+ 模型轴';definition.title=frame[axis]??'model_frame';
    }
    // Fixed left/right bank labels are not valid under an arbitrary model view.
    root.querySelector('.bank-directions').style.display='none';
  }
  return Object.freeze({panel});
}
