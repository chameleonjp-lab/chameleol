// 版の違う保存の扱い（受入試験 VERSION-01 の部分確認）。配布物（dist）を作って開く。
// 別の版で保存した中断プレイは消さずに残し、その版の資源のページへ案内する。新しく始める時は確認して保管庫へ移す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, ROOT } from './helpers.mjs';

test('VERSION-01: 別の版の中断プレイは消さずに残し、その版のページへ案内する。新しく始める時は保管庫へ移す', async () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs')], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, KAMEREORU_ENV: 'verification' } });
  const dist = join(ROOT, 'dist');
  const release = JSON.parse(readFileSync(join(dist, 'release.json'), 'utf8'));
  // 「新しい版」の資源フォルダを用意する（中身は検証用の写し）
  cpSync(join(dist, 'v', release.assetVersion), join(dist, 'v', 'future-x'), { recursive: true });
  const env = await launch({ root: dist });
  const { page } = env;
  try {
    await page.goto(env.url);
    await page.waitForSelector('[data-testid=home-start]');
    assert.equal(await page.evaluate(() => globalThis.__kamereoru.runtime.assetVersion), release.assetVersion);
    // 新しい版で保存した中断プレイを端末に置く
    await page.evaluate(async () => {
      const a = globalThis.__kamereoru;
      const snapshot = { format: 'kamereoru-run-v1', meta: { playId: 'future-play', launchId: 'l', ranked: false, name: '', seed: 1, rulesVersion: 'kamereoru-rules-v2', generatorVersion: 'kamereoru-course-v2', assetVersion: 'future-x' }, state: { t: 12345 }, history: [] };
      await a.store.beginRun('other-tab', snapshot);
    });
    await page.reload();
    await page.waitForSelector('[data-testid=foreign-run]');
    const href = await page.getAttribute('[data-testid=foreign-run-open]', 'href');
    assert.ok(href.endsWith('/v/future-x/'), href);
    assert.equal(await page.isVisible('[data-testid=home-continue]'), false, 'この版では再開しない');
    const run = await page.evaluate(() => globalThis.__kamereoru.store.loadRun());
    assert.equal(run.status, 'active', '別の版の保存は消さずに残す');
    assert.equal(run.snapshot.meta.rulesVersion, 'kamereoru-rules-v2');
    // 案内先のページ（保存した版の資源）が開ける
    const res = await page.request.get(href);
    assert.equal(res.status(), 200);
    // 新しく始める：確認してから保管庫へ移す（削除しない）
    await page.click('[data-testid=home-start]');
    await page.waitForSelector('[data-testid=foreign-shelve]');
    await page.click('[data-testid=foreign-shelve]');
    const skip = await page.waitForSelector('[data-testid=skip-opening]', { timeout: 5000 }).catch(() => null);
    if (skip) await skip.click().catch(() => {});
    const go = await page.waitForSelector('[data-testid=guide-go]', { timeout: 5000 }).catch(() => null);
    if (go) await go.click();
    await page.waitForFunction(() => globalThis.__kamereoru.session?.running === true, null, { timeout: 8000 });
    const q = await page.evaluate(() => globalThis.__kamereoru.store.getAll('quarantine'));
    assert.equal(q.length, 1);
    assert.equal(q[0].record.snapshot.meta.playId, 'future-play');
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('単独公開版はランキング登録を表示せず、保存済みの名前があってもそのまま遊べる', async () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs')], {
    cwd: ROOT,
    stdio: 'ignore',
    env: {
      ...process.env,
      KAMEREORU_ENV: 'production',
      KAMEREORU_STANDALONE: '1',
      KAMEREORU_API: '',
      KAMEREORU_PUBLIC_URL: 'https://example.invalid/kamereoru/',
    },
  });
  const env = await launch({ root: join(ROOT, 'dist') });
  const { page } = env;
  try {
    await page.goto(env.url);
    await page.waitForSelector('[data-testid=home-start]');
    await page.evaluate(async () => globalThis.__kamereoru.store.set('nameRaw', '前の名前'));
    await page.reload();
    await page.waitForSelector('[data-testid=home-start]');
    assert.equal(await page.locator('.name-help').count(), 0);
    assert.equal(await page.locator('[data-testid=home-ranking]').count(), 0);
    assert.equal(await page.locator('.notice-dev').count(), 0);
    await page.evaluate(async () => globalThis.__kamereoru.store.put('localResults', {
      playId: 'saved-offline', ranked: false, name: '', summary: { buildings: 4, rankAverage: 9123 }, endedAt: Date.now(),
    }));
    await page.click('[data-testid=home-records]', { timeout: 3000 });
    await page.waitForSelector('.records-list li');
    assert.match(await page.textContent('.records-list li'), /91[.,]23/);
    assert.equal(await page.locator('.records-screen button', { hasText: '状況を更新する' }).count(), 0);
    await page.click('.btn-back');
    await page.click('[data-testid=home-start]');
    const skip = await page.waitForSelector('[data-testid=skip-opening]', { timeout: 5000 }).catch(() => null);
    if (skip) await skip.click().catch(() => {});
    await page.click('[data-testid=guide-go]');
    await page.waitForFunction(() => globalThis.__kamereoru.session?.running === true);
    assert.equal(await page.evaluate(() => globalThis.__kamereoru.session.meta.ranked), false);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});
