// 端末保存（受入試験 SAVE-TEST-01〜04、PRACT-06/07 の保存部分）。IndexedDB は fake-indexeddb で代用する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore, StaleWriterError, RUN_SLOT } from '../../src/storage/store.js';
import { GameSession } from '../../src/game/session.js';

let n = 0;
const fresh = (opts = {}) => openStore({ indexedDB: new IDBFactory(), name: `t${(n += 1)}`, ...opts });
const meta = (playId, seed = 5) => ({ playId, launchId: `L-${playId}`, ranked: true, name: 'テスト', seed, gameVersion: 't' });

// 実時間と同じだけ進める簡単な時計
function advanceSession(session, untilT) {
  if (!session.running) session.startClock(0);
  while (session.state.t < untilT && !session.ended) {
    const perf = session.basePerf + (session.state.t - session.baseT) + 16;
    session.frame(perf);
    const i = Math.min(49, Math.floor(session.state.t / 5000));
    const target = session.game.course.targets[i];
    session.input({ ...target, v: session.state.brightnessUnlocked ? target.v : 10000 }, perf);
  }
}

test('SAVE-TEST-01: 判定中・猶予中・通過直後・20棟付近の保存から、同じ時点を復元できる', async () => {
  const store = await fresh();
  const session = new GameSession(meta('a'));
  const gen = await store.beginRun('tab1', session.snapshot());
  for (const t of [3000, 4700, 5000, 6400, 94600, 95000, 96800]) {
    advanceSession(session, t);
    await store.saveRun('tab1', gen, session.snapshot());
    const loaded = await store.loadRun();
    const r = GameSession.fromSnapshot(loaded.snapshot);
    assert.equal(r.error, undefined, `t=${t}`);
    assert.equal(r.session.state.t, session.state.t);
    assert.equal(r.session.state.alert, session.state.alert);
    assert.deepEqual(r.session.state.color, session.state.color);
    assert.deepEqual(r.session.state.acc, session.state.acc);
    assert.equal(r.session.state.brightnessUnlocked, session.state.brightnessUnlocked);
    assert.equal(r.session.meta.playId, 'a');
    assert.deepEqual(r.session.summary(), session.summary());
  }
  store.close();
});

test('R1: 別のタブが引き継いだ後、古いタブの保存・終了は通らない', async () => {
  const store = await fresh();
  const s = new GameSession(meta('p1'));
  const g1 = await store.beginRun('tabA', s.snapshot());
  advanceSession(s, 8000);
  await store.saveRun('tabA', g1, s.snapshot());
  const claimed = await store.claimRun('tabB');
  assert.equal(claimed.generation, g1 + 1);
  await assert.rejects(store.saveRun('tabA', g1, s.snapshot()), StaleWriterError);
  await assert.rejects(store.endRun('tabA', g1, { playId: 'p1', ranked: true }), StaleWriterError);
  assert.equal((await store.getAll('outbox')).length, 0);
  await store.endRun('tabB', claimed.generation, { playId: 'p1', ranked: true, body: 'x' });
  assert.equal((await store.getAll('outbox')).length, 1);
  store.close();
});

test('R1: 95秒の古い保存が、終了・新規開始の後に届いても、終了済みの欄や新しいプレイを上書きできない', async () => {
  const store = await fresh();
  const old = new GameSession(meta('old'));
  const g1 = await store.beginRun('tab', old.snapshot());
  advanceSession(old, 95000);
  const lateSnapshot = old.snapshot(); // 遅れて届く保存
  old.quit(0);
  await store.endRun('tab', g1, { playId: 'old', ranked: true, body: 'final' });
  // 遅れて届いた保存：終了済みの欄へは書けない
  await assert.rejects(store.saveRun('tab', g1, lateSnapshot), StaleWriterError);
  const next = new GameSession(meta('new'));
  const g2 = await store.beginRun('tab', next.snapshot());
  assert.ok(g2 > g1);
  // 新しいプレイの後に届いても上書きできない（世代・プレイ番号が違う）
  await assert.rejects(store.saveRun('tab', g1, lateSnapshot), StaleWriterError);
  await assert.rejects(store.saveRun('tab', g2, lateSnapshot), StaleWriterError);
  const run = await store.loadRun();
  assert.equal(run.playId, 'new');
  assert.equal(run.status, 'active');
  // 旧結果は1件だけ送信待ちに残る
  const outbox = await store.getAll('outbox');
  assert.deepEqual(outbox.map((x) => x.playId), ['old']);
  store.close();
});

test('古い確認画面からは、その後に始まった別のプレイを引き継いだり保管したりできない', async () => {
  const store = await fresh();
  try {
    const generation = await store.beginRun('tabA', new GameSession(meta('old')).snapshot());
    await store.endRun('tabA', generation, { playId: 'old', ranked: false });
    await store.beginRun('tabB', new GameSession(meta('new')).snapshot());
    const current = await store.loadRun();
    assert.equal(await store.claimRun('tabA', 'old'), null);
    assert.equal(await store.quarantineRun('unknown_format', 'old'), false);
    assert.deepEqual(await store.loadRun(), current);
    assert.deepEqual(await store.getAll('quarantine'), []);
  } finally {
    store.close();
  }
});

test('終了の取引で書き込みに失敗しても、直前の有効な保存が残り、旧結果1件が二重にならない', async () => {
  let fail = true;
  const store = await fresh({ failWrites: (names) => (fail && names.includes('outbox') ? new Error('QuotaExceededError') : null) });
  const s = new GameSession(meta('x'));
  const g = await store.beginRun('tab', s.snapshot());
  advanceSession(s, 12000);
  await store.saveRun('tab', g, s.snapshot());
  await assert.rejects(store.endRun('tab', g, { playId: 'x', ranked: true, body: 'b' }));
  let run = await store.loadRun();
  assert.equal(run.status, 'active');
  assert.equal(run.snapshot.state.t, s.state.t);
  assert.equal((await store.getAll('outbox')).length, 0);
  fail = false;
  await store.endRun('tab', g, { playId: 'x', ranked: true, body: 'b' });
  await assert.rejects(store.endRun('tab', g, { playId: 'x', ranked: true, body: 'b' }), StaleWriterError);
  run = await store.loadRun();
  assert.equal(run.status, 'ended');
  assert.equal((await store.getAll('outbox')).length, 1);
  store.close();
});

test('対象外のプレイはローカル結果へ。端末内ベストも同じ取引で更新する', async () => {
  const store = await fresh();
  const s = new GameSession({ ...meta('u'), ranked: false, name: '' });
  const g = await store.beginRun('tab', s.snapshot());
  await store.endRun('tab', g, { playId: 'u', ranked: false, summary: {} }, { localBest: { '': { buildings: 3, rankAverage: 9000 } } });
  assert.equal((await store.getAll('outbox')).length, 0);
  assert.equal((await store.getAll('localResults')).length, 1);
  assert.deepEqual(await store.get('localBest'), { '': { buildings: 3, rankAverage: 9000 } });
  store.close();
});

test('SAVE-TEST-03: 未知の版・壊れた保存は自動で消さずに隔離する', async () => {
  const store = await fresh();
  const s = new GameSession(meta('q'));
  const g = await store.beginRun('tab', s.snapshot());
  advanceSession(s, 3000);
  const snap = s.snapshot();
  snap.meta.rulesVersion = 'kamereoru-rules-v9';
  await store.saveRun('tab', g, snap);
  const run = await store.loadRun();
  const r = GameSession.fromSnapshot(run.snapshot);
  assert.equal(r.error, 'unknown_rules_version');
  await store.quarantineRun(r.error);
  const q = await store.getAll('quarantine');
  assert.equal(q.length, 1);
  assert.equal(q[0].reason, 'unknown_rules_version');
  assert.equal(q[0].record.snapshot.meta.rulesVersion, 'kamereoru-rules-v9');
  assert.equal((await store.loadRun()).status, 'quarantined');
  // 隔離後は新しいプレイを始められる
  await store.beginRun('tab', new GameSession(meta('q2')).snapshot());
  store.close();
});

test('SAVE-TEST-04: 自動整理は再取得できるものだけ。未送信・進行中・照会情報・設定・解放・端末内ベストは残す', async () => {
  const store = await fresh();
  await store.set('audio', { music: 0, sfx: 0.5, ambient: 0.2, muted: true });
  await store.set('lang', 'th');
  await store.set('flags', { brightnessPractice: true });
  await store.set('localBest', { a: { buildings: 1 } });
  await store.put('outbox', { playId: 'o1', body: 'x' });
  await store.put('records', { playId: 'r1', secret: 's', serverAccepted: true, historyCopy: [1, 2, 3] });
  await store.put('cache', { rows: [] }, 'ranking');
  await store.beginRun('tab', new GameSession(meta('run')).snapshot());
  await store.addPractice({ id: 'p1', completedAt: 1, kind: 'basic', questions: [] });
  const freed = await store.cleanupSafe();
  assert.equal(freed, 1);
  assert.equal(await store.getOne('cache', 'ranking'), undefined);
  const rec = await store.getOne('records', 'r1');
  assert.equal(rec.secret, 's');
  assert.equal(rec.historyCopy, null);
  assert.equal((await store.getAll('outbox')).length, 1);
  assert.equal((await store.loadRun()).status, 'active');
  assert.deepEqual(await store.get('audio'), { music: 0, sfx: 0.5, ambient: 0.2, muted: true });
  assert.equal(await store.get('lang'), 'th');
  assert.deepEqual(await store.get('flags'), { brightnessPractice: true });
  assert.deepEqual(await store.get('localBest'), { a: { buildings: 1 } });
  assert.equal((await store.listPractice()).length, 1, '練習履歴は本人の確認なしに消さない');
  store.close();
});

test('空き不足・書込拒否では試し書きが失敗し、新しいランキング対象プレイの前に分かる', async () => {
  const store = await fresh({ failWrites: (names) => (names.includes('cache') ? new Error('QuotaExceededError') : null) });
  await assert.rejects(store.probeWrite());
  store.close();
  const ok = await fresh();
  assert.equal(await ok.probeWrite(), true);
  ok.close();
});

test('PRACT-06: 3問を処理した練習だけを、種類を合わせて直近2回残す', async () => {
  const store = await fresh();
  await store.addPractice({ id: 'a', completedAt: 1, kind: 'basic', questions: [] });
  await store.addPractice({ id: 'b', completedAt: 2, kind: 'brightness', questions: [] });
  await store.addPractice({ id: 'c', completedAt: 3, kind: 'basic', questions: [] });
  assert.deepEqual((await store.listPractice()).map((x) => x.id), ['c', 'b']);
  // 途中終了は addPractice を呼ばない＝既存2回は残る
  assert.equal((await store.listPractice()).length, 2);
  await store.clearPractice();
  assert.equal((await store.listPractice()).length, 0);
  store.close();
});

test('PRACT-07: 練習の保存は本編の中断データ・回数に触れない', async () => {
  const store = await fresh();
  const s = new GameSession(meta('main'));
  const g = await store.beginRun('tab', s.snapshot());
  advanceSession(s, 7000);
  await store.saveRun('tab', g, s.snapshot());
  const before = await store.loadRun();
  await store.addPractice({ id: 'p', completedAt: 5, kind: 'basic', questions: [] });
  const after = await store.loadRun();
  assert.deepEqual(after, before);
  assert.equal((await store.getAll('launches')).length, 0);
  assert.equal(RUN_SLOT, 'main');
  store.close();
});
