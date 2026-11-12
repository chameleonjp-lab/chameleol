import {RULES_V1,createGame,matchUnits} from '../rules/v1/index.js';
export function createGuidePractice({step=1,seed=1,rules=RULES_V1}={}) {
  if(![1,2,3,4].includes(step))throw new TypeError('invalid_guide_step');
  const game=createGame({seed,rules}),stationary=step%2===1,building=step<3?step:rules.brightnessUnlockBuilding+step-3,target=game.course.targets[building-1];
  let color={...rules.initialColor},elapsed=0,complete=false,disposed=false;
  function view(){const units=matchUnits(color,target,rules);return {step,stationary,building,target,color:{...color},matchUnits:units,canContinue:stationary&&units>95*rules.match.unitsPerPercent,brightnessUnlocked:step>=3,elapsed,complete};}
  const setColor=c=>{if(!disposed&&!complete){color={...c,v:step<3?rules.valMax:c.v};if(view().canContinue)complete=true;}};
  function reset(){if(disposed)return;color={...rules.initialColor};elapsed=0;complete=false;}
  return {view,setDraft:setColor,setColor,tick(dt){if(!disposed&&!stationary&&!complete&&Number.isFinite(dt)&&dt>=0&&dt<=rules.buildingMs){elapsed=Math.min(rules.buildingMs,elapsed+dt);complete=elapsed===rules.buildingMs;}return view();},continue(){if(view().canContinue)complete=true;return complete;},skip(){complete=true;},reset,restart:reset,dispose(){disposed=true;}};
}
