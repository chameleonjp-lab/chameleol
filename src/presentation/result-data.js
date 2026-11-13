import {rankAverage} from '../rules/v1/engine.js';
import {areaOf} from '../rules/v1/course.js';
import {isValidHsv,hsvToHex} from '../rules/v1/color.js';
import {RULES_V1} from '../rules/v1/config.js';
const bound=v=>Number.isSafeInteger(v)?Math.max(0,Math.min(50,v)):0;
/** Copy existing summaries into display data; never recompute scoring. */
export function buildResultData(context){
 const source=context.summary||{},summary={...source,score:{...source.score},perBuilding:Array.isArray(source.perBuilding)?source.perBuilding.slice(0,50).map(t=>Array.isArray(t)?[...t]:null):[]};
 const passed=bound(source.buildings),maxCombo=bound(source.maxCombo),valid=[];
 summary.perBuilding.slice(0,passed).forEach((t,i)=>{if(!Array.isArray(t)||t.length!==3)return;const [matchSum,evalMs,points]=t;
 if(!Number.isSafeInteger(evalMs)||evalMs<=0||evalMs>3000||!Number.isSafeInteger(matchSum)||matchSum<0||matchSum>100*RULES_V1.match.unitsPerPercent*evalMs)return;
 valid.push({building:i+1,matchSum,evalMs,points,rankAverage:rankAverage([{matchSum,evalMs}])});});
 let bestBuilding=null,worstBuilding=null;
 for(const b of valid){const compare=o=>BigInt(b.matchSum)*BigInt(o.evalMs)-BigInt(o.matchSum)*BigInt(b.evalMs);if(!bestBuilding||compare(bestBuilding)>0n)bestBuilding=b;if(!worstBuilding||compare(worstBuilding)<0n)worstBuilding=b;}

 const cleared=source.endReason==='cleared',newBest=context.newBest===true;
 const firstClearNow=cleared&&context.firstClearNow===true;
 const firstClearAt=firstClearNow&&Number.isSafeInteger(context.firstClearAt)&&context.firstClearAt>=0&&context.firstClearAt<=8640000000000000?context.firstClearAt:null;
 const badges=[];if(cleared)badges.push('clear');if(newBest)badges.push('best');if(maxCombo>=3)badges.push(`combo${maxCombo>=10?10:maxCombo>=5?5:3}`);
 const arrival=Number.isFinite(context.arrivedBuilding)?Math.max(1,Math.min(50,context.arrivedBuilding)):Math.min(50,passed+1);
 const districts=[1,20,23,30,40].filter(from=>from<=arrival).map(from=>{const area=areaOf(from),rows=valid.filter(b=>b.building>=area.from&&b.building<=area.to);return {...area,buildings:rows.length,count:rows.length,rankAverage:rankAverage(rows)}});
 const colors=Array.isArray(context.targets)?context.targets.slice(0,50).flatMap((raw,i)=>{const color=Array.isArray(raw)?{h:raw[0],s:raw[1],v:raw[2]}:raw;if(!isValidHsv(color))return [];return [{building:i+1,color:{h:color.h,s:color.s,v:color.v},hex:hsvToHex(color),reached:i+1<=arrival,passed:i<passed}]}):[];
 const previous=context.previous,comparison=previous?{buildings:passed-previous.buildings,rankAverage:source.rankAverage==null||previous.rankAverage==null?null:source.rankAverage-previous.rankAverage,maxCombo:maxCombo-previous.maxCombo}:null;
 return {summary,mapCells:Array.from({length:50},(_,i)=>({building:i+1,passed:i<passed})),bestBuilding,worstBuilding,districts,colors,badges,speechKey:cleared?'resultSpeechClear':newBest?'resultSpeechBest':maxCombo>=10?'resultSpeechCombo':'resultSpeechOther',backgroundId:areaOf(arrival).from,portraitId:cleared?'clear':newBest?'proud':source.endReason==='detected'?'detected':'quit',comparison,maxCombo,gems:Math.min(10,maxCombo),newBest,firstClearNow,firstClearAt,name:context.name||''};
}
