/** Select once after the entire update (including warnings); discarded cues are never queued. */
const PRIORITY = { detected:100, bonusAllSuccess:100, clear:99, guideClear:90, unlock:90, whistle:85, warning:80, bonusMulti:70, bonusMilestone:70, bonusPrecision:60, bonusSteady:60, bonusQuick:60, milestone:50, tierUp:45, combo:40, lastFive:35, comboBreak:30, passBuilding:20, policeSearch:15, relief:15, success:10, switchOk:10 };
export function choosePassCue({ batch=null, cues=[], comboMilestone=null, milestone=null, criticalCue=null }={}) {
  const all=[...cues,...(criticalCue?[typeof criticalCue==='string'?{name:criticalCue}:criticalCue]:[]),...(comboMilestone?[{name:'combo',opts:{level:comboMilestone}}]:[]),...(milestone?[{name:'milestone'}]:[])];
  const candidates=all.filter(c=>c && PRIORITY[c.name] != null).map(c=>({...c}));
  if(batch?.awards?.length){
    const award=batch.awards[0];
    const name=batch.awards.length>1?'bonusMulti':({precision:'bonusPrecision',steady:'bonusSteady',milestone:'bonusMilestone',quick:'bonusQuick'})[award.kind];
    if(name)candidates.push({name,opts:award.kind==='precision'&&batch.awards.length===1?{tier:award.tier}:{}});
  }
  return candidates.reduce((best,c)=>!best||PRIORITY[c.name]>PRIORITY[best.name]?c:best,null);
}
