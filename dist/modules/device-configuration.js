import { defaultAssessmentDevice, defaultAssessmentResponse } from './detector-defaults.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function deriveDeviceGeometry(DEVICE) {
 DEVICE={...DEVICE};
 DEVICE.baseline=DEVICE.spacing*(DEVICE.layers-1);DEVICE.nativeSlopeStep=DEVICE.stripPitch/DEVICE.baseline;DEVICE.maxSlopeX=(DEVICE.stripsX-1)*DEVICE.nativeSlopeStep;DEVICE.maxSlopeY=(DEVICE.stripsY-1)*DEVICE.nativeSlopeStep;DEVICE.fovH=radToDeg(2*Math.atan(DEVICE.maxSlopeX));DEVICE.fovV=radToDeg(2*Math.atan(DEVICE.maxSlopeY));DEVICE.coreFovH=radToDeg(2*Math.atan(DEVICE.maxSlopeX*.5));
 return DEVICE;
}
const radToDeg=v=>v*(180/Math.PI);
export function defaultDeviceConfiguration(){return {device:deriveDeviceGeometry(defaultAssessmentDevice()),response:defaultAssessmentResponse()};}
export function applyDeviceConfiguration(configuration,s) {
 let DEVICE={...configuration.device},RESPONSE={...configuration.response};
 DEVICE.width=clamp(+s.width||DEVICE.width,.01,5);DEVICE.height=clamp(+s.height||DEVICE.height,.01,5);DEVICE.stripPitch=clamp(+s.stripPitch||DEVICE.stripPitch,.00005,.1);DEVICE.stripsX=DEVICE.stripsY=Math.round(clamp(+s.strips||DEVICE.stripsX,2,4096));DEVICE.spacing=clamp(+s.spacing||DEVICE.spacing,.01,5);RESPONSE.layerEfficiency=clamp(+s.layerEfficiency||RESPONSE.layerEfficiency,.01,1);RESPONSE.deadLiveFraction=clamp(+s.deadLiveFraction||RESPONSE.deadLiveFraction,.01,1);RESPONSE.angularResolutionDeg=clamp(+s.angularResolutionDeg||RESPONSE.angularResolutionDeg,.01,20);RESPONSE.systematicFraction=clamp(+s.systematicFraction||RESPONSE.systematicFraction,0,1);RESPONSE.exposureDays=Math.round(clamp(+s.exposureDays||RESPONSE.exposureDays,1,3650));RESPONSE.angularModel=s.angularModel==='cos2'?'cos2':'gaisser';DEVICE.designResolutionDeg=RESPONSE.angularResolutionDeg;DEVICE=deriveDeviceGeometry(DEVICE)
 return {device:DEVICE,response:RESPONSE};
}
export function deviceSettingsData({device:DEVICE,response:RESPONSE}) {return{width:DEVICE.width,height:DEVICE.height,stripPitch:DEVICE.stripPitch,strips:DEVICE.stripsX,spacing:DEVICE.spacing,layerEfficiency:RESPONSE.layerEfficiency,deadLiveFraction:RESPONSE.deadLiveFraction,angularResolutionDeg:RESPONSE.angularResolutionDeg,systematicFraction:RESPONSE.systematicFraction,exposureDays:RESPONSE.exposureDays,angularModel:RESPONSE.angularModel}}
