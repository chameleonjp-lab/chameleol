import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES_V1,RULES_V2,RULES_V4,RULES_V5,advance,createGame,initialState,summarize} from '../../src/rules/v1/index.js';
import {stubGame,evalStart,exitAt,U,run,setColor} from './helpers.mjs';
import {GameSession} from '../../src/game/session.js';
const activeRules=()=>new GameSession({playId:'new',seed:1}).rules;
function sample(building,units,duration=1000,alert=10000,rules=RULES_V2){
  const game=stubGame({[rules.initialColor.h]:units},{rules});
  let s=initialState(game);s.t=evalStart(building);s.evalBuilding=building;s.matchUnits=units;s.acc={matchSum:0,evalMs:0};s.alert=alert*rules.alert.unitsPerPoint/1000;s.brightnessUnlocked=building>=20;
  return advance(s,{type:'tick',t:s.t+duration},game).state;
}
test('new sessions use a separate rules version for the easier brightness stages',()=>assert.equal(activeRules().rulesVersion,'kamereoru-rules-v5'));
for(const [building,ratio] of [[19,1],[20,.5],[25,.5],[26,.8],[30,.8],[31,1]]){
  for(const [units,rate] of [[70*U,12],[0,45]])test(`building ${building} increases ${ratio} at match ${units}`,()=>assert.ok(Math.abs(sample(building,units).alert/RULES_V2.alert.unitsPerPoint*1000-(10000+1000*rate*ratio))<1e-7));
  test(`building ${building} recovery is unchanged`,()=>assert.equal(sample(building,100*U,1000,80000).alert/RULES_V2.alert.unitsPerPoint,45));
}
test('detection time uses the reduced increase',()=>{const s=sample(20,0,3000,50000);assert.equal(s.status,'detected');assert.equal(s.endT,evalStart(20)+2223);});
test('existing v1 saved games keep v1 rules',()=>{const old=new GameSession({playId:'old',seed:2},{rules:RULES_V1});const restored=GameSession.fromSnapshot(old.snapshot());assert.ok(restored.session);assert.equal(restored.session.rules.rulesVersion,'kamereoru-rules-v1');assert.equal(sample(20,0,1000,10000,restored.session.rules).alert,55000);});
test('v4 uses initialized bonus accumulation with the inherited eased alert',()=>{
  const rules=RULES_V4;const game=stubGame({[rules.initialColor.h]:100*U,1:70*U},{rules});
  const result=run(game,[setColor(evalStart(20),1)],{until:evalStart(20)+1000});
  assert.equal(result.state.alert,6*rules.alert.unitsPerPoint);assert.ok(result.state.acc.bonus);assert.equal(result.state.acc.evalMs,1000);
});

test('brightness tolerance includes both endpoints of the building band and both accuracy limits', () => {
  const rules = RULES_V5;
  for (const { building, paletteUnits, difference, expected } of [
    { building: 20, paletteUnits: 85 * U, difference: 2000, expected: 11.25 },
    { building: 25, paletteUnits: 85 * U, difference: 2000, expected: 11.25 },
    { building: 20, paletteUnits: 85 * U - 1, difference: 2000, expected: 22.5 },
    { building: 20, paletteUnits: 85 * U, difference: 2001, expected: 22.5 },
    { building: 26, paletteUnits: 85 * U, difference: 2000, expected: 36 },
  ]) {
    const game = createGame({
      seed: 1, rules,
      matchFn: (body, wall) => {
        if (body.s !== 0) return 100 * U;
        return body.v === wall.v ? paletteUnits : 50 * U;
      },
    });
    const wall = game.course.targets[building - 1];
    const at = evalStart(building);
    const { state } = run(game, [setColor(at, 1, wall.v - difference)], { until: at + 1000 });
    assert.equal(state.matchUnits, 50 * U);
    assert.equal(state.alert / rules.alert.unitsPerPoint, expected, `building ${building}, palette ${paletteUnits}, bar ${difference}`);
  }
});

test('v5 recomputes the allowance on color input and preserves the full match for scoring', () => {
  const rules = RULES_V5;
  const game = createGame({ seed: 1, rules });
  const wall = game.course.targets[19];
  const at = evalStart(20);
  const correctEarlierWalls = game.course.targets.slice(0, 19).map((target, i) => ({
    type: 'color', t: i * rules.buildingMs, ...target,
  }));
  const events = [
    ...correctEarlierWalls,
    { type: 'color', t: at, ...wall, v: 10000 },
    { type: 'color', t: at + 1000, ...wall, v: wall.v - 2001 },
    { type: 'color', t: at + 1800, ...wall },
  ];
  const first = run(game, events.slice(0, 20), { until: at + 1000 }).state;
  assert.equal(first.alert / rules.alert.unitsPerPoint, 3);
  assert.equal(Math.round(first.matchUnits / U * 100), 7594);
  const beforeRecovery = run(game, events, { until: at + 1800 }).state;
  assert.equal(beforeRecovery.alert / rules.alert.unitsPerPoint, 7.8);
  const session = new GameSession({ playId: 'during-brightness-allowance', seed: 1 });
  for (const event of events.slice(0, 20)) session.apply(event);
  session.apply({ type: 'tick', t: at + 500 });
  const { session: resumed } = GameSession.fromSnapshot(session.snapshot());
  assert.ok(resumed);
  resumed.apply({ type: 'tick', t: at + 1000 });
  assert.deepEqual(resumed.state, first);

  const until = exitAt(20);
  const oneTick = run(game, events, { until }).state;
  const manyTicks = run(game, events, { until, tickEvery: 137 }).state;
  assert.deepEqual(oneTick, manyTicks);
  assert.equal(oneTick.alert, 0);

  const strictRules = { ...rules, alert: { ...rules.alert, brightnessAllowance: undefined } };
  const strict = run(createGame({ seed: 1, rules: strictRules }), events, { until }).state;
  assert.deepEqual(summarize(oneTick, rules), summarize(strict, strictRules));
});
