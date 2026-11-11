import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome, startAnonymous } from './helpers.mjs';

const id = (name) => `[data-testid="${name}"]`;
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
// Retain the button reference: both events belong to one physical burst even if
// the first handler replaces the current screen synchronously.
const burst = (page, name) => page.evaluate((selector) => {
  const button = document.querySelector(selector);
  button.click(); button.click();
}, id(name));

async function instrument(page, gate = null) {
  await page.evaluate((gate) => {
    const a = globalThis.__kamereoru;
    const p = globalThis.__presentationProbe = { begins: 0, prepares: 0, sounds: [], updates: [] };
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    p.release = release;
    const begin = a.store.beginRun.bind(a.store);
    a.store.beginRun = async (...args) => {
      p.begins++;
      if (gate === 'beginRun') await blocked;
      return begin(...args);
    };
    const prepare = a.audio.prepare.bind(a.audio);
    a.audio.prepare = async (...args) => {
      p.prepares++;
      if (gate === 'prepare') await blocked;
      return prepare(...args);
    };
    const play = a.audio.play.bind(a.audio);
    a.audio.play = (name, ...args) => { p.sounds.push(name); return play(name, ...args); };
  }, gate);
}

for (const gate of ['prepare', 'beginRun']) {
  test(`restart_double_click: delayed ${gate}`, async () => {
    const env = await launch();
    try {
      await openHome(env.page, env.url);
      await instrument(env.page, gate);
      await burst(env.page, 'home-start');
      await env.page.waitForFunction((g) => globalThis.__presentationProbe[g === 'prepare' ? 'prepares' : 'begins'] > 0, gate);
      // Drain microtasks through a browser round trip while the explicit gate stays closed.
      await env.page.evaluate(() => Promise.resolve());
      const pending = await env.page.evaluate(() => ({ begins: __presentationProbe.begins, prepares: __presentationProbe.prepares }));
      assert.equal(pending[gate === 'prepare' ? 'prepares' : 'begins'], 1);
      await env.page.evaluate(() => __presentationProbe.release());
      await env.page.waitForSelector(id('stage'));
      assert.equal(await env.page.evaluate(() => __presentationProbe.begins), 1);
      assert.equal(await env.page.evaluate(() => __kamereoru.store.getAll('launches').then((x) => x.length)), 1);
    } finally { await env.close(); }
  });
}

function response(data) {
  return { ok: true, requestId: data.requestId, name: data.name, playId: '00000000-0000-4000-8000-000000000001', seed: 1, rulesVersion: 'kamereoru-rules-v1', generatorVersion: 'kamereoru-course-v1' };
}
async function rankedFixture(env, handler) {
  await env.context.addInitScript(() => localStorage.setItem('kamereoru.apiBase', '/test-api'));
  await env.context.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1);
    if (path === 'start') return handler(route, route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await openHome(env.page, env.url);
  await env.page.fill('#name-input', 'Lifecycle');
  await instrument(env.page);
}

test('ranked_start_delayed_double_click', async () => {
  const env = await launch();
  const arrived = deferred(), release = deferred();
  const requests = [];
  try {
    await rankedFixture(env, async (route, data) => {
      requests.push(data); arrived.resolve(); await release.promise;
      await route.fulfill({ json: response(data) });
    });
    await burst(env.page, 'home-start');
    await arrived.promise;
    await env.page.evaluate(() => Promise.resolve());
    assert.equal(requests.length, 1);
    release.resolve();
    await env.page.waitForSelector(id('stage'));
    assert.equal(await env.page.evaluate(() => __presentationProbe.begins), 1);
    assert.equal(requests.length, 1);
  } finally { release.resolve(); await env.close(); }
});

for (const choice of ['start.playUnranked', 'common.cancel']) {
  test(`start_retry_cancel_switch: ${choice}`, async () => {
    const env = await launch();
    const arrived = deferred(), release = deferred();
    const requests = [];
    try {
      await rankedFixture(env, async (route, data) => {
        requests.push(data);
        if (requests.length === 1) return route.fulfill({ status: 400, json: { ok: false, code: 'rejected' } });
        arrived.resolve(); await release.promise;
        await route.fulfill({ json: response(data) });
      });
      await env.page.click(id('home-start'));
      await env.page.click(id('common.retry'));
      await arrived.promise;
      assert.equal(requests.length, 2);
      assert.equal(requests[1].requestId, requests[0].requestId);
      assert.equal(requests[1].launchId, requests[0].launchId);
      await env.page.click(id(choice));
      if (choice === 'start.playUnranked') await env.page.waitForSelector(id('stage'));
      else await env.page.waitForSelector(id('home-start'));
      release.resolve();
      // Stored late response is the deterministic acknowledgement that the old
      // request has finished its stale-response handling.
      await env.page.waitForFunction(async (requestId) => {
        const r = await __kamereoru.store.getOne('starts', requestId);
        return r?.response != null && r.status === 'abandoned';
      }, requests[0].requestId);
      assert.equal(await env.page.evaluate(() => __presentationProbe.begins), choice === 'common.cancel' ? 0 : 1);
      if (choice === 'common.cancel') {
        await env.page.fill('#name-input', '');
        await env.page.click(id('home-start'));
        await env.page.waitForSelector(id('stage'));
        assert.equal(await env.page.evaluate(() => __presentationProbe.begins), 1);
      }
      const launches = await env.page.evaluate(() => __kamereoru.store.getAll('launches'));
      assert.equal(launches.length, 1);
      if (choice !== 'common.cancel') assert.equal(launches[0].launchId, requests[0].launchId);
    } finally { release.resolve(); await env.close(); }
  });
}

test('pause_hidden_resume', async () => {
  const env = await launch();
  try {
    await env.page.clock.install();
    await openHome(env.page, env.url);
    await startAnonymous(env.page);
    await env.page.click(id('pause'));
    await env.page.evaluate(() => {
      const a = __kamereoru, update = a.stage.update.bind(a.stage);
      globalThis.__stageTimes = [];
      a.stage.update = (view) => { __stageTimes.push({ t: view.t, presentation: view.presentation?.t }); return update(view); };
    });
    const paused = await env.page.evaluate(() => __kamereoru.session.state.t);
    await env.page.clock.fastForward(5000);
    assert.equal(await env.page.evaluate(() => __kamereoru.session.state.t), paused);
    await env.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await env.page.clock.fastForward(5000);
    assert.equal(await env.page.evaluate(() => __kamereoru.session.state.t), paused);
    await env.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await env.page.locator(id('pause-resume')).dispatchEvent('click');
    await env.page.waitForSelector(id('countdown'));
    await env.page.clock.fastForward(3200);
    await env.page.waitForFunction(() => __kamereoru.session.running);
    const stageTimes = await env.page.evaluate(() => __stageTimes);
    assert.ok(stageTimes.length > 0, 'real stage updates observed');
    assert.ok(stageTimes.every((view) => view.t - paused < 500), 'stage clock excludes the hidden interval');
    const resumed = await env.page.evaluate(() => __kamereoru.session.state.t);
    assert.ok(resumed - paused < 500, `${resumed} vs ${paused}: hidden time must not be consumed`);
  } finally { await env.close(); }
});

test('leave_before_best_sound', async () => {
  const env = await launch();
  try {
    await env.page.clock.install();
    await openHome(env.page, env.url);
    await startAnonymous(env.page);
    await instrument(env.page);
    // Match the first building through the real palette, then deliberately
    // miss the next one. This produces a first best through normal detection.
    const palettePoint = await env.page.evaluate(() => {
      const a = __kamereoru, target = a.session.game.course.targets[0];
      const p = a.controls.router.geometry.palette;
      const angle = target.h / 36000 * Math.PI * 2;
      return { x: p.cx + Math.sin(angle) * p.r * target.s / 10000,
        y: p.cy - Math.cos(angle) * p.r * target.s / 10000 };
    });
    await env.page.mouse.click(palettePoint.x, palettePoint.y);
    await env.page.clock.runFor(5000);
    assert.ok(await env.page.evaluate(() => __kamereoru.session.state.passed >= 1));
    const mismatch = await env.page.evaluate(() => {
      const a = __kamereoru, i = Math.floor(a.session.state.t / 5000);
      const target = a.session.game.course.targets[i];
      const p = a.controls.router.geometry.palette;
      const angle = (target.h + 18000) / 36000 * Math.PI * 2;
      return { x: p.cx + Math.sin(angle) * p.r * 0.95, y: p.cy - Math.cos(angle) * p.r * 0.95 };
    });
    await env.page.mouse.click(mismatch.x, mismatch.y);
    for (let i = 0; i < 40 && !(await env.page.locator(id('skip-ending')).count()); i++) {
      await env.page.clock.runFor(1000);
    }
    await env.page.waitForSelector(id('skip-ending'));
    await env.page.locator(id('skip-ending')).dispatchEvent('click');
    await env.page.waitForSelector(id('result-home'));
    assert.equal(await env.page.evaluate(() => __kamereoru.lastResult.newBest), true);
    await env.page.locator(id('result-home')).dispatchEvent('click');
    await env.page.clock.runFor(1000);
    assert.equal(await env.page.evaluate(() => __presentationProbe.sounds.filter((s) => s === 'best').length), 0);
  } finally { await env.close(); }
});

test('scoped_toast_uses_active_time_and_disposal', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const state = await env.page.evaluate(async () => {
      const { createPresentationScope } = await import('/src/presentation/scope.js');
      const { toast } = await import('/src/ui/screens.js');
      const host = document.createElement('div');
      const scope = createPresentationScope({ id: 'toast-test', kind: 'game' });
      toast(host, 'notice', { duration: 100, scope });
      scope.tick(100);
      const exiting = !!host.querySelector('.toast-out');
      scope.tick(500);
      const removed = host.childElementCount === 0;
      toast(host, 'disposed notice', { duration: 100, scope });
      let mutations = 0;
      const observer = new MutationObserver((records) => { mutations += records.length; });
      observer.observe(host, { subtree: true, attributes: true, childList: true });
      scope.dispose();
      await Promise.resolve();
      const cleaned = host.childElementCount === 0;
      mutations = 0;
      scope.tick(10000);
      await Promise.resolve();
      observer.disconnect();
      return { exiting, removed, cleaned, mutations };
    });
    assert.deepEqual(state, { exiting: true, removed: true, cleaned: true, mutations: 0 });
  } finally { await env.close(); }
});

test('start_save_failure_keeps_attempt_until_launch_handoff', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    await instrument(env.page);
    await env.page.evaluate(() => {
      const a = __kamereoru, put = a.store.put.bind(a.store);
      const probe = __presentationProbe;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      probe.releaseLaunch = release;
      a.store.beginRun = async () => { probe.begins++; throw new Error('simulated storage failure'); };
      a.store.put = async (store, ...args) => {
        if (store === 'launches') { probe.launchPending = true; await gate; }
        return put(store, ...args);
      };
    });
    await env.page.click(id('home-start'));
    await env.page.waitForFunction(() => __presentationProbe.launchPending);
    await env.page.evaluate(() => {
      __presentationProbe.attempt = __kamereoru.startAttempt;
      __presentationProbe.completion = __kamereoru.startAttempt?.completion;
    });
    await burst(env.page, 'home-start');
    const retained = await env.page.evaluate(() => ({
      begins: __presentationProbe.begins,
      same: __presentationProbe.attempt === __kamereoru.startAttempt,
      completion: __presentationProbe.completion === __kamereoru.startAttempt?.completion,
    }));
    assert.deepEqual(retained, { begins: 1, same: true, completion: true });
    await env.page.evaluate(() => __presentationProbe.releaseLaunch());
    await env.page.waitForSelector(id('stage'));
    assert.equal(await env.page.evaluate(() => __kamereoru.memoryOnly), true);
    assert.equal(await env.page.evaluate(() => __presentationProbe.begins), 1);
    assert.equal(await env.page.evaluate(() => __kamereoru.store.getAll('launches').then((rows) => rows.length)), 1);
  } finally { await env.close(); }
});

test('saved_run_continue_keeps_attempt_while_claim_pending', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    await env.page.click(id('home-start'));
    await env.page.waitForSelector(id('stage'));
    const second = await env.context.newPage();
    await openHome(second, env.url);
    await second.evaluate(() => {
      const a = __kamereoru, claim = a.store.claimRun.bind(a.store);
      let release;
      const blocked = new Promise((resolve) => { release = resolve; });
      globalThis.__claimProbe = { calls: 0, release };
      a.store.claimRun = async (...args) => { __claimProbe.calls++; await blocked; return claim(...args); };
    });
    await second.click(id('home-start'));
    await second.waitForSelector(id('start.savedRun.continue'));
    await second.evaluate(() => {
      __claimProbe.attempt = __kamereoru.startAttempt;
      __claimProbe.completion = __kamereoru.startAttempt?.completion;
    });
    await second.click(id('start.savedRun.continue'));
    await second.waitForFunction(() => __claimProbe.calls === 1);
    await burst(second, 'home-start');
    const state = await second.evaluate(() => ({
      same: __claimProbe.attempt === __kamereoru.startAttempt,
      completion: __claimProbe.completion === __kamereoru.startAttempt?.completion,
      calls: __claimProbe.calls,
    }));
    assert.deepEqual(state, { same: true, completion: true, calls: 1 });
    await second.evaluate(() => __claimProbe.release());
    await second.waitForSelector(id('stage'));
    assert.equal(await second.evaluate(() => __claimProbe.calls), 1);
  } finally { await env.close(); }
});

test('late_storage_probe_failure_does_not_cover_settings', async () => {
  const env = await launch();
  try {
    await rankedFixture(env, async (route, data) => route.fulfill({ json: response(data) }));
    await env.page.evaluate(() => {
      let reject;
      const blocked = new Promise((_, fail) => { reject = fail; });
      globalThis.__storageProbe = { reject, pending: false };
      __kamereoru.store.probeWrite = async () => {
        __storageProbe.pending = true;
        try { await blocked; } finally { __storageProbe.finished = true; }
      };
    });
    await env.page.click(id('home-start'));
    await env.page.waitForFunction(() => __storageProbe.pending);
    await env.page.click(id('home-settings'));
    await env.page.evaluate(async () => { __storageProbe.reject(new Error('late quota failure')); await Promise.resolve(); await Promise.resolve(); });
    await env.page.waitForFunction(() => __storageProbe.finished);
    assert.equal(await env.page.locator(id('storage.short.resend')).count(), 0);
    assert.equal(await env.page.evaluate(() => __kamereoru.startAttempt), null);
  } finally { await env.close(); }
});

test('leave_game_unsubscribes_and_discards_scheduled_callbacks', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    await startAnonymous(env.page);
    await env.page.evaluate(() => {
      globalThis.__oldView = { session: __kamereoru.session, scope: __kamereoru.presentationScope, calls: 0 };
      __oldView.scope.schedule('test-dispose', 1000000, () => { __oldView.calls++; });
    });
    await env.page.click(id('pause'));
    await env.page.click(id('pause-home'));
    await env.page.click(id('quit-confirm'));
    await env.page.waitForSelector(id('home-start'));
    const state = await env.page.evaluate(() => {
      __oldView.scope.tick(1000001);
      return { listeners: __oldView.session.listeners.size, calls: __oldView.calls };
    });
    assert.deepEqual(state, { listeners: 0, calls: 0 });
  } finally { await env.close(); }
});

test('restart_double_click: result-again burst while audio prepare is pending', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    await startAnonymous(env.page);
    // Use the real session's terminal event and the real ending/result views.
    await env.page.evaluate(() => __kamereoru.session.quit());
    await env.page.waitForSelector(id('skip-ending'));
    await env.page.evaluate(() => document.querySelector('[data-testid=skip-ending]')?.click());
    await env.page.waitForSelector(id('result-again'));
    await instrument(env.page, 'prepare');
    await burst(env.page, 'result-again');
    await env.page.waitForFunction(() => __presentationProbe.prepares > 0);
    assert.equal(await env.page.evaluate(() => __presentationProbe.prepares), 1);
    await env.page.evaluate(() => __presentationProbe.release());
    await env.page.waitForSelector(id('stage'));
    assert.equal(await env.page.evaluate(() => __presentationProbe.begins), 1);
    assert.equal(await env.page.evaluate(() => __kamereoru.store.getAll('launches').then((rows) => rows.length)), 2);
  } finally { await env.close(); }
});
