import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore, DB_VERSION } from '../../src/storage/store.js';
import { MemoryStore } from '../../src/storage/memory-store.js';
import { GameSession } from '../../src/game/session.js';
import {
  EXTRAS_KEY, MAX_PLAYS, MAX_BYTES, normalizeExtras, boundExtras, readDirector,
} from '../../src/storage/presentation-extras.js';

const mk = (memory) => (memory ? new MemoryStore() : openStore({ indexedDB: new IDBFactory() }));
const snapOf = (playId) => new GameSession({ playId, seed: 1 }).snapshot();
const st = (over = {}) => ({ count: 0, lastStartedAt: null, rngState: 12345, reservedMidpoint: true, midpointUsed: false, ...over });
async function begin(store, playId, tab = 't') {
  const generation = await store.beginRun(tab, snapOf(playId));
  return { playId, tabId: tab, generation };
}
const failKv = (names) => (names.includes('kv') ? new Error('quota') : null);

for (const memory of [false, true]) {
  const label = `memory=${memory}`;

  test(`two concurrent badge claims: only one true ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1');
    const r = await Promise.all([store.claimPrecisionBadge(c), store.claimPrecisionBadge(c)]);
    assert.deepEqual(r.slice().sort(), [false, true]);
    assert.equal(await store.claimPrecisionBadge(c), false);
    store.close?.();
  });

  test(`two concurrent cameo claims: only one true ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1');
    assert.equal(await store.claimCameoStart({ ...c, state: st() }), true);
    const next = st({ count: 1, lastStartedAt: 20000 });
    const r = await Promise.all([store.claimCameoStart({ ...c, state: next }), store.claimCameoStart({ ...c, state: next })]);
    assert.deepEqual(r.slice().sort(), [false, true]);
    assert.equal((await store.loadDirector('p1')).count, 1);
    store.close?.();
  });

  test(`stale tab, stale generation and old playId are rejected for badge and cameo ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1', 'A');
    await store.claimCameoStart({ ...c, state: st() });
    const take = await store.claimRun('B', 'p1');
    assert.equal(await store.claimPrecisionBadge(c), false);
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 1, lastStartedAt: 1000 }) }), false);
    assert.equal(await store.claimPrecisionBadge({ ...c, tabId: 'B' }), false, 'old generation with new tab');
    assert.equal(await store.claimPrecisionBadge({ playId: 'p1', tabId: 'B', generation: take.generation }), true);
    assert.equal(await store.claimPrecisionBadge({ playId: 'other', tabId: 'B', generation: take.generation }), false);
    assert.equal(await store.claimCameoStart({ playId: 'other', tabId: 'B', generation: take.generation, state: st() }), false);
    assert.equal((await store.loadDirector('p1')).count, 0);
    assert.equal(await store.loadDirector('other'), null);
    store.close?.();
  });

  test(`late write for a finished play is not adopted ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1');
    await store.endRun(c.tabId, c.generation, { playId: 'p1', ranked: false });
    assert.equal(await store.claimPrecisionBadge(c), false);
    assert.equal(await store.claimCameoStart({ ...c, state: st() }), false);
    assert.equal(await store.get(EXTRAS_KEY), undefined);
    const d = await begin(store, 'p2');
    assert.equal(await store.claimPrecisionBadge({ ...d, playId: 'p1' }), false, 'old playId against new run');
    store.close?.();
  });

  test(`resume after 5 starts adds at most one more ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1', 'A');
    assert.equal(await store.claimCameoStart({ ...c, state: st() }), true);
    let t = 20000;
    for (let n = 1; n <= 5; n += 1) {
      assert.equal(await store.claimCameoStart({ ...c, state: st({ count: n, lastStartedAt: t }) }), true);
      t += 15000;
    }
    const take = await store.claimRun('B', 'p1');
    const loaded = await store.loadDirector('p1');
    assert.equal(loaded.count, 5);
    const d = { playId: 'p1', tabId: 'B', generation: take.generation };
    // 予約を残したままの通常の6回目は許さない
    assert.equal(await store.claimCameoStart({ ...d, state: st({ count: 6, lastStartedAt: 99000 }) }), false);
    // 中間配達としての6回目は1回だけ
    const mid = st({ count: 6, lastStartedAt: 126000, reservedMidpoint: false, midpointUsed: true });
    const r = await Promise.all([store.claimCameoStart({ ...d, state: mid }), store.claimCameoStart({ ...d, state: mid })]);
    assert.deepEqual(r.slice().sort(), [false, true]);
    assert.equal(await store.claimCameoStart({ ...d, state: { ...mid, count: 7 } }), false);
    assert.equal((await store.loadDirector('p1')).count, 6);
    store.close?.();
  });

  test(`cameo state cannot regress or skip ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1');
    assert.equal(await store.claimCameoStart({ ...c, state: st() }), true);
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 2, lastStartedAt: 20000 }) }), false, 'skip');
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 1, lastStartedAt: 20000, rngState: -1 }) }), false, 'bad rng');
    assert.equal(await store.claimCameoStart({ ...c, state: { count: 1 } }), false, 'shape');
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 1, lastStartedAt: 20000, midpointUsed: true }) }), false, 'both reserved and used');
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 1, lastStartedAt: 20000 }) }), true);
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 2, lastStartedAt: 10000 }) }), false, 'lastStartedAt regress');
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 2, lastStartedAt: 40000, reservedMidpoint: false }) }), true, 'release carried by next claim');
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 3, lastStartedAt: 60000, reservedMidpoint: true }) }), false, 're-reserve');
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 3, lastStartedAt: 60000, reservedMidpoint: false, midpointUsed: true }) }), false, 'use without reservation');
    store.close?.();
  });

  test(`write refusal keeps result storage working and does not adopt the claim ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1');
    await store.claimCameoStart({ ...c, state: st() });
    store.failWrites = failKv;
    assert.equal(await store.claimPrecisionBadge(c), false);
    assert.equal(await store.claimCameoStart({ ...c, state: st({ count: 1, lastStartedAt: 20000 }) }), false);
    store.failWrites = null;
    assert.equal((await store.loadDirector('p1')).count, 0);
    await store.saveRun(c.tabId, c.generation, snapOf('p1'));
    await store.endRun(c.tabId, c.generation, { playId: 'p1', ranked: true, score: 5 });
    const out = await store.getAll('outbox');
    assert.equal(out.length, 1);
    assert.equal(out[0].score, 5);
    // 取得失敗の枠は消費済みのまま。次の状態は count+2 になり、保存側は拒否する。
    const d = await begin(store, 'p2');
    await store.claimCameoStart({ ...d, state: st() });
    store.failWrites = failKv;
    assert.equal(await store.claimCameoStart({ ...d, state: st({ count: 1, lastStartedAt: 20000 }) }), false);
    store.failWrites = null;
    assert.equal(await store.claimCameoStart({ ...d, state: st({ count: 2, lastStartedAt: 40000 }) }), false);
    store.close?.();
  });

  test(`corrupt stored value is treated as empty and results still save ${label}`, async () => {
    const store = await mk(memory);
    const c = await begin(store, 'p1');
    for (const bad of ['garbage', 42, null, { version: 2, plays: [] }, { version: 1, plays: 'x' }, { version: 1, plays: [{ playId: 5 }, null, { playId: 'p1', badge: 'yes', director: 7 }] }]) {
      await store.set(EXTRAS_KEY, bad);
      assert.equal(await store.loadDirector('p1'), null);
    }
    await store.set(EXTRAS_KEY, 'garbage');
    assert.equal(await store.claimPrecisionBadge(c), true);
    assert.equal(await store.claimPrecisionBadge(c), false);
    await store.endRun(c.tabId, c.generation, { playId: 'p1', ranked: true, score: 1 });
    assert.equal((await store.getAll('outbox')).length, 1);
    store.close?.();
  });

  test(`oldest plays are dropped beyond ${MAX_PLAYS} playIds ${label}`, async () => {
    const store = await mk(memory);
    for (let i = 0; i < MAX_PLAYS + 8; i += 1) {
      const c = await begin(store, `play-${i}`);
      assert.equal(await store.claimCameoStart({ ...c, state: st() }), true);
      await store.endRun(c.tabId, c.generation, { playId: c.playId, ranked: false });
    }
    const raw = await store.get(EXTRAS_KEY);
    assert.equal(raw.plays.length, MAX_PLAYS);
    assert.equal(raw.plays[0].playId, `play-${MAX_PLAYS + 7}`);
    assert.equal(await store.loadDirector('play-0'), null);
    assert.equal(await store.loadDirector('play-7'), null);
    assert.notEqual(await store.loadDirector('play-8'), null);
    assert.ok(new TextEncoder().encode(JSON.stringify(raw)).length <= MAX_BYTES);
    store.close?.();
  });

  test(`saved values keep other stores, DB version and snapshots untouched ${label}`, async () => {
    const store = await mk(memory);
    await store.set('localBest', { passed: 3 });
    await store.set('presentation.stats.v1', { version: 1, x: 1 });
    await store.put('outbox', { playId: 'old', state: 'pending', attempts: 2 });
    await store.put('localResults', { playId: 'old2', score: 9 });
    const c = await begin(store, 'p1');
    const before = {
      run: await store.loadRun(), outbox: await store.getAll('outbox'), local: await store.getAll('localResults'),
      best: await store.get('localBest'), stats: await store.get('presentation.stats.v1'),
      names: memory ? null : [...store.db.objectStoreNames].sort(),
    };
    await store.claimCameoStart({ ...c, state: st() });
    await store.claimCameoStart({ ...c, state: st({ count: 1, lastStartedAt: 20000 }) });
    await store.claimPrecisionBadge(c);
    assert.deepEqual(await store.loadRun(), before.run);
    assert.deepEqual(await store.getAll('outbox'), before.outbox);
    assert.deepEqual(await store.getAll('localResults'), before.local);
    assert.deepEqual(await store.get('localBest'), before.best);
    assert.deepEqual(await store.get('presentation.stats.v1'), before.stats);
    assert.deepEqual((await store.get(EXTRAS_KEY)).plays.map((p) => Object.keys(p).sort()), [['at', 'badge', 'director', 'playId']]);
    assert.equal(DB_VERSION, 1);
    if (!memory) {
      assert.equal(store.db.version, 1);
      assert.deepEqual([...store.db.objectStoreNames].sort(), before.names);
    }
    store.close?.();
  });
}

test('readDirector, normalizeExtras and boundExtras are pure and strict', () => {
  const play = (i, extra = {}) => ({ playId: `p${i}`, at: 1000 + i, badge: false, director: null, ...extra });
  const n = normalizeExtras({ version: 1, plays: [play(1, { discovered: [1, 2], seen: true }), play(1), play(2, { director: st({ count: 3, lastStartedAt: 5 }) }), play(3, { director: { count: 9 } })] });
  assert.deepEqual(n.plays.map((p) => p.playId), ['p2', 'p1'], 'newest first, duplicates and invalid dropped');
  assert.equal(Object.hasOwn(n.plays[1], 'discovered'), false);
  assert.equal(readDirector(n, 'p2').count, 3);
  assert.equal(readDirector(n, 'p1'), null);
  assert.equal(readDirector(n, 'zzz'), null);
  const many = { version: 1, plays: Array.from({ length: 50 }, (_, i) => play(100 - i, { playId: 'x'.repeat(100) + i })) };
  assert.equal(boundExtras(many).plays.length, MAX_PLAYS);
  assert.equal(boundExtras(many).plays[0].at, 1100);
  const small = boundExtras(many, { maxBytes: 1500 });
  assert.ok(new TextEncoder().encode(JSON.stringify(small)).length <= 1500);
  assert.ok(small.plays.length >= 1 && small.plays.length < MAX_PLAYS);
  assert.equal(small.plays[0].playId, many.plays[0].playId, 'drops oldest first');
});
