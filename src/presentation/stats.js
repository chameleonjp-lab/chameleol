/** Bounded, optional device-only presentation statistics. No storage side effects. */
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const epoch=v=>integer(v,8640000000000000);
const empty=()=>({version:1,bestCombo:0,firstClearAt:null,previousResult:null});
function previous(v){
 if(!v||typeof v.playId!=='string'||!v.playId.length||v.playId.length>128||!integer(v.buildings,50)||!(v.rankAverage===null||integer(v.rankAverage,10000))||!integer(v.maxCombo,50)||!epoch(v.endedAt))return null;
 return {playId:v.playId,buildings:v.buildings,rankAverage:v.rankAverage,maxCombo:v.maxCombo,endedAt:v.endedAt};
}
export function sanitizeStats(raw){
 try{if(!raw||raw.version!==1||new TextEncoder().encode(JSON.stringify(raw)).length>2048)return empty();
 return {version:1,bestCombo:integer(raw.bestCombo,50)?raw.bestCombo:0,firstClearAt:epoch(raw.firstClearAt)?raw.firstClearAt:null,previousResult:previous(raw.previousResult)};
 }catch{return empty()}
}
export function mergePresentationStats(raw,ended){
 const next=sanitizeStats(raw),old=next.previousResult,valid=previous(ended);
 const result={next,previous:old?{...old}:null,firstClearNow:false};
 if(!valid||old?.playId===valid.playId||(old&&valid.endedAt<=old.endedAt))return result;
 next.bestCombo=Math.max(next.bestCombo,valid.maxCombo);
 result.firstClearNow=ended.cleared===true&&next.firstClearAt===null;
 if(result.firstClearNow)next.firstClearAt=valid.endedAt;
 next.previousResult=valid;return result;
}
