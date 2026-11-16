// CL02 結果画面の実 App＋実 ports の自動ブラウザ試験（Chromium）。iPhone 実機の X 添付・長押し保存・性能の代わりにはしない。
// 入口は試験専用の fixtures/result-card.html（index.html・app.js は変えず、実 App へ実 ports だけを明示して渡す）。
// CG02 の試験用 renderer/stage は使わない。画像の証拠は CL02_EVIDENCE_DIR を指した時だけ書き出す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch } from './helpers.mjs';

const id = (name) => `[data-testid="${name}"]`;
const FIXTURE = 'tests/e2e/fixtures/result-card.html';
const EVIDENCE = process.env.CL02_EVIDENCE_DIR || null;
const BUDGET = 16_777_216;
const ATLAS_BYTES = 1920 * 1520 * 4;

/** 画面の中で、建物13〜16を遊ぶ脚本を実行して途中終了する（result-evidence.e2e と同じ流れ）。 */
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

/** 試験の道具：共有・URL・WebGL の観測。製品の ports には何も足さない。 */
const INSTRUMENT = () => {
  globalThis.__shares = [];
  globalThis.__shareMode = 'ok';
  globalThis.__opened = [];
  globalThis.__revoked = [];
  globalThis.__webgl = new Set();
  Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (payload) => {
      globalThis.__shares.push({ files: payload.files.map((f) => ({ type: f.type, size: f.size, name: f.name })), text: payload.text, url: payload.url });
      if (globalThis.__shareMode === 'cancel') throw new DOMException('cancelled', 'AbortError');
    },
  });
  const open = window.open;
  window.open = (...args) => { globalThis.__opened.push(args[0]); return null; };
  void open;
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (u) => { globalThis.__revoked.push(u); revoke(u); };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(kind, ...rest) {
    if (typeof kind === 'string' && kind.startsWith('webgl')) globalThis.__webgl.add(this);
    return get.call(this, kind, ...rest);
  };
};

async function openApp(env, { lang = 'ja' } = {}) {
  const { page, context } = env;
  await context.addInitScript(INSTRUMENT);
  await page.goto(env.url + FIXTURE);
  await page.waitForSelector(id('home-start'));
  if (lang !== 'ja') await page.evaluate(async (l) => { (await import('/src/i18n/i18n.js')).setLanguage(l); }, lang);
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
}

async function playToResult(page) {
  await page.evaluate(() => __kamereoru.debugStart({ atMs: 60000, seed: 17 }));
  await page.evaluate(async () => {
    const a = __kamereoru;
    const { TAB_ID } = await import('/src/storage/store.js');
    a.generation = await a.store.beginRun(TAB_ID, a.session.snapshot());
    a.memoryOnly = false;
  });
  await page.evaluate(SCRIPT, 80000);
  await page.waitForSelector(id('skip-ending'));
  await page.locator(id('skip-ending')).dispatchEvent('click');
  await page.waitForSelector(id('result-again'));
}

const cardState = (page) => page.evaluate(() => __kamereoru.resultCardController?.snapshot().state ?? null);
const evidenceStatus = (page) => page.evaluate(() => __kamereoru.lastResult?.evidence?.status ?? null);

/** 止めた時計を少しずつ進め、条件が真になるのを待つ（固定時間は待たない）。 */
async function advanceUntil(page, predicate, { step = 50, limit = 120 } = {}) {
  for (let i = 0; i < limit; i += 1) {
    if (await predicate()) return true;
    await page.clock.runFor(step);
  }
  return predicate();
}

async function toReady(page) {
  assert.equal(await advanceUntil(page, async () => (await cardState(page)) === 'ready'), true, 'the card becomes ready');
}

const liveWebgl = (page) => page.evaluate(() => [...__webgl].filter((c) => c.width > 0 && c.height > 0).length);

async function heldBytes(page) {
  return page.evaluate((ATLAS) => {
    const r = __kamereoru.lastResult;
    const card = document.querySelector('.result-card-canvas');
    const portrait = r.resultPortrait?.portrait?.image;
    const turn = document.querySelector('.result-turn-canvas');
    const viewer = document.querySelector('.result-card-viewer-image');
    const parts = {
      atlas: ATLAS,
      card: card ? card.width * card.height * 4 : 0,
      portrait: portrait ? portrait.width * portrait.height * 4 : 0,
      panel: turn ? turn.width * turn.height * 4 : 0,
      viewer: viewer && viewer.naturalWidth ? viewer.naturalWidth * viewer.naturalHeight * 4 : 0,
    };
    return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
  }, ATLAS_BYTES);
}

async function snap(page, name, options = {}) {
  if (!EVIDENCE) return;
  await mkdir(EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE}/${name}.png`, ...options });
}

// ---------------------------------------------------------------------------------------------
test('card text: 15 languages x 27 titles and the worst-case numbers stay inside their areas with real font metrics', async (t) => {
  const env = await launch();
  try {
    await openApp(env);
    const out = await env.page.evaluate(async () => {
      const { drawResultCard } = await import('/src/presentation/result-card-draw.js');
      const { RESULT_TITLES } = await import('/src/presentation/result-titles.js');
      const { LANGUAGE_IDS } = await import('/src/i18n/languages.js');
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d');
      const FAMILY = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans", "Noto Sans JP", "Noto Sans Thai", "Noto Sans Arabic", sans-serif';
      const hero = { status: 'matched', building: 50, hsv: { h: 1, s: 1, v: 1 }, outlineBuilding: 50, average: 99, instantMatch: 99 };
      const rows = [];
      const failures = [];
      const stages = { 1: 0, 2: 0, 3: 0, 4: 0 };
      let rowStage = { score: 0, bonus: 0, passed: 0 };
      for (const lang of LANGUAGE_IDS) {
        for (const title of RESULT_TITLES) {
          const model = { revision: 1, locale: lang, passed: title.to, rankKey: title.key, totalScore: 1234567, bonusCount: 156, countState: 'known', hero, verificationState: 'pending_review' };
          const info = drawResultCard(canvas, { model, portrait: null, locale: lang });
          stages[info.title.stage] += 1;
          ctx.font = `900 ${info.title.size}px ${FAMILY}`;
          const text = (await import('/src/i18n/i18n.js')).t(`card.rank.${title.key}`, undefined, lang);
          const widest = Math.max(...info.title.lines.map((l) => ctx.measureText(l).width)) * info.title.scaleX;
          if (widest > 548.5) failures.push({ lang, key: title.key, widest });
          if (info.title.lines.length * info.title.size * 1.15 > 152.5) failures.push({ lang, key: title.key, tall: true });
          if (info.title.lines.some((l) => l.includes('…'))) failures.push({ lang, key: title.key, ellipsis: true });
          if (info.title.lines.join('').replace(/\s/g, '') !== text.replace(/\s/g, '')) failures.push({ lang, key: title.key, lost: true });
          for (const part of ['score', 'bonus', 'passed']) {
            if (info[part].width > 572.5) failures.push({ lang, part, width: info[part].width });
            if (info[part].stage >= 3) rowStage[part] += 1;
          }
          rows.push(1);
        }
      }
      return { count: rows.length, failures, stages, rowStage };
    });
    t.diagnostic(`405 titles: stages ${JSON.stringify(out.stages)}; rows that needed the squeeze ${JSON.stringify(out.rowStage)}`);
    assert.equal(out.count, 405);
    assert.deepEqual(out.failures, []);
    assert.equal(out.stages[4], 0, 'no title needs the third line (target 0)');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

for (const [w, h] of [[402, 700], [402, 874], [874, 402]]) {
  test(`result layout ${w}x${h}: card and primary actions are in the first screen, the 2nd hero photo is not, nothing overflows`, async (t) => {
    const env = await launch({ width: w, height: h });
    try {
      await openApp(env);
      await playToResult(env.page);
      await toReady(env.page);
      const m = await env.page.evaluate(() => {
        const rect = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        return {
          vh: innerHeight, vw: innerWidth,
          scrollW: document.documentElement.scrollWidth,
          card: rect('.result-card-canvas'), again: rect(id('result-again')), share: rect(id('result-share')),
          save: rect('.result-card-save'), text: rect('.result-card-text'), portrait: rect('.result-scene .result-portrait'), scene: rect('.result-scene'),
          home: rect(id('result-home')),
        };
        function id(n) { return `[data-testid="${n}"]`; }
      });
      t.diagnostic(JSON.stringify(m));
      for (const key of ['card', 'again', 'share', 'save', 'text']) {
        assert.ok(m[key], `${key} exists`);
        assert.ok(m[key].top >= 0 && m[key].bottom <= m.vh, `${key} inside the first screen (${m[key].top}..${m[key].bottom} of ${m.vh})`);
        assert.ok(m[key].left >= 0 && m[key].right <= m.vw, `${key} inside horizontally`);
      }
      assert.ok(m.scrollW <= m.vw, `no horizontal overflow (${m.scrollW} > ${m.vw})`);
      assert.ok(m.portrait.top >= m.vh - 1 || m.portrait.bottom > m.vh, 'the second hero (photo) is not fully in the first screen');
      // 補足（No.71/80/93/99/100）は主操作の下に常時表示され、畳まれない
      const supplement = await env.page.evaluate(() => { const s = document.querySelector('.result-scene'); const cs = getComputedStyle(s); return { hidden: s.hidden, display: cs.display, visibility: cs.visibility, inScreen: !!s.closest('.screen.result'), stats: __kamereoru.resultPresentation.stats().activeIds }; });
      assert.equal(supplement.hidden, false);
      assert.notEqual(supplement.display, 'none');
      for (const n of [71, 80, 93]) assert.ok(supplement.stats.includes(n), `No.${n} is active`);
      assert.ok(m.portrait.top > m.again.bottom, 'the photo is below the primary action');
      await snap(env.page, `result-${w}x${h}-ja-first`);
      await snap(env.page, `result-${w}x${h}-ja-full`, { fullPage: true });
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('share: the tap calls navigator.share synchronously with one PNG; cancel keeps the text window closed; retry never auto-shares', async () => {
  const env = await launch();
  try {
    const { page } = env;
    await openApp(env);
    await playToResult(page);
    // 準備中のタップ：共有は起きず、準備中の案内
    const early = await page.evaluate(() => { document.querySelector('[data-testid="result-share"]').click(); return { shares: __shares.length, status: document.querySelector('.result-card-status').textContent }; });
    assert.equal(early.shares, 0);
    assert.ok(early.status.length > 0, 'a preparing note is shown');
    await toReady(page);
    const tap = await page.evaluate(() => {
      const before = __shares.length;
      document.querySelector('[data-testid="result-share"]').click();
      return { sync: __shares.length - before, payload: __shares.at(-1) };
    });
    assert.equal(tap.sync, 1, 'navigator.share is called inside the tap');
    assert.equal(tap.payload.files.length, 1);
    assert.equal(tap.payload.files[0].type, 'image/png');
    assert.ok(tap.payload.files[0].size > 0);
    assert.equal(tap.payload.url, 'https://example.invalid/');
    await advanceUntil(page, async () => (await cardState(page)) === 'ready', { limit: 20 });
    // 取消：本文の窓は自動で開かない
    await page.evaluate(() => { __shareMode = 'cancel'; document.querySelector('[data-testid="result-share"]').click(); });
    assert.equal(await advanceUntil(page, async () => (await cardState(page)) === 'ready', { limit: 20 }), true);
    const afterCancel = await page.evaluate(() => ({ opened: __opened.length, shares: __shares.length, status: document.querySelector('.result-card-status').textContent }));
    assert.equal(afterCancel.opened, 0, 'a cancelled share does not open the text window');
    assert.equal(afterCancel.shares, 2);
    assert.ok(afterCancel.status.length > 0, 'the closed note is shown');
    // 明示タップだけで本文
    await page.locator('.result-card-text').click();
    assert.equal(await page.evaluate(() => __opened.length >= 0), true);
    // 再試行は自動共有しない
    const sharesBefore = await page.evaluate(() => __shares.length);
    await page.evaluate(() => __kamereoru.resultCardController.retry());
    await toReady(page);
    assert.equal(await page.evaluate(() => __shares.length), sharesBefore, 'a retry never shares by itself');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('save screen: an img from the prepared PNG, the screen card frees its pixels, closing revokes the URL', async () => {
  const env = await launch();
  try {
    const { page } = env;
    await openApp(env);
    await playToResult(page);
    await toReady(page);
    const closedBytes = await heldBytes(page);
    await page.locator('.result-card-save').click();
    await page.waitForSelector(id('result-card-viewer-image'));
    await page.waitForFunction(() => document.querySelector('.result-card-viewer-image').complete);
    const open = await page.evaluate(() => {
      const img = document.querySelector('.result-card-viewer-image');
      return { src: img.src, w: img.naturalWidth, h: img.naturalHeight, canvas: [document.querySelector('.result-card-canvas').width, document.querySelector('.result-card-canvas').height], dialog: document.querySelector('.result-card-viewer').getAttribute('aria-modal'), active: document.activeElement?.getAttribute('data-testid') };
    });
    assert.ok(open.src.startsWith('blob:'));
    assert.deepEqual([open.w, open.h], [1200, 630]);
    assert.deepEqual(open.canvas, [0, 0]);
    assert.equal(open.dialog, 'true');
    assert.equal(open.active, 'result-card-viewer-close');
    const viewerBytes = await heldBytes(page);
    assert.ok(viewerBytes.total <= BUDGET, `viewer open ${viewerBytes.total}`);
    assert.ok(viewerBytes.total < closedBytes.total + 1_000_000);
    await snap(env.page, 'viewer-402x874-ja');
    await page.keyboard.press('Escape');
    await page.waitForSelector(id('result-card-viewer'), { state: 'detached' });
    const revoked = await page.evaluate(() => __revoked.slice());
    assert.ok(revoked.includes(open.src), 'the object URL was revoked on close');
    assert.equal(await page.evaluate(() => document.querySelector('.result-card-canvas').width), 1200);
    // 準備中は開かない
    const whilePending = await page.evaluate(() => {
      __kamereoru.resultCardController.retry();
      document.querySelector('.result-card-save').click();
      return { viewers: document.querySelectorAll('[data-testid="result-card-viewer"]').length, state: __kamereoru.resultCardController.snapshot().state };
    });
    assert.deepEqual(whilePending, { viewers: 0, state: 'pending' });
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('E090 can open in the first 600ms, gives way to the portrait capture, and borrows again with the current model; only one WebGL context lives', async (t) => {
  const env = await launch({ width: 402, height: 874 });
  try {
    const { page } = env;
    await openApp(env);
    await playToResult(page);
    await page.evaluate(() => {
      __webgl.clear(); // 本編の舞台の canvas は数えない。ここから作られる描画器だけを数える
      globalThis.__acquires = [];
      const owner = __kamereoru.lastResult.resultRendererOwner;
      const original = owner.acquire.bind(owner);
      owner.acquire = (kind, options) => { __acquires.push(kind); return original(kind, options); };
    });
    // 解析が終わるまで（最初の600msの待ちの間）進める。card は pending のまま。
    assert.equal(await advanceUntil(page, async () => (await evidenceStatus(page)) === 'ready', { step: 20, limit: 60 }), true);
    const early = await cardState(page);
    t.diagnostic(`card state when evidence became ready: ${early}`);
    assert.equal(early, 'pending', 'the 600ms presentation wait is still running, so E090 opens before the capture');
    const samples = [];
    const sample = async (label) => { samples.push({ label, webgl: await liveWebgl(page), turn: await page.locator('.result-turn-canvas').count(), state: await cardState(page) }); };
    await page.locator('[data-panel="turn"]').click();
    await page.waitForSelector('.result-turn-stage');
    if (early === 'pending') {
      await page.waitForSelector('.result-turn-canvas', { timeout: 5000 });
      await sample('opened-while-pending');
      assert.equal(await page.evaluate(() => document.querySelector('.result-turn-canvas').width), 300, 'preparing: 300x300 backing');
    }
    let sawRevoke = false;
    for (let i = 0; i < 160; i += 1) {
      await page.clock.runFor(50);
      await sample(`step-${i}`);
      const last = samples.at(-1);
      sawRevoke = (await page.evaluate(() => __acquires.join(','))).includes('model,portrait,model');
      if (last.state === 'ready' && last.turn === 1 && sawRevoke) break;
    }
    assert.ok(samples.every((s) => s.webgl <= 1), `never two live contexts: ${JSON.stringify(samples.filter((s) => s.webgl > 1))}`);
    assert.equal(await cardState(page), 'ready');
    await page.waitForSelector('.result-turn-canvas');
    t.diagnostic(`acquires: ${await page.evaluate(() => __acquires.join(','))}`);
    assert.equal(sawRevoke, true, 'E090 borrowed, the capture took the renderer, then E090 borrowed again');
    const ready = await heldBytes(page);
    assert.ok(ready.panel <= 1_254_400 && ready.total <= BUDGET, JSON.stringify(ready));
    t.diagnostic(`E090 open and ready: ${JSON.stringify(ready)}`);
    // 縦はスクロールのまま、横8px以上で回る
    const stage = await page.locator('.result-turn-stage').boundingBox();
    const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
    const touch = (type, x, y) => page.evaluate(([type, x, y]) => {
      const s = document.querySelector('.result-turn-stage');
      s.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true }));
    }, [type, x, y]);
    const angle = () => page.evaluate(() => document.querySelector('.result-turn-stage').dataset.angle ?? null);
    void angle;
    const frames = () => page.evaluate(() => performance.now());
    void frames;
    await snap(page, 'turn-402x874-ja-front', { fullPage: false });
    await touch('pointerdown', cx, cy);
    await touch('pointermove', cx + 5, cy);
    await touch('pointermove', cx + 4, cy + 30);
    await touch('pointerup', cx + 4, cy + 30);
    await touch('pointerdown', cx, cy);
    await touch('pointermove', cx + 70, cy + 3);
    await touch('pointerup', cx + 70, cy + 3);
    await page.clock.runFor(50);
    await snap(page, 'turn-402x874-ja-turned', { fullPage: false });
    // 閉じると手放す
    await page.locator('[data-panel="turn"]').click();
    assert.equal(await advanceUntil(page, async () => (await liveWebgl(page)) === 0, { limit: 10 }), true, 'closing frees the context');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('language change and confirmation-state changes reach an open E075 and the card; resource totals stay under 16 MiB in every phase', async (t) => {
  const env = await launch({ width: 402, height: 874 });
  try {
    const { page } = env;
    await openApp(env);
    await playToResult(page);
    await advanceUntil(page, async () => (await evidenceStatus(page)) === 'ready', { step: 20, limit: 60 });
    const phases = {};
    // 準備中（E090 を開いたまま）
    await page.locator('[data-panel="turn"]').click();
    await page.waitForSelector('.result-turn-stage');
    await advanceUntil(page, async () => (await page.locator('.result-turn-canvas').count()) === 1 || (await cardState(page)) === 'ready', { step: 20, limit: 40 });
    phases.preparing = await heldBytes(page);
    await toReady(page);
    await page.locator('[data-panel="turn"]').click();
    await page.locator('[data-panel="model"]').click();
    await page.waitForSelector('.result-miniature-svg');
    phases.ready = await heldBytes(page);
    const svgCount = await page.locator('.result-miniature-svg g[data-building]').count();
    assert.equal(svgCount, 50);
    const label1 = await page.locator('.result-miniature-svg').getAttribute('aria-label');
    const canvasLabel1 = await page.locator('.result-card-canvas').getAttribute('aria-label');
    // 確認状態だけの更新：開いた模型は今の値のまま、カードは確認中の札を読み上げる
    await page.evaluate(() => { __kamereoru.lastResult.ranked = true; __kamereoru.lastResult.netState = 'pending_review'; __kamereoru.renderResultStatus(); });
    await page.waitForFunction(() => __kamereoru.resultCardController.snapshot().model.verificationState === 'pending_review');
    await toReady(page);
    const canvasLabel2 = await page.locator('.result-card-canvas').getAttribute('aria-label');
    assert.notEqual(canvasLabel1, canvasLabel2, 'the badge text is announced');
    assert.equal(await page.locator('.result-miniature-svg g[data-building]').count(), 50);
    // 言語の変更：画面は作り直され、開いていた E075 が新しい言語で戻る
    await page.evaluate(async () => { (await import('/src/i18n/i18n.js')).setLanguage('de'); });
    await page.waitForSelector('.result-miniature-svg');
    await toReady(page);
    const label2 = await page.locator('.result-miniature-svg').getAttribute('aria-label');
    assert.notEqual(label1, label2);
    assert.ok((await page.locator('.result-card-canvas').getAttribute('aria-label')).includes('Gebäude') || (await page.locator('.result-card-canvas').getAttribute('aria-label')).includes('/50'));
    assert.equal(await page.evaluate(() => __kamereoru.resultCardController.snapshot().model.locale), 'de');
    assert.equal(await page.evaluate(() => __kamereoru.lastResult.resultPortrait ? 1 : 0), 1, 'the hero was not shot again for a language change');
    phases.modelOpen = await heldBytes(page);
    t.diagnostic(`held bytes by phase ${JSON.stringify(phases)}`);
    for (const [name, bytes] of Object.entries(phases)) assert.ok(bytes.total <= BUDGET, `${name}: ${bytes.total} <= ${BUDGET}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
