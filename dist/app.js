import { loadDataset } from './modules/dataset-loader.js';
import { resolveApplicationSelection, selectionHref, APP_PAGES } from './modules/application-selection.js';

async function main(){
 const response=await fetch('./datasets/registry.json');if(!response.ok)throw new Error('Dataset registry unavailable');
 const registry=await response.json(),selection=resolveApplicationSelection(registry,location.search);
 // The dataset (and the mesh of the scenario to show) starts loading first; the view modules, all preloaded by
 // index.html, are imported meanwhile instead of before anything starts (first-load latency).
 const datasetLoad=loadDataset(selection.datasetId,'./datasets/registry.json',{registry,scenarioId:selection.scenarioId??null});datasetLoad.catch(()=>{});
 const [{createApplicationBackend},{createAssessmentController,createLocalAssessmentPort},{createCompiledSceneView},{createProjectionCanvasView},{createApplicationSelectionView},{createViewportTools},{createMainPage},{createDeploymentState}]=await Promise.all([
  import('./modules/application-backends.js'),import('./modules/assessment-controller.js'),import('./modules/compiled-scene-view.js'),import('./modules/projection-canvas-view.js'),
  import('./modules/application-selection-view.js'),import('./modules/viewport-tools.js'),import('./modules/main-page.js'),import('./modules/deployment-state.js')]);
 const dataset=await datasetLoad,backend=await createApplicationBackend(dataset,selection);
 const state=createDeploymentState({stations:backend.stations,environment:backend.environment});let page;
 const sceneView=createCompiledSceneView({dataset,runtime:backend.runtime,waterLayers:backend.waterLayers,features:dataset.features,featureLayers:dataset.featureLayers,onResize:()=>page?.constrainProjectionPanel(),onFeatureHover:id=>page?.hoverFeature(id),onFeaturePick:id=>page?.pickFeature(id),onCoveragePick:(ix,iy)=>page?.pickCoverage(ix,iy),onPlacePick:surface=>page?.placeStation(surface),onStationPick:id=>page?.pickStation(id),onPlaceCancel:()=>page?.placeCancelled(),onAimPick:point=>page?.aimAt(point),onStationDrag:station=>page?.dragStation(station)});
 const projectionView=createProjectionCanvasView({onHover:(data,x,y,options)=>sceneView.showProjectionPixel(data,x,y,options),onLeave:()=>sceneView.clearProjection(),onSideView:(data,x,y)=>sceneView.viewRaySideOn(data,x,y)});
 createApplicationSelectionView({registry,selection:backend.selection,scenarios:backend.scenarios,backendLabel:selection.backend,description:backend.environmentDescription,title:dataset.identity.title,frame:dataset.geometry?.source.frames.model_frame,axisLabels:dataset.axisLabels});
 page=createMainPage({workbenchHref:selectionHref(APP_PAGES.workbench,backend.selection),datasetId:dataset.id,datasetVersion:dataset.identity.dataset_version,features:dataset.features,featureLayerOptions:dataset.featureLayers,recognitionItems:dataset.recognitionItems,state,sceneView,projectionView,capabilities:backend.capabilities,
  backendLabel:selection.backend,environmentDescription:backend.environmentDescription,scenarioId:backend.selection.scenarioId,releases:Object.keys(registry.datasets),candidateIds:dataset.candidates.candidates.map(c=>c.id),createPort:()=>createLocalAssessmentPort(backend.assessment),placeInCavity:backend.placeInCavity,sliceMask:backend.sliceMask,targetSamples:backend.targetSamples,createController:ports=>{
   const controller=createAssessmentController({assessment:backend.assessment,...ports});
   return {...controller,clearCaches:()=>backend.assessment.clearCaches()};
  }});
 page.start();
 createViewportTools();
}
main().catch(error=>{console.error(error);const loading=document.querySelector('#loading');loading.textContent='应用配置或数据集加载失败：'+error.message;loading.classList.add('error');});
