import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountReleaseNotice } from '../../src/ui/release-notice.js';

const publicUrl = 'https://example.org/chameleol/';
const assetVersion = '0.1.0-123456789a';
const newerVersion = '0.1.0-abcdef1234';
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = assetVersion => ({ ok: true, json: async () => ({ env: 'production', assetVersion }) });

function fixture(href = publicUrl, read) {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  Object.assign(globalThis, { document, Node: window.Node });
  document.visibilityState = 'visible';
  let time = 10_000;
  const page = new EventTarget();
  Object.assign(page, {
    document, location: { href }, setTimeout, clearTimeout,
    setInterval(fn) { page.tick = fn; return 1; },
    clearInterval() { page.tick = null; },
  });
  const host = document.querySelector('#host');
  const options = { page, read, now: () => time };
  const runtime = { publicUrl, assetVersion, env: 'production' };
  const mount = (override = {}) => mountReleaseNotice(host, { ...runtime, ...override }, options);
  return { document, window, page, host, mount, advance() { time += 60_000; } };
}

test('the canonical home checks a fresh manifest and offers an explicit switch without navigation', async () => {
  const calls = [];
  const f = fixture(publicUrl + '?from=share', async (url, options) => {
    calls.push({ url, options });
    return response(calls.length === 1 ? assetVersion : newerVersion);
  });
  const dispose = f.mount();
  try {
    await flush();
    const notice = f.host.querySelector('[data-testid="release-notice"]');
    assert.equal(notice.hidden, true);
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.redirect, 'error');
    f.advance();
    f.document.visibilityState = 'hidden';
    f.page.tick();
    assert.equal(calls.length, 1);
    f.document.visibilityState = 'visible';
    f.document.dispatchEvent(new f.window.Event('visibilitychange'));
    f.page.dispatchEvent(new Event('pageshow'));
    await flush();
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0].url, calls[1].url);
    assert.equal(new URL(calls[1].url).pathname, '/chameleol/release.json');
    assert.equal(notice.hidden, false);
    assert.equal(notice.querySelector('[role="status"]').hidden, false);
    assert.equal(notice.querySelector('a').getAttribute('href'), publicUrl + 'latest.html');
    assert.equal(f.page.location.href, publicUrl + '?from=share');
  } finally { dispose(); }
  f.advance();
  f.page.dispatchEvent(new Event('pageshow'));
  assert.equal(f.page.tick, null);
  assert.equal(calls.length, 2);
});

test('a pinned version offers the public entry when offline and never switches a saved game automatically', async () => {
  const pinned = publicUrl + 'v/' + assetVersion + '/';
  const f = fixture(pinned, async () => { throw Error('offline'); });
  const dispose = f.mount();
  try {
    await flush();
    const notice = f.host.querySelector('[data-testid="release-notice"]');
    assert.equal(notice.hidden, false);
    assert.equal(notice.querySelector('a').getAttribute('href'), publicUrl + 'latest.html');
    assert.equal(f.page.location.href, pinned);
  } finally { dispose(); }
});

test('local and cross-origin copies do not fetch, and leaving the home aborts checks in progress', async () => {
  let signal;
  let finish;
  const read = (_url, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  };
  const crossOrigin = fixture('https://unrelated.example/chameleol/', read);
  assert.equal(crossOrigin.mount(), undefined);
  assert.equal(signal, undefined);
  const f = fixture(publicUrl, read);
  assert.equal(f.mount({ env: 'verification' }), undefined);
  assert.equal(signal, undefined);
  const dispose = f.mount();
  dispose();
  assert.equal(signal.aborted, true);
  finish(response(newerVersion));
  await flush();
  assert.equal(f.host.querySelector('[data-testid="release-notice"]').hidden, true);
});
