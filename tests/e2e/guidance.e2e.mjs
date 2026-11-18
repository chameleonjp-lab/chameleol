import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch, openHome, startAnonymous } from './helpers.mjs';

const selector = (id) => `[data-testid="${id}"]`;

test('G4: guide ownership persists across three real plays through both moving guides and first unlock', { timeout: 90000 }, async () => {
  const env = await launch();
  const { page } = env;
  const start = async () => {
    await page.locator(selector('home-start')).dispatchEvent('click');
    await page.waitForSelector(selector('stage'));
    await page.waitForFunction(() => __kamereoru.guidance != null);
  };
  const quit = async () => {
    await page.locator(selector('pause')).dispatchEvent('click');
    await page.locator(selector('pause-home')).dispatchEvent('click');
    await page.locator(selector('quit-confirm')).dispatchEvent('click');
    await page.waitForSelector(selector('home-start'));
  };
  const advance = async (endT) => {
    await page.evaluate((endT) => {
      const s = __kamereoru.session, playId = s.meta.playId;
      for (let b = 1; b <= 20; b++) {
        const at = (b - 1) * s.rules.buildingMs + 1400;
        if (at > s.state.t && at < endT) s.apply({ type: 'color', t: at, ...s.game.course.targets[b - 1] });
      }
      s.apply({ type: 'tick', t: endT });
      s.startClock(performance.now());
      if (s.meta.playId !== playId || s.meta.debug) throw new Error('fixture must preserve the genuine play identity');
    }, endT);
    await page.clock.runFor(32);
  };
  const step = () => page.evaluate(() => __kamereoru.guidance.view().step);
  try {
    await openHome(page, env.url);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await start();
    await page.waitForSelector(selector('skip-opening'));
    await page.locator(selector('skip-opening')).dispatchEvent('click');
    await page.waitForFunction(() => __kamereoru.guidance.view().step === 1);
    const firstId = await page.evaluate(() => __kamereoru.session.meta.playId);
    await page.evaluate(()=>{const g=__kamereoru.guidance;g.setDraft(g.view().target);g.tick(performance.now());});
    await advance(5000);
    assert.equal(await step(), 2);
    assert.equal(await page.locator(selector('guidance')).textContent(), '壁の色に合わせよう');
    await quit();

    await start();
    await page.waitForFunction(() => __kamereoru.session.running);
    assert.equal(await step(), null);
    const secondId = await page.evaluate(() => __kamereoru.session.meta.playId);
    assert.notEqual(secondId, firstId);
    await advance(5000);
    assert.equal(await step(), null, 'moving basic guide belongs only to the first play');
    await advance(94480);
    await page.clock.runFor(700);
    await page.waitForFunction(() => __kamereoru.guidance.view().step === 3);
    assert.equal(await page.evaluate(() => __kamereoru.session.state.t), 95000);
    await page.evaluate(()=>{const g=__kamereoru.guidance;g.setDraft(g.view().target);g.tick(performance.now());});
    await advance(100000);
    assert.equal(await step(), 4);
    assert.equal(await page.locator(selector('guidance')).textContent(), '壁の色に合わせよう');
    await quit();

    await start();
    await page.waitForFunction(() => __kamereoru.session.running);
    assert.equal(await step(), null);
    const thirdId = await page.evaluate(() => __kamereoru.session.meta.playId);
    assert.notEqual(thirdId, secondId);
    await advance(5000);
    assert.equal(await step(), null);
    await advance(94480);
    await page.clock.runFor(700);
    assert.equal(await page.evaluate(() => __kamereoru.session.running), true);
    assert.ok(await page.evaluate(() => __kamereoru.session.state.t > 95000));
    assert.equal(await step(), null, 'brightness static guide is consumed on the second play');
    await advance(100000);
    assert.equal(await step(), null, 'brightness moving guide is consumed on the second play');
    const progress = await page.evaluate(() => __kamereoru.guidance.progress);
    assert.equal(progress.basic.ownerPlayId, firstId);
    assert.equal(progress.brightness.ownerPlayId, secondId);
    assert.equal(progress.basic.shownMask, 3);
    assert.equal(progress.brightness.shownMask, 3);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('G3: pause remains usable during the first stationary guide', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    await env.page.click(selector('home-start'));
    await env.page.waitForSelector(selector('skip-opening'));
    // Skip is setup here: dispatch before the timed opening removes its button.
    // The pause action below still uses a real pointer click.
    await env.page.locator(selector('skip-opening')).dispatchEvent('click');
    await env.page.waitForFunction(() => __kamereoru.guidance?.view().step === 1);
    await env.page.click(selector('pause'));
    await env.page.waitForSelector(selector('pause-resume'), { timeout: 2000 });
    assert.equal(await env.page.evaluate(() => __kamereoru.session.running), false);
    assert.equal(await env.page.evaluate(() => __kamereoru.session.state.t), 0);
  } finally { await env.close(); }
});

test('G3: hiding during the initial opening preserves the first guide after explicit resume', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await page.click(selector('home-start'));
    await page.waitForSelector(selector('skip-opening'));
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForSelector(selector('pause-resume'));
    await page.clock.runFor(1000);
    assert.equal(await page.evaluate(() => __kamereoru.session.state.t), 0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.locator(selector('pause-resume')).dispatchEvent('click');
    await page.clock.runFor(4100);
    assert.equal(await page.evaluate(() => __kamereoru.guidance.view().step), 1);
    assert.equal(await page.evaluate(() => __kamereoru.session.running), false);
    assert.equal(await page.isVisible('.palette-guide-target'), true);
    assert.equal(await page.locator('.controls.disabled').count(), 0);
  } finally { await env.close(); }
});

test('G3: reaching the brightness guide freezes exactly at 95000 and stops game audio', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await page.evaluate(() => {
      const a = __kamereoru, session = a.session;
      const stop = a.audio.stopGameAudio.bind(a.audio);
      globalThis.__guideAudioStops = 0;
      a.audio.stopGameAudio = (...args) => { __guideAudioStops++; return stop(...args); };
      for (let building = 1; building <= 19; building++) {
        const target = session.game.course.targets[building - 1];
        session.apply({ type: 'color', t: (building - 1) * 5000 + 1400, ...target });
      }
      session.apply({ type: 'tick', t: 94480 });
      session.startClock(performance.now());
    });
    await page.clock.runFor(700);
    await page.waitForFunction(() => __kamereoru.guidance.view().step === 3);
    assert.equal(await page.evaluate(() => __kamereoru.session.state.t), 95000);
    assert.equal(await page.evaluate(() => __kamereoru.session.running), false);
    assert.ok(await page.evaluate(() => __guideAudioStops > 0));
    await page.clock.runFor(1000);
    assert.equal(await page.evaluate(() => __kamereoru.session.state.t), 95000);
    assert.equal(await page.isVisible('.bar-guide-target'), true);
  } finally { await env.close(); }
});

test('G3: delayed brightness ownership permits countdown before the checkpoint and holds at the checkpoint', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await page.evaluate(() => {
      const a = __kamereoru, claim = a.store.claimGuideGroup.bind(a.store);
      let release;
      const blocked = new Promise((resolve) => { release = resolve; });
      globalThis.__brightnessGate = { release, pending: false };
      a.store.claimGuideGroup = async (...args) => {
        if (args[2]?.group === 'brightness') { __brightnessGate.pending = true; await blocked; }
        return claim(...args);
      };
      for (let building = 1; building <= 19; building++) a.session.apply({ type: 'color', t: (building - 1) * 5000 + 1400, ...a.session.game.course.targets[building - 1] });
      a.session.apply({ type: 'tick', t: 94480 });
      a.session.startClock(performance.now());
    });
    await page.clock.runFor(100);
    await page.waitForFunction(() => __brightnessGate.pending);
    await page.locator(selector('pause')).dispatchEvent('click');
    await page.locator(selector('pause-resume')).dispatchEvent('click');
    await page.clock.runFor(3100);
    assert.equal(await page.evaluate(() => __kamereoru.session.running), true);
    assert.ok(await page.evaluate(() => __kamereoru.session.state.t < 95000));
    await page.clock.runFor(600);
    assert.equal(await page.evaluate(() => __kamereoru.session.state.t), 95000);
    assert.equal(await page.evaluate(() => __kamereoru.session.running), false);
    await page.evaluate(() => __brightnessGate.release());
    await page.waitForFunction(() => __kamereoru.guidance.view().step === 3);
  } finally { await env.close(); }
});

for (const [width, height] of [[402, 700], [402, 874], [874, 402]]) {
  test(`G4: practice guides for stationary exercises align with controls at ${width}x${height}`, async () => {
    const env = await launch({ width, height });
    const { page } = env;
    try {
      await openHome(page, env.url);
      await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
      for (const step of [1, 3]) {
        await page.evaluate((step) => __kamereoru.debugGuide({ step }), step);
        await page.clock.runFor(32);
        await page.waitForSelector(selector('guidance'));
        assert.equal(await page.evaluate(() => __kamereoru.guidePractice.view().step), step);
        assert.equal(await page.locator(selector('guidance')).textContent(), '壁の色に合わせよう');
        assert.equal(await page.locator(selector('guidance')+' button').count(),0);
        const alignment = await page.evaluate((step) => {
          const a = __kamereoru, target = a.guidePractice.view().target;
          const p = a.controls.router.geometry.palette, b = a.controls.router.geometry.bar;
          const marker = document.querySelector('.palette-guide-target').getBoundingClientRect();
          const barMarker = document.querySelector('.bar-guide-target').getBoundingClientRect();
          const angle = target.h / 36000 * Math.PI * 2;
          return { paletteError: Math.hypot(marker.x + marker.width / 2 - (p.cx + Math.sin(angle) * p.r * target.s / 10000), marker.y + marker.height / 2 - (p.cy - Math.cos(angle) * p.r * target.s / 10000)), barError: step < 3 ? 0 : Math.abs(barMarker.x + barMarker.width / 2 - (b.x + b.w / 2)) };
        }, step);
        assert.ok(alignment.paletteError < 2, `palette guide centered: ${JSON.stringify(alignment)}`);
        assert.ok(alignment.barError < 2, `bar guide centered: ${JSON.stringify(alignment)}`);
        for (const target of ['.palette', '.bar', selector('guidance'), selector('guide-practice-pause')]) {
          const rect = await page.locator(target).boundingBox();
          assert.ok(rect && rect.width > 0 && rect.height > 0, `${target} visible`);
          assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${target} fits ${width}x${height}: ${JSON.stringify(rect)}`);
        }
        if (process.env.EFFECTS80_SCREENSHOTS) {
          await mkdir(process.env.EFFECTS80_SCREENSHOTS, { recursive: true });
          await page.screenshot({ path: `${process.env.EFFECTS80_SCREENSHOTS}/${width}x${height}-guide${step}.png` });
        }
      }
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('G3: first stationary guide keeps draft out of game state and history until automatic completion above 95%', async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.click(selector('home-start'));
    await page.waitForSelector(selector('skip-opening'));
    await page.click(selector('skip-opening'));
    await page.waitForSelector(selector('guidance'));
    await page.waitForFunction(() => __kamereoru.guidance?.view().step === 1);
    const hudBox = await page.locator('.hud').boundingBox();
    const guideBox = await page.locator(selector('guidance')).boundingBox();
    assert.ok(guideBox.y >= hudBox.y + hudBox.height - 1, `main guide leaves HUD readable: ${JSON.stringify({ hudBox, guideBox })}`);
    if (process.env.EFFECTS80_SCREENSHOTS) {
      await mkdir(process.env.EFFECTS80_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.EFFECTS80_SCREENSHOTS}/402x874-main-guide1.png` });
    }
    await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    const before = await page.evaluate(() => ({ state: structuredClone(__kamereoru.session.state), history: __kamereoru.session.snapshot().history }));
    await page.clock.runFor(1500);
    assert.equal(await page.evaluate(() => __kamereoru.session.state.t), 0);
    assert.equal(await page.evaluate(() => __kamereoru.session.running), false);
    const point = await page.evaluate(() => {
      const a = __kamereoru, target = a.guidance.view().target, p = a.controls.router.geometry.palette;
      const angle = target.h / 36000 * Math.PI * 2;
      return { x: p.cx + Math.sin(angle) * p.r * target.s / 10000, y: p.cy - Math.cos(angle) * p.r * target.s / 10000 };
    });
    await page.mouse.click(point.x, point.y);
    const draft = await page.evaluate(() => ({ state: __kamereoru.session.state, history: __kamereoru.session.snapshot().history, match: __kamereoru.guidance.view().matchUnits }));
    assert.deepEqual(draft.state, before.state);
    assert.deepEqual(draft.history, before.history);
    assert.ok(draft.match >= 95000000, `real palette input reaches 95% (${draft.match})`);
    assert.equal(await page.locator(selector('guidance')+' button').count(),0);
    await page.clock.runFor(32);
    await page.waitForFunction(() => __kamereoru.session.running);
    assert.equal(await page.evaluate(() => __kamereoru.guidance.view().step), null);
    const progress = await page.evaluate(() => __kamereoru.guidance.progress);
    assert.equal(progress.basic.staticDone, true);
    assert.equal(progress.basic.consumed, true);
    assert.equal(progress.basic.shownMask & 1, 1);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('first theft runs from the display to the stationary guide without moving the camera at handoff', { timeout: 90000 }, async () => {
  const env = await launch();
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await page.evaluate(() => {
      const app = __kamereoru, factory = app.stageFactory.bind(app);
      window.escapeFrames = [];
      app.stageFactory = async (host, opts) => {
        const stage = await factory(host, { ...opts, verification: true });
        if (stage.kind !== 'three') throw new Error('expected 3D jewelry shop');
        const hero = stage.verificationHero(), render = stage.renderer.render.bind(stage.renderer);
        const opening = stage.playOpening.bind(stage);
        let inOpening = false;
        stage.playOpening = async args => {
          inOpening = true;
          try { await opening(args); } finally { inOpening = false; }
        };
        stage.renderer.render = (scene, camera) => {
          render(scene, camera);
          const shop = scene.getObjectByName('opening-jewelry-shop');
          const windows = shop.getObjectByName('opening-shop-windows');
          const display = shop.localToWorld(shop.userData.displayPoint.clone());
          const gem = hero.jewel.getWorldPosition(display.clone());
          const hand = hero.actorParts.hands[0].getWorldPosition(display.clone());
          window.escapeFrames.push({
            opening: inOpening, x: hero.group.parent.position.x, camera: camera.position.toArray(),
            jewel: hero.jewel.visible, handDistance: gem.distanceTo(hand), displayDistance: gem.distanceTo(display), glass: windows.material.color.getHex(),
          });
        };
        return stage;
      };
    });
    await page.locator(selector('home-start')).dispatchEvent('click');
    await page.waitForSelector(selector('skip-opening'));
    // Reloading or leaving during the escape must not give the next run a first opening.
    assert.equal(await page.evaluate(() => __kamereoru.store.get('flags').then(f => f?.openingSeen)), true);
    const photo = async name => {
      if (!process.env.CL03_SCREENSHOTS) return;
      await mkdir(process.env.CL03_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.CL03_SCREENSHOTS}/opening-${name}.png` });
    };
    await photo('display');
    for (let i = 1; i <= 40; i++) {
      await page.clock.fastForward(100);
      if (i === 14) await photo('escape');
      if (i === 39) {
        assert.equal(await page.isVisible(selector('skip-opening')), true);
        const state = await page.evaluate(() => __kamereoru.session.state);
        assert.equal(state.t, 0);
        assert.equal(state.alert, 0);
        assert.equal(state.score.total, 0);
        assert.equal(state.passed, 0);
      }
    }
    await page.clock.runFor(64);
    await page.locator('.palette-guide-target').waitFor({ state: 'visible' });
    await photo('guide');
    const { frames, t, step } = await page.evaluate(() => ({
      frames: window.escapeFrames, t: __kamereoru.session.state.t, step: __kamereoru.guidance.view().step,
    }));
    const opening = frames.filter(f => f.opening);
    const last = opening.at(-1), next = frames[frames.lastIndexOf(last) + 1];
    assert.ok(opening[0].jewel && opening[0].displayDistance < 0.001);
    assert.ok(opening.filter(f => f.jewel && f.displayDistance > 2 && f.handDistance < 0.35).length >= 3, 'the gem stays in the front hand while running');
    assert.ok(new Set(opening.map(f => f.glass)).size > 3, 'actual display windows pulse');
    assert.ok(opening.every((f, i) => !i || (f.x >= opening[i - 1].x && f.x - opening[i - 1].x < 1)));
    assert.equal(last.jewel, false);
    assert.ok(next && !next.opening);
    assert.equal(last.x, next.x);
    assert.deepEqual(last.camera, next.camera);
    assert.deepEqual([t, step], [0, 1]);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
