import { createMainPatternView } from './main-pattern-view.js';
import { deviceSettingsData as serializeDeviceSettings } from './device-configuration.js';
import { createRecognitionPanel } from './recognition-panel-view.js';
import { createFeatureLayerPanel } from './feature-layer-panel-view.js';
import { featureLayerGroups, featuresInView } from './feature-layers.js';
import { parsePlan, detectorFromSettings } from './plan-format.js';
import { parseWorkspace, serializeWorkspace, selectWorkspace, selectionFromPlan, detectorWithoutExposure } from './workspace-format.js';
import { openWorkspace, saveWorkspace, saveWorkspaceSession } from './workspace-store.js';
import { mergeSelection, importedFocus } from './workspace-import.js';
import { createWorkspaceState } from './workspace-state.js';
import { assessmentKey, compactResult, compactItemLengths, createResultCache, createCandidateQueue, compareEntries, entryCountsBottomFirst } from './candidate-results.js';
import { overviewTable } from './overview-table.js';
import { createOverviewPanel } from './overview-panel-view.js';
import { createProjectionTiles } from './projection-tiles-view.js';
import { createDemoView } from './demo-view.js';
import { createTaskMode } from './task-mode.js';
import { aimAt as aimPose } from './detector-pose.js';
import { shortcutFor } from './view-shortcuts.js';
import { demoFootnote } from './demo-snapshot.js';
import { selectionHref, APP_PAGES } from './application-selection.js';
import { placementPoint } from './coverage-map.js';
import { readDisplayState, shownStations } from './display-state.js';
import { pageConfirm, pagePrompt, pageChoose, pageChecklist, pageAlert, pageText, downloadText } from './page-dialog.js';
export function createMainPage({workbenchHref='./geometry-preview.html',datasetId,datasetVersion,features,featureLayerOptions={},recognitionItems,state,sceneView,projectionView,createController,createPort,placeInCavity=()=>null,sliceMask=null,targetSamples=null,scenarioId=null,releases=[],candidateIds=[],capabilities,environmentDescription,backendLabel,root=document,storage=localStorage}){
 const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];

 const projection={mode:'counts',data:null,recognition:null,precision:false};
 const precisionKey=`muon-precision:${datasetId}`;try{projection.precision=storage.getItem(precisionKey)==='1';}catch{}
 // The release's workspace (muography-workspace 2.0, ADR-033): saved stations grouped by site (我的点位), deployments and
 // read-only studies, plus the session (working draft, ticked stations shown in 3D, exposure) — workspace-state.js.
 let datasetStations=[],study=null,workingKey=null,workingBusy=false;
 const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
 const mainPatterns=createMainPatternView({canvas:$('#projectionCanvas'),host:$('#multiPanel'),diagnosticsHost:$('#singlePanel'),backendLabel,onExportComparison:()=>fullResults(study.compared)});
 const recognition=createRecognitionPanel({root,features,items:recognitionItems,storage,storageKey:`muon-recognition:${datasetId}`,onChange:()=>{projection.recognition=recognition.state();drawProjection();renderOverview();},onHoverItem:item=>sceneView.emphasiseFeatures(item?.kind==='features'?[...item.featureIds]:[])});
 const layerFeatureIds=featureLayerGroups(features,featureLayerOptions).filter(group=>group.listed).flatMap(group=>group.featureIds);
 const featureLayers=createFeatureLayerPanel({root,features,featureLayers:featureLayerOptions,storage,storageKey:`muon-feature-layers:${datasetId}`,onVisibility:(id,visible)=>sceneView.setFeatureVisible(id,visible),onHoverFeatures:ids=>sceneView.emphasiseFeatures(ids)});projection.recognition=recognition.state();
 // The working station's input; it refers to the plan only while it equals its candidate (study-state.js).
 const inputs=()=>study.snapshot();
 // Per-candidate results (FR-P10): compact entries by assessment key, filled one at a time in the background;
 // the queue yields while the working station computes.
 const results=createResultCache(),candidateKey=id=>assessmentKey(study.candidateInput(id));
 const queue=createCandidateQueue({port:createPort(),compact:full=>compactResult(full.patternResult,{selection:mainPatterns.selection,recognition:compactItemLengths(full,recognitionItems)}),onEntry:(key,entry)=>results.set(key,entry),onError:(key,error)=>console.warn('Candidate evaluation failed:',error.message),onChange:()=>{renderList();showComparison();}});
 const resumeQueue=()=>{if(!workingBusy)queue.resume();};
 function refreshCandidates(){const jobs=study.plan.stations.map(s=>({id:s.id,key:candidateKey(s.id)})),compared=new Set(study.compared);results.retain([...jobs.map(j=>j.key),workingKey]);
  queue.request([...jobs.filter(j=>compared.has(j.id)),...jobs.filter(j=>!compared.has(j.id))].filter(j=>!results.has(j.key)&&!(workingBusy&&j.key===workingKey)).map(j=>({key:j.key,input:study.candidateInput(j.id)})));}
 // Full results for an export are recomputed through the same port (the cache keeps only the compact form).
 async function fullResults(ids){queue.pause();try{const port=createPort(),entries=[];for(const id of ids){const full=await port.open(study.candidateInput(id)).evaluate('final');entries.push({label:study.candidate(id).name,result:full.patternResult});}return entries;}finally{resumeQueue();}}
 const controller=createController({readInputs:inputs,onInvalidate(){workingBusy=true;queue.pause();mainPatterns.invalidate();projection.data=null;sceneView.setCoverageResult(null);sceneView.setFeaturesInView(null);recognition.update(null);projection.recognition=recognition.state();$('#projectionReadout').textContent='姿态更新中…';$('#projectionSummary').textContent='计算中…';},onStart(input){workingKey=assessmentKey(input);workingBusy=true;queue.pause();sceneView.drawDetector(input.station,input.device);},onQuick({metrics}){if(metrics)showQuickMetrics(metrics);},onProgress({quality,progress}){$('#projectionReadout').textContent=`${quality==='preview'?'快速预览':'精细投影'}计算中… ${Math.round(100*progress)}%`;},onResult(data,input){projection.data=data;sceneView.setCoverageResult(data,input.device);sceneView.setFeaturesInView(featuresInView(data,layerFeatureIds,{threshold:recognition.state().threshold}));recognition.update(data);projection.recognition=recognition.state();if(data.quality==='final'){updateProjectionAssessment(data,input.station);mainPatterns.update(data.patternResult,projection.mode);results.set(assessmentKey(input),compactResult(data.patternResult,{selection:mainPatterns.selection,recognition:compactItemLengths(data,recognitionItems)}));workingBusy=false;refreshCandidates();resumeQueue();renderList();showComparison();}drawProjection();},onError(error){console.error(error);workingBusy=false;resumeQueue();$('#projectionReadout').textContent='评估计算失败：'+error.message;}});
 const scheduleDetectorUpdate=()=>controller.schedule(),resize=()=>sceneView.resize(),setView=mode=>sceneView.setView(mode);
 const drawProjection=()=>projectionView.draw(projection,study.configuration.response);
 // One exposure for every station of the session (ADR-033): changing it in the form recomputes all stations.
 const applyDeviceSettings=s=>{study.configure(s);if(Number.isInteger(s.exposureDays)&&s.exposureDays!==study.exposureDays){study.setExposure(s.exposureDays);persistSession();refreshCandidates();}};
 const deviceSettingsData=()=>study.working.settings;
 $('#projectionToggle')?.addEventListener('click',()=>{const b=$('#projectionBody'),hidden=b.style.display==='none';b.style.display=hidden?'block':'none';$('#projectionToggle').textContent=hidden?'−':'+'});
$$('[data-projection]').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;projection.mode=b.dataset.projection;$$('[data-projection]').forEach(x=>x.classList.toggle('active',x===b));mainPatterns.redraw(projection.mode);drawProjection()}));

function constrainProjectionPanel(){const panel=$('#projectionPanel'),viewport=$('#viewport');if(!panel||!viewport||!panel.style.left||!panel.closest('#viewport'))return;const maxX=Math.max(0,viewport.clientWidth-panel.offsetWidth),maxY=Math.max(0,viewport.clientHeight-panel.offsetHeight),xRatio=Number(panel.dataset.xRatio),yRatio=Number(panel.dataset.yRatio),x=Number.isFinite(xRatio)?maxX*xRatio:parseFloat(panel.style.left)||0,y=Number.isFinite(yRatio)?maxY*yRatio:parseFloat(panel.style.top)||0;panel.style.left=Math.max(0,Math.min(maxX,x))+'px';panel.style.top=Math.max(0,Math.min(maxY,y))+'px'}
function makeProjectionDraggable(){const panel=$('#projectionPanel'),handle=$('#projectionHandle'),viewport=$('#viewport');let drag=null;handle.addEventListener('pointerdown',e=>{if(e.target.closest('button')||!panel.closest('#viewport'))return;const p=panel.getBoundingClientRect(),v=viewport.getBoundingClientRect();drag={dx:e.clientX-p.left,dy:e.clientY-p.top,v};panel.style.right='auto';handle.setPointerCapture(e.pointerId)});handle.addEventListener('pointermove',e=>{if(!drag)return;const maxX=Math.max(0,drag.v.width-panel.offsetWidth),maxY=Math.max(0,drag.v.height-panel.offsetHeight),x=Math.max(0,Math.min(maxX,e.clientX-drag.v.left-drag.dx)),y=Math.max(0,Math.min(maxY,e.clientY-drag.v.top-drag.dy));panel.style.left=x+'px';panel.style.top=y+'px';panel.dataset.xRatio=maxX?String(x/maxX):'0';panel.dataset.yRatio=maxY?String(y/maxY):'0'});handle.addEventListener('pointerup',e=>{drag=null;handle.releasePointerCapture(e.pointerId)});handle.addEventListener('pointercancel',()=>drag=null)}
 // One summary line under the projection title (replaces the former 站点评估 box): total counts and the weighted transmission.
 function updateProjectionAssessment(d){if(!d||d.quality!=='final')return;$('#projectionSummary').textContent=`总计数 ${formatCount(d.total)} / ${study.configuration.response.exposureDays} 天 · 加权穿透率 ${(100*d.weightedTransmission).toFixed(2)}%`;}
 // Candidate list (FR-P6): fixed candidates with their result status; the active row is the working station's source.
 const formatCount=v=>v>999999?(v/1e6).toFixed(2)+'M':v>999?(v/1000).toFixed(1)+'k':String(Math.round(v));
 function candidateState(id){const key=candidateKey(id);return results.has(key)?'ready':queue.state(key)??(workingBusy&&key===workingKey?'running':'pending');}
 const STATE_TEXT={running:'计算中…',queued:'排队计算',failed:'计算失败',pending:'待计算'};
 // Other stations in the coverage view (14d sketching): a stable colour per candidate, shown as a swatch in the list.
 // No red: red is the geometric count tint.
 const EXTRA_COLORS=['#4fc3f7','#ffd54f','#81c784','#ba68c8','#4db6ac','#9fa8da','#90a4ae','#dce775'];let coverageSignature='',displayState=readDisplayState(null);
 // The other stations shown in 3D and summarised in 多站 (display-state.js): the compared candidates while 其他点位 is on.
 // The candidate loaded as the working station is shown once, as the working station, also while it has unsaved edits
 // (its saved pose was drawn as a second station on top of it, owner review 2026-10-16).
 function shownSet(){return shownStations(displayState,{pool:study.plan.stations.map(s=>s.id),compared:study.compared,working:workingActive?study.working.from:null});}
 function coverageExtras(){const pool=study.plan.stations.map(s=>s.id);
  return shownSet().ids.map(id=>{const s=study.candidate(id),input=study.candidateInput(id);
   const entry=results.get(assessmentKey(input));
   return{id,name:s.name,x:s.position[0],y:s.position[1],z:s.position[2],az:s.pose.azimuthDeg,el:s.pose.elevationDeg,device:input.device,color:EXTRA_COLORS[pool.indexOf(id)%EXTRA_COLORS.length],n:entry?.n,counts:entryCountsBottomFirst(entry),entry:entry??null};});}
 function syncCoverageStations(extras=coverageExtras()){const signature=JSON.stringify(extras.map(s=>[s.id,s.x,s.y,s.z,s.az,s.el,s.device.maxSlopeX,s.device.maxSlopeY,s.color,s.n??0,s.counts?s.counts[0]+s.counts[s.counts.length>>1]:null]));$('#coverageCountLegend').hidden=!extras.length||$('#coverageMode').value==='physical';$('#multiControls').hidden=!extras.length||$('#coverageMode').value!=='physical';if(signature===coverageSignature)return;coverageSignature=signature;sceneView.setCoverageStations(extras);}
 // 我的点位: stations grouped by site; a site with several poses is one group. The tick shows a station in 3D (the shown set).
 const afterShownChange=()=>{persistSession();refreshCandidates();showComparison();renderList();renderOverview();};
 function stationRow(s,{w,compared,modified,swatch},single){const state=candidateState(s.id),entry=results.get(candidateKey(s.id)),d=document.createElement('div');d.className='candidate'+(workingActive&&s.id===w.from?' active':'');d.dataset.candidate=s.id;
  d.innerHTML=`<label class="compare"><input type="checkbox" data-compare="${escapeHtml(s.id)}"${compared.has(s.id)?' checked':''}>显示</label><b>${swatch.has(s.id)?`<i class="cov-swatch" style="--c:${swatch.get(s.id)}" title="覆盖视图中的颜色"></i>`:''}${escapeHtml(s.name)}${s.id===w.from&&modified?' <em>· 编辑中</em>':''}</b>${single?`<span>X ${s.position[0].toFixed(1)} · Y ${s.position[1].toFixed(1)} · Z ${s.position[2].toFixed(1)}</span>`:''}<span>方位 ${s.pose.azimuthDeg}° · 仰角 ${s.pose.elevationDeg}°</span><span class="result-status" data-state="${state}">${state==='ready'?`${formatCount(entry.totalCount)} 计数 · 透射 ${(100*entry.weightedTransmission).toFixed(2)}%`:STATE_TEXT[state]}</span>`;
  d.onclick=e=>{if(!e.target.closest('.compare'))toggleCandidate(s.id);};
  d.querySelector('[data-compare]').onchange=e=>{study.setCompared(s.id,e.target.checked);afterShownChange();};return d;}
 function renderList(){const h=$('#candidateList');if(!h||!study)return;syncOthersChip();const extras=coverageExtras(),swatch=new Map(extras.map(s=>[s.id,s.color]));syncCoverageStations(extras);const w=study.working,compared=new Set(study.compared),modified=study.modified,context={w,compared,modified,swatch};
  const groups=new Map(),sites=new Map(study.workspace.sites.map(site=>[site.id,site]));for(const s of study.plan.stations){if(!groups.has(s.site))groups.set(s.site,[]);groups.get(s.site).push(s);}
  // The working station always has a highlighted row: a saved station, an inspected suggestion, or else this unsaved draft row.
  let draftRow=null;if(workingActive&&w.from===null&&!datasetStations.some(activeSuggestion)){draftRow=document.createElement('div');draftRow.className='working-draft';draftRow.title='当前探测器（未保存）；再次点击取消选择';
   draftRow.innerHTML=`<b>${escapeHtml(w.name||'新点位')} <em>· 未保存</em></b><span>X ${w.x.toFixed(1)} · Y ${w.y.toFixed(1)} · Z ${w.z.toFixed(1)}</span><span>方位 ${w.az}° · 仰角 ${w.el}°</span>`;draftRow.onclick=()=>deactivateWorking();}
  h.replaceChildren(...(draftRow?[draftRow]:[]),...[...groups.entries()].map(([siteId,list])=>{if(list.length===1)return stationRow(list[0],context,true);
   const g=document.createElement('div'),[x,y,z]=list[0].position;g.className='site-group';g.dataset.site=siteId;
   g.innerHTML=`<header><label class="compare"><input type="checkbox" data-compare-site="${escapeHtml(siteId)}"${list.every(s=>compared.has(s.id))?' checked':''}>显示</label><b>${escapeHtml(sites.get(siteId)?.name??'站址')}</b><span>X ${x.toFixed(1)} · Y ${y.toFixed(1)} · Z ${z.toFixed(1)} · ${list.length} 个姿态</span></header>`;
   g.querySelector('[data-compare-site]').onchange=e=>{for(const s of list)study.setCompared(s.id,e.target.checked);afterShownChange();};
   g.append(...list.map(s=>stationRow(s,context,false)));return g;}));
  const duplicates=study.duplicateCount;$('#duplicateNotice').hidden=!duplicates;$('#duplicateText').textContent=`有 ${duplicates} 个重复点位（位置和姿态相同）。`;
  $('#stationCount').textContent=`(${study.plan.stations.length})`;$('#emptyStations').hidden=study.plan.stations.length>0;
  // A dataset suggestion being inspected is not a saved station yet: the status and the save button say so.
  const source=w.from===null?null:study.candidate(w.from),suggestion=source===null?datasetStations.find(c=>suggestionKey(c)===w.candidateId):null;
  $('#workingStatus').textContent=source!==null?(modified?`来自「${source.name}」· 已修改，未保存`:`与点位「${source.name}」一致`):suggestion?(modified?`基于建议位置「${suggestion.name}」修改 · 未加入我的点位`:`查看建议位置「${suggestion.name}」· 未加入我的点位`):'未保存的新点位';
  $('#saveCandidate').textContent=suggestion?'加入我的点位':'存为新点位';
  $('#updateCandidate').disabled=source===null||!modified;$('#remove').disabled=!workingActive||source===null;$('#revertCandidate').hidden=!modified;renderShownBar();renderSuggestions();renderDeployments();renderStudies();renderOverview();demo.render();}
 // Multi-station overview (#15, FR-M4, FR-M15): per recognition item, the working station and the stations chosen in the overview
 // (the same set as 覆盖范围 → 其他点位), from their cached compact results. Target points come once per page from the calculation
 // geometry, after the first final result so they never delay it.
 let samples=null,sampling=null,overviewSignature='',multiOptions={errorLevel:.1,minViews:3,goodSpreadDeg:30,minSpreadDeg:10};
 const overview=createOverviewPanel({root,onSelectStation:id=>selectCandidate(id),onHoverItem:id=>{const item=recognitionItems.find(i=>i.id===id);sceneView.emphasiseFeatures(item?.kind==='features'?[...item.featureIds]:[]);}});
 function overviewStations(){const all=overviewStationsAll();return workingActive?all:all.filter(s=>s.id!=='working');}
 function overviewStationsAll(){const input=inputs(),entry=workingBusy?null:results.get(workingKey)??null,source=study.working.from===null?null:study.candidate(study.working.from),{x,y,z,az,el}=input.station;
  return[{id:'working',name:source&&!study.modified?`工作点位（${source.name}）`:'工作点位',x,y,z,az,el,device:input.device,n:entry?.n,counts:entryCountsBottomFirst(entry),entry},...coverageExtras()];}
 // Per-station projections side by side (#16): the overview's stations, redrawn while open when they, their results or the outline settings change.
 let taskMode=null;const tiles=createProjectionTiles({root,onOpenStation:id=>selectCandidate(id),onToggleCompare:(id,on)=>{study.setCompared(id,on);persistSession();renderList();showComparison();refreshCandidates();renderOverview();}});let tilesSignature='';
 function tilesState(stations){const r=recognition.state(),known=new Set(recognitionItems.map(i=>i.id));return{stations:stations.map(s=>({...s,color:s.color??'#ff4fb3',compared:study.compared.includes(s.id)})),items:r.items.filter(i=>r.selected.has(i.id)&&known.has(i.id)),threshold:r.threshold,precision:projection.precision,showBack:displayState.back,exposureDays:study.configuration.response.exposureDays};}
 function renderOverview(){if(!study||!$('#overviewTable'))return;const stations=overviewStations(),threshold=recognition.state().threshold;
  if(tiles.isOpen){const state=tilesState(stations),signature=JSON.stringify([state.stations.map(s=>[s.id,s.name,s.entry?s.entry.totalCount:null,s.compared]),state.items.map(i=>i.id),threshold,state.precision,state.showBack]);if(signature!==tilesSignature){tilesSignature=signature;tiles.update(state);}}
  if(!samples&&!sampling&&targetSamples&&!workingBusy&&results.has(workingKey))sampling=targetSamples({items:recognitionItems}).catch(error=>{console.error(error);return new Map();}).then(s=>{samples=s;overviewSignature='';renderOverview();});
  const signature=JSON.stringify([stations.map(s=>[s.id,s.name,s.x,s.y,s.z,s.az,s.el,s.n??0,s.entry?s.entry.totalCount:null]),threshold,multiOptions,!!samples]);if(signature===overviewSignature)return;overviewSignature=signature;
  const rows=overviewTable({items:recognitionItems,stations,samples:samples??new Map(),threshold,options:multiOptions}),pending=stations.filter(s=>!s.entry).length;
  overview.render({rows,minViews:multiOptions.minViews,message:`${stations.length} 个点位${pending?`（${pending} 个计算中）`:''}${samples?'':' · 目标内部采样待第一个结果完成后进行…'}`});}
 // Demonstration mode (#17, FR-M5): the overview's stations in a clean view; caption, legend and footnote say what is shown
 // and what the numbers are not, on screen and in every screenshot.
 function describeDemo(){const stations=overviewStations(),deployment=study.plan.deployments.find(d=>d.id===study.activeDeployment),compared=new Set(study.compared),asDeployment=displayState.others&&deployment&&deployment.stations.length===compared.size&&deployment.stations.every(id=>compared.has(id)),mode=$('#coverageMode').value,multi=!$('#multiControls').hidden,count=!$('#coverageCountLegend').hidden;
  const coverage=mode==='off'?null:multi?$('#multiLegend').textContent:count?$('#coverageCountLegend').textContent:mode==='physical'?'覆盖：物理（计数/sr，对数亮度）':'覆盖：几何视场';
  return{caption:{title:$('.title').textContent,subtitle:`${asDeployment?deployment.name:'我的点位'} · ${stations.length} 个点位`},
   legend:[...stations.map(s=>({color:s.color??'#ff4fb3',text:`${s.name}${s.entry?'':'（计算中）'}`})),...(coverage?[{text:coverage}]:[])],
   footnote:[...demoFootnote({release:datasetId,scenario:scenarioId??'—',exposureDays:study.configuration.response.exposureDays,detector:study.configuration.device.model,date:new Date()}),...(multi?['多视角覆盖与综合等级为规划参考，不是重建质量保证。']:[])]};}
 const demo=createDemoView({root,sceneView,storage,storageKey:`muon-demo-views:${datasetId}`,datasetId,describe:describeDemo});
 // Pose changes from 瞄准此处 and the arrow-key shortcuts go through the plan like typed values.
 function setPose(az,el){study.update('az',az);study.update('el',el);persistSession();sync();renderList();scheduleDetectorUpdate();}
 // Shortcuts (ADR-032, view-shortcuts.js); off in demonstration mode, whose arrow keys step through the views.
 function bindShortcuts(){let lastCoverage='geometric';window.addEventListener('keydown',event=>{if($('.app').classList.contains('demo')||document.querySelector('dialog[open]'))return;const action=shortcutFor(event);if(!action)return;
  if(action.toggle==='coverage'){const mode=$('#coverageMode');if(mode.value!=='off'){lastCoverage=mode.value;mode.value='off';}else mode.value=lastCoverage;mode.dispatchEvent(new Event('change',{bubbles:true}));}
  else if(action.toggle){$(`[data-layer="${action.toggle}"]`).click();}
  else{if(!workingActive)return;event.preventDefault();const {az,el}=inputs().station;setPose(action.nudge==='az'?(((az+action.by)%360)+360)%360:az,action.nudge==='el'?Math.min(90,Math.max(0,el+action.by)):el);}});}
 // 全选 / 清空 in the candidate list header: the compare boxes are the only membership of the station set.
 function setAllCompared(on){for(const s of study.plan.stations)study.setCompared(s.id,on);persistSession();renderList();showComparison();refreshCandidates();renderOverview();}
 function bindOverview(){$('#compareAll').onclick=()=>setAllCompared(true);$('#compareNone').onclick=()=>setAllCompared(false);

  // 多站评估 shows the summary of the stations shown in 3D (display-state.js); it no longer changes the 3D view.
  taskMode=createTaskMode({root,storage,storageKey:`muon-task-mode:${datasetId}`,onChange:mode=>{if(mode==='multi'){tilesSignature='';tiles.open(tilesState(overviewStations()));}requestAnimationFrame(resize);}});}
 // The shown set against the deployments: equal to one, or changed from the one last loaded (更新 / 另存为组合).
 function renderShownBar(){const n=study.compared.length,matched=study.matchedDeployment,active=study.activeDeployment,name=id=>study.plan.deployments.find(d=>d.id===id)?.name??'';
  $('#shownStatus').innerHTML=n?`显示 <b>${n}</b> 个点位${matched?` = 组合「${escapeHtml(name(matched))}」`:active?` · <em>与「${escapeHtml(name(active))}」不同</em>`:''}`:'未勾选点位';
  const changed=!matched&&n>0;$('#shownSave').hidden=!changed;$('#updateShownDeployment').hidden=!(changed&&active);if(active)$('#updateShownDeployment').textContent=`更新「${name(active)}」`;}
 // Dataset suggestions: candidate positions of the release, unrelated to 我的点位. A click makes one the working station to
 // inspect (highlighted; a second click deselects it, as in 我的点位); ＋ adds it to 我的点位, from where it is edited.
 const suggestionKey=c=>c.candidateId??c.id;
 const activeSuggestion=c=>workingActive&&study.working.from===null&&study.working.candidateId===suggestionKey(c);
 // Position and pose identify a station: a clash names the station already there (no two stations share them).
 function clashAlert(error){const name=/same position and pose: (.*)$/.exec(error.message)?.[1];if(name===undefined)throw error;pageAlert(`「${name}」已在同一位置和姿态，不能再加入一个相同的点位。`);}
 function renderSuggestions(){const host=$('#suggestionList');if(!host)return;if(datasetStations.some(activeSuggestion))$('#suggestionSection').open=true;$('#suggestionCount').textContent=`(${datasetStations.length})`;
  host.replaceChildren(...datasetStations.map(c=>{const row=document.createElement('div'),active=activeSuggestion(c);row.className='suggestion'+(active?' active':'');row.dataset.suggestion=c.id;
   row.innerHTML=`<button type="button" class="suggestion-main" title="${active?'再次点击取消查看':'查看此建议位置'}">${escapeHtml(c.name)}<span>${active?(study.modified?'已修改':'查看中'):''}</span></button><button type="button" class="suggestion-add" title="加入我的点位">＋</button>`;
   row.querySelector('.suggestion-main').onclick=()=>{if(active)deactivateWorking();else loadSuggestion(c);};
   row.querySelector('.suggestion-add').onclick=()=>addSuggestion(c);return row;}));}
 async function loadSuggestion(c){if(workingActive&&study.modified&&!await pageConfirm('当前编辑点位有未保存的修改，载入建议位置会放弃这些修改。继续吗？',{ok:'放弃修改'}))return;
  study.loadDraft(draftFrom(c));persistSession();sync();if(workingActive)renderList();else setWorkingActive(true);scheduleDetectorUpdate();}
 // Adding the suggestion being inspected (unedited) makes the working station that saved station, ready to edit.
 function addSuggestion(c){let id;try{id=study.addFromDraft(draftFrom(c));}catch(error){clashAlert(error);return;}
  if(activeSuggestion(c)&&!study.modified){study.select(id);persistSession();sync();}persistPlan();renderList();refreshCandidates();scheduleDetectorUpdate();}
 // Item menus (⋯) of deployments and studies.
 // A list keeps still while its menu is open (background results would re-render it) and catches up when the menu closes.
 function closeItemMenus(refresh=true){const menus=document.querySelectorAll('.item-menu');menus.forEach(menu=>menu.remove());if(refresh&&menus.length&&study){renderDeployments();renderStudies();}}
 function openItemMenu(row,items){closeItemMenus(false);const menu=document.createElement('div');menu.className='item-menu';menu.setAttribute('role','menu');
  for(const [label,action,danger] of items){const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=label;if(danger)b.className='danger';b.onclick=e=>{e.stopPropagation();closeItemMenus();action();};menu.append(b);}
  row.append(menu);menu.querySelector('button')?.focus();}
 // Named deployments (FR-P7): a click shows its stations (replacing the ticks) and lists its members; ＋ and ⋯ → 编辑成员 open
 // the member dialog; ⋯ also renames, copies, exports or deletes.
 const expandedDeployments=new Set();
 function renderDeployments(){const host=$('#deploymentList');if(!host||!study||host.querySelector('.item-menu'))return;const deps=study.plan.deployments,matched=study.matchedDeployment,names=new Map(study.plan.stations.map(s=>[s.id,s.name]));$('#deploymentCount').textContent=`(${deps.length})`;
  host.replaceChildren(...deps.map(d=>{const row=document.createElement('div'),open=expandedDeployments.has(d.id);row.className='item-row'+(d.id===matched?' shown':'');row.dataset.deployment=d.id;
   row.innerHTML=`<button type="button" class="item-main" aria-expanded="${open}" title="${d.id===matched?'再次点击取消显示本组合':'在三维视图中显示本组合的点位'}"><b>${escapeHtml(d.name)}</b><span>${d.stations.length} 个点位</span></button><button type="button" class="item-more" aria-label="更多操作">⋯</button><div class="item-children members"${open?'':' hidden'}>${d.stations.map(id=>`<span>${escapeHtml(names.get(id)??'')}</span>`).join('')}</div>`;
   // A click shows the deployment (its stations ticked, members listed); a click on the one shown deactivates it: nothing ticked.
   row.querySelector('.item-main').onclick=()=>{if(d.id===matched){expandedDeployments.delete(d.id);study.deselectDeployment();afterShownChange();return;}expandedDeployments.add(d.id);study.selectDeployment(d.id);afterShownChange();$('#mainPatternControls').open=true;};
   row.querySelector('.item-more').onclick=e=>{e.stopPropagation();openItemMenu(row,[['编辑成员',()=>editDeployment(d)],['重命名',()=>renameDeployment(d)],['复制',()=>copyDeployment(d)],['导出',()=>exportSelection([d.id],d.name)],['删除',()=>deleteDeployment(d),true]]);};return row;}));
  $('#deploymentSummary').hidden=deps.length>0;$('#deploymentSummary').textContent='点 ＋ 新建部署组合。';}
 const askName=(message,value)=>pagePrompt(message,value);
 // The member dialog: a name and every saved station (grouped by site), ticked from the deployment, or for a new one from the ticks.
 function memberItems(chosen){const sites=new Map(study.workspace.sites.map(site=>[site.id,site])),perSite=new Map();for(const s of study.plan.stations)perSite.set(s.site,(perSite.get(s.site)??0)+1);
  const order=[...new Set(study.plan.stations.map(s=>s.site))],bySite=order.flatMap(site=>study.plan.stations.filter(s=>s.site===site));
  return bySite.map(s=>({id:s.id,label:s.name,detail:`方位 ${s.pose.azimuthDeg}° · 仰角 ${s.pose.elevationDeg}°`,group:perSite.get(s.site)>1?sites.get(s.site)?.name:undefined,checked:chosen.has(s.id)}));}
 async function editDeployment(d=null){if(!study.plan.stations.length){pageAlert('还没有保存的点位：先在“我的点位”中加入点位。');return;}
  const result=await pageChecklist(d?'编辑部署组合':'新建部署组合',{name:d?.name??`部署组合 ${study.plan.deployments.length+1}`,items:memberItems(new Set(d?d.stations:study.compared)),ok:d?'保存':'创建'});if(!result)return;
  let id=d?.id;if(d){if(result.name!==d.name)study.renameDeployment(d.id,result.name);study.setDeploymentStations(d.id,result.ids);}else id=study.createDeployment(result.name,result.ids);
  study.selectDeployment(id);expandedDeployments.add(id);persistPlan();afterShownChange();}
 async function saveShownAsDeployment(){const name=await askName('部署组合名称',`部署组合 ${study.plan.deployments.length+1}`);if(name===null)return;study.createDeployment(name);persistPlan();renderList();}
 async function renameDeployment(d){const name=await askName('部署组合名称',d.name);if(name===null)return;study.renameDeployment(d.id,name);persistPlan();renderList();}
 async function copyDeployment(d){const name=await askName('复制为',`${d.name} 副本`);if(name===null)return;study.copyDeployment(d.id,name);persistPlan();renderList();}
 async function deleteDeployment(d){const {studies}=study.dependants(d.id);
  if(!await pageConfirm(`删除部署组合「${d.name}」？点位不受影响。${studies.length?`\n它也会从工作方案「${studies.join('」「')}」中移除。`:''}`,{ok:'删除',danger:true}))return;study.deleteDeployment(d.id);persistPlan();renderList();}
 // Duplicates are merged only on request (ADR-033: never merged by position on their own).
 async function mergeDuplicates(){const n=study.duplicateCount;if(!n||!await pageConfirm(`合并 ${n} 个重复点位？每组保留第一个，部署组合和工作方案改为引用保留的点位。此操作不可撤销，需要时请先导出。`,{ok:'合并'}))return;study.mergeDuplicates();persistPlan();sync();renderList();refreshCandidates();showComparison();scheduleDetectorUpdate();}
 function bindDeployments(){$('#mergeDuplicates').onclick=mergeDuplicates;$('#newDeployment').onclick=()=>editDeployment();$('#saveShownDeployment').onclick=saveShownAsDeployment;
  $('#updateShownDeployment').onclick=()=>{study.updateDeployment(study.activeDeployment);persistPlan();renderList();};
  document.addEventListener('click',e=>{if(!e.target.closest('.item-menu,.item-more'))closeItemMenus();});}
 // Studies stay read-only rows until the composer (ADR-033 step 6): expand to show their deployments; rename, export or delete.
 const expandedStudies=new Set();
 function renderStudies(){const host=$('#studyList');if(!host||!study||host.querySelector('.item-menu'))return;const studies=study.workspace.studies,deps=new Map(study.plan.deployments.map(d=>[d.id,d]));$('#studySection').hidden=!studies.length;$('#studyCount').textContent=`(${studies.length})`;
  host.replaceChildren(...studies.map(st=>{const row=document.createElement('div'),open=expandedStudies.has(st.id),scenes=st.scenes.map(c=>c.label||c.scenario||'默认工况').join('、');row.className='item-row';row.dataset.study=st.id;
   row.innerHTML=`<button type="button" class="item-main" aria-expanded="${open}"><b>${escapeHtml(st.title)}</b><span>场景 ${escapeHtml(scenes)} · ${st.deployments.length} 个组合 · 曝光 ${st.exposure.days} 天</span></button><button type="button" class="item-more" aria-label="更多操作" title="重命名、导出或删除">⋯</button><div class="item-children"${open?'':' hidden'}></div>`;
   row.querySelector('.item-children').replaceChildren(...st.deployments.map(id=>{const d=deps.get(id),b=document.createElement('button');b.type='button';b.textContent=`${d.name} · ${d.stations.length} 个点位`;b.onclick=()=>{study.selectDeployment(id);afterShownChange();};return b;}));
   row.querySelector('.item-main').onclick=()=>{if(open)expandedStudies.delete(st.id);else expandedStudies.add(st.id);renderStudies();};
   row.querySelector('.item-more').onclick=e=>{e.stopPropagation();openItemMenu(row,[['重命名',()=>renameStudy(st)],['导出',()=>exportSelection([st.id],st.title)],['删除',()=>deleteStudy(st),true]]);};return row;}));}
 async function renameStudy(st){const name=await askName('工作方案名称',st.title);if(name===null)return;study.renameStudy(st.id,name);persistPlan();renderStudies();}
 async function deleteStudy(st){if(!await pageConfirm(`删除工作方案「${st.title}」？它的部署组合和点位会保留在“我的点位”和“部署组合”中。`,{ok:'删除',danger:true}))return;study.deleteStudy(st.id);persistPlan();renderStudies();}
 function showComparison(){if(!study)return;const rows=study.compared.map(id=>({id,label:study.candidate(id).name,state:candidateState(id)})),ready=rows.filter(r=>r.state==='ready');
  mainPatterns.showCandidates(rows,ready.length?compareEntries(ready.map(r=>({label:r.label,entry:results.get(candidateKey(r.id))}))):null);}
 // Working station on or off (owner, 2026-10-16): clicking the highlighted candidate in the list deselects it and
 // discards unsaved edits; the app then shows no working station until a candidate is chosen. View state only.
 let workingActive=true;
 function setWorkingActive(on){workingActive=Boolean(on);$('#singlePanel').classList.toggle('inactive',!workingActive);$('#noWorking').hidden=workingActive;sceneView.setWorkingVisible(workingActive);renderList();renderOverview();}
 function deactivateWorking(){if(study.working.from!==null)study.select(study.working.from);persistSession();sync();setWorkingActive(false);}
 function toggleCandidate(id){if(workingActive&&id===study.working.from)deactivateWorking();else selectCandidate(id);}
 async function selectCandidate(id){if(!workingActive){study.select(id);persistSession();sync();setWorkingActive(true);scheduleDetectorUpdate();return;}
  if(study.modified&&!await pageConfirm('当前编辑点位有未保存的修改，切换会放弃这些修改。继续吗？',{ok:'放弃修改'}))return;study.select(id);persistSession();sync();renderList();scheduleDetectorUpdate();}
 function syncDeviceStatus(){const {device:DEVICE,response:RESPONSE}=study.configuration,pct=v=>(100*v).toFixed(1).replace(/\.0$/,'')+'%',slope=v=>v.toFixed(2);$('#areaOut').textContent=`${(DEVICE.width*1000).toFixed(1)} × ${(DEVICE.height*1000).toFixed(1)} mm`;$('#pitchOut').textContent=(DEVICE.stripPitch*1000).toFixed(2).replace(/0$/,'')+' mm';$('#stripsOut').textContent=DEVICE.stripsX;$('#spacingOut').textContent=DEVICE.spacing.toFixed(2)+' m';$('#baselineOut').textContent=DEVICE.baseline.toFixed(2)+' m';$('#fovOut').textContent=DEVICE.fovH.toFixed(1)+'° / '+DEVICE.fovV.toFixed(1)+'°';$('#coreFovOut').textContent=`${2*DEVICE.stripsX-1} × ${2*DEVICE.stripsY-1}`;$('#efficiencyOut').textContent=pct(RESPONSE.layerEfficiency);$('#coincidenceOut').textContent=pct(RESPONSE.layerEfficiency**DEVICE.layers*RESPONSE.deadLiveFraction);$('#deadOut').textContent=pct(1-RESPONSE.deadLiveFraction);$('#resolutionOut').textContent=RESPONSE.angularResolutionDeg.toFixed(2).replace(/0$/,'')+'°';$('#sxMin').textContent='−'+slope(DEVICE.maxSlopeX);$('#sxMax').textContent='+'+slope(DEVICE.maxSlopeX);$('#syMin').textContent='−'+slope(DEVICE.maxSlopeY);$('#syMax').textContent='+'+slope(DEVICE.maxSlopeY)}
 function sync(){const w=study.working;for(const k of ['name','x','y','z','az','el'])$('#'+k).value=w[k];$('#azNumber').value=w.az;$('#elNumber').value=w.el;syncDeviceStatus()}
 // The study's plan always follows the scenario chosen in the app.
 const draftFrom=c=>({name:c?.name??'新点位',x:c?.x??0,y:c?.y??0,z:c?.z??0,az:c?.az??0,el:c?.el??25,candidateId:c?.candidateId??c?.id??null,model:state.configuration.device.model,settings:serializeDeviceSettings(state.configuration)});
 function openState(workspace,session){study=createWorkspaceState({workspace,session,environment:state.environment,draft:draftFrom(datasetStations[0])});}
 const persistSession=()=>saveWorkspaceSession(storage,datasetId,study.session());
 const persistPlan=()=>{saveWorkspace(storage,datasetId,study.workspace);persistSession();};
 const defaultDetector=()=>({name:'default',...detectorWithoutExposure(detectorFromSettings(state.configuration.device.model,serializeDeviceSettings(state.configuration)))});
 function fillDeviceForm(){const s=deviceSettingsData();$('#cfgWidth').value=(s.width*1000).toFixed(1);$('#cfgHeight').value=(s.height*1000).toFixed(1);$('#cfgPitch').value=(s.stripPitch*1000).toFixed(2);$('#cfgStrips').value=s.strips;$('#cfgSpacing').value=s.spacing;$('#cfgEfficiency').value=(s.layerEfficiency*100).toFixed(1);$('#cfgDead').value=((1-s.deadLiveFraction)*100).toFixed(1);$('#cfgResolution').value=s.angularResolutionDeg;$('#cfgSystematic').value=(s.systematicFraction*100).toFixed(1);$('#cfgExposure').value=s.exposureDays;$('#cfgAngular').value=s.angularModel}
 function bindDeviceSettings(){const dialog=$('#deviceDialog');$('#deviceSettings').onclick=()=>{fillDeviceForm();dialog.showModal()};$('#deviceClose').onclick=$('#deviceCancel').onclick=()=>dialog.close();const formSettings=()=>({width:+$('#cfgWidth').value/1000,height:+$('#cfgHeight').value/1000,stripPitch:+$('#cfgPitch').value/1000,strips:+$('#cfgStrips').value,spacing:+$('#cfgSpacing').value,layerEfficiency:+$('#cfgEfficiency').value/100,deadLiveFraction:1-+$('#cfgDead').value/100,angularResolutionDeg:+$('#cfgResolution').value,systematicFraction:+$('#cfgSystematic').value/100,exposureDays:+$('#cfgExposure').value,angularModel:$('#cfgAngular').value});
  // The form edits the working station's detector; "应用到全部候选" also sets it on every candidate (explicit update, FR-P6).
  $('#deviceForm').onsubmit=e=>{e.preventDefault();applyDeviceSettings(formSettings());controller.clearCaches();persistSession();syncDeviceStatus();renderList();dialog.close();scheduleDetectorUpdate()};
  $('#deviceApplyAll').onclick=()=>{applyDeviceSettings(formSettings());study.applyDetectorToAll();controller.clearCaches();persistPlan();syncDeviceStatus();refreshCandidates();renderList();showComparison();dialog.close();scheduleDetectorUpdate()};dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()})}
 function updateWater(){if(!capabilities.continuousWater)return;const level=+$('#upLevel').value;$('#upOut').textContent='▽'+level+' m';state.setEnvironment({upstream:level});sceneView.setWater(level);scheduleDetectorUpdate();}
 function setDamOpacity(){const opacity=+$('#damOpacity').value/100;$('#damOpacityOut').textContent=Math.round(opacity*100)+'%';sceneView.setDamOpacity(opacity);}
 // Import (ADR-033): a workspace file (any selection) or a 1.x plan file is merged into the workspace of its release; new
 // items are added, identical ones skipped and any conflict refuses the import until the preview (step 5). The imported
 // stations are then shown. A file of another registered release is imported there and that release opens; another
 // release of the same dataset imports here after a warning; another dataset is refused.
 const datasetOf=release=>String(release).split('@')[0];
 async function importPlan(event){const file=event.target.files[0];event.target.value='';if(!file)return;
  try{if(file.size>5*1024*1024)throw new Error('文件超过 5 MB');const source=await file.text();let format;try{format=JSON.parse(source)?.format;}catch{throw new Error('不是 JSON 文件');}
   let selection,scenario=null;if(format==='muography-plan'){const plan=parsePlan(source);scenario=plan.scene.scenario;selection=selectionFromPlan(plan);}else{selection=parseWorkspace(source);}
   if(selection.release.contentHash!==null)throw new Error('用户加载的数据集尚不支持');const release=selection.release.id;
   if(datasetOf(release)!==datasetOf(datasetId))throw new Error(`文件属于另一个数据集（${release}）`);
   const focus=importedFocus(selection),showing=session=>({...session,activeStudy:null,shown:focus.stations,activeDeployment:focus.deployment});
   if(release!==datasetId&&releases.includes(release)){const opened=openWorkspace({storage,release,defaultDetector:defaultDetector()});
    saveWorkspace(storage,release,mergeSelection(opened.workspace,selection).workspace);saveWorkspaceSession(storage,release,{...showing(opened.session),working:null});
    persistPlan();location.assign(selectionHref(APP_PAGES.main,{datasetId:release,scenarioId:scenario}));return;}
   if(release!==datasetId&&!await pageConfirm(`此文件来自数据集版本 ${release}，当前打开的是 ${datasetId}。点位位置和姿态将按当前版本的模型坐标直接使用，可能与原版本不一致。继续导入？`,{ok:'仍然导入'}))return;
   persistPlan();const merged=mergeSelection(study.workspace,selection).workspace,session=showing(study.session());
   if(scenario!==null&&scenario!==scenarioId){saveWorkspace(storage,datasetId,merged);saveWorkspaceSession(storage,datasetId,session);location.assign(selectionHref(APP_PAGES.main,{datasetId,scenarioId:scenario}));return;}
   openState(merged,session);persistPlan();sync();renderList();refreshCandidates();showComparison();scheduleDetectorUpdate();
  }catch(error){pageAlert('方案导入失败：'+error.message);}}
 // Coverage highlight (FR-M10): view state, remembered per release; never changes results.
 function bindCoverage(){const key=`muon-coverage:${datasetId}`;let saved=null;try{saved=JSON.parse(storage.getItem(key));}catch{}displayState=readDisplayState(saved);const c=displayState.coverage;
  const mode=$('#coverageMode'),core=$('#coverageCore'),context=$('#coverageContext'),featureTint=$('#coverageFeatures');featureTint.checked=c.features;mode.value=c.mode;core.checked=c.core;context.checked=c.context;
  // Physical multi-station maps (15d, FR-M15): 多视角覆盖 by default; thresholds as decided (10 %, ≥ 3 views and ≥ 30°, < 10°).
  const multi=$('#coverageMulti'),error=$('#coverageError'),views=$('#classViews'),good=$('#classGoodSpread'),minimum=$('#classMinSpread'),m=c.multi;
  multi.value=m.map;error.value=String(m.errorLevel);views.value=m.minViews;good.value=m.goodSpreadDeg;minimum.value=m.minSpreadDeg;
  const clampInput=(input,low,high,fallback)=>{const v=Math.round(+input.value);input.value=Number.isFinite(v)?Math.min(high,Math.max(low,v)):fallback;return +input.value;};
  const legend=value=>{const sw=(c,t)=>`<i style="--c:${c}"></i>${t}`,grey=sw('#3c3c3c','有视场但无可用视角（深灰）');
   return{views:`可用视角数（计数误差 ≤ ${value.errorLevel*100}%）：${['#fcbba1','#fc9272','#fb6a4a','#de2d26','#a50f15'].map((c,i)=>sw(c,i<4?String(i+1):'5+')).join(' ')} · ${grey}`,
    spread:`可用视角的最大张角：${sw('#c6dbef','<10°')} ${sw('#6baed6','10–30°')} ${sw('#2171b5','30–60°')} ${sw('#08306b','>60°')} · ${grey}`,
    class:`综合等级（规划参考，非重建质量保证）：${sw('#1a9850',`良好 ≥${value.minViews} 视角且 ≥${value.goodSpreadDeg}°`)} ${sw('#fdae61','有限')} ${sw('#d73027',`不足 <2 视角或 <${value.minSpreadDeg}°`)}`,
    dominant:'每点取计数/sr 最高的点位颜色，亮度为该点位的计数/sr（颜色不混合）',total:`各点位计数/sr 之和（总统计量的参考指标，不是一次测量）：暗→橙→白，10³–3×10⁷ /sr · ${grey}`}[value.map];};
  const apply=()=>{const value={mode:mode.value,core:core.checked,context:context.checked,features:featureTint.checked,
    multi:{map:multi.value,errorLevel:+error.value,minViews:clampInput(views,2,9,3),goodSpreadDeg:clampInput(good,1,179,30),minSpreadDeg:clampInput(minimum,0,179,10)}};
   $('#coverageOptions').hidden=value.mode==='off';$('#coverageMode').dispatchEvent(new Event('coverage-applied'));$('#classThresholds').hidden=value.multi.map!=='class';$('#multiLegend').innerHTML=legend(value.multi);
   sceneView.setCoverage(value);displayState={...displayState,coverage:value};coverageSignature='';multiOptions={errorLevel:value.multi.errorLevel,minViews:value.multi.minViews,goodSpreadDeg:value.multi.goodSpreadDeg,minSpreadDeg:value.multi.minSpreadDeg,back:displayState.back};
   // 后方来向 (display-state back): view only — projections, tiles, coverage, field-of-view edges and the 多站 numbers.
   $('#showBack').checked=displayState.back;sceneView.setShowBack(displayState.back);projection.showBack=displayState.back;drawProjection();renderList();renderOverview();try{storage.setItem(key,JSON.stringify(displayState));}catch{}};
  for(const input of [mode,core,context,multi,error,views,good,minimum,featureTint])input.onchange=apply;
  $('#showBack').onchange=e=>{displayState={...displayState,back:e.target.checked};apply();};
  // 其他点位 chip: shows or hides the compared candidates in 3D; the count is the number compared.
  $('#othersButton').onclick=()=>{displayState={...displayState,others:!displayState.others};apply();};
  $('#showOthersButton').onclick=()=>{if(!displayState.others){displayState={...displayState,others:true};apply();}};apply();}
 function syncOthersChip(){const chip=$('#othersButton');if(!chip||!study)return;const set=shownSet(),on=displayState.others;chip.setAttribute('aria-pressed',String(on));chip.classList.toggle('active',on);$('#othersCount').textContent=String(set.compared);
  // The 多站 tab: its count, and a prompt instead of the summary while other stations are hidden.
  if($('#multiCount'))$('#multiCount').textContent=String(set.ids.length);if($('#multiPanel')){$('#multiPanel').classList.toggle('others-off',!on);$('#multiEmpty').hidden=on;}
  chip.disabled=!on&&set.compared===0;chip.title=set.compared===0?'先在候选部署点列表中勾选“比较”':set.hiddenCount?`三维中只显示前 8 个（另有 ${set.hiddenCount} 个未显示）`:on?'隐藏勾选比较的候选点位':'在三维中显示勾选比较的候选点位';}
 // Placing the working station on the model (14d): one click on a visible surface, 0.5 m off it on the viewer's side.
 function setPlacingButton(on){const button=$('#placeStation');button.classList.toggle('active',on);button.textContent=on?'在模型上点击…（Esc 取消）':'在模型上点选位置';}
 // Field-of-view edges (视场棱线): a view option, on by default, remembered per release.
 function bindFovEdges(){const key=`muon-fov-edges:${datasetId}`,box=$('#fovEdges');box.checked=false;try{box.checked=storage.getItem(key)==='1';}catch{}const apply=()=>{sceneView.setFovEdges(box.checked);try{storage.setItem(key,box.checked?'1':'0');}catch{}};box.onchange=apply;apply();}
 // Solid field of view (实心视锥): a view option, on by default (shown when the cone layer is on), remembered per release.
 function bindFovSolid(){const key=`muon-fov-solid:${datasetId}`,box=$('#fovSolid');box.checked=true;try{box.checked=storage.getItem(key)!=='0';}catch{}const apply=()=>{sceneView.setFovSolid(box.checked);try{storage.setItem(key,box.checked?'1':'0');}catch{}};box.onchange=apply;apply();}
 // Slice plane (15e, FR-M16): a view through the interior; the matter mask comes from the calculation geometry,
 // computed in chunks once the slider rests and cancelled by any newer position.
 function bindSlice(){const key=`muon-slice:${datasetId}`,on=$('#sliceOn'),axis=$('#sliceAxis'),pos=$('#slicePos'),box=$('.slice-control');let saved={};try{saved=JSON.parse(storage.getItem(key))??{};}catch{}
  on.checked=saved.on===true;axis.value=['x','y','z'].includes(saved.axis)?saved.axis:'z';pos.value=Number.isFinite(saved.position)?saved.position:500;let abort=null;
  const value=()=>{const extent=sceneView.subjectExtent(),i={x:0,y:1,z:2}[axis.value];return Math.round((extent.min[i]+(extent.max[i]-extent.min[i])*pos.value/1000)*10)/10;};
  const apply=()=>{const state={on:on.checked,axis:axis.value,value:value()};box.toggleAttribute('data-off',!state.on);$('#sliceOut').textContent=`${axis.value.toUpperCase()} = ${state.value.toFixed(1)} m`;
   sceneView.setSlice(state);try{storage.setItem(key,JSON.stringify({on:state.on,axis:state.axis,position:+pos.value}));}catch{}
   abort?.abort();if(!state.on||!sliceMask)return;$('#sliceHint').textContent='计算切面材料范围…';
   {const controller=new AbortController(),resolution=128;abort=controller;
    sliceMask({axis:state.axis,value:state.value,extent:sceneView.subjectExtent(),resolution,signal:controller.signal,startDelayMs:250}).then(mask=>{sceneView.setSliceMask({axis:state.axis,value:state.value,resolution,mask});$('#sliceHint').textContent='切面只显示穿过实体材料的部分，覆盖着色与表面相同。';})
     .catch(error=>{if(error?.name!=='AbortError'){console.error(error);$('#sliceHint').textContent='切面材料范围计算失败：'+error.message;}});}};
  on.onchange=axis.onchange=apply;pos.oninput=apply;apply();}
 function bindPlacement(){$('#placeStation').onclick=()=>{const on=!$('#placeStation').classList.contains('active');setPlacingButton(on);sceneView.setPlacing(on);};}
 // Export (FR-P9, FR-P12): self-contained muography-workspace files — the whole workspace, the ticked stations, the current
 // deployment, or (from an item's ⋯ menu) one deployment or study with everything it uses.
 const slug=text=>String(text).replace(/[^A-Za-z0-9._-]+/g,'_'),fileBase=()=>`muography-${slug(datasetId)}`;
 const exportedAt=()=>new Date().toISOString();
 const selectionText=roots=>serializeWorkspace(selectWorkspace(study.workspace,roots,{exportedAt:exportedAt()}));
 const workspaceText=()=>serializeWorkspace({...study.workspace,provenance:{...study.workspace.provenance,exportedAt:exportedAt()}});
 function exportSelection(roots,label){try{persistPlan();downloadText(selectionText(roots),`${fileBase()}-${slug(label)}.json`);}catch(error){pageAlert('导出失败：'+error.message);}}
 const currentDeployment=()=>study.matchedDeployment??study.activeDeployment;
 function bindExportMenu(){const button=$('#export'),menu=$('#exportMenu');
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=e=>{e.stopPropagation();if(!menu.hidden){close();return;}
   menu.querySelector('[data-export="shown"]').disabled=!study.compared.length;menu.querySelector('[data-export="deployment"]').disabled=!currentDeployment();
   menu.querySelector('[data-export="workspace"]').disabled=!study.plan.stations.length;menu.hidden=false;button.setAttribute('aria-expanded','true');};
  document.addEventListener('click',e=>{if(!menu.hidden&&!e.target.closest('.export-menu'))close();});
  menu.onclick=e=>{const kind=e.target.closest('[data-export]')?.dataset.export;if(!kind)return;close();
   try{persistPlan();
    if(kind==='workspace')downloadText(workspaceText(),`${fileBase()}-workspace.json`);
    else if(kind==='shown')downloadText(selectionText(study.compared),`${fileBase()}-stations.json`);
    else if(kind==='deployment'){const d=study.plan.deployments.find(x=>x.id===currentDeployment());downloadText(selectionText([d.id]),`${fileBase()}-${slug(d.name)}.json`);}
    // Where the viewer blocks downloads (embedded artifact pages), the same file can be copied as text.
    else pageText('整个工作区（muography-workspace JSON）。可复制后保存为 .json 文件，再用“导入方案”载入。',workspaceText(),{filename:`${fileBase()}-workspace.json`});
   }catch(error){pageAlert('导出失败：'+error.message);}};}
 function bind(){document.querySelectorAll('.section-toggle').forEach(button=>button.onclick=()=>{const section=button.closest('.collapsible-section'),collapsed=section.classList.toggle('collapsed');button.textContent=collapsed?'▸':'▾';button.setAttribute('aria-expanded',String(!collapsed));button.title=(collapsed?'展开':'收起')+section.querySelector('h2').childNodes[0].textContent.trim()});const updateField=(k,value)=>{try{study.update(k,value);}catch{return;}persistSession();sync();renderList();scheduleDetectorUpdate()};for(const k of ['name','x','y','z','az','el'])$('#'+k).addEventListener('input',e=>updateField(k,e.target.value));$('#azNumber').addEventListener('input',e=>updateField('az',e.target.value));$('#elNumber').addEventListener('input',e=>updateField('el',e.target.value));const toggleSidebar=side=>{const app=$('.app'),collapsed=app.classList.toggle(side+'-collapsed'),button=$(side==='left'?'#toggleLeft':'#toggleRight'),action=(collapsed?'展开':'收起')+(side==='left'?'左侧栏':'右侧栏');// Edge tabs on the sidebars: the triangle points the way the sidebar will move.
  button.textContent=(side==='left')===collapsed?'▶':'◀';button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',action);button.title=action;requestAnimationFrame(resize)};$('#toggleLeft').onclick=()=>toggleSidebar('left');$('#toggleRight').onclick=()=>toggleSidebar('right');$('#viewSelect').onchange=e=>setView(e.target.value);$$('[data-layer]').forEach(e=>{sceneView.setLayer(e.dataset.layer,e.checked);e.onchange=()=>sceneView.setLayer(e.dataset.layer,e.checked);});$('#damOpacity').oninput=setDamOpacity;setDamOpacity();$('#upLevel').oninput=updateWater;// The plan changed, so the working result's plan reference is recomputed too (provenance, not physics).
 const changed=()=>{persistPlan();sync();renderList();refreshCandidates();showComparison();scheduleDetectorUpdate();};$('#saveCandidate').onclick=()=>{try{study.saveAsNew();}catch(error){clashAlert(error);return;}changed();};$('#revertCandidate').onclick=()=>{if(!study.modified)return;study.revert();persistSession();sync();renderList();scheduleDetectorUpdate();};$('#updateCandidate').onclick=async()=>{if(!study.modified||study.working.from===null)return;const w=study.working,c=study.candidate(w.from),moved=c.position.some((v,i)=>v!==[w.x,w.y,w.z][i]),others=study.siteSharedBy();let mode=null;if(moved&&others){mode=await pageChoose(`「${c.name}」所在的站址还有 ${others} 个其他点位（姿态）。`,[{value:'new',label:'仅此点位另建站址'},{value:'move',label:`移动整个站址（含其他 ${others} 个）`}]);if(mode===null)return;}try{study.updateCandidate(mode);}catch(error){clashAlert(error);return;}changed();};$('#remove').onclick=async()=>{const id=study.working.from;if(id===null)return;const {deployments,studies}=study.dependants(id),extra=deployments.length?`\n它也会从部署组合「${deployments.join('」「')}」中移除${studies.length?`（涉及工作方案「${studies.join('」「')}」）`:''}。`:'';if(!await pageConfirm(`删除点位「${study.candidate(id).name}」？${extra}`,{ok:'删除',danger:true})||study.working.from!==id)return;study.removeCandidate(id);changed();};bindExportMenu();$('#importPlan').onclick=()=>$('#importPlanFile').click();$('#importPlanFile').onchange=importPlan;window.addEventListener('resize',resize)}
 function configureCapabilities(){
  const continuous=capabilities.continuousWater;$('#upLevel').disabled=!continuous;$('#upLevel').title=continuous?'连续上游水位':'由已发布冻结工况决定，不支持连续水位';
  const significance=$('[data-projection="significance"]');significance.disabled=!capabilities.targetSignificance;significance.title=significance.disabled?'聚合材料尚无源实体归属；显著度未实现':'';
  $$('[data-layer]').forEach(input=>{input.disabled=!capabilities.layers.includes(input.dataset.layer);if(input.disabled)input.checked=false;});
  // Backend limitations are configuration context, shown in the 数据配置 menu (which already names the frozen scenario), not in the layer panel.
  if(!continuous){const note=root.createElement('p');note.className='hint';note.id='backendLimitations';note.textContent='此后端未提供：连续水位、结构显著度；模型范围外的材料未知。';($('#dataMenu')??$('#environmentSection')).append(note);}
 }
 return Object.freeze({start(){$('#specVersion').textContent=datasetVersion;configureCapabilities();if(capabilities.continuousWater){$('#upLevel').value=state.environment.upstream;$('#upOut').textContent='▽'+$('#upLevel').value+' m';}else $('#upOut').textContent='冻结工况';datasetStations=state.candidates;const loaded=openWorkspace({storage,release:datasetId,defaultDetector:defaultDetector(),legacy:{storage,release:datasetId,scenario:scenarioId,model:state.configuration.device.model,candidateIds,defaultStations:datasetStations,defaultSettings:serializeDeviceSettings(state.configuration)}});if(loaded.warning)console.warn(loaded.warning);openState(loaded.workspace,loaded.session);if(loaded.report.length)pageAlert(`已将本机保存的工作方案转换为新的工作区格式（muography-workspace 2.0）。\n${loaded.report.join('\n')}`);bindDeployments();renderList();sync();showComparison();for(const link of [$('#workbenchLink'),$('#workbenchLinkDiagnostics')])if(link)link.href=workbenchHref;sceneView.build();featureLayers.apply();bindCoverage();bindOverview();$('#precisionContours').checked=projection.precision;$('#precisionContours').onchange=e=>{projection.precision=e.target.checked;try{storage.setItem(precisionKey,projection.precision?'1':'0');}catch{}renderOverview();drawProjection();};bind();bindPlacement();bindSlice();bindFovEdges();bindFovSolid();bindDeviceSettings();makeProjectionDraggable();controller.run();refreshCandidates();taskMode.restore();bindShortcuts();},constrainProjectionPanel,hoverFeature(id){sceneView.emphasiseFeatures(id?[id]:[]);projectionView.emphasiseItem(id?recognition.itemForFeature(id)?.id??null:null);},pickFeature(id){recognition.toggleFeature(id);},pickCoverage(ix,iy){projectionView.selectPixel(ix,iy);},
  // A click on a cavity (gallery, room, shaft) places the station inside it, on its floor plus the mounting height;
  // elsewhere 0.5 m off the clicked surface. Cavity geometry comes from the calculation (station-placement.js).
  placeStation({point,normal,direction,featureId=null}){setPlacingButton(false);if(!workingActive)setWorkingActive(true);const cavity=featureId?placeInCavity({point,direction,featureId}):null,note=$('#placeNote');
   const placed=(cavity?cavity.position:placementPoint(point,normal,direction)).map(v=>Math.round(v*100)/100);
   note.hidden=false;note.textContent=cavity?`已放入「${features.get(featureId).label.zh}」：底板 Z ${cavity.floorZ.toFixed(2)} m，离底板 ${(placed[2]-cavity.floorZ).toFixed(2)} m（空腔净高 ${(cavity.ceilingZ-cavity.floorZ).toFixed(2)} m）`:'已放在所点表面外 0.5 m（未点到空腔）';['x','y','z'].forEach((key,i)=>study.update(key,placed[i]));persistSession();sync();renderList();scheduleDetectorUpdate();},
  placeCancelled(){setPlacingButton(false);},
  // Drag handles (ADR-032 step 7): the dragged position or pose goes through the plan like typed values.
  dragStation(station){if(!workingActive)return;const current=inputs().station;for(const key of ['x','y','z','az','el'])if(station[key]!==current[key])study.update(key,station[key]);persistSession();sync();renderList();scheduleDetectorUpdate();},
  // 瞄准此处 (ADR-032): point the working detector at a model point picked in 3D.
  aimAt(point){if(!workingActive)return;const {x,y,z}=inputs().station,pose=aimPose([x,y,z],point),note=$('#placeNote');if(!pose)return;setPose(pose.az,pose.el);
   note.hidden=false;note.textContent=`已瞄准所点位置：方位 ${pose.az}° · 仰角 ${pose.el}°${pose.clamped?'（目标低于探测器，仰角限为 0°）':''}`;},
  // A station marker or its label in 3D opens that station as the working station (#15, FR-M4).
  pickStation(id){selectCandidate(id);},dispose(){queue.dispose();controller.dispose();mainPatterns.dispose?.();projectionView.dispose();sceneView.dispose();}});
}
