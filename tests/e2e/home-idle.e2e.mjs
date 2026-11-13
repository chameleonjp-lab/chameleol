import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { setTimeout as pollDelay } from 'node:timers/promises';
import { launch, openHome } from './helpers.mjs';

const evidenceDir = process.env.HOME_IDLE_SCREENSHOTS || 'test-results/home-idle';
const id = (name) => `[data-testid="${name}"]`;
// Playwright's page-side polling also follows the installed clock. Poll from
// Node so a late module/media event can resolve while presentation time stops.
async function waitUntil(page, predicate) {
  const deadline = Date.now() + 10000;
  while (!(await page.evaluate(predicate))) {
    assert.ok(Date.now() < deadline, `browser condition timed out: ${predicate}`);
    await pollDelay(25);
  }
}

// Install before app/module evaluation. Ten millisecond RAFs make the 250/500ms
// color and 150/300/380/750/900ms phase boundaries exactly reproducible.
async function timedHome(options = {}) {
  const env = await launch(options);
  await env.page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  await env.page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
  await env.page.addInitScript(() => {
    globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 10);
    globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
    Math.random = () => 0.5;
  });
  try {
    await openHome(env.page, env.url);
    await waitUntil(env.page, () => !!globalThis.__kamereoru?.showcase);
    assert.equal(await env.page.evaluate(() => typeof __kamereoru.showcase.stats), 'function', 'home exposes read-only rendering statistics');
    return env;
  } catch (error) { await env.close(); throw error; }
}

test('HOME: palette starts at green with one render reservation', async () => {
  const env = await timedHome();
  try {
    const stats = await env.page.evaluate(() => __kamereoru.showcase.stats());
    assert.deepEqual(stats.colorRgb, [0x58 / 255, 0xc4 / 255, 0x3c / 255]);
    assert.equal(stats.pendingFrames, 1);
  } finally { await env.close(); }
});

// Read the actual composited PNG, rather than treating material values as pixels.
function pngPixels(png) {
  let width, height, channels, packed;
  const parts = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8); assert.ok([2, 6].includes(data[9]));
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === 'IDAT') parts.push(data);
    offset += length + 12;
  }
  packed = inflateSync(Buffer.concat(parts));
  const stride = width * channels, pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= channels ? pixels[at - channels] : 0;
      const up = y ? pixels[at - stride] : 0, corner = y && x >= channels ? pixels[at - stride - channels] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter];
      assert.notEqual(predictor, undefined, `PNG filter ${filter}`);
      pixels[at] = (packed[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function countPixels(image, rgb, tolerance = 1) {
  let count = 0, minX = image.width, minY = image.height, maxX = -1, maxY = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const offset = (y * image.width + x) * image.channels;
    if (rgb.every((v, c) => Math.abs(image.pixels[offset + c] - v) <= tolerance)) {
      count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { count, minX, minY, maxX, maxY };
}

const stats = (page) => page.evaluate(() => __kamereoru.showcase.stats());
const click = (page, name) => page.locator(id(name)).dispatchEvent('click');
async function homeReady(page) {
  await waitUntil(page, () => !!globalThis.__kamereoru?.showcase?.stats);
  assert.equal(await page.locator('canvas.showcase-canvas').count(), 1);
}
async function capture(page, name) {
  await mkdir(evidenceDir, { recursive: true });
  const png = await page.locator('canvas.showcase-canvas').screenshot({ path: `${evidenceDir}/${name}.png`, animations: 'disabled' });
  return pngPixels(png);
}
async function firstTongue(page) {
  // Midpoint randomness schedules at 2500ms; approach it without rendering
  // hundreds of irrelevant intermediate frames under software WebGL.
  await page.clock.fastForward(2400);
  let elapsed = 2400;
  assert.equal((await stats(page)).tonguePhase, 'idle');
  while ((await stats(page)).tonguePhase === 'idle' && elapsed < 3010) {
    await page.clock.runFor(10); elapsed += 10;
  }
  assert.ok(elapsed >= 2000 && elapsed < 3000, `first tongue begins at ${elapsed}ms`);
  return elapsed;
}
async function modelState(page) {
  return page.evaluate(() => {
    const hero = __kamereoru.showcase.hero, tongue = hero.head.getObjectByName('showcase-tongue');
    const positions = tongue.geometry.getAttribute('position');
    const centerline = [];
    for (let ring = 0; ring <= 32; ring++) {
      const center = [0, 0, 0];
      for (let side = 0; side < 6; side++) for (let axis = 0; axis < 3; axis++) center[axis] += positions.array[(ring * 7 + side) * 3 + axis] / 6;
      centerline.push(center);
    }
    return {
      visible: tongue.visible, vertices: positions.count, centerline,
      sharedGeometry: tongue.children[0]?.geometry === tongue.geometry,
      pink: tongue.material.color.toArray(), straightHidden: !hero.tongue.visible,
      jaw: hero.actorParts.jaw.position.toArray(), mouth: hero.actorParts.mouth.position.toArray(),
      material: hero.comparisonMaterials[0].uniforms.uColor.value.toArray(), yaw: hero.group.rotation.y,
    };
  });
}
function closeRgb(actual, expected, label) {
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value / 255) < 1e-8, `${label}: ${actual} expected ${expected}`));
}
async function setMotionPreference(page, reducedMotion) {
  await page.evaluate(() => {
    globalThis.__homeMediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
    globalThis.__homeMediaChanged = false;
    __homeMediaQuery.addEventListener('change', () => { __homeMediaChanged = true; }, { once: true });
  });
  await page.emulateMedia({ reducedMotion });
  await waitUntil(page, () => __homeMediaChanged);
}

for (const [width, height] of [[402, 700], [402, 874], [874, 402]]) {
  test(`HOME: material, rendered colors, curved tongue and eight-pixel clearance at ${width}x${height}`, async (t) => {
    const env = await timedHome({ width, height });
    const { page } = env;
    try {
      const resources = [];
      let elapsed = 0;
      for (const [at, rgb] of [[0, [88, 196, 60]], [250, [105, 196, 60]], [500, [122, 196, 60]], [12000, [88, 196, 60]]]) {
        if (at === 12000) await page.clock.fastForward(at - elapsed);
        else await page.clock.runFor(at - elapsed);
        elapsed = at;
        const state = await modelState(page), current = await stats(page);
        closeRgb(current.colorRgb, rgb, `stats at ${at}`); closeRgb(state.material, rgb, `body material at ${at}`);
        const image = await capture(page, `${width}x${height}-color-${at}`);
        assert.ok(countPixels(image, rgb).count > 100, `${at}ms actual body pixels match RGB ${rgb}`);
        resources.push([current.geometries, current.textures]);
      }
      await click(page, 'home-settings'); await page.locator('.btn-back').dispatchEvent('click'); await homeReady(page);
      const onset = await firstTongue(page);
      let phaseElapsed = 0;
      const images = [], shapes = [];
      for (const [phase, offset] of [['anticipate', 70], ['extend', 220], ['hold', 340], ['retract', 560], ['settle', 825], ['idle', 900]]) {
        // Our RAF cadence is 10ms. 825ms rounds up to the first real sample.
        const sampledOffset = Math.ceil(offset / 10) * 10;
        await page.clock.runFor(sampledOffset - phaseElapsed); phaseElapsed = sampledOffset;
        const current = await stats(page), state = await modelState(page);
        assert.equal(current.tonguePhase, phase);
        assert.equal(state.visible, phase !== 'idle');
        assert.equal(state.vertices, 231); assert.equal(state.sharedGeometry, true); assert.equal(state.straightHidden, true);
        state.centerline.forEach((point, ring) => {
          assert.ok(point.every(Number.isFinite), 'all tube ring centers remain finite');
          if (ring) assert.ok(Math.hypot(...point.map((value, axis) => value - state.centerline[ring - 1][axis])) < 0.11, `${phase}: straight section joins the curled tip without a gap`);
        });
        closeRgb(state.pink, [238, 138, 158], 'tongue stays pink');
        const image = await capture(page, `${width}x${height}-${phase}`);
        const outline = countPixels(image, [27, 27, 27], 2);
        assert.ok(outline.count > 100, 'actual outline is rendered');
        for (const margin of [outline.minX, outline.minY, image.width - 1 - outline.maxX, image.height - 1 - outline.maxY]) assert.ok(margin >= 8, `${phase} outline has ${margin}px clearance: ${JSON.stringify(outline)}`);
        const pinkPixels = countPixels(image, [238, 138, 158], 2).count;
        if (['extend', 'hold', 'retract'].includes(phase)) assert.ok(pinkPixels > 3, `${phase} pink tongue is visible (${pinkPixels} pixels)`);
        if (phase === 'idle') assert.equal(state.visible, false, 'tongue retracts into mouth');
        images.push({ phase, pinkPixels, outline }); shapes.push({ phase, centerline: state.centerline });
        resources.push([current.geometries, current.textures]);
      }
      const anticipated = shapes.find((s) => s.phase === 'anticipate').centerline;
      const full = shapes.find((s) => s.phase === 'hold').centerline;
      const extent = (points, axis) => Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
      assert.ok(extent(anticipated, 1) > 0.08, 'anticipation has a curled tip, not a straight capsule');
      assert.ok(extent(full, 0) > extent(anticipated, 0) + 0.4, 'held tongue extends from the same mouth anchor');
      const retracting = shapes.find((s) => s.phase === 'retract').centerline;
      assert.ok(extent(retracting.slice(10), 1) > 0.015, 'tip visibly curls again during retraction');
      assert.ok(Math.max(...resources.map(([geometry]) => geometry)) - Math.min(...resources.map(([geometry]) => geometry)) <= 1, `only one lazy tongue geometry is uploaded: ${JSON.stringify(resources)}`);
      assert.equal(new Set(resources.map(([, texture]) => texture)).size, 1, 'tongue creates no textures');
      assert.equal(new Set(resources.slice(4).map(JSON.stringify)).size, 1, 'resources stay stable after tongue initialization');
      for (const name of ['home-start', 'home-practice', 'home-settings', 'home-howto']) {
        const box = await page.locator(id(name)).boundingBox(), art = await page.locator('.home-art').boundingBox();
        assert.ok(box && box.y >= art.y + art.height, `${name} remains below the model frame`);
      }
      await page.screenshot({ path: `${evidenceDir}/after-${width}x${height}.png`, fullPage: true, animations: 'disabled' });
      t.diagnostic(JSON.stringify({ viewport: [width, height], onset, resources, rendered: images }));
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('HOME: changing motion preference, visibility, context and orientation preserves active time', async () => {
  const env = await timedHome();
  const { page } = env;
  try {
    const rest = await modelState(page);
    await firstTongue(page); await page.clock.runFor(340);
    assert.equal((await stats(page)).tonguePhase, 'hold');
    await setMotionPreference(page, 'reduce');
    await page.clock.runFor(10);
    const reduced = await modelState(page), colorBefore = (await stats(page)).colorRgb;
    assert.equal((await stats(page)).tonguePhase, 'idle'); assert.equal(reduced.visible, false);
    assert.deepEqual(reduced.jaw, rest.jaw); assert.deepEqual(reduced.mouth, rest.mouth);
    await page.clock.runFor(500);
    assert.equal((await modelState(page)).yaw, reduced.yaw, 'reduced motion freezes yaw');
    assert.notDeepEqual((await stats(page)).colorRgb, colorBefore, 'color continues during reduced motion');
    await setMotionPreference(page, 'no-preference');
    await page.clock.fastForward(5900);
    assert.equal((await stats(page)).tonguePhase, 'idle', 'reenabling motion starts a fresh six-to-ten-second wait');
    await page.clock.fastForward(2090);
    assert.equal((await stats(page)).tonguePhase, 'idle');
    await page.clock.runFor(10);
    assert.notEqual((await stats(page)).tonguePhase, 'idle', 'midpoint randomness resumes after a fresh 8000ms wait');
    for (const reason of ['hidden', 'context', 'zero-size']) {
      await page.evaluate((reason) => {
        const canvas = document.querySelector('canvas.showcase-canvas');
        if (reason === 'hidden') {
          Object.defineProperty(document, 'hidden', { value: true, configurable: true });
          Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
        } else if (reason === 'context') canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        else { canvas.parentElement.style.display = 'none'; __kamereoru.showcase.resize(); }
      }, reason);
      const stopped = await stats(page);
      assert.equal(stopped.active, false, `${reason} pauses rendering`); assert.equal(stopped.pendingFrames, 0);
      await page.clock.runFor(50000);
      assert.equal((await stats(page)).renderCount, stopped.renderCount, `${reason} makes no hidden renders`);
      assert.deepEqual((await stats(page)).colorRgb, stopped.colorRgb);
      await page.evaluate((reason) => {
        const canvas = document.querySelector('canvas.showcase-canvas');
        if (reason === 'hidden') {
          Object.defineProperty(document, 'hidden', { value: false, configurable: true });
          Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
        } else if (reason === 'context') canvas.dispatchEvent(new Event('webglcontextrestored'));
        else { canvas.parentElement.style.display = ''; __kamereoru.showcase.resize(); }
      }, reason);
      assert.deepEqual((await stats(page)).colorRgb, stopped.colorRgb, `${reason} resume adds no hidden time`);
      await page.clock.runFor(10);
      const current = await stats(page);
      assert.equal(current.active, true); assert.equal(current.pendingFrames, 1);
      assert.equal(current.tonguePhase, stopped.tonguePhase, `${reason} does not replay overdue tongue actions`);
      assert.ok(current.colorRgb.every((value, i) => Math.abs(value - stopped.colorRgb[i]) < 0.01), `${reason} resumes from stopped color`);
    }
    for (const [width, height] of [[874, 402], [402, 700], [402, 874]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => __kamereoru.showcase.resize()); await page.clock.runFor(20);
      const canvas = await page.locator('canvas.showcase-canvas').boundingBox();
      assert.ok(canvas.width > 0 && canvas.height > 0);
      assert.equal((await stats(page)).pendingFrames, 1);
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('HOME: twenty replacements across every tongue phase release old renders and keep resources bounded', async (t) => {
  const env = await timedHome();
  const { page } = env;
  const records = [];
  try {
    const phases = [['anticipate', 70], ['extend', 220], ['hold', 340], ['retract', 560], ['settle', 830]];
    const destinations = ['home-settings', 'home-howto', 'home-practice', 'home-start'];
    for (let round = 0; round < 20; round++) {
      const [phase, offset] = phases[round % phases.length];
      await firstTongue(page); await page.clock.runFor(offset);
      assert.equal((await stats(page)).tonguePhase, phase);
      const before = await page.evaluate(() => {
        globalThis.__oldHome = __kamereoru.showcase;
        return __oldHome.stats();
      });
      const destination = destinations[Math.floor(round / 5)];
      await click(page, destination);
      if (destination === 'home-settings') {
        await page.locator('#lang-select').selectOption(round % 2 ? 'ja' : 'en');
      } else if (destination === 'home-practice') await page.locator(id('practice-basic')).waitFor();
      else if (destination === 'home-start') {
        await page.locator(id('stage')).waitFor();
        await waitUntil(page, () => !!__kamereoru.stage);
        if (await page.locator(id('skip-opening')).count()) {
          await click(page, 'skip-opening');
          await waitUntil(page, () => !document.querySelector('[data-testid="skip-opening"]'));
        }
      }
      await page.clock.runFor(100);
      const disposed = await page.evaluate(() => __oldHome.stats());
      assert.equal(disposed.active, false); assert.equal(disposed.pendingFrames, 0);
      assert.equal(disposed.renderCount, before.renderCount, 'old showcase cannot render after navigation');
      assert.equal(await page.locator('canvas.showcase-canvas').count(), 0);
      if (destination === 'home-start') {
        await click(page, 'pause'); await click(page, 'pause-home'); await click(page, 'quit-confirm');
      } else await page.locator('.btn-back').dispatchEvent('click');
      await homeReady(page); await page.clock.runFor(10);
      const next = await stats(page);
      assert.equal(next.pendingFrames, 1);
      const state = await modelState(page);
      assert.equal(state.visible, false);
      records.push({ round, phase, destination, geometries: next.geometries, textures: next.textures, drawCalls: next.drawCalls, jaw: state.jaw, mouth: state.mouth });
    }
    assert.equal(new Set(records.map((record) => JSON.stringify([record.geometries, record.textures, record.drawCalls]))).size, 1, `resources do not grow over replacements: ${JSON.stringify(records)}`);
    assert.equal(new Set(records.map((record) => JSON.stringify([record.jaw, record.mouth]))).size, 1, 'mouth and jaw return to the same baseline after every replacement');
    t.diagnostic(JSON.stringify(records));
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('HOME: navigation while showcase import is delayed never resurrects a stale canvas', async () => {
  const env = await launch();
  const { page } = env;
  let release, requested;
  const gate = new Promise((resolve) => { release = resolve; });
  const requestSeen = new Promise((resolve) => { requested = resolve; });
  try {
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:00Z'));
    await page.route('**/src/scene/showcase.js', async (route) => { requested(); await gate; await route.continue(); });
    await openHome(page, env.url); await requestSeen;
    await click(page, 'home-settings'); release();
    await page.waitForResponse((response) => response.url().endsWith('/src/scene/showcase.js'));
    await page.clock.runFor(200);
    assert.equal(await page.locator('canvas.showcase-canvas').count(), 0);
    assert.equal(await page.evaluate(() => __kamereoru.showcase), null);
    await page.locator('.btn-back').dispatchEvent('click'); await homeReady(page);
    assert.equal((await stats(page)).pendingFrames, 1);
    assert.deepEqual(env.errors, []);
  } finally { release(); await env.close(); }
});

test('HOME: unavailable WebGL leaves start, practice and settings usable', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return /^webgl/.test(type) ? null : original.call(this, type, ...args);
      };
    });
    await openHome(page, env.url);
    assert.equal(await page.locator('canvas.showcase-canvas').count(), 0);
    await click(page, 'home-settings'); await page.locator('#lang-select').waitFor();
    await page.locator('.btn-back').dispatchEvent('click');
    await click(page, 'home-practice'); await page.locator(id('practice-basic')).waitFor();
    await page.locator('.btn-back').dispatchEvent('click');
    assert.equal(await page.locator(id('home-start')).isEnabled(), true);
    await click(page, 'home-start');
    await page.locator(id('stage')).waitFor();
    assert.equal(await page.evaluate(() => !!__kamereoru.session), true, 'start enters the existing game without WebGL');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('HOME: color cycling preserves fixed-input course, scoring, full history and result body', async () => {
  const env = await timedHome();
  const { page } = env;
  try {
    const runs = [];
    for (const idleMs of [0, 12000]) {
      if (idleMs) {
        await page.evaluate(() => __kamereoru.leaveGame()); await homeReady(page);
        const originalColor = (await stats(page)).colorRgb;
        await page.clock.runFor(500);
        assert.notDeepEqual((await stats(page)).colorRgb, originalColor, 'home has actually rendered changing colors before game isolation comparison');
        await page.clock.fastForward(idleMs - 500);
      }
      runs.push(await page.evaluate(async () => {
        const app = __kamereoru;
        await app.debugStart({ atMs: 0, seed: 1 });
        const session = app.session, course = structuredClone(session.game.course);
        for (let i = 0; i < session.rules.buildingCount; i++) {
          const target = session.game.course.targets[i];
          session.apply({ type: 'color', t: i * session.rules.buildingMs, h: target.h, s: target.s, v: i + 1 >= session.rules.brightnessUnlockBuilding ? target.v : session.rules.valMax });
          session.apply({ type: 'tick', t: (i + 1) * session.rules.buildingMs });
        }
        const snapshot = session.snapshot(), summary = session.summary();
        // Only per-play identities and execution timestamps are normalized.
        snapshot.meta = { ...snapshot.meta, playId: 'same-play', launchId: 'same-launch', startedAt: 1000 };
        const { buildResultBody } = await import('/src/net/outbox.js');
        return { course, summary, snapshot, body: buildResultBody(snapshot, summary, { endedAt: 251000 }) };
      }));
    }
    assert.deepEqual(runs[1], runs[0]);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
