import {createTravelTongueMotion} from '../scene/travel-tongue-motion.js';
import {createCameoReservations} from './cameo-reservations.js';
import {createPrecisionBadge} from './precision-badge.js';
import {createPoliceExtras} from './police-extras.js';
import {freezeProjection} from './result-card-data.js';

export function createGameExtrasController({playId,rules,extrasPort,seed=1}={}) {
  const tongue=createTravelTongueMotion();
  const initial=extrasPort?.fresh?(extrasPort.initialState??{count:0,lastStartedAt:null,rngState:seed>>>0,reservedMidpoint:true,midpointUsed:false}):extrasPort?.restored;
  const cameos=createCameoReservations({playId,restore:extrasPort?.disabled?null:initial,claimStart:s=>extrasPort?.claimCameoStart(s)??false});
  const badge=createPrecisionBadge({claim:()=>extrasPort?.claimPrecisionBadge()??false});
  const police=createPoliceExtras({fresh:extrasPort?.fresh===true});
  let disposed=false,ended=false,lastT=0,quiet=false,travelTongue=null,policeExtra=null;
  const snapshot=()=>freezeProjection({travelTongue:disposed?null:travelTongue,cameo:disposed?null:cameos.snapshot(),policeExtra:disposed?null:policeExtra,precisionBadge:disposed||quiet?null:badge.snapshot(lastT)});
  return {
    step(input){
      if(disposed)return snapshot();
      if(!Number.isSafeInteger(input.t)||input.t<lastT)return snapshot();
      lastT=input.t;
      const guideActive=!!input.guideActive,warningActive=!!input.warningActive;
      const blocked=guideActive||warningActive||!!input.actorBusy?.hero||input.policeStage>=2;
      quiet=guideActive||warningActive;
      travelTongue=tongue.sample({...input,blocked,ended});
      const canStart=!ended&&input.running!==false&&!input.hidden&&input.drawable!==false&&!blocked;
      cameos.tick({...input,canStart,blocked:ended||guideActive||warningActive||input.policeStage>=2});
      policeExtra=ended?null:police.step({...input,guideActive,warningActive});
      for(const segment of input.evaluationSegments??[])if(!ended)void badge.consume(segment);
      return snapshot();
    },
    event(event){
      if(disposed)return;
      if(event?.type==='pass'&&event.building===25)cameos.reserve();
      if(['detected','cleared','quit'].includes(event?.type)){ended=true;travelTongue=null;policeExtra=null;cameos.cancel();badge.dispose();}
    },
    snapshot,
    dispose(){if(disposed)return;disposed=true;tongue.dispose();cameos.dispose();badge.dispose();police.dispose();travelTongue=null;policeExtra=null;},
  };
}
