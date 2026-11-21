import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {generateTimeAttackCourse, familyColors, createTimeAttackState,applyTimeAttackEvent,replayTimeAttack,
  centiseconds,titleForTime,TITLE_NAMES_JA,TITLE_LIMITS_CS,colorMatch,brightnessMatch,HISTORY_FORMAT,
  MODE_ID,RULES_VERSION,CURRENT_RULES_VERSION,COURSE_VERSION,MOVE_MS,publicView,timeAttackFamilyForSeed,TIME_ATTACK_TITLES,
  isTimeAttackCentiseconds,formatTime,
  InvalidTimeAttackHistoryError} from '../../src/rules/time-attack/v1/index.js';
import { ciede2000, deltaEToMatchUnits, hsvToLab } from '../../src/rules/v1/color.js';
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
 let elapsed=2500;
 for(let building=2;building<15;building++) {
  s=applyTimeAttackEvent(s,{kind:'input',t:elapsed,...c.targets[building-1]},c);
  s=applyTimeAttackEvent(s,{kind:'travel',t:elapsed+500,fromBuilding:building},c);
  elapsed+=2500;
  s=applyTimeAttackEvent(s,{kind:'ready',t:elapsed,building:building+1},c);
 }
 assert.equal(s.building,15);
 const target=c.targets[14];
 assert.equal(publicView(s,c).brightnessEnabled,true);
 assert.ok(brightnessMatch({...target,v:10000},target)<95000000);
 s=applyTimeAttackEvent(s,{kind:'input',t:elapsed,...target,v:target.v+501},c);
 s=applyTimeAttackEvent(s,{kind:'tick',t:elapsed+500},c);
 assert.equal(s.clearedCount,14);
 assert.equal(s.holdMs,0);
 s=applyTimeAttackEvent(s,{kind:'input',t:elapsed+500,...target,v:target.v+500},c);
 assert.equal(publicView(s,c).brightnessMatchUnits,95000000);
 s=applyTimeAttackEvent(s,{kind:'tick',t:elapsed+999},c);
 assert.equal(s.clearedCount,14);
 s=applyTimeAttackEvent(s,{kind:'tick',t:elapsed+1000},c);
 assert.equal(s.clearedCount,15);
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
 for (const {id,minCs,maxCs} of TIME_ATTACK_TITLES) {
  assert.equal(titleForTime(minCs),id);
  assert.equal(titleForTime(maxCs),id);
 }
 assert.equal(formatTime(8345,'ja'),'01:23.45');
 assert.equal(formatTime(8345,'ja',{share:true}),'1分23秒45');
 assert.equal(formatTime(8345,'en',{share:true}),'01:23.45');
 assert.equal(isTimeAttackCentiseconds(900719925468300),true);
 assert.equal(isTimeAttackCentiseconds(900719925468301),false);
});

test('both rule versions preserve the same fixed-seed draws', () => {
  const cases = [
    [0, 'blue', '2d97a424cd591712a03dfcdaf5cef24d1a6c2d383de64dd3dcd68d3c7db56ba7'],
    [1, 'red', '857c2fdf56bf4f08c323ccf971b0fdc720fd97e88a0166c8ecfac9c17cac691a'],
    [999, 'green', 'ba52bdb3fd19596b3945e9112a668b42a7c274dde2a67da01a32e9a3a6f86e2c'],
    [4294967295, 'red', 'b4dddb6231155b3f04aefba96df608ddcf95482ee816b7b4489e1e97d21cb49a'],
  ];
  for (const [seed, family, digest] of cases) {
    assert.equal(timeAttackFamilyForSeed(seed), family);
    for (const version of [RULES_VERSION, CURRENT_RULES_VERSION]) {
      const { rulesVersion, ...course } = generateTimeAttackCourse(seed, version);
      assert.equal(rulesVersion, version);
      assert.equal(course.family, family);
      assert.equal(createHash('sha256').update(JSON.stringify(course)).digest('hex'), digest);
    }
  }
});

test('every color and brightness target leaves a valid next target', () => {
  const expected = [['red', 503], ['green', 101], ['blue', 427]];
  for (const [family, minimum] of expected) {
    const candidates = familyColors(family);
    if (family === 'red') {
      assert.equal(candidates[0].h, 34500);
      assert.equal(candidates[15 * 21].h, 0);
      assert.equal(candidates.at(-1).h, 1500);
    }
    const labs = candidates.map(hsvToLab);
    const counts = labs.map(() => 0);
    for (let a = 0; a < labs.length; a += 1) {
      for (let b = 0; b < labs.length; b += 1) {
        if (deltaEToMatchUnits(ciede2000(labs[a], labs[b])) < 90000000) counts[a] += 1;
      }
    }
    assert.equal(Math.min(...counts), minimum);
  }
  const brightness = Array.from({ length: 21 }, (_, index) => 5000 + index * 250);
  assert.equal(Math.min(...brightness.map(v => brightness.filter(candidate => Math.abs(candidate - v) >= 1000).length)), 14);
});

test('a zero-duration color mismatch resets the prior hold before the next input', () => {
  const target = game.targets[0];
  let state = createTimeAttackState(game);
  const add = (t, kind, fields = {}) => {
    state = applyTimeAttackEvent(state, { t, kind, ...fields }, game);
  };
  add(0, 'ready', { building: 1 });
  add(0, 'input', target);
  add(499, 'input', { h: 0, s: 0, v: 10000 });
  add(499, 'input', target);
  add(500, 'tick');
  assert.equal(state.holdMs, 1);
  add(998, 'tick');
  assert.equal(state.holdMs, 499);
  assert.throws(() => add(999, 'input', target), InvalidTimeAttackHistoryError);
  add(1000, 'tick');
  assert.equal(state.t, 999);
  assert.equal(state.phase, 'await_travel');
});

test('pause hides the target and holds the same travel position through resume', () => {
  let state = createTimeAttackState(game);
  const add = (t, kind, fields = {}) => {
    state = applyTimeAttackEvent(state, { t, kind, ...fields }, game);
  };
  add(0, 'ready', { building: 1 });
  add(0, 'input', game.targets[0]);
  add(500, 'travel', { fromBuilding: 1 });
  add(1000, 'pause');
  const stopped = publicView(state,game);
  assert.equal(stopped.targetColor,null);
  assert.equal(stopped.scenePosition,0.25);
  assert.throws(() => add(1001,'resume'), InvalidTimeAttackHistoryError);
  add(1000,'resume');
  assert.equal(publicView(state,game).scenePosition,0.25);
  add(2501,'tick');
  assert.equal(state.t,2500);
  assert.equal(publicView(state,game).scenePosition,1);
  assert.equal(publicView(state,game).targetColor,null);
  add(2500,'ready',{building:2});
  assert.equal(publicView(state,game).scenePosition,1);
  assert.deepEqual(publicView(state,game).targetColor,game.targets[1]);
});

test('replay enforces the initial ready and the event field contract', () => {
  const { payload, end } = run();
  assert.throws(() => replayTimeAttack({ ...payload, events: [], end: {
    kind: 'end', seq: 0, t: 0, reason: 'quit', elapsedMs: 0, elapsedCs: 0,
  } }),InvalidTimeAttackHistoryError);
  assert.throws(() => replayTimeAttack({ ...payload, events: [
    { ...payload.events[0], metadata: 'unexpected' }, ...payload.events.slice(1),
  ] }),InvalidTimeAttackHistoryError);
  assert.throws(() => replayTimeAttack({ ...payload, end: { ...end, extra: true } }), InvalidTimeAttackHistoryError);
});

test('quit records only actual travel, and a clear over 10 minutes is valid', () => {
  const { payload, end } = run();
  const events = payload.events.slice(0,3);
  const quit = replayTimeAttack({ ...payload,events,end:{kind:'end',seq:3,t:925,
    reason:'quit',elapsedMs:500,elapsedCs:50} });
  assert.equal(quit.moveCount,1);
  assert.equal(quit.executedTravelMs,425);
  assert.equal(quit.titleId,null);
  const extra = 600001;
  const slow = replayTimeAttack({ ...payload, events: [events[0], ...payload.events.slice(1)
    .map(event => ({...event,t:event.t+extra}))], end: { ...end, t:end.t+extra, elapsedMs:615001,elapsedCs:61501 } });
  assert.equal(slow.executedTravelMs,58000);
  assert.equal(slow.elapsedMs,615001);
  assert.equal(slow.titleId,null);
});

test('a hold that finishes beyond the supported elapsed time cannot clear a building', () => {
  const max = Number.MAX_SAFE_INTEGER - 58000;
  const time = max - 499;
  const prepared = createTimeAttackState(game);
  const active = applyTimeAttackEvent(prepared,{kind:'ready',t:0,building:1},game);
  const matching = applyTimeAttackEvent(active,{kind:'input',t:time,...game.targets[0]},game);
  assert.throws(() => applyTimeAttackEvent(matching,{kind:'tick',t:max+1},game),/elapsed_overflow/);
  assert.equal(centiseconds(max),900719925468300);
  assert.throws(() => centiseconds(max+1),/invalid_elapsed_ms/);
});
