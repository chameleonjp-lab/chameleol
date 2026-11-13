import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/rules/v1/index.js';
import { U, stubGame, run, setColor } from './helpers.mjs';
const { RULES_V3: rules, RULES_V4, RULES_V1, RULES_V2, summarize, advance, createRecorder }=api;
const table={0:0,1:100*U,2:95*U,3:90*U,4:89*U,5:95*U-1,6:98*U-1,7:98*U,8:85*U,9:85*U-1,[rules.initialColor.h]:100*U};
const game=(r=rules)=>stubGame(table,{rules:r});
const play=(events=[],until=5000,r=rules)=>run(game(r),events,{until});
const bonus=(result)=>summarize(result.state,rules).bonus;
const has=(result,kind)=>bonus(result).awards.filter(a=>a.kind===kind);
const finish=(events=[],until=250000)=>play(events,until);

test('precision_boundaries',()=>{
 for(const [h,tier] of [[5,0],[2,5],[6,5],[7,10]]){
  const awards=has(play([setColor(0,h)]),'precision');
  assert.equal(awards.length,tier?1:0);if(tier)assert.equal(awards[0].tier,tier);
 }
});
test('steady_continuous_only',()=>{
 for(const [duration,count] of [[2499,0],[2500,1]])assert.equal(has(play([setColor(0,3),setColor(1500+duration,4)]),'steady').length,count);
 assert.equal(has(play([setColor(0,3),setColor(3000,4),setColor(3001,3),setColor(4001,4)]),'steady').length,0);
});
test('quick_start_and_hold',()=>{
 for(const [start,hold,count] of [[499,1000,1],[500,1000,1],[501,1000,0],[500,999,0]]){
  assert.equal(has(play([setColor(0,3),setColor(1500+start,2),setColor(1500+start+hold,3)]),'quick').length,count,`${start}/${hold}`);
 }
 // A failed candidate may restart within 500ms; achievement survives later failure.
 assert.equal(has(play([setColor(1600,3),setColor(2000,2),setColor(3000,3)]),'quick').length,1);
});
test('quick_prepared_in_grace',()=>{
 assert.equal(has(play([setColor(0,2),setColor(2500,3)]),'quick').length,1);
 assert.equal(has(play([setColor(0,2),setColor(1500,3)]),'quick').length,0);
});
test('zero_duration_color_is_neutral',()=>{
 const events=[setColor(0,2),setColor(2250,0),setColor(2250,2),{type:'quit',t:5000}];
 const recorder=createRecorder(rules);for(const e of events)recorder.push(e);
 const original=run(game(),events);const compacted=api.compactHistory(recorder.entries);
 assert.ok(compacted.length<recorder.entries.length);
 const compressed=api.replayHistory(game(),compacted);
 assert.deepEqual(compressed.summary,summarize(original.state,rules));
 assert.equal(has(original,'steady').length,1);assert.equal(has(original,'quick').length,1);
});
test('only_passed_buildings_award',()=>{
 for(const t of [4500,4999])assert.equal(bonus(play([{type:'quit',t}],t)).points,0);
 const result=play([{type:'quit',t:5000}],5000);
 assert.equal(bonus(result).points,20);assert.equal(result.state.passed,1);
});
test('milestone_is_exit',()=>{
 for(const t of [45000,49999])assert.equal(has(play([],t),'milestone').length,0);
 const result=play([],50000);assert.equal(has(result,'milestone').length,1);
 assert.equal(has(result,'milestone')[0].earnedAtT,50000);
 assert.equal(has(finish(),'milestone').length,5);
});
test('all_success_requires_every_building',()=>{
 assert.equal(has(finish([setColor(0,8)]),'allSuccess').length,1);
 assert.equal(has(finish([setColor(0,9),setColor(5000,1)]),'allSuccess').length,0);
 assert.equal(has(finish([{type:'quit',t:249999}],249999),'allSuccess').length,0);
 const detected=finish([setColor(245000,0)]);assert.equal(detected.state.status,'detected');
 assert.equal(has(detected,'allSuccess').length,0);
});
test('perfect_totals',()=>{
 for(const r of [rules,RULES_V4]){
  const result=play([],250000,r);const summary=summarize(result.state,r);
  assert.equal(summary.bonus.points,1200);assert.equal(summary.score.bonus,1200);assert.equal(summary.score.total,7280);
  assert.equal(summary.bonus.awards.length,156);
  assert.deepEqual(summary.bonus.totals,{precision5:{count:0,points:0},precision10:{count:50,points:500},steady:{count:50,points:250},milestone:{count:5,points:100},quick:{count:50,points:250},allSuccess:{count:1,points:100}});
  assert.equal(new Set(summary.bonus.awards.map(a=>a.id)).size,156);
  assert.equal(summary.perBuilding.reduce((n,b)=>n+b[2],0)+summary.score.clear+summary.bonus.totals.allSuccess.points,7280);
  for(const a of summary.bonus.awards){assert.equal(a.id,`${r.rulesVersion}:${a.building}:${a.kind}`);assert.equal(a.earnedAtT,a.building*5000);assert.equal(a.tier,a.kind==='precision'?10:null);}
 }
});
test('simultaneous_final_building',()=>{
 const before=play([],249999);const after=advance(before.state,{type:'tick',t:250000},game());
 assert.equal(after.state.score.total-before.state.score.total,460);
 const pass=after.events.find(e=>e.type==='pass');
 assert.equal(pass.basePoints,120);assert.equal(pass.bonusPoints,40);assert.equal(pass.points,160);assert.equal(pass.bonusAwards.length,4);
 const again=advance(after.state,{type:'tick',t:250000},game());assert.deepEqual(again.state,after.state);assert.deepEqual(again.events,[]);
});
test('frame_partition_invariant',()=>{
 const events=[setColor(0,3),setColor(2000,2),setColor(3000,3),setColor(3000,1),setColor(5000,7),setColor(10250,0),setColor(10250,1)];
 const expected=summarize(run(game(),events,{until:50000}).state,rules);
 for(const tickEvery of [1,16,33,100])assert.deepEqual(summarize(run(game(),events,{until:50000,tickEvery}).state,rules),expected);
});
test('bonus_accumulator_uses_positive_intervals_and_is_cloned',()=>{
 const acc=api.createBonusAccumulator();
 api.accumulateBonus(acc,{matchUnits:100*U,fromEvalMs:0,dtMs:999},rules);
 const snapshot=structuredClone(acc);api.accumulateBonus(acc,{matchUnits:0,fromEvalMs:999,dtMs:0},rules);assert.deepEqual(acc,snapshot);
 api.accumulateBonus(acc,{matchUnits:100*U,fromEvalMs:999,dtMs:1501},rules);
 assert.equal(api.settleBuildingBonus({building:1,matchSum:100*U*3000,evalMs:3000,acc},rules).length,3);
 assert.equal(api.settleClearBonus([] ,rules).length,0);
 const current=play([],2499).state;const original=structuredClone(current);
 advance(current,{type:'tick',t:5000},game());assert.deepEqual(current,original);
 const closed=play([],4500).state;const closedOriginal=structuredClone(closed);
 const copy=api.cloneState(closed);copy.closed.bonus.quickAchieved=false;assert.deepEqual(closed,closedOriginal);
});
for(const r of [RULES_V1,RULES_V2])test(`${r.rulesVersion} never adds bonus fields`,()=>{
 const result=play([],250000,r);assert.equal('bonus' in result.state,false);assert.equal('bonus' in result.state.score,false);assert.equal('bonus' in summarize(result.state,r),false);
 assert.equal(result.state.score.total,6080);for(const pass of result.events.filter(e=>e.type==='pass'))assert.equal('bonusAwards' in pass,false);
});
