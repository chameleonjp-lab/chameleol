// 練習モード（受入試験 PRACT-01〜05 の判定部分）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractice, DIFFICULTIES, PRACTICE_CONFIG } from '../../src/practice/session.js';
import { RULES_V1, classifyMatch, matchUnits, deltaEHsv } from '../../src/rules/v1/index.js';

const goTo = (p, color) => p.setColor(color);

test('PRACT-01: 各3問、かんたん→ふつう→むずかしい。本編と同じ判定（85%＝色差6）を使う', () => {
  for (const kind of ['basic', 'brightness']) {
    const p = createPractice({ kind, seed: 42 });
    const seen = [];
    for (let i = 0; i < 3; i += 1) {
      const q = p.question;
      seen.push(q.difficulty);
      if (kind === 'basic') assert.equal(q.target.v, 10000);
      goTo(p, q.target);
      p.tick(PRACTICE_CONFIG.holdMs);
      assert.equal(q.status, 'succeeded');
      assert.equal(classifyMatch(q.bestMatch), 'success');
      p.next();
    }
    assert.deepEqual(seen, DIFFICULTIES);
    assert.equal(p.finished, true);
    assert.equal(p.result(1).questions.length, 3);
  }
});

test('R7: 何もしなくても成功する出題はない（固定番号0〜499、両種類、全問）', () => {
  for (let seed = 0; seed < 500; seed += 1) {
    for (const kind of ['basic', 'brightness']) {
      const p = createPractice({ kind, seed });
      for (let i = 0; i < 3; i += 1) {
        const q = p.question;
        assert.notEqual(classifyMatch(matchUnits(p.color, q.target)), 'success', `seed ${seed} ${kind} q${i + 1}`);
        p.tick(10000); // 10秒放置
        assert.equal(q.status, 'active');
        assert.equal(q.firstSuccessMs, null);
        p.skip();
        p.next();
      }
    }
  }
});

test('候補をすべて却下しても、同じ難しさの条件で成功域外の目標を選ぶ', () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const p = createPractice({ kind: 'brightness', seed, rejectAllRandom: true });
    for (let i = 0; i < 3; i += 1) {
      const q = p.question;
      assert.equal(q.fallback, true);
      const cond = PRACTICE_CONFIG.brightness[q.difficulty];
      const dE = deltaEHsv(p.color, q.target);
      assert.ok(dE >= cond.dE[0] && dE <= cond.dE[1], `seed ${seed} q${i + 1} dE ${dE}`);
      assert.notEqual(classifyMatch(matchUnits(p.color, q.target)), 'success');
      p.skip();
      p.next();
    }
  }
});

test('PRACT-02: 次の問題は直前の色を引き継ぎ、スキップしても正解色へ自動で変えない', () => {
  const p = createPractice({ kind: 'brightness', seed: 7 });
  assert.deepEqual(p.color, RULES_V1.initialColor); // 1問目は緑・明るさ100%
  const mine = { h: 1234, s: 5678, v: 4321 };
  p.setColor(mine);
  p.skip();
  assert.deepEqual(p.color, mine);
  p.next();
  assert.deepEqual(p.color, mine);
  assert.notDeepEqual(p.question.target, mine);
});

test('PRACT-03: 最初の成功時間は固定し、最高一致度は問題が終わるまで更新する', () => {
  const p = createPractice({ kind: 'basic', seed: 3 });
  const q = p.question;
  // 成功域ぎりぎりの色を作る（色合いを少しずらす）
  let near = null;
  for (let dh = 900; dh >= 0; dh -= 10) {
    const c = { ...q.target, h: (q.target.h + dh) % 36000 };
    if (classifyMatch(matchUnits(c, q.target)) === 'success') {
      near = c;
      break;
    }
  }
  p.tick(1000);
  p.setColor(near);
  p.tick(300);
  assert.equal(q.firstSuccessMs, null, '0.5秒保つまでは成功にしない');
  p.tick(250);
  assert.equal(q.firstSuccessMs, 1550);
  const firstBest = q.bestMatch;
  p.setColor({ h: (q.target.h + 18000) % 36000, s: 10000, v: 10000 }); // 一度外す
  p.tick(1000);
  assert.equal(q.firstSuccessMs, 1550, '外しても最初の成功時間は消えない');
  p.setColor(q.target);
  p.tick(10);
  assert.ok(q.bestMatch > firstBest);
  assert.equal(q.bestMatch, 100 * RULES_V1.match.unitsPerPercent);
  assert.equal(p.skip(), false, '成功後はスキップで二重に数えない');
  p.next();
  assert.equal(p.questions[0].status, 'succeeded');
});

test('PRACT-05: 3問すべてスキップでも終了でき、最後の色の一致度と最高一致度を分けて残す', () => {
  const p = createPractice({ kind: 'basic', seed: 11 });
  for (let i = 0; i < 3; i += 1) {
    const q = p.question;
    p.setColor({ ...q.target, h: (q.target.h + 3000) % 36000 });
    p.setColor({ h: (q.target.h + 18000) % 36000, s: 10000, v: 10000 });
    p.skip();
    assert.ok(q.lastMatch <= q.bestMatch);
    assert.notEqual(q.lastMatch, q.bestMatch);
    const elapsed = q.elapsedMs;
    p.tick(5000); // 答え合わせ中は計測しない
    assert.equal(q.elapsedMs, elapsed);
    p.next();
  }
  const r = p.result(9);
  assert.deepEqual(r.questions.map((q) => q.status), ['skipped', 'skipped', 'skipped']);
  assert.ok(r.questions.every((q) => q.firstSuccessMs === null));
});

test('操作したかどうかを記録する（操作後の終了だけ確認する）', () => {
  const p = createPractice({ kind: 'basic', seed: 1 });
  assert.equal(p.touched, false);
  p.setColor(p.color);
  assert.equal(p.touched, false);
  p.setColor({ ...p.color, h: (p.color.h + 100) % 36000 });
  assert.equal(p.touched, true);
});
