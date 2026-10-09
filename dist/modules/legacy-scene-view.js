import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { directionDoc as calculateDirectionDoc } from './detector-pose.js';

// Legacy-only visual adapter: scene dimensions/pose presets are not platform rules.
export function createLegacySceneView({dataset,geometry:legacyGeometry,traceCellM,root=document,onResize=()=>{}}){
 const $=s=>root.querySelector(s),spec=dataset.spec,groups={},container=$('#webgl');
 let scene,camera,renderer,controls,foundation=[],viewportResizeObserver,DEVICE={},currentStation=null,upstream=legacyGeometry.defaultEnvironment.upstream,fluxState=null;
 const TRACE={mainCell:traceCellM},TARGETS={elevator:{color:'#c187ff'},spillway:{color:'#2ecfff'},platform:{color:'#ffad58'},water:{color:'#3aa9ff'},dam:{color:'#f4e8bf'},gallery:{color:'#48e39a'}};
 const C={dam:0xaaa79c,edge:0x3f5159,upper:0x43a9ff,lower:0x35d79a,shaft:0xa67cff,spill:0x31caff,outlet:0xff9944,upwater:0x176b9d,downwater:0x2584ad,detector:0xff45ad,cone:0xff65bd,rock:0x6e756f,grid:0x44f5d2};
 const docDirToScene=d=>new THREE.Vector3(-d.x,d.z,-d.y).normalize();
 const P=([x,y,z])=>new THREE.Vector3(115.5-x,z-198,-y);
 const modelToDoc=c=>legacyGeometry.modelPointToDoc(c);
 const directionDoc=c=>calculateDirectionDoc(c,legacyGeometry);
 const constrainProjectionPanel=onResize;
 function hydraulicCutoutShader(){
 const gl=n=>Number.isInteger(+n)?`${n}.0`:`${n}`;
 const hydraulic=spec.voids.filter(q=>q.semantics?.system==='flood_release'&&isPhysical(q));
 const boxes=hydraulic.filter(q=>q.type==='box').flatMap(q=>q.boxes||[q]);
 const boxExpr=boxes.map(b=>`(p.x>=${gl(b.x[0])}&&p.x<=${gl(b.x[1])}&&p.y>=${gl(b.y[0])}&&p.y<=${gl(b.y[1])}&&p.z>=${gl(b.z[0])}&&p.z<=${gl(b.z[1])})`).join('||')||'false';
 const chuteCode=hydraulic.filter(q=>q.type==='chute').map((chute,index)=>{
  const ranges=chute.x_ranges.map(r=>`(p.x>=${gl(r[0])}&&p.x<=${gl(r[1])})`).join('||');
  const floor=`floorZ${index}`,top=`topZ${index}`;
  const segments=chute.floor_yz.slice(0,-1).map((a,i)=>{const b=chute.floor_yz[i+1];return`if(p.y>=${gl(a[0])}&&p.y<=${gl(b[0])}) ${floor}=mix(${gl(a[1])},${gl(b[1])},(p.y-${gl(a[0])})/${gl(b[0]-a[0])});`}).join('');
  const tops=(chute.void_top||[]).map(s=>`if(p.y>=${gl(s.y[0])}&&p.y<=${gl(s.y[1])}) ${top}=${gl(s.z_top)};`).join('');
  return`float ${floor}=-1e6;float ${top}=-1e6;${segments}${tops}if((${ranges})&&p.y>=${gl(chute.floor_yz[0][0])}&&p.y<=${gl(chute.floor_yz.at(-1)[0])}&&p.z>=${floor}&&p.z<=${top}) inChute=true;`;
 }).join('');
 return`bool isHydraulicVoid(vec3 w){vec3 p=vec3(115.5-w.x,-w.z,w.y+198.0);bool inBox=${boxExpr};bool inChute=false;${chuteCode}return inBox||inChute;}`;
}
function enableHydraulicCutouts(material){material.onBeforeCompile=shader=>{const fn=hydraulicCutoutShader();shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCutWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvCutWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vCutWorld;\n${fn}`).replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(isHydraulicVoid(vCutWorld)) discard;')};material.customProgramCacheKey=()=>`hydraulic-cutouts-${spec.spec_version}`;return material}
const mat=(color,opts={})=>{const material=new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.02,...opts});return color===C.dam?enableHydraulicCutouts(material):material};
function addEdges(mesh,color=C.edge,opacity=.5){const l=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry,25),new THREE.LineBasicMaterial({color,transparent:true,opacity}));mesh.add(l)}
function box(group,name,x0,x1,y0,y1,z0,z1,color,opacity=1){const s=new THREE.Vector3(x1-x0,z1-z0,y1-y0),m=new THREE.Mesh(new THREE.BoxGeometry(s.x,s.y,s.z),mat(color,{transparent:opacity<1,opacity,depthWrite:opacity>.72}));m.name=name;m.position.copy(P([(x0+x1)/2,(y0+y1)/2,(z0+z1)/2]));m.castShadow=m.receiveShadow=true;group.add(m);addEdges(m,color===C.dam?C.edge:color,.42);return m}
function extrudeProfile(group,name,x0,x1,profile,color,opacity=.82){const n=profile.length,v=[],idx=[];for(const x of [x0,x1])for(const [y,z] of profile){const p=P([x,y,z]);v.push(p.x,p.y,p.z)}const tri=THREE.ShapeUtils.triangulateShape(profile.map(([y,z])=>new THREE.Vector2(y,z)),[]);for(const t of tri){idx.push(t[0],t[2],t[1],n+t[0],n+t[1],n+t[2])}for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,mat(color,{transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>.72,flatShading:true}));m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);addEdges(m,color===C.dam?C.edge:color,.42);return m}
function extrudePlan(group,name,plan,z0,z1,color,opacity=.82){const n=plan.length,v=[],idx=[];for(const z of [z0,z1])for(const [x,y] of plan){const p=P([x,y,z]);v.push(p.x,p.y,p.z)}const tri=THREE.ShapeUtils.triangulateShape(plan.map(([x,y])=>new THREE.Vector2(x,y)),[]);for(const t of tri){idx.push(t[0],t[2],t[1],n+t[0],n+t[1],n+t[2])}for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,mat(color,{transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity>.72,flatShading:true}));m.name=name;m.castShadow=m.receiveShadow=true;group.add(m);addEdges(m,C.edge,.42);return m}
function foundationAt(x){if(x<=foundation[0][0])return foundation[0][1];if(x>=foundation.at(-1)[0])return foundation.at(-1)[1];for(let i=0;i<foundation.length-1;i++){const [a,za]=foundation[i],[b,zb]=foundation[i+1];if(x>=a&&x<=b){const t=(x-a)/(b-a);return za+(zb-za)*t}}return 198}
function faceAt(z){return 9.7+.83*(298-z)}

function sectionDamGeometry(x0,x1){const xs=[x0,...foundation.filter(([x])=>x>x0&&x<x1).map(([x])=>x),x1],v=[],idx=[],n=xs.length;for(const x of xs){const b=foundationAt(x);for(const q of [[x,0,b],[x,0,306],[x,9.7,306],[x,9.7,298],[x,faceAt(b),b]]){const p=P(q);v.push(p.x,p.y,p.z)}}const cap=(o,flip)=>{for(const a of [[0,1,2],[0,2,3],[0,3,4]])idx.push(...(flip?[o+a[0],o+a[2],o+a[1]]:[o+a[0],o+a[1],o+a[2]]))};cap(0,true);cap((n-1)*5,false);for(let i=0;i<n-1;i++)for(const [a,b] of [[0,1],[1,2],[2,3],[3,4],[4,0]])idx.push(i*5+a,i*5+b,(i+1)*5+b,i*5+a,(i+1)*5+b,(i+1)*5+a);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();return g}
function pointInPoly(y,z,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [yi,zi]=poly[i],[yj,zj]=poly[j];if(((zi>z)!==(zj>z))&&(y<(yj-yi)*(z-zi)/(zj-zi)+yi))inside=!inside}return inside}
function inRange(v,r){return v>=r[0]-1e-6&&v<=r[1]+1e-6}
function rangesOf(o){return o.x_ranges||[o.x_range]}
function isPhysical(o){return o.realization!=='virtual'}
function solidContains(x,y,z){if(z<foundationAt(x)-1e-6)return false;for(const s of spec.solids){if(!isPhysical(s))continue;if(s.type==='extrusion_x'&&rangesOf(s).some(r=>inRange(x,r))&&pointInPoly(y,z,s.profile_yz))return true;if(s.type==='extrusion_z'&&inRange(z,s.z)&&pointInPoly(x,y,s.plan_xy))return true;if(s.type==='box')for(const b of s.boxes||[])if(inRange(x,b.x)&&inRange(y,b.y)&&inRange(z,b.z))return true}return false}
function interpPath(path,x){for(let i=0;i<path.length-1;i++){const [a,za]=path[i],[b,zb]=path[i+1];if(inRange(x,[Math.min(a,b),Math.max(a,b)])&&Math.abs(b-a)>1e-8)return za+(zb-za)*(x-a)/(b-a)}return null}
function interpFloor(path,y){for(let i=0;i<path.length-1;i++){const [a,za]=path[i],[b,zb]=path[i+1];if(inRange(y,[a,b]))return za+(zb-za)*(y-a)/(b-a)}return null}
function voidTopAt(q,y){const segment=q.void_top?.find(s=>inRange(y,s.y));return segment?.z_top??306}
function chuteWallTopAt(q,y,floor){
 const voidTop=voidTopAt(q,y),deckEnd=spec.parameters?.spillway_deck_y?.value?.[1],wallHeight=spec.parameters?.chute_wall_height?.value;
 return Number.isFinite(deckEnd)&&Number.isFinite(wallHeight)&&y>=deckEnd-1e-6?Math.min(voidTop,floor+wallHeight):voidTop;
}

function tailLevel(){return legacyGeometry.defaultEnvironment.downstream}
function tailDisplayLevel(){return spec?.parameters?.platform_bottom_elev?.value??tailLevel()}
function terrainAtDoc(x,y){return legacyGeometry.terrainAtDoc(x,y)}








function addSolids(){for(const section of spec.sections){const [x0,x1]=section.x_range,m=new THREE.Mesh(sectionDamGeometry(x0,x1),mat(C.dam,{transparent:true,opacity:.78,depthWrite:true,flatShading:true}));m.name=`坝段_${section.no}`;m.castShadow=m.receiveShadow=true;groups.dam.add(m);addEdges(m,C.edge,.42)}for(const s of spec.solids.filter(s=>s.id!=='dam_standard'&&isPhysical(s))){if(s.type==='extrusion_x')for(const r of rangesOf(s))extrudeProfile(groups.dam,s.id,r[0],r[1],s.profile_yz,C.dam,.86);else if(s.type==='extrusion_z')extrudePlan(groups.dam,s.id,s.plan_xy,s.z[0],s.z[1],C.dam,.86);else if(s.type==='box')for(const b of s.boxes||[])box(groups.dam,s.id,b.x[0],b.x[1],b.y[0],b.y[1],b.z[0],b.z[1],s.material==='steel'?0x73808b:C.dam,.82)}}
function tunnelSegment(group,a,b,width,height,color,name){const p=P([a[0],a[1],a[2]+height/2]),q=P([b[0],b[1],b[2]+height/2]),d=q.clone().sub(p),len=d.length(),m=new THREE.Mesh(new THREE.BoxGeometry(len,height,width),mat(color,{transparent:true,opacity:.82,emissive:color,emissiveIntensity:.12}));m.name=name;m.position.copy(p.clone().add(q).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),d.clone().normalize());group.add(m);addEdges(m,color,.7)}
function addVoids(){for(const q of spec.voids){if(!['gallery','link_gallery','observation_room','elevator_shaft','access_adit'].includes(q.semantics?.class))continue;const color=q.id.includes('upper')?C.upper:q.id.includes('lower')?C.lower:q.id.includes('elevator')?C.shaft:C.outlet;if(q.type==='sweep_xz')q.path_xz.slice(0,-1).forEach((a,i)=>tunnelSegment(groups.gallery,[a[0],q.y,a[1]],[q.path_xz[i+1][0],q.y,q.path_xz[i+1][1]],q.width,q.height,color,q.id));else if(q.type==='sweep_y')q.path_yz.slice(0,-1).forEach((a,i)=>tunnelSegment(groups.gallery,[q.x,a[0],a[1]],[q.x,q.path_yz[i+1][0],q.path_yz[i+1][1]],q.width,q.height,color,q.id));else if(q.type==='box')for(const b of q.boxes||[q]){if(!b.x||!b.y||!b.z)continue;box(groups.gallery,q.id,b.x[0],b.x[1],b.y[0],b.y[1],b.z[0],b.z[1],color,.66)}}}
function addTerrain(){const {header,values}=dataset.terrainNear,[nx,ny]=header.shape,step=4,ix=[],iy=[];for(let i=0;i<nx;i+=step)ix.push(i);if(ix.at(-1)!==nx-1)ix.push(nx-1);for(let j=0;j<ny;j+=step)iy.push(j);if(iy.at(-1)!==ny-1)iy.push(ny-1);const positions=[];for(const i of ix)for(const j of iy){const modelX=header.origin[0]+i*header.spacing[0],modelY=header.origin[1]+j*header.spacing[1],p=P([modelY,modelX,values[i*ny+j]+198]);positions.push(p.x,p.y,p.z)}const indices=[],cols=iy.length;for(let i=0;i<ix.length-1;i++)for(let j=0;j<iy.length-1;j++){const a=i*cols+j,b=a+cols,c=b+1,d=a+1;indices.push(a,b,c,a,c,d)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,mat(C.rock,{transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false,flatShading:true}));m.name='近场有效地形（20 m 显示采样）';m.receiveShadow=true;groups.terrain.add(m)}
function addHydraulicVoidBoundaries(){
 const material=new THREE.MeshStandardMaterial({color:C.dam,roughness:.82,metalness:.01,side:THREE.DoubleSide});
 const add=(name,points,idx)=>{const v=[];for(const q of points){const p=P(q);v.push(p.x,p.y,p.z)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=true;groups.dam.add(m);addEdges(m,C.edge,.55)};
 const hydraulic=spec.voids.filter(q=>q.semantics?.system==='flood_release'&&isPhysical(q));
 for(const bay of hydraulic.filter(q=>q.semantics?.class==='spillway_bay'&&q.type==='box'))for(const b of bay.boxes||[bay]){
  const [x0,x1]=b.x,[y0,y1]=b.y,z=b.z[0]+.025;
  add(`${bay.id}底面`,[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]],[0,1,2,0,2,3]);
  for(const x of [x0,x1])add(`${bay.id}侧壁`,[[x,y0,b.z[0]],[x,y1,b.z[0]],[x,y1,b.z[1]],[x,y0,b.z[1]]],[0,1,2,0,2,3]);
 }
 for(const chute of hydraulic.filter(q=>q.semantics?.class==='spillway_chute'&&q.type==='chute')){
  const yMin=chute.floor_yz[0][0],yMax=chute.floor_yz.at(-1)[0];
  const ys=[...new Set([...chute.floor_yz.map(p=>p[0]),...(chute.void_top||[]).flatMap(s=>s.y)])].filter(y=>y>=yMin&&y<=yMax).sort((a,b)=>a-b);
  const path=ys.map(y=>[y,interpFloor(chute.floor_yz,y)]);
  for(const [x0,x1] of chute.x_ranges)for(let i=0;i<path.length-1;i++){
   const [y0,z0]=path[i],[y1,z1]=path[i+1],f0=z0+.025,f1=z1+.025,zTop0=chuteWallTopAt(chute,y0,z0),zTop1=chuteWallTopAt(chute,y1,z1);
   add(`${chute.id}底板`,[[x0,y0,f0],[x1,y0,f0],[x1,y1,f1],[x0,y1,f1]],[0,1,2,0,2,3]);
   for(const x of [x0,x1])add(`${chute.id}侧壁`,[[x,y0,z0],[x,y1,z1],[x,y1,zTop1],[x,y0,zTop0]],[0,1,2,0,2,3]);
  }
 }
 const outletClasses=new Set(['outlet_conduit','gate_chamber','outlet_tunnel','outlet_channel']);
 for(const q of hydraulic.filter(q=>outletClasses.has(q.semantics?.class)&&q.type==='box'))for(const b of q.boxes||[q]){
  const [x0,x1]=b.x,[y0,y1]=b.y,[z0,z1]=b.z,e=.025;
  add(`${q.id}底板`,[[x0,y0,z0+e],[x1,y0,z0+e],[x1,y1,z0+e],[x0,y1,z0+e]],[0,1,2,0,2,3]);
  for(const x of [x0+e,x1-e])add(`${q.id}侧壁`,[[x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1]],[0,1,2,0,2,3]);
  if(q.semantics?.enclosure==='closed'){
   add(`${q.id}顶板`,[[x0,y0,z1-e],[x0,y1,z1-e],[x1,y1,z1-e],[x1,y0,z1-e]],[0,1,2,0,2,3]);
   const roofTop=Math.max(z1,...spec.solids.filter(s=>s.semantics?.class==='outlet_structure'&&s.type==='box').flatMap(s=>s.boxes||[s]).filter(s=>s.x&&s.y&&inRange((x0+x1)/2,s.x)&&inRange((y0+y1)/2,s.y)).map(s=>s.z[1]));
   if(roofTop>z1+e)for(const y of [y0,y1])add(`${q.id}顶板厚度断面`,[[x0,y,z1],[x1,y,z1],[x1,y,roofTop],[x0,y,roofTop]],[0,1,2,0,2,3]);
  }
 }
}
function waterSurfaceMesh(water,level,color){
 const {header,values}=dataset.terrainNear,[nx,ny]=header.shape,[dx,dy]=header.spacing,levelModel=level-198;
 const cols=ny-1,cells=new Uint8Array((nx-1)*(ny-1)),connected=new Uint8Array(cells.length),at=(i,j)=>values[i*ny+j];
 const docPoint=(i,j,z=level)=>[header.origin[1]+j*dy,header.origin[0]+i*dx,z];
 for(let i=0;i<nx-1;i++)for(let j=0;j<ny-1;j++){
  const xModel=header.origin[0]+(i+.5)*dx;if(xModel<water.y_range[0]||xModel>water.y_range[1])continue;
  const corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]];
  if(corners.every(([a,b])=>at(a,b)<levelModel-.02&&!solidContains(...docPoint(a,b))))cells[i*cols+j]=1;
 }
 const seedI=Math.max(0,Math.min(nx-2,Math.round((water.seed[1]-header.origin[0])/dx))),seedJ=Math.max(0,Math.min(ny-2,Math.round((water.seed[0]-header.origin[1])/dy))),queue=[];
 const enqueue=(i,j)=>{if(i<0||j<0||i>=nx-1||j>=ny-1)return;const k=i*cols+j;if(!cells[k]||connected[k])return;connected[k]=1;queue.push([i,j])};
 enqueue(seedI,seedJ);for(let q=0;q<queue.length;q++){const [i,j]=queue[q];enqueue(i-1,j);enqueue(i+1,j);enqueue(i,j-1);enqueue(i,j+1)}
 const positions=[],indices=[],addQuad=(points)=>{const k=positions.length/3;for(const point of points){const p=P(point);positions.push(p.x,p.y,p.z)}indices.push(k,k+1,k+2,k,k+2,k+3)};
 for(let i=0;i<nx-1;i++)for(let j=0;j<ny-1;j++){
  const k=i*cols+j;if(!connected[k])continue;
  const p00=docPoint(i,j),p10=docPoint(i+1,j),p11=docPoint(i+1,j+1),p01=docPoint(i,j+1);addQuad([p00,p10,p11,p01]);
  const sides=[[-1,0,p00,p01,[i,j],[i,j+1]],[1,0,p10,p11,[i+1,j],[i+1,j+1]],[0,-1,p00,p10,[i,j],[i+1,j]],[0,1,p01,p11,[i,j+1],[i+1,j+1]]];
  for(const [di,dj,a,b,ga,gb] of sides){const ni=i+di,nj=j+dj;if(ni>=0&&nj>=0&&ni<nx-1&&nj<ny-1&&connected[ni*cols+nj])continue;const za=at(ga[0],ga[1])+198,zb=at(gb[0],gb[1])+198;addQuad([a,b,[b[0],b[1],Math.min(level,zb)],[a[0],a[1],Math.min(level,za)]]);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,mat(color,{transparent:true,opacity:.42,roughness:.18,metalness:.08,side:THREE.DoubleSide,depthWrite:false}));mesh.name=water.semantics?.names?.zh||water.id;return mesh;
}
function axes(){const g=new THREE.Group(),o=P([18,-4,210]);for(const [q,c] of [[P([18,26,210]),0x49a7ff],[P([48,-4,210]),0xff9f4a],[P([18,-4,235]),0x38d996]]){const d=q.clone().sub(o);g.add(new THREE.ArrowHelper(d.clone().normalize(),o,d.length(),c,5,2.5))}return g}
 function heatColor(t){const stops=[[.0,0x397cff],[.38,0x24d5c1],[.72,0xffd166],[1,0xff5f55]],out=new THREE.Color(stops[0][1]);for(let i=0;i<stops.length-1;i++){const [a,ca]=stops[i],[b,cb]=stops[i+1];if(t>=a&&t<=b)return out.set(ca).lerp(new THREE.Color(cb),(t-a)/(b-a))}return out.set(stops.at(-1)[1])}
 function showProjectionPixel(d,ix,iy){
 if(!d)return;
 const q=d.values[iy*d.n+ix];
 groups.projection.clear();
 const point=modelToDoc(currentStation),origin=P([point.x,point.y,point.z]),dir=docDirToScene(q.dir).normalize(),rayLength=Math.max(110,...q.q.cells.map(c=>c.t1+8)),end=origin.clone().addScaledVector(dir,rayLength);
 const overlayMat=(color,opacity=1,wireframe=false)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthTest:false,depthWrite:false,wireframe});
 const tube=(a,b,color,radius,opacity=1)=>{const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),8),overlayMat(color,opacity));mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.renderOrder=20;groups.projection.add(mesh)};
 tube(origin,end,0x65fff0,.26,.9);
 const start=new THREE.Mesh(new THREE.SphereGeometry(1.35,18,12),overlayMat(0xffffff));start.position.copy(origin);start.renderOrder=24;groups.projection.add(start);
 const halo=new THREE.Mesh(new THREE.TorusGeometry(2.25,.22,8,32),overlayMat(0x2fe7d5,.92));halo.position.copy(origin);halo.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);halo.renderOrder=23;groups.projection.add(halo);
 const arrow=new THREE.ArrowHelper(dir,origin,14,0xffffff,3.2,1.5);arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=24;arrow.cone.renderOrder=24;groups.projection.add(arrow);
 const uniqueCells=[...new Map(q.q.cells.map(cell=>[`${cell.ix}/${cell.iy}/${cell.iz}`,cell])).values()],cellSize=TRACE.mainCell,voxels=new THREE.InstancedMesh(new THREE.BoxGeometry(cellSize*.92,cellSize*.92,cellSize*.92),overlayMat(0x5de9ff,.24,true),uniqueCells.length),dummy=new THREE.Object3D();
 uniqueCells.forEach((cell,i)=>{dummy.position.copy(P([(cell.ix+.5)*cellSize,(cell.iy+.5)*cellSize-300,(cell.iz+.5)*cellSize+198]));dummy.updateMatrix();voxels.setMatrixAt(i,dummy.matrix)});voxels.renderOrder=19;groups.projection.add(voxels);
 const marked=new Set();
 for(const cell of q.q.cells){for(const id of cell.targets||[]){if(marked.has(id)||!TARGETS[id])continue;marked.add(id);const p=origin.clone().addScaledVector(dir,(cell.t0+cell.t1)/2),marker=new THREE.Mesh(new THREE.SphereGeometry(1.45,18,12),overlayMat(TARGETS[id].color));marker.position.copy(p);marker.renderOrder=25;groups.projection.add(marker)}}

}
 function drawFluxCloud(){if(!fluxState||!groups.flux)return;groups.flux.clear();const {n,p,samples,sumThrough,sumOpen}=fluxState,mode=$('#fluxMode')?.value||'combined',maxSteps=14,rawOf=s=>mode==='transmission'?s.transmission:s.contribution,maxRaw=Math.max(0,...samples.map(rawOf)),cutoff=maxRaw*1e-3,positions=[],colors=[];let directions=0;for(const s of samples){const raw=rawOf(s);if(raw<cutoff||raw<=0)continue;directions++;const display=THREE.MathUtils.clamp((Math.log10(raw)+6)/6,0,1),segments=Math.max(1,Math.round(maxSteps*Math.sqrt(Math.min(1,raw)))),reach=18+62*Math.sqrt(Math.min(1,raw)),dir=docDirToScene(s.dirDoc),color=heatColor(display);for(let j=1;j<=segments;j++){const f=j/segments,pos=p.clone().addScaledVector(dir,2+reach*f);positions.push(pos.x,pos.y,pos.z);colors.push(color.r,color.g,color.b)}}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const halo=new THREE.Points(geometry,new THREE.PointsMaterial({size:9,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.1,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending})),core=new THREE.Points(geometry,new THREE.PointsMaterial({size:4,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.92,depthWrite:false,depthTest:false}));halo.renderOrder=9;core.renderOrder=10;groups.flux.add(halo,core);const weightedTransmission=sumOpen>0?100*sumThrough/sumOpen:0;$('#fluxInfo').innerHTML=`峰值 ${(maxRaw*100).toPrecision(2)}% · 加权透射 ${weightedTransmission.toFixed(1)}%<br>${directions}/${n*n} 个方向（峰值0.1%阈值）`}
 function updateRayVisual(trace,c,dir){groups.grid.clear();const cell=traceCellM,im=new THREE.InstancedMesh(new THREE.BoxGeometry(cell,cell,cell),new THREE.MeshBasicMaterial({color:C.grid,wireframe:true,transparent:true,opacity:.18}),trace.cells.length),dummy=new THREE.Object3D();trace.cells.forEach((q,i)=>{dummy.position.copy(P([(q.ix+.5)*cell,(q.iy+.5)*cell-300,(q.iz+.5)*cell+198]));dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix)});groups.grid.add(im);const d=modelToDoc(c),origin=P([d.x,d.y,d.z]),sdir=docDirToScene(dir),points=[origin];let cursor=95;for(const q of trace.cells){if(q.kind==='air')continue;const a=origin.clone().addScaledVector(sdir,q.t0),b=origin.clone().addScaledVector(sdir,q.t1),col=q.kind==='concrete'?C.dam:q.kind==='water'?C.upwater:C.rock;groups.cone.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:col})));cursor=Math.max(cursor,q.t1)}points.push(origin.clone().addScaledVector(sdir,cursor));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:C.detector,dashSize:3,gapSize:2,transparent:true,opacity:.9}));line.computeLineDistances();groups.cone.add(line)}
 function frustumGeometry(origin,dir,length,slopeX,slopeY){const ref=Math.abs(dir.y)>.96?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(dir,ref).normalize(),up=new THREE.Vector3().crossVectors(right,dir).normalize(),far=origin.clone().addScaledVector(dir,length),nw=DEVICE.width/2,nh=DEVICE.height/2,fw=nw+length*slopeX,fh=nh+length*slopeY,v=[];for(const [o,w,h] of [[origin,nw,nh],[far,fw,fh]])for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const q=o.clone().addScaledVector(right,a*w).addScaledVector(up,b*h);v.push(q.x,q.y,q.z)}const idx=[0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7];const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();return g}
 function drawDetector(c,device){currentStation={...c};DEVICE={...device};if(!scene)return;groups.cone.clear();groups.flux.clear();groups.projection?.clear();const d=modelToDoc(c),p=P([d.x,d.y,d.z]),dirDoc=directionDoc(c),dir=docDirToScene(dirDoc),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),dir);for(let i=0;i<DEVICE.layers;i++){const layer=new THREE.Mesh(new THREE.PlaneGeometry(DEVICE.width,DEVICE.height),new THREE.MeshBasicMaterial({color:i===1?0xffffff:C.detector,side:THREE.DoubleSide,transparent:true,opacity:.95}));layer.position.copy(p).addScaledVector(dir,(i-1)*DEVICE.spacing);layer.quaternion.copy(q);groups.cone.add(layer)}const front=p.clone().addScaledVector(dir,DEVICE.baseline/2),length=72,outer=frustumGeometry(front,dir,length,DEVICE.maxSlopeX,DEVICE.maxSlopeY),core=frustumGeometry(front,dir,length,DEVICE.maxSlopeX*.5,DEVICE.maxSlopeY*.5);groups.cone.add(new THREE.LineSegments(new THREE.EdgesGeometry(outer),new THREE.LineBasicMaterial({color:C.cone,transparent:true,opacity:.68})));groups.cone.add(new THREE.Mesh(core,new THREE.MeshBasicMaterial({color:C.cone,transparent:true,opacity:.045,side:THREE.DoubleSide,depthWrite:false})));groups.cone.add(new THREE.ArrowHelper(dir,p,72,C.detector,4,1.5));return p}
 function framePerspectiveView(){camera.position.set(235,155,-300);controls.target.set(0,52,-15);controls.update();const screenRight=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);camera.position.addScaledVector(screenRight,72);controls.target.addScaledVector(screenRight,72);controls.update()}
 function buildScene(){foundation=[...new Map(spec.foundation_surface.points.map(([x,z])=>[x,Math.min(...spec.foundation_surface.points.filter(p=>p[0]===x).map(p=>p[1]))])).entries()].sort((a,b)=>a[0]-b[0]);scene=new THREE.Scene();scene.background=new THREE.Color(0x071018);scene.fog=new THREE.FogExp2(0x071018,.00155);camera=new THREE.PerspectiveCamera(40,1,.1,1400);camera.position.set(235,155,-300);renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;container.append(renderer.domElement);viewportResizeObserver?.disconnect();viewportResizeObserver=new ResizeObserver(()=>{resize();constrainProjectionPanel()});viewportResizeObserver.observe(container);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,52,-15);controls.minDistance=50;controls.maxDistance=720;framePerspectiveView();scene.add(new THREE.HemisphereLight(0xbfe3ff,0x17221b,2.4));const sun=new THREE.DirectionalLight(0xfff0d6,3.1);sun.position.set(160,260,150);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);
  groups.dam=new THREE.Group();groups.gallery=new THREE.Group();groups.terrain=new THREE.Group();groups.upwater=new THREE.Group();groups.downwater=new THREE.Group();groups.cone=new THREE.Group();groups.flux=new THREE.Group();groups.grid=new THREE.Group();groups.projection=new THREE.Group();groups.grid.visible=false;addTerrain();addSolids();addVoids();addHydraulicVoidBoundaries();const reservoir=spec.water.find(w=>w.id==='reservoir'),tailwater=spec.water.find(w=>w.id==='tailwater');if(reservoir)groups.upwater.add(waterSurfaceMesh(reservoir,upstream,C.upwater));if(tailwater)groups.downwater.add(waterSurfaceMesh(tailwater,tailLevel(),C.downwater));for(const k of ['terrain','dam','gallery','upwater','downwater','grid','cone','flux','projection'])scene.add(groups[k]);scene.add(axes());const ground=new THREE.GridHelper(520,26,0x35505d,0x1d3038);ground.position.y=.05;scene.add(ground);resize();renderer.setAnimationLoop(()=>{controls.update();updateScale();renderer.render(scene,camera)});$('#loading').style.display='none'}
 function niceLength(value){const p=10**Math.floor(Math.log10(value)),n=value/p;return(n<1.5?1:n<3.5?2:n<7.5?5:10)*p}
 function updateScale(){const h=Math.max(1,container.clientHeight),distance=camera.position.distanceTo(controls.target),metersPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/h,meters=niceLength(metersPerPixel*90),pixels=meters/metersPerPixel;$('#scaleBar').style.width=pixels.toFixed(0)+'px';$('#scaleLabel').textContent=(meters<1?meters.toFixed(1):meters.toFixed(0))+' m'}
 function updateCompass(){const needle=$('#compassNeedle');if(!needle||!camera||!controls)return;const a=controls.target.clone().project(camera),north=new THREE.Vector3(-Math.cos(THREE.MathUtils.degToRad(317)),0,-Math.cos(THREE.MathUtils.degToRad(47))),b=controls.target.clone().addScaledVector(north,40).project(camera),angle=THREE.MathUtils.radToDeg(Math.atan2(b.x-a.x,b.y-a.y));needle.style.transform=`rotate(${angle}deg)`}
 function resize(){const r=container.getBoundingClientRect();if(!r.width||!r.height)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false)}
 function setView(mode){const views={front:[[0,65,330],[0,55,0],'上游正视','从上游朝下游看：左岸在左，电梯井靠左岸'],cross:[[330,70,0],[0,55,-10],'典型横剖面','朝西北／左岸方向观察：上游在左、下游在右'],top:[[0,360,0],[0,35,-15],'坝顶俯视','西北／左岸位于画面左侧']};if(mode==='perspective')framePerspectiveView();else{const v=views[mode];camera.position.set(...v[0]);controls.target.set(...v[1]);controls.update()}$('#viewSelect').value=mode;const direction=$('#direction');if(direction)direction.textContent=mode==='perspective'?'下游三分之四视角':views[mode][3]}
 function setDamOpacity(opacity){groups.dam.traverse(o=>{if(!o.isMesh||!o.material)return;o.material.transparent=opacity<1;o.material.opacity=opacity;o.material.depthWrite=opacity>.72;o.material.needsUpdate=true})}
 return Object.freeze({build:buildScene,resize,setView,setDamOpacity,drawDetector,showProjectionPixel,clearProjection(){groups.projection?.clear();},setLayer(name,visible){if(groups[name])groups[name].visible=visible;},drawFluxCloud,showFlux(cloud,station){const d=modelToDoc(station);fluxState={...cloud,p:P([d.x,d.y,d.z])};drawFluxCloud();},showRay:updateRayVisual,pointFromStation(station){const d=modelToDoc(station);return P([d.x,d.y,d.z]);},setWater(level){upstream=level;const reservoir=spec.water.find(w=>w.id==='reservoir');if(groups.upwater){groups.upwater.clear();if(reservoir)groups.upwater.add(waterSurfaceMesh(reservoir,level,C.upwater));}},dispose(){renderer?.setAnimationLoop(null);viewportResizeObserver?.disconnect();controls?.dispose();scene?.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m?.dispose();});renderer?.dispose();renderer?.domElement.remove();}});
}
