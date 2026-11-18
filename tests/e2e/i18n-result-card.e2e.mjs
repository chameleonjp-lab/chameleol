// Finished UI text in the normal App, with the real card renderer and all 15 dictionaries.
// Three browser contexts are reused across locales. Native iPhone sharing/saving is a separate check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, openHome } from './helpers.mjs';
import { INSTRUMENT, advanceUntil, toReady } from './fixtures/result-card-helpers.mjs';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { LANGUAGE_IDS } from '../../src/i18n/languages.js';

const OUT = process.env.CL03_SCREENSHOTS;
const layouts = [[402, 700], [402, 874], [874, 402]];

async function fits(page, label, selectors) {
  const result = await page.evaluate(selectors => {
    const failures = [];
    for (const el of document.querySelectorAll(selectors)) {
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1) {
        failures.push({ text: el.textContent, left: r.left, right: r.right, width: el.clientWidth, contentWidth: el.scrollWidth });
      }
    }
    return { page: document.documentElement.scrollWidth <= innerWidth + 1, failures };
  }, selectors);
  assert.equal(result.page, true, `${label}: page overflow`);
  assert.deepEqual(result.failures, [], `${label}: clipped or overflowing text`);
  return result;
}

for (const [width, height] of layouts) {
  test(`result localization ${width}x${height}: all 15 locales reach real badge, model, turn, error and save text`, async t => {
    const env = await launch({ width, height });
    const { page } = env;
    const facts = [];
    try {
      await env.context.addInitScript(INSTRUMENT);
      await openHome(page, env.url);
      await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
      // Use the same frozen, visible preview a reviewer sees in the verification menu.
      for (const lang of LANGUAGE_IDS) {
        await page.evaluate(async lang => {
          (await import('/src/i18n/i18n.js')).setLanguage(lang);
          const proof = await __kamereoru.debugPresentation({ effectId: 44 });
          if (!proof.badge) throw Error('The real E044 observer did not produce a badge');
        }, lang);
        assert.equal(await page.locator('.bonus-card-badge').textContent(), `◎ ${MESSAGES[lang]['presentation.nearPerfect']}`, lang);
        await fits(page, `${lang} badge`, '.bonus-card-badge');
      }
      await page.evaluate(async () => {
        (await import('/src/i18n/i18n.js')).setLanguage('ja');
        await __kamereoru.debugPresentation({ effectId: 94 });
      });
      await toReady(page);
      // A missing historical bonus record is distinct from zero. Keep the fixture's real played
      // history, colors, score and summary fields; remove only its bonus record for this UI path.
      await page.evaluate(() => {
        const r = __kamereoru.lastResult;
        r.summary = { ...r.summary, bonus: null };
        __kamereoru.showResult();
      });
      await toReady(page);

      for (const lang of LANGUAGE_IDS) await t.test(lang, async () => {
        const M = MESSAGES[lang];
        await page.evaluate(async lang => {
          (await import('/src/presentation/result-card-text.js')).USED_FALLBACKS.clear();
          (await import('/src/i18n/i18n.js')).setLanguage(lang);
        }, lang);
        await toReady(page);
        assert.equal(await page.getAttribute('html', 'lang'), lang);
        assert.equal(await page.locator('.result-card-save').textContent(), M['card.save']);
        assert.equal(await page.locator('.result-card-text').textContent(), M['card.textShare']);
        assert.equal(await page.locator('[data-panel=model]').textContent(), M['evidence.model.title']);
        assert.equal(await page.locator('[data-panel=turn]').textContent(), M['evidence.turn.title']);
        assert.ok((await page.locator('.result-card-canvas').getAttribute('aria-label')).includes(M['card.bonusMissing']));
        assert.ok((await page.locator('.result-card-summary').textContent()).includes(M['card.bonusMissing']));
        await fits(page, `${lang} result`, '.result-card-summary, .result-actions button, .evidence-chip');

        await page.locator('[data-panel=model]').click();
        const modelLabel = await page.locator('.result-miniature-svg').getAttribute('aria-label');
        assert.ok(modelLabel.includes(M['evidence.model.alt'].replace('{passed}', '50').replace('{arrived}', '50')), lang);
        assert.deepEqual(await page.locator('.result-miniature-legend li').allTextContents(), ['passed', 'arrived', 'unreached', 'missing'].map(s => M[`evidence.model.${s}`]));
        await fits(page, `${lang} model`, '.evidence-chip, .result-miniature-legend li');

        await page.locator('[data-panel=turn]').click();
        assert.equal(await advanceUntil(page, async () => (await page.locator('.result-turn-canvas').count()) === 1), true, `${lang}: real turn canvas`);
        assert.equal(await page.locator('.result-turn-hint').textContent(), M['evidence.turn.hint']);
        assert.equal(await page.locator('.result-turn-left').getAttribute('aria-label'), M['evidence.turn.left']);
        assert.equal(await page.locator('.result-turn-right').getAttribute('aria-label'), M['evidence.turn.right']);
        assert.equal(await page.locator('.result-turn-canvas').getAttribute('aria-label'), M['evidence.turn.alt']);
        await fits(page, `${lang} turn`, '.evidence-chip, .result-turn-hint');
        await page.locator('[data-panel=turn]').click();

        await page.evaluate(() => { __shareMode = 'fail'; });
        await page.locator('[data-testid=result-share]').click();
        await page.waitForFunction(() => __kamereoru.resultCardController.snapshot().state === 'failed');
        assert.equal(await page.locator('.result-card-status').textContent(), M['card.shareFailed']);
        const payload = await page.evaluate(() => __shares.at(-1));
        assert.ok(payload.text.includes(M['share.result.title']), lang);
        assert.ok(payload.text.includes(M['share.result.cleared']), lang);
        assert.doesNotMatch(payload.text, /\{\w+\}|(?:card|evidence|presentation)\.[a-zA-Z]/);
        await fits(page, `${lang} share error`, '.result-card-status, .result-card-secondary button');

        await page.locator('.result-card-save').click();
        await page.waitForFunction(() => document.querySelector('.result-card-viewer-image')?.naturalWidth === 1200);
        assert.equal(await page.locator('.result-card-viewer-title').textContent(), M['card.viewerTitle']);
        assert.equal(await page.locator('.result-card-viewer-hint').textContent(), M['card.saveHint']);
        assert.equal(await page.locator('.result-card-viewer-close').textContent(), M['common.close']);
        assert.ok((await page.locator('.result-card-viewer-image').getAttribute('alt')).includes(M['card.bonusMissing']));
        await fits(page, `${lang} save`, '.result-card-viewer-title, .result-card-viewer-hint, .result-card-viewer .btn');
        const gapAboveImage = await page.locator('.result-card-viewer').evaluate(viewer => {
          const bounds = selector => viewer.querySelector(selector).getBoundingClientRect();
          return bounds('img').top - Math.max(bounds('h2').bottom, bounds('button').bottom);
        });
        assert.ok(gapAboveImage >= 0, `${lang}: save image overlaps its header by ${-gapAboveImage}px`);
        if (OUT && ['de', 'ru', 'th'].includes(lang)) {
          await mkdir(OUT, { recursive: true });
          await page.screenshot({ path: `${OUT}/localization-${width}x${height}-${lang}-save.png` });
        }
        await page.locator('.result-card-viewer-close').click();

        // A genuine PNG failure exposes the existing translated retry path. Retrying never shares.
        const sharesBefore = await page.evaluate(() => __shares.length);
        await page.evaluate(() => { __encodeFailures = 1; __kamereoru.resultCardController.retry(); });
        await page.waitForFunction(() => __kamereoru.resultCardController.snapshot().state === 'failed');
        assert.equal(await page.locator('.result-card-status').textContent(), M['card.failed']);
        assert.equal(await page.locator('.result-card-retry').textContent(), M['card.retry']);
        await fits(page, `${lang} retry`, '.result-card-status, .result-card-secondary button');
        await page.locator('.result-card-retry').click();
        // The cached portrait only needs native PNG encoding on retry. Wait in real time.
        await page.waitForFunction(() => __kamereoru.resultCardController.snapshot().state === 'ready', null, { polling: 50, timeout: 15000 });
        assert.equal(await page.evaluate(() => __shares.length), sharesBefore);
        assert.deepEqual(await page.evaluate(async () => (await import('/src/presentation/result-card-text.js')).usedFallbackReport()), []);
        facts.push({ lang, width, height, gapAboveImage, modelLabel, sharedTitle: payload.text.split('\n')[0], normalFallbacks: 0 });
      });
      assert.equal(facts.length, 15);
      assert.deepEqual(env.errors, []);
    } finally {
      if (OUT) {
        await mkdir(OUT, { recursive: true });
        await writeFile(`${OUT}/localization-${width}x${height}.json`, JSON.stringify(facts, null, 2));
      }
      await env.close();
    }
  });
}
