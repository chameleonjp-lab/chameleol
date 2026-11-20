import { resolveCardRules, copyVisualColor, freezeProjection } from './result-card-data.js';

export function buildResultMiniatureModel({displaySummary,arrivedBuilding,targets,evidence} = {}) {
  const rules=resolveCardRules(displaySummary);
  if (!rules || !Number.isInteger(arrivedBuilding) || arrivedBuilding!==Math.min(rules.buildingCount,displaySummary.buildings+1)) {
    return freezeProjection({available:false,reason:'invalid_progress',cells:[]});
  }
  const passed=displaySummary.buildings;
  const data=evidence?.status==='ready'?evidence.data:null;
  const cells=Array.from({length:rules.buildingCount},(_,i)=>{
    const building=i+1;
    const state=building<=passed?'passed':building===arrivedBuilding?'arrived':'unreached';
    const sample=state==='passed'?data?.visualSamples?.find(x=>x.building===building):null;
    const final=state==='arrived' && data?.finalColors?.available && data.finalColors.building===building?data.finalColors.bodyHsv:null;
    return {building,state,wallHsv:copyVisualColor(targets?.[i]),bodyHsv:copyVisualColor(sample?.hsv??final)};
  });
  return freezeProjection({available:true,reason:null,cells});
}
