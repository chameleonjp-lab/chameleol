import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES_V1, rulesForVersion } from '../../src/rules/v1/config.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { rankForPassed, selectBestVisual, buildResultCardModel, projectRunResult } from '../../src/presentation/result-card-data.js';

const spec = JSON.parse(readFileSync(new URL('../../docs/requirements/chameleol-design-followups.json',import.meta.url)));
const clear = JSON.parse(readFileSync(new URL('../replay/fixtures/bonus-v3-clear.json',import.meta.url))).expected;
function summary(buildings=2,version='kamereoru-rules-v1') {
  return {rulesVersion:version,buildings,endReason:buildings===50?'cleared':'quit',score:{total:200},perBuilding:Array.from({length:buildings},()=>[270000000000,3000,100])};
}
const sample = (building,h=1234,matchUnits=95000000) => ({building,hsv:{h,s:6000,v:10000},matchUnits,from:(building-1)*5000+1500,to:(building-1)*5000+4500});
const model = (s,evidence={status:'ready',data:{visualSamples:[sample(1),sample(2)]}}) => buildResultCardModel({displaySummary:s,rules:rulesForVersion(s.rulesVersion),evidence,locale:'ja',revision:2,verificationState:null});

test('every passed count selects exactly one adopted title and each language supplies all 27 titles',()=>{
  for(let n=0;n<=50;n++){
    const row=spec.titles.find(x=>x.from<=n&&x.to>=n);
    assert.deepEqual(rankForPassed(n),{rankKey:row.key,from:row.from,to:row.to});
  }
  assert.equal(rankForPassed(0).rankKey,'beginning');assert.equal(rankForPassed(1).rankKey,'apprentice');assert.equal(rankForPassed(50).rankKey,'legend');
  for(const dict of Object.values(MESSAGES))for(const row of spec.titles)assert.ok(dict[`card.rank.${row.key}`]?.trim());
  for(const row of spec.titles)assert.equal(MESSAGES.ja[`card.rank.${row.key}`],row.ja);
  for(const n of [-1,51,1.5,NaN,Infinity,'2',null,undefined])assert.equal(rankForPassed(n),null);
});
test('image preparation, failure and explicit fallback actions have complete localized copy',()=>{
  const keys=['bonusCount','passed','score','noRecord','preparing','failed','confirming','shareUnavailable','save','textShare','retry','saveHint','shareClosed'];
  for(const [lang,dict] of Object.entries(MESSAGES))for(const key of keys)assert.ok(dict[`card.${key}`]?.trim(),`${lang}: ${key}`);
});
test('card uses this run and rejects unknown versions and contradictory clear counts',()=>{
  const s=summary(1);s.personalBest=50;
  assert.equal(model(s).rankKey,'apprentice');
  for(const bad of [{...summary(50),endReason:'quit'},{...summary(49),endReason:'cleared'},{...s,buildings:51},{...s,rulesVersion:undefined},{...s,rulesVersion:'future'}]){
    const m=model(bad);assert.equal(m.passed,null);assert.equal(m.rankKey,null);
  }
});
test('best building compares exact ratios, keeps early true ties and never falls back to another color',()=>{
  const s=summary();s.perBuilding=[[270000000000,3000,100],[270000000001,3000,100]];
  assert.equal(selectBestVisual({summary:s,rules:RULES_V1,visualSamples:[sample(1),sample(2,2345)]}).building,2);
  s.perBuilding[1][0]=270000000000;
  assert.equal(selectBestVisual({summary:s,rules:RULES_V1,visualSamples:[sample(1),sample(2)]}).building,1);
  assert.equal(selectBestVisual({summary:s,rules:RULES_V1,visualSamples:[sample(2)]}),null);
  assert.equal(model(s).hero.status,'unknown');
  s.perBuilding[0][1]=0;
  assert.equal(selectBestVisual({summary:s,rules:RULES_V1,visualSamples:[sample(1),sample(2)]}).building,2);
});
test('the wall at detection drives the share hero for every saved rules version',()=>{
  for (const n of [1,2,3,4]) {
    const s=summary(39,`kamereoru-rules-v${n}`);
    const context={summary:s,arrivedBuilding:40,targets:Array.from({length:40},(_,i)=>sample(i,500+i).hsv)};
    const run=projectRunResult(context,'ja');
    const m=buildResultCardModel({displaySummary:s,run});
    assert.equal(m.hero.building,40);assert.equal(m.hero.outlineBuilding,40);
    assert.deepEqual(m.hero.hsv,context.targets[39]);
  }
});
test('official metrics require integers and a consistent denominator, and rank and ordinal disappear on review',()=>{
  const context={playId:'p',ranked:true,summary:clear,netState:'official',
    official:{buildings:50,rankAverage:9200},metrics:{runRank:3,totalPlays:4,clearOrdinal:1}};
  let run=projectRunResult(context,'ja');
  assert.deepEqual([run.score,run.runRank,run.totalPlays,run.clearOrdinal],[7280,3,4,1]);
  assert.equal(run.appearance.kind,'rainbow');
  context.metrics.totalPlays=2;run=projectRunResult(context,'ja');
  assert.equal(run.runRank,null);assert.equal(run.clearOrdinal,null);
  context.metrics={runRank:2,totalPlays:4,clearOrdinal:5};run=projectRunResult(context,'ja');
  assert.equal(run.runRank,2);assert.equal(run.clearOrdinal,null);
  for (const invalid of [0, 1.5, '3', NaN]) {
    context.metrics={runRank:invalid,totalPlays:4,clearOrdinal:invalid};
    run=projectRunResult(context,'ja');assert.equal(run.runRank,null);assert.equal(run.clearOrdinal,null);
  }
  context.metrics={runRank:3,totalPlays:4,clearOrdinal:1};
  context.netState='under_review';run=projectRunResult(context,'ja');
  assert.deepEqual([run.rankState,run.runRank,run.clearOrdinal],['pending',null,null]);
  context.netState='official';context.official.buildings=7;run=projectRunResult(context,'ja');
  assert.deepEqual([run.buildings,run.rankAverage,run.clearOrdinal],[7,9200,null]);
  context.netState='no_rank';run=projectRunResult(context,'ja');
  assert.deepEqual([run.buildings,run.rankAverage,run.clearOrdinal],[0,null,null]);
  context.ranked=false;run=projectRunResult(context,'ja');
  assert.equal(run.appearance.kind,'rainbow');assert.equal(run.rankState,'unranked');assert.equal(run.clearOrdinal,null);
});
test('bonus counts 156 awards independently from 7280 points and treats malformed or legacy data as missing',()=>{
  const m=model(clear);assert.equal(m.bonusCount,156);assert.equal(m.totalScore,7280);assert.equal(m.countState,'known');
  const empty=structuredClone(clear);empty.buildings=0;empty.endReason='quit';empty.perBuilding=[];empty.score={total:0,bonus:0};empty.bonus.points=0;empty.bonus.awards=[];
  for(const t of Object.values(empty.bonus.totals)){t.count=0;t.points=0;}
  assert.equal(model(empty).bonusCount,0);assert.equal(model(empty).countState,'known');
  assert.equal(model(summary()).countState,'missing');
  for(const corrupt of [s=>delete s.bonus.totals,s=>s.bonus.awards.push(s.bonus.awards[0]),s=>s.bonus.totals.steady.count++,s=>s.bonus.awards[0].tier=5]){
    const s=structuredClone(clear);corrupt(s);assert.equal(model(s).countState,'missing');assert.equal(model(s).bonusCount,null);
  }
});
test('a missing wall is never guessed and projections cannot mutate the input wall',()=>{
  const s=summary();const wall=sample(1).hsv;
  const unknown=projectRunResult({summary:s},'ja');
  assert.equal(unknown.appearance.kind,'unknown');assert.equal(unknown.appearance.hsv,null);
  const run=projectRunResult({summary:s,targets:[wall],arrivedBuilding:1},'ja');
  assert.ok(Object.isFrozen(run)&&Object.isFrozen(run.appearance.hsv));
  assert.notEqual(run.appearance.hsv,wall);assert.equal(Object.isFrozen(wall),false);
  const m=buildResultCardModel({displaySummary:s,run});
  assert.equal('name' in m,false);assert.equal('playId' in m,false);
});
