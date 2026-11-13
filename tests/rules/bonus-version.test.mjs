import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rulesApi from '../../src/rules/v1/index.js';
import { GameSession } from '../../src/game/session.js';
const { RULES_V1, RULES_V2, createGame, replayHistory }=rulesApi;
for (const [version,rules] of [[1,RULES_V1],[2,RULES_V2]]) {
 const fixture=JSON.parse(readFileSync(new URL(`../compat/fixtures/pre-bonus-v${version}.json`,import.meta.url)));
 test(`v1_v2_rules_unchanged: v${version}`,()=>{
  assert.deepEqual(rules,fixture.rules);
  assert.equal(rules.bonus,undefined);
  assert.deepEqual(replayHistory(createGame({seed:17,rules}),fixture.history).summary,fixture.summary);
  for(const snapshot of fixture.snapshots){
   const restored=GameSession.fromSnapshot(snapshot);
   assert.equal(restored.error,undefined);
   assert.deepEqual(restored.session.state,snapshot.state);
   assert.deepEqual(restored.session.snapshot(),{...snapshot,saveSeq:snapshot.saveSeq+1});
  }
 });
}
for(const [name,original,key] of [['v3_inherits_ranked_conditions',RULES_V1,'RULES_V3'],['v4_inherits_standalone_conditions',RULES_V2,'RULES_V4']])test(name,()=>{
 const successor=rulesApi[key];assert.ok(successor,'new version must exist');
 const {rulesVersion,bonus,...rest}=successor;
 assert.deepEqual(rest,((({rulesVersion,...r})=>r)(original)));
 assert.ok(bonus);assert.ok(Object.isFrozen(bonus));
 assert.equal(rulesApi.rulesForVersion(rulesVersion),successor);
});
for(const [v,key] of [[1,'RULES_V3'],[2,'RULES_V4']])test(`v${v} successor preserves ranking, alert, timing and ordinary score`,()=>{
 const fixture=JSON.parse(readFileSync(new URL(`../compat/fixtures/pre-bonus-v${v}.json`,import.meta.url)));
 const rules=rulesApi[key],original=rulesApi.rulesForVersion(fixture.rules.rulesVersion);
 const before=replayHistory(createGame({seed:17,rules:original}),fixture.history);
 const after=replayHistory(createGame({seed:17,rules}),fixture.history);
 for(const key of ['buildings','rankAverage','meanNum','meanDen','maxCombo','endReason','endT'])assert.deepEqual(after.summary[key],before.summary[key]);
 for(const key of ['alert','brightnessUnlocked','reached20'])assert.deepEqual(after.state[key],before.state[key]);
 for(const key of ['pass','accuracy','combo','clear'])assert.equal(after.summary.score[key],before.summary.score[key]);
 assert.equal(after.summary.score.total-after.summary.score.bonus,before.summary.score.total);
 assert.deepEqual(after.summary.perBuilding.map((b,i)=>[b[0],b[1],b[2]-after.state.buildings[i].bonusPoints]),before.summary.perBuilding);
});
test('new standalone sessions default to v4 while createGame retains v1',()=>{
 assert.equal(new GameSession({playId:'new',seed:17}).rules.rulesVersion,'kamereoru-rules-v4');
 assert.equal(createGame({seed:17}).rules,RULES_V1);
 assert.equal(rulesApi.rulesForVersion('unknown'),null);
});
