import * as THREE from 'three';
import { nearestScreenPoint } from './screen-pick.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createCompiledGeometryView } from './compiled-geometry-view.js';
import { aimAt, detectorBasis } from './detector-pose.js';
import { dragAimPoint, dragMove } from './station-drag.js';
import { featureLayerGroups, featuresAlongRay } from './feature-layers.js';
import { slicePoint } from './slice-plane.js';
import { displayedRaySegments, rayExitStub, rayMarkers, rayMaterialColor, rayProfile, sideViewPose } from './ray-display.js';
import { createCoverageUniforms, attachCoverage, setCoverageVariant, COVERAGE_SLOT_BINS, MULTI_MAPS } from './coverage-shader.js';
import { countsPerSteradian, coverageBrightness, coverageReadout, coveringStations, multiViewCoverage, perSteradianMap, usableCounts, COVERAGE_LOG_RANGE } from './coverage-map.js';

// View-only model Z-up → scene Y-up transform. Never classify or trace a mesh here.
export const compiledPointToScene = ([x,y,z]) => new THREE.Vector3(x,z,-y);
// Display style of the main app (owner preference: the former legacy scene's look).
// View-only: it replaces the GLB display colours and never touches the shared buffers.
const LOOK = { fovEdge:0xffb8e0, background:0x071018, fogDensity:.00155, dam:0xaaa79c, steel:0x73808b, edge:0x3f5159, rock:0x6e756f,
  upwater:0x176b9d, downwater:0x2584ad };
const lookMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness:.78, metalness:.02, ...options });
function clear(group) {
  group.traverse(object => { object.geometry?.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material?.map?.dispose(); material?.dispose(); } });
  group.clear();
}

export function createCompiledSceneView({ runtime, waterLayers, features=null, featureLayers={}, root=document, onResize=()=>{}, onFeatureHover=()=>{}, onFeaturePick=()=>{}, onCoveragePick=()=>{}, onPlacePick=()=>{}, onPlaceCancel=()=>{}, onStationPick=()=>{}, onAimPick=()=>{}, onStationDrag=()=>{} }) {
  const $=selector=>root.querySelector(selector),container=$('#webgl');
  const geometryView=createCompiledGeometryView(runtime),detectorGroup=new THREE.Group(),axisGroup=new THREE.Group(),projectionGroup=new THREE.Group(),extraGroup=new THREE.Group();
  const scene=new THREE.Scene();scene.background=new THREE.Color(LOOK.background);scene.fog=new THREE.FogExp2(LOOK.background,LOOK.fogDensity);
  scene.add(geometryView.group,detectorGroup,axisGroup,projectionGroup,extraGroup,new THREE.HemisphereLight(0xbfe3ff,0x17221b,2.4));
  const light=new THREE.DirectionalLight(0xfff0d6,3.1);light.position.set(160,260,150);scene.add(light);
  const box=new THREE.Box3(),wholeBox=new THREE.Box3();geometryView.group.updateMatrixWorld(true);
  for(const component of runtime.components) {
    if(!component.metadata.flags.physics)continue;
    const mesh=geometryView.meshes.get(component.componentId);mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);wholeBox.union(bounds);
    if(['concrete','steel'].includes(component.metadata.material_id))box.union(bounds);
  }
  if(box.isEmpty())box.copy(wholeBox);
  // Subject-feature layer (FR-M11): the compiled components of direct features, drawn in their class colours.
  // Groups the display profile hides keep their meshes (linked emphasis can highlight them) but are never picked.
  const layerGroups=features?featureLayerGroups(features,featureLayers):[],featureIds=layerGroups.flatMap(group=>group.featureIds),pickableFeatures=new Set(layerGroups.filter(group=>group.listed).flatMap(group=>group.featureIds)),featureMeshes=new Map(featureIds.map(id=>[id,[]])),featureOfComponent=new Map();
  for(const component of runtime.components){const id=component.metadata.source_entity_id;if(component.metadata.flags.physics&&featureMeshes.has(id)){featureMeshes.get(id).push(geometryView.meshes.get(component.componentId));featureOfComponent.set(component.componentId,id);}}
  const featureVisible=new Map(featureIds.map(id=>[id,false]));let emphasised=new Set(),featuresSeen=null;
  // Coverage highlight (FR-M10, ADR-026): subject surfaces by default, terrain and water on request.
  const coverage=createCoverageUniforms(),subjectCoverage={value:1},contextCoverage={value:0},featureCoverage={value:1},coverageMaterials=[];let coverageResult=null;
  applyLook();
  const subjectMeshes=runtime.components.filter(c=>materialLayer(c)==='dam').map(c=>geometryView.meshes.get(c.componentId)),edgeRay=new THREE.Raycaster();
  // No ground grid (removed, owner 2026-10-15): it sat at the dam's lowest point, mostly buried in the terrain, and the scale bar gives the scale.
  const target=box.getCenter(new THREE.Vector3()),radius=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
  const camera=new THREE.PerspectiveCamera(40,1,.1,Math.max(2000,wholeBox.getSize(new THREE.Vector3()).length()*5));
  let renderer,controls,observer,currentStation=null,currentDevice=null;
  const layerState=new Map();
  function applyLook(){for(const component of runtime.components){const mesh=geometryView.meshes.get(component.componentId),layer=materialLayer(component);let material=null;
    if(featureOfComponent.has(component.componentId)){mesh.material.dispose();mesh.material=attachCoverage(lookMaterial(features.get(featureOfComponent.get(component.componentId)).color,{flatShading:true,side:THREE.DoubleSide}),coverage,featureCoverage);coverageMaterials.push(mesh.material);mesh.visible=false;continue;}
    if(component.metadata.material_id==='concrete')material=lookMaterial(LOOK.dam,{transparent:true,opacity:.78,flatShading:true,side:THREE.DoubleSide});
    else if(component.metadata.material_id==='steel')material=lookMaterial(LOOK.steel,{flatShading:true,side:THREE.DoubleSide});
    else if(layer==='terrain')material=lookMaterial(LOOK.rock,{transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false,flatShading:true});
    else if(layer==='upwater'||layer==='downwater')material=lookMaterial(LOOK[layer],{transparent:true,opacity:.42,roughness:.18,metalness:.08,side:THREE.DoubleSide,depthWrite:false});
    if(!material)continue;attachCoverage(material,coverage,layer==='dam'?subjectCoverage:contextCoverage);coverageMaterials.push(material);mesh.material.dispose();mesh.material=material;
    if(layer==='dam')mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),new THREE.LineBasicMaterial({color:LOOK.edge,transparent:true,opacity:.5})));}}
  function resize(){if(!renderer)return;const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return;camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();renderer.setSize(bounds.width,bounds.height,false);for(const material of lineMaterials)material.resolution.set(bounds.width,bounds.height);}
  // Camera of a preset view (scene frame), without moving the camera.
  function presetCamera(mode){const axes={perspective:[.74,-.61,.27],front:[-1,0,.1],cross:[0,-1,.1],top:[0,0,1]};if(!axes[mode])throw new Error('Unknown scene view');
    const halfVertical=THREE.MathUtils.degToRad(camera.fov/2),halfHorizontal=Math.atan(Math.tan(halfVertical)*camera.aspect),distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*(mode==='perspective'?.7:1.1);
    return{position:target.clone().add(compiledPointToScene(axes[mode]).normalize().multiplyScalar(distance)),target:target.clone()};}
  function setView(mode){if(!controls)return;const view=presetCamera(mode);camera.position.copy(view.position);controls.target.copy(view.target);controls.update();$('#viewSelect').value=mode;}
  function updateScale(){const height=Math.max(1,container.clientHeight),distance=camera.position.distanceTo(controls.target),mpp=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    const power=10**Math.floor(Math.log10(mpp*90)),length=power*([1,2,5,10].find(value=>value>=mpp*90/power)||10);$('#scaleBar').style.width=(length/mpp).toFixed(0)+'px';$('#scaleLabel').textContent=length.toPrecision(2)+' m';
    // Fog is a depth cue at the default view distance; zoomed further out it thins in proportion, so the subject does
    // not fade into the background (a fixed density blacked out the view beyond about 1 km).
    const preset=presetCamera('perspective'),reference=preset.position.distanceTo(preset.target);scene.fog.density=LOOK.fogDensity*Math.min(1,reference/Math.max(distance,1e-6));}
  function materialLayer(component){const material=component.metadata.material_id;
    if(featureOfComponent.has(component.componentId))return null;
    if(material==='concrete'||material==='steel')return'dam';if(material==='rock')return'terrain';
    if(material==='water')for(const [layer,ids] of Object.entries(waterLayers))if(component.sourceEntityIds.some(id=>ids.includes(id)))return layer;
    return null;
  }
  function setLayer(name,visible){layerState.set(name,visible);// The detector body is always drawn; the cone layer is its pointing axis and field of view, the ray layer the projection pixel's ray.
    if(name==='cone'){axisGroup.visible=visible&&workingShown;fovGroup.visible=visible&&fovEdges;solidGroup.visible=visible&&fovSolid;return;}
    if(name==='ray'){projectionGroup.visible=visible;updateLabels();return;}
    for(const component of runtime.components)if(materialLayer(component)===name){const mesh=geometryView.meshes.get(component.componentId);mesh.visible=visible&&component.metadata.flags.display&&component.metadata.realization!=='virtual';}}
  function setDamOpacity(opacity){for(const component of runtime.components)if(materialLayer(component)==='dam'){const material=geometryView.meshes.get(component.componentId).material;material.transparent=opacity<1;material.opacity=opacity;material.depthWrite=opacity>.72;material.needsUpdate=true;}}
  let multiOptions={map:'views',errorLevel:.1,minViews:3,goodSpreadDeg:30,minSpreadDeg:10};
  function setCoverage({mode='off',core=false,context=false,features:onFeatures=true,multi=multiOptions}={}){featureCoverage.value=onFeatures?1:0;multiOptions={...multiOptions,...multi};coverage.covMulti.value=MULTI_MAPS[multiOptions.map]??MULTI_MAPS.views;coverage.covMinCounts.value=usableCounts(multiOptions.errorLevel);coverage.covClassViews.value=multiOptions.minViews;coverage.covGoodSpread.value=multiOptions.goodSpreadDeg;coverage.covMinSpread.value=multiOptions.minSpreadDeg;coverage.covLogRange.value.set(...COVERAGE_LOG_RANGE);coverage.covMode.value={off:0,geometric:1,physical:2}[mode]??0;updateVariant();coverage.covCore.value=core?1:0;contextCoverage.value=context?1:0;for(const id of featureIds)showFeature(id);}
  // Physical brightness from a result's own counts per steradian; null while a newer pose is computing (geometric view shown instead).
  function setCoverageResult(data,device){coverage.covMap.value?.dispose();coverage.covMap.value=null;coverage.covHasMap.value=0;coverageResult=data&&device?{n:data.n,values:data.values}:null;workingCounts=data&&device?{n:data.n,counts:Float32Array.from(data.values,v=>v.count),device:{...device}}:null;buildAtlas();if(!data||!device)return;
    const perSr=countsPerSteradian(data.values,data.n,device),bytes=new Uint8Array(data.n*data.n*4);perSr.forEach((v,i)=>{bytes[4*i]=Math.round(255*coverageBrightness(v));bytes[4*i+3]=255;});
    const texture=new THREE.DataTexture(bytes,data.n,data.n,THREE.RGBAFormat);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;coverage.covMap.value=texture;coverage.covBins.value=data.n;coverage.covHasMap.value=1;}
  // No working station (the candidate list's toggle): its detector, axis, field of view and ray are hidden, and its
  // coverage slot gets an empty field of view, so the shader and readouts see only the other stations.
  let workingShown=true;
  function collapseWorkingCoverage(){coverage.covMax.value.set(1e-6,1e-6);coverage.covSlotMax.value[0].set(1e-6,1e-6);}
  function setWorkingVisible(on){workingShown=Boolean(on);handleGroup.visible=workingShown&&!demo;detectorGroup.visible=workingShown;axisGroup.visible=workingShown&&(layerState.get('cone')??false);
    if(!workingShown){clearRay();emphasiseFeatures([]);collapseWorkingCoverage();}else if(currentStation&&currentDevice)setCoveragePose(currentStation,currentDevice);drawFovEdges();updateLabels();}
  function setCoveragePose(station,device){const basis=detectorBasis(station.az,station.el);coverage.covOrigin.value.copy(compiledPointToScene([station.x,station.y,station.z]));
    coverage.covForward.value.copy(compiledPointToScene(basis.forward));coverage.covRight.value.copy(compiledPointToScene(basis.right));coverage.covUp.value.copy(compiledPointToScene(basis.up));
    coverage.covMax.value.set(device.maxSlopeX,device.maxSlopeY);coverage.covStep.value=device.nativeSlopeStep;coverage.covStrips.value=device.stripsX;setSlot(0,{origin:coverage.covOrigin.value,forward:coverage.covForward.value,right:coverage.covRight.value,up:coverage.covUp.value,device,color:coverage.covColor.value});if(!workingShown)collapseWorkingCoverage();}
  function setSlot(i,{origin,forward,right,up,device,color}){coverage.covSlotOrigin.value[i].copy(origin);coverage.covSlotForward.value[i].copy(forward);coverage.covSlotRight.value[i].copy(right);coverage.covSlotUp.value[i].copy(up);
    coverage.covSlotMax.value[i].set(device.maxSlopeX,device.maxSlopeY);coverage.covSlotStep.value[i]=device.nativeSlopeStep;coverage.covSlotStrips.value[i]=device.stripsX;coverage.covSlotColor.value[i].copy(color);}
  // Field-of-view edges (option 视场棱线): the four corner lines of a station's acceptance as lines of constant screen
  // width (WebGL ignores line widths), solid where visible and dashed where hidden. Each ends where it last leaves the
  // subject within reach, so it spans the probed stretch even from a station inside the subject, or at a fixed length when
  // it misses the subject.
  const fovGroup=new THREE.Group(),solidGroup=new THREE.Group(),lineMaterials=new Set();scene.add(fovGroup,solidGroup);let fovEdges=false,fovSolid=true;
  function fatLines(points,{color,width,opacity,dashed=false,depthTest=!dashed}){const geometry=new LineSegmentsGeometry().setPositions(points),material=new LineMaterial({color,linewidth:width,transparent:true,opacity,dashed,
      dashSize:radius*.025,gapSize:radius*.018,depthTest,depthWrite:false});if(container.clientWidth)material.resolution.set(container.clientWidth,container.clientHeight);lineMaterials.add(material);
    const line=new LineSegments2(geometry,material);if(dashed){line.computeLineDistances();line.renderOrder=5;}return line;}
  function fovEdgePoints(station,device,{back=false}={}){const origin=compiledPointToScene([station.x,station.y,station.z]),basis=detectorBasis(station.az,station.el),forward=compiledPointToScene(basis.forward).normalize(),right=compiledPointToScene(basis.right),up=compiledPointToScene(basis.up);
    const length=radius*.45,reach=radius*2.2,subject=subjectMeshes.filter(mesh=>mesh.visible),points=[];
    for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const direction=forward.clone().addScaledVector(right,x*device.maxSlopeX).addScaledVector(up,y*device.maxSlopeY).normalize();if(back)direction.negate();
      edgeRay.set(origin,direction);edgeRay.far=reach;const hits=edgeRay.intersectObjects(subject,false),end=origin.clone().addScaledVector(direction,hits.length?hits.at(-1).distance:length);points.push(origin.x,origin.y,origin.z,end.x,end.y,end.z);}
    return points;}
  function addFovEdges(station,device,color,{width=2.5,back=true}={}){const front=fovEdgePoints(station,device);
    fovGroup.add(fatLines(front,{color,width,opacity:.95}),fatLines(front,{color,width:width*.8,opacity:.55,dashed:true}));
    if(back){const behind=fovEdgePoints(station,device,{back:true});fovGroup.add(fatLines(behind,{color,width:width*.7,opacity:.4}),fatLines(behind,{color,width:width*.6,opacity:.25,dashed:true}));}}
  // Solid field of view (option 实心视锥): the acceptance pyramid as a translucent frustum in the station's colour, with
  // its side edges and far rectangle outlined, cut by one plane across the axis. Its axial length reaches 20 m beyond
  // the furthest point where the field of view (corners, edge midpoints, axis) leaves the subject, and at least 72 m (the former legacy cone), so it
  // always stands clearly out of the structure. Drawn through the structure (no depth test); a view only.
  const SOLID_MIN_M=72,SOLID_BEYOND_M=20;
  function addFovSolid(station,device,color){const points=fovEdgePoints(station,device),origin=new THREE.Vector3(points[0],points[1],points[2]),forward=compiledPointToScene(detectorBasis(station.az,station.el).forward).normalize();
    const dirs=[0,1,2,3].map(i=>new THREE.Vector3(points[6*i+3],points[6*i+4],points[6*i+5]).sub(origin).normalize()),exits=[0,1,2,3].map(i=>new THREE.Vector3(points[6*i+3],points[6*i+4],points[6*i+5]).sub(origin).dot(forward));
    // Also the axis and the edge midpoints: the corners may leave the subject long before the middle of the field does.
    const basis=detectorBasis(station.az,station.el),right=compiledPointToScene(basis.right),up=compiledPointToScene(basis.up),subject=subjectMeshes.filter(mesh=>mesh.visible);
    for(const [x,y] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){const d=forward.clone().addScaledVector(right,x*device.maxSlopeX).addScaledVector(up,y*device.maxSlopeY).normalize();edgeRay.set(origin,d);edgeRay.far=radius*2.2;
      const hits=edgeRay.intersectObjects(subject,false);if(hits.length)exits.push(hits.at(-1).distance*d.dot(forward));}
    const axial=Math.max(SOLID_MIN_M,Math.max(...exits)+SOLID_BEYOND_M),far=dirs.map(d=>origin.clone().addScaledVector(d,axial/d.dot(forward))),vertices=[],outline=[];
    for(let i=0;i<4;i++){const a=far[i],b=far[(i+1)%4];vertices.push(origin.x,origin.y,origin.z,a.x,a.y,a.z,b.x,b.y,b.z);outline.push(origin.x,origin.y,origin.z,a.x,a.y,a.z,a.x,a.y,a.z,b.x,b.y,b.z);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.18,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));mesh.renderOrder=4;
    solidGroup.add(mesh,fatLines(outline,{color,width:1.5,opacity:.6,depthTest:false}));}
  function drawFovEdges(){for(const child of [...fovGroup.children,...solidGroup.children]){lineMaterials.delete(child.material);}clear(fovGroup);clear(solidGroup);const shown=layerState.get('cone')??false;fovGroup.visible=fovEdges&&shown;solidGroup.visible=fovSolid&&shown;
    const working=currentStation&&currentDevice&&workingShown;
    if(fovSolid){if(working)addFovSolid(currentStation,currentDevice,0xff65bd);for(const s of extraStations)addFovSolid(s,s.device,s.color);}
    if(working)addFovEdges(currentStation,currentDevice,LOOK.fovEdge);for(const s of extraStations)addFovEdges(s,s.device,s.color,{width:2,back:false});}
  function setFovEdges(on){fovEdges=Boolean(on);fovGroup.visible=fovEdges&&(layerState.get('cone')??false);}
  function setFovSolid(on){fovSolid=Boolean(on);drawFovEdges();}
  // Physical maps of all shown stations (15d) in one float texture: slot 0 the working station, slots 1–8 the others;
  // R = counts, G = counts per steradian, bottom row first. A slot without a result yet has 0 bins (pending).
  let workingCounts=null;
  function buildAtlas(){const slots=coverage.covSlotBins.value.length,width=slots*COVERAGE_SLOT_BINS,data=new Float32Array(width*COVERAGE_SLOT_BINS*2);
    const put=(slot,source)=>{coverage.covSlotBins.value[slot]=source?.counts?source.n:0;if(!source?.counts)return;const perSr=perSteradianMap(source.counts,source.n,source.device);
      for(let iy=0;iy<source.n;iy++)for(let ix=0;ix<source.n;ix++){const at=2*(iy*width+slot*COVERAGE_SLOT_BINS+ix);data[at]=source.counts[iy*source.n+ix];data[at+1]=perSr[iy*source.n+ix];}};
    put(0,workingCounts);for(let i=0;i<slots-1;i++)put(i+1,extraStations[i]??null);
    coverage.covAtlas.value?.dispose();const texture=new THREE.DataTexture(data,width,COVERAGE_SLOT_BINS,THREE.RGFormat,THREE.FloatType);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;coverage.covAtlas.value=texture;}
  // Slice plane through the interior (15e, FR-M16): across one model axis, inside the subject's extent, tinted by the
  // same coverage shader on both faces, and shown only where the calculation classifies matter (mask from the page).
  const sliceTwoSided={value:1},sliceLayer={value:1},sliceMaterial=attachCoverage(new THREE.MeshBasicMaterial({color:0x2a3b45,side:THREE.DoubleSide,transparent:true,opacity:.92,alphaTest:.5,depthWrite:true}),coverage,sliceLayer,sliceTwoSided);
  coverageMaterials.push(sliceMaterial);const sliceMesh=new THREE.Mesh(new THREE.BufferGeometry(),sliceMaterial);sliceMesh.visible=false;sliceMesh.renderOrder=3;scene.add(sliceMesh);let slice=null;
  // The subject's extent in the model frame (5 % margin), for the plane and its slider.
  function subjectExtent(){const min=[box.min.x,-box.max.z,box.min.y],max=[box.max.x,-box.min.z,box.max.y],pad=max.map((v,i)=>(v-min[i])*.05);return{min:min.map((v,i)=>v-pad[i]),max:max.map((v,i)=>v+pad[i])};}
  function setSlice({on=false,axis='z',value=0}={}){slice=on?{axis,value,extent:subjectExtent()}:null;sliceMesh.visible=Boolean(slice);if(!slice)return;
    const corners=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>compiledPointToScene(slicePoint(axis,value,slice.extent,u,v)));
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(c=>[c.x,c.y,c.z]),3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);sliceMesh.geometry.dispose();sliceMesh.geometry=geometry;
    sliceMaterial.alphaMap?.dispose();sliceMaterial.alphaMap=null;sliceMaterial.opacity=.35;sliceMaterial.needsUpdate=true;}
  // mask: resolution² cells, row v from the bottom, 1 = matter; ignored when the plane has moved since it was asked for.
  function setSliceMask({axis,value,resolution,mask}){if(!slice||slice.axis!==axis||slice.value!==value)return;const data=new Uint8Array(resolution*resolution*4);mask.forEach((m,i)=>data.fill(m?255:0,4*i,4*i+4));
    const texture=new THREE.DataTexture(data,resolution,resolution,THREE.RGBAFormat);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
    sliceMaterial.alphaMap?.dispose();sliceMaterial.alphaMap=texture;sliceMaterial.opacity=.92;sliceMaterial.needsUpdate=true;}
  const sliceMatter=hit=>{const map=sliceMaterial.alphaMap;if(!map||!hit.uv)return true;const {width,data}=map.image,ix=Math.min(width-1,Math.floor(hit.uv.x*width)),iy=Math.min(width-1,Math.floor(hit.uv.y*width));return data[4*(iy*width+ix)]>0;};
  // Other stations shown with the working one (14d sketching): their fields of view in the shader, a marker each.
  // Each one has a name label at its marker; a click on the label or the marker opens that station (#15, FR-M4).
  // In demonstration mode (#17) the working station is labelled too (not clickable: it is already open).
  let extraStations=[],demo=false;const labels=document.createElement('div');labels.className='station-labels';container.after(labels);
  const workingLabel=document.createElement('span');workingLabel.className='working-label';workingLabel.hidden=true;labels.append(workingLabel);
  function screenOf(origin,canvas){const v=origin.clone().project(camera);return{x:canvas.left+(v.x+1)/2*canvas.width,y:canvas.top+(1-v.y)/2*canvas.height,visible:v.z<1&&Math.abs(v.x)<=1&&Math.abs(v.y)<=1};}
  function markerScreen(){if(!renderer)return[];const canvas=renderer.domElement.getBoundingClientRect();return extraStations.map(s=>({id:s.id,...screenOf(s.origin,canvas)}));}
  // Every shown station's label at its marker (CSS pixels within the canvas), for screenshots and animation frames.
  function frameLabels(){const box=renderer.domElement.getBoundingClientRect(),at=p=>({x:p.x-box.left,y:p.y-box.top}),screen=markerScreen(),working=workingScreen();
    return[...(working?.visible?[{text:currentStation.name||'工作点位',color:'#ff4fb3',...at(working)}]:[]),...extraStations.map((s,i)=>screen[i].visible?{text:s.name,color:s.color,...at(screen[i])}:null).filter(Boolean)];}
  function workingScreen(){if(!renderer||!currentStation||!workingShown)return null;return screenOf(compiledPointToScene([currentStation.x,currentStation.y,currentStation.z]),renderer.domElement.getBoundingClientRect());}
  function updateLabels(){const box=container.getBoundingClientRect(),screen=markerScreen(),place=(label,p)=>{label.hidden=!p?.visible;if(p?.visible){label.style.left=`${p.x-box.left}px`;label.style.top=`${p.y-box.top}px`;}};
    [...labels.querySelectorAll('[data-station]')].forEach((label,i)=>place(label,screen[i]));workingLabel.textContent=currentStation?.name||'工作点位';place(workingLabel,demo?workingScreen():null);placeRayLabels();placeHandleAnchors();}
  const markerAt=event=>nearestScreenPoint(markerScreen(),[event.clientX,event.clientY],12);
  function setCoverageStations(list=[]){extraStations=list.slice(0,coverage.covExtraOrigin.value.length).map(s=>({...s,origin:compiledPointToScene([s.x,s.y,s.z])}));clear(extraGroup);coverage.covExtraCount.value=extraStations.length;
    labels.replaceChildren(workingLabel,...extraStations.map(s=>{const label=document.createElement('button');label.type='button';label.textContent=s.name;label.dataset.station=s.id;label.title='设为工作点位';label.style.setProperty('--c',s.color);label.hidden=true;label.onclick=()=>onStationPick(s.id);return label;}));
    extraStations.forEach((s,i)=>{const basis=detectorBasis(s.az,s.el),origin=compiledPointToScene([s.x,s.y,s.z]);coverage.covExtraOrigin.value[i].copy(origin);
      coverage.covExtraForward.value[i].copy(compiledPointToScene(basis.forward));coverage.covExtraRight.value[i].copy(compiledPointToScene(basis.right));coverage.covExtraUp.value[i].copy(compiledPointToScene(basis.up));
      coverage.covExtraMax.value[i].set(s.device.maxSlopeX,s.device.maxSlopeY);coverage.covExtraColor.value[i].set(s.color);setSlot(i+1,{origin:coverage.covExtraOrigin.value[i],forward:coverage.covExtraForward.value[i],right:coverage.covExtraRight.value[i],up:coverage.covExtraUp.value[i],device:s.device,color:coverage.covExtraColor.value[i]});
      const marker=new THREE.Mesh(new THREE.OctahedronGeometry(radius*.025),new THREE.MeshBasicMaterial({color:s.color,depthTest:false,transparent:true,opacity:.9}));marker.position.copy(origin);marker.renderOrder=5;extraGroup.add(marker);});buildAtlas();updateVariant();drawFovEdges();updateLabels();requestRender();}
  function updateVariant(){setCoverageVariant(coverageMaterials,coverage.covMode.value===2&&coverage.covExtraCount.value>0);}
  function drawDetector(station,device){currentStation={...station};currentDevice={...device};setCoveragePose(station,device);clear(detectorGroup);clear(axisGroup);clearRay();
    const origin=compiledPointToScene([station.x,station.y,station.z]),basis=detectorBasis(station.az,station.el),forward=compiledPointToScene(basis.forward).normalize(),right=compiledPointToScene(basis.right),up=compiledPointToScene(basis.up);
    const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),forward);
    for(let i=0;i<device.layers;i++){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(device.width,device.height),new THREE.MeshBasicMaterial({color:0xff65bd,side:THREE.DoubleSide}));mesh.position.copy(origin).addScaledVector(forward,(i-(device.layers-1)/2)*device.spacing);mesh.quaternion.copy(orientation);detectorGroup.add(mesh);}
    const length=radius*.45;axisGroup.add(new THREE.ArrowHelper(forward,origin,length,0xff65bd));drawFovEdges();drawHandles();
  }
  // With coverage on, features the station sees (ADR-029 "in view") are drawn at full strength and the others faded.
  function showFeature(id){const visible=featureVisible.get(id)||emphasised.has(id),faded=coverage.covMode.value>0&&featuresSeen!==null&&!featuresSeen.has(id)&&!emphasised.has(id);
    for(const mesh of featureMeshes.get(id)){mesh.visible=visible;mesh.material.emissive.set(emphasised.has(id)?mesh.material.color:0x000000);mesh.material.emissiveIntensity=emphasised.has(id)?1.4:1;
      if(mesh.material.transparent!==faded){mesh.material.transparent=faded;mesh.material.depthWrite=!faded;mesh.material.needsUpdate=true;}mesh.material.opacity=faded?.2:1;}}
  function setFeaturesInView(ids){featuresSeen=ids?new Set(ids):null;for(const id of featureIds)showFeature(id);}
  function setFeatureVisible(id,visible){if(!featureMeshes.has(id))return;featureVisible.set(id,visible);showFeature(id);}
  // Temporary emphasis (linked selection, ADR-029): shown and lit even when the feature's layer is off.
  function emphasiseFeatures(ids=[]){const next=new Set(ids.filter(id=>featureMeshes.has(id))),changed=new Set([...emphasised,...next]);emphasised=next;for(const id of changed)showFeature(id);}
  // Hover and pick per feature; a click is a press and release without orbiting.
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),tip=document.createElement('div');tip.className='feature-tip';tip.hidden=true;container.after(tip);let hovered=null,pressed=null,pending=false;
  function featureAt(event){const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);
    const visible=[...featureMeshes.values()].flat().filter(mesh=>mesh.visible&&pickableFeatures.has(featureOfComponent.get(mesh.name)));return featureOfComponent.get(raycaster.intersectObjects(visible,false)[0]?.object.name)??null;}
  // Coverage at the subject surface under the pointer (FR-M10): what the station sees there (model frame z up; scene y up).
  function coverageAt(){if(!coverage.covMode.value||!currentStation||!currentDevice||!workingShown)return null;
    const targets=[...subjectMeshes.filter(mesh=>mesh.visible),...(sliceMesh.visible?[sliceMesh]:[]),...(featureCoverage.value?[...featureMeshes.values()].flat().filter(mesh=>mesh.visible):[])];
    const hit=raycaster.intersectObjects(targets,false).find(h=>h.object!==sliceMesh||sliceMatter(h));
    if(!hit)return null;const point=[hit.point.x,-hit.point.z,hit.point.y],readout=coverageReadout(point,currentStation,currentDevice,coverageResult);
    if(extraStations.length&&coverage.covMode.value===2){readout.multi=multiViewCoverage(point,[{...currentStation,id:'working',device:currentDevice,n:workingCounts?.n,counts:workingCounts?.counts??null},...extraStations],multiOptions);
      readout.names=new Map([['working',`${currentStation.name??'当前点位'}（编辑中）`],...extraStations.map(s=>[s.id,s.name])]);return readout;}
    if(extraStations.length)readout.covering=coveringStations(point,[{...currentStation,id:'working',name:currentStation.name??'当前点位',device:currentDevice},...extraStations]).map(id=>id==='working'?`${currentStation.name??'当前点位'}（编辑中）`:extraStations.find(s=>s.id===id).name);
    return readout;}
  const CLASS_TEXT={none:'无点位覆盖',insufficient:'不足',limited:'有限',good:'良好'};
  function coverageText(r){if(r.multi){const m=r.multi,names=ids=>ids.map(id=>r.names.get(id)).join('、');if(m.class==='none')return'无点位覆盖';
      return`可用视角 ${m.usable.length}/${m.seen.length}${m.usable.length?`（${names(m.usable)}）`:''} · 张角 ${m.spreadDeg.toFixed(0)}° · ${m.weakestError===null?'无可用视角':`最弱视角误差 ${(100*m.weakestError).toFixed(1)}%`} · 等级 ${CLASS_TEXT[m.class]}${m.pending.length?` · ${m.pending.length} 个点位结果计算中`:''}${m.dominant?` · 主导 ${r.names.get(m.dominant.id)}`:''}`;}
    if(r.covering)return r.covering.length?`${r.covering.length} 个点位覆盖：${r.covering.join('、')}${r.ix===null?'':' · 点击查看当前点位投影像素'}`:'无点位覆盖';if(r.status==='outside')return'视场外';if(r.status==='no-flux')return`前方地平线以下 · 无缪子通量 · sx ${r.sx.toFixed(2)} · sy ${r.sy.toFixed(2)}`;
    return`${currentStation.name??'当前站点'}覆盖 · ${r.side==='back'?'后方来向':'前方来向'} · sx ${r.sx.toFixed(2)} · sy ${r.sy.toFixed(2)}${r.countsPerSr===null?'':` · ${r.countsPerSr.toExponential(1)} 计数/sr`}${r.ix===null?'':' · 点击查看投影像素'}`;}
  // Placing the working station (14d): one click on a visible surface; Esc cancels.
  let placing=false;
  function setPlacing(on){placing=Boolean(on);if(renderer)renderer.domElement.style.cursor=placing?'crosshair':'';if(!placing)tip.hidden=true;}
  // A cavity feature (category void) seen through transparent surfaces (semi-transparent concrete, terrain, water) wins the click.
  function surfaceAt(event){featureAt(event);const meshes=[...geometryView.meshes.values()].filter(mesh=>mesh.visible),hits=raycaster.intersectObjects(meshes,false).filter(h=>h.face);
    const cavity=hits.findIndex(h=>features?.get(featureOfComponent.get(h.object.name))?.category==='void'),hit=cavity>=0&&hits.slice(0,cavity).every(h=>h.object.material.transparent)?hits[cavity]:hits[0];if(!hit)return null;
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld),model=v=>[v.x,-v.z,v.y],featureId=featureOfComponent.get(hit.object.name)??null;
    return{point:model(hit.point),normal:model(normal),direction:model(raycaster.ray.direction),featureId:features?.get(featureId)?.category==='void'?featureId:null};}
  function cancelPlacing(event){if(event.key==='Escape'&&placing){setPlacing(false);onPlaceCancel();requestRender();}if(event.key==='Escape')closeSceneMenu();}
  // Right-click menu (ADR-032): aim the working detector at the surface point under the pointer, or place it there.
  const sceneMenu=document.createElement('div');sceneMenu.className='scene-menu';sceneMenu.setAttribute('role','menu');sceneMenu.hidden=true;container.after(sceneMenu);
  function closeSceneMenu(){sceneMenu.hidden=true;sceneMenu.replaceChildren();}
  function closeSceneMenuOutside(event){if(!sceneMenu.hidden&&!sceneMenu.contains(event.target))closeSceneMenu();}
  window.addEventListener('pointerdown',closeSceneMenuOutside,true);
  // Right button: a drag pans the view (OrbitControls), a click without movement opens the menu. The browser's own
  // contextmenu event is suppressed, since it also fires after a pan (and, on some systems, at the press).
  let rightPress=null;
  function pressRight(event){rightPress=event.button===2&&event.pointerType==='mouse'?[event.clientX,event.clientY]:null;}
  function releaseRight(event){if(event.button!==2||!rightPress)return;const moved=Math.hypot(event.clientX-rightPress[0],event.clientY-rightPress[1]);rightPress=null;if(moved<=4)openSceneMenu(event);}
  function openSceneMenu(event){event.preventDefault?.();if(placing)return;const surface=surfaceAt(event);closeSceneMenu();if(!surface)return;
    const item=(text,title,action)=>Object.assign(document.createElement('button'),{type:'button',textContent:text,title,onclick:()=>{closeSceneMenu();action();}});
    const aim=item('瞄准此处','把当前探测器的方位角和仰角设为指向这一点',()=>onAimPick(surface.point)),place=item('放到此处','把当前探测器放到这一点（点在空腔上时放入空腔）',()=>onPlacePick(surface));
    aim.setAttribute('role','menuitem');place.setAttribute('role','menuitem');sceneMenu.append(aim,place);
    const bounds=container.getBoundingClientRect();sceneMenu.style.left=`${event.clientX-bounds.left}px`;sceneMenu.style.top=`${event.clientY-bounds.top}px`;sceneMenu.hidden=false;aim.focus();}
  // Drag handles (ADR-032 step 7): the white centre moves the working detector (horizontally; Shift: vertically), the pink
  // tip of its axis aims it. Both keep a constant screen size; the view previews while dragging and the station is
  // updated on release (onStationDrag), like a typed value. Hidden in demonstration mode and without a working station.
  const handleGroup=new THREE.Group();scene.add(handleGroup);const coarse=globalThis.matchMedia?.('(pointer: coarse)').matches??false,HANDLE_PX=coarse?{move:14,aim:12}:{move:8,aim:7};let handles=null,dragging=null;
  const aimRadius=()=>radius*.12,modelOf=v=>[v.x,-v.z,v.y];
  function drawHandles(){clear(handleGroup);handles=null;if(!currentStation||!currentDevice)return;
    const origin=compiledPointToScene([currentStation.x,currentStation.y,currentStation.z]),forward=compiledPointToScene(detectorBasis(currentStation.az,currentStation.el).forward).normalize(),tipPoint=origin.clone().addScaledVector(forward,aimRadius());
    const sphere=color=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthTest:false,depthWrite:false,toneMapped:false}));mesh.renderOrder=12;return mesh;};
    const move=sphere(0xffffff),aim=sphere(0xff65bd);move.position.copy(origin);aim.position.copy(tipPoint);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,tipPoint]),new THREE.LineBasicMaterial({color:0xff65bd,transparent:true,opacity:.75,depthTest:false,depthWrite:false,toneMapped:false}));line.renderOrder=11;
    handleGroup.add(line,move,aim);handles={move,aim};scaleHandles();}
  function scaleHandles(){if(!handles)return;const perPixel=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,container.clientHeight);
    for(const kind of ['move','aim'])handles[kind].scale.setScalar(HANDLE_PX[kind]*perPixel*camera.position.distanceTo(handles[kind].position));}
  function pointerRay(event){const bounds=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);return{origin:modelOf(raycaster.ray.origin),dir:modelOf(raycaster.ray.direction)};}
  // When both handles are under the pointer (the axis points at or away from the camera, so the tip overlaps the centre),
  // the one whose centre is nearer the pointer on screen wins.
  function handleAt(event){if(!handles||!handleGroup.visible||placing||!renderer)return null;pointerRay(event);const hits=new Set(raycaster.intersectObjects([handles.move,handles.aim],false).map(hit=>hit.object));
    if(hits.size<2)return hits.has(handles.move)?'move':hits.has(handles.aim)?'aim':null;
    const canvas=renderer.domElement.getBoundingClientRect(),gap=kind=>{const p=screenOf(handles[kind].position,canvas);return Math.hypot(p.x-event.clientX,p.y-event.clientY);};return gap('move')<=gap('aim')?'move':'aim';}
  // Invisible screen anchors of the handles (data-handle), kept in place with the labels; they let tests and scripts find them.
  const handleAnchors=document.createElement('div');handleAnchors.className='handle-anchors';handleAnchors.setAttribute('aria-hidden','true');container.after(handleAnchors);
  const anchorOf=Object.fromEntries(['move','aim'].map(kind=>{const span=document.createElement('span');span.dataset.handle=kind;handleAnchors.append(span);return[kind,span];}));
  function placeHandleAnchors(){const canvas=renderer?.domElement.getBoundingClientRect(),box=container.getBoundingClientRect();for(const kind of ['move','aim']){const span=anchorOf[kind],p=canvas&&handles&&handleGroup.visible?screenOf(handles[kind].position,canvas):null;span.hidden=!p?.visible;if(p?.visible){span.style.left=`${p.x-box.left}px`;span.style.top=`${p.y-box.top}px`;}}}
  const HANDLE_TIP={move:'拖动移动探测器（按住 Shift 竖直移动）',aim:'拖动调整探测器指向'};
  function showHandleTip(event,text){const bounds=container.getBoundingClientRect();tip.style.left=`${event.clientX-bounds.left+14}px`;tip.style.top=`${event.clientY-bounds.top+14}px`;tip.textContent=text;tip.hidden=false;}
  function startHandleDrag(event){if(event.button!==0)return;const kind=handleAt(event);if(!kind)return;event.stopPropagation();event.preventDefault();controls.enabled=false;dragging={kind,station:{...currentStation},preview:null};renderer.domElement.style.cursor='grabbing';}
  function moveHandleDrag(event){if(!dragging)return;const ray=pointerRay(event),s=dragging.preview??dragging.station,round=v=>Math.round(v*10)/10;
    if(dragging.kind==='move'){const p=dragMove({anchor:[s.x,s.y,s.z],rayOrigin:ray.origin,rayDir:ray.dir,vertical:event.shiftKey});if(!p)return;dragging.preview={...s,x:round(p[0]),y:round(p[1]),z:round(p[2])};
      showHandleTip(event,`X ${dragging.preview.x.toFixed(1)} · Y ${dragging.preview.y.toFixed(1)} · Z ${dragging.preview.z.toFixed(1)} m`);}
    else{const o=[s.x,s.y,s.z],point=dragAimPoint({origin:o,radius:aimRadius(),rayOrigin:ray.origin,rayDir:ray.dir}),pose=point&&aimAt(o,point);if(!pose)return;dragging.preview={...s,az:pose.az,el:pose.el};
      showHandleTip(event,`方位 ${pose.az}° · 仰角 ${pose.el}°${pose.clamped?'（不低于水平）':''}`);}
    drawDetector(dragging.preview,currentDevice);requestRender();}
  function endHandleDrag(){if(!dragging)return;const done=dragging;dragging=null;controls.enabled=true;tip.hidden=true;if(renderer)renderer.domElement.style.cursor='';if(done.preview)onStationDrag(done.preview);requestRender();}
  function hoverFeature(event){if(dragging)return;{const kind=handleAt(event);if(kind){renderer.domElement.style.cursor='grab';showHandleTip(event,HANDLE_TIP[kind]);return;}}if(placing){const bounds=container.getBoundingClientRect();tip.style.left=`${event.clientX-bounds.left+14}px`;tip.style.top=`${event.clientY-bounds.top+14}px`;tip.textContent='点击模型表面放置当前点位 · Esc 取消';tip.hidden=false;return;}
    if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const station=markerAt(event);renderer.domElement.style.cursor=station?'pointer':'';
    if(station){const bounds=container.getBoundingClientRect();tip.style.left=`${event.clientX-bounds.left+14}px`;tip.style.top=`${event.clientY-bounds.top+14}px`;tip.textContent=`${extraStations.find(s=>s.id===station).name} · 点击设为工作点位`;tip.hidden=false;return;}
    const id=featureAt(event);if(id!==hovered){hovered=id;onFeatureHover(id);}
    const bounds=container.getBoundingClientRect();tip.style.left=`${event.clientX-bounds.left+14}px`;tip.style.top=`${event.clientY-bounds.top+14}px`;
    if(id){const feature=features.get(id);tip.textContent=`${feature.label.zh} · ${features.classes[feature.class].label.zh} · ${features.imagingRoles[feature.imagingRole]}`;tip.hidden=false;return;}
    const readout=coverageAt();if(!readout){tip.hidden=true;return;}tip.textContent=coverageText(readout);tip.hidden=false;});}
  function leaveFeature(){tip.hidden=true;if(hovered){hovered=null;onFeatureHover(null);}}
  // Touch: a long press (no movement for 550 ms) opens the same menu as a right-click; the release then is not a click.
  let longPress=null;
  function pressFeature(event){pressed=event.button===0?[event.clientX,event.clientY]:null;clearTimeout(longPress?.timer);longPress=null;
    if(event.pointerType==='touch'){const at={clientX:event.clientX,clientY:event.clientY};longPress={at,timer:setTimeout(()=>{pressed=null;longPress=null;openSceneMenu({...at,preventDefault(){}});},550)};}}
  function cancelLongPress(event){if(longPress&&(event.type!=='pointermove'||Math.hypot(event.clientX-longPress.at.clientX,event.clientY-longPress.at.clientY)>8)){clearTimeout(longPress.timer);longPress=null;}}
  function releaseFeature(event){if(!pressed||Math.hypot(event.clientX-pressed[0],event.clientY-pressed[1])>4){pressed=null;return;}pressed=null;
    if(placing){const surface=surfaceAt(event);if(!surface)return;setPlacing(false);onPlacePick(surface);requestRender();return;}const station=markerAt(event);if(station){onStationPick(station);return;}const id=featureAt(event);if(id){onFeaturePick(id);return;}const readout=coverageAt();if(readout?.ix!==null&&readout?.ix!==undefined)onCoveragePick(readout.ix,readout.iy);}
  // Hovered ray: a lit tube per material interval, depth-tested, so it is solid where nothing hides it; a ghost copy drawn
  // over everything shows the hidden stretches dimmed. Solid versus ghosted tells in front of versus behind or inside a
  // surface. Rings and labels mark the trace's surface crossings. Tube and ring sizes stay constant in screen pixels.
  // Which intervals are drawn, their colors and the crossings come from ray-display.js (shared with the depth profile).
  const RAY_TUBE_PX=2.4,RAY_STUB_PX=1.2,RAY_RING_PX=7,RAY_GHOST_OPACITY=.38,Y_AXIS=new THREE.Vector3(0,1,0),Z_AXIS=new THREE.Vector3(0,0,1);
  let rayParts=[],rayLabels=[];const rayLabelLayer=document.createElement('div');rayLabelLayer.className='ray-labels';container.after(rayLabelLayer);
  function addRayPair(geometry,color,position,quaternion,kind,length=1){
    const solid=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35,roughness:.45,metalness:0}));
    const ghost=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:RAY_GHOST_OPACITY,depthTest:false,depthWrite:false,toneMapped:false}));ghost.renderOrder=10;
    for(const mesh of [solid,ghost]){mesh.position.copy(position);mesh.quaternion.copy(quaternion);projectionGroup.add(mesh);rayParts.push({mesh,kind,length});}}
  function clearRay(){clear(projectionGroup);rayParts=[];rayLabels=[];rayLabelLayer.replaceChildren();}
  function displayRay(trace,station,direction){clearRay();const origin=compiledPointToScene([station.x,station.y,station.z]),dir=compiledPointToScene([direction.x,direction.y,direction.z]).normalize(),at=m=>origin.clone().addScaledVector(dir,m);
    const along=new THREE.Quaternion().setFromUnitVectors(Y_AXIS,dir),across=new THREE.Quaternion().setFromUnitVectors(Z_AXIS,dir);
    for(const segment of displayedRaySegments(trace)){const length=segment.t1-segment.t0;if(!(length>0))continue;addRayPair(new THREE.CylinderGeometry(1,1,1,16),rayMaterialColor(segment.material),at((segment.t0+segment.t1)/2),along,'tube',length);}
    // A thin stub into the open air after the exit shows the ray leaving the last surface.
    const stub=rayExitStub(trace);if(stub)addRayPair(new THREE.CylinderGeometry(1,1,1,12),rayMaterialColor('air'),at((stub.t0+stub.t1)/2),along,'stub',stub.t1-stub.t0);
    for(const marker of rayMarkers(trace)){const point=at(marker.distanceM);addRayPair(new THREE.TorusGeometry(1,.16,10,40),0xffffff,point,across,'ring');
      const label=document.createElement('span');label.textContent=marker.label;label.dataset.kind=marker.kind;label.hidden=true;rayLabelLayer.append(label);rayLabels.push({label,point});}
    updateLabels();}
  function scaleRay(){scaleHandles();if(!rayParts.length)return;const height=Math.max(1,container.clientHeight),perPixel=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    for(const {mesh,kind,length} of rayParts){const pixel=perPixel*camera.position.distanceTo(mesh.position);if(kind==='tube'||kind==='stub'){const r=(kind==='tube'?RAY_TUBE_PX:RAY_STUB_PX)*pixel;mesh.scale.set(r,length,r);}else mesh.scale.setScalar(RAY_RING_PX*pixel);}}
  function placeRayLabels(){const canvas=renderer?.domElement.getBoundingClientRect(),box=container.getBoundingClientRect(),shown=projectionGroup.visible;
    for(const {label,point} of rayLabels){const p=canvas&&shown?screenOf(point,canvas):null;label.hidden=!p?.visible;if(p?.visible){label.style.left=`${p.x-box.left}px`;label.style.top=`${p.y-box.top}px`;}}}
  // Side view of a projection pixel's ray: the camera moves (eased, unless reduced motion is preferred) to look at the
  // ray side-on, framed to the drawn length. Any user camera input cancels the move.
  let cameraMove=null;
  function viewRaySideOn(data,x,y){if(!controls||!currentStation)return;const pixel=data.values[y*data.n+x],lengthM=rayExitStub(pixel.q)?.t1??rayProfile(pixel.q).lengthM;if(!(lengthM>0))return;
    const origin=compiledPointToScene([currentStation.x,currentStation.y,currentStation.z]),dir=compiledPointToScene([pixel.dir.x,pixel.dir.y,pixel.dir.z]).normalize();
    const pose=sideViewPose({origin:origin.toArray(),direction:dir.toArray(),lengthM,eye:camera.position.toArray(),fovDeg:camera.fov,aspect:camera.aspect}),to={position:new THREE.Vector3(...pose.position),target:new THREE.Vector3(...pose.target)};
    if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){cameraMove=null;camera.position.copy(to.position);controls.target.copy(to.target);controls.update();return;}
    cameraMove={from:{position:camera.position.clone(),target:controls.target.clone()},to,start:performance.now(),ms:650};}
  function stepCameraMove(){if(!cameraMove)return false;const t=Math.min(1,(performance.now()-cameraMove.start)/cameraMove.ms),e=t<.5?2*t*t:1-(-2*t+2)**2/2;
    camera.position.lerpVectors(cameraMove.from.position,cameraMove.to.position,e);controls.target.lerpVectors(cameraMove.from.target,cameraMove.to.target,e);if(t>=1)cameraMove=null;return true;}
  // On-demand rendering (FR-N5): a frame is drawn only after a change (camera move and its damping, resize, or any call
  // into this view); an idle scene costs no GPU time.
  let frame=null;
  function requestRender(){if(!renderer||frame!==null)return;frame=requestAnimationFrame(renderFrame);}
  // Axis triad (owner review 2026-10-16): model X, Y and Z in the bottom-right corner, turning with the view, in the axis
  // legend's colours. Drawn into the same canvas after the scene, so screenshots and animations carry it too.
  const gizmoScene=new THREE.Scene(),gizmoCamera=new THREE.OrthographicCamera(-1.7,1.7,1.7,-1.7,.1,10),GIZMO_PX=96;
  for(const [name,model,color] of [['X',[1,0,0],0x49a7ff],['Y',[0,1,0],0xff9f4a],['Z',[0,0,1],0x38d996]]){
    const dir=compiledPointToScene(model).normalize(),arrow=new THREE.ArrowHelper(dir,new THREE.Vector3(),1,color,.3,.17);arrow.line.material.toneMapped=arrow.cone.material.toneMapped=false;gizmoScene.add(arrow);
    const art=document.createElement('canvas');art.width=art.height=64;const g=art.getContext('2d');g.fillStyle='#'+color.toString(16).padStart(6,'0');g.font='bold 46px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(name,32,35);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(art),depthTest:false,toneMapped:false}));sprite.position.copy(dir).multiplyScalar(1.32);sprite.scale.setScalar(.46);gizmoScene.add(sprite);}
  function renderGizmo(){if(!renderer)return;gizmoCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(4);gizmoCamera.up.copy(camera.up);gizmoCamera.lookAt(0,0,0);
    const width=renderer.domElement.clientWidth,height=renderer.domElement.clientHeight,x=width-GIZMO_PX-10,y=demo?52:10;
    renderer.autoClear=false;renderer.setScissorTest(true);renderer.setScissor(x,y,GIZMO_PX,GIZMO_PX);renderer.setViewport(x,y,GIZMO_PX,GIZMO_PX);renderer.clearDepth();renderer.render(gizmoScene,gizmoCamera);
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.autoClear=true;}
  function renderFrame(){frame=null;if(recording)return;const easing=stepCameraMove(),moving=controls.update();updateScale();scaleRay();renderer.render(scene,camera);renderGizmo();updateLabels();if(moving||easing)requestRender();}
  let recording=false;
  const api={
    build(){renderer=new THREE.WebGLRenderer({antialias:true});renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=Math.max(.1,radius*.1);controls.maxDistance=Math.max(radius*10,wholeBox.getSize(new THREE.Vector3()).length()*2);setView('perspective');observer=new ResizeObserver(()=>{resize();onResize();requestRender();});observer.observe(container);resize();controls.addEventListener('change',requestRender);controls.addEventListener('start',()=>{cameraMove=null;});requestRender();{renderer.domElement.addEventListener('pointermove',hoverFeature);renderer.domElement.addEventListener('pointerleave',leaveFeature);renderer.domElement.addEventListener('pointerdown',pressFeature);container.addEventListener('pointerdown',startHandleDrag,{capture:true});renderer.domElement.addEventListener('pointermove',cancelLongPress);renderer.domElement.addEventListener('pointerup',cancelLongPress);renderer.domElement.addEventListener('pointercancel',cancelLongPress);window.addEventListener('pointermove',moveHandleDrag);window.addEventListener('pointerup',endHandleDrag);window.addEventListener('pointercancel',endHandleDrag);renderer.domElement.addEventListener('pointerup',releaseFeature);renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());renderer.domElement.addEventListener('pointerdown',pressRight);renderer.domElement.addEventListener('pointerup',releaseRight);window.addEventListener('keydown',cancelPlacing);}$('#loading').style.display='none';},
    resize,setView,setLayer,setDamOpacity,drawDetector,setSlice,setSliceMask,subjectExtent,setFovEdges,setFovSolid,setFeatureVisible,emphasiseFeatures,setCoverage,setCoverageResult,setFeaturesInView,setCoverageStations,setPlacing,
    // Demonstration mode (#17): labels, camera views as view state (model frame, z up) and a capture of the
    // current frame with every station's label position (CSS pixels within the image).
    setDemo(on){demo=Boolean(on);handleGroup.visible=workingShown&&!demo;updateLabels();requestRender();},
    cameraView(){if(!controls)return null;const model=v=>[v.x,-v.z,v.y];return{position:model(camera.position),target:model(controls.target)};},
    setCameraView({position,target}){if(!controls||![...position,...target].every(Number.isFinite))return;camera.position.copy(compiledPointToScene(position));controls.target.copy(compiledPointToScene(target));controls.update();requestRender();},
    capture(){if(!renderer)return null;controls.update();scaleRay();renderer.render(scene,camera);renderGizmo();const box=renderer.domElement.getBoundingClientRect(),image=document.createElement('canvas');
      image.width=renderer.domElement.width;image.height=renderer.domElement.height;image.getContext('2d').drawImage(renderer.domElement,0,0);
      requestRender();return{image,width:box.width,height:box.height,labels:frameLabels()};},
    // Animation export (FR-M5): preset views in the model frame, and one frame drawn from a given view into a 2D context
    // (CSS pixels of the view) while recording; on-demand rendering pauses meanwhile.
    presetView(mode){const model=v=>[v.x,-v.z,v.y],view=presetCamera(mode);return{position:model(view.position),target:model(view.target)};},
    setRecording(on){recording=Boolean(on);if(!recording)requestRender();},
    drawFrame(view,ctx,width,height){if(!renderer)return null;camera.position.copy(compiledPointToScene(view.position));controls.target.copy(compiledPointToScene(view.target));camera.lookAt(controls.target);updateScale();scaleRay();
      // The render loop is paused while recording, so the on-screen labels follow each recorded frame here.
      renderer.render(scene,camera);renderGizmo();updateLabels();ctx.drawImage(renderer.domElement,0,0,width,height);return frameLabels();},
    setWorkingVisible,
    showProjectionPixel(data,x,y,{threshold=0}={}){if(!currentStation||!currentDevice||!workingShown)return;const pixel=data.values[y*data.n+x];displayRay(pixel.q,currentStation,pixel.dir);emphasiseFeatures(featuresAlongRay(pixel,featureIds,{threshold}));},
    viewRaySideOn,
    clearProjection(){clearRay();emphasiseFeatures([]);},
    setWater(){throw new Error('Compiled geometry uses frozen scenarios; select another published scenario');},
    dispose(){if(frame!==null)cancelAnimationFrame(frame);frame=null;window.removeEventListener('pointermove',moveHandleDrag);window.removeEventListener('pointerup',endHandleDrag);window.removeEventListener('pointercancel',endHandleDrag);clear(handleGroup);window.removeEventListener('keydown',cancelPlacing);clear(extraGroup);clear(fovGroup);clear(solidGroup);sliceMesh.geometry.dispose();sliceMaterial.alphaMap?.dispose();sliceMaterial.dispose();tip.remove();labels.remove();rayLabelLayer.remove();sceneMenu.remove();window.removeEventListener('pointerdown',closeSceneMenuOutside,true);observer?.disconnect();controls?.dispose();clear(detectorGroup);clear(axisGroup);clearRay();geometryView.group.traverse(object=>{if(object.isLineSegments){object.geometry.dispose();object.material.dispose();}});geometryView.dispose();renderer?.dispose();renderer?.domElement.remove();},
  };
  // Every public call may change what is shown: request a frame after it.
  for(const [name,fn] of Object.entries(api))if(name!=='dispose')api[name]=(...args)=>{const value=fn(...args);requestRender();return value;};
  return Object.freeze(api);
}
