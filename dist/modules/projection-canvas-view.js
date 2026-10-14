import * as THREE from 'three';
import { outlineRings, crossingsAlongRay, detectorSpaceItems } from './recognition-layers.js';
import { precisionContours } from './precision-contours.js';
// Projection panel view: heat map on the canvas, recognition outlines (FR-M12) in
// an SVG overlay in pixel units, and the hover readout with the crossed items.
const SVG='http://www.w3.org/2000/svg',DASHES=['','5 3','2 2','8 3 2 3'];
const escapeHtml=text=>String(text).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
export function createProjectionCanvasView({root=document,onHover=()=>{},onLeave=()=>{}}){
 const $=s=>root.querySelector(s);
 let projection={data:null,mode:'counts',recognition:null,precision:false},RESPONSE={},precisionCache={data:null,contours:[]},selected=null;
 function heatColor(t){const stops=[[.0,0x397cff],[.38,0x24d5c1],[.72,0xffd166],[1,0xff5f55]],out=new THREE.Color(stops[0][1]);for(let i=0;i<stops.length-1;i++){const [a,ca]=stops[i],[b,cb]=stops[i+1];if(t>=a&&t<=b)return out.set(ca).lerp(new THREE.Color(cb),(t-a)/(b-a))}return out.set(stops.at(-1)[1])}
 function colorCss(t){const c=heatColor(THREE.MathUtils.clamp(t,0,1));return`rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`}
 const recognition=()=>projection.recognition??{items:[],layers:new Map(),selected:new Set(),threshold:0};
 const selectedItems=()=>{const r=recognition();return r.items.filter(item=>r.selected.has(item.id)&&r.layers.get(item.id)?.inView);};
 function drawOutlines(){const svg=$('#projectionOutlines'),d=projection.data;svg.replaceChildren();if(!d)return;const n=d.n,r=recognition(),used=new Map(),placed=[],size=n*.05;svg.setAttribute('viewBox',`0 0 ${n} ${n}`);
  // Pixel picked from the 3D coverage, marked until the result changes.
  if(selected?.data===d){const mark=document.createElementNS(SVG,'rect');mark.setAttribute('x',selected.ix);mark.setAttribute('y',n-1-selected.iy);mark.setAttribute('width',1);mark.setAttribute('height',1);mark.classList.add('picked-pixel');svg.append(mark);}
  // Horizon of the detector lines (quick-response@4.0.0): below it, counts come from the sky behind the detector.
  const back=new Uint8Array(n*n);for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++)back[(n-1-iy)*n+ix]=d.values[iy*n+ix].side==='back'?1:0;
  if(back.some(Boolean)){const onBorder=(a,b)=>(a[0]===b[0]&&(a[0]===0||a[0]===n))||(a[1]===b[1]&&(a[1]===0||a[1]===n));let line='';
   for(const ring of outlineRings(back,n))for(let i=1;i<ring.length;i++){if(onBorder(ring[i-1],ring[i]))continue;line+=`M${ring[i-1].join(',')}L${ring[i].join(',')}`;}
   const horizon=document.createElementNS(SVG,'path');horizon.setAttribute('d',line);horizon.classList.add('horizon');svg.append(horizon);
   const first=[...Array(n).keys()].find(r=>back[r*n]),labels=[['前方来向 ↑',first-.5],['后方来向 ↓',first+size*1.1]];
   for(const [label,y] of labels){if(!Number.isFinite(y)||y<size||y>n-.3)continue;const text=document.createElementNS(SVG,'text');text.setAttribute('x',.6);text.setAttribute('y',y);text.setAttribute('font-size',size*.85);text.classList.add('horizon-label');text.textContent=label;svg.append(text);}}
  // Statistical precision (FR-M13): counting error 1/sqrt(N) = 10 % (dashed) and 5 % (solid); neutral, unnamed lines.
  if(projection.precision){if(precisionCache.data!==d)precisionCache={data:d,contours:precisionContours(d)};
   for(const {relativeError,lines} of precisionCache.contours){if(!lines.length)continue;const path=document.createElementNS(SVG,'path');path.setAttribute('d',lines.map(l=>'M'+l.map(p=>p.join(',')).join('L')).join(''));path.classList.add('precision');path.dataset.level=String(relativeError);svg.append(path);
    const longest=lines.reduce((a,b)=>b.length>a.length?b:a),[x,y]=longest[Math.floor(longest.length/2)],text=document.createElementNS(SVG,'text'),lx=Math.min(x+.3,n*.9);let ly=Math.max(y-.3,size);while(placed.some(([px,py])=>Math.abs(px-lx)<n*.25&&Math.abs(py-ly)<size*1.1))ly+=size*1.15;placed.push([lx,ly]);text.setAttribute('x',lx);text.setAttribute('y',ly);text.setAttribute('font-size',size*.8);text.classList.add('precision-label');text.textContent=`${Math.round(relativeError*100)}%`;svg.append(text);}}
  for(const item of selectedItems()){const layer=r.layers.get(item.id),rings=outlineRings(layer.mask,n),dash=DASHES[(used.get(item.color)??0)%DASHES.length];used.set(item.color,(used.get(item.color)??0)+1);
   const path=document.createElementNS(SVG,'path');path.setAttribute('d',rings.map(ring=>'M'+ring.map(p=>p.join(',')).join('L')+'Z').join(''));path.setAttribute('stroke',item.color);if(dash)path.setAttribute('stroke-dasharray',dash);path.dataset.item=item.id;svg.append(path);
   // Label at the top-left corner of the largest ring.
   const ring=rings.reduce((a,b)=>b.length>a.length?b:a),[x,y]=ring.reduce((a,b)=>b[1]<a[1]||(b[1]===a[1]&&b[0]<a[0])?b:a),text=document.createElementNS(SVG,'text'),lx=Math.min(x,n*.7);let ly=Math.max(y-.4,size);
   // Stack labels that would overlap an earlier one.
   while(placed.some(([px,py])=>Math.abs(px-lx)<n*.25&&Math.abs(py-ly)<size*1.1))ly+=size*1.15;placed.push([lx,ly]);text.setAttribute('x',lx);text.setAttribute('y',ly);text.setAttribute('font-size',size);text.setAttribute('fill',item.color);text.textContent=item.label.zh;svg.append(text);}}
 // Items that contain the detector: their stretch from the detector is left out of masks and crossings.
 function detectorSpace(d){const r=recognition(),ids=detectorSpaceItems(d.values[Math.floor(d.values.length/2)],r.items);if(!ids.length)return'';const byId=new Map(r.items.map(item=>[item.id,item]));return`<br><span class="detector-space">探测器位于：${ids.map(id=>escapeHtml(byId.get(id).label.zh)).join('、')}（自身空间不计入轮廓）</span>`;}
 function summary(){const items=selectedItems();return items.length?`识别轮廓：${items.map(item=>escapeHtml(item.label.zh)).join('、')} · 长度 > ${recognition().threshold} m`:'识别轮廓未选择';}
 function drawProjection(){const d=projection.data;if(!d){drawOutlines();return;}const canvas=$('#projectionCanvas'),ctx=canvas.getContext('2d'),n=d.n,w=canvas.width/n,h=canvas.height/n,mode=projection.mode;ctx.clearRect(0,0,canvas.width,canvas.height);for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){const q=d.values[iy*n+ix],v=mode==='counts'?q.displayCount:mode==='transmission'?q.displayTransmission:0,t=mode==='counts'?THREE.MathUtils.clamp((Math.log10(Math.max(.1,v))+1)/6,0,1):mode==='transmission'?THREE.MathUtils.clamp((Math.log10(Math.max(1e-6,v))+6)/6,0,1):0;ctx.fillStyle=mode==='significance'?'#10202a':colorCss(t);ctx.fillRect(ix*w,canvas.height-(iy+1)*h,w+.5,h+.5)}drawOutlines();const title=mode==='counts'?`${RESPONSE.exposureDays}天预计计数`:mode==='transmission'?'坝体透射率':'结构对比显著度';$('#projectionReadout').innerHTML=`${title} · 总计数 ${Math.round(d.total).toLocaleString()}<br>加权透射 ${(d.weightedTransmission*100).toFixed(2)}%<br>${summary()}${detectorSpace(d)}`}
 function hover(ev){const d=projection.data;if(!d)return;const r=ev.currentTarget.getBoundingClientRect();showPixel(Math.max(0,Math.min(d.n-1,Math.floor((ev.clientX-r.left)/r.width*d.n))),Math.max(0,Math.min(d.n-1,d.n-1-Math.floor((ev.clientY-r.top)/r.height*d.n))));}
 // Readout of one pixel (ix from the left, iy from the bottom), shared by hover and by a click on the 3D coverage.
 function showPixel(ix,iy){const d=projection.data;if(!d)return;const q=d.values[iy*d.n+ix],rec=recognition(),byId=new Map(rec.items.map(item=>[item.id,item]));
  const crossings=crossingsAlongRay(q,rec.items,{threshold:rec.threshold}).map(c=>({...c,color:byId.get(c.id).color,label:byId.get(c.id).label.zh}));onHover(d,ix,iy,{threshold:rec.threshold});
  const list=crossings.length?crossings.map(c=>`<span class="crossing"><i style="--c:${c.color}"></i>${escapeHtml(c.label)} · 穿行 ${c.lengthM.toFixed(1)} m · 距探测器 ${c.entryM.toFixed(1)} m 处进入</span>`).join(''):'<span class="crossing none">未穿过识别图层</span>';
  $('#projectionReadout').innerHTML=`像素 (${ix+1},${iy+1}) · sx ${q.sx.toFixed(2)} · sy ${q.sy.toFixed(2)}${q.side==='back'?' · 后方来向':''}<br>${Math.round(q.count)} 事件/${RESPONSE.exposureDays}天 · 透射 ${(q.transmission*100).toFixed(3)}%<br>柱密度 ${q.q.mwe.toFixed(0)} m.w.e.${list}`;}
 const canvas=$('#projectionCanvas'),leave=()=>{onLeave();drawProjection();if(selected?.data===projection.data)showPixel(selected.ix,selected.iy);};canvas.addEventListener('mousemove',hover);canvas.addEventListener('mouseleave',leave);
 return Object.freeze({draw(state,response){projection=state;RESPONSE={...response};drawProjection();},selectPixel(ix,iy){const d=projection.data;if(!d||!Number.isInteger(ix)||!Number.isInteger(iy)||ix<0||iy<0||ix>=d.n||iy>=d.n)return;selected={data:d,ix,iy};drawOutlines();showPixel(ix,iy);},emphasiseItem(id){for(const path of root.querySelectorAll('#projectionOutlines path'))path.classList.toggle('emphasised',path.dataset.item===id);},dispose(){canvas.removeEventListener('mousemove',hover);canvas.removeEventListener('mouseleave',leave);}});
}
