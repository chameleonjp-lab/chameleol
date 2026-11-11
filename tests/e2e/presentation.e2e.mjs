import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { launch, openHome, startAnonymous } from './helpers.mjs';

test('effects80: accepted requirements and catalog contain exactly 80 unique IDs; excluded 20 stay absent', async () => {
  const requirements = JSON.parse(await readFile(new URL('../../docs/requirements/chameleol-effects80.json', import.meta.url), 'utf8'));
  const { ACCEPTED_EFFECT_IDS, EXCLUDED_EFFECT_IDS } = await import('../../src/presentation/catalog.js');
  const accepted = requirements.requirements.map((r) => r.id).sort((a, b) => a - b);
  const excluded = requirements.excluded.map((r) => r.id).sort((a, b) => a - b);
  assert.equal(accepted.length, 80);
  assert.equal(new Set(accepted).size, 80);
  assert.equal(excluded.length, 20);
  assert.equal(new Set(excluded).size, 20);
  assert.deepEqual([...ACCEPTED_EFFECT_IDS].sort((a, b) => a - b), accepted);
  assert.deepEqual([...EXCLUDED_EFFECT_IDS].sort((a, b) => a - b), excluded);
  assert.deepEqual([...accepted, ...excluded].sort((a, b) => a - b), Array.from({ length: 100 }, (_, i) => i + 1));
  const assignments = Object.values(requirements.tasks).flat();
  assert.equal(assignments.length, 80);
  assert.deepEqual(assignments.sort((a, b) => a - b), accepted);
});

test('effects80: verification forces each accepted effect and rejects every excluded effect', async (t) => {
  const requirements = JSON.parse(await readFile(new URL('../../docs/requirements/chameleol-effects80.json', import.meta.url), 'utf8'));
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    assert.equal(await env.page.evaluate(() => typeof __kamereoru.debugPresentation), 'function', 'verification API must be integrated');
    for (const requirement of requirements.requirements) {
      await t.test(`No.${requirement.id}: ${requirement.title}`, async () => {
        const result = await env.page.evaluate(async (effectId) => {
          const proof = await __kamereoru.debugPresentation({ effectId });
          return { activeIds: proof?.activeIds ?? [], effectId: proof?.effectId ?? null };
        }, requirement.id);
        assert.ok(result.activeIds.includes(requirement.id), `No.${requirement.id} must activate in the actual presentation module, not merely exist in the catalog`);
        if (process.env.EFFECTS80_SCREENSHOTS) {
          await mkdir(process.env.EFFECTS80_SCREENSHOTS, { recursive: true });
          if (![99, 100].includes(requirement.id)) await env.page.evaluate(() => __kamereoru.resultPresentation?.finishNow());
          await env.page.screenshot({ path: `${process.env.EFFECTS80_SCREENSHOTS}/effect-${String(requirement.id).padStart(3, '0')}.png`, fullPage: true, animations: 'disabled' });
        }
      });
    }
    for (const { id: effectId } of requirements.excluded) {
      const rejected = await env.page.evaluate(async (effectId) => {
        try { await __kamereoru.debugPresentation({ effectId }); return false; }
        catch { return true; }
      }, effectId);
      assert.equal(rejected, true, `excluded No.${effectId}`);
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('effects80: cosmetics preserve course, summary, history and result submission body', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const runs = [];
    for (const effects of [false, true]) {
      runs.push(await env.page.evaluate(async (effects) => {
        const app = __kamereoru;
        await app.debugStart({ atMs: 0, seed: 1, effects });
        const session = app.session;
        const course = structuredClone(session.game.course);
        for (let i = 0; i < session.rules.buildingCount; i++) {
          const target = session.game.course.targets[i];
          session.apply({ type: 'color', t: i * session.rules.buildingMs, h: target.h, s: target.s, v: i + 1 >= session.rules.brightnessUnlockBuilding ? target.v : session.rules.valMax });
          session.apply({ type: 'tick', t: (i + 1) * session.rules.buildingMs });
        }
        const snapshot = session.snapshot();
        // Run identities differ by design. Normalize only these two identities;
        // all rule, seed, history, summary and protocol fields remain untouched.
        snapshot.meta = { ...snapshot.meta, playId: 'same-play', launchId: 'same-launch' };
        const { buildResultBody } = await import('/src/net/outbox.js');
        const summary = session.summary();
        return { course, summary, history: snapshot.history, body: buildResultBody(snapshot, summary, { endedAt: 1000 }) };
      }, effects));
    }
    assert.deepEqual(runs[1], runs[0]);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

for (const [width, height] of [[402, 700], [402, 874], [874, 402]]) {
  test(`effects80: milestone controls and result at ${width}x${height}`, async () => {
    const env = await launch({ width, height });
    const { page } = env;
    const capture = async (name, fullPage = false) => {
      if (!process.env.EFFECTS80_SCREENSHOTS) return;
      await mkdir(process.env.EFFECTS80_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.EFFECTS80_SCREENSHOTS}/${width}x${height}-${name}.png`, fullPage });
    };
    try {
      await openHome(page, env.url);
      await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
      for (const [name, atMs, unlocked] of [['before-unlock', 93800, false], ['after-unlock', 94600, true], ['last-five', 225000, true], ['final-building', 245000, true]]) {
        await page.evaluate((atMs) => __kamereoru.debugStart({ atMs, seed: 1 }), atMs);
        await page.locator(id('pause-resume')).dispatchEvent('click');
        await page.clock.runFor(3100);
        assert.equal(await page.evaluate(() => __kamereoru.session.running), true);
        assert.equal(await page.evaluate(() => __kamereoru.session.state.brightnessUnlocked), unlocked);
        for (const target of ['.palette', '.bar', id('pause')]) {
          const rect = await page.locator(target).boundingBox();
          assert.ok(rect && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${target} fits ${width}x${height}: ${JSON.stringify(rect)}`);
        }
        await capture(name);
      }
      await page.evaluate(() => __kamereoru.debugPresentation({ effectId: 78 }));
      await page.clock.runFor(700);
      await page.waitForSelector('.result-presentation');
      assert.equal(await page.locator('.result-map-cell').count(), 50);
      await capture('result', true);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('effects80: ten replay replacements release old scopes and keep presentation pools bounded', async (t) => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const counts = [];
    for (let round = 0; round < 10; round++) {
      const record = await env.page.evaluate(async () => {
        const app = __kamereoru;
        const old = app.session ? { session: app.session, scope: app.presentationScope } : null;
        let staleCalls = 0;
        old?.scope.schedule('replay-test-stale', 1000000, () => staleCalls++);
        await app.debugStart({ atMs: 30000, seed: 1 });
        old?.scope.tick(1000001);
        return { staleListeners: old?.session.listeners.size ?? 0, staleCalls, renderer: app.stage.stats(), pools: app.stage.presentationStats() };
      });
      assert.equal(record.staleListeners, 0);
      assert.equal(record.staleCalls, 0);
      assert.ok((record.pools.staticDecorations ?? 0) <= 24);
      assert.ok((record.pools.ambientParticles ?? 0) <= 8);
      assert.ok((record.pools.backgroundGroups ?? 0) <= 1);
      assert.ok((record.pools.backgroundBirds ?? 0) <= 3);
      assert.ok((record.pools.successRings ?? 0) <= 1);
      counts.push(record.renderer.objects);
    }
    assert.equal(new Set(counts.slice(1)).size, 1, `post-warmup scene objects stay bounded: ${counts}`);
    t.diagnostic(`scene objects over ten replacements: ${counts.join(', ')}`);
    await env.page.evaluate(() => __kamereoru.leaveGame());
    assert.equal(await env.page.locator('canvas.stage-canvas').count(), 0);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('effects80: renderer additions remain within draw, geometry and texture budgets', async (t) => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const measurements = [];
    for (const effects of [false, true]) {
      measurements.push(await env.page.evaluate(async (effects) => {
        const a = __kamereoru;
        await a.debugStart({ atMs: 30000, seed: 1, effects });
        const { readPlayView } = await import('/src/presentation/events.js');
        const view = readPlayView(a.session, 1, { lastEvalSuccess: true });
        a.stage.update({ t: view.t, color: view.color, policeStage: 1, walking: true, presentation: { ...view, running: true } });
        return a.stage.stats();
      }, effects));
    }
    for (const [field, limit] of [['calls', 12], ['geometries', 16], ['textures', 4]]) {
      const added = measurements[1][field] - measurements[0][field];
      assert.ok(added <= limit, `${field}: ${added} added, limit ${limit} (${JSON.stringify(measurements)})`);
    }
    t.diagnostic(`renderer baseline/effects: ${JSON.stringify(measurements)}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('effects80: peak shop, actor props, ring, particles and cameo stay within renderer budgets', async (t) => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const evidence = [];
    for (const atMs of [95000, 100000]) {
      const pair = [];
      for (const effects of [false, true]) {
        pair.push(await env.page.evaluate(async ({ atMs, effects }) => {
          const a = __kamereoru;
          await a.debugStart({ atMs, seed: 1, effects });
          const { readPlayView } = await import('/src/presentation/events.js');
          const v = { ...readPlayView(a.session, 2, { lastEvalSuccess: true }), running: true, phase: 'eval', matchState: 'success' };
          const update = (t) => a.stage.update({ t, color: v.color, policeStage: 2, walking: true, presentation: { ...v, t } });
          update(atMs); update(atMs + 350);
          const samples = [{ effectId: null, renderer: a.stage.stats(), pools: a.stage.presentationStats() }];
          if (effects) {
            // Exercise every allocated actor prop shape before measuring maxima.
            for (const effectId of [32, 33, 37, 40, 26, 4, 41, 19, 14]) {
              a.stage.forcePresentationEffect(effectId);
              samples.push({ effectId, renderer: a.stage.stats(), pools: a.stage.presentationStats() });
            }
          }
          return samples;
        }, { atMs, effects }));
      }
      const baseline = pair[0][0].renderer;
      for (const sample of pair[1]) {
        for (const [field, limit] of [['calls', 12], ['geometries', 16], ['textures', 4]]) assert.ok(sample.renderer[field] - baseline[field] <= limit, `${atMs}, No.${sample.effectId}, ${field}: ${JSON.stringify({ baseline, sample })}`);
        assert.ok((sample.pools.staticDecorations ?? 0) <= 24);
        assert.ok((sample.pools.ambientParticles ?? 0) <= 8);
        assert.ok((sample.pools.backgroundGroups ?? 0) <= 1);
        assert.ok((sample.pools.backgroundBirds ?? 0) <= 3);
      }
      assert.ok(pair[1].some((x) => x.pools.shopInteriors > 0), 'shop interior batch rendered');
      assert.ok(pair[1].some((x) => x.pools.backgroundBirds === 3), 'three-bird cameo rendered');
      evidence.push({ atMs, baseline, samples: pair[1] });
    }
    t.diagnostic(`peak fixture measurements: ${JSON.stringify(evidence)}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('effects80: delivered image bytes and decoded screen images meet asset budgets', async (t) => {
  const files = ['atlas', 'result-atlas', 'detected'];
  const buffers = await Promise.all(files.map((name) => readFile(new URL(`../../src/presentation/assets/${name}.webp`, import.meta.url))));
  const compressedBytes = buffers.reduce((sum, bytes) => sum + bytes.length, 0);
  assert.ok(compressedBytes <= 1.5 * 1024 * 1024, `compressed image bytes ${compressedBytes}`);
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    const dimensions = await env.page.evaluate(async (files) => Promise.all(files.map(async (name) => {
      const image = new Image(); image.src = `/src/presentation/assets/${name}.webp`;
      await image.decode();
      return { name, width: image.naturalWidth, height: image.naturalHeight, decodedBytes: image.naturalWidth * image.naturalHeight * 4 };
    })), files);
    // Street and result screens use separate atlases after disposing the stage.
    for (const image of dimensions) assert.ok(image.decodedBytes <= 16 * 1024 * 1024, `${image.name}: ${image.decodedBytes} decoded RGBA bytes`);
    assert.ok(dimensions.find((x) => x.name === 'atlas').decodedBytes + dimensions.find((x) => x.name === 'detected').decodedBytes <= 16 * 1024 * 1024, 'street and detected portrait coexist within the ending screen budget');
    t.diagnostic(`compressed bytes ${compressedBytes}; decoded screen images ${JSON.stringify(dimensions)}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('effects80: result settles by 600 active milliseconds, tap skips it, and reduced motion settles immediately', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await page.evaluate(() => __kamereoru.debugPresentation({ effectId: 78 }));
    const timed = await page.evaluate(() => {
      const p = __kamereoru.resultPresentation;
      p.tick(599); const before = p.stats();
      p.tick(600); const after = p.stats();
      return { before, after, expected: __kamereoru.lastResult.summary.score.total, animations: [...document.querySelectorAll('.result-title, .result-stats, .result-report, .result-new-best, .result-component')].map((el) => getComputedStyle(el).animationName) };
    });
    assert.equal(timed.before.finished, false);
    assert.equal(timed.after.finished, true);
    assert.equal(timed.after.score, timed.expected);
    assert.ok(timed.animations.every((name) => name === 'none'), `settled animations: ${timed.animations.filter((name) => name !== 'none')}`);
    await page.evaluate(() => __kamereoru.debugPresentation({ effectId: 78 }));
    await page.locator('.result-presentation').dispatchEvent('pointerdown');
    assert.equal(await page.evaluate(() => __kamereoru.resultPresentation.stats().finished), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => __kamereoru.debugPresentation({ effectId: 78 }));
    const reduced = await page.evaluate(() => ({ stats: __kamereoru.resultPresentation.stats(), expected: __kamereoru.lastResult.summary.score.total }));
    assert.equal(reduced.stats.finished, true);
    assert.equal(reduced.stats.score, reduced.expected);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('effects80: changing result language restarts rank lookup and ignores the old screen response', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(async () => {
      const a = __kamereoru;
      await a.debugPresentation({ effectId: 78 });
      a.lastResult.ranked = true; a.lastResult.name = 'RankFixture'; a.lastResult.netState = 'official';
      const summary = a.lastResult.summary;
      const record = { status: 'official', official: { buildings: summary.buildings, rankAverage: summary.rankAverage } };
      const get = a.store.getOne.bind(a.store);
      a.store.getOne = (store, ...args) => store === 'records' ? Promise.resolve(record) : get(store, ...args);
      a.api.configured = true;
      globalThis.__rankLanguage = { requests: [], resolves: [] };
      a.api.post = (path) => {
        if (path !== 'rank') return Promise.resolve({ ok: true });
        __rankLanguage.requests.push(path);
        return new Promise((resolve) => __rankLanguage.resolves.push(resolve));
      };
      __rankLanguage.old = a.pollResult();
    });
    await page.waitForFunction(() => __rankLanguage.requests.length === 1);
    await page.evaluate(() => __kamereoru.changeLanguage('en'));
    await page.waitForFunction(() => __rankLanguage.requests.length === 2);
    await page.evaluate(async () => {
      __rankLanguage.resolves[0]({ ok: true, rank: 99, buildings: 50, average: 10000 });
      await __rankLanguage.old;
    });
    assert.notEqual(await page.evaluate(() => __kamereoru.lastResult.rankedBest?.rank), 99);
    await page.evaluate(async () => {
      const pending = __kamereoru.resultPoll.completion;
      __rankLanguage.resolves[1]({ ok: true, rank: 3, buildings: 50, average: 10000 });
      await pending;
    });
    assert.equal(await page.evaluate(() => __kamereoru.lastResult.rankedBest.rank), 3);
    assert.match(await page.locator('.result-rank').textContent(), /3/);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

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
