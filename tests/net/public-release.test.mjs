import test from 'node:test';
import assert from 'node:assert/strict';
import { watchPublicRelease } from '../../src/net/public-release.js';

const publicUrl = 'https://example.org/chameleol/';
const assetVersion = '0.1.0-123456789a';
const newerVersion = '0.1.0-abcdef1234';
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = assetVersion => ({ ok: true, json: async () => ({ env: 'production', assetVersion }) });

function fixture(href = publicUrl, read) {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const redirects = [];
  let time = 10_000;
  const page = Object.assign(new EventTarget(), {
    document, location: { href, replace: url => redirects.push(url) }, setTimeout, clearTimeout,
    setInterval(fn) { page.tick = fn; return 1; },
    clearInterval() { page.tick = null; },
  });
  const options = { page, read, now: () => time };
  const runtime = { publicUrl, assetVersion, env: 'production' };
  const mount = (canSwitch = () => true, override = {}) => watchPublicRelease({ ...runtime, ...override }, canSwitch, options);
  return { document, page, redirects, mount, advance() { time += 60_000; } };
}

test('the canonical home silently switches when a fresh manifest identifies another release', async () => {
  const calls = [];
  const f = fixture(publicUrl + '?from=share', async (url, options) => {
    calls.push({ url, options });
    return response(calls.length === 1 ? assetVersion : newerVersion);
  });
  const dispose = f.mount();
  try {
    await flush();
    assert.deepEqual(f.redirects, []);
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.redirect, 'error');
    f.advance();
    f.document.visibilityState = 'hidden';
    f.page.tick();
    assert.equal(calls.length, 1);
    f.document.visibilityState = 'visible';
    f.document.dispatchEvent(new Event('visibilitychange'));
    f.page.dispatchEvent(new Event('pageshow'));
    await flush();
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0].url, calls[1].url);
    assert.equal(new URL(calls[1].url).pathname, '/chameleol/release.json');
    assert.deepEqual(f.redirects, [publicUrl + '?from=share&release-refresh=70000&release-target=' + newerVersion]);
  } finally { dispose(); }
  f.advance();
  f.page.dispatchEvent(new Event('pageshow'));
  assert.equal(f.page.tick, null);
  assert.equal(calls.length, 2);
});

test('a previous attempt, a saved-version route and a non-production origin do not reload', async () => {
  const f = fixture(publicUrl + '?release-target=' + newerVersion, async () => response(newerVersion));
  const dispose = f.mount();
  try {
    await flush();
    assert.deepEqual(f.redirects, []);
  } finally { dispose(); }
  let reads = 0;
  const read = async () => { reads++; return response(newerVersion); };
  assert.equal(fixture(publicUrl + 'v/' + assetVersion + '/', read).mount(), undefined);
  assert.equal(fixture('https://unrelated.example/chameleol/', read).mount(), undefined);
  assert.equal(fixture(publicUrl, read).mount(undefined, { env: 'verification' }), undefined);
  assert.equal(reads, 0);
});

test('busy home states and leaving home before a response both prevent navigation', async () => {
  let signal;
  let finish;
  const read = (_url, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  };
  const f = fixture(publicUrl, read);
  let safe = true;
  const dispose = f.mount(() => safe);
  try {
    safe = false;
    finish(response(newerVersion));
    await flush();
    assert.deepEqual(f.redirects, []);
    const first = signal;
    f.advance();
    f.page.tick();
    assert.equal(signal, first);
    safe = true;
    f.page.tick();
    assert.notEqual(signal, first);
    dispose();
    assert.equal(signal.aborted, true);
    finish(response(newerVersion));
    await flush();
    assert.deepEqual(f.redirects, []);
  } finally { dispose(); }
});
