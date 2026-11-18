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

test('shop escape stops at the supplied game position and the alarm follows the theft', async () => {
  const { openingPose } = await import('../../src/scene/opening.js');
  for (const destination of [0, 0.4]) {
    const poses = Array.from({ length: 176 }, (_, i) => openingPose(i * 16, destination, false));
    assert.equal(poses[0].block, -0.6);
    assert.equal(poses[0].pickup, 0);
    assert.equal(poses[0].alarm, 0);
    assert.ok(poses.every((p, i) => i === 0 || p.block >= poses[i - 1].block));
    assert.ok(poses.slice(-4).every(p => p.block === destination && p.stowed === 1 && p.alarm === 0));
  }
  const normal = [700, 1000, 1300].map(t => openingPose(t, 0.4, false).alarm);
  assert.ok(Math.max(...normal) - Math.min(...normal) > 0.3);
  for (const t of [700, 1000, 1300]) {
    const pose = openingPose(t, 0.4, true);
    assert.equal(pose.alarm, 0.8);
    assert.equal(pose.jump, 0);
  }
});

test('shop escape scales visible frames and cues only; skip lands at the same guide', async (t) => {
  const { startShopEscape, openingPose } = await import('../../src/scene/opening.js');
  const destination = 0.4;
  let frame, now = 0;
  const visibility = new EventTarget();
  visibility.hidden = false;
  t.mock.method(performance, 'now', () => now);
  globalThis.document = visibility;
  globalThis.requestAnimationFrame = next => { frame = next; return 1; };
  globalThis.cancelAnimationFrame = () => { frame = null; };
  t.after(() => {
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.document;
  });
  for (const [rate, duration, skip] of [[0.7, 4000, false], [1, 2800, false], [0.7, 4000, true]]) {
    const ctrl = new AbortController();
    const cues = [];
    let pose, delta;
    const start = now;
    const escape = startShopEscape({
      destination, playbackRate: rate, signal: ctrl.signal,
      draw(p, dt) { pose = p; delta = dt; },
      onCue(cue) { cues.push([cue, now - start]); },
    });
    for (const elapsed of [duration * 0.16, duration * 0.48, duration * 0.82]) {
      now = start + elapsed;
      frame(now);
      if (skip) break;
    }
    if (skip) {
      ctrl.abort();
      assert.equal(cues.length, 3);
    } else {
      assert.deepEqual(cues, [['glassBurst', duration * 0.16], ['alarm', duration * 0.16],
        ['jump', duration * 0.16], ['land', duration * 0.48], ['jewel', duration * 0.82]]);
      now = start + duration - 1;
      frame(now);
      assert.ok(frame);
      frame(++now);
      assert.ok(Math.abs(delta - rate / 1000) < 1e-9);
    }
    await escape.finished;
    assert.equal(frame, null);
    assert.deepEqual(pose, openingPose(2800, destination, false));
  }
});
