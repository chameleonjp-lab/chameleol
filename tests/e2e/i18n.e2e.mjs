// 15言語の画面表示と共有（受入試験 LANG-TEST-01/02、SHARE-TEST-01 の自動ブラウザでの部分確認）。
// 翻訳の自然さと、iPhone 実機での読みやすさはここでは確かめない（docs/acceptance/results.md に別に記録）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome, openXShare } from './helpers.mjs';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages.js';

const noOverflow = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('.btn, p, h1, h2, li, label')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1);
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
      assert.equal(await page.getByRole('combobox', { name: M['settings.languageTitle'], exact: true }).inputValue(), lang.id);
      assert.equal((await page.textContent('[data-testid=home-start]')).trim(), M['home.start'], `${lang.id} start`);
      assert.equal((await page.textContent('.name-help')).trim(), M['name.localHelp'], `${lang.id} help`);
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

test('LANG-TEST-02: 未対応の端末は日本語で始まり、ホームの language から明示的に選んだ言語を保存する', async () => {
  const env = await launch({ languages: ['xx-YY', 'zz'] });
  const { page, context } = env;
  try {
    await openHome(page, env.url);
    assert.equal(await page.getAttribute('html', 'lang'), 'ja');
    const chooser = page.getByRole('combobox', { name: 'language', exact: true });
    assert.equal(await chooser.inputValue(), '');
    for (const size of [{ width: 402, height: 874 }, { width: 874, height: 402 }]) {
      await page.setViewportSize(size);
      await page.waitForFunction(({ width, height }) => {
        const rect = document.querySelector('#home-lang-select').getBoundingClientRect();
        const header = document.querySelector('.home-header').getBoundingClientRect();
        return innerWidth === width && innerHeight === height &&
          Math.abs(rect.left - header.left) <= 4 && Math.abs(rect.top - header.top) <= 4 &&
          rect.width >= 44 && rect.height >= 44 && rect.bottom <= height;
      }, size);
    }
    assert.equal(await page.locator('.home-language span').innerText(), 'language');
    await chooser.selectOption('ja');
    await page.waitForFunction(async () => (await window.__kamereoru.store.get('lang')) === 'ja');
    await page.reload();
    await page.waitForSelector('#home-lang-select');
    assert.equal(await page.getByRole('combobox', { name: '言語', exact: true }).inputValue(), 'ja');
    await page.selectOption('#home-lang-select', 'fr');
    await page.waitForFunction(async () => (await window.__kamereoru.store.get('lang')) === 'fr');
    await page.reload();
    await page.waitForSelector('#home-lang-select');
    assert.equal(await page.getAttribute('html', 'lang'), 'fr');
    assert.equal(await page.getByRole('combobox', { name: 'Langue', exact: true }).inputValue(), 'fr');
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

test('SHARE-TEST-01: ホームから言語に合わせた本文と正式URLでXの投稿画面を開く', async () => {
  for (const [language, title] of [['ja-JP', /カメレオる/], ['en-US', /Kamereoru/]]) {
    const env = await launch({ languages: [language] });
    try {
      await openHome(env.page, env.url);
      await env.page.fill('#name-input', 'private nickname');
      const intent = await openXShare(env.page, 'home-share');
      assert.equal(intent.origin + intent.pathname, 'https://x.com/intent/tweet');
      assert.equal(intent.searchParams.get('url'), 'https://chameleonjp-lab.github.io/chameleol/');
      assert.match(intent.searchParams.get('text'), title);
      assert.doesNotMatch(intent.href, /private|[0-9a-f]{8}-[0-9a-f]{4}/);
      assert.equal(await env.page.getByTestId('home-start').isVisible(), true);
    } finally { await env.close(); }
  }
});

test('本人の今回順位と正式な棟数を結果とXに反映し、審査中は順位を外す', async () => {
  const env = await launch({ languages: ['ja-JP'] });
  const { page } = env;
  let status = 'official';
  const metrics = { runRank: 3, totalPlays: 4, clearOrdinal: null };
  const detail = { buildings: 7, rankAverage: 8999 };
  try {
    await page.addInitScript(() => {
      localStorage.setItem('kamereoru.apiBase', '/test-api');
    });
    await page.route('**/test-api/ranking?*', route => route.fulfill({ json: {
      ok: true, version: 1, rows: [], nextAfter: null, nameCount: 0, restarted: false,
    } }));
    await page.route('**/test-api/status', route => route.fulfill({ json: {
      ok: true, items: route.request().postDataJSON().items.map(({playId}) => ({playId, status, official: detail, metrics})),
    } }));
    await openHome(page, env.url);
    await page.evaluate(async () => {
      const app = window.__kamereoru;
      const playId = crypto.randomUUID();
      const summary = { endReason: 'detected', buildings: 8, rankAverage: 9000, maxCombo: 2, score: { total: 320 } };
      await app.store.put('records', { playId, secret: 'test-secret', summary, status: 'pending_review' });
      app.lastResult = { playId, ranked: true, name: 'A', netState: 'pending', summary };
      app.showResult();
      await app.pollResult();
    });
    const shareText = async () => new URL(await page.getByTestId('result-share').getAttribute('href')).searchParams.get('text');
    assert.match(await page.textContent('.result-rank'), /3位／4人中/);
    const text = await shareText();
    assert.match(text, /7棟/);
    assert.match(text, /320点/);
    assert.match(text, /3位／4人中/);
    status = 'under_review';
    await page.evaluate(() => __kamereoru.pollResult());
    assert.equal(await page.locator('.result-rank').isVisible(), false);
    assert.doesNotMatch(await shareText(), /3位／4人中/);
  } finally {
    await env.close();
  }
});

test('結果の上位表に10行が見え、枠内で同率30位の32行目までスクロールできる', async () => {
  const env = await launch({ languages: ['ja-JP'] });
  const { page } = env;
  try {
    await page.addInitScript(() => localStorage.setItem('kamereoru.apiBase', '/test-api'));
    const rows = Array.from({length: 32}, (_, i) => ({
      position:i+1, rank:Math.min(i+1,30), name:'長い名前'.repeat(4) + i, buildings:20, average:9000,
    }));
    await page.route('**/test-api/ranking?*', route => {
      const after = new URL(route.request().url()).searchParams.get('after');
      return route.fulfill({json: {ok:true, rows:after ? rows.slice(30) : rows.slice(0,30),
        version:7, nextAfter:after ? null : 30, restarted:false, nameCount:32}});
    });
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugPresentation({effectId:78}));
    await page.waitForFunction(() => document.querySelectorAll('.result-ranking .rank-row').length === 32);
    for (const fontSize of ['100%', '150%']) {
      await page.evaluate(size => document.documentElement.style.fontSize = size, fontSize);
      const layout = await page.locator('.result-ranking .rank-list').evaluate(list => {
        list.scrollTop = 0;
        const row = list.firstElementChild;
        const visibleHeight = list.getBoundingClientRect().height;
        const firstScroll = scrollY;
        list.scrollTop = list.scrollHeight;
        const reachedLast = list.lastElementChild.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1;
        const independent = scrollY === firstScroll;
        window.scrollBy(0,250);
        return {visibleRows:visibleHeight / row.getBoundingClientRect().height, reachedLast, independent, pageScrolled:scrollY !== firstScroll};
      });
      assert.ok(Math.abs(layout.visibleRows - 10) < 0.001, String(layout.visibleRows));
      assert.equal(layout.reachedLast, true);
      assert.equal(layout.independent, true);
      assert.equal(layout.pageScrolled, true);
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
