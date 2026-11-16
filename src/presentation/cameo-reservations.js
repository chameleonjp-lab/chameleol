import { normalizeDirectorState } from '../storage/presentation-extras.js';
import { EXTENDED_CAMEOS, selectExtendedCameo } from './catalog.js';

// All old and new background stories share this budget and persisted random stream.
export function createCameoReservations({playId,restore=null,claimStart=async()=>false}={}) {
  let state=normalizeDirectorState(restore),disabled=!state,disposed=false,pending=null,active=null;
  let currentT=0,previous=null,staticFlag=false,midpointReached=false;
  const snapshot=()=>{
    if(disposed)return null;
    if(active && currentT>=active.startedAt+active.durationMs){if(active.id===56)staticFlag=true;active=null;}
    if(active)return {...active,elapsedMs:Math.max(0,currentT-active.startedAt)};
    return staticFlag?{id:56,startedAt:125000,elapsedMs:0,phase:'static',building:25,durationMs:0}:null;
  };
  const api={
    reserve(){midpointReached=true;},
    async start({id,t,building}={}){
      if(disposed||disabled||pending||!state||!Number.isSafeInteger(t)||t<currentT||!Number.isInteger(building)||building<1||building>50)return false;
      currentT=t;snapshot();
      const midpoint=id===56,row=midpoint?{id:56,ms:1500}:EXTENDED_CAMEOS.find(x=>x.id===id);
      if(!row||active||state.count>=6||(state.lastStartedAt!==null&&t-state.lastStartedAt<15000))return false;
      if(midpoint){if(state.midpointUsed||!state.reservedMidpoint||t<125000||t>=126500)return false;}
      else if((state.reservedMidpoint&&state.count>=5)||(t>=110000&&t<126500))return false;
      const next={...state,count:state.count+1,lastStartedAt:t,reservedMidpoint:midpoint?false:state.reservedMidpoint,midpointUsed:midpoint?true:state.midpointUsed};
      // Count the claim immediately. A delayed/failed claim cannot create a second reservation.
      state=next;
      const request={id,cancelled:false};pending=request;
      let ok=false;try{ok=await claimStart({...next});}catch{/* optional display only */}
      if(pending===request)pending=null;
      if(disposed)return false;
      if(ok!==true){disabled=true;return false;}
      if(request.cancelled||currentT>=t+row.ms||(midpoint&&currentT>=126500)){if(midpoint)staticFlag=true;return true;}
      active={id,startedAt:t,elapsedMs:0,durationMs:row.ms,building:midpoint?25:building,phase:midpoint?'delivery':'story'};
      return true;
    },
    tick({t,building,phase='eval',canStart=false,blocked=false,placements={}}={}){
      if(disposed||!Number.isSafeInteger(t)||t<currentT)return snapshot();
      currentT=t;
      midpointReached ||= t>=125000 && building>=26;
      if(midpointReached && state?.midpointUsed && !active && !pending)staticFlag=true;
      if(t>=126500 && midpointReached){
        if(!state?.midpointUsed || pending?.id===56)staticFlag=true;
        if(state?.reservedMidpoint)state={...state,reservedMidpoint:false};
      }
      if(blocked)api.cancel();
      snapshot();
      const opportunity=phase==='grace'&&(previous?.phase!=='grace'||previous?.building!==building);
      previous={phase,building};
      if(!disabled && state && canStart && !blocked && !pending && !active){
        if(midpointReached&&state.reservedMidpoint&&t>=125000&&t<126500&&placements.midpoint===true){void api.start({id:56,t,building});}
        else if(opportunity && !(t>=110000&&t<126500)){
          const rngState=(Math.imul(state.rngState,1664525)+1013904223)>>>0;
          state={...state,rngState};
          const pick=selectExtendedCameo(rngState/4294967296,{building,placements});
          if(pick)void api.start({id:pick.id,t,building});
        }
      }
      return snapshot();
    },
    cancel(){active=null;if(pending)pending.cancelled=true;},
    snapshot,
    stats:()=>({...state,playId,disabled,pending:!!pending}),
    dispose(){disposed=true;active=null;staticFlag=false;if(pending)pending.cancelled=true;},
  };
  return api;
}
