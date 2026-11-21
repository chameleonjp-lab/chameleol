import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { launch, openHome, openXShare } from './helpers.mjs';
import { barFromV, pointFromHs } from '../../src/rules/v1/color.js';
import {
  COURSE_VERSION, CURRENT_RULES_VERSION, formatTime, generateTimeAttackCourse, MODE_ID, replayTimeAttack, TITLE_NAMES_JA,
} from '../../src/rules/time-attack/v1/index.js';

const fixtureName = '色合わせテスト';
const playId = '4fd21726-9e7e-4a51-8b73-c44d444e844a';
const course = generateTimeAttackCourse(5, CURRENT_RULES_VERSION);

async function mockTimeAttack(env) {
  const calls = [];
  const chunks = [];
  let submitted;
  let summary;
  await env.context.addInitScript(() => {
    localStorage.setItem('kamereoru.apiBase', '/fixture-time-attack');
  });
  await env.context.route('**/fixture-time-attack/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.split('/').at(-1);
    const body = request.postDataJSON();
    calls.push({ path, body });
    let response;
    switch (path) {
      case 'time-attack-start':
        response = { playId, seed: course.seed, family: course.family, rulesVersion: CURRENT_RULES_VERSION,
          generatorVersion: COURSE_VERSION, acceptedAt: new Date().toISOString(), expiresAt: null };
        break;
      case 'time-attack-launch':
        response = { counted: true, launchId: body.launchId };
        break;
      case 'time-attack-abandon':
        response = { status: 'abandoned' };
        break;
      case 'time-attack-chunk':
        chunks[body.index] = body.data;
        response = { playId, resultId: body.resultId, index: body.index };
        break;
      case 'time-attack-complete':
        submitted = JSON.parse(chunks.join(''));
        summary = replayTimeAttack(submitted);
        response = { playId, resultId: body.resultId, status: 'verifying' };
        break;
      case 'time-attack-status':
        response = { items: [{ playId, ...summary, status: summary ? 'official' : 'not_received' }] };
        break;
      default:
        await route.fulfill({ json: { ok: false, error: 'fixture_unsupported' } });
        return;
    }
    await route.fulfill({ json: { ok: true, modeId: MODE_ID, ...response } });
  });
  return { calls, submitted: () => submitted, summary: () => summary };
}

async function palettePoint(page, color) {
  const palette = await page.locator('.ta-game .palette').boundingBox();
  assert.ok(palette);
  const { dx, dy } = pointFromHs(color.h, color.s, Math.min(palette.width, palette.height) / 2);
  return { x: palette.x + palette.width / 2 + dx, y: palette.y + palette.height / 2 + dy };
}

async function paintColor(page, color, { brightness = false } = {}) {
  const { x, y } = await palettePoint(page, color);
  await page.touchscreen.tap(x, y);
  if (brightness) {
    const bar = await page.locator('.ta-game .bar').boundingBox();
    assert.ok(bar);
    await page.touchscreen.tap(bar.x + bar.width / 2, bar.y + Math.max(1, barFromV(color.v, bar.height)));
  }
}

function phase(page, value) {
  return page.locator(`[data-testid="ta-game"][data-phase="${value}"]`);
}

async function visibleTargets(page) {
  return page.evaluate(() => globalThis.__taRenderedTargets);
}

async function setHidden(page, hidden) {
  await page.evaluate(value => {
    globalThis.__taHidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function checkFit(page, selectors) {
  const overflow = await page.evaluate(items => items.flatMap(selector => {
    const element = document.querySelector(selector);
    if (!element) return [selector];
    const r = element.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 ? [] : [selector];
  }), selectors);
  assert.deepEqual(overflow, []);
}

async function checkDomCenter(page) {
  const offset = await page.evaluate(() => {
    const center = el => { const rect = el.getBoundingClientRect(); return rect.left + rect.width / 2; };
    const stage = document.querySelector('.ta-stage');
    return center(stage.querySelector('.dom-wall:nth-child(2)')) - center(stage.querySelector('.dom-hero'));
  });
  assert.ok(Math.abs(offset) < 2, `wall center is ${offset}px from the hero`);
}

async function takeEvidence(page, name) {
  const directory = process.env.TA_SCREENSHOTS;
  if (directory) await page.screenshot({ path: join(directory, `${name}.png`) });
}

test('time attack plays 20 centered walls with immediate transitions, brightness and ranked submission', { timeout: 120_000 }, async () => {
  const env = await launch({ width: 402, height: 700 });
  const { page } = env;
  try {
    const mock = await mockTimeAttack(env);
    await page.clock.install();
    await env.context.addInitScript(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!globalThis.__taHidden });
    });
    await openHome(page, env.url);
    await page.evaluate(async () => {
      const { createDomStage } = await import('/src/scene/stage.js');
      const app = globalThis.__kamereoru;
      globalThis.__taSuccessSounds = 0;
      const originalSound = app.audio.play.bind(app.audio);
      app.audio.play = (name, ...args) => {
        if (name === 'passBuilding') {
          globalThis.__taSuccessSounds++;
          return true;
        }
        return originalSound(name, ...args);
      };
      app.stageFactory = async (container, options) => {
        captureVisibleTargets();
        const stage = createDomStage(container, options);
        const update = stage.update;
        function captureVisibleTargets() {
          globalThis.__taRenderedTargets = options.course.targets.flatMap((color, index) => color.s > 0 ? [index + 1] : []);
        }
        stage.update = (...args) => { update(...args); captureVisibleTargets(); };
        return stage;
      };
    });
    await page.locator('#name-input').fill(fixtureName);
    await page.getByTestId('home-time-attack').tap();
    await page.getByTestId('ta-intro').waitFor();
    assert.match(await page.getByTestId('ta-intro').textContent(), /90%以上.*すぐ切り替わります/);
    assert.equal(mock.calls.filter(({ path }) => path.startsWith('time-attack-')).length, 0);
    await page.getByTestId('ta-start-cancel').tap();
    await page.getByTestId('home-time-attack').tap();
    await page.getByTestId('ta-start').tap();
    await phase(page, 'active').waitFor();
    assert.equal(await page.getByTestId('ta-building').textContent(), '1 / 20');
    assert.deepEqual(await visibleTargets(page), [1]);
    await checkDomCenter(page);
    assert.equal(await page.getByTestId('ta-brightness').isVisible(), false);
    assert.equal(await page.locator('.ta-game .bar').isVisible(), false);
    await checkFit(page, ['.ta-hud', '.ta-stage', '.ta-game .palette']);
    await takeEvidence(page, 'time-attack-dom-402x700');

    assert.match(await page.getByTestId('ta-color').textContent(), /%$/);
    await paintColor(page, course.targets[0]);
    await page.clock.runFor(175);
    assert.equal(await page.getByTestId('ta-color').isVisible(), false);
    assert.ok(Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')) > 0);
    await setHidden(page, true);
    await phase(page, 'paused').waitFor();
    const stopped = await page.getByTestId('ta-time').textContent();
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
    assert.deepEqual(await visibleTargets(page), []);
    await page.clock.runFor(350);
    await setHidden(page, false);
    await page.clock.runFor(350);
    assert.equal(await page.getByTestId('ta-time').textContent(), stopped);
    await phase(page, 'paused').waitFor();
    await page.getByTestId('ta-resume').tap();
    await page.clock.runFor(550);
    assert.deepEqual(await visibleTargets(page), [2]);
    assert.equal(await page.getByTestId('ta-building').textContent(), '2 / 20');
    await checkDomCenter(page);

    for (let building = 2; building <= 20; building++) {
      assert.equal(await page.getByTestId('ta-building').textContent(), `${building} / 20`);
      assert.deepEqual(await visibleTargets(page), [building]);
      assert.equal(await page.locator('.ta-game .bar').isVisible(), building >= 11);
      const target = course.targets[building - 1];
      if (building === 11) {
        await paintColor(page, { ...target, v: target.v - 1750 }, { brightness: true });
        assert.equal(await page.getByTestId('ta-color').isVisible(), false);
        assert.match(await page.getByTestId('ta-brightness').textContent(), /%$/);
        await paintColor(page, { ...target, v: target.v - 1200 }, { brightness: true });
        assert.equal(await page.getByTestId('ta-brightness').isVisible(), false);
        await page.clock.runFor(550);
        assert.equal(await phase(page, 'active').count(), 1);
        assert.equal(await page.getByTestId('ta-building').textContent(), '11 / 20');
        assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
      }
      await paintColor(page, target, { brightness: building >= 11 });
      await page.clock.runFor(550);
      if (building < 20) assert.equal(await phase(page, 'active').count(), 1);
    }

    await page.getByTestId('ta-result').waitFor();
    await page.clock.runFor(5000);
    await page.waitForFunction(() => document.querySelector('[data-testid="ta-result-status"]')?.textContent.includes('記録を確認しました'));
    const accepted = mock.summary();
    assert.ok(accepted);
    assert.equal(accepted.buildings, 20);
    assert.equal(await page.evaluate(() => globalThis.__taSuccessSounds), 20);
    assert.equal(accepted.executedTravelMs, 0);
    assert.equal(accepted.moveCount, 0);
    assert.equal(accepted.rulesVersion, CURRENT_RULES_VERSION);
    assert.equal(await page.getByTestId('ta-result-time').textContent(), formatTime(accepted.elapsedCs));
    assert.equal(await page.getByTestId('ta-result-title').textContent(), TITLE_NAMES_JA[Number(accepted.titleId.slice(-2)) - 1]);
    assert.equal(await page.getByTestId('ta-ranking').getAttribute('href'),
      'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack');
    const colors = page.getByTestId('ta-tricky-colors');
    await colors.getByText('苦手な色', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.ta-tricky-portrait canvas').length === 3);
    const boxes = await colors.locator('figure').evaluateAll(items => items.map(item => {
      const box = item.getBoundingClientRect();
      return { top: box.top, left: box.left, right: box.right };
    }));
    assert.equal(boxes.length, 3);
    assert.ok(boxes.every((box, i) => box.top === boxes[0].top && box.left >= (boxes[i - 1]?.right ?? 0)));
    const share = await openXShare(page, 'ta-share');
    assert.equal(share.searchParams.get('url'), 'https://chameleonjp-lab.github.io/chameleol/');
    assert.deepEqual(share.searchParams.get('text').split(/\r?\n/), [
      'タイムアタックモード (全色・20棟)', `記録：${formatTime(accepted.elapsedCs, 'ja', { share: true })}`, '#カメレオる',
    ]);
    const { events, end } = mock.submitted();
    assert.deepEqual(events[0], { seq: 0, t: 0, kind: 'ready', building: 1 });
    assert.equal(events.filter(event => event.kind === 'travel').length, 0);
    assert.equal(events.filter(event => event.kind === 'ready').length, 20);
    assert.equal(end.t, accepted.elapsedMs);
    const launches = mock.calls.filter(({ path }) => path === 'time-attack-launch');
    assert.equal(launches.length, 1);
    assert.equal(launches[0].body.ranked, true);
    assert.equal(mock.calls.filter(({ path }) => path === 'launch' || path === 'start').length, 0);
    await takeEvidence(page, 'time-attack-result-402x700');
    await page.getByTestId('ta-home').tap();
    await page.getByTestId('home-start').waitFor();
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});

for (const mobile of [true, false]) {
  const input = mobile ? 'touch' : 'mouse';
  test(`time attack keeps the ${input} palette drag across walls and the brightness unlock`, { timeout: 40_000 }, async () => {
    const env = await launch({ width: mobile ? 402 : 1024, height: 700, mobile });
    const { page } = env;
    try {
      await mockTimeAttack(env);
      await page.clock.install();
      await openHome(page, env.url);
      await page.evaluate(async () => {
        const { createDomStage } = await import('/src/scene/stage.js');
        globalThis.__kamereoru.stageFactory = async (container, options) => createDomStage(container, options);
      });
      await page.locator('#name-input').fill(fixtureName);
      await page.getByTestId('home-time-attack').click();
      await page.getByTestId('ta-start').click();
      await phase(page, 'active').waitFor();

      const palette = page.locator('.ta-game .palette');
      assert.equal(await page.locator('.ta-game .controls').evaluate(el => el.classList.contains('desktop-controls')), !mobile);
      const cdp = mobile ? await env.context.newCDPSession(page) : null;
      const first = await palettePoint(page, course.targets[0]);
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
      } else {
        await page.mouse.move(first.x, first.y);
        assert.equal(await page.getByTestId('ta-color').isVisible(), false, 'moving without clicking should select the color');
        await page.mouse.down();
      }

      for (let building = 2; building <= 11; building++) {
        await page.clock.runFor(550);
        assert.equal(await page.getByTestId('ta-building').textContent(), `${building} / 20`);
        const previous = await palette.getAttribute('aria-valuetext');
        const next = await palettePoint(page, course.targets[building - 1]);
        if (cdp) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [next] });
        } else {
          await page.mouse.move(next.x, next.y);
        }
        assert.notEqual(await palette.getAttribute('aria-valuetext'), previous, `the held ${input} should move the palette cursor on wall ${building}`);
        assert.equal(await page.getByTestId('ta-color').isVisible(), false);
      }

      assert.equal(await page.locator('.ta-game .bar').isVisible(), true);
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      assert.deepEqual(env.errors, []);
    } finally {
      await env.close();
    }
  });
}

test('the three-dimensional stage fits a landscape mobile viewport and can pause and quit', { timeout: 40_000 }, async () => {
  const env = await launch({ width: 874, height: 402 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => {
      const app = globalThis.__kamereoru;
      const factory = app.stageFactory;
      app.stageFactory = async (container, options) => {
        const stage = await factory(container, options);
        globalThis.__taThree = { kind: stage.kind, targets: options.course.targets };
        const update = stage.update;
        stage.update = frame => {
          globalThis.__taThree.block = frame.t / options.rules.buildingMs;
          globalThis.__taThree.centerOnBuilding = options.centerOnBuilding;
          const visible = options.course.targets.filter(color => color.s > 0).length;
          if (visible) globalThis.__taThree.lastVisible = visible;
          update(frame);
        };
        return stage;
      };
    });
    await page.getByTestId('home-time-attack').tap();
    await page.getByTestId('ta-start').tap();
    await phase(page, 'active').waitFor();
    await page.locator('[data-testid="ta-stage"] canvas').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => globalThis.__taThree.kind), 'three');
    assert.equal(await page.evaluate(() => globalThis.__taThree.block), 0.5);
    assert.equal(await page.evaluate(() => globalThis.__taThree.centerOnBuilding), true);
    assert.equal(await page.evaluate(() => globalThis.__taThree.lastVisible), 1);
    await checkFit(page, ['.ta-hud', '.ta-game .palette']);
    await takeEvidence(page, 'time-attack-three-874x402');
    await page.setViewportSize({ width: 402, height: 874 });
    await checkFit(page, ['.ta-hud', '.ta-game .palette']);
    await takeEvidence(page, 'time-attack-three-402x874');
    const pause = page.getByTestId('ta-pause');
    const resume = page.getByTestId('ta-resume');
    if (await pause.isEnabled()) {
      // A slow screenshot on software WebGL can trip the game's auto-pause.
      await pause.tap({ timeout: 3000 }).catch(async error => {
        if (!await resume.isVisible()) throw error;
      });
    }
    await resume.waitFor();
    assert.equal(await page.getByTestId('ta-color').textContent(), '—');
    assert.ok(await page.evaluate(() => globalThis.__taThree.targets.every(color => color.s === 0)));
    await page.getByTestId('ta-quit').tap();
    await page.getByTestId('ta-result').waitFor();
    assert.equal(await page.getByTestId('ta-share').count(), 0);
    assert.deepEqual(env.errors, []);
  } finally {
    await env.close();
  }
});
