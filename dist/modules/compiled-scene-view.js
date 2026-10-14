import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createCompiledGeometryView } from './compiled-geometry-view.js';
import { detectorBasis } from './detector-pose.js';
import { featureLayerGroups, featuresAlongRay } from './feature-layers.js';
import { createCoverageUniforms, attachCoverage, setCoverageVariant, COVERAGE_SLOT_BINS, MULTI_MAPS } from './coverage-shader.js';
import { countsPerSteradian, coverageBrightness, coverageReadout, coveringStations, multiViewCoverage, perSteradianMap, usableCounts, COVERAGE_LOG_RANGE } from './coverage-map.js';

// View-only model Z-up → scene Y-up transform. Never classify or trace a mesh here.
export const compiledPointToScene = ([x,y,z]) => new THREE.Vector3(x,z,-y);
const materialColors = { concrete:0xc0bcb0, rock:0x809488, water:0x49a7ff, steel:0xffad58, air:0x63ffe8 };
// Display style of the main app (owner preference: the former legacy scene's look).
// View-only: it replaces the GLB display colours and never touches the shared buffers.
const LOOK = { fovEdge:0xffb8e0, background:0x071018, fogDensity:.00155, dam:0xaaa79c, steel:0x73808b, edge:0x3f5159, rock:0x6e756f,
  upwater:0x176b9d, downwater:0x2584ad, gridMajor:0x35505d, gridMinor:0x1d3038 };
const lookMaterial = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness:.78, metalness:.02, ...options });
function clear(group) {
  group.traverse(object => { object.geometry?.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material?.map?.dispose(); material?.dispose(); } });
  group.clear();
}

export function createCompiledSceneView({ runtime, waterLayers, features=null, root=document, onResize=()=>{}, onFeatureHover=()=>{}, onFeaturePick=()=>{}, onCoveragePick=()=>{}, onPlacePick=()=>{}, onPlaceCancel=()=>{} }) {
  const $=selector=>root.querySelector(selector),container=$('#webgl');
  const geometryView=createCompiledGeometryView(runtime),detectorGroup=new THREE.Group(),rayGroup=new THREE.Group(),projectionGroup=new THREE.Group(),extraGroup=new THREE.Group();
  const scene=new THREE.Scene();scene.background=new THREE.Color(LOOK.background);scene.fog=new THREE.FogExp2(LOOK.background,LOOK.fogDensity);
  scene.add(geometryView.group,detectorGroup,rayGroup,projectionGroup,extraGroup,new THREE.HemisphereLight(0xbfe3ff,0x17221b,2.4));
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
  const featureIds=features?featureLayerGroups(features).flatMap(group=>group.featureIds):[],featureMeshes=new Map(featureIds.map(id=>[id,[]])),featureOfComponent=new Map();
  for(const component of runtime.components){const id=component.metadata.source_entity_id;if(component.metadata.flags.physics&&featureMeshes.has(id)){featureMeshes.get(id).push(geometryView.meshes.get(component.componentId));featureOfComponent.set(component.componentId,id);}}
  const featureVisible=new Map(featureIds.map(id=>[id,false]));let emphasised=new Set(),featuresSeen=null;
  // Coverage highlight (FR-M10, ADR-026): subject surfaces by default, terrain and water on request.
  const coverage=createCoverageUniforms(),subjectCoverage={value:1},contextCoverage={value:0},coverageMaterials=[];let coverageResult=null;
  applyLook();
  const subjectMeshes=runtime.components.filter(c=>materialLayer(c)==='dam').map(c=>geometryView.meshes.get(c.componentId)),edgeRay=new THREE.Raycaster();
  // Ground grid at the base of the structure, sized from its footprint (former legacy view: 520 m, 20 m cells).
  const footprint=box.getSize(new THREE.Vector3()),gridSize=Math.max(100,Math.ceil(2.25*Math.max(footprint.x,footprint.z)/20)*20);
  const ground=new THREE.GridHelper(gridSize,gridSize/20,LOOK.gridMajor,LOOK.gridMinor);ground.position.set(box.getCenter(new THREE.Vector3()).x,box.min.y+.05,box.getCenter(new THREE.Vector3()).z);scene.add(ground);
  const target=box.getCenter(new THREE.Vector3()),radius=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
  const camera=new THREE.PerspectiveCamera(40,1,.1,Math.max(2000,wholeBox.getSize(new THREE.Vector3()).length()*5));
  let renderer,controls,observer,currentStation=null,currentDevice=null;
  const layerState=new Map();
  function applyLook(){for(const component of runtime.components){const mesh=geometryView.meshes.get(component.componentId),layer=materialLayer(component);let material=null;
    if(featureOfComponent.has(component.componentId)){mesh.material.dispose();mesh.material=lookMaterial(features.get(featureOfComponent.get(component.componentId)).color,{flatShading:true,side:THREE.DoubleSide});mesh.visible=false;continue;}
    if(component.metadata.material_id==='concrete')material=lookMaterial(LOOK.dam,{transparent:true,opacity:.78,flatShading:true,side:THREE.DoubleSide});
    else if(component.metadata.material_id==='steel')material=lookMaterial(LOOK.steel,{flatShading:true,side:THREE.DoubleSide});
    else if(layer==='terrain')material=lookMaterial(LOOK.rock,{transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false,flatShading:true});
    else if(layer==='upwater'||layer==='downwater')material=lookMaterial(LOOK[layer],{transparent:true,opacity:.42,roughness:.18,metalness:.08,side:THREE.DoubleSide,depthWrite:false});
    if(!material)continue;attachCoverage(material,coverage,layer==='dam'?subjectCoverage:contextCoverage);coverageMaterials.push(material);mesh.material.dispose();mesh.material=material;
    if(layer==='dam')mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),new THREE.LineBasicMaterial({color:LOOK.edge,transparent:true,opacity:.5})));}}
  function resize(){if(!renderer)return;const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return;camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();renderer.setSize(bounds.width,bounds.height,false);for(const material of lineMaterials)material.resolution.set(bounds.width,bounds.height);}
  function setView(mode){if(!controls)return;const axes={perspective:[.74,-.61,.27],front:[-1,0,.1],cross:[0,-1,.1],top:[0,0,1]};if(!axes[mode])throw new Error('Unknown scene view');
    const halfVertical=THREE.MathUtils.degToRad(camera.fov/2),halfHorizontal=Math.atan(Math.tan(halfVertical)*camera.aspect),distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*(mode==='perspective'?.7:1.1);
    const offset=compiledPointToScene(axes[mode]).normalize().multiplyScalar(distance);camera.position.copy(target).add(offset);controls.target.copy(target);controls.update();$('#viewSelect').value=mode;}
  function updateScale(){const height=Math.max(1,container.clientHeight),distance=camera.position.distanceTo(controls.target),mpp=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    const power=10**Math.floor(Math.log10(mpp*90)),length=power*([1,2,5,10].find(value=>value>=mpp*90/power)||10);$('#scaleBar').style.width=(length/mpp).toFixed(0)+'px';$('#scaleLabel').textContent=length.toPrecision(2)+' m';}
  function materialLayer(component){const material=component.metadata.material_id;
    if(featureOfComponent.has(component.componentId))return null;
    if(material==='concrete'||material==='steel')return'dam';if(material==='rock')return'terrain';
    if(material==='water')for(const [layer,ids] of Object.entries(waterLayers))if(component.sourceEntityIds.some(id=>ids.includes(id)))return layer;
    return null;
  }
  function setLayer(name,visible){layerState.set(name,visible);if(name==='cone'){detectorGroup.visible=rayGroup.visible=projectionGroup.visible=visible;fovGroup.visible=visible&&fovEdges;solidGroup.visible=visible&&fovSolid;return;}
    for(const component of runtime.components)if(materialLayer(component)===name){const mesh=geometryView.meshes.get(component.componentId);mesh.visible=visible&&component.metadata.flags.display&&component.metadata.realization!=='virtual';}}
  function setDamOpacity(opacity){for(const component of runtime.components)if(materialLayer(component)==='dam'){const material=geometryView.meshes.get(component.componentId).material;material.transparent=opacity<1;material.opacity=opacity;material.depthWrite=opacity>.72;material.needsUpdate=true;}}
  let multiOptions={map:'views',errorLevel:.1,minViews:3,goodSpreadDeg:30,minSpreadDeg:10};
  function setCoverage({mode='off',core=false,context=false,multi=multiOptions}={}){multiOptions={...multiOptions,...multi};coverage.covMulti.value=MULTI_MAPS[multiOptions.map]??MULTI_MAPS.views;coverage.covMinCounts.value=usableCounts(multiOptions.errorLevel);coverage.covClassViews.value=multiOptions.minViews;coverage.covGoodSpread.value=multiOptions.goodSpreadDeg;coverage.covMinSpread.value=multiOptions.minSpreadDeg;coverage.covLogRange.value.set(...COVERAGE_LOG_RANGE);coverage.covMode.value={off:0,geometric:1,physical:2}[mode]??0;updateVariant();coverage.covCore.value=core?1:0;contextCoverage.value=context?1:0;for(const id of featureIds)showFeature(id);}
  // Physical brightness from a result's own counts per steradian; null while a newer pose is computing (geometric view shown instead).
  function setCoverageResult(data,device){coverage.covMap.value?.dispose();coverage.covMap.value=null;coverage.covHasMap.value=0;coverageResult=data&&device?{n:data.n,values:data.values}:null;workingCounts=data&&device?{n:data.n,counts:Float32Array.from(data.values,v=>v.count),device:{...device}}:null;buildAtlas();if(!data||!device)return;
    const perSr=countsPerSteradian(data.values,data.n,device),bytes=new Uint8Array(data.n*data.n*4);perSr.forEach((v,i)=>{bytes[4*i]=Math.round(255*coverageBrightness(v));bytes[4*i+3]=255;});
    const texture=new THREE.DataTexture(bytes,data.n,data.n,THREE.RGBAFormat);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;coverage.covMap.value=texture;coverage.covBins.value=data.n;coverage.covHasMap.value=1;}
  function setCoveragePose(station,device){const basis=detectorBasis(station.az,station.el);coverage.covOrigin.value.copy(compiledPointToScene([station.x,station.y,station.z]));
    coverage.covForward.value.copy(compiledPointToScene(basis.forward));coverage.covRight.value.copy(compiledPointToScene(basis.right));coverage.covUp.value.copy(compiledPointToScene(basis.up));
    coverage.covMax.value.set(device.maxSlopeX,device.maxSlopeY);coverage.covStep.value=device.nativeSlopeStep;coverage.covStrips.value=device.stripsX;setSlot(0,{origin:coverage.covOrigin.value,forward:coverage.covForward.value,right:coverage.covRight.value,up:coverage.covUp.value,device,color:coverage.covColor.value});}
  function setSlot(i,{origin,forward,right,up,device,color}){coverage.covSlotOrigin.value[i].copy(origin);coverage.covSlotForward.value[i].copy(forward);coverage.covSlotRight.value[i].copy(right);coverage.covSlotUp.value[i].copy(up);
    coverage.covSlotMax.value[i].set(device.maxSlopeX,device.maxSlopeY);coverage.covSlotStep.value[i]=device.nativeSlopeStep;coverage.covSlotStrips.value[i]=device.stripsX;coverage.covSlotColor.value[i].copy(color);}
  // Field-of-view edges (option 视场棱线): the four corner lines of a station's acceptance as lines of constant screen
  // width (WebGL ignores line widths), solid where visible and dashed where hidden. Each ends where it last leaves the
  // subject within reach, so it spans the probed stretch even from a station inside the subject, or at a fixed length when
  // it misses the subject.
  const fovGroup=new THREE.Group(),solidGroup=new THREE.Group(),lineMaterials=new Set();scene.add(fovGroup,solidGroup);let fovEdges=true,fovSolid=false;
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
  function drawFovEdges(){for(const child of [...fovGroup.children,...solidGroup.children]){lineMaterials.delete(child.material);}clear(fovGroup);clear(solidGroup);const shown=layerState.get('cone')??true;fovGroup.visible=fovEdges&&shown;solidGroup.visible=fovSolid&&shown;
    if(currentStation&&currentDevice&&fovSolid){addFovSolid(currentStation,currentDevice,0xff65bd);for(const s of extraStations)addFovSolid(s,s.device,s.color);}
    if(!currentStation||!currentDevice)return;addFovEdges(currentStation,currentDevice,LOOK.fovEdge);for(const s of extraStations)addFovEdges(s,s.device,s.color,{width:2,back:false});}
  function setFovEdges(on){fovEdges=Boolean(on);fovGroup.visible=fovEdges&&(layerState.get('cone')??true);}
  function setFovSolid(on){fovSolid=Boolean(on);drawFovEdges();}
  // Physical maps of all shown stations (15d) in one float texture: slot 0 the working station, slots 1–8 the others;
  // R = counts, G = counts per steradian, bottom row first. A slot without a result yet has 0 bins (pending).
  let workingCounts=null;
  function buildAtlas(){const slots=coverage.covSlotBins.value.length,width=slots*COVERAGE_SLOT_BINS,data=new Float32Array(width*COVERAGE_SLOT_BINS*2);
    const put=(slot,source)=>{coverage.covSlotBins.value[slot]=source?.counts?source.n:0;if(!source?.counts)return;const perSr=perSteradianMap(source.counts,source.n,source.device);
      for(let iy=0;iy<source.n;iy++)for(let ix=0;ix<source.n;ix++){const at=2*(iy*width+slot*COVERAGE_SLOT_BINS+ix);data[at]=source.counts[iy*source.n+ix];data[at+1]=perSr[iy*source.n+ix];}};
    put(0,workingCounts);for(let i=0;i<slots-1;i++)put(i+1,extraStations[i]??null);
    coverage.covAtlas.value?.dispose();const texture=new THREE.DataTexture(data,width,COVERAGE_SLOT_BINS,THREE.RGFormat,THREE.FloatType);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;coverage.covAtlas.value=texture;}
  // Other stations shown with the working one (14d sketching): their fields of view in the shader, a marker each.
  let extraStations=[];
  function setCoverageStations(list=[]){extraStations=list.slice(0,coverage.covExtraOrigin.value.length).map(s=>({...s}));clear(extraGroup);coverage.covExtraCount.value=extraStations.length;
    extraStations.forEach((s,i)=>{const basis=detectorBasis(s.az,s.el),origin=compiledPointToScene([s.x,s.y,s.z]);coverage.covExtraOrigin.value[i].copy(origin);
      coverage.covExtraForward.value[i].copy(compiledPointToScene(basis.forward));coverage.covExtraRight.value[i].copy(compiledPointToScene(basis.right));coverage.covExtraUp.value[i].copy(compiledPointToScene(basis.up));
      coverage.covExtraMax.value[i].set(s.device.maxSlopeX,s.device.maxSlopeY);coverage.covExtraColor.value[i].set(s.color);setSlot(i+1,{origin:coverage.covExtraOrigin.value[i],forward:coverage.covExtraForward.value[i],right:coverage.covExtraRight.value[i],up:coverage.covExtraUp.value[i],device:s.device,color:coverage.covExtraColor.value[i]});
      const marker=new THREE.Mesh(new THREE.OctahedronGeometry(radius*.025),new THREE.MeshBasicMaterial({color:s.color,depthTest:false,transparent:true,opacity:.9}));marker.position.copy(origin);marker.renderOrder=5;extraGroup.add(marker);});buildAtlas();updateVariant();drawFovEdges();}
  function updateVariant(){setCoverageVariant(coverageMaterials,coverage.covMode.value===2&&coverage.covExtraCount.value>0);}
  function drawDetector(station,device){currentStation={...station};currentDevice={...device};setCoveragePose(station,device);clear(detectorGroup);clear(rayGroup);clear(projectionGroup);
    const origin=compiledPointToScene([station.x,station.y,station.z]),basis=detectorBasis(station.az,station.el),forward=compiledPointToScene(basis.forward).normalize(),right=compiledPointToScene(basis.right),up=compiledPointToScene(basis.up);
    const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),forward);
    for(let i=0;i<device.layers;i++){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(device.width,device.height),new THREE.MeshBasicMaterial({color:0xff65bd,side:THREE.DoubleSide}));mesh.position.copy(origin).addScaledVector(forward,(i-(device.layers-1)/2)*device.spacing);mesh.quaternion.copy(orientation);detectorGroup.add(mesh);}
    const length=radius*.45;detectorGroup.add(new THREE.ArrowHelper(forward,origin,length,0xff65bd));drawFovEdges();
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
    const visible=[...featureMeshes.values()].flat().filter(mesh=>mesh.visible);return featureOfComponent.get(raycaster.intersectObjects(visible,false)[0]?.object.name)??null;}
  // Coverage at the subject surface under the pointer (FR-M10): what the station sees there (model frame z up; scene y up).
  function coverageAt(){if(!coverage.covMode.value||!currentStation||!currentDevice)return null;const hit=raycaster.intersectObjects(subjectMeshes.filter(mesh=>mesh.visible),false)[0];
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
  function cancelPlacing(event){if(event.key==='Escape'&&placing){setPlacing(false);onPlaceCancel();requestRender();}}
  function hoverFeature(event){if(placing){const bounds=container.getBoundingClientRect();tip.style.left=`${event.clientX-bounds.left+14}px`;tip.style.top=`${event.clientY-bounds.top+14}px`;tip.textContent='点击模型表面放置当前点位 · Esc 取消';tip.hidden=false;return;}
    if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const id=featureAt(event);if(id!==hovered){hovered=id;onFeatureHover(id);}
    const bounds=container.getBoundingClientRect();tip.style.left=`${event.clientX-bounds.left+14}px`;tip.style.top=`${event.clientY-bounds.top+14}px`;
    if(id){const feature=features.get(id);tip.textContent=`${feature.label.zh} · ${features.classes[feature.class].label.zh} · ${features.imagingRoles[feature.imagingRole]}`;tip.hidden=false;return;}
    const readout=coverageAt();if(!readout){tip.hidden=true;return;}tip.textContent=coverageText(readout);tip.hidden=false;});}
  function leaveFeature(){tip.hidden=true;if(hovered){hovered=null;onFeatureHover(null);}}
  function pressFeature(event){pressed=[event.clientX,event.clientY];}
  function releaseFeature(event){if(!pressed||Math.hypot(event.clientX-pressed[0],event.clientY-pressed[1])>4){pressed=null;return;}pressed=null;
    if(placing){const surface=surfaceAt(event);if(!surface)return;setPlacing(false);onPlacePick(surface);requestRender();return;}const id=featureAt(event);if(id){onFeaturePick(id);return;}const readout=coverageAt();if(readout?.ix!==null&&readout?.ix!==undefined)onCoveragePick(readout.ix,readout.iy);}
  function displayTrace(group,trace,station,direction){clear(group);const origin=compiledPointToScene([station.x,station.y,station.z]),dir=compiledPointToScene([direction.x,direction.y,direction.z]);
    for(const segment of trace.segments){if(segment.material==='air')continue;const a=origin.clone().addScaledVector(dir,segment.t0),b=origin.clone().addScaledVector(dir,segment.t1);group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:materialColors[segment.material]??0xffffff,depthTest:false})));}
    const arrow=new THREE.ArrowHelper(dir,origin,radius*.2,0x65fff0);arrow.line.material.depthTest=arrow.cone.material.depthTest=false;group.add(arrow);
  }
  // On-demand rendering (FR-N5): a frame is drawn only after a change (camera move and its damping, resize, or any call
  // into this view); an idle scene costs no GPU time.
  let frame=null;
  function requestRender(){if(!renderer||frame!==null)return;frame=requestAnimationFrame(renderFrame);}
  function renderFrame(){frame=null;const moving=controls.update();updateScale();renderer.render(scene,camera);if(moving)requestRender();}
  const api={
    build(){renderer=new THREE.WebGLRenderer({antialias:true});renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=Math.max(.1,radius*.1);controls.maxDistance=Math.max(radius*10,wholeBox.getSize(new THREE.Vector3()).length()*2);setView('perspective');observer=new ResizeObserver(()=>{resize();onResize();requestRender();});observer.observe(container);resize();controls.addEventListener('change',requestRender);requestRender();{renderer.domElement.addEventListener('pointermove',hoverFeature);renderer.domElement.addEventListener('pointerleave',leaveFeature);renderer.domElement.addEventListener('pointerdown',pressFeature);renderer.domElement.addEventListener('pointerup',releaseFeature);window.addEventListener('keydown',cancelPlacing);}$('#loading').style.display='none';},
    resize,setView,setLayer,setDamOpacity,drawDetector,setFovEdges,setFovSolid,setFeatureVisible,emphasiseFeatures,setCoverage,setCoverageResult,setFeaturesInView,setCoverageStations,setPlacing,
    showRay:(trace,station,direction)=>displayTrace(rayGroup,trace,station,direction),
    showProjectionPixel(data,x,y,{threshold=0}={}){if(!currentStation||!currentDevice)return;const pixel=data.values[y*data.n+x];displayTrace(projectionGroup,pixel.q,currentStation,pixel.dir);emphasiseFeatures(featuresAlongRay(pixel,featureIds,{threshold}));},
    clearProjection(){clear(projectionGroup);emphasiseFeatures([]);},showFlux(){},drawFluxCloud(){},
    setWater(){throw new Error('Compiled geometry uses frozen scenarios; select another published scenario');},
    dispose(){if(frame!==null)cancelAnimationFrame(frame);frame=null;window.removeEventListener('keydown',cancelPlacing);clear(extraGroup);clear(fovGroup);clear(solidGroup);tip.remove();observer?.disconnect();controls?.dispose();clear(detectorGroup);clear(rayGroup);clear(projectionGroup);geometryView.group.traverse(object=>{if(object.isLineSegments){object.geometry.dispose();object.material.dispose();}});geometryView.dispose();renderer?.dispose();renderer?.domElement.remove();},
  };
  // Every public call may change what is shown: request a frame after it.
  for(const [name,fn] of Object.entries(api))if(name!=='dispose')api[name]=(...args)=>{const value=fn(...args);requestRender();return value;};
  return Object.freeze(api);
}
