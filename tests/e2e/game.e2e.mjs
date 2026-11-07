// 本編の通し試験（自動ブラウザ）。PLAY-06/07、SAVE-01/02、GAME-07 などの部分確認。
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome, startAnonymous, appState } from './helpers.mjs';

const hex = ([r, g, b]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;

test('ホーム：名前の公開説明があり、中断がなければ「つづきから」を出さない', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const help = await env.page.textContent('.name-help');
    assert.match(help, /名前を入力すると、名前と記録がランキングに公開されます。空欄でも遊べます。/);
    assert.equal(await env.page.isVisible('[data-testid=home-continue]'), false);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('SAVE-01/02: 停止で壁を覆い時計を止め、再開は3秒のカウントダウンの後。画面離脱でも停止する', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await page.waitForTimeout(600);
    await page.click('[data-testid=pause]');
    const s1 = await appState(page);
    assert.equal(s1.running, false);
    assert.equal(await page.isVisible('.cover'), true);
    await page.waitForTimeout(800);
    const s2 = await appState(page);
    assert.equal(s2.t, s1.t, '停止中は時計が進まない');
    await page.click('[data-testid=pause-resume]');
    await page.waitForSelector('[data-testid=countdown]');
    // カウントダウン中も時計は止まったまま、覆いも外さない
    await page.waitForTimeout(1500);
    const s3 = await appState(page);
    assert.equal(s3.t, s1.t);
    assert.equal(s3.running, false);
    await page.waitForFunction(() => globalThis.__kamereoru.session.running === true, null, { timeout: 5000 });
    assert.equal(await page.isVisible('.cover'), false);
    // 画面離脱
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const s4 = await appState(page);
    assert.equal(s4.running, false);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    assert.equal((await appState(page)).running, false, '戻っただけでは再開しない');
    assert.equal(await page.isVisible('[data-testid=pause-resume]'), true);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('PLAY-06: 19→20棟の猶予でバーを解放（位置不変・明るさ100%のまま）、20棟目到達で練習を解放', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    assert.equal(await page.isDisabled('[data-testid=home-practice]'), false);
    await page.evaluate(() => globalThis.__kamereoru.debugStart({ atMs: 93800 }));
    const barBefore = await page.locator('.bar').boundingBox();
    const paletteBefore = await page.locator('.palette').boundingBox();
    assert.equal(await page.isVisible('.bar-lock'), true);
    await page.click('[data-testid=pause-resume]');
    await page.waitForFunction(() => globalThis.__kamereoru.session?.state.brightnessUnlocked === true, null, { timeout: 10000 });
    const s = await appState(page);
    assert.ok(s.t >= 94500 && s.t < 95000, `unlocked at ${s.t}`);
    assert.equal(s.color.v, 10000);
    assert.equal(await page.isVisible('.bar-lock'), false);
    assert.deepEqual(await page.locator('.bar').boundingBox(), barBefore);
    assert.deepEqual(await page.locator('.palette').boundingBox(), paletteBefore);
    await page.waitForFunction(() => globalThis.__kamereoru.session?.state.reached20 === true, null, { timeout: 5000 });
    await page.waitForFunction(() => globalThis.__kamereoru.flags.brightnessPractice === true, null, { timeout: 3000 });
    // PLAY-07: 途中終了して新しく始めると、本編のバーは再びロック。練習の解放は残る
    await page.click('[data-testid=pause]');
    await page.click('[data-testid=pause-home]');
    await page.click('[data-testid=quit-confirm]');
    await page.waitForSelector('[data-testid=home-start]');
    await page.click('[data-testid=home-practice]');
    assert.equal(await page.isDisabled('[data-testid=practice-brightness]'), false);
    await page.click('.btn-back');
    await page.click('[data-testid=home-start]');
    await page.waitForFunction(() => globalThis.__kamereoru.session?.running === true, null, { timeout: 8000 });
    assert.equal(await page.isVisible('.bar-lock'), true);
    assert.equal((await appState(page)).unlocked, false);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('最終出口：250秒ちょうどで50棟・クリアボーナス1回。結果に通過数・平均・得点を表示', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => globalThis.__kamereoru.debugStart({ atMs: 248200 }));
    await page.click('[data-testid=pause-resume]');
    await page.waitForSelector('[data-testid=result-buildings]', { timeout: 15000 });
    assert.match(await page.textContent('[data-testid=result-buildings]'), /50 \/ 50/);
    const r = await page.evaluate(() => globalThis.__kamereoru.lastResult.summary);
    assert.equal(r.endReason, 'cleared');
    assert.equal(r.endT, 250000);
    assert.equal(r.score.clear, 200);
    // 2回目の本編では、バーは再び未開放
    await page.click('[data-testid=result-again]');
    await page.waitForFunction(() => globalThis.__kamereoru.session?.running === true, null, { timeout: 8000 });
    assert.equal(await page.isVisible('.bar-lock'), true);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('GAME-07: 昼・夜・警察接近中でも、壁・体・プレビューの色は判定と同じ値', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    for (const atMs of [3000, 120000, 226000]) {
      await page.evaluate((t) => globalThis.__kamereoru.debugStart({ atMs: t }), atMs);
      // 警戒を上げて警察を近づける（演出だけを変える）
      await page.evaluate(() => {
        const a = globalThis.__kamereoru;
        a.session.state.alert = 80000;
      });
      await page.waitForTimeout(700);
      const r = await page.evaluate(async () => {
        const { hsvToHex } = await import('/src/rules/v1/index.js');
        const a = globalThis.__kamereoru;
        const s = a.session.state;
        const index = Math.floor(s.t / 5000) + 1;
        const sample = a.stage.sampleComparison(index);
        return {
          index,
          expectWall: hsvToHex(a.session.game.course.targets[index - 1]),
          expectBody: hsvToHex(s.color),
          wall: sample.wall,
          hero: sample.hero,
          preview: getComputedStyle(document.querySelector('.preview')).backgroundColor,
        };
      });
      assert.equal(hex(r.wall), r.expectWall, `wall at building ${r.index}`);
      assert.equal(hex(r.hero), r.expectBody, `body at building ${r.index}`);
      const m = r.preview.match(/\d+/g).map(Number);
      assert.equal(hex(m), r.expectBody, 'preview');
      await page.evaluate(() => globalThis.__kamereoru.leaveGame());
    }
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});
