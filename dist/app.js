import { loadDataset } from './modules/dataset-loader.js';
import { resolveApplicationSelection, selectionHref, APP_PAGES } from './modules/application-selection.js';
import { createApplicationBackend } from './modules/application-backends.js';
import { createAssessmentController, createLocalAssessmentPort } from './modules/assessment-controller.js';
import { createCompiledSceneView } from './modules/compiled-scene-view.js';
import { createProjectionCanvasView } from './modules/projection-canvas-view.js';
import { createApplicationSelectionView } from './modules/application-selection-view.js';
import { createMainPage } from './modules/main-page.js';
import { createDeploymentState } from './modules/deployment-state.js';

async function main(){
 const response=await fetch('./datasets/registry.json');if(!response.ok)throw new Error('Dataset registry unavailable');
 const registry=await response.json(),selection=resolveApplicationSelection(registry,location.search);
 const dataset=await loadDataset(selection.datasetId),backend=await createApplicationBackend(dataset,selection);
 const state=createDeploymentState({stations:backend.stations,environment:backend.environment});let page;
 const sceneView=createCompiledSceneView({dataset,runtime:backend.runtime,waterLayers:backend.waterLayers,features:dataset.features,onResize:()=>page?.constrainProjectionPanel(),onFeatureHover:id=>page?.hoverFeature(id),onFeaturePick:id=>page?.pickFeature(id),onCoveragePick:(ix,iy)=>page?.pickCoverage(ix,iy),onPlacePick:surface=>page?.placeStation(surface),onPlaceCancel:()=>page?.placeCancelled()});
 const projectionView=createProjectionCanvasView({onHover:(data,x,y,options)=>sceneView.showProjectionPixel(data,x,y,options),onLeave:()=>sceneView.clearProjection()});
 createApplicationSelectionView({registry,selection:backend.selection,scenarios:backend.scenarios,backendLabel:selection.backend,description:backend.environmentDescription,title:dataset.identity.title,frame:dataset.geometry?.source.frames.model_frame});
 page=createMainPage({workbenchHref:selectionHref(APP_PAGES.workbench,backend.selection),datasetId:dataset.id,datasetVersion:dataset.identity.dataset_version,features:dataset.features,recognitionItems:dataset.recognitionItems,state,sceneView,projectionView,capabilities:backend.capabilities,
  backendLabel:selection.backend,environmentDescription:backend.environmentDescription,scenarioId:backend.selection.scenarioId,releases:Object.keys(registry.datasets),candidateIds:dataset.candidates.candidates.map(c=>c.id),createPort:()=>createLocalAssessmentPort(backend.assessment),placeInCavity:backend.placeInCavity,sliceMask:backend.sliceMask,createController:ports=>{
   const controller=createAssessmentController({assessment:backend.assessment,...ports});
   return {...controller,clearCaches:()=>backend.assessment.clearCaches()};
  }});
 page.start();
}
main().catch(error=>{console.error(error);const loading=document.querySelector('#loading');loading.textContent='应用配置或数据集加载失败：'+error.message;loading.classList.add('error');});
