// showGame が作る表示用保存の入口（extrasPort）の試験。保存先の選び方、初期状態の保存、失敗の無影響、待たないこと。
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { IDBFactory } from 'fake-indexeddb';
import { App } from '../../src/app.js';
import { GameSession } from '../../src/game/session.js';
import { MemoryStore } from '../../src/storage/memory-store.js';
import { openStore, TAB_ID } from '../../src/storage/store.js';
import { EXTRAS_KEY } from '../../src/storage/presentation-extras.js';
import { setLanguage } from '../../src/i18n/i18n.js';

let app;
const frames = new Map();
let id = 0;
let ports = [];
const st = (over = {}) => ({ count: 0, lastStartedAt: null, rngState: 7, reservedMidpoint: true, midpointUsed: false, ...over });

function setup(store) {
  const { window, document } = parseHTML('<html><head></head><body><main id="root"></main></body></html>');
  Object.assign(globalThis, { document, Node: window.Node, requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; }, cancelAnimationFrame: (n) => frames.delete(n), addEventListener: () => {} });
  const audio = { settings: {}, setMusic() {}, setSettings() {}, setBuilding() {}, setArea() {}, setFinale() {}, setPoliceStage() {}, setDanger() {}, startGameAudio() {}, stopGameAudio() {}, stopSfx() {}, async suspend() {}, play() { return true; } };
  ports = [];
  app = new App(document.querySelector('#root'), {
    audio,
    stageFactory: async (_box, opts) => { ports.push(opts.extrasPort); return { dispose() {}, resize() {}, update() {}, presentationEvent() {}, setBestDistance() {}, fx() {} }; },
  });
  setLanguage('ja');
  app.store = store;
  app.flags = { openingSeen: true, alertGuideSeen: true };
  app.initializeGuides = async () => ({ version: 1, basic: { consumed: true }, brightness: { consumed: true } });
  app.runtime = { ...app.runtime, isVerification: false };
  app.api = { configured: false };
  app.generation = 0;
  app.memoryOnly = false;
  return app;
}
const newSession = (playId = 'p1') => new GameSession({ playId, seed: 42, ranked: false });
const memoryStore = () => new MemoryStore();
const idbStore = () => openStore({ indexedDB: new IDBFactory() });
const pending = () => new Promise(() => {});

afterEach(() => { app?.disposeStage(); app = null; frames.clear(); });

test('fresh play with no generation gets a memory port and an initial count 0 state', async () => {
  setup(memoryStore());
  const session = newSession();
  await app.showGame(session, { fresh: true });
  const port = ports[0];
  assert.ok(port);
  assert.equal(port.playId, 'p1');
  assert.equal(port.fresh, true);
  assert.equal(port.memory, true);
  assert.equal(await port.ready, true);
  const loaded = await port.loadDirector();
  assert.equal(loaded.count, 0);
  assert.equal(loaded.reservedMidpoint, true);
  assert.equal(await port.claimCameoStart(st({ count: 0 })), false, 're-initialization refused');
  assert.equal(await port.claimCameoStart({ ...loaded, count: 1, lastStartedAt: 20000 }), true);
  assert.equal(await port.claimCameoStart({ ...loaded, count: 1, lastStartedAt: 20000 }), false);
  assert.equal(port.disabled, true);
  assert.equal(await port.claimPrecisionBadge(), true);
  assert.equal(await port.claimPrecisionBadge(), false);
  assert.equal(app.store.kv.get(EXTRAS_KEY), undefined, 'memory port does not write the device store');
});

test('fresh play with a generation stores count 0 and keeps its store when memoryOnly turns true', async () => {
  const store = await idbStore();
  setup(store);
  const session = newSession();
  app.generation = await store.beginRun(TAB_ID, session.snapshot());
  await app.showGame(session, { fresh: true });
  const port = ports[0];
  assert.equal(port.memory, false);
  assert.equal(await port.ready, true);
  assert.equal((await store.loadDirector('p1')).count, 0);
  app.memoryOnly = true; // 本編の保存が失敗したあと
  assert.equal(await port.claimPrecisionBadge(), true);
  assert.equal(await port.claimPrecisionBadge(), false);
  assert.equal((await store.get(EXTRAS_KEY)).plays[0].badge, true, 'still the device store');
  assert.equal(await port.claimCameoStart({ ...(await port.loadDirector()), count: 1, lastStartedAt: 20000 }), true);
  assert.equal((await store.loadDirector('p1')).count, 1);
  store.close();
});

test('resume loads the saved state after claimRun and does not save count 0 again', async () => {
  const store = await idbStore();
  setup(store);
  const session = newSession();
  const gen0 = await store.beginRun('A', session.snapshot());
  assert.equal(await store.claimCameoStart({ playId: 'p1', tabId: 'A', generation: gen0, state: st() }), true);
  assert.equal(await store.claimCameoStart({ playId: 'p1', tabId: 'A', generation: gen0, state: st({ count: 1, lastStartedAt: 20000 }) }), true);
  assert.equal(await store.claimCameoStart({ playId: 'p1', tabId: 'A', generation: gen0, state: st({ count: 2, lastStartedAt: 40000 }) }), true);
  const claimed = await store.claimRun(TAB_ID, 'p1');
  app.generation = claimed.generation;
  await app.showGame(GameSession.fromSnapshot(claimed.snapshot).session, { fresh: false });
  const port = ports[0];
  assert.equal(port.fresh, false);
  assert.equal(port.memory, false);
  assert.equal(port.restored.count, 2);
  assert.equal(port.disabled, false);
  assert.equal(await port.ready, true);
  assert.equal((await store.loadDirector('p1')).count, 2, 'no re-initialization');
  assert.equal(await port.claimCameoStart(st({ count: 3, lastStartedAt: 60000 })), true);
  store.close();
});

test('resume without a saved state disables new cameos and writes nothing', async () => {
  const store = await idbStore();
  setup(store);
  const session = newSession();
  await store.beginRun('A', session.snapshot());
  const claimed = await store.claimRun(TAB_ID, 'p1');
  app.generation = claimed.generation;
  await app.showGame(GameSession.fromSnapshot(claimed.snapshot).session, { fresh: false });
  const port = ports[0];
  assert.equal(port.restored, null);
  assert.equal(port.disabled, true);
  assert.equal(await store.get(EXTRAS_KEY), undefined);
  store.close();
});

test('a non-fresh play without a generation uses the memory port and starts disabled', async () => {
  setup(memoryStore());
  await app.showGame(newSession(), { fresh: false });
  const port = ports[0];
  assert.equal(port.memory, true);
  assert.equal(port.fresh, false);
  assert.equal(port.disabled, true);
  assert.equal(await port.claimPrecisionBadge(), true);
});

test('a false claim changes no save state, warning or stored result', async () => {
  const store = await idbStore();
  setup(store);
  const session = newSession();
  app.generation = await store.beginRun(TAB_ID, session.snapshot());
  await app.showGame(session, { fresh: true });
  const port = ports[0];
  await port.ready;
  await store.claimRun('other', 'p1'); // 別のタブが引き継いだ
  const before = { run: await store.loadRun(), outbox: await store.getAll('outbox'), local: await store.getAll('localResults'), extras: await store.get(EXTRAS_KEY) };
  app.saveWarned = false;
  app.takenOver = false;
  assert.equal(await port.claimPrecisionBadge(), false);
  assert.equal(await port.claimCameoStart(st({ count: 1, lastStartedAt: 20000 })), false);
  assert.equal(app.memoryOnly, false);
  assert.equal(app.saveWarned, false);
  assert.equal(app.takenOver, false);
  assert.equal(app.layer.querySelectorAll('.toast').length, 0);
  assert.deepEqual({ run: await store.loadRun(), outbox: await store.getAll('outbox'), local: await store.getAll('localResults'), extras: await store.get(EXTRAS_KEY) }, before);
  store.close();
});

test('a screen that is no longer current gets false and writes nothing', async () => {
  const store = await idbStore();
  setup(store);
  const session = newSession();
  app.generation = await store.beginRun(TAB_ID, session.snapshot());
  await app.showGame(session, { fresh: true });
  const port = ports[0];
  await port.ready;
  app.showHome(); // 画面を離れる
  assert.equal(await port.claimPrecisionBadge(), false);
  assert.equal((await store.get(EXTRAS_KEY)).plays[0].badge, false);
  store.close();
});

test('showGame and the end save do not wait for extras claims', async () => {
  const store = await idbStore();
  setup(store);
  store.claimCameoStart = pending;
  store.claimPrecisionBadge = pending;
  const session = newSession();
  app.generation = await store.beginRun(TAB_ID, session.snapshot());
  await app.showGame(session, { fresh: true }); // 初期状態の取得が止まっていても戻る
  const port = ports[0];
  const stuck = port.claimPrecisionBadge();
  const done = await Promise.race([app.persistEnd(session, app.generation), new Promise((r) => setTimeout(() => r('timeout'), 1500))]);
  assert.notEqual(done, 'timeout');
  assert.equal(done.saved, true);
  assert.equal((await store.getAll('localResults')).length, 1);
  assert.equal(await Promise.race([stuck, Promise.resolve('still pending')]), 'still pending');
  store.close();
});
