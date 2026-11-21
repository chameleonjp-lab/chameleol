import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openTimeAttackStore, TIME_ATTACK_DB } from '../../src/storage/time-attack-store.js';
import { StaleTimeAttackWriter } from '../../src/storage/time-attack-memory-store.js';

const launch = id => ({ id, body: { launchId: id } });
const owner = (attemptId, ownerEpoch) => ({ attemptId, ownerEpoch });
const receipt = (id, elapsedCs, reason = 'cleared') => ({ id, result: { reason, elapsedCs } });

test('TA uses its own database and count boundary; cancelling before commit leaves no launch', async () => {
  const idb = new IDBFactory();
  const store = await openTimeAttackStore(idb);
  const pending = new AbortController();
  const begin = store.begin(launch('a'), owner('a', 1), pending.signal);
  pending.abort();
  await assert.rejects(begin);
  assert.equal((await store.getAll('launches')).length, 0);
  await store.begin(launch('b'), owner('b', 2), new AbortController().signal);
  store.close();
  assert.deepEqual((await idb.databases()).map(db => db.name), [TIME_ATTACK_DB]);
  const reopened = await openTimeAttackStore(idb);
  assert.deepEqual((await reopened.getAll('launches')).map(item => item.id), ['b']);
  reopened.close();
});

test('stale writer cannot finish over a newer one; result and upload commit with the best together', async () => {
  const idb = new IDBFactory();
  const a = await openTimeAttackStore(idb);
  const b = await openTimeAttackStore(idb);
  const signal = new AbortController().signal;
  await a.begin(launch('a'), owner('a', 1), signal);
  await b.begin(launch('b'), owner('b', 2), signal);
  await assert.rejects(a.finish(owner('a', 1), receipt('a', 1500), { id: 'a' }), StaleTimeAttackWriter);
  const published = await b.finish(owner('b', 2), receipt('b', 3000), { id: 'b' });
  assert.deepEqual(published, { bestElapsedCs: 3000, newBest: true });
  await a.begin(launch('c'), owner('c', 3), signal);
  const slower = await a.finish(owner('c', 3), receipt('c', 4000), null);
  assert.deepEqual(slower, { bestElapsedCs: 3000, newBest: false });
  assert.deepEqual((await a.getAll('launches')).map(row => row.id), ['a','b','c']);
  assert.deepEqual((await a.getAll('records')).map(row => row.id), ['b','c']);
  assert.deepEqual((await a.getAll('outbox')).map(row => row.id), ['b']);
  a.close(); b.close();
});
