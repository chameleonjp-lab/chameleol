// CL02 の画像の証拠を docs/acceptance/pr26/cl02/ へ書き出す（CL02_EVIDENCE_DIR を指した時だけ動く）。倍率2。
// 既存15言語のままの配置の画像であり、新しい文言の翻訳が入った後の15言語の合格を示すものではない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { launch } from './helpers.mjs';
import { id, EVIDENCE, openApp, playToResult, toReady, advanceUntil, evidenceStatus } from './fixtures/result-card-helpers.mjs';

const skip = EVIDENCE ? false : 'set CL02_EVIDENCE_DIR to write the images';
const out = (name) => `${EVIDENCE}/${name}`;
const LANGS = ['ja', 'de', 'ru', 'th', 'vi'];

/** 画面の中で描いた canvas（合成シート）を PNG ファイルへ書く。 */
async function writeDataUrl(name, url) {
  await mkdir(EVIDENCE, { recursive: true });
  await writeFile(out(name), Buffer.from(url.split(',')[1], 'base64'));
}

test('evidence: result screens at 3 sizes, save screen, the 5 languages, panels', { skip }, async () => {
  await mkdir(EVIDENCE, { recursive: true });
  for (const [w, h] of [[402, 700], [402, 874], [874, 402]]) {
    const env = await launch({ width: w, height: h, scale: 2 });
    try {
      const { page } = env;
      await openApp(env);
      await playToResult(page);
      await advanceUntil(page, async () => (await evidenceStatus(page)) === 'ready', { step: 20, limit: 60 });
      await toReady(page);
      await page.screenshot({ path: out(`result-${w}x${h}-ja-first.png`) });
      if (w === 402 && h === 700) await page.screenshot({ path: out(`result-${w}x${h}-ja-full.png`), fullPage: true });
      if (w === 402 && h === 874) {
        await page.locator('.result-card-save').click();
        await page.waitForSelector(id('result-card-viewer-image'));
        await page.waitForFunction(() => document.querySelector('.result-card-viewer-image').complete);
        await page.screenshot({ path: out('save-402x874-ja.png') });
        await page.keyboard.press('Escape');
        // E090：正面と、横になぞって回した後
        await page.locator('[data-panel="turn"]').click();
        await page.waitForSelector('.result-turn-canvas');
        await page.locator('.result-turn').scrollIntoViewIfNeeded();
        await page.clock.runFor(100);
        await page.locator('.result-turn-stage').screenshot({ path: out('turn-front-402x874-ja.png') });
        const box = await page.locator('.result-turn-stage').boundingBox();
        const touch = (type, x, y) => page.evaluate(([type, x, y]) => document.querySelector('.result-turn-stage').dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true })), [type, x, y]);
        await touch('pointerdown', box.x + 100, box.y + 100);
        await touch('pointermove', box.x + 100 + 170, box.y + 104);
        await touch('pointerup', box.x + 270, box.y + 104);
        await page.clock.runFor(100);
        await page.locator('.result-turn-stage').screenshot({ path: out('turn-turned-402x874-ja.png') });
        await page.locator('[data-panel="turn"]').click();
        // E075 街の模型、警戒グラフ、フィルム
        await page.locator('[data-panel="model"]').click();
        await page.waitForSelector('.result-miniature-svg');
        await page.locator('.result-evidence-host').screenshot({ path: out('model-402x874-ja.png') });
        await page.locator('[data-panel="alert"]').click();
        await page.waitForSelector('svg.evidence-graph');
        await page.locator('.result-evidence-host').screenshot({ path: out('graph-402x874-ja.png') });
        await page.locator('[data-panel="streak"]').click();
        await page.waitForSelector('.evidence-film');
        await page.locator('.result-evidence-host').screenshot({ path: out('film-402x874-ja.png') });
        const filmWidth = await page.evaluate(() => document.querySelector('.evidence-film-frame').getBoundingClientRect().width);
        assert.equal(filmWidth, 38);
      }
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  }
  for (const lang of LANGS.slice(1)) {
    const env = await launch({ width: 402, height: 874, scale: 2 });
    try {
      const { page } = env;
      await openApp(env, { lang });
      await playToResult(page);
      await advanceUntil(page, async () => (await evidenceStatus(page)) === 'ready', { step: 20, limit: 60 });
      await toReady(page);
      await page.screenshot({ path: out(`result-402x874-${lang}-first.png`) });
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  }
});

test('evidence: card sheets (5 languages x 0/1/20/50 buildings) and the six states', { skip }, async (t) => {
  const env = await launch({ width: 402, height: 874, scale: 1 });
  try {
    const { page } = env;
    await openApp(env);
    const sheets = await page.evaluate(async (LANGS) => {
      const draw = await import('/src/presentation/result-card-draw.js');
      const portraitMod = await import('/src/presentation/result-portrait.js');
      const { rankForPassed } = await import('/src/presentation/result-card-data.js');
      const { RULES_V1 } = await import('/src/rules/v1/config.js');
      const renderer = portraitMod.createResultRenderer();
      const lease = () => ({ renderer, signal: new AbortController().signal });
      const make = async (hero) => (await portraitMod.createResultPortrait({ hero, signal: new AbortController().signal, rendererLease: lease() })).image;
      const initial = { ...RULES_V1.initialColor };
      const cases = [
        { passed: 0, score: 0, bonus: 0, hero: { status: 'missing', building: null, hsv: initial, outlineBuilding: 1, average: null, instantMatch: null } },
        { passed: 1, score: 320, bonus: 1, hero: { status: 'matched', building: 1, hsv: { h: 9000, s: 7000, v: 9000 }, outlineBuilding: 1, average: 92, instantMatch: 95 } },
        { passed: 20, score: 7280, bonus: 23, hero: { status: 'matched', building: 12, hsv: { h: 21000, s: 5000, v: 8500 }, outlineBuilding: 12, average: 93, instantMatch: 97 } },
        { passed: 50, score: 31250, bonus: 156, hero: { status: 'matched', building: 37, hsv: { h: 30000, s: 6500, v: 9500 }, outlineBuilding: 37, average: 97, instantMatch: 99 } },
      ];
      const portraits = [];
      for (const c of cases) portraits.push(await make(c.hero));
      const modelOf = (c, lang, over = {}) => ({ revision: 1, locale: lang, passed: c.passed, rankKey: rankForPassed(c.passed).rankKey, totalScore: c.score, bonusCount: c.bonus, countState: 'known', hero: c.hero, verificationState: c.passed === 20 ? 'pending_review' : null, ...over });
      const sheet = (w, h, cols, scale, draws) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0c1e';
        ctx.fillRect(0, 0, w, h);
        draws.forEach((fn, i) => {
          const card = document.createElement('canvas');
          card.width = 1200;
          card.height = 630;
          fn(card);
          ctx.drawImage(card, (i % cols) * 1200 * scale, Math.floor(i / cols) * 630 * scale, 1200 * scale, 630 * scale);
          card.width = 0;
        });
        const url = canvas.toDataURL('image/png');
        canvas.width = 0;
        return url;
      };
      const result = {};
      for (const lang of LANGS) {
        result[`card-${lang}`] = sheet(1440, 756, 2, 0.6, cases.map((c, i) => (card) => draw.drawResultCard(card, { model: modelOf(c, lang), portrait: portraits[i], locale: lang })));
      }
      const c20 = cases[2];
      const states = [
        (card) => draw.drawResultCard(card, { model: modelOf(c20, 'ja', { verificationState: null }), portrait: portraits[2], locale: 'ja' }),
        (card) => draw.drawResultCard(card, { model: modelOf(cases[0], 'ja'), portrait: portraits[0], locale: 'ja' }),
        (card) => draw.drawResultCard(card, { model: modelOf(c20, 'ja', { hero: { status: 'pending', building: null, hsv: null, outlineBuilding: 1 }, verificationState: null }), portrait: null, locale: 'ja' }),
        (card) => draw.drawResultCard(card, { model: modelOf(c20, 'ja', { verificationState: null }), portrait: null, locale: 'ja', failed: true }),
        (card) => draw.drawResultCard(card, { model: modelOf(c20, 'ja', { verificationState: 'verifying' }), portrait: portraits[2], locale: 'ja' }),
        (card) => draw.drawResultCard(card, { model: modelOf(c20, 'ja', { bonusCount: null, countState: 'missing', verificationState: null }), portrait: portraits[2], locale: 'ja' }),
      ];
      result['card-states-ja'] = sheet(1800, 630, 3, 0.5, states);
      // 画面の準備中カード（600x315）の実寸の見え方も1枚
      const half = document.createElement('canvas');
      half.width = 600;
      half.height = 315;
      draw.drawResultCard(half, { model: modelOf(c20, 'ja', { verificationState: null }), portrait: null, locale: 'ja' });
      portraits.forEach((p) => { p.width = 0; });
      portraitMod.destroyResultRenderer(renderer);
      return result;
    }, LANGS);
    for (const [name, url] of Object.entries(sheets)) await writeDataUrl(`${name}.png`, url);
    // 街の模型の状態（通過・到達・未到達・色の記録なし・50棟）
    await page.setViewportSize({ width: 874, height: 900 });
    await page.evaluate(async () => {
      const { createMiniaturePanel } = await import('/src/presentation/result-miniature-view.js');
      const mk = (passed, arrived, missingWalls = []) => ({ available: true, reason: null, cells: Array.from({ length: 50 }, (_, i) => ({ building: i + 1, state: i + 1 <= passed ? 'passed' : i + 1 === arrived ? 'arrived' : 'unreached', wallHsv: missingWalls.includes(i + 1) ? null : { h: (i * 733) % 36000, s: 4000 + ((i * 97) % 4000), v: 6500 + ((i * 53) % 3000) }, bodyHsv: i + 1 <= passed && i % 3 !== 2 ? { h: (i * 733 + 500) % 36000, s: 6000, v: 9000 } : null })) });
      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0;padding:12px;background:#14183a;color:#fff6d6;display:grid;grid-template-columns:repeat(2,402px);gap:12px;font-family:system-ui';
      for (const [title, mini] of [['passed 20, arrived 21', mk(20, 21)], ['passed 0, arrived 1', mk(0, 1)], ['colors missing (3, 8, 21)', mk(20, 21, [3, 8, 21])], ['cleared 50', mk(50, 50)]]) {
        const cell = document.createElement('section');
        const h = document.createElement('h3');
        h.textContent = title;
        h.style.cssText = 'margin:0 0 6px;font-size:14px';
        cell.append(h);
        const body = document.createElement('div');
        cell.append(body);
        document.body.append(cell);
        const panel = createMiniaturePanel({ getSnapshot: () => ({ model: { locale: 'ja' }, miniature: mini }), register: null });
        panel.render(body, null, { doc: document });
      }
    });
    await page.screenshot({ path: out('model-states.png') });
    t.diagnostic('card sheets written');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
  for (const name of ['card-ja.png', 'card-states-ja.png', 'model-states.png']) assert.ok((await stat(out(name))).size > 1000);
});
