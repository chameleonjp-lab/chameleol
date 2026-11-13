import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { GameSession } from '../../src/game/session.js';
import { RULES_V3, RULES_V4 } from '../../src/rules/v1/index.js';
import { openStore, StaleWriterError } from '../../src/storage/store.js';
let n=0;
const fresh=(opts={})=>openStore({indexedDB:new IDBFactory(),name:`bonus-resume-${++n}`,...opts});
function session(rules=RULES_V4){
 const s=new GameSession({playId:'bonus',launchId:'launch',seed:17,ranked:false,rulesVersion:rules.rulesVersion});
 s.apply({type:'color',t:0,...s.game.course.targets[0]});return s;
}
for(const rules of [RULES_V3,RULES_V4])for(const [name,t] of [['resume_steady_at_2499ms',3999],['resume_quick_at_999ms',2499]])test(`${name}: ${rules.rulesVersion}`,async()=>{
 const store=await fresh();try{
  const s=session(rules);s.apply({type:'tick',t});
  const before=structuredClone(s.state.acc.bonus);
  const gen=await store.beginRun('tab',s.snapshot());
  await store.saveRun('tab',gen,s.snapshot());
  const restored=GameSession.fromSnapshot((await store.loadRun()).snapshot);
  assert.equal(restored.error,undefined);assert.equal(restored.session.rules,rules);assert.deepEqual(restored.session.state.acc.bonus,before);
  s.apply({type:'tick',t:5000});restored.session.apply({type:'tick',t:5000});
  assert.deepEqual(restored.session.summary(),s.summary());assert.equal(s.summary().bonus.points,20);
  assert.deepEqual(s.summary().bonus.totals.steady,{count:1,points:5});assert.deepEqual(s.summary().bonus.totals.quick,{count:1,points:5});
 }finally{store.close();}
});
test('pause_does_not_add_time',()=>{
 const s=session();s.startClock(0);
 for(const p of [500,1000,1500,2000,2499])s.frame(p);
 const acc=structuredClone(s.state.acc);s.pause('hidden');s.frame(50000);
 assert.deepEqual(s.state.acc,acc);assert.equal(s.state.t,2499);
 const restored=GameSession.fromSnapshot(s.snapshot()).session;restored.startClock(50000);
 restored.frame(50001);assert.equal(restored.state.t,2500);assert.equal(restored.state.acc.bonus.quickAchieved,true);
 for(const p of [50500,51000,51500,52000,52501])restored.frame(p);
 const baseline=session();baseline.apply({type:'tick',t:5000});assert.deepEqual(restored.summary(),baseline.summary());
});
test('old_snapshot_shape_unchanged',()=>{
 for(const v of [1,2]){
  const fixture=JSON.parse(readFileSync(new URL(`../compat/fixtures/pre-bonus-v${v}.json`,import.meta.url)));
  for(const original of fixture.snapshots){const snapshot=structuredClone(original);const restored=GameSession.fromSnapshot(snapshot);assert.equal(restored.error,undefined);assert.deepEqual(snapshot,original);assert.deepEqual(restored.session.state,snapshot.state);assert.equal('bonus' in restored.session.summary(),false);}
 }
});
test('unknown_saved_version_is_quarantined_without_modifying_its_bonus',async()=>{
 const store=await fresh();try{
  const s=session();s.apply({type:'tick',t:3999});const snapshot=s.snapshot();snapshot.meta.rulesVersion='kamereoru-rules-future';
  await store.beginRun('tab',snapshot);const error=GameSession.fromSnapshot(snapshot).error;assert.equal(error,'unknown_rules_version');
  await store.quarantineRun(error);const [entry]=await store.getAll('quarantine');assert.deepEqual(entry.record.snapshot,snapshot);
 }finally{store.close();}
});
test('bonus_end_transaction_survives_failure_takeover_and_duplicate_end',async()=>{
 let fail=false;const store=await fresh({failWrites:names=>fail&&names.includes('outbox')?new Error('QuotaExceededError'):null});
 try{
  const s=session(RULES_V3);const gen=await store.beginRun('old',s.snapshot());
  s.apply({type:'tick',t:3999});const snapshot=s.snapshot();await store.saveRun('old',gen,snapshot);
  s.apply({type:'quit',t:5000});const result={playId:s.meta.playId,ranked:true,summary:s.summary(),body:'frozen'};
  fail=true;await assert.rejects(store.endRun('old',gen,result));assert.deepEqual((await store.loadRun()).snapshot,snapshot);assert.deepEqual(await store.getAll('outbox'),[]);
  fail=false;const claim=await store.claimRun('new');await assert.rejects(store.endRun('old',gen,result),StaleWriterError);
  const restored=GameSession.fromSnapshot(claim.snapshot).session;restored.apply({type:'quit',t:5000});assert.deepEqual(restored.summary(),result.summary);
  await store.endRun('new',claim.generation,result);await assert.rejects(store.endRun('new',claim.generation,result),StaleWriterError);
  const pending=await store.getAll('outbox');assert.equal(pending.length,1);assert.deepEqual(pending[0].summary.bonus,result.summary.bonus);assert.equal(pending[0].summary.bonus.points,20);
 }finally{store.close();}
});
