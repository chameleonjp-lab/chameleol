// 自動ブラウザ試験の補助。端末に近い表示（402×874、タッチあり）で開く。
// 自動ブラウザの結果は、iPhone実機の確認とは別のものとして記録する。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export async function launch({ width = 402, height = 874, locale = 'ja-JP', languages = null, root = ROOT, scale = 1 } = {}) {
  const server = await startServer({ rootDir: root, listenPort: 0 });
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, hasTouch: true, isMobile: true, locale });
  // System Chromium also requests an implicit favicon. It is browser chrome,
  // not an application asset; keep that request from polluting console checks.
  await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  if (languages) {
    await context.addInitScript((langs) => {
      Object.defineProperty(navigator, 'languages', { get: () => langs, configurable: true });
      Object.defineProperty(navigator, 'language', { get: () => langs[0], configurable: true });
    }, languages);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const url = `http://127.0.0.1:${port}/`;
  return {
    browser,
    context,
    page,
    url,
    errors,
    async close() {
      await browser.close();
      server.close();
    },
  };
}

export async function openHome(page, url) {
  await page.goto(url);
  await page.waitForSelector('[data-testid=home-start]');
}

/** 色合わせの目印を実際に操作し、静止案内を自動で終える。 */
export async function completeStationaryGuide(page) {
  await page.waitForFunction(() => globalThis.__kamereoru?.guidance != null);
  const stationary = await page.evaluate(() => globalThis.__kamereoru.guidance.view().stationary);
  if (!stationary) return;
  // Guidance exists before asynchronous stage preparation mounts its targets.
  // Await the actual control marker before reading its screen coordinates.
  await page.locator('.palette-guide-target').waitFor({ state: 'visible' });
  const bar = page.locator('.bar-guide-target');
  if (await bar.isVisible()) { const r=await bar.boundingBox(); await page.mouse.click(r.x+r.width/2,r.y+r.height/2); }
  const r=await page.locator('.palette-guide-target').boundingBox();
  await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
  await page.waitForFunction(() => !globalThis.__kamereoru.guidance.view().stationary);
}

/** 名前なしで本編を始め、初回の演出と案内を済ませる。 */
export async function startAnonymous(page) {
  await page.click('[data-testid=home-start]');
  const skip = await page.waitForSelector('[data-testid=skip-opening]', { timeout: 4000 }).catch(() => null);
  if (skip) await skip.click().catch(() => {});
  await completeStationaryGuide(page);
  await page.waitForFunction(() => globalThis.__kamereoru?.session?.running === true);
}

export const appState = (page) =>
  page.evaluate(() => {
    const a = globalThis.__kamereoru;
    const s = a.session?.state;
    return s ? { t: s.t, status: s.status, passed: s.passed, unlocked: s.brightnessUnlocked, reached20: s.reached20, running: a.session.running, color: s.color, alert: s.alert } : null;
  });
