import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeAttackSession } from '../../src/game/time-attack-session.js';
import { colorMatch, CURRENT_RULES_VERSION, INSTANT_RULES_VERSION, generateTimeAttackCourse, publicView, replayTimeAttack } from '../../src/rules/time-attack/v1/index.js';

const course = generateTimeAttackCourse(789123);
const ready = () => {
  const session = new TimeAttackSession(course);
  session.frame(0);
  return session;
};

test('current course uses every hue range in each half, and tricky colors use active time only', () => {
  const course = generateTimeAttackCourse(3256, CURRENT_RULES_VERSION);
  assert.equal(course.targets.length, 20);
  for (const half of [course.targets.slice(0, 10), course.targets.slice(10)]) {
    assert.equal(new Set(half.map(target => Math.floor(target.h / 6000))).size, 6);
  }
  assert.ok(course.targets.slice(0, 10).every(target => target.v === 10000));
  assert.notEqual(course.targets[10].v, 10000);
  const session = new TimeAttackSession(course);
  session.frame(0);
  session.input(course.targets[0], 0);
  session.frame(500);
  session.frame(700);
  session.pause(700);
  session.resume(5700);
  session.input(course.targets[1], 5900);
  session.frame(6400);
  session.input(course.targets[2], 6500);
  session.frame(7000);
  session.pause(7800);
  const { result, history } = session.finish();
  assert.equal(replayTimeAttack(history).elapsedMs, 2800);
  assert.deepEqual(result.trickyColors.map(({ elapsedMs, building }) => [building, elapsedMs]), [
    [2, 900], [4, 800], [3, 600],
  ]);
  assert.deepEqual(result.trickyColors.map(({ hsv }) => hsv), [course.targets[1], course.targets[3], course.targets[2]]);
});

test('fractional frames accumulate to the same time as fewer larger frames', () => {
  const many = ready(), two = ready();
  for (let i = 1; i <= 60; i++) many.frame(i * 16.7);
  two.frame(501);
  two.frame(1002);
  assert.equal(many.state.elapsedMs, 1002);
  assert.equal(two.state.elapsedMs, 1002);
});

test('input is a confirmed clock sample and a long gap pauses before counting time', () => {
  const run = ready();
  run.frame(100);
  run.input(course.targets[0], 600);
  run.frame(1601);
  assert.equal(run.state.t, 600);
  assert.equal(run.state.phase, 'paused');
  assert.equal(run.state.holdMs, 0);
  assert.equal(publicView(run.state, course).targetColor, null);
  run.resume(1800);
  run.frame(2299);
  assert.equal(run.state.holdMs, 499);
  run.frame(2300);
  assert.equal(run.state.phase, 'await_travel');
});

test('clock starts only at first ready, pausing at 499ms resets the hold', () => {
  const run = new TimeAttackSession(course);
  run.pause(0);
  run.frame(500);
  assert.equal(run.state.phase, 'prepared');
  assert.equal(run.events.length, 0);
  run.resume(520);
  run.frame(540);
  run.input(course.targets[0], 540);
  run.pause(1039);
  run.resume(1200);
  run.frame(1201);
  assert.equal(run.state.holdMs, 1);
  run.pause(1201);
  const { history, result } = run.finish();
  assert.equal(result.elapsedMs, 500);
  assert.equal(result.reason, 'quit');
  assert.equal(replayTimeAttack(history).elapsedCs, 50);
});

test('travel gates ignore input and excess time, completing once at 73 seconds of timed history', () => {
  const run = ready();
  let now = 0;
  function tick(move = 0) {
    now += move;
    run.frame(now);
  }
  for (let i = 0; i < 30; i++) {
    assert.equal(run.state.building, i + 1);
    run.input(course.targets[i], now);
    tick(800);
    if (i === 29) break;
    assert.equal(run.state.phase, 'await_travel');
    tick(500);
    assert.equal(run.state.phase, 'travel');
    assert.equal(run.input(course.targets[i + 1], now), false);
    tick(999);
    run.pause(now);
    const pausedAt = run.state.t;
    tick(3000);
    assert.equal(run.state.t, pausedAt);
    run.resume(now);
    tick(1000);
    assert.equal(run.state.phase, 'travel');
    tick(220);
    assert.equal(run.state.phase, 'await_ready');
    tick(400);
    assert.equal(run.state.phase, 'active');
  }
  const { history, result } = run.finish();
  assert.equal(result.elapsedMs, 15000);
  assert.equal(history.end.t, 73000);
  assert.equal(history.events.filter(e => e.kind === 'travel').length, 29);
  assert.equal(replayTimeAttack(history).titleId, 'ta.title.01');
});

test('90% is inclusive and the new rules switch walls on the frame that completes the hold', () => {
  const course = generateTimeAttackCourse(789123, INSTANT_RULES_VERSION);
  const run = new TimeAttackSession(course);
  run.frame(0);
  const target = course.targets[0];
  const candidates = Array.from({ length: 361 }, (_, i) => ({ ...target, h: (target.h + 50 * i) % 36000 }));
  const match = candidates.find(c => colorMatch(c, target) >= 90000000 && colorMatch(c, target) < 92000000);
  const below = candidates.find(c => colorMatch(c, target) >= 88000000 && colorMatch(c, target) < 90000000);
  assert.ok(match);
  assert.ok(below);
  run.input(below, 0);
  run.frame(500);
  assert.equal(run.state.holdMs, 0);
  run.input(match, 500);
  run.frame(999);
  assert.equal(run.state.building, 1);
  run.frame(1000);
  assert.equal(run.state.building, 2);
  assert.equal(run.state.phase, 'active');
  assert.equal(run.state.holdMs, 0);
  assert.deepEqual(publicView(run.state, course).targetColor, course.targets[1]);

  let now = 1000;
  for (let building = 2; building <= 30; building++) {
    const color = course.targets[building - 1];
    if (building === 15) {
      run.input({ ...color, v: color.v - 1001 }, now);
      now += 500;
      run.frame(now);
      assert.equal(run.state.building, 15);
      assert.equal(run.state.holdMs, 0);
    }
    run.input(building >= 15 ? { ...color, v: color.v - 1000 } : color, now);
    now += 500;
    run.frame(now);
    assert.equal(run.state.building, Math.min(30, building + 1));
  }
  const { history } = run.finish();
  assert.equal(history.end.t, 16000);
  assert.equal(history.events.filter(e => e.kind === 'travel').length, 0);
  const result = replayTimeAttack(history);
  assert.equal(result.rulesVersion, INSTANT_RULES_VERSION);
  assert.equal(result.buildings, 30);
  assert.equal(result.executedTravelMs, 0);
});
