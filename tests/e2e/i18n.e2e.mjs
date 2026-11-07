// 15言語の画面表示と共有（受入試験 LANG-TEST-01/02、SHARE-TEST-01 の自動ブラウザでの部分確認）。
// 翻訳の自然さと、iPhone 実機での読みやすさはここでは確かめない（docs/acceptance/results.md に別に記録）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome } from './helpers.mjs';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages.js';

const noOverflow = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('button, p, h1, h2, li, label')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1);
    return { page: doc.scrollWidth <= window.innerWidth + 1, wide: wide.map((el) => el.textContent.slice(0, 40)) };
  });

test('LANG-TEST-01: 15言語でホーム・設定・あそびかた・停止・結果の本文が切り替わり、402px幅で横にはみ出さない', async () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const env = await launch({ languages: [lang.locale], width: 402, height: 874 });
    const { page } = env;
    try {
      await openHome(page, env.url);
      const M = MESSAGES[lang.id];
      assert.equal(await page.getAttribute('html', 'lang'), lang.id);
      assert.equal((await page.textContent('[data-testid=home-start]')).trim(), M['home.start'], `${lang.id} start`);
      assert.equal((await page.textContent('.name-help')).trim(), M['name.help'], `${lang.id} help`);
      let o = await noOverflow(page);
      assert.ok(o.page && !o.wide.length, `${lang.id} home overflow ${o.wide}`);
      await page.click('[data-testid=home-settings]');
      assert.equal((await page.textContent('h1')).trim(), M['settings.title']);
      o = await noOverflow(page);
      assert.ok(o.page && !o.wide.length, `${lang.id} settings overflow ${o.wide}`);
      await page.click('.btn-back');
      await page.click('[data-testid=home-howto]');
      assert.equal((await page.textContent('.howto-list li')).trim(), M['howto.goal']);
      o = await noOverflow(page);
      assert.ok(o.page && !o.wide.length, `${lang.id} howto overflow ${o.wide}`);
      await page.click('.btn-back');
      // 停止画面（短縮開始は検証用。結果は送らない）
      await page.evaluate(() => globalThis.__kamereoru.debugStart({ atMs: 248600 }));
      assert.equal((await page.textContent('[data-testid=pause-resume]')).trim(), M['pause.resume']);
      o = await noOverflow(page);
      assert.ok(o.page && !o.wide.length, `${lang.id} pause overflow ${o.wide}`);
      await page.click('[data-testid=pause-resume]');
      await page.waitForSelector('[data-testid=result-buildings]', { timeout: 15000 });
      assert.equal((await page.textContent('.result-title')).trim(), M['result.cleared']);
      assert.equal((await page.textContent('[data-testid=result-share]')).trim(), M['share.button']);
      o = await noOverflow(page);
      assert.ok(o.page && !o.wide.length, `${lang.id} result overflow ${o.wide}`);
      assert.deepEqual(env.errors, [], lang.id);
    } finally {
      await env.close();
    }
  }
});

test('LANG-TEST-02: 未対応の言語だけなら英語。端末に保存できなくても、その画面で言語を切り替えられる', async () => {
  const env = await launch({ languages: ['xx-YY', 'zz'] });
  const { page, context } = env;
  try {
    await openHome(page, env.url);
    assert.equal(await page.getAttribute('html', 'lang'), 'en');
  } finally {
    await env.close();
  }
  const env2 = await launch({ languages: ['ja-JP'] });
  try {
    // IndexedDB を使えない端末を模す
    await env2.context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get: () => undefined, configurable: true });
    });
    await openHome(env2.page, env2.url);
    assert.match(await env2.page.textContent('.notices'), new RegExp(MESSAGES.ja['notice.storageUnavailable'].slice(0, 12)));
    await env2.page.click('[data-testid=home-settings]');
    await env2.page.selectOption('#lang-select', 'th');
    await env2.page.waitForFunction(() => document.documentElement.lang === 'th');
    assert.equal((await env2.page.textContent('h1')).trim(), MESSAGES.th['settings.title']);
  } finally {
    await env2.close();
  }
  assert.ok(context);
});

test('SHARE-TEST-01: Xの投稿画面を開けない時は、本文とURLを手で選べる形で出す（自動投稿しない）', async () => {
  const env = await launch({ languages: ['ja-JP'] });
  const { page } = env;
  try {
    await page.addInitScript(() => {
      window.open = () => null; // ポップアップが止められた
      Object.defineProperty(navigator, 'clipboard', { get: () => ({ writeText: () => Promise.reject(new Error('denied')) }), configurable: true });
    });
    await openHome(page, env.url);
    await page.click('[data-testid=home-share]');
    await page.waitForSelector('.share-manual');
    const text = await page.inputValue('.share-manual');
    assert.match(text, /カメレオる/);
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/.test(text), false, '内部IDを含めない');
  } finally {
    await env.close();
  }
  const env2 = await launch({ languages: ['en-US'] });
  try {
    // 試験環境から x.com には接続しないため、開こうとした URL だけを記録する
    await env2.page.addInitScript(() => {
      window.__opened = [];
      window.open = (u) => {
        window.__opened.push(u);
        return {};
      };
    });
    await openHome(env2.page, env2.url);
    await env2.page.click('[data-testid=home-share]');
    const opened = await env2.page.evaluate(() => window.__opened);
    assert.equal(opened.length, 1);
    assert.ok(opened[0].startsWith('https://x.com/intent/post?'), opened[0]);
    assert.match(new URL(opened[0]).searchParams.get('text'), /Kamereoru/);
    assert.equal(await env2.page.isVisible('.share-manual'), false, '開けた時はコピー画面を出さない');
  } finally {
    await env2.close();
  }
});
