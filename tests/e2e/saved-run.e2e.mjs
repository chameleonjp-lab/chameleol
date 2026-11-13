import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openHome } from './helpers.mjs';

const homeStart = '[data-testid=home-start]';
const newGame = '[data-testid="start.savedRun.newGame"]';
const cancel = '[data-testid="common.cancel"]';
const activeRun = (page) => page.evaluate(async () => {
  const { playId, status, owner } = await globalThis.__kamereoru.store.loadRun();
  return { playId, status, owner };
});

async function startPlay(page, name = '') {
  await page.bringToFront();
  await page.fill('#name-input', name);
  await page.click(homeStart);
}

test('別のタブで始まったプレイを、ホームの「はじめる」だけでは終了しない', async () => {
  const env = await launch();
  const { page: first, context, url } = env;
  try {
    const second = await context.newPage();
    await openHome(first, url);
    await openHome(second, url);
    await startPlay(first);
    await first.waitForSelector('[data-testid=stage]');
    const before = await activeRun(first);

    await startPlay(second);
    await second.waitForSelector(`${newGame}, [data-testid=stage]`);
    assert.deepEqual(await activeRun(second), before, '確認の前は同じタブが同じプレイを担当する');
    await second.click(cancel);
    assert.equal(await second.isVisible('[data-testid=home-continue]'), true);
    assert.deepEqual(await activeRun(second), before);
    const savedResults = await second.evaluate(() => globalThis.__kamereoru.store.getAll('localResults'));
    assert.deepEqual(savedResults, []);
  } finally {
    await env.close();
  }
});

test('開始受付の応答を待つ間に別のタブが始めたら、終了を確認し、それぞれのプレイの秘密で記録する', { timeout: 30000 }, async () => {
  const env = await launch();
  const { page: first, context, url } = env;
  const firstId = '00000000-0000-4000-8000-000000000001';
  const secondId = '00000000-0000-4000-8000-000000000002';
  const playIds = { '先のプレイ': firstId, '次のプレイ': secondId };
  const starts = new Map();
  const launches = new Map();
  let markSecondArrived;
  const secondArrived = new Promise((resolve) => { markSecondArrived = resolve; });
  let releaseSecond;
  const secondResponse = new Promise((resolve) => { releaseSecond = resolve; });
  await context.addInitScript(() => localStorage.setItem('kamereoru.apiBase', '/test-api'));
  await context.route('**/test-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1);
    const data = route.request().postDataJSON();
    if (path === 'start') {
      const playId = playIds[data.name];
      starts.set(playId, data.secret);
      if (playId === secondId) {
        markSecondArrived();
        await secondResponse;
      }
      return route.fulfill({ json: { ok: true, playId, requestId: data.requestId, name: data.name, gameVersion: data.gameVersion, seed: 1, rulesVersion: 'kamereoru-rules-v1', generatorVersion: 'kamereoru-course-v1' } });
    }
    if (path === 'launch') launches.set(data.playId, data.secret);
    return route.fulfill({ json: { ok: true } });
  });
  try {
    const second = await context.newPage();
    await openHome(first, url);
    await openHome(second, url);
    await startPlay(second, '次のプレイ');
    await secondArrived;

    await startPlay(first, '先のプレイ');
    await first.waitForSelector('[data-testid=stage]');
    const before = await activeRun(first);
    assert.equal(before.playId, firstId);

    await second.bringToFront();
    releaseSecond();
    await second.waitForSelector(`${newGame}, [data-testid=stage]`);
    assert.deepEqual(await activeRun(second), before, '受付に成功しても確認が済むまでは元のプレイが残る');
    await second.click(newGame);
    await second.waitForSelector('[data-testid=stage]');
    assert.equal((await activeRun(second)).playId, secondId);
    const firstResult = await second.evaluate((playId) => globalThis.__kamereoru.store.getOne('outbox', playId), firstId);
    assert.equal(firstResult?.secret, starts.get(firstId), '先のプレイは先の開始受付の秘密で保存する');
    const launch = await second.evaluate((playId) => globalThis.__kamereoru.store.getAll('launches').then((items) => items.find((item) => item.playId === playId)), secondId);
    assert.ok(launch, '次のプレイの開始通知は残る');
    assert.equal(launch.secret ?? launches.get(secondId), starts.get(secondId), '次のプレイの開始通知も自分の秘密を使う');
  } finally {
    releaseSecond();
    await env.close();
  }
});
