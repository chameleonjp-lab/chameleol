// Pure cosmetic clock; scoring time and home-showcase timing are never changed here.
const PHASES=[['prepare',150],['extend',250],['hold',350],['retract',450],['store',200]];
export function createTravelTongueMotion() {
  let previous=null,movingMs=0,consumed=0,active=null,disposed=false;
  const api={
    sample(input,out=null){
      if(disposed)return null;
      const {t}=input;
      if(!Number.isSafeInteger(t)||t<0||(previous&&t<previous.t))return null;
      const running=input.running!==false,moving=input.moving===true,drawable=input.drawable!==false,hidden=!!input.hidden;
      const advancing=running&&moving&&drawable&&!hidden;
      const delta=previous&&previous.advancing&&advancing?t-previous.t:0;
      previous={t,advancing};
      if(delta>=0&&delta<=1000)movingMs+=delta;
      const blocked=!!input.blocked||!!input.reducedMotion;
      if(!drawable||input.ended||input.leaving||blocked)active=null;
      const boundary=Math.floor(movingMs/10000);
      if(boundary>consumed){
        consumed=boundary;
        if(!blocked&&advancing&&!input.ended&&!input.leaving)active={id:`travel-tongue:${boundary}`,start:boundary*10000,startedAt:t-(movingMs-boundary*10000),building:input.building};
      }
      if(!active)return null;
      const elapsedMs=movingMs-active.start;
      if(elapsedMs>=1400){active=null;return null;}
      let phaseElapsed=elapsedMs;
      for(const [phase,duration] of PHASES){
        if(phaseElapsed<duration){const frame={id:active.id,startedAt:active.startedAt,elapsedMs,building:active.building,phase,phaseProgress:phaseElapsed/duration,jewelVisible:['extend','hold','retract'].includes(phase)};return out?Object.assign(out,frame):frame;}
        phaseElapsed-=duration;
      }
      return null;
    },
    reset(){previous=null;movingMs=0;consumed=0;active=null;},
    dispose(){disposed=true;active=null;previous=null;},
  };
  return api;
}
