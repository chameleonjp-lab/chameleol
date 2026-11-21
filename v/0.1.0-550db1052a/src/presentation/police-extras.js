// Cosmetic investigation opportunities. Does not update police stage or existing prop alternation.
export function createPoliceExtras({fresh=true}={}) {
  let disposed=false,used=0,previous=null,active=null;
  return {
    step(view){
      if(disposed||!fresh)return null;
      const opportunity=view.phase==='grace'&&(previous?.phase!=='grace'||previous?.building!==view.building);
      previous={phase:view.phase,building:view.building};
      const blocked=view.policeStage!==1||view.guideActive||view.warningActive||view.actorBusy?.police||!view.placements?.policeSettled;
      if(blocked||view.ended){active=null;return null;}
      if(active){if(view.running!==false)active.elapsedMs=Math.max(active.elapsedMs,view.t-active.startedAt);if(active.elapsedMs>=active.durationMs)active=null;}
      if(!active&&used<2&&opportunity&&view.running!==false&&!view.hidden){
        const kind=used===0?'inquiry':'footprints',durationMs=used===0?1200:1500;
        active={id:used===0?34:39,kind,startedAt:view.t,elapsedMs:0,durationMs,building:view.building,phase:'investigate'};used++;
      }
      return active?{...active}:null;
    },
    dispose(){disposed=true;active=null;},
  };
}
