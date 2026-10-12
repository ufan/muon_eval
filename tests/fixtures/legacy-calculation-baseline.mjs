// Frozen numerical baseline: the pre-extraction formulas, with the flux integral
// evaluated exactly per input since legacy-quick-response@2.0.0 (FR-C1).
// Test-only; do not use in runtime.
export function legacyCalculationBaseline(DEVICE, RESPONSE) {
const THREE = { MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), degToRad: v => v * (Math.PI / 180) } };
const nativeBinCache = new Map();
function cosThetaStar(c){c=THREE.MathUtils.clamp(c,0,1);const p1=.102573,p2=-.068287,p3=.958633,p4=.0407253,p5=.817285;return Math.sqrt((c*c+p1*p1+p2*c**p3+p4*c**p5)/(1+p1*p1+p2+p4))}
function gaisserFlux(E,cosZ){if(cosZ<=0)return 0;const cs=cosThetaStar(cosZ),shift=1+3.64/(E*cs**1.29),spectrum=.14*(E*shift)**-2.7,mesons=1/(1+1.1*E*cs/115)+.054/(1+1.1*E*cs/850);return spectrum*mesons}
function surfaceSpectrum(E,cosZ){return RESPONSE.angularModel==='cos2'?gaisserFlux(E,1)*cosZ*cosZ:gaisserFlux(E,cosZ)}
function integratedSurfaceFlux(cosZ,emin){if(cosZ<=0)return 0;emin=Math.max(1,emin);const emax=1e5,n=44,lo=Math.log(emin),hi=Math.log(emax),step=(hi-lo)/n;let sum=0;for(let i=0;i<=n;i++){const E=Math.exp(lo+i*step),w=(i===0||i===n)?0.5:1;sum+=w*surfaceSpectrum(E,cosZ)*E}return sum*step}
function minimumMuonEnergy(mwe){const a=.2,b=4e-4;return a/b*(Math.exp(b*Math.max(0,mwe))-1)}
function nativeAxisBins(n){if(nativeBinCache.has(n))return nativeBinCache.get(n);const count=2*DEVICE.stripsX-1,bins=[];for(let i=0;i<n;i++){const first=Math.floor(i*count/n)-(DEVICE.stripsX-1),last=Math.floor((i+1)*count/n)-1-(DEVICE.stripsX-1);let sumWeight=0,weightedSlope=0;for(let d=first;d<=last;d++){const weight=(DEVICE.stripsX-Math.abs(d))/DEVICE.stripsX,slope=d*DEVICE.nativeSlopeStep;sumWeight+=weight;weightedSlope+=weight*slope}bins.push({slope:weightedSlope/sumWeight,sumWeight,first,last})}nativeBinCache.set(n,bins);return bins}
function applyProjectionResolution(values,n){const slopePerPixel=2*Math.max(DEVICE.maxSlopeX,DEVICE.maxSlopeY)/Math.max(1,n-1),sigma=THREE.MathUtils.degToRad(RESPONSE.angularResolutionDeg)/Math.max(1e-6,slopePerPixel);if(sigma<.2){for(const v of values){v.displayCount=v.count;v.displayTransmission=v.transmission}return}const radius=Math.min(6,Math.max(1,Math.ceil(2.5*sigma))),source=values.map(v=>[v.count,v.transmission]);for(let y=0;y<n;y++)for(let x=0;x<n;x++){let wc=0,c=0,t=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=n||yy<0||yy>=n)continue;const w=Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma)),q=source[yy*n+xx];wc+=w;c+=w*q[0];t+=w*q[1]}values[y*n+x].displayCount=c/wc;values[y*n+x].displayTransmission=t/wc}}
return { cosThetaStar, gaisserFlux, surfaceSpectrum, integratedSurfaceFlux, minimumMuonEnergy, nativeAxisBins, applyProjectionResolution };
}
