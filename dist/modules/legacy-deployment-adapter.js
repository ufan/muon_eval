// @ts-check
// Bounded compatibility mapping: these example poses belong to the legacy dataset.
export const LEGACY_PLAN_FILENAME='周宁缪子部署自适应射线方案.json';
export function legacyDefaultStations(dataset,geometry){
 if(dataset.spec?.schema_version!=='0.6')throw new Error('Unsupported legacy deployment dataset');
 return dataset.candidates.candidates.map((d,i)=>{
  const p=d.example_position||d.geometry?.position||[d.geometry?.x,Array.isArray(d.geometry?.y)?(d.geometry.y[0]+d.geometry.y[1])/2:d.geometry?.y,d.geometry?.z_floor];
  return{id:d.id,name:d.names?.zh||d.id,...geometry.docPointToModel({x:p[0],y:p[1],z:p[2]+.4}),az:[0,345,2,220,230,225][i]??0,el:[25,30,42,20,20,18][i]??25};
 });
}

export function legacyDeploymentExport({dataset,geometry,input,ray,candidates,trace}){
 const {station,device,response,environment}=input,spec=dataset.spec;
 return {model:'周宁下库大坝 LOD2 自适应射线模型',dataset:{id:spec.dataset_id,version:spec.dataset_version,schema_id:spec.schema_id,schema_version:spec.schema_version},device:{...device,response:{...response}},flux_model:{surface:response.angularModel==='cos2'?'cos²θ approximation':'Modified Gaisser (Guan et al. 2015)',transport:'continuous energy loss approximation'},coordinates:{frame:'model_frame_right_handed',X:'下游',Y:'西北/左岸',Z:'工程高程-198 m'},trace:{dda_main_cell_m:trace.mainCell,boundary_refine_m:trace.refine,projection_bins:[trace.finalN,trace.finalN]},water:{upstream:environment.upstream,downstream:geometry.defaultEnvironment.downstream},active_ray:{detector:station,material_path_m:ray.totals,column_density_mwe:ray.mwe},candidates:structuredClone(candidates)};
}
