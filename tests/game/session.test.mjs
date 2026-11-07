// 本編の進行役（ゲーム内時計・長い停止・保存単位）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../../src/game/session.js';
import { createAlertStageTracker, createInstantSuccessTracker } from '../../src/game/feedback.js';
import { RULES_V1, replayHistory, createGame, summarize } from '../../src/rules/v1/index.js';

const meta = (seed = 7) => ({ playId: 'p', launchId: 'l', ranked: false, name: '', seed, gameVersion: 't' });

test('ゲーム内時刻は実時間の差で進み、描画回数に依存しない', () => {
  const a = new GameSession(meta());
  const b = new GameSession(meta());
  a.startClock(1000);
  b.startClock(5000);
  for (let p = 1000; p <= 1000 + 9000; p += 16) a.frame(p);
  for (let p = 5000; p <= 5000 + 9000; p += 250) b.frame(p);
  a.frame(10000);
  b.frame(14000);
  // 初期の緑のままなので途中で発見される。描画間隔が違っても同じ時刻・同じ結果になる
  assert.equal(a.state.status, 'detected');
  assert.equal(a.state.endT, b.state.endT);
  assert.deepEqual(a.summary(), b.summary());
  const c = new GameSession(meta());
  c.startClock(0);
  for (let q = 16; q < 1234; q += 16) c.frame(q);
  c.frame(1234);
  assert.equal(c.state.t, 1234);
});

test('長い処理停止（1秒超）は時間を進めず自動停止にする', () => {
  const s = new GameSession(meta());
  const paused = [];
  s.on((evs) => evs.forEach((e) => e.type === 'paused' && paused.push(e.reason)));
  s.startClock(0);
  s.frame(500);
  s.frame(900);
  s.frame(900 + RULES_V1.longStallMs + 1);
  assert.equal(s.running, false);
  assert.equal(s.state.t, 900);
  assert.deepEqual(paused, ['stall']);
  // 再開すると、停止していた時間は加算されない
  s.startClock(50000);
  s.frame(50100);
  assert.equal(s.state.t, 1000);
});

test('停止中の入力は受け付けず、解放前の明るさは100%に固定する', () => {
  const s = new GameSession(meta());
  assert.equal(s.input({ h: 1, s: 1, v: 10000 }, 0), false);
  s.startClock(0);
  s.input({ h: 100, s: 200, v: 4000 }, 10);
  assert.deepEqual(s.state.color, { h: 100, s: 200, v: 10000 });
  assert.equal(s.state.violations.length, 0);
  s.pause('user');
  assert.equal(s.input({ h: 5, s: 5, v: 10000 }, 20), false);
  assert.equal(s.state.color.h, 100);
});

test('保存単位から作り直すと同じ状態。食い違う保存・未知の版は作り直さない', () => {
  const s = new GameSession(meta(99));
  s.startClock(0);
  for (let p = 0; p < 30000; p += 37) {
    s.frame(p);
    if (p % 370 === 0) s.input({ h: (p * 7) % 36000, s: 5000, v: 10000 }, p);
  }
  const snap = JSON.parse(JSON.stringify(s.snapshot()));
  const r = GameSession.fromSnapshot(snap);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.session.summary(), s.summary());
  assert.equal(r.session.state.alert, s.state.alert);
  assert.deepEqual(r.session.state.color, s.state.color);

  const broken = JSON.parse(JSON.stringify(snap));
  broken.state.alert += 1;
  assert.equal(GameSession.fromSnapshot(broken).error, 'inconsistent_snapshot');
  const other = JSON.parse(JSON.stringify(snap));
  other.meta.rulesVersion = 'kamereoru-rules-v0';
  assert.equal(GameSession.fromSnapshot(other).error, 'unknown_rules_version');
  assert.equal(GameSession.fromSnapshot({ format: 'x' }).error, 'unknown_format');
});

test('進行中に記録した履歴を再生すると、終了結果が一致する（停止・再開を含む）', () => {
  const s = new GameSession(meta(3));
  s.startClock(0);
  let p = 0;
  const game = createGame({ seed: 3 });
  while (!s.ended && p < 300000) {
    p += 20;
    s.frame(p);
    const target = game.course.targets[Math.min(49, Math.floor(s.state.t / 5000))];
    if (p % 100 === 0) s.input({ ...target, v: s.state.brightnessUnlocked ? target.v : 10000 }, p);
    if (p === 40000) {
      s.pause('user');
      s.startClock(p + 5000);
      p += 5000;
    }
  }
  const replay = replayHistory(game, s.recorder.entries);
  assert.deepEqual(replay.summary, summarize(s.state));
});

test('GAME-13: 警戒段階の境目付近を短時間往復しても、警察の人数が点滅しない', () => {
  const tracker = createAlertStageTracker();
  const seq = [];
  for (const a of [29000, 30000, 29500, 28000, 30500, 26000, 25500, 24999, 26000, 31000, 69000, 70000, 68000, 66000, 64999, 71000]) {
    seq.push(tracker.update(a));
  }
  // 30で1人、25未満で0人。70で2人、65未満で1人。
  assert.deepEqual(seq, [0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 2, 2, 2, 1, 2]);
});

test('GAME-18: 瞬間の成功は0.2秒続いた後に同じ棟で1回だけ知らせる（棟の成功とは別）', () => {
  const tr = createInstantSuccessTracker({ holdMs: 200 });
  const S = RULES_V1.match.successMinUnits;
  const st = (t, evalBuilding, matchUnits) => ({ t, evalBuilding, matchUnits });
  assert.equal(tr.update(st(1600, 1, S)), false);
  assert.equal(tr.update(st(1799, 1, S)), false);
  assert.equal(tr.update(st(1800, 1, S)), true);
  assert.equal(tr.update(st(2000, 1, S)), false); // 同じ棟では1回
  assert.equal(tr.update(st(2100, 1, S - 1)), false);
  assert.equal(tr.update(st(2400, 1, S)), false);
  assert.equal(tr.update(st(4600, 0, null)), false); // 猶予中は知らせない
  assert.equal(tr.update(st(6500, 2, S)), false);
  assert.equal(tr.update(st(6700, 2, S)), true);
});
