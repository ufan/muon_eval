import { applicationSelectionSearch } from './application-selection.js';

export function createApplicationSelectionView({ registry, selection, scenarios, backendLabel, description, title, frame, axisLabels=null, root=document, navigate=search=>{location.search=search;} }) {
  // Data configuration lives in a header menu ("数据配置 ▾"), not the sidebar: it is chosen rarely and reloads the page.
  const menu=root.createElement('div');menu.className='data-menu';
  menu.innerHTML='<button id="dataMenuButton" class="header-secondary" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="dataMenu">数据配置 ▾</button><section id="dataMenu" class="application-selection data-options" aria-label="数据集与计算后端" hidden><h2>数据集与计算后端</h2><label>发布版本<select id="datasetSelect"></select></label><label>几何后端<select id="backendSelect"></select></label><label id="scenarioSelectLabel">冻结工况<select id="scenarioSelect"></select></label><button id="loadSelection" type="button">载入所选配置</button><p id="applicationBackendInfo" class="hint"></p></section>';
  root.querySelector('.header-actions').prepend(menu);
  const panel=menu.querySelector('#dataMenu'),button=menu.querySelector('#dataMenuButton'),$=id=>panel.querySelector('#'+id);
  const setOpen=open=>{panel.hidden=!open;button.setAttribute('aria-expanded',String(open));};
  button.onclick=event=>{event.stopPropagation();setOpen(panel.hidden);};
  root.addEventListener('click',event=>{if(!panel.hidden&&!event.target.closest('.data-menu'))setOpen(false);});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){setOpen(false);button.focus();}});
  const option=(select,value,label)=>{const node=root.createElement('option');node.value=value;node.textContent=label;select.append(node);};
  for(const [id,entry] of Object.entries(registry.datasets))if(entry.adapter==='dam-spec-v07')option($('datasetSelect'),id,id);
  $('datasetSelect').value=selection.datasetId;
  function configureBackend(){const backend='compiled';$('backendSelect').replaceChildren();option($('backendSelect'),backend,'Compiled GLB / BVH');
    const current=$('datasetSelect').value===selection.datasetId;const available=current&&backend==='compiled';$('scenarioSelectLabel').hidden=!available;$('scenarioSelect').disabled=!available;}
  for(const scenario of scenarios)option($('scenarioSelect'),scenario.id,`${scenario.label} · ${Object.entries(scenario.variables).map(([key,value])=>`${key}=${value}`).join(' / ')}`);
  if(selection.scenarioId)$('scenarioSelect').value=selection.scenarioId;
  configureBackend();$('datasetSelect').onchange=configureBackend;
  $('loadSelection').onclick=()=>navigate(applicationSelectionSearch({datasetId:$('datasetSelect').value,backend:$('backendSelect').value,scenarioId:$('scenarioSelect').disabled?null:$('scenarioSelect').value}));
  $('applicationBackendInfo').textContent=button.title=`${selection.datasetId} · ${backendLabel} · ${description}`;
  if(title){root.querySelector('.title').textContent=title+' · 缪子部署评估';root.title=title+' · 缪子部署评估';}
  if(frame){
    for(const [index,axis] of ['X','Y','Z'].entries()){
      const label=root.querySelector('#'+axis.toLowerCase()).closest('label');label.firstChild.textContent=axis+' 模型坐标 / m';label.title=frame[axis]??'model_frame';
      const definition=root.querySelectorAll('.axis-definitions span')[index];definition.lastChild.textContent=`${axis}+ ${axisLabels?.[axis].zh??'模型轴'}`;definition.title=frame[axis]??'model_frame';
    }
    // Fixed left/right bank labels are not valid under an arbitrary model view; they are replaced by the origin from the display profile's axis labels, when given.
    const origin=root.querySelector('.bank-directions');if(axisLabels){origin.replaceChildren(Object.assign(root.createElement('b'),{textContent:`原点：${axisLabels.origin.zh} · 单位 m`,title:frame.origin??''}));}else origin.style.display='none';
  }
  return Object.freeze({panel});
}
