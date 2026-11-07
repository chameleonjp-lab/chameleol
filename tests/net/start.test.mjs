// 端末側の開始受付・開始通知（受入試験 NET-TEST-01〜03 の端末部分）。サーバーは模擬。
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../../src/storage/store.js';
import { ApiError, uuid } from '../../src/net/api.js';
import { abandonStart, createStartRequest, flushLaunches, recordLaunch, sendStartRequest, validateStartResponse } from '../../src/net/start.js';
import { RULES_V1 } from '../../src/rules/v1/index.js';

let n = 0;
const fresh = () => openStore({ indexedDB: new IDBFactory(), name: `net${(n += 1)}` });

function fakeApi(script) {
  const calls = [];
  return {
    configured: true,
    calls,
    async post(path, body) {
      calls.push({ path, body });
      const step = script(path, body, calls.filter((c) => c.path === path).length);
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

const okStart = (body) => ({ ok: true, requestId: body.requestId, playId: uuid(), seed: 123, rulesVersion: RULES_V1.rulesVersion, generatorVersion: RULES_V1.generatorVersion, gameVersion: body.gameVersion, name: body.name });

test('NET-TEST-01: 初回＋自動再試行2回まで、同じ要求番号。無限に待たない', async () => {
  const store = await fresh();
  const api = fakeApi(() => new ApiError('network', { retryable: true }));
  const rec = await createStartRequest(store, { name: 'ねこ', launchId: uuid(), gameVersion: 't' });
  assert.equal((await store.getOne('starts', rec.requestId)).secret, rec.secret, '送る前に秘密を保存');
  const r = await sendStartRequest(api, store, rec, { delays: [1, 1] });
  assert.equal(r.ok, false);
  assert.equal(api.calls.length, 3);
  assert.ok(api.calls.every((c) => c.body.requestId === rec.requestId && c.body.secret === rec.secret));
  assert.equal((await store.getOne('starts', rec.requestId)).status, 'failed');
  store.close();
});

test('2回失敗して3回目で受付：同じ要求の内容を受け取る。形式の違う応答は受付成功にしない', async () => {
  const store = await fresh();
  const api = fakeApi((path, body, nth) => (nth < 3 ? new ApiError('timeout', { retryable: true }) : okStart(body)));
  const rec = await createStartRequest(store, { name: 'いぬ', launchId: uuid(), gameVersion: 't' });
  const r = await sendStartRequest(api, store, rec, { delays: [1, 1] });
  assert.equal(r.ok, true);
  assert.equal((await store.getOne('starts', rec.requestId)).status, 'accepted');
  assert.deepEqual(validateStartResponse({ ...r.data, name: 'ちがう' }, { requestId: rec.requestId, name: 'いぬ' }), ['name']);
  assert.deepEqual(validateStartResponse({ ...r.data, seed: -1 }, { requestId: rec.requestId, name: 'いぬ' }), ['seed']);
  assert.deepEqual(validateStartResponse({ ...r.data, rulesVersion: 'x' }, { requestId: rec.requestId, name: 'いぬ' }), ['rulesVersion']);
  store.close();
});

test('NET-TEST-03: 対象外へ進んだ後に古い応答が届いても、現在のプレイに取り付けず中止として残す', async () => {
  const store = await fresh();
  let current = true;
  const api = fakeApi((path, body) => {
    if (path === 'start') {
      current = false; // 応答が届く前に、利用者が「ランキング対象外で遊ぶ」を選んだ
      return okStart(body);
    }
    return { ok: true, status: 'abandoned' };
  });
  const rec = await createStartRequest(store, { name: 'とり', launchId: uuid(), gameVersion: 't' });
  const r = await sendStartRequest(api, store, rec, { delays: [], isCurrent: () => current });
  assert.equal(r.ok, false);
  assert.equal(r.stale, true);
  assert.equal((await store.getOne('starts', rec.requestId)).status, 'abandoned');
  store.close();
});

test('再試行しない拒否（形式・照合）では、すぐに選択肢へ進む', async () => {
  const store = await fresh();
  const api = fakeApi(() => new ApiError('bad_name', { retryable: false, status: 422 }));
  const rec = await createStartRequest(store, { name: 'x', launchId: uuid(), gameVersion: 't' });
  const r = await sendStartRequest(api, store, rec, { delays: [1, 1] });
  assert.equal(r.ok, false);
  assert.equal(api.calls.length, 1);
  assert.equal(r.error.code, 'bad_name');
  store.close();
});

test('中止はサーバーへ伝え、届かなくても端末の記録は中止になる', async () => {
  const store = await fresh();
  const api = fakeApi(() => new ApiError('network', { retryable: true }));
  const rec = await createStartRequest(store, { name: 'x', launchId: uuid(), gameVersion: 't' });
  await abandonStart(api, store, rec);
  assert.equal((await store.getOne('starts', rec.requestId)).status, 'abandoned');
  store.close();
});

test('開始通知は保存してから送り、送れた通知は再送しない。送れなければ次回に再送する', async () => {
  const store = await fresh();
  let online = false;
  const api = fakeApi(() => (online ? { ok: true, counted: true } : new ApiError('network', { retryable: true })));
  const launchId = uuid();
  await recordLaunch(store, { launchId, ranked: false, gameVersion: 't' });
  assert.deepEqual(await flushLaunches(api, store), { sent: 0, failed: 1 });
  online = true;
  assert.deepEqual(await flushLaunches(api, store), { sent: 1, failed: 0 });
  assert.deepEqual(await flushLaunches(api, store), { sent: 0, failed: 0 });
  const saved = await store.getOne('launches', launchId);
  assert.equal(saved.sent, true);
  assert.equal(saved.secret, null, '送れた通知から秘密を外す');
  store.close();
});

test('接続先が未設定なら何も送らない（検証版）', async () => {
  const store = await fresh();
  await recordLaunch(store, { launchId: uuid(), ranked: false, gameVersion: 't' });
  assert.deepEqual(await flushLaunches({ configured: false }, store), { sent: 0, failed: 0 });
  store.close();
});
