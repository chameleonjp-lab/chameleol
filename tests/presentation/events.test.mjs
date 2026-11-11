import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../../src/game/session.js';
import { classifyMatch, currentBuilding, phaseOf } from '../../src/rules/v1/index.js';
import { readPlayView } from '../../src/presentation/events.js';
const create = () => new GameSession({ playId: 'play', seed: 123 });
test('readPlayView_copies_existing_session_without_mutation', () => {
  const session = create(); session.startClock(0); for (let t = 100; t <= 1500; t += 100) session.frame(t);
  const before = structuredClone(session.state);
  const view = readPlayView(session, 2, { lastEvalSuccess: true });
  assert.deepEqual(view, {playId:'play', t:1500, passed:0, building:currentBuilding(session.state,session.rules), phase:phaseOf(session.state,session.rules), color:{...session.state.color}, matchState:classifyMatch(session.state.matchUnits,session.rules), policeStage:2, combo:0,maxCombo:0,brightnessUnlocked:false,running:true,lastEvalSuccess:true});
  view.color.h = -1; view.combo = 42;
  assert.deepEqual(session.state, before);
});
test('grace_and_ended_views_do_not_classify_null_match', () => {
  const session = create();
  assert.equal(readPlayView(session, 0, {lastEvalSuccess:false}).matchState, null);
  session.quit(); const view = readPlayView(session, 1, {lastEvalSuccess:false});
  assert.equal(view.phase, 'ended'); assert.equal(view.matchState, null); assert.equal(view.running, false);
});
