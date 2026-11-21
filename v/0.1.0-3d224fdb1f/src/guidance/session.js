import { matchUnits } from '../rules/v1/index.js';
import { normalizeGuideProgress, claimGroup, updateGroup } from './progress.js';
export function createGuidance({session,progress,onProgress=()=>{},claimBrightness=null,onChange=()=>{},onComplete=()=>{},canResume=()=>globalThis.document?.visibilityState!=='hidden'}) {
  let p=normalizeGuideProgress(progress),draft=null,disposed=false,pending=false,lastPerf=0;
  const id=session.meta.playId,rules=session.rules,checkpoint=(rules.brightnessUnlockBuilding-1)*rules.buildingMs;
  const skippedSteps=new Set();
  const owns=g=>p[g].ownerPlayId===id;
  function arm(){session.setGuideStopAt(!p.brightness.consumed || (owns('brightness')&&!p.brightness.staticDone) ? checkpoint:null);}
  arm();
  function persist(update){p=updateGroup(p,update);Promise.resolve(onProgress(update,p)).catch(()=>{});}
  function claim(){if(disposed||pending||p.brightness.consumed||!session.state.brightnessUnlocked)return;pending=true;
    Promise.resolve(claimBrightness ? claimBrightness() : claimGroup(p,'brightness',id)).then(result=>{
      if(disposed)return;p=normalizeGuideProgress(result.progress);pending=false;arm();
      if(!result.owned && session.pausedReason==='guide' && canResume()){session.setGuideStopAt(null);session.startClock(lastPerf);}onChange();
    }).catch(error=>{if(disposed)return;pending=false;if(error?.code==='stale_writer'){disposed=true;session.setGuideStopAt(null);session.pause('ownership');return;}p=claimGroup(p,'brightness',id).progress;arm();onChange();});
  }
  function view(){
    let step=null;const t=session.state.t;
    if(!session.ended){if(owns('basic')&&!p.basic.staticDone&&t===0)step=1;
      else if(owns('basic')&&t>=rules.buildingMs&&t<2*rules.buildingMs)step=2;
      else if(owns('brightness')&&!p.brightness.staticDone&&t===checkpoint)step=3;
      else if(owns('brightness')&&t>=checkpoint+rules.buildingMs&&t<checkpoint+2*rules.buildingMs)step=4;}
    if(skippedSteps.has(step))step=null;
    const stationary=step===1||step===3,building=step===1?1:step===2?2:step===3?rules.brightnessUnlockBuilding:step===4?rules.brightnessUnlockBuilding+1:Math.min(rules.buildingCount,Math.floor(t/rules.buildingMs)+1);
    const target=session.game.course.targets[building-1],color=stationary?(draft??session.state.color):session.state.color;
    const units=matchUnits(color,target,rules);
    if(step){const group=step<3?'basic':'brightness',mask=step%2?1:2;if(!(p[group].shownMask&mask))persist({playId:id,group,shownMask:mask});}
    const centeredBuilding=owns('basic')&&t<rules.buildingMs?1:owns('brightness')&&t>=checkpoint&&t<checkpoint+rules.buildingMs?rules.brightnessUnlockBuilding:null;
    // 見た目だけを中央手前へ。再開時は入口へ戻さず、同じ出口へ滑らかに合流する。
    const base=centeredBuilding===null?0:(centeredBuilding-1)*rules.buildingMs;
    const sceneT=centeredBuilding===null?t:base+rules.buildingMs*.4+(t-base)*.6;
    return {step,stationary,building,sceneT,color:{...color},target,matchUnits:units,canContinue:stationary&&units>95*rules.match.unitsPerPercent,brightnessUnlocked:step>=3||session.state.brightnessUnlocked,pending};
  }
  function finish(perfNow,skip){lastPerf=perfNow;const v=view();if(skip&&v.step&&!v.stationary&&!disposed){skippedSteps.add(v.step);onChange();return true;}if(!v.stationary||(!skip&&!v.canContinue)||disposed)return false;
    const color=v.color,group=v.step===1?'basic':'brightness';persist({playId:id,group,staticDone:true});draft=null;arm();session.startClock(perfNow);session.input(color,perfNow);onChange();return true;}
  const off=session.on(()=>{claim();onChange();});claim();
  return {view,setDraft(color){const v=view();if(!v.stationary)return false;draft={...color,v:v.step===1?rules.valMax:color.v};onChange();return true;},continue(perfNow){return finish(perfNow,false);},skip(perfNow){return finish(perfNow,true);},tick(perfNow=lastPerf){lastPerf=perfNow;claim();if(view().canContinue&&canResume()&&finish(perfNow,false))onComplete();return view();},get progress(){return p;},dispose(){disposed=true;off();draft=null;session.setGuideStopAt(null);}};
}
