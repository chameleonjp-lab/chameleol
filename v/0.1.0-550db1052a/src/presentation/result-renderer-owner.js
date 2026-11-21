// One result rendering context. Portrait preparation has priority over an optional model panel.
export function createResultRendererOwner({createRenderer=()=>null,destroyRenderer=r=>r?.dispose?.()} = {}) {
  let active=null,creating=false,creatingRequest=null,disposed=false;
  const queue=[];
  const destroy=renderer=>{try{destroyRenderer(renderer);}catch{/* cleanup must remain idempotent */}};
  function pump() {
    if(disposed || creating || active || !queue.length)return;
    const index=queue.findIndex(r=>r.owner==='portrait');
    let request=queue.splice(index<0?0:index,1)[0];
    if(request.cancelled){pump();return;}
    creating=true;creatingRequest=request;
    let pending;
    try{pending=createRenderer();}catch{pending=null;}
    Promise.resolve(pending).then(renderer=>{
      // A portrait can arrive while the model's context is being created, before active exists.
      // Keep the creation lock during callbacks so a re-entrant model retry cannot create a second context.
      if(renderer&&!disposed&&!request.cancelled&&request.owner==='model'){
        const portraitIndex=queue.findIndex(r=>r.owner==='portrait'&&!r.cancelled);
        if(portraitIndex>=0){
          const superseded=request;request=queue.splice(portraitIndex,1)[0];
          superseded.cancelled=true;superseded.finish(null);
          try{superseded.onRevoke?.();}catch{/* context ownership still transfers safely */}
        }
      }
      creating=false;creatingRequest=null;
      if(!renderer || disposed || request.cancelled){if(renderer)destroy(renderer);request.finish(null);pump();return;}
      const controller=new AbortController();let released=false;
      const lease={owner:request.owner,renderer,signal:controller.signal,release(){
        if(released)return;released=true;
        if(active===entry)active=null;
        controller.abort();request.removeAbort();destroy(renderer);pump();
      }};
      const entry={lease,request};active=entry;
      request.lease=lease;request.finish(lease,false);
    },()=>{creating=false;creatingRequest=null;request.finish(null);pump();});
  }
  const api={
    acquire(owner,{signal=null,onRevoke=null}={}) {
      if(disposed || signal?.aborted || !['portrait','model'].includes(owner))return Promise.resolve(null);
      return new Promise(resolve=>{
        const request={owner,signal,onRevoke,cancelled:false,lease:null,finish(value,remove=true){if(remove)request.removeAbort();resolve(value);},removeAbort(){signal?.removeEventListener('abort',cancel);}};
        const cancel=()=>{request.cancelled=true;request.lease?.release();request.finish(null);pump();};
        signal?.addEventListener('abort',cancel,{once:true});queue.push(request);
        if(owner==='portrait' && active?.lease.owner==='model'){
          const previous=active;
          try{previous.request.onRevoke?.();}catch{/* the owner still releases the context */}finally{previous.lease.release();}
        }
        pump();
      });
    },
    dispose(){
      if(disposed)return;disposed=true;
      if(creatingRequest){creatingRequest.cancelled=true;creatingRequest.finish(null);}
      active?.lease.release();
      for(const request of queue.splice(0)){request.cancelled=true;request.finish(null);}
    },
  };
  return api;
}
