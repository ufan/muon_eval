import { loadDataset } from './modules/dataset-loader.js';
import { resolveApplicationSelection } from './modules/application-selection.js';
import { createApplicationBackend } from './modules/application-backends.js';
import { createAssessmentController } from './modules/assessment-controller.js';
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
 const sceneView=createCompiledSceneView({dataset,runtime:backend.runtime,waterLayers:backend.waterLayers,onResize:()=>page?.constrainProjectionPanel()});
 const projectionView=createProjectionCanvasView({onHover:(data,x,y)=>sceneView.showProjectionPixel(data,x,y),onLeave:()=>sceneView.clearProjection()});
 createApplicationSelectionView({registry,selection:backend.selection,scenarios:backend.scenarios,backendLabel:selection.backend,description:backend.environmentDescription,title:dataset.identity.title,frame:dataset.geometry?.source.frames.model_frame});
 page=createMainPage({datasetId:dataset.id,datasetVersion:dataset.identity.dataset_version,state,sceneView,projectionView,capabilities:backend.capabilities,
  backendLabel:selection.backend,environmentDescription:backend.environmentDescription,exportFileName:backend.exportFileName,exportPlan:backend.exportPlan,createController:ports=>{
   const controller=createAssessmentController({assessment:backend.assessment,...ports});
   return {...controller,clearCaches:()=>backend.assessment.clearCaches(),centralRay:input=>backend.assessment.createSession(input).centralRay()};
  }});
 page.start();
}
main().catch(error=>{console.error(error);const loading=document.querySelector('#loading');loading.textContent='应用配置或数据集加载失败：'+error.message;loading.classList.add('error');});
