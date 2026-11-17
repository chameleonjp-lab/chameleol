// 結果の静止解析（T3）のブラウザ試験。Chromium の自動試験であり、iPhone 実機の確認とは別のもの。
// 通常終了・保存失敗・旧版（v1/v2）の途中再開からの終了で、session を捨てた後も今回の実色が得られること、
// 言語の描き直しで解析をやり直さないこと、過去結果に履歴が無ければ missing であること、パネルが1つずつ開き動く再生UIが無いこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launch, openHome } from './helpers.mjs';

const OUT = fileURLToPath(new URL('../../docs/acceptance/design-followups/t3/', import.meta.url));
const id = (name) => `[data-testid="${name}"]`;
const PANELS = ['frames', 'colors', 'alert', 'recovery', 'streak'];

async function clock(page) {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
}

/** 解析の「譲り」（setTimeout）は止めた時計では進まない。ここで少しずつ進めて、完了を待つ。 */
async function settleEvidence(page) {
  for (let i = 0; i < 80; i += 1) {
    const status = await page.evaluate(() => __kamereoru.lastResult?.evidence?.status ?? null);
    if (status && status !== 'pending') return status;
    await page.clock.runFor(30);
  }
  return page.evaluate(() => __kamereoru.lastResult?.evidence?.status ?? null);
}

/**
 * 画面の中で、建物13〜16を遊ぶ脚本を実行する（建物1〜12は debugStart か再開前の履歴）。
 * 13棟目：評価開始で目立つ色（警察が出る）→立て直す色。14〜16棟目：壁に合わせる。最後に途中終了。
 */
const SCRIPT = async (endMs) => {
  const a = __kamereoru;
  const s = a.session;
  const targets = s.game.course.targets;
  const far = (c) => ({ h: (c.h + 18000) % 36000, s: c.s, v: 10000 });
  const good = (b) => ({ h: targets[b - 1].h, s: targets[b - 1].s, v: 10000 });
  const put = (t, c) => s.apply({ type: 'color', t, h: c.h, s: c.s, v: c.v });
  document.querySelector('.pause-overlay')?.remove();
  if (a.coverEl) a.coverEl.hidden = true;
  put(61500, far(targets[12]));
  put(63100, good(13));
  put(65100, good(14));
  put(70100, good(15));
  put(75100, good(16));
  s.apply({ type: 'tick', t: endMs });
  s.quit();
};

/** 本編を debugStart で12棟ぶん進め、脚本で終わらせて、結果画面まで進む。 */
async function playToResult(page, { saveFails = false } = {}) {
  await page.evaluate(() => __kamereoru.debugStart({ atMs: 60000, seed: 17 }));
  await page.evaluate(async ({ saveFails: fails }) => {
    const a = __kamereoru;
    const { TAB_ID } = await import('/src/storage/store.js');
    a.generation = await a.store.beginRun(TAB_ID, a.session.snapshot());
    a.memoryOnly = false;
    if (fails) a.store.endRun = async () => { throw new Error('quota fixture'); };
  }, { saveFails });
  await page.evaluate(SCRIPT, 80000);
  await page.waitForSelector(id('skip-ending'));
  await page.locator(id('skip-ending')).dispatchEvent('click');
  await page.waitForSelector(id('result-again'));
}

test('replay remains available while evidence is pending and discards late work', async () => {
  const env = await launch();
  try {
    const { page } = env;
    await openHome(page, env.url);
    await clock(page);
    await playToResult(page);
    const oldId = await page.evaluate(() => {
      const r = __kamereoru.lastResult;
      globalThis.__pendingResult = { result: r, signal: r.evidence.controller.signal };
      if (r.evidence.status !== 'pending') throw new Error('fixture must hold analysis pending');
      return r.playId;
    });
    assert.equal(await page.locator(id('result-buildings')).isVisible(), true);
    await page.locator(id('result-again')).dispatchEvent('click');
    await page.waitForFunction(pid => __kamereoru.session?.meta.playId && __kamereoru.session.meta.playId !== pid, oldId);
    assert.deepEqual(await page.evaluate(() => ({
      aborted: __pendingResult.signal.aborted,
      evidence: __pendingResult.result.evidence,
      input: __pendingResult.result.evidenceInput,
    })), { aborted: true, evidence: null, input: null });
    await page.clock.runFor(300);
    assert.equal(await page.evaluate(pid => !!__kamereoru.session && __kamereoru.session.meta.playId !== pid, oldId), true);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('normal result preserves actual colors in two passed buildings instead of substituting walls', async () => {
  const env = await launch();
  try {
    const { page } = env;
    await openHome(page, env.url);
    await clock(page);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 60000, seed: 17 }));
    await page.evaluate(() => {
      const s = __kamereoru.session;
      globalThis.__actualColors = [13,14].map(b => {
        const wall = s.game.course.targets[b - 1];
        const color = { h: (wall.h + 150) % 36000, s: wall.s, v: 10000 };
        s.apply({ type: 'color', t: (b - 1) * 5000 + 100, ...color });
        return { building:b, hsv:color };
      });
      s.apply({ type: 'tick', t: 70000 });
      s.quit();
    });
    await page.waitForSelector(id('skip-ending'));
    await page.locator(id('skip-ending')).dispatchEvent('click');
    await page.waitForSelector(id('result-again'));
    assert.equal(await settleEvidence(page), 'ready');
    const colors = await page.evaluate(async () => {
      const { resolveResultEvidence } = await import('/src/presentation/result-evidence.js');
      const r = __kamereoru.lastResult;
      return __actualColors.map(expected => ({ expected, actual:resolveResultEvidence(r).data.visualSamples.find(s=>s.building===expected.building)?.hsv, wall:r.targets[expected.building-1] }));
    });
    for (const c of colors) { assert.deepEqual(c.actual,c.expected.hsv); assert.notDeepEqual(c.actual,c.wall); }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

/** v1/v2 の履歴を端末へ保存してから、途中再開して終わらせる。 */
async function resumeLegacyToResult(page, rulesVersion) {
  const playId = await page.evaluate(async (version) => {
    const a = __kamereoru;
    const { GameSession } = await import('/src/game/session.js');
    const { TAB_ID } = await import('/src/storage/store.js');
    const session = new GameSession({ playId: crypto.randomUUID(), launchId: 'legacy', ranked: false, name: '', seed: 17, gameVersion: 'legacy', rulesVersion: version, startedAt: Date.now() });
    const targets = session.game.course.targets;
    for (let b = 1; b <= 12; b += 1) {
      const c = targets[b - 1];
      session.apply({ type: 'color', t: (b - 1) * 5000 + 100, h: c.h, s: c.s, v: 10000 });
    }
    session.apply({ type: 'tick', t: 60000 });
    session.pausedReason = 'restored';
    await a.store.beginRun(TAB_ID, session.snapshot());
    await a.checkSavedRun();
    return session.meta.playId;
  }, rulesVersion);
  await page.evaluate((pid) => { __kamereoru.resumeSaved(pid); }, playId);
  await page.waitForFunction((pid) => __kamereoru.session?.meta.playId === pid && __kamereoru.session.meta.rulesVersion, playId);
  await page.waitForSelector('.pause-overlay'); // showGame の最後。再開した session に終了の通知がつながった後
  await page.evaluate(SCRIPT, 80000);
  await page.waitForSelector(id('skip-ending'));
  await page.locator(id('skip-ending')).dispatchEvent('click');
  await page.waitForSelector(id('result-again'));
}

/** 今回の結果から、解析で得た実色と期待する体色（建物1〜16は壁色に合わせて遊んだ）を調べる。 */
const evidenceFacts = () => {
  const r = __kamereoru.lastResult;
  return import('/src/presentation/result-evidence.js').then(({ resolveResultEvidence }) => {
    const view = resolveResultEvidence(r);
    const targets = r.targets;
    const samples = view.data?.visualSamples ?? [];
    const exact = samples.filter((sample) => {
      const wall = targets[sample.building - 1];
      return sample.hsv.h === wall.h && sample.hsv.s === wall.s && sample.hsv.v === (sample.building >= 20 ? wall.v : 10000);
    }).length;
    return {
      status: view.status,
      reason: view.reason,
      buildings: r.summary.buildings,
      sessionGone: __kamereoru.session === null,
      sampleBuildings: samples.map((x) => x.building),
      exact,
      frames: view.data?.frames3.frames?.map((f) => f.t) ?? null,
      marks: view.data?.alertMarks.marks?.map((m) => m.kind) ?? null,
      recovery: view.data?.recovery.available ?? null,
      streak: view.data?.longestStreak.available ? [view.data.longestStreak.from, view.data.longestStreak.to] : null,
      points: view.data?.alertPoints.points?.length ?? null,
      saved: r.saved,
      rulesVersion: r.evidenceInput?.rulesVersion ?? null,
    };
  });
};

test('通常終了：session を捨てた後も今回の実色が得られ、言語の描き直しで解析をやり直さず、再表示でも計算済みの資料を使う', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await clock(page);
    await playToResult(page);
    // 解析は結果画面の表示後に始まり、止めた時計では未完了（pending）。この間に言語を変えても始め直さない。
    const pending = await page.evaluate(() => {
      const e = __kamereoru.lastResult.evidence;
      globalThis.__evidenceProbe = { evidence: e, controller: e.controller, status: e.status };
      return { status: e.status, hasInput: !!__kamereoru.lastResult.evidenceInput, history: __kamereoru.lastResult.evidenceInput.history.length };
    });
    assert.equal(pending.status, 'pending');
    assert.ok(pending.hasInput && pending.history > 12);
    assert.equal(await page.locator('.evidence-chip').count(), 7);
    for (const lang of ['en', 'ja', 'th']) {
      await page.evaluate((l) => __kamereoru.changeLanguage(l), lang);
      assert.equal(await page.evaluate(() => __kamereoru.lastResult.evidence === __evidenceProbe.evidence && __kamereoru.lastResult.evidence.controller === __evidenceProbe.controller && !__evidenceProbe.controller.signal.aborted), true, `${lang}: 解析の持ち主は同じ`);
    }
    await page.locator('.evidence-chip').first().click();
    assert.match(await page.locator('.evidence-body').textContent(), /…/, '解析中の表示');
    // 終わらせる。パネルは開いたまま描き直される。
    assert.equal(await settleEvidence(page), 'ready');
    const facts = await page.evaluate(evidenceFacts);
    assert.equal(facts.status, 'ready');
    assert.equal(facts.sessionGone, true);
    assert.equal(facts.saved, true);
    assert.equal(facts.buildings, 16);
    assert.deepEqual(facts.sampleBuildings, Array.from({ length: 16 }, (_, i) => i + 1));
    assert.equal(facts.exact, 16, '遊んだ体色（壁に合わせた色）がそのまま実色として得られる');
    assert.deepEqual(facts.frames, [78000, 79000, 80000]);
    assert.deepEqual(facts.marks, ['police1', 'police2', 'recovery']);
    assert.equal(facts.recovery, true);
    assert.deepEqual(facts.streak, [1, 12]);
    assert.equal(await page.locator('.evidence-frame').count(), 3, '開いていたパネルが完了で描き直される');
    // 言語を変えても、解析は始め直さず、計算済みの資料を使う
    const sameRaw = await page.evaluate(async () => {
      const e = __kamereoru.lastResult.evidence;
      const raw = e.raw;
      await __kamereoru.changeLanguage('en');
      await __kamereoru.changeLanguage('de');
      return __kamereoru.lastResult.evidence === e && e.raw === raw && e.status === 'ready' && !e.controller.signal.aborted;
    });
    assert.equal(sameRaw, true);
    assert.match(await page.locator('.evidence-heading').textContent(), /Rückblick/);
    // 保存・送信・音・ゲーム開始は、パネルの操作でも言語の描き直しでも増えない（言語の描き直しの既存の読み出し localBest は除く）
    const calls = await page.evaluate(async () => {
      const a = __kamereoru;
      const counts = { reads: 0, writes: 0, net: 0, audio: 0, start: 0 };
      // 言語の選択そのものの保存（set('lang')）は、言語を変える既存の動作なので数えない
      const wrap = (obj, name, key) => { const orig = obj[name]; if (typeof orig !== 'function') return; obj[name] = (...args) => { if (!(name === 'set' && args[0] === 'lang')) counts[key] += 1; return orig.apply(obj, args); }; };
      for (const name of ['get', 'getOne', 'getAll', 'loadRun', 'loadDirector']) wrap(a.store, name, 'reads');
      for (const name of ['put', 'set', 'delete', 'endRun', 'beginRun', 'saveRun', 'claimRun', 'claimCameoStart', 'claimPrecisionBadge', 'clearPractice']) wrap(a.store, name, 'writes');
      for (const name of ['post', 'get']) wrap(a.api, name, 'net');
      wrap(a.audio, 'play', 'audio');
      for (const name of ['startFlow', 'beginPlay', 'showGame', 'debugStart']) wrap(a, name, 'start');
      for (const chip of document.querySelectorAll('.evidence-chip')) chip.click();
      for (const chip of document.querySelectorAll('.evidence-chip')) chip.click();
      const panelOnly = { ...counts };
      await a.changeLanguage('ja');
      return { panelOnly, withLanguage: { ...counts, reads: 0 } };
    });
    assert.deepEqual(calls.panelOnly, { reads: 0, writes: 0, net: 0, audio: 0, start: 0 });
    assert.deepEqual(calls.withLanguage, { reads: 0, writes: 0, net: 0, audio: 0, start: 0 });
    assert.deepEqual(env.errors, []);

    // アプリを開き直した後：履歴の無い過去結果は missing（summary から履歴を作らない）。保存された記録に履歴は増えていない。
    await page.reload();
    await page.waitForSelector(id('home-start'));
    const after = await page.evaluate(async () => {
      const a = __kamereoru;
      const saved = (await a.store.getAll('localResults'))[0];
      const { resolveResultEvidence } = await import('/src/presentation/result-evidence.js');
      a.lastResult = { playId: saved.playId, ranked: false, name: '', summary: saved.summary, saved: true };
      a.showResult();
      const status = resolveResultEvidence(a.lastResult);
      return { lastResultBefore: null, status: status.status, reason: status.reason, keys: Object.keys(saved).sort(), hasHistory: JSON.stringify(saved).includes('"history"') };
    });
    assert.deepEqual([after.status, after.reason], ['missing', 'no_history']);
    assert.deepEqual(after.keys, ['createdAt', 'endedAt', 'name', 'playId', 'ranked', 'summary']);
    assert.equal(after.hasHistory, false);
    await page.locator('.evidence-chip').first().click();
    assert.equal((await page.locator('.evidence-body').textContent()).trim().length > 0, true);
    assert.equal(await page.locator('.evidence-frame').count(), 0, '推測で絵を埋めない');
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

test('保存の失敗（persistEnd が失敗）でも、今回の結果に実色が付く。保存できていない警告は従来どおり出る', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await clock(page);
    await playToResult(page, { saveFails: true });
    assert.equal(await settleEvidence(page), 'ready');
    const facts = await page.evaluate(evidenceFacts);
    assert.equal(facts.saved, false);
    assert.equal(facts.sessionGone, true);
    assert.equal(facts.exact, 16);
    assert.deepEqual(facts.sampleBuildings.length, 16);
    assert.equal(await page.locator('.result-save-warning').count(), 1);
    assert.deepEqual(await page.evaluate(async () => (await __kamereoru.store.getAll('localResults')).length), 0);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

for (const version of ['kamereoru-rules-v1', 'kamereoru-rules-v2']) {
  test(`${version} の途中再開からの終了でも、再開前の履歴を含めて今回の実色が得られる`, async () => {
    const env = await launch();
    const { page } = env;
    try {
      await openHome(page, env.url);
      await clock(page);
      await resumeLegacyToResult(page, version);
      assert.equal(await settleEvidence(page), 'ready');
      const facts = await page.evaluate(evidenceFacts);
      assert.equal(facts.rulesVersion, version);
      assert.equal(facts.sessionGone, true);
      assert.equal(facts.buildings, 16);
      assert.equal(facts.exact, 16, '再開前に遊んだ建物1〜12の実色も復元される');
      assert.deepEqual(facts.marks, ['police1', 'police2', 'recovery']);
      assert.deepEqual(facts.streak, [1, 12]);
      assert.deepEqual(env.errors, []);
    } finally {
      await env.close();
    }
  });
}

for (const [width, height] of [[402, 700], [402, 874], [874, 402]]) {
  test(`パネルは一度に1つだけ開き、動く再生UIが無い。${width}x${height} の各パネルの画像（倍率2）を置く`, async () => {
    const env = await launch({ width, height, scale: 2 });
    const { page } = env;
    try {
      await mkdir(OUT, { recursive: true });
      await openHome(page, env.url);
      await clock(page);
      await playToResult(page);
      const evidence = page.locator('.result-evidence');
      await evidence.scrollIntoViewIfNeeded();
      const shot = async (name) => {
        await evidence.scrollIntoViewIfNeeded();
        await evidence.screenshot({ path: `${OUT}${width}x${height}-${name}.png`, animations: 'disabled' });
      };
      // 解析中
      await page.locator('.evidence-chip').first().click();
      assert.match(await page.locator('.evidence-body').textContent(), /…/);
      await shot('pending');
      assert.equal(await settleEvidence(page), 'ready');
      await page.locator('.evidence-chip').first().click(); // いったん閉じる
      assert.equal(await page.locator('.evidence-body').isVisible(), false);
      assert.equal(await page.locator('.evidence-chip[aria-expanded="true"]').count(), 0, '最初はすべて閉じている');
      for (const panel of PANELS) {
        await page.locator(`.evidence-chip[data-panel="${panel}"]`).click();
        assert.equal(await page.locator('.evidence-chip[aria-expanded="true"]').count(), 1, `${panel}: 開いているのは1つ`);
        assert.equal(await page.locator('.evidence-body:visible').count(), 1);
        // 再生の部品が無い
        const parts = await page.evaluate(() => {
          const root = document.querySelector('.result-evidence');
          return {
            buttons: root.querySelectorAll('button').length,
            media: root.querySelectorAll('input, audio, video, canvas, progress, [role=slider], [role=progressbar], [role=timer]').length,
            animations: root.getAnimations({ subtree: true }).length,
            overflowX: document.documentElement.scrollWidth - innerWidth,
            rootOverflow: root.scrollWidth - root.clientWidth,
            fonts: [...root.querySelectorAll('.evidence-chip, .evidence-caption, .evidence-empty, .evidence-frame-caption, .evidence-marks li, .evidence-swatch figcaption')].filter((n) => parseFloat(getComputedStyle(n).fontSize) < 14).length,
          };
        });
        assert.equal(parts.buttons, 5, `${panel}: ボタンはチップだけ`);
        assert.equal(parts.media, 0);
        assert.equal(parts.animations, 0, '動く部品がない');
        assert.ok(parts.overflowX <= 0 && parts.rootOverflow <= 0, `${panel}: 横にはみ出さない ${JSON.stringify(parts)}`);
        assert.equal(parts.fonts, 0, `${panel}: 14px 未満の文字なし`);
        await shot(panel);
      }
      // 開いた状態で別のチップを押すと、前のパネルを閉じる。もう一度押すと閉じる
      await page.locator('.evidence-chip[data-panel="frames"]').click();
      await page.locator('.evidence-chip[data-panel="alert"]').click();
      assert.equal(await page.locator('.evidence-frame').count(), 0);
      assert.equal(await page.locator('svg.evidence-graph').count(), 1);
      await page.locator('.evidence-chip[data-panel="alert"]').click();
      assert.equal(await page.locator('.evidence-body').isVisible(), false);
      assert.deepEqual(env.errors, []);
    } finally {
      await env.close();
    }
  });
}
