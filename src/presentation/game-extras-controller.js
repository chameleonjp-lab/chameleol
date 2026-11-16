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
  // The stage supplies observations; keep the legacy background priorities and slow-frame
  // circuit breaker here so extended mode never needs a second visual-side director.
  let currentBuilding=1,gateStart=0,bestDistance=null,bestPassed=false,bestPassedAt=-Infinity;
  let priorityUntil=-Infinity,previousFrame=false,slowFrames=0,backgroundDisabled=false;
  const backgroundPriority=input=>input.t<priorityUntil||input.phase==='ended'||input.policeStage>=2||
    ['danger','success'].includes(input.matchState)||input.lastEvalSuccess===true||input.guideActive===true||input.guidanceActive===true||
    ['ending','danger','success','milestone','guidance'].includes(input.priority)||input.t-gateStart<800||bestPassed&&input.t-bestPassedAt<600;
  const snapshot=()=>freezeProjection({travelTongue:disposed?null:travelTongue,cameo:disposed?null:cameos.snapshot(),policeExtra:disposed?null:policeExtra,precisionBadge:disposed||quiet?null:badge.snapshot(lastT)});
  return {
    step(input){
      if(disposed)return snapshot();
      if(!Number.isSafeInteger(input.t)||input.t<lastT)return snapshot();
      lastT=input.t;
      const running=input.running!==false&&!input.hidden;
      const interval=running&&previousFrame&&Number.isFinite(input.frameIntervalMs)&&input.frameIntervalMs>=0?input.frameIntervalMs:0;
      slowFrames=interval>50&&interval<1000?slowFrames+1:0;
      if(slowFrames>=30)backgroundDisabled=true;
      previousFrame=running;
      const nextBest=Number.isInteger(input.bestDistance)&&input.bestDistance>=0&&input.bestDistance<=50?input.bestDistance:null;
      if(nextBest!==bestDistance){bestDistance=nextBest;bestPassed=false;bestPassedAt=-Infinity;}
      if(running){
        if(input.building!==currentBuilding){currentBuilding=input.building;if([1,20,23,30,40].includes(currentBuilding))gateStart=input.t;}
        // Suppress before claiming a start: the old view started and immediately hid it
        // on this crossing frame, consuming a story that was never visible.
        if(bestDistance!==null&&!bestPassed&&(input.passed??0)>bestDistance){bestPassed=true;bestPassedAt=input.t;}
      }else if(Number.isInteger(input.building))currentBuilding=input.building;
      const guideActive=!!input.guideActive,warningActive=!!input.warningActive;
      const blocked=guideActive||warningActive||!!input.actorBusy?.hero||input.policeStage>=2;
      quiet=guideActive||warningActive;
      travelTongue=tongue.sample({...input,blocked,ended});
      const priority=backgroundPriority(input);
      const canStart=!ended&&running&&input.drawable!==false&&!blocked&&!priority&&!backgroundDisabled;
      cameos.tick({...input,canStart,blocked:ended||guideActive||warningActive||input.policeStage>=2||priority});
      policeExtra=ended?null:police.step({...input,guideActive,warningActive});
      for(const segment of input.evaluationSegments??[])if(!ended)void badge.consume(segment);
      return snapshot();
    },
    event(event){
      if(disposed)return;
      if(['instantSuccess','unlockBrightness','enterBuilding'].includes(event?.type)){
        const duration=event.type==='instantSuccess'?450:event.type==='unlockBrightness'?600:event.building>=46?800:0;
        priorityUntil=Math.max(priorityUntil,(Number.isFinite(event.t)?event.t:lastT)+duration);
        if(duration)cameos.cancel();
      }
      if(event?.type==='pass'&&event.building===25)cameos.reserve();
      if(['detected','cleared','quit'].includes(event?.type)){ended=true;travelTongue=null;policeExtra=null;cameos.cancel();badge.dispose();}
    },
    snapshot,
    dispose(){if(disposed)return;disposed=true;tongue.dispose();cameos.dispose();badge.dispose();police.dispose();travelTongue=null;policeExtra=null;},
  };
}
