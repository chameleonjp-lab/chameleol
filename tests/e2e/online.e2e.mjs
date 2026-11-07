// 名前ありプレイの通し試験（自動ブラウザ＋検証用の受付サーバー＋使い捨ての PostgreSQL）。
// NET-TEST-01/02/05/06、RANK-07、GAME-17 の送信部分などの部分確認。本番の Supabase には接続しない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome, appState } from './helpers.mjs';
import { startCluster, buildTemplate, createTestDb, dropTestDb } from '../../scripts/testdb.mjs';
import { startLocalApi } from '../../scripts/local-api.mjs';

let cluster;
test.before(async () => {
  cluster = await startCluster();
  buildTemplate(cluster.adminUrl);
});
test.after(() => cluster?.stop());

let n = 0;
async function setup({ apiBase = null } = {}) {
  const name = `online_${process.pid}_${(n += 1)}`;
  const dbUrl = createTestDb(cluster.adminUrl, name);
  const api = await startLocalApi({ dbUrl });
  const env = await launch();
  const base = apiBase ?? api.base;
  await env.context.addInitScript((b) => localStorage.setItem('kamereoru.apiBase', b), base);
  const q = async (sql, params) => (await api.pool.query(sql, params)).rows;
  return {
    env,
    api,
    q,
    async close() {
      await env.close();
      await api.close();
      dropTestDb(cluster.adminUrl, name);
    },
  };
}

/** 非同期の条件を、短い間隔で確かめて待つ（waitForFunction は Promise を待たないため）。 */
async function waitAsync(page, fn, arg, timeout = 15000) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > until) throw new Error('waitAsync timeout');
    await page.waitForTimeout(200);
  }
}

async function followTargets(page, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.evaluate(() => {
      const a = globalThis.__kamereoru;
      const s = a.session;
      if (!s || !s.running) return;
      const i = Math.min(49, Math.floor(s.state.t / 5000));
      const tg = s.game.course.targets[i];
      s.input({ ...tg, v: s.state.brightnessUnlocked ? tg.v : 10000 }, performance.now());
      a.controls.setValues(s.state.color);
    });
    await page.waitForTimeout(150);
  }
}

async function rankedPlay(page, name, ms = 11000) {
  await page.fill('#name-input', name);
  await page.click('[data-testid=home-start]');
  // 初回だけ演出と案内が出る。どれかが来るまで短い間隔で確かめる
  const until = Date.now() + 15000;
  for (;;) {
    if (await page.evaluate(() => globalThis.__kamereoru.session?.running === true)) break;
    if (await page.isVisible('[data-testid=skip-opening]')) await page.click('[data-testid=skip-opening]').catch(() => {});
    if (await page.isVisible('[data-testid=guide-go]')) await page.click('[data-testid=guide-go]').catch(() => {});
    if (Date.now() > until) throw new Error('ranked play did not start');
    await page.waitForTimeout(100);
  }
  const meta = await page.evaluate(() => globalThis.__kamereoru.session.meta);
  assert.equal(meta.ranked, true);
  await followTargets(page, ms);
  return meta;
}

async function quitToHome(page) {
  await page.click('[data-testid=pause]');
  await page.click('[data-testid=pause-home]');
  await page.click('[data-testid=quit-confirm]');
  await page.waitForSelector('[data-testid=home-start]');
}

test('名前ありで遊ぶ：開始受付→本編→途中終了→送信→再計算→正式登録→ランキングに表示', async () => {
  const s = await setup();
  const { page } = s.env;
  try {
    await openHome(page, s.env.url);
    const meta = await rankedPlay(page, 'テストさん');
    const passed = (await appState(page)).passed;
    assert.ok(passed >= 2, `passed ${passed}`);
    await quitToHome(page);
    // 送信と検証を待つ
    await waitAsync(page, async (playId) => (await globalThis.__kamereoru.store.getOne('records', playId)) != null, meta.playId);
    await s.api.settle();
    const rows = await s.q('select status, buildings, display_name from private.kamereoru_results');
    const local = await page.evaluate(() => globalThis.__kamereoru.store.getAll('records'));
    assert.equal(rows.length, 1, JSON.stringify({ local: local.map((r) => [r.playId, r.status]), meta: meta.playId }));
    assert.equal(rows[0].status, 'official');
    assert.equal(rows[0].buildings, passed);
    assert.equal(rows[0].display_name, 'テストさん');
    assert.equal(Number((await s.q('select count(*) as n from private.kamereoru_launches'))[0].n), 1);
    // ランキング画面
    await page.click('[data-testid=home-ranking]');
    await page.waitForSelector('.rank-row');
    const row = await page.textContent('.rank-row');
    assert.match(row, /テストさん/);
    assert.match(await page.textContent('.rank-mine'), /1/);
    // 記録の確認状況
    await page.click('.btn-back');
    await page.click('[data-testid=home-records]');
    await page.waitForSelector('.record[data-state=official]');
    assert.deepEqual(s.env.errors, []);
  } finally {
    await s.close();
  }
});

test('NET-TEST-02: 開始前から通信できない時は、自動再試行の後に選んでもらい、対象外で遊べる', async () => {
  const s = await setup({ apiBase: 'http://127.0.0.1:9/functions/v1/kamereoru' });
  const { page } = s.env;
  try {
    await openHome(page, s.env.url);
    await page.fill('#name-input', 'つながらない');
    await page.click('[data-testid=home-start]');
    await page.waitForSelector('text=受付を確認できませんでした', { timeout: 15000 });
    await page.click('[data-testid="start.playUnranked"]');
    const skip = await page.waitForSelector('[data-testid=skip-opening]', { timeout: 6000 }).catch(() => null);
    if (skip) await skip.click().catch(() => {});
    const go = await page.waitForSelector('[data-testid=guide-go]', { timeout: 6000 }).catch(() => null);
    if (go) await go.click();
    await page.waitForFunction(() => globalThis.__kamereoru.session?.running === true, null, { timeout: 10000 });
    const meta = await page.evaluate(() => globalThis.__kamereoru.session.meta);
    assert.equal(meta.ranked, false);
    assert.equal(meta.name, '', '対象外のプレイには名前を付けない');
    const starts = await page.evaluate(() => globalThis.__kamereoru.store.getAll('starts'));
    assert.equal(starts.length, 1);
    assert.equal(starts[0].status, 'abandoned');
    assert.equal(starts[0].attempts, 3, '初回＋自動再試行2回');
  } finally {
    await s.close();
  }
});

test('GAME-17/NET-07: 終了直後（送信前）に再読込しても、結果は端末に残り、起動時に1回だけ送られる', async () => {
  const s = await setup();
  const { page } = s.env;
  try {
    s.api.failRoutes.add('chunk'); // 終了直後の送信を失敗させる
    await openHome(page, s.env.url);
    await rankedPlay(page, 'さいよみ', 6000);
    await quitToHome(page);
    assert.equal((await page.evaluate(() => globalThis.__kamereoru.store.getAll('outbox'))).length, 1);
    s.api.failRoutes.delete('chunk');
    await page.reload();
    await page.waitForSelector('[data-testid=home-start]');
    await waitAsync(page, async () => (await globalThis.__kamereoru.store.getAll('outbox')).length === 0);
    // 何度送り直しても、サーバーの結果は1件
    await page.evaluate(() => globalThis.__kamereoru.flushNetwork());
    await s.api.settle();
    assert.equal(Number((await s.q('select count(*) as n from private.kamereoru_results'))[0].n), 1);
  } finally {
    await s.close();
  }
});

test('NET-TEST-06: 未送信が2件残っていても新しいプレイを始められ、回復後にそれぞれ1回ずつ届く', async () => {
  const s = await setup();
  const { page } = s.env;
  try {
    s.api.failRoutes.add('chunk');
    await openHome(page, s.env.url);
    await rankedPlay(page, 'ふたつめ', 4000);
    await quitToHome(page);
    await rankedPlay(page, 'ふたつめ', 4000);
    await quitToHome(page);
    assert.equal((await page.evaluate(() => globalThis.__kamereoru.store.getAll('outbox'))).length, 2);
    // 3つめのプレイも始められる（新規の開始受付は別に必要）
    await rankedPlay(page, 'ふたつめ', 1500);
    await quitToHome(page);
    s.api.failRoutes.delete('chunk');
    await page.evaluate(() => globalThis.__kamereoru.flushNetwork());
    await s.api.settle();
    assert.equal(Number((await s.q('select count(*) as n from private.kamereoru_results'))[0].n), 3);
    assert.equal(Number((await s.q('select count(*) as n from private.kamereoru_starts'))[0].n), 3);
    assert.equal((await page.evaluate(() => globalThis.__kamereoru.store.getAll('outbox'))).length, 0);
  } finally {
    await s.close();
  }
});
