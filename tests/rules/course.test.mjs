// 出題の生成（受入試験 PLAY-01, PLAY-08, PLAY-09 の判定部分）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES_V1,
  COURSE_V1,
  makeCourse,
  makeDecorations,
  validateCourse,
  pointFromHs,
  hsFromPoint,
  vFromBar,
  barFromV,
  deltaEHsv,
  matchUnits,
  bandOf,
} from '../../src/rules/v1/index.js';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i);

test('PLAY-08: 同じ番号・版なら同じ50色、別の番号なら別の色', () => {
  const a = makeCourse(123456);
  const b = makeCourse(123456);
  assert.deepEqual(a.targets, b.targets);
  const c = makeCourse(123457);
  assert.notDeepEqual(a.targets, c.targets);
  assert.throws(() => makeCourse(1, 'kamereoru-course-v0'));
  assert.throws(() => makeCourse(-1));
  assert.throws(() => makeCourse(2 ** 32));
});

test('PLAY-08: 装飾は別の乱数で作り、装飾を何度作っても色順は変わらない', () => {
  const before = makeCourse(42).targets;
  const deco = makeDecorations(42);
  assert.equal(deco.length, 50);
  makeDecorations(42);
  makeDecorations(99);
  const after = makeCourse(42).targets;
  assert.deepEqual(after, before);
  // 主役の建物が多いこと（約70%は初期候補）
  const houses = deco.slice(0, 19).filter((d) => d.kind === 'house').length;
  assert.ok(houses >= 8, `houses ${houses}`);
});

test('PLAY-01/PLAY-09: 固定番号0〜999の全5万棟が帯の条件を満たし、操作範囲内で往復が一致する', () => {
  const R = 150;
  const H = 280;
  let fallbacks = 0;
  for (const seed of SEEDS) {
    const course = makeCourse(seed);
    assert.deepEqual(validateCourse(course), [], `seed ${seed}`);
    course.targets.forEach((t, i) => {
      const index = i + 1;
      // 1〜19棟は明るさ100%（パレットだけで作れる）
      if (index < RULES_V1.brightnessUnlockBuilding) assert.equal(t.v, 10000);
      // 操作値→位置→操作値
      const p = pointFromHs(t.h, t.s, R);
      const hs = hsFromPoint(p.dx, p.dy, R);
      assert.equal(hs.s, t.s);
      assert.equal(hs.h, t.h);
      assert.equal(vFromBar(barFromV(t.v, H), H), t.v);
    });
    // 最初の建物は初期の緑と同じにならない（自動擬態しない）
    assert.ok(matchUnits(RULES_V1.initialColor, course.targets[0]) < RULES_V1.match.successMinUnits);
    fallbacks += course.meta.filter((m) => m.fallback).length;
  }
  // 代替色は例外的にしか使われない
  assert.ok(fallbacks < SEEDS.length * 50 * 0.01, `fallbacks ${fallbacks}`);
});

test('候補をすべて却下しても、帯の条件を満たす代替列で50棟を作り終える', () => {
  for (const seed of SEEDS) {
    const course = makeCourse(seed, RULES_V1.generatorVersion, { rejectAllRandom: true });
    assert.equal(course.targets.length, 50);
    assert.ok(course.meta.every((m) => m.fallback));
    assert.deepEqual(validateCourse(course), [], `seed ${seed}`);
  }
});

test('40〜50棟は明→暗→明→暗の交互、直前の棟から色が必ず変わる', () => {
  for (const seed of SEEDS.slice(0, 200)) {
    const course = makeCourse(seed);
    const late = course.targets.slice(39);
    for (let i = 1; i < late.length; i += 1) {
      const up = late[i].v > late[i - 1].v;
      const prevUp = i >= 2 ? late[i - 1].v > late[i - 2].v : !up;
      assert.notEqual(up, prevUp, `seed ${seed} building ${40 + i}`);
      assert.ok(Math.abs(late[i].v - late[i - 1].v) >= 3500);
    }
    for (let i = 1; i < 50; i += 1) {
      assert.ok(deltaEHsv(course.targets[i - 1], course.targets[i]) >= bandOf(i + 1, COURSE_V1).deltaE[0]);
    }
  }
});
