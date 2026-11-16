// CL02 の e2e の共通部品（実 App＋実 ports の入口 fixtures/result-card.html を開く道具）。
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export const id = (name) => `[data-testid="${name}"]`;
export const FIXTURE = 'tests/e2e/fixtures/result-card.html';
export const EVIDENCE = process.env.CL02_EVIDENCE_DIR || null;
export const BUDGET = 16_777_216;
export const ATLAS_BYTES = 1920 * 1520 * 4;

/** 画面の中で、建物13〜16を遊ぶ脚本を実行して途中終了する（result-evidence.e2e と同じ流れ）。 */
export const SCRIPT = async (endMs) => {
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
export const INSTRUMENT = () => {
  globalThis.__shares = [];
  globalThis.__shareMode = 'ok';
  globalThis.__opened = [];
  globalThis.__revoked = [];
  globalThis.__webgl = new Set();
  globalThis.__encodingCanvases = new Set();
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function trackedEncode(...args) {
    globalThis.__encodingCanvases.add(this);
    return toBlob.apply(this, args);
  };
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

export async function openApp(env, { lang = 'ja' } = {}) {
  const { page, context } = env;
  await context.addInitScript(INSTRUMENT);
  await page.goto(env.url + FIXTURE);
  await page.waitForSelector(id('home-start'));
  if (lang !== 'ja') await page.evaluate(async (l) => { (await import('/src/i18n/i18n.js')).setLanguage(l); }, lang);
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
}

export async function playToResult(page) {
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

export const cardState = (page) => page.evaluate(() => __kamereoru.resultCardController?.snapshot().state ?? null);
export const evidenceStatus = (page) => page.evaluate(() => __kamereoru.lastResult?.evidence?.status ?? null);

/** 止めた時計を少しずつ進め、条件が真になるのを待つ（固定時間は待たない）。 */
export async function advanceUntil(page, predicate, { step = 50, limit = 120 } = {}) {
  for (let i = 0; i < limit; i += 1) {
    if (await predicate()) return true;
    await page.clock.runFor(step);
  }
  return predicate();
}

export async function toReady(page) {
  assert.equal(await advanceUntil(page, async () => (await cardState(page)) === 'ready'), true, 'the card becomes ready');
}

export const liveWebgl = (page) => page.evaluate(() => [...__webgl].filter((c) => c.width > 0 && c.height > 0).length);

export async function heldBytes(page) {
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
      modelImage: turn ? 256 * 256 * 4 : 0, // No.28 eye canvas; offscreen but retained by its material.
      generation: [...__encodingCanvases].reduce((sum, c) => sum + c.width * c.height * 4, 0),
      viewer: viewer && viewer.naturalWidth ? viewer.naturalWidth * viewer.naturalHeight * 4 : 0,
    };
    return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
  }, ATLAS_BYTES);
}

export async function snap(page, name, options = {}) {
  if (!EVIDENCE) return;
  await mkdir(EVIDENCE, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE}/${name}.png`, ...options });
}

