// Appを実際のDOMで動かし、連打・保存遅延・中断の競合を検査する。
// WebGLとWeb Audioの描画品質は、このDOM試験の対象外。
import test, { before, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { start } from '../../src/app.js';
import { GameSession } from '../../src/game/session.js';
import { MemoryStore } from '../../src/storage/memory-store.js';
import { TAB_ID } from '../../src/storage/store.js';
import { setLanguage, getLanguage, t } from '../../src/i18n/i18n.js';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages.js';
import { DEFAULT_AUDIO } from '../../src/audio/mixer.js';

let app, root, now;
const frames = new Map();
let frameId = 0;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setImmediate(r));
const click = (selector) => {
  const el = root.querySelector(selector);
  assert.ok(el, selector);
  el.click();
  return el;
};

before(async () => {
  const { window, document } = parseHTML('<html><head><meta name="kamereoru-env" content="production"></head><body><div id="test-root"></div></body></html>');
  Object.assign(globalThis, {
    document, Node: window.Node, requestAnimationFrame: (fn) => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id), addEventListener: window.addEventListener.bind(window),
  });
  root = document.getElementById('test-root');
  app = await start(root);
});

beforeEach(() => {
  now = 0;
  mock.method(performance, 'now', () => now);
  app.session = null;
  app.countdownActive = false;
  app.generation = 0;
  app.memoryOnly = false;
  app.takenOver = false;
  app.audio.setSettings(DEFAULT_AUDIO);
  app.store = new MemoryStore();
  document.visibilityState = 'visible';
  setLanguage('ja');
  app.showHome();
  frames.clear();
});

afterEach(() => {
  app.rerender = null;
  app.session = null;
  app.disposeStage();
  frames.clear();
  mock.restoreAll();
});

function pause() {
  app.session = new GameSession({ playId: 'ui-test', launchId: 'launch', seed: 7, ranked: false, name: '', gameVersion: 'test' });
  app.mount(document.createElement('main'));
  // 入力部品の描画は別試験。ここでは本物のセッションの再開状態を検査する。
  app.controls = { releaseAll() {}, setEnabled() {}, setValues() {}, destroy() {} };
  app.showPause('user');
}

test('home shows the deployed asset version and the default rules for new games', () => {
  const runtime = app.runtime;
  try {
    app.runtime = { ...runtime, assetVersion: '0.1.0-123456789a' };
    app.showHome();
    assert.match(root.querySelector('footer').textContent, /0\.1\.0-123456789a.*kamereoru-rules-v5/);
  } finally {
    app.runtime = runtime;
  }
});

test('first-clear date reaches the result context; a later clear keeps the original stored date', async () => {
  const clearSession = async (playId) => {
    const session = new GameSession({ playId, launchId: playId + '-launch', seed: 1, ranked: false, name: '', gameVersion: 'test' });
    const generation = await app.store.beginRun(TAB_ID, session.snapshot());
    for (let i = 0; i < 50; i++) {
      const target = session.game.course.targets[i];
      session.apply({ type: 'color', t: i * 5000, ...target, v: i < 19 ? 10000 : target.v });
      session.apply({ type: 'tick', t: (i + 1) * 5000 });
    }
    assert.equal(session.summary().endReason, 'cleared');
    return app.persistEnd(session, generation);
  };
  const first = await clearSession('first-clear');
  const savedDate = (await app.store.get('presentation.stats.v1')).firstClearAt;
  assert.equal(first.firstClearNow, true);
  assert.equal(first.firstClearAt, savedDate);
  assert.ok(Number.isSafeInteger(first.firstClearAt));
  const second = await clearSession('second-clear');
  assert.equal(second.firstClearNow, false);
  assert.equal(second.firstClearAt, null);
  assert.equal((await app.store.get('presentation.stats.v1')).firstClearAt, savedDate);
});

test('音と言語を連打しても設定は一組だけ開閉し、IDが重複しない', () => {
  pause();
  for (let n = 0; n < 20; n++) {
    const btn = click('[data-testid="pause-sound"]');
    assert.equal(root.querySelectorAll('.pause-settings').length, n % 2 === 0 ? 1 : 0);
    if (n === 19) assert.equal(btn.getAttribute('aria-expanded'), 'false');
    const ids = [...root.querySelectorAll('[id]')].map((el) => el.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.equal(app.session.running, false);
  assert.equal(app.session.state.t, 0);
});

test('閉じて開いた音量と消音の設定は現在値を保つ', async () => {
  pause();
  click('[data-testid="pause-sound"]');
  const music = root.querySelector('#vol-music');
  music.value = '0';
  music.dispatchEvent(new document.defaultView.Event('input'));
  const mute = root.querySelector('#vol-mute');
  mute.checked = true;
  mute.dispatchEvent(new document.defaultView.Event('change'));
  click('[data-testid="pause-sound"]');
  click('[data-testid="pause-sound"]');
  assert.equal(root.querySelectorAll('#vol-music').length, 1);
  assert.equal(root.querySelector('#vol-music').value, '0');
  assert.equal(root.querySelector('#vol-mute').checked, true);
  assert.equal(app.session.running, false);
  await flush();
  assert.deepEqual(await app.store.get('audio'), app.audio.settings);
});

test('停止中の言語変更は保存を待たず反映し、設定を開いたまま停止を保つ', async () => {
  pause();
  click('[data-testid="pause-sound"]');
  const saved = deferred();
  mock.method(app.store, 'set', () => saved.promise);
  const changing = app.changeLanguage('en', () => app.showPause('user', { settingsOpen: true }));
  assert.equal(root.querySelector('[data-testid="pause-resume"]').textContent, t('pause.resume', null, 'en'));
  assert.equal(root.querySelectorAll('.pause-settings').length, 1);
  assert.equal(app.session.running, false);
  saved.resolve();
  await changing;
});

test('言語の保存中にホームへ戻っても、保存完了が設定画面へ引き戻さない', async () => {
  app.showSettings();
  const saved = deferred();
  mock.method(app.store, 'set', () => saved.promise);
  const changing = app.changeLanguage('en', () => app.showSettings());
  click('.btn-back');
  saved.resolve();
  await changing;
  assert.ok(root.querySelector('.home'));
  assert.ok(!root.querySelector('.settings'));
  assert.equal(getLanguage(), 'en');
});

test('停止中の言語保存完了が再開カウントダウンを上書きしない', async () => {
  pause();
  click('[data-testid="pause-sound"]');
  const saved = deferred();
  mock.method(app.store, 'set', () => saved.promise);
  const changing = app.changeLanguage('en', () => app.showPause('user', { settingsOpen: true }));
  const resuming = app.beginCountdown();
  await flush();
  saved.resolve();
  await changing;
  assert.ok(root.querySelector('[data-testid="countdown"]'));
  assert.ok(!root.querySelector('.pause-panel'));
  now = 3100;
  for (const fn of [...frames.values()]) fn();
  await resuming;
  assert.equal(app.session.running, true);
});

test('初回とホームへの再訪で古いCSSカメレオンを挿入しない（WebGL不可でも同じ）', async () => {
  for (let i = 0; i < 5; i++) {
    app.showHome();
    assert.ok(!root.querySelector('.home-chameleon'), '最初のDOMに旧キャラクターを入れない');
    assert.ok(root.querySelector('.home-art-3d'), '読み込み前から現行モデル用の大きさを確保する');
    await flush();
    assert.ok(!root.querySelector('.home-chameleon'));
    app.showSettings();
    assert.ok(!root.querySelector('.showcase-canvas'));
  }
});

test('音声準備中に再開を連打してもカウントダウンは一つで、時計を一度だけ開始する', async () => {
  pause();
  const ready = [deferred(), deferred()];
  let calls = 0;
  mock.method(app.audio, 'prepare', () => ready[calls++].promise);
  const resuming = app.beginCountdown();
  const repeated = app.beginCountdown();
  ready[0].resolve(true);
  await flush();
  const countdown = root.querySelector('[data-testid="countdown"]');
  ready[1].resolve(true);
  await flush();
  assert.ok(root.querySelector('[data-testid="countdown"]') === countdown, '後の音声準備が先のカウントダウンを作り直さない');
  assert.equal(root.querySelectorAll('[data-testid="countdown"]').length, 1);
  now = 3100;
  for (const fn of [...frames.values()]) fn();
  await Promise.all([resuming, repeated]);
  assert.equal(app.session.running, true);
  assert.ok(!root.querySelector('[data-testid="countdown"]'));
});

test('音声準備中に画面を非表示にしたら、古い再開処理で停止画面を消さない', async () => {
  pause();
  const ready = deferred();
  mock.method(app.audio, 'prepare', () => ready.promise);
  const resuming = app.beginCountdown();
  document.visibilityState = 'hidden';
  app.onVisibility();
  ready.resolve(true);
  await flush();
  assert.ok(root.querySelector('.pause-panel'));
  assert.ok(!root.querySelector('[data-testid="countdown"]'));
  assert.equal(app.session.running, false);
  // 失敗する旧実装にも待ち合わせを残さない。
  app.countdownActive = false;
  for (const fn of [...frames.values()]) fn();
  await resuming;
});

test('15言語を実際の選択欄で切り替えても、復元したプレイの説明と設定を一組だけ保つ', async () => {
  pause();
  app.showPause('restored', { settingsOpen: true });
  for (const lang of SUPPORTED_LANGUAGES) {
    const select = root.querySelector('#lang-select');
    select.querySelector(`option[value="${lang.id}"]`).selected = true;
    select.dispatchEvent(new document.defaultView.Event('change'));
    await flush();
    assert.equal(document.documentElement.lang, lang.id);
    assert.equal(root.querySelector('.pause-panel h2').textContent, t('pause.restoredTitle', null, lang.id));
    assert.equal(root.querySelector('[data-testid="pause-resume"]').textContent, t('pause.resume', null, lang.id));
    assert.equal(root.querySelectorAll('#lang-select').length, 1);
    assert.equal(root.querySelectorAll('#vol-music').length, 1);
    assert.equal(root.querySelector('[data-testid="pause-sound"]').getAttribute('aria-expanded'), 'true');
    assert.equal(app.session.running, false);
    assert.equal(app.session.state.t, 0);
    assert.equal(await app.store.get('lang'), lang.id);
  }
});

test('言語保存の失敗はホームへ移動した後に古い通知や設定を表示しない', async () => {
  app.showSettings();
  const saved = deferred();
  mock.method(app.store, 'set', async () => { await saved.promise; throw new Error('storage denied'); });
  const changing = app.changeLanguage('en', () => app.showSettings());
  app.showHome();
  saved.resolve();
  await changing;
  assert.ok(root.querySelector('.home'));
  assert.equal(root.querySelectorAll('.toast').length, 0);
  assert.equal(getLanguage(), 'en');
});

test('中断した再開準備が遅れて完了しても、その後に始めたカウントダウンを壊さない', async () => {
  pause();
  const ready = [deferred(), deferred()];
  let calls = 0;
  mock.method(app.audio, 'prepare', () => ready[calls++].promise);
  const obsolete = app.beginCountdown();
  app.showPause('user');
  const current = app.beginCountdown();
  ready[1].resolve(true);
  await flush();
  const countdown = root.querySelector('[data-testid="countdown"]');
  assert.ok(countdown);
  ready[0].resolve(true);
  await obsolete;
  assert.ok(root.querySelector('[data-testid="countdown"]') === countdown);
  now = 3100;
  for (const fn of [...frames.values()]) fn();
  await current;
  assert.equal(app.session.running, true);
  assert.equal(root.querySelectorAll('.pause-overlay').length, 0);
});

test('再開準備中に別タブへの引き継ぎが判明したら、引き継ぎ通知を残して再開しない', async () => {
  pause();
  app.generation = await app.store.beginRun(TAB_ID, app.session.snapshot());
  await app.store.claimRun('another-tab');
  const ready = deferred();
  mock.method(app.audio, 'prepare', () => ready.promise);
  const resuming = app.beginCountdown();
  await app.saveNow('pause');
  assert.equal(app.takenOver, true);
  assert.ok(root.querySelector('.dialog-title'));
  ready.resolve(true);
  await flush();
  assert.ok(root.querySelector('.dialog-title'), '遅れた再開処理で引き継ぎ通知を消さない');
  assert.equal(root.querySelectorAll('[data-testid="countdown"]').length, 0);
  assert.equal(app.session.running, false);
  await resuming;
});

test('再開準備中に終了したセッションは、遅れた音声準備で再開画面に戻さない', async () => {
  pause();
  const ready = deferred();
  mock.method(app.audio, 'prepare', () => ready.promise);
  const resuming = app.beginCountdown();
  app.session.quit(0);
  ready.resolve(true);
  await flush();
  assert.equal(root.querySelectorAll('[data-testid="countdown"]').length, 0);
  assert.equal(app.session.running, false);
  await resuming;
});

test('再開準備中にホームへ戻る確認を開いたら、遅れた準備で確認画面を消さない', async () => {
  pause();
  const ready = deferred();
  mock.method(app.audio, 'prepare', () => ready.promise);
  const resuming = app.beginCountdown();
  click('[data-testid="pause-home"]');
  ready.resolve(true);
  await flush();
  assert.ok(root.querySelector('[data-testid="quit-confirm"]'));
  assert.equal(root.querySelectorAll('[data-testid="countdown"]').length, 0);
  assert.equal(app.session.running, false);
  await resuming;
});

test('ホームと各結果は実験場詳細へつながり、ホームに続いて上位表を1つ置く', () => {
  const url = 'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol';
  assert.equal(root.querySelector('a[data-testid="home-ranking"]')?.getAttribute('href'), url);
  mock.method(app, 'resultCardPorts', () => ({}));
  for (const [buildings, endReason] of [[0, 'detected'], [50, 'cleared']]) {
    app.lastResult = { playId: endReason, name: '', ranked: false, summary: { endReason, buildings, rankAverage: null, maxCombo: 0, score: {total: 0} } };
    app.showResult();
    assert.equal(root.querySelector('a[data-testid="result-ranking"]')?.getAttribute('href'), url);
    assert.equal(root.querySelectorAll('.result-ranking').length, 1);
    assert.ok(root.querySelector('[data-testid="result-home"]').nextElementSibling.matches('.result-ranking'));
    assert.ok(root.querySelector('.result-ranking .rank-list'));
  }
});

test('本人照会は今回の1件を取り直し、再審査では順位を外す', async () => {
  const savedApi = app.api;
  mock.method(app, 'resultCardPorts', () => ({}));
  const calls = [], playId = 'run-A-7', official = { buildings: 7, rankAverage: 8231 };
  const summary = { endReason: 'quit', buildings: 8, rankAverage: 9210, maxCombo: 2, score: { total: 880 } };
  const metrics = { runRank: 3, totalPlays: 4, clearOrdinal: null };
  let status = 'official';
  const secret = 'only-this-play';
  try {
    app.api = { configured: true, get: async () => ({version: 1, rows: [], nextAfter: null, nameCount: 0}), post: async (route, body) => {
      calls.push({ route, body });
      return { items: [{ playId, status, official: status === 'official' ? official : null, metrics: status === 'official' ? metrics : null }] };
    }};
    await app.store.put('records', { playId: 'other', secret: 'other-secret' });
    await app.store.put('records', { playId, status: 'pending_review', secret, summary });
    app.lastResult = { playId, name: 'A', ranked: true, summary };
    app.showResult();
    await app.pollResult();
    assert.deepEqual(calls, [{ route: 'status', body: { items: [{ playId, secret }] } }]);
    assert.match(root.querySelector('.result-rank').textContent, /3位／4人中/);
    assert.equal(root.querySelector('[data-testid=result-buildings]').textContent, '7 / 50');
    assert.equal(root.querySelector('[data-testid=result-average]').textContent, '82.31%');
    status = 'under_review';
    click('.result-ranking [data-testid="ranking.refresh"]');
    await flush();
    assert.doesNotMatch(root.querySelector('.result-status').textContent, /3位/);
    assert.equal(root.querySelector('.result-rank')?.textContent ?? '', '');
    status = 'official';
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'));
    await flush();
    assert.match(root.querySelector('.result-rank').textContent, /3位／4人中/);
  } finally { app.api = savedApi; }
});

test('訂正で50棟を下回ると結果の見出し・走破表示・地図が同時に更新される', () => {
  mock.method(app, 'resultCardPorts', () => ({}));
  const playId = 'reviewed-clear';
  app.lastResult = {playId, ranked:true, name:'A', firstClearNow:true, netState:'pending_review',
    summary:{buildings:50, endReason:'cleared', rankAverage:9000, maxCombo:3, score:{total:6191}}};
  app.showResult();
  assert.ok(root.querySelector('.result-screen-cleared .result-first-clear'));
  for (const buildings of [49, 0, 50]) {
    app.applyResultRecord({playId, status:buildings ? 'official' : 'no_rank', official:{buildings,rankAverage:9000},
      metrics:{runRank:buildings ? 1 : null,totalPlays:4,clearOrdinal:buildings===50 ? 1:null}});
    assert.equal(!!root.querySelector('.result-screen-cleared'), buildings === 50);
    assert.equal(root.querySelector('h1').textContent === t('result.cleared'), buildings === 50);
    assert.equal(!!root.querySelector('.result-first-clear'), buildings === 50);
    assert.equal(root.querySelectorAll('.result-map-cell.is-passed').length, buildings);
    assert.equal(root.querySelector('[data-testid=result-buildings]').textContent, buildings + ' / 50');
    assert.equal(app.lastResult.summary.buildings, 50);
  }
});

test('leaving for practice while opening storage creates neither a playable save nor a launch', async () => {
  const entered=deferred(), resume=deferred(), finished=deferred();
  const begin=app.store.beginRun.bind(app.store);
  mock.method(app.store,'beginRun',async (...args)=>{entered.resolve();await resume.promise;try{return await begin(...args);}finally{finished.resolve();}});
  const go=app.startFlow('');
  await entered.promise;
  app.showPracticeMenu();
  resume.resolve();await finished.promise;await go;await flush();
  assert.equal((await app.store.loadRun())?.status === 'active',false);
  assert.deepEqual(await app.store.getAll('launches'),[]);
  assert.equal(app.session,null);
});
