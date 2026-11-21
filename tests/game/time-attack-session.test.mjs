import test from 'node:test';
import assert from 'node:assert/strict';
import { TimeAttackSession } from '../../src/game/time-attack-session.js';
import { generateTimeAttackCourse, publicView, replayTimeAttack } from '../../src/rules/time-attack/v1/index.js';

const course = generateTimeAttackCourse(789123);
const ready = () => {
  const session = new TimeAttackSession(course);
  session.frame(0);
  return session;
};

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
