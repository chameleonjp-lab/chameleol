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
