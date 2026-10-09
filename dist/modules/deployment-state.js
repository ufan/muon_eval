import { defaultDeviceConfiguration, applyDeviceConfiguration } from './device-configuration.js';

const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function station(value){
 const c=structuredClone(value);
 c.az=clamp(Number.isFinite(+c.az)?+c.az:0,0,359);
 c.el=clamp(Number.isFinite(+c.el)?+c.el:0,0,90);
 if(![c.x,c.y,c.z].every(Number.isFinite))throw new Error('Station coordinates must be finite');
 return freeze(c);
}
// Application-owned inputs. Views receive immutable state; calculation receives copies.
export function createDeploymentState({stations,environment,configuration=defaultDeviceConfiguration()}){
 let candidates=freeze(stations.map(station)),active=0,config=freeze(structuredClone(configuration)),water=freeze(structuredClone(environment));
 if(!candidates.length)throw new Error('At least one candidate station is required');
 return Object.freeze({
  get candidates(){return candidates;},get active(){return active;},get device(){return config.device;},get response(){return config.response;},get configuration(){return config;},get environment(){return water;},
  select(index){if(!Number.isInteger(index)||index<0||index>=candidates.length)throw new Error('Unknown candidate');active=index;},
  replaceStations(values){const next=freeze(values.map(station));if(!next.length)throw new Error('At least one candidate station is required');candidates=next;active=Math.min(active,next.length-1);},
  updateStation(key,value){if(!['name','x','y','z','az','el'].includes(key))throw new Error('Unknown station field');const next=[...candidates];next[active]=station({...next[active],[key]:key==='name'?String(value):+value});candidates=freeze(next);},
  addStation(){candidates=freeze([...candidates,station({...candidates[active],name:'新候选点 '+(candidates.length+1)})]);active=candidates.length-1;},
  removeStation(){if(candidates.length<2)return;const next=[...candidates];next.splice(active,1);candidates=freeze(next);active=Math.max(0,active-1);},
  configure(settings){config=freeze(applyDeviceConfiguration(config,settings));},
  setEnvironment(environment){if(!Object.values(environment).every(Number.isFinite))throw new Error('Environment values must be finite');water=freeze(structuredClone(environment));},
  snapshot(){return structuredClone({station:candidates[active],device:config.device,response:config.response,environment:water});},
 });
}
