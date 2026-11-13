// 実機に近い操作の通し試験（自動ブラウザ）。PLAY-03、SAVE-TEST-01、R1、SCOPE-03、GAME-17、PRACT-05 の部分確認。
// タッチは Chromium の開発用の仕組み（CDP）で送る。iPhone Safari の実機確認は別に記録する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome, startAnonymous, appState } from './helpers.mjs';

/** 現在の棟の目標色へ合わせ続ける（発見されずに時間を進めるため）。 */
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

test('PLAY-03: 2本指で同時に操作し、片方を離してももう一方が続く。3本目は先の指を奪わない', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => globalThis.__kamereoru.debugStart({ atMs: 95200 }));
    await page.click('[data-testid=pause-resume]');
    await page.waitForFunction(() => globalThis.__kamereoru.session.running === true, null, { timeout: 6000 });
    const geo = await page.evaluate(() => globalThis.__kamereoru.controls.router.geometry);
    const P = geo.palette;
    const B = geo.bar;
    const pal = (dx, dy) => ({ x: Math.round(P.cx + dx), y: Math.round(P.cy + dy) });
    const bar = (k) => ({ x: Math.round(B.x + B.w / 2), y: Math.round(B.y + B.h * k) });
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ ...p, id: p.id ?? i })) });
    const values = () => page.evaluate(() => globalThis.__kamereoru.controls.values);
    // 1本目：パレット（右へ）、2本目：バー（中央）
    const a1 = { ...pal(P.r * 0.6, 0), id: 1 };
    await send('touchStart', [a1]);
    const b1 = { ...bar(0.5), id: 2 };
    await send('touchStart', [a1, b1]);
    // タッチの座標は整数ピクセルなので、色合いは1度（100）、鮮やかさ・明るさは1%（100）以内のずれを許す
    const near = (a, b) => Math.min(Math.abs(a - b), 36000 - Math.abs(a - b)) <= 100;
    let v = await values();
    assert.ok(near(v.h, 9000), `h ${v.h}`);
    assert.ok(Math.abs(v.s - 6000) <= 100, `s ${v.s}`);
    assert.ok(Math.abs(v.v - 5000) <= 100, `v ${v.v}`);
    // 同時に動かす
    const a2 = { ...pal(0, P.r * 0.6), id: 1 };
    const b2 = { ...bar(0.25), id: 2 };
    await send('touchMove', [a2, b2]);
    v = await values();
    assert.ok(near(v.h, 18000), `h ${v.h}`);
    assert.ok(Math.abs(v.v - 7500) <= 100, `v ${v.v}`);
    const vAfterMove = v.v;
    // 2本目だけ離す：1本目は続く
    await send('touchMove', [{ ...pal(-P.r * 0.6, 0), id: 1 }]);
    v = await values();
    assert.ok(near(v.h, 27000), `h ${v.h}`);
    assert.equal(v.v, vAfterMove, '離した指の値は残る');
    const hHeld = v.h;
    // 同じパレットへ3本目：先の指を奪わない
    await send('touchMove', [{ ...pal(-P.r * 0.6, 0), id: 1 }, { ...pal(0, -P.r * 0.9), id: 3 }]);
    v = await values();
    assert.equal(v.h, hHeld, '3本目は先の指を奪わない');
    await send('touchEnd', []);
    // 判定にも同じ値が入っている
    const s = await appState(page);
    assert.deepEqual(s.color, await values());
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('SAVE-TEST-01: 遊んでいる途中で再読込しても、「つづきから」で保存した時点（通過棟数・警戒・色）から再開できる', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await followTargets(page, 7000);
    const before = await appState(page);
    assert.ok(before.passed >= 1, `passed ${before.passed}`);
    await page.reload();
    await page.waitForSelector('[data-testid=home-continue]', { state: 'visible' });
    await page.click('[data-testid=home-continue]');
    await page.waitForSelector('[data-testid=pause-resume]');
    const after = await appState(page);
    assert.equal(after.running, false, '再開は本人の操作の後');
    assert.ok(after.t <= before.t && after.t >= 5000, `t ${after.t} vs ${before.t}`);
    assert.ok(after.passed >= 1);
    await page.click('[data-testid=pause-resume]');
    await page.waitForFunction(() => globalThis.__kamereoru.session.running === true, null, { timeout: 6000 });
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('R1: 別のタブが同じプレイを引き継ぐと、元のタブの保存は通らず「別の画面で続いています」と知らせる', async () => {
  const env = await launch();
  const { page, context } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await followTargets(page, 5500);
    const second = await context.newPage();
    await second.goto(env.url);
    await second.waitForSelector('[data-testid=home-continue]', { state: 'visible' });
    await second.click('[data-testid=home-continue]');
    await second.waitForSelector('[data-testid=pause-resume]');
    // 元のタブへ戻って保存を試みる（2つ目のタブを開いた時点で、元のタブは画面離脱として停止している）
    // → 古い書込担当として拒否され、「別の画面で続いています」と知らせる
    await page.bringToFront();
    await page.evaluate(() => globalThis.__kamereoru.saveNow('test'));
    await page.waitForSelector('.dialog-title');
    const title = await page.textContent('.dialog-title');
    assert.match(title, /別の画面/);
    // 引き継いだタブは続けられる
    await second.click('[data-testid=pause-resume]');
    await second.waitForFunction(() => globalThis.__kamereoru.session.running === true, null, { timeout: 6000 });
  } finally {
    await env.close();
  }
});

test('SCOPE-03: 建物は4つの枠を使い回し、進んでも連戦しても描画物体が増え続けない', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    const counts = [];
    for (let round = 0; round < 3; round += 1) {
      await page.evaluate(() => globalThis.__kamereoru.debugStart({ atMs: 30000 }));
      await page.click('[data-testid=pause-resume]');
      await page.waitForFunction(() => globalThis.__kamereoru.session.running === true, null, { timeout: 6000 });
      const start = await page.evaluate(() => globalThis.__kamereoru.stage.stats());
      await followTargets(page, 11000); // 2棟以上進む
      const later = await page.evaluate(() => globalThis.__kamereoru.stage.stats());
      assert.equal(later.objects, start.objects, '進んでも物体数は同じ');
      counts.push(later.objects);
      await page.evaluate(() => globalThis.__kamereoru.leaveGame());
    }
    assert.equal(new Set(counts).size, 1, `連戦でも同じ ${counts}`);
    assert.equal(await page.evaluate(() => document.querySelectorAll('canvas.stage-canvas').length), 0, '画面を離れたら描画を片付ける');
  } finally {
    await env.close();
  }
});

test('GAME-17: クリアの演出を飛ばしても、結果とクリアボーナスは1回だけで変わらない', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => globalThis.__kamereoru.debugStart({ atMs: 248600 }));
    await page.click('[data-testid=pause-resume]');
    await page.waitForSelector('[data-testid=skip-ending]', { timeout: 10000 });
    const fixed = await page.evaluate(() => globalThis.__kamereoru.lastResult.summary);
    await page.click('[data-testid=skip-ending]');
    await page.waitForSelector('[data-testid=result-score]');
    // 結果の唯一の得点表示は600msで数え上げる。表示完了を待って確定値と照合する。
    await page.waitForFunction((total) => {
      const score = document.querySelector('[data-testid=result-score]');
      return score && Number(score.textContent.replace(/\D/g, '')) === total;
    }, fixed.score.total);
    const shown = await page.evaluate(() => globalThis.__kamereoru.lastResult.summary);
    assert.deepEqual(shown, fixed, '演出の前に結果を確定している');
    assert.equal(shown.score.clear, 200);
    assert.equal(Number((await page.textContent('[data-testid=result-score]')).replace(/\D/g, '')), shown.score.total);
  } finally {
    await env.close();
  }
});

test('PRACT-05: 練習の3問をすべてスキップしても答え合わせを経て終了でき、直近の練習に残る', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.click('[data-testid=home-practice]');
    await page.click('[data-testid=practice-basic]');
    for (let i = 0; i < 3; i += 1) {
      await page.waitForSelector('[data-testid=practice-skip]:not([disabled])');
      await page.click('[data-testid=practice-skip]');
      await page.waitForSelector('.practice-review:not([hidden])');
      await page.click('[data-testid=practice-next]');
    }
    await page.waitForSelector('.practice-table');
    const rows = await page.$$eval('.practice-table tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r[3] === '—'), '未成功の時間は「—」');
    await page.click('text=ホームへ');
    await page.click('[data-testid=home-practice]');
    await page.waitForSelector('[data-testid=practice-basic]');
    await page.waitForSelector('.practice-history li');
    assert.equal(await page.$$eval('.practice-history li', (x) => x.length), 1);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});
