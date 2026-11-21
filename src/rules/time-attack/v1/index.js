// 同系色タイムアタックの判定規則。通常の50棟判定エンジンと分離する。
// 経過時刻は操作可能時間と2秒の移動を含む整数ミリ秒。停止時間は含めない。
import { matchUnits } from '../../v1/color.js';
export const MODE_ID = 'chameleol_time_attack';
export const RULES_VERSION = 'kamereoru-time-attack-rules-v1';
export const COURSE_VERSION = 'kamereoru-time-attack-course-v1';
export const HISTORY_FORMAT = 'kamereoru-time-attack-history-v1';
export const RESULT_FORMAT = 'kamereoru-time-attack-result-v1';
export const BUILDINGS = 30, HOLD_MS = 500, MOVE_MS = 2000, MIN_RAW_MS = 15000;
export const MATCH_MIN = 95000000;
const NEXT_MAX_EXCLUSIVE = 90000000;
const MS_MAX = Number.MAX_SAFE_INTEGER - MOVE_MS * (BUILDINGS - 1);
const FAMILIES = Object.freeze(['red','green','blue']);
export const TITLE_NAMES_JA = Object.freeze([
  '神速のカメレオン','閃光の怪盗','一瞬の怪盗','疾風の怪盗','幻の擬態師','無音の怪盗',
  '月下の怪盗','屋根の怪盗','擬態の名人','変色の名人','色合わせの名人','明暗の名人',
  '濃淡の名人','影渡りの達人','屋根渡りの達人','路地抜けの達人','宝石の目利き',
  '宝石の隠し役','宝石の運び手','金庫の鍵番','色合わせ職人','明暗合わせ職人',
  '色見本の職人','壁色の職人','石畳の職人','看板色の職人','屋根色の職人',
  '窓辺の見張り','路地の見張り','街角の見張り','夜道の案内役','屋根の案内役',
  '路地の案内役','街角の案内役','夜道の調べ役','路地の調べ役','壁色の調べ役',
  '窓明かりの観察役','街灯の観察役','月影の観察役','壁色の見習い',
  '看板色の見習い','屋根歩きの見習い','路地歩きの見習い','擬態の練習生',
  '明暗の練習生','変色の練習生','色探しの練習生','屋根の探検家',
  '路地の探検家','街角の探検家','石畳の歩き手','屋根下の歩き手',
  '路地の歩き手','月夜の散歩者','街灯の散歩者','街角の散歩者','街めぐりカメレオン'
]);
export const TITLE_LIMITS_CS = Object.freeze(Array.from({length:58},(_,i)=>i===0?3500:i===57?60000:3500+1000*i));
export function titleForTime(cs) {
  if (!Number.isSafeInteger(cs) || cs<1500 || cs>60000) return null;
  const idx=TITLE_LIMITS_CS.findIndex(n=>cs<=n);
  return 'ta.title.'+String(idx+1).padStart(2,'0');
}
export function titleNameJa(cs) {
  const key=titleForTime(cs);
  return key===null?'30棟完走':TITLE_NAMES_JA[Number(key.slice(-2))-1];
}
export function centiseconds(ms) {
  if (!Number.isSafeInteger(ms) || ms<0 || ms>MS_MAX) throw Error('invalid_elapsed_ms');
  return Math.ceil(ms/10);
}
export function formatTime(cs) {
  if (!Number.isSafeInteger(cs) || cs<0) return '—';
  const minute=Math.floor(cs/6000);
  const seconds=Math.floor(cs%6000/100);
  const fraction=String(cs%100).padStart(2,'0');
  return String(minute).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+'.'+fraction;
}
export function formatTimeJa(cs) {
  if (!Number.isSafeInteger(cs) || cs<0) return '—';
  return Math.floor(cs/6000)+'分'+Math.floor(cs%6000/100)+'秒'+String(cs%100).padStart(2,'0');
}
export function isHsv(color) {
  return !!color && Number.isInteger(color.h)&&color.h>=0&&color.h<36000 &&
    Number.isInteger(color.s)&&color.s>=0&&color.s<=10000 &&
    Number.isInteger(color.v)&&color.v>=0&&color.v<=10000;
}
export function colorMatch(a,b) {
  return matchUnits({...a,v:10000},{...b,v:10000});
}
export function brightnessMatch(a,b) {
  return 100000000-Math.abs(a.v-b.v)*10000;
}
export function familyColors(family) {
  const center={red:0,green:12000,blue:24000}[family];
  if (center===undefined) throw Error('bad_family');
  const colors=[];
  for(let offset=-1500;offset<=1500;offset+=100)
    for(let s=5000;s<=10000;s+=250)
      colors.push({h:(center+offset+36000)%36000,s,v:10000});
  return colors;
}
function randomStream(seed) {
  if (!Number.isSafeInteger(seed)||seed<0||seed>4294967295) throw Error('bad_seed');
  let x=seed>>>0;
  if(x===0)x=0x9e3779b9;
  const u32=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;};
  return n=>{
    if(!Number.isSafeInteger(n)||n<=0||n>4294967296)throw Error('bad_draw');
    const limit=Math.floor(4294967296/n)*n;
    let v;
    do{v=u32();}while(v>=limit);
    return v%n;
  };
}
export function generateTimeAttackCourse(seed) {
  const choose=randomStream(seed);
  const family=FAMILIES[choose(3)];
  const all=familyColors(family);
  const targets=[];
  const vals=Array.from({length:21},(_,i)=>5000+i*250);
  for(let b=1;b<=BUILDINGS;b++){
    const prev=targets[b-2];
    const eligible=b===1?all:all.filter(c=>colorMatch(c,prev)<NEXT_MAX_EXCLUSIVE);
    if(!eligible.length)throw Error('no_next_color');
    const color=eligible[choose(eligible.length)];
    let v=10000;
    if(b>=15){
      const pv=prev?.v??10000;
      const possible=vals.filter(x=>Math.abs(x-pv)>=1000);
      if(!possible.length)throw Error('no_next_brightness');
      v=possible[choose(possible.length)];
    }
    targets.push({...color,v});
  }
  return Object.freeze({seed,family,targets:Object.freeze(targets.map(c=>Object.freeze(c)))});
}
const copy=s=>({...s,color:{...s.color}});
function good(s,course){
  const target=course.targets[s.building-1];
  return colorMatch(s.color,target)>=MATCH_MIN &&
    (s.building<15 || brightnessMatch(s.color,target)>=MATCH_MIN);
}
export function createTimeAttackState(course) {
  if(!course||!FAMILIES.includes(course.family)||course.targets?.length!==BUILDINGS)throw Error('invalid_course');
  return {phase:'prepared',savedPhase:null,t:0,elapsedMs:0,travelElapsedMs:0,
    building:1,clearedCount:0,moveCount:0,holdMs:0,color:{h:0,s:0,v:10000},ended:false,
    family:course.family};
}
function advanceTime(s,target,course,allowClamp) {
  if(!Number.isSafeInteger(target)||target<s.t || target>Number.MAX_SAFE_INTEGER)throw Error('invalid_time');
  if(!['active','travel'].includes(s.phase)){
    if(target!==s.t)throw Error('time_during_gate');
    return s;
  }
  let dt=target-s.t;
  if(s.phase==='active'){
    const passing=good(s,course);
    if(passing && s.holdMs+dt>=HOLD_MS) {
      const allowed=HOLD_MS-s.holdMs;
      if(allowed<dt&&!allowClamp)throw Error('event_crossed_building_boundary');
      dt=allowed;
      s.t+=dt;s.elapsedMs+=dt;s.holdMs=HOLD_MS;
      s.clearedCount=s.building;
      s.phase=s.building===BUILDINGS?'cleared':'await_travel';
      return s;
    }
    s.t+=dt;s.elapsedMs+=dt;s.holdMs=passing?s.holdMs+dt:0;
  } else {
    const allowed=MOVE_MS-s.travelElapsedMs;
    if(dt>allowed&&!allowClamp)throw Error('event_crossed_move_boundary');
    dt=Math.min(dt,allowed);
    s.t+=dt;s.travelElapsedMs+=dt;
    if(s.travelElapsedMs===MOVE_MS)s.phase='await_ready';
  }
  if(s.elapsedMs>MS_MAX)throw Error('elapsed_overflow');
  return s;
}
export function applyTimeAttackEvent(state,event,course) {
  if(state.ended)throw Error('already_ended');
  if(!event||typeof event.kind!=='string')throw Error('bad_event');
  const s=copy(state);
  if(event.kind==='tick'){
    if(s.phase==='paused')return s;
    return advanceTime(s,event.t,course,true);
  }
  // pause中は物理時刻が進んでも履歴時刻を進めない
  if(s.phase==='paused'){
    if(event.t!==s.t)throw Error('paused_time_advanced');
    if(event.kind==='resume'){s.phase=s.savedPhase;s.savedPhase=null;s.holdMs=0;return s;}
    if(event.kind==='end'&&event.reason==='quit'){s.phase='quit';s.ended=true;return s;}
    throw Error('invalid_paused_event');
  }
  advanceTime(s,event.t,course,false);
  if(event.kind==='ready'){
    if(s.phase!=='prepared' && s.phase!=='await_ready')throw Error('invalid_ready_phase');
    if(s.phase==='prepared' && (event.t!==0||event.building!==1))throw Error('invalid_initial_ready');
    if(s.phase==='await_ready' && (s.travelElapsedMs!==MOVE_MS||event.building!==s.building+1))throw Error('invalid_ready_building');
    if(s.phase==='await_ready'){s.building+=1;s.travelElapsedMs=0;}
    s.phase='active';s.holdMs=0;return s;
  }
  if(event.kind==='input'){
    if(s.phase!=='active')throw Error('invalid_input_phase');
    const c={h:event.h,s:event.s,v:event.v};
    if(!isHsv(c)||(s.building<15&&c.v!==10000))throw Error('invalid_color');
    s.color=c;
    if(!good(s,course))s.holdMs=0;
    return s;
  }
  if(event.kind==='travel'){
    if(s.phase!=='await_travel'||event.fromBuilding!==s.building)throw Error('invalid_travel');
    s.moveCount+=1;s.travelElapsedMs=0;s.phase='travel';return s;
  }
  if(event.kind==='pause'){
    if(!['active','await_travel','travel','await_ready'].includes(s.phase))throw Error('invalid_pause');
    s.savedPhase=s.phase;s.phase='paused';s.holdMs=0;return s;
  }
  if(event.kind==='end'){
    if(event.reason==='cleared'){
      if(s.phase!=='cleared'||s.clearedCount!==BUILDINGS||s.moveCount!==BUILDINGS-1||
        s.elapsedMs<MIN_RAW_MS||s.t!==s.elapsedMs+(BUILDINGS-1)*MOVE_MS)throw Error('invalid_clear');
    } else if(event.reason==='quit'){
      if(s.phase==='cleared')throw Error('cannot_quit_after_clear');
    } else throw Error('invalid_end_reason');
    s.phase=event.reason;s.ended=true;return s;
  }
  throw Error('unknown_event');
}
export function publicView(state,course){
  const visible=state.phase==='active';
  const target=course.targets[state.building-1];
  return {modeId:MODE_ID,phase:state.phase,building:state.building,
    clearedCount:state.clearedCount,elapsedMs:state.elapsedMs,holdMs:state.holdMs,
    colorMatchUnits:visible?colorMatch(state.color,target):null,
    brightnessMatchUnits:visible&&state.building>=15?brightnessMatch(state.color,target):null,
    brightnessEnabled:state.building>=15,
    currentColor:{...state.color},targetColor:visible?{...target}:null,
    travelElapsedMs:state.travelElapsedMs,
    scenePosition:state.building-1+((state.phase==='travel'||(state.phase==='paused'&&state.savedPhase==='travel'))?state.travelElapsedMs/MOVE_MS:0)
  };
}
export function replayTimeAttack(payload) {
  if(!payload||payload.format!==HISTORY_FORMAT||payload.modeId!==MODE_ID||
    payload.rulesVersion!==RULES_VERSION||payload.generatorVersion!==COURSE_VERSION||
    !Array.isArray(payload.events)||payload.events.length>200000)throw Error('invalid_history');
  const course=generateTimeAttackCourse(payload.seed);
  if(payload.family!==course.family)throw Error('family_mismatch');
  let state=createTimeAttackState(course);
  const all=[...payload.events,payload.end];
  for(let i=0;i<all.length;i++){
    const event=all[i];
    if(!event||event.seq!==i||!Number.isSafeInteger(event.t))throw Error('invalid_sequence');
    if(i===all.length-1 && event.kind!=='end')throw Error('missing_end');
    if(i<all.length-1 && (event.kind==='end'||event.kind==='tick'))throw Error('unexpected_event');
    state=applyTimeAttackEvent(state,event,course);
  }
  if(!state.ended||payload.end?.reason!==state.phase)throw Error('missing_finish');
  if(payload.end?.elapsedMs!==state.elapsedMs)throw Error('elapsed_mismatch');
  if(payload.end?.elapsedCs!==centiseconds(state.elapsedMs))throw Error('score_mismatch');
  return {modeId:MODE_ID,rulesVersion:RULES_VERSION,generatorVersion:COURSE_VERSION,
    family:course.family,reason:state.phase,buildings:state.clearedCount,
    elapsedMs:state.elapsedMs,elapsedCs:centiseconds(state.elapsedMs),
    titleId:state.phase==='cleared'?titleForTime(centiseconds(state.elapsedMs)):null};
}
