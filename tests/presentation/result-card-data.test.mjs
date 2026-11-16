import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES_V1, rulesForVersion } from '../../src/rules/v1/config.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { rankForPassed, selectBestVisual, buildResultCardModel } from '../../src/presentation/result-card-data.js';

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
  assert.equal(model(s,{status:'ready',data:{visualSamples:[sample(2)]}}).hero.status,'missing');
  s.perBuilding[0][1]=0;
  assert.equal(selectBestVisual({summary:s,rules:RULES_V1,visualSamples:[sample(1),sample(2)]}).building,2);
});
test('visual uses actual HSV, separates average from instant match and pins outline to selected building',()=>{
  for(const n of [1,2,3,4]){
    const s=summary(39,`kamereoru-rules-v${n}`);s.perBuilding[4]=[285000000000,3000,100];
    const e={status:'ready',data:{visualSamples:[sample(5,5678,98000000)]}};
    const m=model(s,e);
    assert.equal(m.hero.building,5);assert.equal(m.hero.outlineBuilding,5);
    assert.deepEqual(m.hero.hsv,{h:5678,s:6000,v:10000});
    assert.equal(m.hero.average,95);assert.equal(m.hero.instantMatch,98);
  }
  assert.equal(model(summary(0)).hero.outlineBuilding,1);
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
test('pending differs from missing and projections are immutable without changing inputs',()=>{
  const s=summary();const original=JSON.stringify(s);Object.freeze(s);
  const pending=model(s,{status:'pending'});assert.equal(pending.hero.status,'pending');
  for(const status of ['missing','failed']){const m=model(s,{status});assert.equal(m.hero.status,'missing');assert.deepEqual(m.hero.hsv,RULES_V1.initialColor);}
  const m=model(s);assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.hero)&&Object.isFrozen(m.hero.hsv));assert.equal(JSON.stringify(s),original);
  assert.equal('name' in m,false);assert.equal('playId' in m,false);
});
