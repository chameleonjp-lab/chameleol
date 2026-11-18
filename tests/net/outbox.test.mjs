// 端末側の送信待ちと再送（受入試験 NET-TEST-04〜07 の端末部分）。サーバーは模擬。
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../../src/storage/store.js';
import { ApiError, uuid } from '../../src/net/api.js';
import { CHUNK_CHARS, chunkOf, flushOutbox, makeOutboxItem, refreshRecords } from '../../src/net/outbox.js';
import { simulatePlay } from '../helpers/simulate.mjs';
import { summarize } from '../../src/rules/v1/index.js';
import { randomSecret } from '../../src/storage/store.js';

let n = 0;
const fresh = (opts) => openStore({ indexedDB: new IDBFactory(), name: `ob${(n += 1)}`, ...opts });

async function item(seed = 1, { jitter = 30 } = {}) {
  const live = simulatePlay(seed, { jitter });
  const snapshot = { meta: { destination: 'verification:test', playId: uuid(), launchId: uuid(), rulesVersion: 'kamereoru-rules-v1', generatorVersion: 'kamereoru-course-v1', gameVersion: 't', seed, name: 'テスト' }, history: live.entries };
  return makeOutboxItem({ snapshot, summary: summarize(live.state), secret: randomSecret(), gameVersion: 't' });
}

/** 受付の模擬。fail(path, body, n) が ApiError を返すと、その呼び出しは失敗する。 */
function fakeServer(fail = () => null) {
  const chunks = new Map();
  const results = new Map();
  const calls = [];
  return {
    configured: true, destination: "verification:test",
    calls,
    results,
    async post(path, body) {
      calls.push({ path, body });
      const err = fail(path, body, calls.filter((c) => c.path === path).length);
      if (err) throw err;
      if (path === 'chunk') {
        const key = `${body.playId}`;
        const m = chunks.get(key) ?? new Map();
        if (m.has(body.index) && m.get(body.index) !== body.data) throw new ApiError('chunk_conflict', { status: 409 });
        m.set(body.index, body.data);
        chunks.set(key, m);
        return { ok: true, received: m.size, total: body.total };
      }
      if (path === 'complete') {
        const m = chunks.get(body.playId) ?? new Map();
        const parts = [...m.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        if (!results.has(body.playId)) {
          results.set(body.playId, { body: parts.join(''), resultId: body.resultId });
        }
        return { ok: true, playId: body.playId, resultId: body.resultId, status: 'verifying' };
      }
      if (path === 'status') {
        return { ok: true, items: body.items.map((x) => ({ playId: x.playId, status: 'official', official: { buildings: 12, rankAverage: 9000 }, reviewRequests: 0, corrections: [{ action: 'correct', before: { buildings: 13 }, after: { buildings: 12 }, reason: '計算の誤り', at: '2026-11-07T00:00:00Z' }] })) };
      }
      throw new ApiError('not_found', { status: 404 });
    },
  };
}

test('長い結果は分割し、途中で失敗しても送れた片を残して続きから送る。全片がそろって受付', async () => {
  const store = await fresh();
  const it = await item(5);
  assert.ok(it.chunkTotal >= 2, `chunks ${it.chunkTotal} (${it.bodyLength} chars)`);
  await store.put('outbox', { ...it, state: 'pending', createdAt: 1 });
  let broken = true;
  const api = fakeServer((path, body) => (broken && path === 'chunk' && body.index === 1 ? new ApiError('network', { retryable: true }) : null));
  const first = await flushOutbox({ api, store });
  assert.deepEqual(first, { accepted: 0, retryable: 1, permanent: 0 });
  const saved = await store.getOne('outbox', it.playId);
  assert.deepEqual(saved.acked, [0]);
  assert.equal(saved.lastError, 'network');
  broken = false;
  const second = await flushOutbox({ api, store });
  assert.deepEqual(second, { accepted: 1, retryable: 0, permanent: 0 });
  const sentIndexes = api.calls.filter((c) => c.path === 'chunk').map((c) => c.body.index);
  assert.equal(sentIndexes.filter((i) => i === 0).length, 1, '送れた片は送り直さない');
  assert.equal(api.results.get(it.playId).body, it.body);
  // 受付証と照会情報を保存し、送信待ちを外した
  assert.equal(await store.getOne('outbox', it.playId), undefined);
  const rec = await store.getOne('records', it.playId);
  assert.equal(rec.secret, it.secret);
  assert.equal(rec.status, 'verifying');
  assert.equal(chunkOf(it, 0).length, CHUNK_CHARS);
  store.close();
});

test('NET-09: 恒久的に拒否された1件が、ほかの送れる記録を止めない', async () => {
  const store = await fresh();
  const a = await item(1, { jitter: 1 });
  const b = await item(2, { jitter: 1 });
  await store.put('outbox', { ...a, state: 'pending', createdAt: 1 });
  await store.put('outbox', { ...b, state: 'pending', createdAt: 2 });
  const api = fakeServer((path, body) => (body.playId === a.playId ? new ApiError('result_conflict', { status: 409 }) : null));
  const r = await flushOutbox({ api, store });
  assert.deepEqual(r, { accepted: 1, retryable: 0, permanent: 1 });
  assert.equal((await store.getOne('outbox', a.playId)).state, 'permanent_failed');
  assert.ok(await store.getOne('records', b.playId));
  // 恒久的な拒否は自動で送り続けない
  const again = await flushOutbox({ api, store });
  assert.deepEqual(again, { accepted: 0, retryable: 0, permanent: 1 });
  assert.equal(api.calls.filter((c) => c.body.playId === a.playId).length, 1);
  store.close();
});

test('受付証を端末に保存できない時は、送信待ちを外さない（次の再送で同じ受付を受け取る）', async () => {
  let failRecords = true;
  const store = await fresh({ failWrites: (names) => (failRecords && names.includes('records') ? new Error('QuotaExceededError') : null) });
  const it = await item(3, { jitter: 1 });
  await store.put('outbox', { ...it, state: 'pending', createdAt: 1 });
  const api = fakeServer();
  const r = await flushOutbox({ api, store });
  assert.equal(r.accepted, 0);
  assert.ok(await store.getOne('outbox', it.playId), '送信待ちは残る');
  failRecords = false;
  const r2 = await flushOutbox({ api, store });
  assert.equal(r2.accepted, 1);
  assert.equal(api.results.size, 1, 'サーバー側の結果は1件のまま');
  store.close();
});

test('サーバーに片がそろっていない（incomplete）時は、全片を送り直す', async () => {
  const store = await fresh();
  const it = await item(4);
  await store.put('outbox', { ...it, state: 'pending', createdAt: 1 });
  let firstComplete = true;
  const api = fakeServer((path) => {
    if (path === 'complete' && firstComplete) {
      firstComplete = false;
      return new ApiError('incomplete', { retryable: true, status: 409 });
    }
    return null;
  });
  await flushOutbox({ api, store });
  assert.deepEqual((await store.getOne('outbox', it.playId)).acked, []);
  const r = await flushOutbox({ api, store });
  assert.equal(r.accepted, 1);
  store.close();
});

test('受付後は状況照会へ切り替え、訂正や状態の変化を記録して本人のホームに知らせる', async () => {
  const store = await fresh();
  await store.put('records', { playId: 'p1', secret: 's', status: 'verifying', corrections: [] });
  const updated = await refreshRecords({ api: fakeServer(), store });
  assert.equal(updated.length, 1);
  const rec = await store.getOne('records', 'p1');
  assert.equal(rec.status, 'official');
  assert.equal(rec.corrections.length, 1);
  assert.equal(rec.unseenChange, true);
  store.close();
});

test('受付済みの記録が51件あっても、すべての状況を照会できる', async () => {
  const store = await fresh();
  try {
    const playIds = Array.from({ length: 51 }, () => uuid());
    const credentials = new Map(playIds.map((playId) => [playId, randomSecret()]));
    for (const [playId, secret] of credentials) {
      await store.put('records', { playId, secret, status: 'verifying', corrections: [] });
    }
    const api = fakeServer((path, body) => {
      if (path !== 'status') return null;
      if (body.items.length > 50) return new ApiError('bad_items', { status: 400 });
      if (body.items.some(({ playId, secret }) => credentials.get(playId) !== secret)) return new ApiError('not_found', { status: 404 });
      return null;
    });
    const updated = await refreshRecords({ api, store });
    assert.deepEqual(new Set(updated.map((r) => r.playId)), new Set(playIds));
    assert.equal(updated.length, 51);
    assert.ok((await store.getAll('records')).every((r) => r.status === 'official' && r.unseenChange));
  } finally {
    store.close();
  }
});

test('outbox waits for the original destination and launch, then retains its credentials after a retryable 409', async () => {
  const store = await fresh();
  const it = { ...await item(2, { jitter: 1 }), destination: 'verify/A', launchId: uuid() };
  const launch = { launchId: it.launchId, ranked: true, playId: it.playId, sent: false };
  await store.put('outbox', it);
  await store.put('launches', launch);
  let waiting = true;
  const api = Object.assign(fakeServer(path => path === 'complete' && waiting
    ? new ApiError('launch_not_received', { retryable: true, status: 409 }) : null), { destination: 'prod/A' });
  await flushOutbox({ api, store });
  api.destination = it.destination;
  await flushOutbox({ api, store });
  assert.deepEqual(api.calls.map(call => call.path), []);
  await store.put('launches', { ...launch, sent: true });
  assert.equal((await flushOutbox({ api, store })).retryable, 1);
  const pending = await store.getOne('outbox', it.playId);
  for (const key of ['resultId','body','secret','destination']) assert.equal(pending[key], it[key]);
  waiting = false;
  assert.equal((await flushOutbox({ api, store })).accepted, 1);
  assert.equal((await store.getOne('records', it.playId)).destination, it.destination);
  store.close();
});

test('owner metrics are replaced as a unit, cleared on review or older servers and isolated by destination', async () => {
  const store = await fresh();
  const playId = 'local';
  await store.put('records', { playId, secret: 's', destination: 'prod/A' });
  await store.put('records', { playId: 'other', secret: 'x', destination: 'verify/A' });
  let status = 'official', metrics = { runRank: 3, totalPlays: 4, clearOrdinal: null };
  const api = { configured: true, destination: 'prod/A', async post(path, { items }) {
    assert.deepEqual(items, [{ playId, secret: 's' }]);
    return { items: [{ playId, status, metrics }] };
  }};
  assert.deepEqual((await refreshRecords({ api, store }))[0].metrics, metrics);
  metrics = { runRank: 2, totalPlays: 4, clearOrdinal: 5 };
  assert.deepEqual((await refreshRecords({api,store}))[0].metrics, {runRank:2,totalPlays:4,clearOrdinal:null});
  metrics = { runRank: 7, totalPlays: 4, clearOrdinal: 2 };
  assert.deepEqual((await refreshRecords({api,store}))[0].metrics, {runRank:null,totalPlays:4,clearOrdinal:null});
  metrics = undefined;
  assert.deepEqual((await refreshRecords({ api, store }))[0].metrics, { runRank: null, totalPlays: null, clearOrdinal: null });
  status = 'under_review';
  metrics = { runRank: 3, totalPlays: 4, clearOrdinal: 1 };
  assert.deepEqual((await refreshRecords({ api, store }))[0].metrics, { runRank: null, totalPlays: 4, clearOrdinal: null });
  store.close();
});

test('a late retry failure in another tab cannot recreate a settled outbox row', async () => {
  const store = await fresh();
  const it = await item(2, { jitter: 1 });
  await store.put('outbox', it);
  let arrived, release;
  const pendingComplete = new Promise(resolve => { arrived = resolve; });
  const delayed = new Promise(resolve => { release = resolve; });
  const api = fakeServer();
  const staleApi = { ...api, async post(path, body) {
    if (path !== 'complete') return api.post(path, body);
    arrived();
    await delayed;
    throw new ApiError('network', { retryable: true });
  }};
  const first = flushOutbox({ api: staleApi, store });
  await pendingComplete;
  assert.equal((await flushOutbox({ api, store })).accepted, 1);
  release();
  await first;
  assert.equal((await store.getAll('outbox')).length, 0);
  assert.equal((await store.getAll('records')).length, 1);
  store.close();
});

test('terminal launch rejection ends retries for new contracts and preserves legacy completion', async () => {
  const store = await fresh();
  const api = fakeServer();
  for (const requiresLaunch of [true, false]) {
    const it = { ...await item(2, { jitter: 1 }), requiresLaunch };
    await store.put('outbox', it);
    await store.put('launches', { launchId: it.launchId, sent: true, rejected: 'forbidden' });
    await flushOutbox({ api, store });
    if (requiresLaunch) {
      const held = await store.getOne('outbox', it.playId);
      assert.equal(held.state, 'permanent_failed');
      assert.equal(held.lastError, 'forbidden');
      assert.equal(held.secret, it.secret);
    } else {
      assert.ok(await store.getOne('records', it.playId));
    }
  }
  store.close();
});

test('a slower background status cannot overwrite a newer targeted official result or revocation', async () => {
  const store = await fresh();
  const playId = uuid();
  const destination = 'verify/A';
  await store.put('records', { playId, secret: 's', destination, status: 'verifying' });
  for (const [older, newer] of [['verifying','official'], ['official','under_review']]) {
    let arrived, release;
    const pending = new Promise(resolve => { arrived = resolve; });
    const delayed = new Promise(resolve => { release = resolve; });
    const data = status => ({ items: [{ playId, status, metrics: { totalPlays: 4, runRank: status === 'official' ? 3 : null } }] });
    const background = refreshRecords({ store, api: { configured: true, destination, async post() {
      arrived(); await delayed; return data(older);
    }}});
    await pending;
    const [current] = await refreshRecords({ store, playId, api: { configured: true, destination, post: async () => data(newer) } });
    assert.equal(current.status, newer);
    release();
    assert.deepEqual((await background).map(row => row.status), []);
    assert.equal((await store.getOne('records', playId)).status, newer);
  }
  store.close();
});

test('unsaved named finish in a live tab retries the original item and persists the owner receipt when storage recovers', async () => {
  const { App } = await import('../../src/app.js');
  const app = new App(null, { audio: {} });
  app.store = await fresh();
  app.memoryOnly = true;
  const it = { ...await item(2, { jitter: 1 }), requiresLaunch: true };
  await app.store.put('launches', { launchId: it.launchId, sent: true, destination: it.destination });
  let unavailable = true;
  app.api = fakeServer(path => path === 'complete' && unavailable
    ? new ApiError('launch_not_received', { status: 409, retryable: true }) : null);
  app.lastResult = { playId: it.playId, ranked: true };
  await app.sendUnsaved(it);
  assert.equal(app.lastResult.netState, 'retryable_failed');
  unavailable = false;
  await app.flushNetwork();
  const receipt = await app.store.getOne('records', it.playId);
  assert.equal(receipt?.secret, it.secret);
  assert.deepEqual(app.api.calls.filter(x => x.path === 'complete').map(x => x.body.resultId), [it.resultId,it.resultId]);
  app.store.close();
});

test('persisted ambiguous success can recover with the original result and owner, but an explicit refusal stays final', async () => {
  const {flushLaunches} = await import('../../src/net/start.js');
  const store = await fresh(), api = fakeServer();
  const delivered = [];
  const post = api.post.bind(api);
  api.post = async (path,body) => { if(path !== 'launch') return post(path,body); delivered.push(body); return {ok:true,counted:false}; };
  const records = [];
  for (const code of ['http_200','forbidden']) {
    const it = {...await item(),requiresLaunch:true,state:'permanent_failed',lastError:code};
    records.push(it);
    await store.put('outbox',it);
    await store.put('launches',{launchId:it.launchId,playId:it.playId,ranked:true,destination:it.destination,secret:null,gameVersion:'t',sent:true,rejected:code});
  }
  await flushLaunches(api,store);
  await flushOutbox({api,store});
  assert.deepEqual(delivered.map(x=>[x.launchId,x.secret]),[[records[0].launchId,records[0].secret]]);
  assert.equal((await store.getOne('records',records[0].playId))?.resultId,records[0].resultId);
  assert.equal((await store.getOne('outbox',records[1].playId))?.state,'permanent_failed');
  store.close();
});

test('a live named result can resend its original launch when persistent storage cannot be read', async () => {
  const {App} = await import('../../src/app.js');
  const app=new App(null,{audio:{}});
  app.store=await fresh();
  const result={...await item(),requiresLaunch:true};
  const api=fakeServer(), requests=[];
  const post=api.post.bind(api);
  api.post=async(path,body)=>{requests.push([path,body]);return path==='launch'?{ok:true,counted:false}:post(path,body);};
  app.api=api;
  await app.sendUnsaved(result);
  assert.equal(requests[0]?.[0],'launch');
  assert.deepEqual([requests[0][1].playId,requests[0][1].launchId,requests[0][1].secret],[result.playId,result.launchId,result.secret]);
  assert.equal((await app.store.getOne('records',result.playId))?.resultId,result.resultId);
  app.store.close();
});

test('a resumed named session retains its whole result while the owner information is temporarily unavailable',async()=>{
  const {App}=await import('../../src/app.js');
  const {GameSession}=await import('../../src/game/session.js');
  const {TAB_ID}=await import('../../src/storage/store.js');
  const app=new App(null,{audio:{}}), api=fakeServer();
  app.store=await fresh();app.api=api;
  const meta={playId:uuid(),launchId:uuid(),requestId:uuid(),ranked:true,name:'再開',seed:147,gameVersion:'t',requiresLaunch:true,destination:api.destination};
  const session=new GameSession(meta);
  const gen=await app.store.beginRun(TAB_ID,session.snapshot(),{...meta,sent:true});
  session.quit();
  const end=await app.persistEnd(session,gen);
  assert.equal(end.saved,true);
  assert.equal(end.result.ranked,true);
  assert.equal((await app.store.getAll('localResults')).length,0);
  const id=end.result.resultId;
  await flushOutbox({api,store:app.store});
  assert.equal(api.calls.length,0);
  const start={requestId:meta.requestId,status:'accepted',secret:randomSecret(),launchId:meta.launchId,response:{playId:meta.playId}};
  await app.store.put('starts',{...start,destination:'other'});
  await flushOutbox({api,store:app.store});
  assert.equal(api.calls.length,0);
  await app.store.put('starts',{...start,destination:meta.destination});
  await flushOutbox({api,store:app.store});
  assert.equal((await app.store.getOne('records',meta.playId))?.resultId,id);
  assert.equal(api.calls.at(-1).body.secret,start.secret);
  app.store.close();
});
