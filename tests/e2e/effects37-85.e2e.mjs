import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome, startAnonymous } from './helpers.mjs';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';

// Use the normal start, persistence and finish path; accelerate only game time.
async function finishClear(page) {
  await page.evaluate(() => {
    const session = __kamereoru.session;
    session.pause('fixture');
    for (let i = 0; i < session.rules.buildingCount; i++) {
      const target = session.game.course.targets[i];
      session.apply({ type: 'color', t: Math.max(session.state.t, i * 5000), ...target, v: i < 19 ? 10000 : target.v });
      session.apply({ type: 'tick', t: (i + 1) * 5000 });
    }
  });
  await page.locator('[data-testid="skip-ending"]').waitFor();
  await page.locator('[data-testid="skip-ending"]').click();
  await page.locator('[data-testid="result-again"]').waitFor();
}

test('effects37-85: normal first clear shows the stored date; language redraw and replay preserve it', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await finishClear(page);
    const stored = await page.evaluate(() => __kamereoru.store.get('presentation.stats.v1'));
    assert.equal(await page.evaluate(() => __kamereoru.lastResult.firstClearAt), stored.firstClearAt);
    assert.equal(await page.locator('.result-ticket time').getAttribute('datetime'), new Date(stored.firstClearAt).toISOString());
    await page.evaluate(() => __kamereoru.changeLanguage('en'));
    assert.equal(await page.locator('.result-ticket time').getAttribute('datetime'), new Date(stored.firstClearAt).toISOString());
    assert.ok((await page.locator('.result-ticket').textContent()).includes('First escape on this device!'));
    await page.locator('[data-testid="result-again"]').click();
    await page.waitForFunction(() => __kamereoru.session?.running === true);
    await finishClear(page);
    assert.equal(await page.locator('.result-ticket').count(), 0);
    assert.equal(await page.evaluate(async () => (await __kamereoru.store.get('presentation.stats.v1')).firstClearAt), stored.firstClearAt);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

for (const [width, height, reducedMotion] of [[402, 700, false], [402, 874, false], [874, 402, false], [402, 700, true]]) {
  test(`effects37-85: ticket fits ${width}x${height}, reduced=${reducedMotion}, in every supported language`, async () => {
    const env = await launch({ width, height });
    const { page } = env;
    try {
      if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
      await openHome(page, env.url);
      await page.evaluate(() => __kamereoru.debugPresentation({ effectId: 85 }));
      await page.evaluate(() => {
        __kamereoru.lastResult.firstClearAt = Date.parse('2026-11-13T12:00:00.000Z');
        __kamereoru.showResult();
      });
      for (const language of SUPPORTED_LANGUAGES) {
        await page.evaluate((id) => __kamereoru.changeLanguage(id), language.id);
        const ticket = page.locator('.result-ticket');
        await ticket.scrollIntoViewIfNeeded();
        const layout = await ticket.evaluate((node) => {
          const r = node.getBoundingClientRect();
          return { display: getComputedStyle(node).display, columns: getComputedStyle(node).gridTemplateColumns, left: r.left, right: r.right, scroll: node.scrollWidth, width: node.clientWidth, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth };
        });
        assert.equal(layout.display, 'grid', language.id);
        assert.equal(layout.columns.split(' ').length, 2, language.id);
        assert.ok(layout.left >= 0 && layout.right <= width + 1, JSON.stringify(layout));
        assert.ok(layout.scroll <= layout.width + 1 && layout.pageWidth <= layout.viewport + 1, JSON.stringify(layout));
        assert.ok((await ticket.textContent()).includes(MESSAGES[language.id].resultFirstClear), language.id);
        assert.equal(await ticket.locator('time').getAttribute('datetime'), '2026-11-13T12:00:00.000Z');
        assert.equal(await page.locator('[data-testid="result-again"]').isEnabled(), true);
      }
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}
