// 操作履歴の記録・圧縮・再生（VERIFY-01〜03 の計算部分）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES_V1,
  createGame,
  initialState,
  advance,
  summarize,
  createRecorder,
  decodeHistory,
  compactHistory,
  replayHistory,
  stateFromHistory,
  makeCourse,
} from '../../src/rules/v1/index.js';
import { createRng } from '../../src/rules/v1/course.js';

/** 本物の色差で遊ぶ「人に似た」操作を作る。目標色へ少しずつ近づき、ときどき外す。 */
export function simulatePlay(seed, { quitAt = null, twoFinger = true, jitter = 3 } = {}) {
  const game = createGame({ seed });
  const rng = createRng(seed, 0x51ab);
  const rec = createRecorder();
  let state = initialState(game);
  let t = 0;
  const color = { ...RULES_V1.initialColor };
  const step = (ev) => {
    const r = advance(state, ev, game);
    state = r.state;
    if (ev.type !== 'tick') rec.push(ev);
  };
  while (state.status === 'playing') {
    t += 4 + rng.int(0, 30);
    if (quitAt != null && t >= quitAt) {
      step({ type: 'quit', t: quitAt });
      break;
    }
    const building = Math.min(50, Math.floor(t / RULES_V1.buildingMs) + 1);
    const target = game.course.targets[building - 1];
    // 色合い・鮮やかさを近づける（2本指なら明るさも同時に）
    const dh = ((target.h - color.h + 54000) % 36000) - 18000;
    color.h = (color.h + Math.sign(dh) * Math.min(Math.abs(dh), 900 + rng.int(0, 400)) + 36000) % 36000;
    color.s += Math.sign(target.s - color.s) * Math.min(Math.abs(target.s - color.s), 400);
    if (state.brightnessUnlocked && (twoFinger || rng.int(0, 1))) {
      color.v += Math.sign(target.v - color.v) * Math.min(Math.abs(target.v - color.v), 500);
    }
    if (rng.int(0, 100) < jitter) color.h = (color.h + 2000) % 36000;
    step({ type: 'color', t, h: color.h, s: color.s, v: color.v });
    // 同じ値を続けて送る（同値圧縮の対象）
    if (rng.int(0, 10) === 0) step({ type: 'color', t, h: color.h, s: color.s, v: color.v });
    if (rng.int(0, 1000) === 0) {
      step({ type: 'pause', t });
      step({ type: 'resume', t });
    }
    if (t > 300000) break;
  }
  return { game, state, entries: rec.entries };
}

test('記録した履歴を初期状態から再生すると、遊んだ時と同じ結果になる', () => {
  for (const seed of [1, 2, 3, 77, 1000, 65535, 4294967295]) {
    const live = simulatePlay(seed);
    const replay = replayHistory(createGame({ seed }), live.entries);
    assert.equal(replay.error, undefined);
    assert.deepEqual(replay.summary, summarize(live.state), `seed ${seed}`);
  }
});

test('途中終了も、途中終了の記録から同じ棟数で再現する', () => {
  const live = simulatePlay(9, { quitAt: 123456 });
  assert.equal(live.state.status, 'quit');
  const replay = replayHistory(createGame({ seed: 9 }), live.entries);
  assert.deepEqual(replay.summary, summarize(live.state));
  assert.equal(replay.summary.endT, 123456);
});

test('同値圧縮・同時刻の上書き圧縮の前後で結果が同じ', () => {
  for (const seed of [5, 6, 7]) {
    const live = simulatePlay(seed);
    const compact = compactHistory(live.entries);
    assert.ok(compact.length <= live.entries.length);
    const a = replayHistory(createGame({ seed }), live.entries).summary;
    const b = replayHistory(createGame({ seed }), compact).summary;
    assert.deepEqual(a, b);
  }
});

test('猶予中の色変更も記録し、次の評価開始時の色を正確に復元する', () => {
  const game = createGame({ seed: 11 });
  const rec = createRecorder();
  const target = game.course.targets[1];
  // 1棟目の色に合わせ、評価終了直後（猶予中）に2棟目の色へ合わせる
  rec.push({ type: 'color', t: 0, ...game.course.targets[0] });
  rec.push({ type: 'color', t: 4600, ...target });
  rec.push({ type: 'quit', t: 10001 });
  const r = replayHistory(game, rec.entries).state;
  assert.equal(r.buildings[1].matchSum, 100 * RULES_V1.match.unitsPerPercent * 3000);
});

test('履歴の形式検査：時刻の逆行・不正な種類・範囲外を拒否する', () => {
  assert.equal(decodeHistory([[0, -1, 0, 0, 0]]).error, 'history_time_backwards');
  assert.equal(decodeHistory([[9, 0]]).error, 'history_entry_kind');
  assert.equal(decodeHistory([[0, 0, 1.5, 0, 0]]).error, 'history_entry_shape');
  assert.equal(decodeHistory('x').error, 'history_not_array');
  assert.equal(decodeHistory([[1, 999999]]).error, 'history_time_range');
  const rec = createRecorder();
  rec.push({ type: 'color', t: 10, h: 1, s: 2, v: 10000 });
  assert.equal(rec.push({ type: 'color', t: 11, h: 1, s: 2, v: 10000 }), false);
  assert.throws(() => rec.push({ type: 'color', t: 5, h: 1, s: 2, v: 10000 }));
});

test('保存した履歴から進行中の状態を作り直せる（保存の検算）', () => {
  const live = simulatePlay(21, { quitAt: 77777 });
  const rebuilt = stateFromHistory(createGame({ seed: 21 }), live.entries.slice(0, -1), 77777);
  assert.equal(rebuilt.state.passed, live.state.passed);
  assert.deepEqual(rebuilt.state.buildings, live.state.buildings);
});

test('高頻度の2本指操作でも、履歴の件数とサイズが上限内', () => {
  const live = simulatePlay(31, { jitter: 10 });
  const json = JSON.stringify(live.entries);
  assert.ok(live.entries.length < 200000);
  // 250秒を平均17ms刻みで操作しても、およそ数百KB
  assert.ok(json.length < 600000, `${json.length} bytes`);
});
