import test from 'node:test';
import assert from 'node:assert/strict';

import { HOME_PALETTE_HEX, sampleHomeColor, createHomeIdleMotion } from '../../src/scene/showcase-motion.js';
const palette = [
  '#58c43c', '#7ac43c', '#9cc43c', '#bec43c', '#c4a83c', '#c4863c',
  '#c4643c', '#c4423c', '#c43c58', '#c43c7a', '#c43c9c', '#c43cbe',
  '#a83cc4', '#863cc4', '#643cc4', '#423cc4', '#3c58c4', '#3c7ac4',
  '#3c9cc4', '#3cbec4', '#3cc4a8', '#3cc486', '#3cc464', '#3cc442',
];
function frame() {
  return { colorRgb: new Float64Array(3) };
}
function create(options) {
  return createHomeIdleMotion(options);
}
function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}
function rgbAt(time) {
  const out = new Float64Array(3);
  sampleHomeColor(time, out);
  return out;
}
function assertRest(out) {
  assert.equal(out.tonguePhase, 'idle');
  for (const key of ['tonguePhaseMs', 'extension', 'unroll', 'mouthOpen', 'gazeWeight', 'headTilt']) {
    assert.equal(out[key], 0, key);
  }
}

test('color sampling reaches all 24 anchors, interpolates without rounding, and wraps continuously', () => {
  assert.deepEqual(HOME_PALETTE_HEX, palette);
  assert.ok(Object.isFrozen(HOME_PALETTE_HEX));
  for (let i = 0; i < palette.length; i++) {
    const hex = Number.parseInt(palette[i].slice(1), 16);
    const expected = [hex >> 16, (hex >> 8) & 255, hex & 255];
    const rgb = rgbAt(i * 500);
    expected.forEach((channel, c) => close(rgb[c], channel / 255));
  }
  const midpoint = rgbAt(250);
  [105, 196, 60].forEach((value, c) => close(midpoint[c], value / 255));
  close(rgbAt(499.999)[0], 121.999932 / 255);
  close(rgbAt(11999.999)[0], 87.999944 / 255);
  close(rgbAt(11999.999)[2], 60.000012 / 255);
  assert.deepEqual(rgbAt(12000), rgbAt(0));
  assert.deepEqual(rgbAt(1200000 + 250), midpoint);
});

test('sampling reuses the caller RGB buffer and frame independent of refresh rate', () => {
  const sixty = create({ random: () => 0 });
  const oneTwenty = create({ random: () => 0 });
  const a = frame();
  const b = frame();
  const buffer = a.colorRgb;
  for (let i = 0; i <= 60; i++) sixty.sample(i * 1000 / 60, a);
  for (let i = 0; i <= 120; i++) oneTwenty.sample(i * 1000 / 120, b);
  assert.equal(a.colorRgb, buffer);
  assert.deepEqual(a, b);
});

test('first tongue reservation uses its single random draw and starts at the observed sample', () => {
  for (const [randomValue, due] of [[0, 2000], [0.5, 2500]]) {
    let draws = 0;
    const motion = create({ random: () => { draws++; return randomValue; } });
    const out = frame();
    motion.sample(0, out);
    motion.sample(due - 0.001, out);
    assertRest(out);
    assert.equal(draws, 1);
    motion.sample(due, out);
    assert.equal(out.tonguePhase, 'anticipate');
    assert.equal(out.tonguePhaseMs, 0);
    assert.equal(draws, 1);
  }
});

test('tongue phases use the 150/300/380/750/900ms boundaries and remain finite', () => {
  const motion = create({ random: () => 0 });
  const out = frame();
  motion.sample(2000, out);
  for (const [offset, phase, phaseMs] of [
    [0, 'anticipate', 0], [149.999, 'anticipate', 149.999],
    [150, 'extend', 0], [299.999, 'extend', 149.999],
    [300, 'hold', 0], [379.999, 'hold', 79.999],
    [380, 'retract', 0], [749.999, 'retract', 369.999],
    [750, 'settle', 0], [899.999, 'settle', 149.999],
  ]) {
    motion.sample(2000 + offset, out);
    assert.equal(out.tonguePhase, phase);
    close(out.tonguePhaseMs, phaseMs, 1e-9);
    for (const key of ['extension', 'unroll', 'mouthOpen', 'gazeWeight', 'headTilt', 'yaw']) {
      assert.ok(Number.isFinite(out[key]), key);
    }
    for (const key of ['extension', 'unroll', 'mouthOpen', 'gazeWeight']) {
      assert.ok(out[key] >= 0 && out[key] <= 1, key);
    }
    assert.ok(Math.abs(out.headTilt) <= 0.04);
  }
  motion.sample(2900, out);
  assertRest(out);
});

test('phase transitions are continuous with fast extension and a 370ms return', () => {
  for (const boundary of [150, 300, 380, 750, 900]) {
    const motion = create({ random: () => 0 });
    const a = frame();
    const b = frame();
    motion.sample(2000, a);
    motion.sample(2000 + boundary - 0.0001, a);
    motion.sample(2000 + boundary, b);
    for (const key of ['extension', 'unroll', 'mouthOpen', 'gazeWeight', 'headTilt']) {
      close(a[key], b[key], 0.00001);
    }
  }
  const motion = create({ random: () => 0 });
  const out = frame();
  motion.sample(2000, out);
  motion.sample(2225, out);
  close(out.extension, 0.5);
  close(out.unroll, 0.5);
  motion.sample(2300, out);
  assert.equal(out.extension, 1);
  motion.sample(2565, out);
  close(out.extension, 0.5);
  close(out.unroll, 0.5);
});

test('later reservations wait 6000 or 8000ms from the actual 900ms ending', () => {
  for (const [value, nextStart] of [[0, 8900], [0.5, 11400]]) {
    let draws = 0;
    const motion = create({ random: () => { draws++; return value; } });
    const out = frame();
    const firstStart = value === 0 ? 2000 : 2500;
    motion.sample(firstStart, out);
    motion.sample(firstStart + 1000, out); // Completion is noticed late.
    assertRest(out);
    assert.equal(draws, 2);
    motion.sample(nextStart - 0.001, out);
    assertRest(out);
    motion.sample(nextStart, out);
    assert.equal(out.tonguePhase, 'anticipate');
    assert.equal(out.tonguePhaseMs, 0);
    assert.equal(draws, 2);
  }
});

test('a large time jump starts one fresh action without replaying missed reservations', () => {
  let draws = 0;
  const motion = create({ random: () => { draws++; return 0; } });
  const out = frame();
  motion.sample(0, out);
  motion.sample(1000000, out);
  assert.equal(out.tonguePhase, 'anticipate');
  assert.equal(out.tonguePhaseMs, 0);
  assert.equal(draws, 1);
  motion.sample(1000150, out);
  assert.equal(out.tonguePhase, 'extend');
  assert.equal(draws, 1);
});

test('invalid random values fall back to one half for both kinds of reservation', () => {
  for (const value of [NaN, Infinity, -0.1, 1, 2]) {
    const motion = create({ random: () => value });
    const out = frame();
    motion.sample(2499.999, out);
    assertRest(out);
    motion.sample(2500, out);
    assert.equal(out.tonguePhase, 'anticipate');
    motion.sample(3400, out);
    motion.sample(11399.999, out);
    assertRest(out);
    motion.sample(11400, out);
    assert.equal(out.tonguePhase, 'anticipate');
  }
});

test('backward and nonfinite times preserve the last valid motion and color', () => {
  const motion = create({ random: () => 0 });
  const out = frame();
  motion.sample(NaN, out);
  assert.deepEqual(out.colorRgb, rgbAt(0));
  motion.sample(2000, out);
  motion.sample(2200, out);
  const snapshot = structuredClone(out);
  for (const time of [2100, -1, NaN, Infinity, -Infinity]) {
    motion.sample(time, out);
    assert.deepEqual(out, snapshot);
  }
});

test('reduced motion keeps colors cycling, fixes yaw and cancels an active tongue immediately', () => {
  const motion = create({ random: () => 0 });
  const out = frame();
  motion.sample(2000, out);
  motion.sample(2300, out);
  assert.equal(out.extension, 1);
  motion.setReducedMotion(true, 2300);
  motion.sample(2300, out);
  assertRest(out);
  assert.equal(out.yaw, -0.85);
  motion.sample(12500, out);
  assert.deepEqual(out.colorRgb, rgbAt(500));
  assertRest(out);
});

test('leaving reduced motion reserves a fresh interval and repeated settings do not postpone it', () => {
  let draws = 0;
  const motion = create({ random: () => { draws++; return 0.5; }, reducedMotion: true });
  const out = frame();
  motion.sample(100000, out);
  assertRest(out);
  assert.equal(draws, 0);
  motion.setReducedMotion(false, 100000);
  motion.setReducedMotion(false, 101000);
  assert.equal(draws, 1);
  motion.sample(107999.999, out);
  assertRest(out);
  motion.sample(108000, out);
  assert.equal(out.tonguePhase, 'anticipate');
  close(out.yaw, -0.85 + Math.sin(108000 / 2400) * 0.35);
});

test('disposing cancels motion idempotently and prevents new reservations', () => {
  let draws = 0;
  const motion = create({ random: () => { draws++; return 0; } });
  const out = frame();
  motion.sample(2300, out);
  motion.dispose();
  motion.dispose();
  motion.setReducedMotion(false, 5000);
  motion.sample(100000, out);
  assertRest(out);
  assert.equal(draws, 1);
});
