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

async function paintColor(page, color, { brightness = false } = {}) {
  const palette = await page.locator('.ta-game .palette').boundingBox();
  assert.ok(palette);
  const { dx, dy } = pointFromHs(color.h, color.s, Math.min(palette.width, palette.height) / 2);
  await page.touchscreen.tap(palette.x + palette.width / 2 + dx, palette.y + palette.height / 2 + dy);
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

test('time attack plays 30 centered walls with immediate transitions, brightness and ranked submission', { timeout: 120_000 }, async () => {
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
    assert.equal(await page.getByTestId('ta-building').textContent(), '1 / 30');
    assert.deepEqual(await visibleTargets(page), [1]);
    await checkDomCenter(page);
    assert.equal(await page.getByTestId('ta-brightness').isVisible(), false);
    await checkFit(page, ['.ta-hud', '.ta-stage', '.ta-game .palette', '.ta-game .bar']);
    await takeEvidence(page, 'time-attack-dom-402x700');

    await paintColor(page, course.targets[0]);
    await page.clock.runFor(175);
    assert.ok(Number.parseFloat(await page.getByTestId('ta-color').textContent()) >= 95);
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
    assert.equal(await page.getByTestId('ta-building').textContent(), '2 / 30');
    await checkDomCenter(page);

    for (let building = 2; building <= 30; building++) {
      assert.equal(await page.getByTestId('ta-building').textContent(), `${building} / 30`);
      assert.deepEqual(await visibleTargets(page), [building]);
      assert.equal(await page.getByTestId('ta-brightness').isVisible(), building >= 15);
      const target = course.targets[building - 1];
      if (building === 15) {
        await paintColor(page, target);
        await page.clock.runFor(550);
        assert.equal(await phase(page, 'active').count(), 1);
        assert.equal(await page.getByTestId('ta-building').textContent(), '15 / 30');
        assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
      }
      await paintColor(page, target, { brightness: building >= 15 });
      await page.clock.runFor(550);
      if (building < 30) assert.equal(await phase(page, 'active').count(), 1);
    }

    await page.getByTestId('ta-result').waitFor();
    await page.clock.runFor(5000);
    await page.waitForFunction(() => document.querySelector('[data-testid="ta-result-status"]')?.textContent.includes('記録を確認しました'));
    const accepted = mock.summary();
    assert.ok(accepted);
    assert.equal(accepted.buildings, 30);
    assert.equal(accepted.executedTravelMs, 0);
    assert.equal(accepted.moveCount, 0);
    assert.equal(accepted.rulesVersion, CURRENT_RULES_VERSION);
    assert.equal(await page.getByTestId('ta-result-time').textContent(), formatTime(accepted.elapsedCs));
    assert.equal(await page.getByTestId('ta-result-title').textContent(), TITLE_NAMES_JA[Number(accepted.titleId.slice(-2)) - 1]);
    assert.equal(await page.getByTestId('ta-ranking').getAttribute('href'),
      'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack');
    const share = await openXShare(page, 'ta-share');
    assert.equal(share.searchParams.get('url'), 'https://chameleonjp-lab.github.io/chameleol/');
    assert.deepEqual(share.searchParams.get('text').split(/\r?\n/), [
      'タイムアタックモード', `記録：${formatTime(accepted.elapsedCs, 'ja', { share: true })}`, '#カメレオる',
    ]);
    const { events, end } = mock.submitted();
    assert.deepEqual(events[0], { seq: 0, t: 0, kind: 'ready', building: 1 });
    assert.equal(events.filter(event => event.kind === 'travel').length, 0);
    assert.equal(events.filter(event => event.kind === 'ready').length, 30);
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
    assert.equal(await page.evaluate(() => globalThis.__taThree.targets.filter(color => color.s > 0).length), 1);
    await checkFit(page, ['.ta-hud', '.ta-game .palette', '.ta-game .bar']);
    await takeEvidence(page, 'time-attack-three-874x402');
    await page.setViewportSize({ width: 402, height: 874 });
    await checkFit(page, ['.ta-hud', '.ta-game .palette', '.ta-game .bar']);
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
