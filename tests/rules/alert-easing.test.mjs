import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES_V1,advance,initialState} from '../../src/rules/v1/index.js';
import {stubGame,evalStart,U} from './helpers.mjs';
import {GameSession} from '../../src/game/session.js';
const activeRules=()=>new GameSession({playId:'new',seed:1}).rules;
function sample(building,units,duration=1000,alert=10000,rules=activeRules()){
  const game=stubGame({[rules.initialColor.h]:units},{rules});
  let s=initialState(game);s.t=evalStart(building);s.evalBuilding=building;s.matchUnits=units;s.acc={matchSum:0,evalMs:0};s.alert=alert*rules.alert.unitsPerPoint/1000;s.brightnessUnlocked=building>=20;
  return advance(s,{type:'tick',t:s.t+duration},game).state;
}
test('new sessions use a separate rules version for the easier brightness stages',()=>assert.equal(activeRules().rulesVersion,'kamereoru-rules-v2'));
for(const [building,ratio] of [[19,1],[20,.5],[25,.5],[26,.8],[30,.8],[31,1]]){
  for(const [units,rate] of [[70*U,12],[0,45]])test(`building ${building} increases ${ratio} at match ${units}`,()=>assert.ok(Math.abs(sample(building,units).alert/activeRules().alert.unitsPerPoint*1000-(10000+1000*rate*ratio))<1e-7));
  test(`building ${building} recovery is unchanged`,()=>assert.equal(sample(building,100*U,1000,80000).alert/activeRules().alert.unitsPerPoint,45));
}
test('detection time uses the reduced increase',()=>{const s=sample(20,0,3000,50000);assert.equal(s.status,'detected');assert.equal(s.endT,evalStart(20)+2223);});
test('existing v1 saved games keep v1 rules',()=>{const old=new GameSession({playId:'old',seed:2},{rules:RULES_V1});const restored=GameSession.fromSnapshot(old.snapshot());assert.ok(restored.session);assert.equal(restored.session.rules.rulesVersion,'kamereoru-rules-v1');assert.equal(sample(20,0,1000,10000,restored.session.rules).alert,55000);});
