import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamePresentationClock, createVisiblePresentationClock } from '../../src/scene/stage.js';

test('game animations stop while paused and resume without wall-time catch-up', () => {
  const tick = createGamePresentationClock();
  assert.equal(tick(1000, true), 0);
  assert.equal(tick(1050, true), 0.05);
  assert.equal(tick(1050, false), 0);
  assert.equal(tick(1050, false), 0);
  assert.equal(tick(1100, true), 0.05);
});

test('paused game samples rebase the clock and negative time never animates', () => {
  const tick = createGamePresentationClock();
  tick(1000, true);
  assert.equal(tick(2000, false), 0);
  assert.equal(tick(2050, true), 0.05);
  assert.equal(tick(0, true), 0);
});

test('opening and ending clocks start at zero and exclude hidden intervals', () => {
  const tick = createVisiblePresentationClock();
  assert.deepEqual(tick(1000, false), { elapsed: 0, dt: 0 });
  assert.deepEqual(tick(1050, false), { elapsed: 50, dt: 0.05 });
  tick(1100, true);
  tick(9000, true);
  assert.deepEqual(tick(9050, false), { elapsed: 50, dt: 0 });
  assert.deepEqual(tick(9100, false), { elapsed: 100, dt: 0.05 });
  assert.deepEqual(createVisiblePresentationClock()(10000, false), { elapsed: 0, dt: 0 });
});

test('visibility events exclude hidden time even when no animation frame runs', () => {
  const visibilityTarget = new EventTarget();
  let now = 1000;
  visibilityTarget.hidden = false;
  const tick = createVisiblePresentationClock({ visibilityTarget, now: () => now });
  tick(now);
  assert.equal(tick(1050).elapsed, 50);
  now = 1100;
  visibilityTarget.hidden = true;
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  now = 9000;
  visibilityTarget.hidden = false;
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(tick(9050), { elapsed: 100, dt: 0.05 });
  tick.dispose();
  tick.dispose();
});
