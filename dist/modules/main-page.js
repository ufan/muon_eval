import { createMainPatternView } from './main-pattern-view.js';
import { deviceSettingsData as serializeDeviceSettings } from './device-configuration.js';
import { createRecognitionPanel } from './recognition-panel-view.js';
import { createFeatureLayerPanel } from './feature-layer-panel-view.js';
import { featureLayerGroups, featuresInView } from './feature-layers.js';
import { parsePlan, serializePlan, planFromState, extractDeployments } from './plan-format.js';
import { createStudyState } from './study-state.js';
import { assessmentKey, compactResult, compactItemLengths, createResultCache, createCandidateQueue, compareEntries, entryCountsBottomFirst } from './candidate-results.js';
import { overviewTable } from './overview-table.js';
import { createOverviewPanel } from './overview-panel-view.js';
import { createProjectionTiles } from './projection-tiles-view.js';
import { createDemoView } from './demo-view.js';
import { createTaskMode } from './task-mode.js';
import { aimAt as aimPose } from './detector-pose.js';
import { shortcutFor } from './view-shortcuts.js';
import { demoFootnote } from './demo-snapshot.js';
import { openStudies, saveStudy, saveSession, createStudy, switchStudy, listStudies, deleteStudy } from './plan-store.js';
import { selectionHref, APP_PAGES } from './application-selection.js';
import { placementPoint, coverageStationSet } from './coverage-map.js';
export function createMainPage({workbenchHref='./geometry-preview.html',datasetId,datasetVersion,features,featureLayerOptions={},recognitionItems,state,sceneView,projectionView,createController,createPort,placeInCavity=()=>null,sliceMask=null,targetSamples=null,scenarioId=null,releases=[],candidateIds=[],capabilities,environmentDescription,backendLabel,root=document,storage=localStorage}){
 const $=s=>root.querySelector(s),$$=s=>[...root.querySelectorAll(s)];

 const projection={mode:'counts',data:null,recognition:null,precision:false};
 const precisionKey=`muon-precision:${datasetId}`;try{projection.precision=storage.getItem(precisionKey)==='1';}catch{}
 // Studies (PLAN_FORMAT.md, FR-P8): each release keeps several plans; the active one holds the stations, poses,
 // detector and deployments. The active station is session state stored next to the plan, never inside it.
 let studyId='study-1',datasetStations=[],study=null,workingKey=null,workingBusy=false;
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
 const controller=createController({readInputs:inputs,onInvalidate(){workingBusy=true;queue.pause();mainPatterns.invalidate();projection.data=null;sceneView.setCoverageResult(null);sceneView.setFeaturesInView(null);recognition.update(null);projection.recognition=recognition.state();$('#projectionReadout').textContent='姿态更新中…';},onStart(input){workingKey=assessmentKey(input);workingBusy=true;queue.pause();sceneView.drawDetector(input.station,input.device);},onQuick({metrics}){if(metrics)showQuickMetrics(metrics);},onProgress({quality,progress}){$('#projectionReadout').textContent=`${quality==='preview'?'快速预览':'精细投影'}计算中… ${Math.round(100*progress)}%`;},onResult(data,input){projection.data=data;sceneView.setCoverageResult(data,input.device);sceneView.setFeaturesInView(featuresInView(data,layerFeatureIds,{threshold:recognition.state().threshold}));recognition.update(data);projection.recognition=recognition.state();if(data.quality==='final'){updateProjectionAssessment(data,input.station);mainPatterns.update(data.patternResult,projection.mode);results.set(assessmentKey(input),compactResult(data.patternResult,{selection:mainPatterns.selection,recognition:compactItemLengths(data,recognitionItems)}));workingBusy=false;refreshCandidates();resumeQueue();renderList();showComparison();}drawProjection();},onError(error){console.error(error);workingBusy=false;resumeQueue();$('#projectionReadout').textContent='评估计算失败：'+error.message;}});
 const scheduleDetectorUpdate=()=>controller.schedule(),resize=()=>sceneView.resize(),setView=mode=>sceneView.setView(mode);
 const drawProjection=()=>projectionView.draw(projection,study.configuration.response);
 const applyDeviceSettings=s=>study.configure(s);
 const deviceSettingsData=()=>study.working.settings;
 $('#projectionToggle')?.addEventListener('click',()=>{const b=$('#projectionBody'),hidden=b.style.display==='none';b.style.display=hidden?'block':'none';$('#projectionToggle').textContent=hidden?'−':'+'});
$$('[data-projection]').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;projection.mode=b.dataset.projection;$$('[data-projection]').forEach(x=>x.classList.toggle('active',x===b));mainPatterns.redraw(projection.mode);drawProjection()}));

function constrainProjectionPanel(){const panel=$('#projectionPanel'),viewport=$('#viewport');if(!panel||!viewport||!panel.style.left||!panel.closest('#viewport'))return;const maxX=Math.max(0,viewport.clientWidth-panel.offsetWidth),maxY=Math.max(0,viewport.clientHeight-panel.offsetHeight),xRatio=Number(panel.dataset.xRatio),yRatio=Number(panel.dataset.yRatio),x=Number.isFinite(xRatio)?maxX*xRatio:parseFloat(panel.style.left)||0,y=Number.isFinite(yRatio)?maxY*yRatio:parseFloat(panel.style.top)||0;panel.style.left=Math.max(0,Math.min(maxX,x))+'px';panel.style.top=Math.max(0,Math.min(maxY,y))+'px'}
function makeProjectionDraggable(){const panel=$('#projectionPanel'),handle=$('#projectionHandle'),viewport=$('#viewport');let drag=null;handle.addEventListener('pointerdown',e=>{if(e.target.closest('button')||!panel.closest('#viewport'))return;const p=panel.getBoundingClientRect(),v=viewport.getBoundingClientRect();drag={dx:e.clientX-p.left,dy:e.clientY-p.top,v};panel.style.right='auto';handle.setPointerCapture(e.pointerId)});handle.addEventListener('pointermove',e=>{if(!drag)return;const maxX=Math.max(0,drag.v.width-panel.offsetWidth),maxY=Math.max(0,drag.v.height-panel.offsetHeight),x=Math.max(0,Math.min(maxX,e.clientX-drag.v.left-drag.dx)),y=Math.max(0,Math.min(maxY,e.clientY-drag.v.top-drag.dy));panel.style.left=x+'px';panel.style.top=y+'px';panel.dataset.xRatio=maxX?String(x/maxX):'0';panel.dataset.yRatio=maxY?String(y/maxY):'0'});handle.addEventListener('pointerup',e=>{drag=null;handle.releasePointerCapture(e.pointerId)});handle.addEventListener('pointercancel',()=>drag=null)}
 function updateProjectionAssessment(d,c){if(!d||d.quality!=='final')return;const mid=Math.floor(d.n/2),center=d.values[mid*d.n+mid],paths=d.values.filter(v=>v.factor>0).map(v=>v.q.totals.concrete),viewTransmission=100*d.weightedTransmission;$('#path').textContent=center.q.totals.concrete.toFixed(1)+' m';$('#opacity').textContent=center.q.mwe.toFixed(0);$('#count').textContent=d.total>999999?(d.total/1e6).toFixed(2)+'M':d.total>999?(d.total/1000).toFixed(1)+'k':Math.round(d.total);$('#sky').textContent=viewTransmission.toFixed(2)+'%';$('#rayCells').textContent=(center.q.cells?.length??center.q.segments?.length??0)+' 个';$('#rayRange').textContent=Math.min(...paths).toFixed(0)+'–'+Math.max(...paths).toFixed(0)+' m'}
 function showQuickMetrics({center,count,weightedTransmission,paths}){$('#path').textContent=center.totals.concrete.toFixed(1)+' m';$('#opacity').textContent=center.mwe.toFixed(0);$('#count').textContent=count>999?(count/1000).toFixed(1)+'k':count;$('#sky').textContent=(100*weightedTransmission).toFixed(1)+'%';$('#rayCells').textContent=center.cells.length+' 个';$('#rayRange').textContent=Math.min(...paths).toFixed(0)+'–'+Math.max(...paths).toFixed(0)+' m';}
 // Candidate list (FR-P6): fixed candidates with their result status; the active row is the working station's source.
 const formatCount=v=>v>999999?(v/1e6).toFixed(2)+'M':v>999?(v/1000).toFixed(1)+'k':String(Math.round(v));
 function candidateState(id){const key=candidateKey(id);return results.has(key)?'ready':queue.state(key)??(workingBusy&&key===workingKey?'running':'pending');}
 const STATE_TEXT={running:'计算中…',queued:'排队计算',failed:'计算失败',pending:'待计算'};
 // Other stations in the coverage view (14d sketching): a stable colour per candidate, shown as a swatch in the list.
 // No red: red is the geometric count tint.
 const EXTRA_COLORS=['#4fc3f7','#ffd54f','#81c784','#ba68c8','#4db6ac','#9fa8da','#90a4ae','#dce775'];let coverageStationsMode='none',coverageSignature='';
 function coverageExtras(mode=coverageStationsMode){const pool=study.plan.stations.map(s=>s.id),deployment=study.plan.deployments.find(d=>d.id===study.activeDeployment)?.stations??[];
  return coverageStationSet(mode,{pool,compared:study.compared,deployment,exclude:study.modified?null:study.working.from}).map(id=>{const s=study.candidate(id),input=study.candidateInput(id);
   const entry=results.get(assessmentKey(input));
   return{id,name:s.name,x:s.position[0],y:s.position[1],z:s.position[2],az:s.pose.azimuthDeg,el:s.pose.elevationDeg,device:input.device,color:EXTRA_COLORS[pool.indexOf(id)%EXTRA_COLORS.length],n:entry?.n,counts:entryCountsBottomFirst(entry),entry:entry??null};});}
 function syncCoverageStations(extras=coverageExtras()){const signature=JSON.stringify(extras.map(s=>[s.id,s.x,s.y,s.z,s.az,s.el,s.device.maxSlopeX,s.device.maxSlopeY,s.color,s.n??0,s.counts?s.counts[0]+s.counts[s.counts.length>>1]:null]));$('#coverageCountLegend').hidden=!extras.length||$('#coverageMode').value==='physical';$('#multiControls').hidden=!extras.length||$('#coverageMode').value!=='physical';if(signature===coverageSignature)return;coverageSignature=signature;sceneView.setCoverageStations(extras);}
 function renderList(){const h=$('#candidateList');if(!h||!study)return;const extras=coverageExtras(),swatch=new Map(extras.map(s=>[s.id,s.color]));syncCoverageStations(extras);const w=study.working,compared=new Set(study.compared),modified=study.modified;
  h.replaceChildren(...study.plan.stations.map(s=>{const state=candidateState(s.id),entry=results.get(candidateKey(s.id)),d=document.createElement('div');d.className='candidate'+(workingActive&&s.id===w.from?' active':'');d.dataset.candidate=s.id;
   d.innerHTML=`<label class="compare"><input type="checkbox" data-compare="${escapeHtml(s.id)}"${compared.has(s.id)?' checked':''}>比较</label><b>${swatch.has(s.id)?`<i class="cov-swatch" style="--c:${swatch.get(s.id)}" title="覆盖视图中的颜色"></i>`:''}${escapeHtml(s.name)}${s.id===w.from&&modified?' <em>· 编辑中</em>':''}</b><span>X ${s.position[0].toFixed(1)} · Y ${s.position[1].toFixed(1)} · Z ${s.position[2].toFixed(1)}</span><span>方位 ${s.pose.azimuthDeg}° · 仰角 ${s.pose.elevationDeg}°</span><span class="result-status" data-state="${state}">${state==='ready'?`${formatCount(entry.totalCount)} 计数 · 透射 ${(100*entry.weightedTransmission).toFixed(2)}%`:STATE_TEXT[state]}</span>`;
   d.onclick=e=>{if(!e.target.closest('.compare'))toggleCandidate(s.id);};
   d.querySelector('[data-compare]').onchange=e=>{study.setCompared(s.id,e.target.checked);persistSession();refreshCandidates();showComparison();};return d;}));
  const source=w.from===null?null:study.candidate(w.from);$('#workingStatus').textContent=source===null?'未保存的新点位':modified?`来自「${source.name}」· 已修改，未保存`:`与候选「${source.name}」一致`;
  $('#updateCandidate').disabled=source===null||!modified;$('#remove').disabled=!workingActive||source===null||study.plan.stations.length<2;renderDeployments();renderOverview();demo.render();}
 // Multi-station overview (#15, FR-M4, FR-M15): per recognition item, the working station and the stations chosen in the overview
 // (the same set as 覆盖范围 → 其他点位), from their cached compact results. Target points come once per page from the calculation
 // geometry, after the first final result so they never delay it.
 let samples=null,sampling=null,overviewSignature='',multiOptions={errorLevel:.1,minViews:3,goodSpreadDeg:30,minSpreadDeg:10};
 const overview=createOverviewPanel({root,onSelectStation:id=>selectCandidate(id),onHoverItem:id=>{const item=recognitionItems.find(i=>i.id===id);sceneView.emphasiseFeatures(item?.kind==='features'?[...item.featureIds]:[]);}});
 function overviewStations(){const all=overviewStationsAll();return workingActive?all:all.filter(s=>s.id!=='working');}
 function overviewStationsAll(){const input=inputs(),entry=workingBusy?null:results.get(workingKey)??null,source=study.working.from===null?null:study.candidate(study.working.from),{x,y,z,az,el}=input.station;
  return[{id:'working',name:source&&!study.modified?`工作点位（${source.name}）`:'工作点位',x,y,z,az,el,device:input.device,n:entry?.n,counts:entryCountsBottomFirst(entry),entry},...coverageExtras($('#overviewStations')?.value??'none')];}
 // Per-station projections side by side (#16): the overview's stations, redrawn while open when they, their results or the outline settings change.
 let taskMode=null;const tiles=createProjectionTiles({root,onOpenStation:id=>selectCandidate(id),onToggleCompare:(id,on)=>{study.setCompared(id,on);persistSession();renderList();showComparison();refreshCandidates();renderOverview();}});let tilesSignature='';
 function tilesState(stations){const r=recognition.state(),known=new Set(recognitionItems.map(i=>i.id));return{stations:stations.map(s=>({...s,color:s.color??'#ff4fb3',compared:study.compared.includes(s.id)})),items:r.items.filter(i=>r.selected.has(i.id)&&known.has(i.id)),threshold:r.threshold,precision:projection.precision,exposureDays:study.configuration.response.exposureDays};}
 function renderOverview(){if(!study||!$('#overviewTable'))return;const stations=overviewStations(),threshold=recognition.state().threshold;
  if(tiles.isOpen){const state=tilesState(stations),signature=JSON.stringify([state.stations.map(s=>[s.id,s.name,s.entry?s.entry.totalCount:null,s.compared]),state.items.map(i=>i.id),threshold,state.precision]);if(signature!==tilesSignature){tilesSignature=signature;tiles.update(state);}}
  if(!samples&&!sampling&&targetSamples&&!workingBusy&&results.has(workingKey))sampling=targetSamples({items:recognitionItems}).catch(error=>{console.error(error);return new Map();}).then(s=>{samples=s;overviewSignature='';renderOverview();});
  const signature=JSON.stringify([stations.map(s=>[s.id,s.name,s.x,s.y,s.z,s.az,s.el,s.n??0,s.entry?s.entry.totalCount:null]),threshold,multiOptions,!!samples]);if(signature===overviewSignature)return;overviewSignature=signature;
  const rows=overviewTable({items:recognitionItems,stations,samples:samples??new Map(),threshold,options:multiOptions}),pending=stations.filter(s=>!s.entry).length;
  overview.render({rows,minViews:multiOptions.minViews,message:`${stations.length} 个点位${pending?`（${pending} 个计算中）`:''}${samples?'':' · 目标内部采样待第一个结果完成后进行…'}`});}
 // Demonstration mode (#17, FR-M5): the overview's stations in a clean view; caption, legend and footnote say what is shown
 // and what the numbers are not, on screen and in every screenshot.
 function describeDemo(){const stations=overviewStations(),set=$('#overviewStations').value,deployment=study.plan.deployments.find(d=>d.id===study.activeDeployment),mode=$('#coverageMode').value,multi=!$('#multiControls').hidden,count=!$('#coverageCountLegend').hidden;
  const coverage=mode==='off'?null:multi?$('#multiLegend').textContent:count?$('#coverageCountLegend').textContent:mode==='physical'?'覆盖：物理（计数/sr，对数亮度）':'覆盖：几何视场';
  return{caption:{title:$('.title').textContent,subtitle:`${studyLabel({id:studyId,title:study.plan.title})}${set==='deployment'&&deployment?` · ${deployment.name}`:''} · ${stations.length} 个点位`},
   legend:[...stations.map(s=>({color:s.color??'#ff4fb3',text:`${s.name}${s.entry?'':'（计算中）'}`})),...(coverage?[{text:coverage}]:[])],
   footnote:[...demoFootnote({release:datasetId,scenario:scenarioId??'—',exposureDays:study.configuration.response.exposureDays,detector:study.configuration.device.model,date:new Date()}),...(multi?['多视角覆盖与综合等级为规划参考，不是重建质量保证。']:[])]};}
 const demo=createDemoView({root,sceneView,storage,storageKey:`muon-demo-views:${datasetId}`,datasetId,describe:describeDemo});
 // Pose changes from 瞄准此处 and the arrow-key shortcuts go through the plan like typed values.
 function setPose(az,el){study.update('az',az);study.update('el',el);persistSession();sync();renderList();scheduleDetectorUpdate();}
 // Shortcuts (ADR-032, view-shortcuts.js); off in demonstration mode, whose arrow keys step through the views.
 function bindShortcuts(){let lastCoverage='geometric';window.addEventListener('keydown',event=>{if($('.app').classList.contains('demo'))return;const action=shortcutFor(event);if(!action)return;
  if(action.toggle==='coverage'){const mode=$('#coverageMode');if(mode.value!=='off'){lastCoverage=mode.value;mode.value='off';}else mode.value=lastCoverage;mode.dispatchEvent(new Event('change',{bubbles:true}));}
  else if(action.toggle){$(`[data-layer="${action.toggle}"]`).click();}
  else{if(!workingActive)return;event.preventDefault();const {az,el}=inputs().station;setPose(action.nudge==='az'?(((az+action.by)%360)+360)%360:az,action.nudge==='el'?Math.min(90,Math.max(0,el+action.by)):el);}});}
 function bindOverview(){const select=$('#overviewStations'),stations=$('#coverageStations');select.value=stations.value;select.onchange=()=>{stations.value=select.value;stations.onchange();};

  $('#overviewShow3d').onclick=()=>{$('#coverageMode').value='physical';$('#coverageMulti').value='class';stations.onchange();};
  // Task modes (ADR-032): 多站评估 shows the multi-station panel and the stations' multi-view coverage in 3D; leaving it
  // restores the coverage settings from before. View state only.
  let coverageBeforeMulti=null;
  taskMode=createTaskMode({root,storage,storageKey:`muon-task-mode:${datasetId}`,onChange:mode=>{const coverage=$('#coverageMode'),multi=$('#coverageMulti');
   if(mode==='multi'){coverageBeforeMulti={mode:coverage.value,multi:multi.value,stations:stations.value};if(stations.value==='none')stations.value=study.compared.length?'compared':'all';
    select.value=stations.value;coverage.value='physical';multi.value='class';stations.onchange();tilesSignature='';tiles.open(tilesState(overviewStations()));}
   else if(coverageBeforeMulti){coverage.value=coverageBeforeMulti.mode;multi.value=coverageBeforeMulti.multi;stations.value=select.value=coverageBeforeMulti.stations;stations.onchange();coverageBeforeMulti=null;}
   requestAnimationFrame(resize);}});}
 // Named deployments (FR-P7): a subset of the candidates, chosen by ticking; several alternatives per study.
 function renderDeployments(){const select=$('#deploymentSelect');if(!select||!study)return;const active=study.activeDeployment,deployment=study.plan.deployments.find(d=>d.id===active)??null;
  select.replaceChildren(...(study.plan.deployments.length?study.plan.deployments.map(d=>new Option(d.name,d.id,false,d.id===active)):[new Option('（无组合）','',true,true)]));select.disabled=!deployment;
  for(const id of ['#copyDeployment','#renameDeployment','#deleteDeployment'])$(id).disabled=!deployment;
  const members=new Set(deployment?.stations??[]),host=$('#deploymentMembers');
  host.replaceChildren(...(deployment?study.plan.stations.map(s=>{const label=document.createElement('label'),state=candidateState(s.id);label.innerHTML=`<input type="checkbox" data-member="${escapeHtml(s.id)}"${members.has(s.id)?' checked':''}>${escapeHtml(s.name)}<span>${state==='ready'?'已计算':STATE_TEXT[state]}</span>`;
   label.querySelector('input').onchange=e=>{study.setMember(deployment.id,s.id,e.target.checked);persistPlan();renderDeployments();};return label;}):[]));
  $('#deploymentSummary').textContent=deployment?`${members.size} 个点位${[...members].every(id=>candidateState(id)==='ready')?'，均已计算':'，计算中'}。多站联合指标见“多站总览”（选择“当前部署组合”）。`:'新建一个部署组合，再勾选其中的候选点位。';
  $('#compareDeployment').disabled=!members.size;}
 const askName=(message,value)=>{const name=prompt(message,value);return name===null?null:name.trim().slice(0,200)||value;};
 function bindDeployments(){
  $('#deploymentSelect').onchange=e=>{study.selectDeployment(e.target.value);persistSession();renderDeployments();};
  $('#newDeployment').onclick=()=>{const name=askName('部署组合名称',`部署组合 ${study.plan.deployments.length+1}`);if(name===null)return;study.createDeployment(name);persistPlan();renderDeployments();};
  $('#copyDeployment').onclick=()=>{const d=study.plan.deployments.find(x=>x.id===study.activeDeployment),name=askName('复制为',`${d.name} 副本`);if(name===null)return;study.copyDeployment(d.id,name);persistPlan();renderDeployments();};
  $('#renameDeployment').onclick=()=>{const d=study.plan.deployments.find(x=>x.id===study.activeDeployment),name=askName('部署组合名称',d.name);if(name===null)return;study.renameDeployment(d.id,name);persistPlan();renderDeployments();};
  $('#deleteDeployment').onclick=()=>{const d=study.plan.deployments.find(x=>x.id===study.activeDeployment);if(!confirm(`删除部署组合「${d.name}」？候选点位不受影响。`))return;study.deleteDeployment(d.id);persistPlan();renderDeployments();};
  // Compare exactly this deployment's stations.
  $('#compareDeployment').onclick=()=>{const members=new Set(study.plan.deployments.find(x=>x.id===study.activeDeployment)?.stations??[]);for(const s of study.plan.stations)study.setCompared(s.id,members.has(s.id));persistSession();renderList();showComparison();refreshCandidates();$('#mainPatternControls').open=true;};}
 function showComparison(){if(!study)return;const rows=study.compared.map(id=>({id,label:study.candidate(id).name,state:candidateState(id)})),ready=rows.filter(r=>r.state==='ready');
  mainPatterns.showCandidates(rows,ready.length?compareEntries(ready.map(r=>({label:r.label,entry:results.get(candidateKey(r.id))}))):null);}
 // Working station on or off (owner, 2026-10-16): clicking the highlighted candidate in the list deselects it and
 // discards unsaved edits; the app then shows no working station until a candidate is chosen. View state only.
 let workingActive=true;
 function setWorkingActive(on){workingActive=Boolean(on);$('#singlePanel').classList.toggle('inactive',!workingActive);$('#noWorking').hidden=workingActive;sceneView.setWorkingVisible(workingActive);renderList();renderOverview();}
 function deactivateWorking(){study.select(study.working.from??study.plan.stations[0].id);persistSession();sync();setWorkingActive(false);}
 // In-page confirmation: the artifact viewer and some embeds block window.confirm.
 function confirmInPage(message){const dialog=$('#confirmDialog');$('#confirmText').textContent=message;dialog.returnValue='';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'),{once:true}));}
 function toggleCandidate(id){if(workingActive&&id===study.working.from)deactivateWorking();else selectCandidate(id);}
 async function selectCandidate(id){if(!workingActive){study.select(id);persistSession();sync();setWorkingActive(true);scheduleDetectorUpdate();return;}
  if(study.modified&&!await confirmInPage('当前编辑点位有未保存的修改，切换会放弃这些修改。继续吗？'))return;study.select(id);persistSession();sync();renderList();scheduleDetectorUpdate();}
 function syncDeviceStatus(){const {device:DEVICE,response:RESPONSE}=study.configuration,pct=v=>(100*v).toFixed(1).replace(/\.0$/,'')+'%',slope=v=>v.toFixed(2);$('#areaOut').textContent=`${(DEVICE.width*1000).toFixed(1)} × ${(DEVICE.height*1000).toFixed(1)} mm`;$('#pitchOut').textContent=(DEVICE.stripPitch*1000).toFixed(2).replace(/0$/,'')+' mm';$('#stripsOut').textContent=DEVICE.stripsX;$('#spacingOut').textContent=DEVICE.spacing.toFixed(2)+' m';$('#baselineOut').textContent=DEVICE.baseline.toFixed(2)+' m';$('#fovOut').textContent=DEVICE.fovH.toFixed(1)+'° / '+DEVICE.fovV.toFixed(1)+'°';$('#coreFovOut').textContent=`${2*DEVICE.stripsX-1} × ${2*DEVICE.stripsY-1}`;$('#efficiencyOut').textContent=pct(RESPONSE.layerEfficiency);$('#coincidenceOut').textContent=pct(RESPONSE.layerEfficiency**DEVICE.layers*RESPONSE.deadLiveFraction);$('#deadOut').textContent=pct(1-RESPONSE.deadLiveFraction);$('#resolutionOut').textContent=RESPONSE.angularResolutionDeg.toFixed(2).replace(/0$/,'')+'°';$('#exposureLabel').textContent=RESPONSE.exposureDays+'天预计计数';$('#sxMin').textContent='−'+slope(DEVICE.maxSlopeX);$('#sxMax').textContent='+'+slope(DEVICE.maxSlopeX);$('#syMin').textContent='−'+slope(DEVICE.maxSlopeY);$('#syMax').textContent='+'+slope(DEVICE.maxSlopeY)}
 function sync(){const w=study.working;for(const k of ['name','x','y','z','az','el'])$('#'+k).value=w[k];$('#azNumber').value=w.az;$('#elNumber').value=w.el;syncDeviceStatus()}
 // The study's plan always follows the scenario chosen in the app.
 function applyPlan(plan,session){study=createStudyState({plan:{...plan,scene:{...plan.scene,scenario:scenarioId}},session,environment:state.environment});}
 const persistSession=()=>saveSession(storage,datasetId,studyId,study.session());
 const persistPlan=()=>saveStudy(storage,datasetId,studyId,study.plan,study.session());
 // Study picker: switch between the release's studies or start a new one from the dataset candidates.
 const studyLabel=({id,title})=>title||`工作方案 ${id.replace(/^study-/,'')}`;
 function renderStudies(){const select=$('#studySelect');if(!select)return;const studies=listStudies(storage,datasetId);if(!studies.some(s=>s.id===studyId))studies.push({id:studyId,title:study.plan.title});select.replaceChildren(...studies.map(s=>new Option(studyLabel(s),s.id,false,s.id===studyId)));}
 function openStudy(id,{plan,session}){studyId=id;applyPlan(plan,session);renderStudies();renderList();sync();showComparison();refreshCandidates();scheduleDetectorUpdate();}
 function bindStudies(){$('#studySelect').onchange=e=>{persistPlan();try{openStudy(e.target.value,switchStudy(storage,datasetId,e.target.value));}catch(error){alert('工作方案无法打开：'+error.message);renderStudies();}};
  $('#renameStudy').onclick=()=>{const name=askName('工作方案名称',studyLabel({id:studyId,title:study.plan.title}));if(name===null)return;study.setTitle(name);persistPlan();renderStudies();};
  $('#deleteStudy').onclick=()=>{if(!confirm(`删除工作方案「${studyLabel({id:studyId,title:study.plan.title})}」？此操作不可撤销，需要时请先导出。`))return;deleteStudy(storage,datasetId,studyId);const next=listStudies(storage,datasetId)[0];
   if(next){openStudy(next.id,switchStudy(storage,datasetId,next.id));return;}const plan=planFromState({release:datasetId,scenario:scenarioId,model:state.configuration.device.model,stations:datasetStations,settings:serializeDeviceSettings(state.configuration)});openStudy(createStudy(storage,datasetId,plan),{plan,session:null});};
  $('#newStudy').onclick=()=>{persistPlan();const plan=planFromState({release:datasetId,scenario:scenarioId,model:state.configuration.device.model,stations:datasetStations,settings:serializeDeviceSettings(state.configuration)});openStudy(createStudy(storage,datasetId,plan),{plan,session:null});};}
 function download(text,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
 function fillDeviceForm(){const s=deviceSettingsData();$('#cfgWidth').value=(s.width*1000).toFixed(1);$('#cfgHeight').value=(s.height*1000).toFixed(1);$('#cfgPitch').value=(s.stripPitch*1000).toFixed(2);$('#cfgStrips').value=s.strips;$('#cfgSpacing').value=s.spacing;$('#cfgEfficiency').value=(s.layerEfficiency*100).toFixed(1);$('#cfgDead').value=((1-s.deadLiveFraction)*100).toFixed(1);$('#cfgResolution').value=s.angularResolutionDeg;$('#cfgSystematic').value=(s.systematicFraction*100).toFixed(1);$('#cfgExposure').value=s.exposureDays;$('#cfgAngular').value=s.angularModel}
 function bindDeviceSettings(){const dialog=$('#deviceDialog');$('#deviceSettings').onclick=()=>{fillDeviceForm();dialog.showModal()};$('#deviceClose').onclick=$('#deviceCancel').onclick=()=>dialog.close();const formSettings=()=>({width:+$('#cfgWidth').value/1000,height:+$('#cfgHeight').value/1000,stripPitch:+$('#cfgPitch').value/1000,strips:+$('#cfgStrips').value,spacing:+$('#cfgSpacing').value,layerEfficiency:+$('#cfgEfficiency').value/100,deadLiveFraction:1-+$('#cfgDead').value/100,angularResolutionDeg:+$('#cfgResolution').value,systematicFraction:+$('#cfgSystematic').value/100,exposureDays:+$('#cfgExposure').value,angularModel:$('#cfgAngular').value});
  // The form edits the working station's detector; "应用到全部候选" also sets it on every candidate (explicit update, FR-P6).
  $('#deviceForm').onsubmit=e=>{e.preventDefault();applyDeviceSettings(formSettings());controller.clearCaches();persistSession();syncDeviceStatus();renderList();dialog.close();scheduleDetectorUpdate()};
  $('#deviceApplyAll').onclick=()=>{applyDeviceSettings(formSettings());study.applyDetectorToAll();controller.clearCaches();persistPlan();syncDeviceStatus();refreshCandidates();renderList();showComparison();dialog.close();scheduleDetectorUpdate()};dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()})}
 function updateWater(){if(!capabilities.continuousWater)return;const level=+$('#upLevel').value;$('#upOut').textContent='▽'+level+' m';state.setEnvironment({upstream:level});sceneView.setWater(level);scheduleDetectorUpdate();}
 function setDamOpacity(){const opacity=+$('#damOpacity').value/100;$('#damOpacityOut').textContent=Math.round(opacity*100)+'%';sceneView.setDamOpacity(opacity);}
 // An imported plan always becomes a new study of its release (never overwriting one); a plan of another
 // release or scenario then opens that selection, where the new study is the active one.
 async function importPlan(event){const file=event.target.files[0];event.target.value='';if(!file)return;
  try{if(file.size>5*1024*1024)throw new Error('文件超过 5 MB');const plan=parsePlan(await file.text());
   if(plan.scene.contentHash!==null)throw new Error('用户加载的数据集尚不支持');if(!releases.includes(plan.scene.release))throw new Error(`未登记的数据集版本 ${plan.scene.release}`);
   if(plan.scene.release===datasetId&&(plan.scene.scenario??scenarioId)===scenarioId){persistPlan();openStudy(createStudy(storage,datasetId,plan),{plan,session:null});return;}
   persistPlan();createStudy(storage,plan.scene.release,plan);location.assign(selectionHref(APP_PAGES.main,{datasetId:plan.scene.release,scenarioId:plan.scene.scenario}));
  }catch(error){alert('方案导入失败：'+error.message);}}
 // Coverage highlight (FR-M10): view state, remembered per release; never changes results.
 function bindCoverage(){const key=`muon-coverage:${datasetId}`;let saved={};try{saved=JSON.parse(storage.getItem(key))??{};}catch{}
  const mode=$('#coverageMode'),core=$('#coverageCore'),context=$('#coverageContext'),stations=$('#coverageStations'),featureTint=$('#coverageFeatures');featureTint.checked=saved.features!==false;mode.value=['off','geometric','physical'].includes(saved.mode)?saved.mode:'off';core.checked=saved.core===true;context.checked=saved.context===true;
  stations.value=['none','compared','deployment','all'].includes(saved.stations)?saved.stations:'none';
  // Physical multi-station maps (15d, FR-M15): 多视角覆盖 by default; thresholds as decided (10 %, ≥ 3 views and ≥ 30°, < 10°).
  const multi=$('#coverageMulti'),error=$('#coverageError'),views=$('#classViews'),good=$('#classGoodSpread'),minimum=$('#classMinSpread'),m=saved.multi??{};
  multi.value=['views','spread','class','dominant','total'].includes(m.map)?m.map:'views';error.value=m.errorLevel===.05?'0.05':'0.1';views.value=m.minViews??3;good.value=m.goodSpreadDeg??30;minimum.value=m.minSpreadDeg??10;
  const clampInput=(input,low,high,fallback)=>{const v=Math.round(+input.value);input.value=Number.isFinite(v)?Math.min(high,Math.max(low,v)):fallback;return +input.value;};
  const legend=value=>{const sw=(c,t)=>`<i style="--c:${c}"></i>${t}`,grey=sw('#3c3c3c','有视场但无可用视角（深灰）');
   return{views:`可用视角数（计数误差 ≤ ${value.errorLevel*100}%）：${['#fcbba1','#fc9272','#fb6a4a','#de2d26','#a50f15'].map((c,i)=>sw(c,i<4?String(i+1):'5+')).join(' ')} · ${grey}`,
    spread:`可用视角的最大张角：${sw('#c6dbef','<10°')} ${sw('#6baed6','10–30°')} ${sw('#2171b5','30–60°')} ${sw('#08306b','>60°')} · ${grey}`,
    class:`综合等级（规划参考，非重建质量保证）：${sw('#1a9850',`良好 ≥${value.minViews} 视角且 ≥${value.goodSpreadDeg}°`)} ${sw('#fdae61','有限')} ${sw('#d73027',`不足 <2 视角或 <${value.minSpreadDeg}°`)}`,
    dominant:'每点取计数/sr 最高的点位颜色，亮度为该点位的计数/sr（颜色不混合）',total:`各点位计数/sr 之和（总统计量的参考指标，不是一次测量）：暗→橙→白，10³–3×10⁷ /sr · ${grey}`}[value.map];};
  const apply=()=>{const value={mode:mode.value,core:core.checked,context:context.checked,stations:stations.value,features:featureTint.checked,
    multi:{map:multi.value,errorLevel:+error.value,minViews:clampInput(views,2,9,3),goodSpreadDeg:clampInput(good,1,179,30),minSpreadDeg:clampInput(minimum,0,179,10)}};
   $('#coverageOptions').hidden=value.mode==='off';$('#coverageMode').dispatchEvent(new Event('coverage-applied'));$('#classThresholds').hidden=value.multi.map!=='class';$('#multiLegend').innerHTML=legend(value.multi);
   sceneView.setCoverage(value);coverageStationsMode=value.mode==='off'?'none':value.stations;coverageSignature='';multiOptions={errorLevel:value.multi.errorLevel,minViews:value.multi.minViews,goodSpreadDeg:value.multi.goodSpreadDeg,minSpreadDeg:value.multi.minSpreadDeg};if($('#overviewStations'))$('#overviewStations').value=value.stations;renderList();try{storage.setItem(key,JSON.stringify(value));}catch{}};
  for(const input of [mode,core,context,stations,multi,error,views,good,minimum,featureTint])input.onchange=apply;apply();}
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
 // Export (FR-P9): the whole study, the current deployment or all deployments; a deployment file holds only
 // its member candidates and the detectors they use.
 function bindExportMenu(){const button=$('#export'),menu=$('#exportMenu'),slug=text=>text.replace(/[^A-Za-z0-9._-]+/g,'_'),base=()=>`muography-plan-${slug(datasetId)}-${slug(studyId)}`;
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  button.onclick=e=>{e.stopPropagation();if(!menu.hidden){close();return;}const deployments=study.plan.deployments,active=deployments.find(d=>d.id===study.activeDeployment);
   menu.querySelector('[data-export="deployment"]').disabled=!active?.stations.length;menu.querySelector('[data-export="deployments"]').disabled=!deployments.some(d=>d.stations.length);menu.hidden=false;button.setAttribute('aria-expanded','true');};
  document.addEventListener('click',e=>{if(!menu.hidden&&!e.target.closest('.export-menu'))close();});
  menu.onclick=e=>{const kind=e.target.closest('[data-export]')?.dataset.export;if(!kind)return;close();
   try{const all=study.plan.deployments.filter(d=>d.stations.length).map(d=>d.id);
    if(kind==='study')download(serializePlan(study.plan),`${base()}.json`);
    else if(kind==='deployment')download(serializePlan(extractDeployments(study.plan,[study.activeDeployment])),`${base()}-${slug(study.activeDeployment)}.json`);
    else download(serializePlan(extractDeployments(study.plan,all)),`${base()}-deployments.json`);
   }catch(error){alert('导出失败：'+error.message);}};}
 function bind(){document.querySelectorAll('.section-toggle').forEach(button=>button.onclick=()=>{const section=button.closest('.collapsible-section'),collapsed=section.classList.toggle('collapsed');button.textContent=collapsed?'▸':'▾';button.setAttribute('aria-expanded',String(!collapsed));button.title=(collapsed?'展开':'收起')+section.querySelector('h2').childNodes[0].textContent.trim()});const updateField=(k,value)=>{try{study.update(k,value);}catch{return;}persistSession();sync();renderList();scheduleDetectorUpdate()};for(const k of ['name','x','y','z','az','el'])$('#'+k).addEventListener('input',e=>updateField(k,e.target.value));$('#azNumber').addEventListener('input',e=>updateField('az',e.target.value));$('#elNumber').addEventListener('input',e=>updateField('el',e.target.value));const toggleSidebar=side=>{const app=$('.app'),collapsed=app.classList.toggle(side+'-collapsed'),button=$(side==='left'?'#toggleLeft':'#toggleRight'),action=(collapsed?'展开':'收起')+(side==='left'?'左侧栏':'右侧栏');// Edge tabs on the sidebars: the triangle points the way the sidebar will move.
  button.textContent=(side==='left')===collapsed?'▶':'◀';button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',action);button.title=action;requestAnimationFrame(resize)};$('#toggleLeft').onclick=()=>toggleSidebar('left');$('#toggleRight').onclick=()=>toggleSidebar('right');$('#viewSelect').onchange=e=>setView(e.target.value);$$('[data-layer]').forEach(e=>{sceneView.setLayer(e.dataset.layer,e.checked);e.onchange=()=>sceneView.setLayer(e.dataset.layer,e.checked);});$('#damOpacity').oninput=setDamOpacity;setDamOpacity();$('#upLevel').oninput=updateWater;$('#gridSize').disabled=true;$('#gridSize').closest('.field').style.display='none';// The plan changed, so the working result's plan reference is recomputed too (provenance, not physics).
 const changed=()=>{persistPlan();sync();renderList();refreshCandidates();showComparison();scheduleDetectorUpdate();};$('#saveCandidate').onclick=()=>{study.saveAsNew();changed();};$('#updateCandidate').onclick=()=>{if(study.modified&&study.working.from!==null){study.updateCandidate();changed();}};$('#remove').onclick=()=>{const id=study.working.from;if(id===null||study.plan.stations.length<2||!confirm(`删除候选「${study.candidate(id).name}」？它也会从所有部署组合中移除。`))return;study.removeCandidate(id);changed();};bindExportMenu();$('#importPlan').onclick=()=>$('#importPlanFile').click();$('#importPlanFile').onchange=importPlan;window.addEventListener('resize',resize)}
 function configureCapabilities(){
  const continuous=capabilities.continuousWater;$('#upLevel').disabled=!continuous;$('#upLevel').title=continuous?'连续上游水位':'由已发布冻结工况决定，不支持连续水位';
  const significance=$('[data-projection="significance"]');significance.disabled=!capabilities.targetSignificance;significance.title=significance.disabled?'聚合材料尚无源实体归属；显著度未实现':'';
  $$('[data-layer]').forEach(input=>{input.disabled=!capabilities.layers.includes(input.dataset.layer);if(input.disabled)input.checked=false;});
  $('#rayCells').nextElementSibling.textContent='中心线材料区段';
  // Backend limitations are configuration context, shown in the 数据配置 menu (which already names the frozen scenario), not in the layer panel.
  if(!continuous){const note=root.createElement('p');note.className='hint';note.id='backendLimitations';note.textContent='此后端未提供：连续水位、结构显著度；模型范围外的材料未知。';($('#dataMenu')??$('#environmentSection')).append(note);}
 }
 return Object.freeze({start(){$('#specVersion').textContent=datasetVersion;configureCapabilities();if(capabilities.continuousWater){$('#upLevel').value=state.environment.upstream;$('#upOut').textContent='▽'+$('#upLevel').value+' m';}else $('#upOut').textContent='冻结工况';datasetStations=state.candidates;const loaded=openStudies({storage,release:datasetId,scenario:scenarioId,model:state.configuration.device.model,candidateIds,defaultStations:datasetStations,defaultSettings:serializeDeviceSettings(state.configuration)});studyId=loaded.active;applyPlan(loaded.plan,loaded.session);if(loaded.warning)console.warn(loaded.warning);renderStudies();bindStudies();bindDeployments();renderList();sync();showComparison();for(const link of [$('#workbenchLink'),$('#workbenchLinkDiagnostics')])if(link)link.href=workbenchHref;sceneView.build();featureLayers.apply();bindCoverage();bindOverview();$('#precisionContours').checked=projection.precision;$('#precisionContours').onchange=e=>{projection.precision=e.target.checked;try{storage.setItem(precisionKey,projection.precision?'1':'0');}catch{}renderOverview();drawProjection();};bind();bindPlacement();bindSlice();bindFovEdges();bindFovSolid();bindDeviceSettings();makeProjectionDraggable();controller.run();refreshCandidates();taskMode.restore();bindShortcuts();},constrainProjectionPanel,hoverFeature(id){sceneView.emphasiseFeatures(id?[id]:[]);projectionView.emphasiseItem(id?recognition.itemForFeature(id)?.id??null:null);},pickFeature(id){recognition.toggleFeature(id);},pickCoverage(ix,iy){projectionView.selectPixel(ix,iy);},
  // A click on a cavity (gallery, room, shaft) places the station inside it, on its floor plus the mounting height;
  // elsewhere 0.5 m off the clicked surface. Cavity geometry comes from the calculation (station-placement.js).
  placeStation({point,normal,direction,featureId=null}){setPlacingButton(false);if(!workingActive)setWorkingActive(true);const cavity=featureId?placeInCavity({point,direction,featureId}):null,note=$('#placeNote');
   const placed=(cavity?cavity.position:placementPoint(point,normal,direction)).map(v=>Math.round(v*100)/100);
   note.hidden=false;note.textContent=cavity?`已放入「${features.get(featureId).label.zh}」：底板 Z ${cavity.floorZ.toFixed(2)} m，离底板 ${(placed[2]-cavity.floorZ).toFixed(2)} m（空腔净高 ${(cavity.ceilingZ-cavity.floorZ).toFixed(2)} m）`:'已放在所点表面外 0.5 m（未点到空腔）';['x','y','z'].forEach((key,i)=>study.update(key,placed[i]));persistSession();sync();renderList();scheduleDetectorUpdate();},
  placeCancelled(){setPlacingButton(false);},
  // 瞄准此处 (ADR-032): point the working detector at a model point picked in 3D.
  aimAt(point){if(!workingActive)return;const {x,y,z}=inputs().station,pose=aimPose([x,y,z],point),note=$('#placeNote');if(!pose)return;setPose(pose.az,pose.el);
   note.hidden=false;note.textContent=`已瞄准所点位置：方位 ${pose.az}° · 仰角 ${pose.el}°${pose.clamped?'（目标低于探测器，仰角限为 0°）':''}`;},
  // A station marker or its label in 3D opens that station as the working station (#15, FR-M4).
  pickStation(id){selectCandidate(id);},dispose(){queue.dispose();controller.dispose();mainPatterns.dispose?.();projectionView.dispose();sceneView.dispose();}});
}
