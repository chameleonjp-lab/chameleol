// 判定エンジンの照合例（受入試験 GAME-01〜06, 08〜12, 14〜16 の判定部分）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES_V1,
  advance,
  initialState,
  rankAverage,
  formatRankAverage,
  summarize,
  totalMs,
  meanFraction,
} from '../../src/rules/v1/index.js';
import { U, stubGame, run, setColor, evalStart, evalEnd, exitAt } from './helpers.mjs';

const INIT_H = RULES_V1.initialColor.h; // 10765
const PERFECT = 100 * U;

test('GAME-01: 停止なしで50棟を通過すると250秒でクリアし、51棟目を出題しない', () => {
  const game = stubGame({ [INIT_H]: PERFECT });
  const { state, events } = run(game, [], { until: 400000 });
  assert.equal(totalMs(), 250000);
  assert.equal(state.status, 'cleared');
  assert.equal(state.endT, 250000);
  assert.equal(state.passed, 50);
  assert.equal(events.filter((e) => e.type === 'pass').length, 50);
  assert.equal(events.filter((e) => e.type === 'evalStart').length, 50);
  assert.equal(game.course.targets.length, 50);
  assert.ok(!events.some((e) => e.building === 51));
});

test('GAME-16: 仮配点で50棟すべて100%なら 通過＋正確さ5000、連続880、クリア200、合計6080', () => {
  const game = stubGame({ [INIT_H]: PERFECT });
  const { state } = run(game, [], { until: 250000 });
  assert.equal(state.score.pass + state.score.accuracy, 5000);
  assert.equal(state.score.combo, 880);
  assert.equal(state.score.clear, 200);
  assert.equal(state.score.total, 6080);
  assert.equal(state.maxCombo, 50);
  assert.equal(rankAverage(state.buildings), 10000);
});

test('GAME-09: 1秒95%＋2秒75%の建物平均は 245/3%（サンプル数で単純平均しない）', () => {
  const game = stubGame({ [INIT_H]: 95 * U, 2: 75 * U, 3: 0 });
  const { state } = run(game, [setColor(evalStart(1) + 1000, 2), setColor(evalEnd(1), INIT_H), { type: 'quit', t: exitAt(1) + 10 }]);
  const b = state.buildings[0];
  assert.equal(b.evalMs, 3000);
  // 平均 = matchSum / evalMs = 245/3 %  ⇔  matchSum × 3 = 245 × U × evalMs
  assert.equal(b.matchSum * 3, 245 * U * b.evalMs);
  // 描画1回ずつの単純平均 (95+75)/2=85 ではない
  assert.equal(b.success, false);
});

test('GAME-10: 平均92・81・87の3棟を通過し、4棟目の途中で発見 → 3棟・86.67%', () => {
  const game = stubGame({ [INIT_H]: 92 * U, 2: 81 * U, 3: 87 * U, 4: 0 });
  const { state } = run(game, [
    setColor(evalEnd(1), 2),
    setColor(evalEnd(2), 3),
    setColor(evalEnd(3), 4),
  ], { until: 20000 });
  assert.equal(state.status, 'detected');
  assert.equal(state.passed, 3);
  assert.equal(rankAverage(state.buildings), 8667);
  assert.equal(formatRankAverage(rankAverage(state.buildings)), '86.67');
  // 81%の通過棟も平均に含める
  assert.deepEqual(state.buildings.map((b) => b.matchSum / b.evalMs / U), [92, 81, 87]);
  // 2棟目（81%＝少し目立つ）で警戒36、3棟目（成功）で0へ、4棟目の危険で 100000/45 → 2223ms後に発見
  assert.equal(state.endT, evalStart(4) + 2223);
});

test('GAME-14: 建物平均84.999%は連続成功にならず、85.000%は成功（表示の丸めで判定しない）', () => {
  const game = stubGame({ [INIT_H]: 84999000, 2: 85000000 });
  const { state } = run(game, [setColor(evalEnd(1), 2), { type: 'quit', t: exitAt(2) + 1 }]);
  assert.equal(state.buildings[0].success, false);
  assert.equal(state.buildings[1].success, true);
  assert.equal(state.buildings[0].combo, 0);
  assert.equal(state.buildings[1].combo, 1);
  // 表示上は84.999%→85.00%に見えても、判定は丸め前
  assert.equal(formatRankAverage(rankAverage([state.buildings[0]])), '85.00');
});

test('GAME-15: 成功2→3→4→5→10棟と失敗で、段階表の点を各成功棟へ加算し、失敗で連続数だけ0', () => {
  // 1〜10棟成功、11棟失敗、12〜14棟成功
  const table = { [INIT_H]: PERFECT, 2: 70 * U }; // 70%は少し目立つ（連続成功は途切れるが発見されない）
  const game = stubGame(table);
  const { state } = run(game, [setColor(evalEnd(10), 2), setColor(evalEnd(11), INIT_H), { type: 'quit', t: exitAt(14) + 1 }]);
  const bonus = state.buildings.map((b) => b.comboBonus);
  const combos = state.buildings.map((b) => b.combo);
  assert.deepEqual(combos, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 1, 2, 3]);
  assert.deepEqual(bonus, [0, 0, 5, 5, 10, 10, 10, 10, 10, 20, 0, 0, 0, 5]);
  // 過去の得点は差し引かない
  assert.equal(state.score.combo, bonus.reduce((a, b) => a + b, 0));
  assert.equal(state.maxCombo, 10);
});

test('GAME-04/05: 評価を締めた後でも、出口を越える前の途中終了は未通過。250秒ちょうどは通過が先', () => {
  const game = stubGame({ [INIT_H]: PERFECT });
  const before = run(game, [{ type: 'quit', t: evalEnd(3) + 200 }]).state;
  assert.equal(before.status, 'quit');
  assert.equal(before.passed, 2);
  assert.equal(before.score.total, 200 - 0); // 2棟 × 100点（連続1〜2は加点0）

  const lastGrace = run(game, [{ type: 'quit', t: 249700 }]).state;
  assert.equal(lastGrace.passed, 49);
  assert.equal(lastGrace.score.clear, 0);
  assert.equal(lastGrace.status, 'quit');

  const atExit = run(game, [{ type: 'quit', t: 250000 }]).state;
  assert.equal(atExit.passed, 50);
  assert.equal(atExit.status, 'cleared');
  assert.equal(atExit.score.clear, 200);
  // 終了後の入力は何も変えない（クリア点は1回だけ）
  const again = advance(atExit, { type: 'quit', t: 250001 }, game).state;
  assert.equal(again.score.total, atExit.score.total);
});

test('GAME-06: 初棟・通常棟・最終棟の評価時間はすべて同じ3秒', () => {
  const game = stubGame({ [INIT_H]: PERFECT });
  const { state } = run(game, [], { until: 250000 });
  assert.ok(state.buildings.every((b) => b.evalMs === 3000));
  assert.equal(state.buildings[0].index, 1);
  assert.equal(state.buildings[49].index, 50);
});

test('GAME-03: 猶予中の大きな色変更は、警戒の増減と平均に入らない', () => {
  const game = stubGame({ [INIT_H]: 90 * U, 2: 0, 3: 60 * U });
  const plain = run(game, [{ type: 'quit', t: exitAt(5) + 1 }]).state;
  const grace = [];
  for (let i = 1; i <= 5; i += 1) {
    grace.push(setColor(evalEnd(i), 2), setColor(evalEnd(i) + 100, 3), setColor(evalEnd(i) + 1999, INIT_H));
  }
  const noisy = run(game, [...grace, { type: 'quit', t: exitAt(5) + 1 }]).state;
  assert.deepEqual(noisy.buildings, plain.buildings);
  assert.equal(noisy.alert, plain.alert);
  assert.equal(noisy.inputs, 15);
});

test('GAME-08: 同じ履歴を異なる描画間隔で処理しても、有効時間・平均・警戒・得点が同じ', () => {
  const game = stubGame({ [INIT_H]: 88 * U, 2: 40 * U, 3: 70 * U, 4: 99 * U });
  const inputs = [];
  let h = 2;
  for (let t = 1234; t < 60000; t += 777) {
    inputs.push(setColor(t, h));
    h = h === 4 ? 2 : h + 1;
  }
  const finish = { type: 'quit', t: 61111 };
  const base = run(game, [...inputs, finish]);
  for (const every of [1, 7, 16, 33, 250, 999]) {
    const other = run(game, [...inputs, finish], { tickEvery: every });
    assert.deepEqual(summarize(other.state), summarize(base.state), `tick ${every}`);
    assert.equal(other.state.alert, base.state.alert);
  }
});

test('GAME-11: 警戒は棟をまたいで持ち越し、猶予中は値を固定する', () => {
  const game = stubGame({ [INIT_H]: 70 * U });
  let state = initialState(game);
  state = advance(state, { type: 'tick', t: evalEnd(1) }, game).state;
  assert.equal(state.alert, 36000); // 少し目立つ：毎秒+12 × 3秒
  const atGraceStart = state.alert;
  state = advance(state, { type: 'tick', t: evalStart(2) }, game).state;
  assert.equal(state.alert, atGraceStart);
  state = advance(state, { type: 'tick', t: evalEnd(2) }, game).state;
  assert.equal(state.alert, 72000);
});

test('GAME-12: 警戒100に届いた刻みで1回だけ発見し、それ以外の理由では終了しない', () => {
  const game = stubGame({ [INIT_H]: 0 });
  const { state, events } = run(game, [], { until: 250000, tickEvery: 50 });
  assert.equal(events.filter((e) => e.type === 'detected').length, 1);
  assert.equal(state.status, 'detected');
  assert.equal(state.endT, 1500 + Math.ceil(100000 / 45));
  assert.equal(state.passed, 0);
  assert.equal(rankAverage(state.buildings), null);
});

test('評価終了と警戒100が同時なら、発見を先に確定し、その棟を通過させない', () => {
  // 1棟目：少し目立つ3秒 → 36000
  // 2棟目：危険41ms(+1845) → 成功199ms(-6965) → 少し目立つ2760ms(+33120) → 64000
  // 3棟目：少し目立つ3000ms(+36000) → 評価終了の14500msでちょうど100000
  const game = stubGame({ [INIT_H]: 70 * U, 2: 0, 3: 90 * U });
  const s2 = evalStart(2);
  const { state, events } = run(game, [
    setColor(s2, 2),
    setColor(s2 + 41, 3),
    setColor(s2 + 41 + 199, INIT_H),
  ], { until: 30000 });
  assert.equal(state.status, 'detected');
  assert.equal(state.endT, evalEnd(3));
  assert.equal(state.passed, 2);
  assert.ok(!events.some((e) => e.type === 'evalEnd' && e.building === 3));
});

test('評価開始と同時の色変更は新しい色、評価終了と同時の色変更は前の棟に入らない', () => {
  const game = stubGame({ [INIT_H]: 70 * U, 2: 90 * U });
  const atStart = run(game, [setColor(evalStart(1), 2), { type: 'quit', t: exitAt(1) + 1 }]).state;
  assert.equal(atStart.buildings[0].matchSum, 90 * U * 3000);
  const atEnd = run(game, [setColor(evalEnd(1), 2), { type: 'quit', t: exitAt(1) + 1 }]).state;
  assert.equal(atEnd.buildings[0].matchSum, 70 * U * 3000);
  // 同時刻の複数の色変更は受信順。最後の色が残る
  const sameTime = run(game, [setColor(2000, 2), setColor(2000, INIT_H), { type: 'quit', t: exitAt(1) + 1 }]).state;
  assert.equal(sameTime.buildings[0].matchSum, 70 * U * 3000);
});

test('19→20棟：94.5秒でバーを操作可能、95秒で20棟目に到達、96.5秒で20棟目の評価開始', () => {
  const game = stubGame({ [INIT_H]: PERFECT, 7: PERFECT });
  let state = initialState(game);
  // 解放前の明るさ変更は記録上の違反（端末のバーはロック）。値は100%のまま。
  let r = advance(state, { type: 'color', t: 94499, h: 7, s: 0, v: 5000 }, game);
  assert.equal(r.state.color.v, 10000);
  assert.equal(r.state.violations.at(-1).code, 'locked_brightness');
  state = initialState(game);
  r = advance(state, { type: 'tick', t: 94500 }, game);
  assert.ok(r.events.some((e) => e.type === 'unlockBrightness' && e.t === 94500));
  assert.equal(r.state.brightnessUnlocked, true);
  assert.equal(r.state.color.v, 10000); // 解放しても体色は変えない
  assert.equal(r.state.reached20, false);
  r = advance(r.state, { type: 'color', t: 94600, h: 7, s: 0, v: 6000 }, game);
  assert.equal(r.state.color.v, 6000);
  assert.equal(r.state.violations.length, 0);
  r = advance(r.state, { type: 'tick', t: 95000 }, game);
  assert.ok(r.events.some((e) => e.type === 'reachUnlockBuilding' && e.t === 95000));
  assert.equal(r.state.reached20, true);
  r = advance(r.state, { type: 'tick', t: 96500 }, game);
  assert.ok(r.events.some((e) => e.type === 'evalStart' && e.building === 20 && e.t === 96500));
});

test('開放直前の94.4秒で終了すると、20棟目に未到達（練習の解放なし）', () => {
  const game = stubGame({ [INIT_H]: PERFECT });
  const { state } = run(game, [{ type: 'quit', t: 94400 }]);
  assert.equal(state.reached20, false);
  assert.equal(state.brightnessUnlocked, false);
  assert.equal(state.passed, 18);
});

test('順位用の平均：75.085%は7,509（表示75.09%）。浮動小数の100倍では7,508になる', () => {
  const game = stubGame({ [INIT_H]: 75080000, 2: 75090000 });
  const { state } = run(game, [setColor(evalEnd(1), 2), { type: 'quit', t: exitAt(2) + 1 }]);
  assert.equal(rankAverage(state.buildings), 7509);
  assert.equal(formatRankAverage(7509), '75.09');
  assert.equal(Math.round(75.085 * 100), 7508); // 単純な実装の誤り
});

test('順位用の平均：80.004%と80.005%は最後に丸めて80.00%（先に丸めると80.01%）', () => {
  const game = stubGame({ [INIT_H]: 80004000, 2: 80005000 });
  const { state } = run(game, [setColor(evalEnd(1), 2), { type: 'quit', t: exitAt(2) + 1 }]);
  assert.equal(rankAverage(state.buildings), 8000);
  const preRounded = (Math.round(80.004 * 100) + Math.round(80.005 * 100)) / 2;
  assert.notEqual(preRounded, 8000);
});

test('RANK-TEST-03: 92.341と92.344は同じ9234、92.345は9235', () => {
  const mk = (pct) => [{ matchSum: Math.round(pct * U) * 3000, evalMs: 3000 }];
  assert.equal(rankAverage(mk(92.341)), 9234);
  assert.equal(rankAverage(mk(92.344)), 9234);
  assert.equal(rankAverage(mk(92.345)), 9235);
});

test('0棟の平均は空値、分数は丸め前の平均を保持する', () => {
  assert.equal(rankAverage([]), null);
  assert.equal(meanFraction([]), null);
  const f = meanFraction([
    { matchSum: 1, evalMs: 3 },
    { matchSum: 1, evalMs: 6 },
  ]);
  // (1/3 + 1/6) / 2 = 1/4
  assert.equal(f.num, 1n);
  assert.equal(f.den, 4n);
});

test('時刻の逆行・範囲外の色は記録上の違反として扱い、状態を進めない', () => {
  const game = stubGame({ [INIT_H]: PERFECT });
  let state = advance(initialState(game), { type: 'tick', t: 3000 }, game).state;
  const back = advance(state, { type: 'color', t: 2000, h: 1, s: 0, v: 10000 }, game).state;
  assert.equal(back.t, 3000);
  assert.equal(back.violations.at(-1).code, 'time_backwards');
  const bad = advance(state, { type: 'color', t: 3001, h: 36000, s: 0, v: 10000 }, game).state;
  assert.equal(bad.violations.at(-1).code, 'color_range');
});
