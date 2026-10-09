// Application scheduling knows only snapshots, assessment ports and publication callbacks.
export function createAssessmentController({assessment,readInputs,onStart=()=>{},onQuick=()=>{},onProgress=()=>{},onResult=()=>{},onInvalidate=()=>{},onError=()=>{},delayMs=160,scheduler={set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)}}){
 let generation=0,timer=null,batchTimer=null,session=null,result=null,disposed=false;
 function invalidate(){generation++;if(timer!==null)scheduler.clear(timer);if(batchTimer!==null)scheduler.clear(batchTimer);timer=batchTimer=null;session=result=null;onInvalidate();}
 function run(){if(disposed)return;invalidate();const job=generation;
  try{const input=structuredClone(readInputs());session=assessment.createSession(input);const current=session;onStart(input);if(job!==generation||disposed)return;const cloud=current.cloud(),metrics=current.quickMetrics();onQuick({cloud,metrics},input);if(job!==generation||disposed)return;
   function pass(quality){if(job!==generation||disposed)return;const work=current.projection(quality);
    function batch(){batchTimer=null;if(job!==generation||disposed)return;try{const state=work.advance(quality==='preview'?5:3);if(!state.done){onProgress({quality,progress:state.progress});batchTimer=scheduler.set(batch,0);return;}result=work.complete(state.result);onResult(result,input);if(job===generation&&!disposed&&quality==='preview')pass('final');}catch(error){if(job===generation){invalidate();onError(error);}}}
    batchTimer=scheduler.set(batch,0);
   }
   pass('preview');
  }catch(error){invalidate();onError(error);}
 }
 return Object.freeze({run,schedule(){if(disposed)return;invalidate();timer=scheduler.set(()=>{timer=null;run();},delayMs);},ensureTargetSignificance(data,id){if(data===result)session?.ensureTargetSignificance(data,id);},dispose(){disposed=true;invalidate();}});
}
