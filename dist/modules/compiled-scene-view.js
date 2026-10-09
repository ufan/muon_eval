import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCompiledGeometryView } from './compiled-geometry-view.js';
import { detectorBasis } from './detector-pose.js';

// View-only model Z-up → scene Y-up transform. Never classify or trace a mesh here.
export const compiledPointToScene = ([x,y,z]) => new THREE.Vector3(x,z,-y);
const materialColors = { concrete:0xc0bcb0, rock:0x809488, water:0x49a7ff, steel:0xffad58, air:0x63ffe8 };
function clear(group) {
  group.traverse(object => { object.geometry?.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose(); });
  group.clear();
}

export function createCompiledSceneView({ runtime, waterLayers, root=document, onResize=()=>{} }) {
  const $=selector=>root.querySelector(selector),container=$('#webgl');
  const geometryView=createCompiledGeometryView(runtime),detectorGroup=new THREE.Group(),rayGroup=new THREE.Group(),projectionGroup=new THREE.Group();
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x071018);
  scene.add(geometryView.group,detectorGroup,rayGroup,projectionGroup,new THREE.HemisphereLight(0xe3f4ff,0x34404a,2.5));
  const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(200,400,200);scene.add(light);
  const box=new THREE.Box3(),wholeBox=new THREE.Box3();geometryView.group.updateMatrixWorld(true);
  for(const component of runtime.components) {
    if(!component.metadata.flags.physics)continue;
    const mesh=geometryView.meshes.get(component.componentId);mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);wholeBox.union(bounds);
    if(['concrete','steel'].includes(component.metadata.material_id))box.union(bounds);
  }
  if(box.isEmpty())box.copy(wholeBox);
  const target=box.getCenter(new THREE.Vector3()),radius=Math.max(1,box.getSize(new THREE.Vector3()).length()/2);
  const camera=new THREE.PerspectiveCamera(40,1,.1,Math.max(2000,wholeBox.getSize(new THREE.Vector3()).length()*5));
  let renderer,controls,observer,currentStation=null,currentDevice=null;
  const layerState=new Map();
  function resize(){if(!renderer)return;const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return;camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();renderer.setSize(bounds.width,bounds.height,false);}
  function setView(mode){if(!controls)return;const axes={perspective:[1,1,1],front:[-1,0,.1],cross:[0,-1,.1],top:[0,0,1]};if(!axes[mode])throw new Error('Unknown scene view');
    const halfVertical=THREE.MathUtils.degToRad(camera.fov/2),halfHorizontal=Math.atan(Math.tan(halfVertical)*camera.aspect),distance=radius/Math.sin(Math.min(halfVertical,halfHorizontal))*1.1;
    const offset=compiledPointToScene(axes[mode]).normalize().multiplyScalar(distance);camera.position.copy(target).add(offset);controls.target.copy(target);controls.update();$('#viewSelect').value=mode;}
  function updateScale(){const height=Math.max(1,container.clientHeight),distance=camera.position.distanceTo(controls.target),mpp=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    const power=10**Math.floor(Math.log10(mpp*90)),length=power*([1,2,5,10].find(value=>value>=mpp*90/power)||10);$('#scaleBar').style.width=(length/mpp).toFixed(0)+'px';$('#scaleLabel').textContent=length.toPrecision(2)+' m';}
  function materialLayer(component){const material=component.metadata.material_id;
    if(material==='concrete'||material==='steel')return'dam';if(material==='rock')return'terrain';
    if(material==='water')for(const [layer,ids] of Object.entries(waterLayers))if(component.sourceEntityIds.some(id=>ids.includes(id)))return layer;
    return null;
  }
  function setLayer(name,visible){layerState.set(name,visible);if(name==='cone'){detectorGroup.visible=rayGroup.visible=projectionGroup.visible=visible;return;}
    for(const component of runtime.components)if(materialLayer(component)===name){const mesh=geometryView.meshes.get(component.componentId);mesh.visible=visible&&component.metadata.flags.display&&component.metadata.realization!=='virtual';}}
  function setDamOpacity(opacity){for(const component of runtime.components)if(materialLayer(component)==='dam'){const material=geometryView.meshes.get(component.componentId).material;material.transparent=opacity<1;material.opacity=opacity;material.depthWrite=opacity>.72;material.needsUpdate=true;}}
  function drawDetector(station,device){currentStation={...station};currentDevice={...device};clear(detectorGroup);clear(rayGroup);clear(projectionGroup);
    const origin=compiledPointToScene([station.x,station.y,station.z]),basis=detectorBasis(station.az,station.el),forward=compiledPointToScene(basis.forward).normalize(),right=compiledPointToScene(basis.right),up=compiledPointToScene(basis.up);
    const orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),forward);
    for(let i=0;i<device.layers;i++){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(device.width,device.height),new THREE.MeshBasicMaterial({color:0xff65bd,side:THREE.DoubleSide}));mesh.position.copy(origin).addScaledVector(forward,(i-(device.layers-1)/2)*device.spacing);mesh.quaternion.copy(orientation);detectorGroup.add(mesh);}
    const length=radius*.45,far=origin.clone().addScaledVector(forward,length),corners=[];
    for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]])corners.push(far.clone().addScaledVector(right,x*(device.width/2+length*device.maxSlopeX)).addScaledVector(up,y*(device.height/2+length*device.maxSlopeY)));
    const positions=[];for(let i=0;i<4;i++)for(const point of [origin,corners[i],corners[i],corners[(i+1)%4]])positions.push(point.x,point.y,point.z);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));detectorGroup.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xff65bd,transparent:true,opacity:.7})),new THREE.ArrowHelper(forward,origin,length,0xff65bd));
  }
  function displayTrace(group,trace,station,direction){clear(group);const origin=compiledPointToScene([station.x,station.y,station.z]),dir=compiledPointToScene([direction.x,direction.y,direction.z]);
    for(const segment of trace.segments){if(segment.material==='air')continue;const a=origin.clone().addScaledVector(dir,segment.t0),b=origin.clone().addScaledVector(dir,segment.t1);group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:materialColors[segment.material]??0xffffff,depthTest:false})));}
    const arrow=new THREE.ArrowHelper(dir,origin,radius*.2,0x65fff0);arrow.line.material.depthTest=arrow.cone.material.depthTest=false;group.add(arrow);
  }
  return Object.freeze({
    build(){renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=Math.max(.1,radius*.1);controls.maxDistance=Math.max(radius*10,wholeBox.getSize(new THREE.Vector3()).length()*2);setView('perspective');observer=new ResizeObserver(()=>{resize();onResize();});observer.observe(container);resize();renderer.setAnimationLoop(()=>{controls.update();updateScale();renderer.render(scene,camera);});$('#loading').style.display='none';},
    resize,setView,setLayer,setDamOpacity,drawDetector,
    showRay:(trace,station,direction)=>displayTrace(rayGroup,trace,station,direction),
    showProjectionPixel(data,x,y){if(!currentStation||!currentDevice)return;const pixel=data.values[y*data.n+x];displayTrace(projectionGroup,pixel.q,currentStation,pixel.dir);},
    clearProjection(){clear(projectionGroup);},showFlux(){},drawFluxCloud(){},
    setWater(){throw new Error('Compiled geometry uses frozen scenarios; select another published scenario');},
    dispose(){renderer?.setAnimationLoop(null);observer?.disconnect();controls?.dispose();clear(detectorGroup);clear(rayGroup);clear(projectionGroup);geometryView.dispose();renderer?.dispose();renderer?.domElement.remove();},
  });
}
