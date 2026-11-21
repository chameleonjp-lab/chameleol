import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTimeAttackCourse, familyColors, createTimeAttackState,applyTimeAttackEvent,replayTimeAttack,
  centiseconds,titleForTime,TITLE_NAMES_JA,TITLE_LIMITS_CS,colorMatch,brightnessMatch,HISTORY_FORMAT,
  MODE_ID,RULES_VERSION,COURSE_VERSION,MOVE_MS} from '../../src/rules/time-attack/v1/index.js';
const game=generateTimeAttackCourse(12345);
function run(seed=12345){
 const course=generateTimeAttackCourse(seed);
 let state=createTimeAttackState(course),t=0;const events=[];
 function send(kind,data={}){
  const e={seq:events.length,t,kind,...data};
  state=applyTimeAttackEvent(state,e,course); events.push(e);
 }
 send('ready',{building:1});
 for(let b=1;b<=30;b++){
  const c=course.targets[b-1];
  send('input',c);
  t+=500;
  state=applyTimeAttackEvent(state,{kind:'tick',t},course);
  assert.equal(state.clearedCount,b);
  if(b<30){send('travel',{fromBuilding:b});t+=2000;state=applyTimeAttackEvent(state,{kind:'tick',t},course);
   assert.equal(state.phase,'await_ready');send('ready',{building:b+1});}
 }
 assert.equal(state.phase,'cleared');
 const end={seq:events.length,t,kind:'end',reason:'cleared',elapsedMs:state.elapsedMs,elapsedCs:centiseconds(state.elapsedMs)};
 state=applyTimeAttackEvent(state,end,course);
 return {course,events,end,state,payload:{format:HISTORY_FORMAT,modeId:MODE_ID,rulesVersion:RULES_VERSION,
   generatorVersion:COURSE_VERSION,seed,family:course.family,events,end}};
}
test('30 buildings and 29 transitions replay without implicit advancement',()=>{
 for(const seed of [0,1,12345,4294967295]){
  const r=run(seed),summary=replayTimeAttack(r.payload);
  assert.equal(summary.elapsedMs,15000);
  assert.equal(summary.elapsedCs,1500);
  assert.equal(r.end.t,15000+MOVE_MS*29);
  assert.equal(summary.buildings,30);
  assert.equal(summary.titleId,'ta.title.01');
 }
});
test('families have exactly 651 distinct HSV candidates',()=>{
 for(const x of ['red','green','blue']) {
  const colors=familyColors(x);
  assert.equal(colors.length,651);
  assert.equal(new Set(colors.map(c=>c.h+':'+c.s)).size,651);
 }
 for(let seed=0;seed<30;seed++){
  const course=generateTimeAttackCourse(seed);
  assert.equal(course.targets.length,30);
  for(let b=1;b<=30;b++){
   const c=course.targets[b-1];
   if(b<=14)assert.equal(c.v,10000);
   if(b>=15)assert.ok(Math.abs(c.v-course.targets[b-2].v)>=1000);
   if(b>1)assert.ok(colorMatch(c,course.targets[b-2])<90000000);
  }
 }
});
test('threshold is inclusive, hold resets and pause cannot carry 499ms',()=>{
 const c=generateTimeAttackCourse(101);
 let s=createTimeAttackState(c);
 s=applyTimeAttackEvent(s,{kind:'ready',t:0,building:1},c);
 s=applyTimeAttackEvent(s,{kind:'input',t:0,...c.targets[0]},c);
 s=applyTimeAttackEvent(s,{kind:'tick',t:499},c);
 assert.equal(s.phase,'active');assert.equal(s.holdMs,499);
 s=applyTimeAttackEvent(s,{kind:'pause',t:499},c);
 assert.equal(s.holdMs,0);
 s=applyTimeAttackEvent(s,{kind:'resume',t:499},c);
 s=applyTimeAttackEvent(s,{kind:'tick',t:500},c);
 assert.equal(s.phase,'active');
 s=applyTimeAttackEvent(s,{kind:'input',t:500,h:0,s:0,v:10000},c);
 assert.equal(s.holdMs,0);
 s=applyTimeAttackEvent(s,{kind:'input',t:500,...c.targets[0]},c);
 s=applyTimeAttackEvent(s,{kind:'tick',t:999},c);
 assert.equal(s.phase,'active');
 s=applyTimeAttackEvent(s,{kind:'tick',t:1000},c);
 assert.equal(s.phase,'await_travel');
});
test('2000ms travel and 15th brightness requirement',()=>{
 const c=game;
 let s=createTimeAttackState(c);
 s=applyTimeAttackEvent(s,{kind:'ready',t:0,building:1},c);
 s=applyTimeAttackEvent(s,{kind:'input',t:0,...c.targets[0]},c);
 s=applyTimeAttackEvent(s,{kind:'tick',t:500},c);
 s=applyTimeAttackEvent(s,{kind:'travel',t:500,fromBuilding:1},c);
 s=applyTimeAttackEvent(s,{kind:'tick',t:2499},c);
 assert.equal(s.phase,'travel');
 assert.throws(()=>applyTimeAttackEvent(s,{kind:'ready',t:2499,building:2},c));
 s=applyTimeAttackEvent(s,{kind:'tick',t:2500},c);
 assert.equal(s.phase,'await_ready');
 s=applyTimeAttackEvent(s,{kind:'ready',t:2500,building:2},c);
 assert.equal(s.elapsedMs,500);
 assert.equal(s.building,2);
 assert.ok(brightnessMatch({...c.targets[14],v:10000},c.targets[14])<95000000||c.targets[14].v>=9500);
});
test('replay rejects fabricated finish, reordered inputs and mismatched score',()=>{
 const r=run();
 assert.throws(()=>replayTimeAttack({...r.payload,events:r.events.slice(0,3)}));
 assert.throws(()=>replayTimeAttack({...r.payload,end:{...r.end,elapsedMs:14999}}));
 assert.throws(()=>replayTimeAttack({...r.payload,events:r.events.map((x,i)=>i===3?{...x,seq:999}:x)}));
 assert.throws(()=>replayTimeAttack({...r.payload,family:'red'===r.course.family?'blue':'red'}));
});
test('58 titles cover all 1500..60000 centiseconds with exact boundaries',()=>{
 assert.equal(TITLE_NAMES_JA.length,58);assert.equal(TITLE_LIMITS_CS.length,58);
 const counts=Array(58).fill(0);
 for(let cs=1500;cs<=60000;cs++){
  const id=titleForTime(cs);
  assert.ok(id);counts[Number(id.slice(-2))-1]++;
 }
 assert.ok(counts.every(x=>x>0));
 assert.equal(titleForTime(3500),'ta.title.01');
 assert.equal(titleForTime(3501),'ta.title.02');
 assert.equal(titleForTime(59500),'ta.title.57');
 assert.equal(titleForTime(59501),'ta.title.58');
 assert.equal(titleForTime(60001),null);
 assert.equal(centiseconds(35001),3501);
 assert.equal(centiseconds(600001),60001);
});
