import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
// 操作部品（createControls）と画面制御（App）の統合音声テスト：
// - 問題B：通常練習（basic / brightness）および4段階ガイド練習（1〜4）の実起動と操作音
// - 問題D：単発タップ時の touchPalette / touchBar と colorStep の非重複、同色タップ後のドラッグ、2本指同時操作、取消時の colorRelease 抑止
// - 問題E：音の準備（wakeMenuAudio）待ち中の画面遷移による古い操作音の破棄、背景復帰後の最初の操作音補完、消音・連打抑止時の不要な再準備防止
import test from 'node:test';
import assert from 'node:assert/strict';

// Node テスト環境向けの最小 DOM シム（linkedom 等の外部パッケージに依存せず createControls / App を動かす）
function installMinimalDom() {
  class MiniEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
  }

  class MiniNode {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
    }
    get firstChild() {
      return this.childNodes[0] ?? null;
    }
    get isConnected() {
      let cur = this;
      while (cur.parentNode) cur = cur.parentNode;
      return cur === globalThis.document?.body || cur === globalThis.document?.documentElement;
    }
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    append(...items) {
      for (const item of items) {
        if (item == null || item === false) continue;
        this.appendChild(item instanceof MiniNode ? item : new MiniText(String(item)));
      }
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
  }

  class MiniText extends MiniNode {
    constructor(text = '') {
      super();
      this.nodeValue = String(text);
    }
    get textContent() {
      return this.nodeValue;
    }
    set textContent(v) {
      this.nodeValue = String(v ?? '');
    }
  }

  class MiniClassList {
    constructor(el) {
      this.el = el;
      this.set = new Set();
    }
    syncFrom(str) {
      this.set = new Set(String(str || '').split(/\s+/).filter(Boolean));
    }
    toString() {
      return [...this.set].join(' ');
    }
    add(...names) {
      for (const n of names) if (n) this.set.add(n);
    }
    remove(...names) {
      for (const n of names) this.set.delete(n);
    }
    toggle(name, force) {
      const on = force === undefined ? !this.set.has(name) : Boolean(force);
      if (on) this.set.add(name);
      else this.set.delete(name);
      return on;
    }
    contains(name) {
      return this.set.has(name);
    }
  }

  function matchesSelector(el, sel) {
    if (!(el instanceof MiniElement)) return false;
    const parts = sel.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts.some((p) => matchesSelector(el, p));
    const s = parts[0];
    if (!s) return false;
    if (s.includes(' ')) {
      const tokens = s.split(/\s+/);
      if (!matchesSelector(el, tokens.at(-1))) return false;
      let cur = el.parentNode;
      for (let i = tokens.length - 2; i >= 0; i -= 1) {
        while (cur && !matchesSelector(cur, tokens[i])) cur = cur.parentNode;
        if (!cur) return false;
        cur = cur.parentNode;
      }
      return true;
    }
    const attrMatch = s.match(/^([a-z0-9_-]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/i);
    if (attrMatch) {
      const [, tag, attrName, attrVal] = attrMatch;
      if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      const actual = el.getAttribute(attrName);
      return attrVal === undefined ? actual !== null : actual === attrVal;
    }
    if (s.startsWith('.')) return s.slice(1).split('.').filter(Boolean).every((c) => el.classList.contains(c));
    if (s.startsWith('#')) return el.id === s.slice(1);
    return el.tagName.toLowerCase() === s.toLowerCase();
  }

  class MiniElement extends MiniNode {
    constructor(tagName) {
      super();
      this.tagName = String(tagName).toUpperCase();
      this.attributes = new Map();
      this.style = {};
      this.dataset = {};
      this.hidden = false;
      this.disabled = false;
      this.value = '';
      this.listeners = new Map();
      this._classList = new MiniClassList(this);
      this._rect = { left: 0, top: 0, width: 240, height: 240 };
    }
    get className() {
      return this._classList.toString();
    }
    set className(v) {
      this._classList.syncFrom(v);
    }
    get classList() {
      return this._classList;
    }
    get id() {
      return this.attributes.get('id') ?? '';
    }
    set id(v) {
      this.setAttribute('id', v);
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(new MiniText(String(v)));
    }
    setAttribute(k, v) {
      const val = String(v);
      this.attributes.set(k, val);
      if (k === 'class') this._classList.syncFrom(val);
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = val;
      }
    }
    getAttribute(k) {
      if (k === 'class') return this.className || null;
      return this.attributes.has(k) ? this.attributes.get(k) : null;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    dispatchEvent(ev) {
      if (!ev.target) ev.target = this;
      const set = this.listeners.get(ev.type);
      if (set) {
        for (const fn of [...set]) fn(ev);
      }
      if (this.parentNode && typeof this.parentNode.dispatchEvent === 'function') {
        this.parentNode.dispatchEvent(ev);
      }
      return !ev.defaultPrevented;
    }
    click() {
      this.dispatchEvent(new MiniEvent('click', { target: this }));
    }
    closest(sel) {
      let cur = this;
      while (cur && cur instanceof MiniElement) {
        if (matchesSelector(cur, sel)) return cur;
        cur = cur.parentNode;
      }
      return null;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    }
    querySelectorAll(sel) {
      const out = [];
      const visit = (node) => {
        for (const child of node.childNodes) {
          if (child instanceof MiniElement) {
            if (matchesSelector(child, sel)) out.push(child);
            visit(child);
          }
        }
      };
      visit(this);
      return out;
    }
    getBoundingClientRect() {
      if (this.classList.contains('palette')) return { left: 30, top: 30, width: 240, height: 240 };
      if (this.classList.contains('bar')) return { left: 320, top: 30, width: 52, height: 240 };
      return this._rect;
    }
    getContext() {
      return {
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {},
      };
    }
    setPointerCapture() {}
    releasePointerCapture() {}
    get offsetWidth() {
      return 100;
    }
  }

  const docListeners = new Map();
  const body = new MiniElement('body');
  const document = {
    body,
    documentElement: body,
    hidden: false,
    visibilityState: 'visible',
    baseURI: 'http://127.0.0.1:5173/',
    createElement: (tag) => new MiniElement(tag),
    createTextNode: (text) => new MiniText(text),
    getElementById: (id) => body.querySelector(`#${id}`),
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    dispatchEvent(ev) {
      const set = docListeners.get(ev.type);
      if (set) for (const fn of [...set]) fn(ev);
    },
  };

  globalThis.Node = MiniNode;
  globalThis.Element = MiniElement;
  globalThis.Event = MiniEvent;
  globalThis.document = document;
  globalThis.navigator ??= { language: 'ja', languages: ['ja'] };
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  return { MiniEvent, document, body };
}

installMinimalDom();

const { createControls } = await import('../../src/ui/controls.js');
const { App } = await import('../../src/app.js');
const { pointFromHs } = await import('../../src/rules/v1/index.js');

const PALETTE_GEO = { cx: 150, cy: 150, r: 120 };
const atPalette = (h, s) => {
  const p = pointFromHs(h, s, PALETTE_GEO.r);
  return [PALETTE_GEO.cx + p.dx, PALETTE_GEO.cy + p.dy];
};

function createFakeStageFactory() {
  return async () => ({
    showPractice() {},
    renderPractice() {},
    update() {},
    resize() {},
    fx() {},
    presentationEvent() {},
    setBestDistance() {},
    async playOpening({ onCue }) {
      onCue('alarm');
      onCue('glassBurst');
      onCue('jump');
      onCue('land');
      onCue('jewel');
    },
    async playEnding() {},
    dispose() {},
  });
}

function createFakeAudio({ initiallyRunning = true } = {}) {
  const events = [];
  let running = initiallyRunning;
  let muted = false;
  let sfx = 0.7;
  let music = null;
  let building = 1;
  let finale = false;
  let prepareCalls = 0;
  let pendingMode = 'auto';
  const pendingWaiters = [];

  return {
    events,
    get available() {
      return true;
    },
    get running() {
      return running;
    },
    set running(v) {
      running = v;
    },
    get music() {
      return music;
    },
    get building() {
      return building;
    },
    get finale() {
      return finale;
    },
    get prepareCalls() {
      return prepareCalls;
    },
    get settings() {
      return { music: 0.45, sfx, ambient: 0.35, muted };
    },
    setSettings(next) {
      if (typeof next.muted === 'boolean') muted = next.muted;
      if (typeof next.sfx === 'number') sfx = next.sfx;
      return this.settings;
    },
    prepare() {
      prepareCalls += 1;
      if (pendingMode === 'manual') {
        return new Promise((resolve, reject) => {
          pendingWaiters.push({ resolve, reject });
        });
      }
      if (pendingMode === 'returnFalse') {
        running = false;
        return Promise.resolve(false);
      }
      if (pendingMode === 'reject') {
        running = false;
        return Promise.reject(new Error('audio prepare failed'));
      }
      if (running) return Promise.resolve(true);
      running = true;
      return Promise.resolve(true);
    },
    deferNextPrepare() {
      running = false;
      pendingMode = 'manual';
    },
    setPrepareMode(mode) {
      running = mode === 'auto';
      pendingMode = mode;
    },
    _resolvePrepare(ok = true) {
      pendingMode = 'auto';
      running = Boolean(ok);
      const waiters = pendingWaiters.splice(0);
      for (const w of waiters) w.resolve(ok);
    },
    _rejectPrepare(err = new Error('audio prepare failed')) {
      pendingMode = 'auto';
      running = false;
      const waiters = pendingWaiters.splice(0);
      for (const w of waiters) w.reject(err);
    },
    setMusic(next) {
      music = next;
    },
    startGameAudio() {
      music = 'game';
    },
    stopGameAudio() {
      music = null;
    },
    stopSfx() {
      events.push('stopSfx');
    },
    async suspend() {
      running = false;
      music = null;
    },
    setPoliceStage() {},
    setDanger() {},
    setFinale(on) {
      finale = !!on;
    },
    setBuilding(b) {
      building = b;
    },
    setArea() {},
    play(name, opts) {
      if (!running || muted || sfx <= 0) return false;
      events.push({ name, opts });
      return true;
    },
    dispose() {},
  };
}

test('【問題D修正検証】createControls：指を動かさない単発タップでは touchPalette / touchBar のみ鳴り、colorStep は重複しない（同色タップ・2本指・取消を含む）', () => {
  const events = [];
  const controls = createControls({
    onChange: () => {},
    onLockedTap: () => events.push('locked'),
    onPartDown: (part) => events.push(part === 'bar' ? 'touchBar' : 'touchPalette'),
    onPartUp: (_part, changed) => {
      if (changed) events.push('colorRelease');
    },
    onColorStep: (_c, part) => events.push(`colorStep:${part}`),
  });
  controls.layout();
  controls.setLocked(false);

  // 1. パレットへ1回触れるだけ（色が大きく変わる位置でも phase==='down' のため colorStep は鳴らない）
  const [x1, y1] = atPalette(9000, 6000);
  controls.router.down(1, x1, y1);
  assert.deepEqual(events, ['touchPalette'], 'パレット単発タップ時は touchPalette のみで colorStep は鳴らない');
  controls.router.up(1);
  assert.deepEqual(events, ['touchPalette', 'colorRelease'], '指を離すと colorRelease が鳴る');

  // 2. バーへ1回触れるだけ（明度が大きく変わる位置でも touchBar のみで colorStep は鳴らない）
  events.length = 0;
  controls.router.down(2, 346, 180);
  assert.deepEqual(events, ['touchBar'], 'バー単発タップ時は touchBar のみで colorStep は鳴らない');
  controls.router.up(2);
  assert.deepEqual(events, ['touchBar', 'colorRelease']);

  // 3. 同じ色の位置をタップ（down で onChange が発火しない条件）→ そのままドラッグすると初回移動から colorStep が鳴る
  events.length = 0;
  controls.router.down(3, x1, y1); // 既に h=9000, s=6000 なので onChange は発火しない
  assert.deepEqual(events, ['touchPalette']);
  const [x2, y2] = atPalette(15000, 6000); // 色相+60度ドラッグ
  controls.router.move(3, x2, y2);
  assert.deepEqual(events, ['touchPalette', 'colorStep:palette'], '同色タップ後のドラッグで colorStep が欠落せず鳴る');
  controls.router.up(3);
  assert.deepEqual(events, ['touchPalette', 'colorStep:palette', 'colorRelease']);

  // 4. 2本指同時・交互操作（パレット保持中にバーを押し始めても colorStep が誤発火しない）
  events.length = 0;
  controls.router.down(10, ...atPalette(18000, 6000));
  controls.router.down(11, 346, 60);
  assert.deepEqual(events, ['touchPalette', 'touchBar'], '2本指それぞれの押し始めで colorStep は鳴らない');
  controls.router.move(10, ...atPalette(24000, 6000));
  controls.router.move(11, 346, 220);
  assert.deepEqual(events, ['touchPalette', 'touchBar', 'colorStep:palette', 'colorStep:bar']);
  controls.router.cancel(10); // 10番は取消
  controls.router.up(11); // 11番は通常離し
  assert.deepEqual(
    events,
    ['touchPalette', 'touchBar', 'colorStep:palette', 'colorStep:bar', 'colorRelease'],
    'cancel された指では colorRelease が鳴らず、通常離しの指だけ鳴る',
  );
  controls.destroy();
});

test('【問題B修正検証】App の通常練習（basic / brightness）および4段階ガイド練習（1〜4）がエラーなく起動・進行し、音が鳴る', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const audio = createFakeAudio({ initiallyRunning: true });
  const app = new App(root, { audio, stageFactory: createFakeStageFactory() });
  await app.boot();

  // 1. 通常練習（basic）の起動と操作音
  audio.events.length = 0;
  await app.startPractice('basic');
  assert.ok(app.controls, '通常練習(basic)で controls が生成される');
  assert.equal(audio.music, 'practice');
  app.controls.router.down(1, ...atPalette(9000, 6000));
  app.controls.router.up(1);
  assert.deepEqual(
    audio.events.map((e) => e.name),
    ['confirm', 'touchPalette', 'colorRelease'],
    '通常練習(basic)で単発タップ時に confirm -> touchPalette -> colorRelease が鳴り colorStep は重複しない',
  );

  // 2. 通常練習（brightness）の起動とバー操作音
  audio.events.length = 0;
  await app.startPractice('brightness');
  app.controls.router.down(2, 346, 180);
  app.controls.router.up(2);
  assert.deepEqual(
    audio.events.map((e) => e.name),
    ['confirm', 'touchBar', 'colorRelease'],
    '通常練習(brightness)でバー単発タップ時に confirm -> touchBar -> colorRelease が鳴る',
  );

  // 3. ガイド練習4段階（step 1〜4）のすべてが起動し、達成時に guideClear が鳴る
  for (const step of [1, 2, 3, 4]) {
    audio.events.length = 0;
    const gp = await app.startGuidePractice(step);
    assert.ok(gp, `ガイド練習 step=${step} が起動する`);
    const target = gp.view().target;
    app.controls.onChange?.(target);
    gp.setColor(target);
    gp.tick(1000);
    // 移動ガイド（step 2, 4）は5秒経過で完了
    if (step % 2 === 0) gp.tick(5000);
    // render をトリガーするために微調整
    const p1 = atPalette(target.h, target.s);
    app.controls.router.down(step, p1[0], p1[1]);
    app.controls.router.up(step);
    assert.ok(
      audio.events.some((e) => e.name === 'guideClear'),
      `ガイド練習 step=${step} の達成時に guideClear が鳴る`,
    );
  }
});

test('【問題E修正検証】音の準備待ち中に画面が変わった場合は古い操作音を破棄し、同じ画面なら補完し、running中は不要な再準備を呼ばない', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const audio = createFakeAudio({ initiallyRunning: true });
  const app = new App(root, { audio, stageFactory: createFakeStageFactory() });
  await app.boot();
  await app.startPractice('basic');

  // 1. 背景から復帰直後など audio.running === false の状態でパレット操作 → 準備完了前にホーム画面へ遷移
  audio.events.length = 0;
  audio.deferNextPrepare();
  app.controls.router.down(1, ...atPalette(9000, 6000));
  assert.equal(audio.events.length, 0, 'まだ prepare 未完了なので鳴っていない');
  // 準備完了前にホームへ画面遷移
  app.showHome();
  audio._resolvePrepare(true);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    audio.events.filter((e) => e.name === 'touchPalette').length,
    0,
    '画面遷移後に準備が完了しても、前の練習画面の古い touchPalette は鳴らさない',
  );

  // 2. 同じ練習画面に留まったまま準備が完了した場合は、最初の有効な操作音を補える
  await app.startPractice('basic');
  audio.events.length = 0;
  audio.deferNextPrepare();
  app.controls.router.down(2, ...atPalette(18000, 6000));
  audio._resolvePrepare(true);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(
    audio.events.map((e) => e.name),
    ['touchPalette'],
    '同じ画面に留まっている場合は準備完了後に最初の touchPalette を補完する',
  );

  // 3. audio.running === true の状態で消音（muted=true）により play() が false を返しても、wakeMenuAudio / prepare を再試行しない
  audio.setSettings({ muted: true });
  const preparesBefore = audio.prepareCalls;
  app.controls.router.down(3, ...atPalette(27000, 6000));
  assert.equal(audio.prepareCalls, preparesBefore, 'running 中の消音では prepare() を再試行しない');
});

test('【本編 showGame 統合検証】11・21・31・41棟の tierUp、40棟の milestone、46〜50棟の lastFive、passBuilding、途中再開時の重複防止', async () => {
  const { GameSession } = await import('../../src/game/session.js');
  const root = document.createElement('div');
  document.body.append(root);
  const audio = createFakeAudio({ initiallyRunning: true });
  const app = new App(root, { audio, stageFactory: createFakeStageFactory() });
  await app.boot();
  app.flags.openingSeen = true;

  const session = new GameSession({
    playId: 'p-test-1',
    launchId: 'l-test-1',
    ranked: false,
    name: '',
    seed: 42,
    gameVersion: '0.1.0',
  });
  // 初回ガイドは消化済みとして本編の進行イベントを検証
  app.initializeGuides = async () => ({
    version: 1,
    completedSteps: [1, 2, 3, 4],
    claimedGroups: { intro: 'done', brightness: 'done' },
  });

  await app.showGame(session, { fresh: true });
  audio.events.length = 0;

  // 10棟通過→11棟突入で tierUp(tier=1) と passBuilding が鳴る
  session.emit([{ type: 'pass', building: 10, success: true, combo: 1, points: 100 }]);
  session.emit([{ type: 'enterBuilding', building: 11, t: 50000 }]);
  assert.ok(audio.events.some((e) => e.name === 'passBuilding' && e.opts?.combo === 1), '10棟通過で passBuilding が鳴る');
  assert.ok(audio.events.some((e) => e.name === 'tierUp' && e.opts?.tier === 1), '11棟突入で tierUp(tier=1) が鳴る');
  assert.equal(audio.building, 11);

  // 21棟・31棟突入で tierUp(tier=2, 3) が鳴る
  audio.events.length = 0;
  session.emit([{ type: 'enterBuilding', building: 21, t: 100000 }]);
  session.emit([{ type: 'enterBuilding', building: 31, t: 150000 }]);
  assert.deepEqual(
    audio.events.filter((e) => e.name === 'tierUp').map((e) => e.opts?.tier),
    [2, 3],
    '21棟・31棟突入で tierUp(2, 3) が各1回鳴る',
  );

  // 40棟突入では夜の街到達の milestone が鳴り、tierUp や転調(finale)はまだ発火しない
  audio.events.length = 0;
  session.emit([{ type: 'enterBuilding', building: 40, t: 195000 }]);
  assert.ok(audio.events.some((e) => e.name === 'milestone'), '40棟突入で milestone が鳴る');
  assert.equal(audio.events.some((e) => e.name === 'tierUp'), false, '40棟突入では tierUp は鳴らない');
  assert.equal(audio.finale, false, '40棟ではまだ転調しない');

  // 41棟突入で tierUp(tier=4) が鳴り、finale=true（+2半音転調）になる
  audio.events.length = 0;
  session.emit([{ type: 'enterBuilding', building: 41, t: 200000 }]);
  assert.ok(audio.events.some((e) => e.name === 'tierUp' && e.opts?.tier === 4), '41棟突入で tierUp(tier=4) が鳴る');
  assert.equal(audio.finale, true, '41棟突入で finale=true になる');

  // 同じ41棟の enterBuilding が万一再送されても tierUp は重複しない
  audio.events.length = 0;
  session.emit([{ type: 'enterBuilding', building: 41, t: 200000 }]);
  assert.equal(audio.events.some((e) => e.name === 'tierUp'), false, '同じ節目音は重複しない');

  // 46棟突入で lastFive が鳴る
  audio.events.length = 0;
  for (let building = 46; building <= 50; building += 1) {
    session.emit([{ type: 'enterBuilding', building, t: (building - 1) * 5000 }]);
  }
  assert.deepEqual(audio.events.filter((e) => e.name === 'lastFive').map((e) => e.opts.building), [46, 47, 48, 49, 50]);
  app.disposeStage();
});

test('【練習開始の競合・失敗検証】ガイド練習・通常練習で「準備中に戻る」「別の練習を選ぶ」「準備に失敗する」「同じ画面に留まった場合の正常開始」を検証', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const audio = createFakeAudio({ initiallyRunning: true });
  const app = new App(root, { audio, stageFactory: createFakeStageFactory() });
  await app.boot();

  // 1. 「準備中に戻る」（ガイド練習）：音の準備中に練習メニューやホームへ戻った場合、準備完了後にガイド練習が勝手に開き直さない
  app.showGuidePracticeMenu();
  assert.ok(root.querySelector('.screen.practice-menu'), 'ガイド練習メニューが表示されている');
  audio.deferNextPrepare();
  const staleGuidePromise = app.startGuidePractice(1);
  // 音の準備中に練習メニューへ戻る
  const backToMenuPromise = app.showPracticeMenu();
  audio._resolvePrepare(true);
  const [staleGuideResult] = await Promise.all([staleGuidePromise, backToMenuPromise]);
  assert.equal(staleGuideResult, null, '準備中に別画面へ戻った場合、古いガイド練習開始要求は null を返して取り消される');
  assert.equal(root.querySelector('.screen.guide-practice'), null, 'ガイド練習画面が勝手に開き直さない');
  assert.ok(root.querySelector('.screen.practice-menu'), '戻った先の練習メニュー画面が維持される');
  assert.equal(app.guidePractice ?? null, null, 'guidePractice インスタンスも残らない');
  assert.equal(audio.music, 'menu', 'BGMもメニュー曲のまま維持される');

  // ガイド練習完了後の「もう一度」準備中に「ガイドを選ぶ」へ戻った場合も勝手に開き直さない
  const activeGuide = await app.startGuidePractice(1);
  assert.ok(activeGuide, '同じ画面に留まった場合はガイド練習が始まる');
  audio.deferNextPrepare();
  const retryGuidePromise = app.startGuidePractice(1);
  app.showGuidePracticeMenu();
  audio._resolvePrepare(true);
  const retryGuideResult = await retryGuidePromise;
  assert.equal(retryGuideResult, null, '再挑戦の音の準備中に一覧へ戻った場合も古い開始要求は取り消される');
  assert.equal(root.querySelector('.screen.guide-practice'), null, '一覧へ戻った後にガイド練習が勝手に開き直さない');

  // 2. 「準備中に戻る」（通常練習）：音の準備中にホームやガイド練習一覧へ戻った場合、通常練習が勝手に開き直さない
  await app.showPracticeMenu();
  audio.events.length = 0;
  audio.deferNextPrepare();
  const stalePracticePromise = app.startPractice('basic');
  app.showHome();
  audio._resolvePrepare(true);
  const stalePracticeResult = await stalePracticePromise;
  assert.equal(stalePracticeResult, null, '通常練習でも準備中にホームへ戻った場合は開始要求が取り消される');
  assert.equal(root.querySelector('.screen.practice'), null, '通常練習画面が勝手に開き直さない');
  assert.ok(root.querySelector('.screen.home'), '戻った先のホーム画面が維持される');
  assert.equal(audio.events.some((e) => e.name === 'confirm'), false, '取り消された通常練習の confirm 音は鳴らない');

  // 3. 「別の練習を選ぶ」（ガイド練習の連続選択）：準備中に step=1 → step=3 を連続選択した場合、最後の step=3 だけが開く
  app.showGuidePracticeMenu();
  audio.deferNextPrepare();
  const guide1Promise = app.startGuidePractice(1);
  const guide3Promise = app.startGuidePractice(3);
  audio._resolvePrepare(true);
  const [guide1Result, guide3Result] = await Promise.all([guide1Promise, guide3Promise]);
  assert.equal(guide1Result, null, '先に選んだ step=1 の開始要求は取り消される');
  assert.ok(guide3Result, '後から選んだ step=3 が起動する');
  assert.equal(app.guidePractice, guide3Result, '現在の guidePractice は step=3 のみ');
  assert.equal(app.guidePractice.view().step, 3, 'step=3 のガイド練習が動作している');
  assert.equal(app.controls.el.classList.contains('bar-locked'), false, 'step=3 なので明るさバーのロックが解除されている');

  // 4. 「別の練習を選ぶ」（通常練習の連続選択およびガイド練習との連続切り替え）
  await app.showPracticeMenu();
  audio.events.length = 0;
  audio.deferNextPrepare();
  const basicPromise = app.startPractice('basic');
  const brightnessPromise = app.startPractice('brightness');
  audio._resolvePrepare(true);
  const [basicResult, brightnessResult] = await Promise.all([basicPromise, brightnessPromise]);
  assert.equal(basicResult, null, '先に選んだ basic 練習は取り消される');
  assert.ok(brightnessResult, '後から選んだ brightness 練習が起動する');
  assert.equal(app.practice.kind, 'brightness', '現在の通常練習は brightness のみ');
  assert.equal(app.controls.el.classList.contains('bar-locked'), false, 'brightness 練習なので明るさバーが使える');
  assert.equal(audio.events.filter((e) => e.name === 'confirm').length, 1, 'confirm 音は採用された最後の練習の1回だけ鳴る');

  // ガイド練習準備中に通常練習へ切り替えた場合
  app.showGuidePracticeMenu();
  audio.deferNextPrepare();
  const crossGuidePromise = app.startGuidePractice(2);
  const crossPracticePromise = app.startPractice('basic');
  audio._resolvePrepare(true);
  const [crossGuideResult, crossPracticeResult] = await Promise.all([crossGuidePromise, crossPracticePromise]);
  assert.equal(crossGuideResult, null, '先のガイド練習要求は取り消される');
  assert.ok(crossPracticeResult, '後の通常練習要求が起動する');
  assert.ok(root.querySelector('.screen.practice'), '通常練習画面が表示されている');
  assert.equal(root.querySelector('.screen.guide-practice'), null, 'ガイド練習画面は表示されない');

  // 5. 「準備に失敗する」（prepare() が false を返す場合、および例外 reject する場合）
  app.showGuidePracticeMenu();
  audio.setPrepareMode('returnFalse');
  const guideWhenFalse = await app.startGuidePractice(2);
  assert.ok(guideWhenFalse, 'audio.prepare() が false を返しても同じ画面に留まっていればガイド練習が正常に始まる');
  assert.ok(root.querySelector('.screen.guide-practice'), 'ガイド練習画面がマウントされる');

  app.showGuidePracticeMenu();
  audio.setPrepareMode('reject');
  const guideWhenRejected = await app.startGuidePractice(4);
  assert.ok(guideWhenRejected, 'audio.prepare() が reject しても同じ画面に留まっていればガイド練習が正常に始まる');
  assert.equal(app.guidePractice.view().step, 4, 'step=4 のガイド練習が正常に開始される');

  await app.showPracticeMenu();
  audio.setPrepareMode('returnFalse');
  const practiceWhenFalse = await app.startPractice('basic');
  assert.ok(practiceWhenFalse, 'audio.prepare() が false を返しても通常練習が正常に始まる');
  assert.ok(root.querySelector('.screen.practice'), '通常練習画面がマウントされる');

  await app.showPracticeMenu();
  audio.setPrepareMode('reject');
  const practiceWhenRejected = await app.startPractice('brightness');
  assert.ok(practiceWhenRejected, 'audio.prepare() が reject しても通常練習が正常に始まる');
  assert.equal(app.practice.kind, 'brightness', 'brightness 通常練習が正常に開始される');

  // 6. 「同じ画面に留まった場合には、正しく練習が始まる」（遅延 prepare 完了後の正常開始）
  app.showGuidePracticeMenu();
  audio.deferNextPrepare();
  const stayGuidePromise = app.startGuidePractice(1);
  // 画面を移動せずに音の準備が完了する
  audio._resolvePrepare(true);
  const stayGuideResult = await stayGuidePromise;
  assert.ok(stayGuideResult, '同じ画面に留まった場合はガイド練習が正常に始まる');
  assert.ok(root.querySelector('.screen.guide-practice'), 'ガイド練習画面が表示されている');
  assert.equal(audio.music, 'practice', '練習BGMが設定される');

  await app.showPracticeMenu();
  audio.deferNextPrepare();
  const stayPracticePromise = app.startPractice('basic');
  audio._resolvePrepare(true);
  const stayPracticeResult = await stayPracticePromise;
  assert.ok(stayPracticeResult, '同じ画面に留まった場合は通常練習が正常に始まる');
  assert.ok(root.querySelector('.screen.practice'), '通常練習画面が表示されている');
  assert.equal(audio.music, 'practice', '練習BGMが設定される');

  // 7. stageFactory の準備中に別画面へ戻った場合・別の練習を選んだ場合も古い stage を破棄して上書きしない
  let resolveStage = null;
  let disposedCount = 0;
  app.stageFactory = () =>
    new Promise((resolve) => {
      resolveStage = () =>
        resolve({
          showPractice() {},
          renderPractice() {},
          update() {},
          resize() {},
          fx() {},
          dispose() {
            disposedCount += 1;
          },
        });
    });
  const stagePendingPractice = app.startPractice('basic');
  await new Promise((r) => setTimeout(r, 5));
  app.showHome();
  resolveStage();
  const stagePendingResult = await stagePendingPractice;
  assert.equal(stagePendingResult, null, 'stageFactory 待ち中にホームへ戻った場合も null を返して中止する');
  assert.equal(disposedCount, 1, '古い stage インスタンスは即座に dispose される');
  assert.ok(root.querySelector('.screen.home'), 'ホーム画面が維持される');
});


test('途中保存から各音楽段階を復元すると到達済みtierUpは再発音しない', async () => {
  const { GameSession } = await import('../../src/game/session.js');
  for (const building of [11, 21, 31, 41]) {
    const root = document.createElement('div');
    document.body.append(root);
    const audio = createFakeAudio({ initiallyRunning: true });
    const app = new App(root, { audio, stageFactory: createFakeStageFactory() });
    await app.boot();
    app.initializeGuides = async () => ({ version: 1, completedSteps: [1, 2, 3, 4], claimedGroups: { intro: 'done', brightness: 'done' } });
    const session = new GameSession({ playId: `restored-${building}`, launchId: 'restore', ranked: false, seed: 42, gameVersion: '0.1.0' });
    session.state.t = (building - 1) * 5000;
    session.state.passed = building - 1;
    await app.showGame(session, { fresh: false });
    assert.equal(audio.building, building);
    assert.equal(audio.finale, building >= 41);
    audio.events.length = 0;
    session.emit([{ type: 'enterBuilding', building, t: session.state.t }]);
    assert.equal(audio.events.filter((e) => e.name === 'tierUp').length, 0);
    app.disposeStage();
    root.remove();
  }
});

test('練習結果の保存待ち後に古い結果画面や結果音が現在画面を上書きしない', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const audio = createFakeAudio({ initiallyRunning: true });
  const app = new App(root, { audio, stageFactory: createFakeStageFactory() });
  await app.boot();
  const practice = await app.startPractice('basic');
  for (let i = 0; i < 3; i += 1) { practice.skip(); practice.next(); }
  let finishSave;
  app.store.addPractice = () => new Promise((resolve) => { finishSave = resolve; });
  const pending = app.finishPractice(practice);
  app.showHome();
  audio.events.length = 0;
  finishSave();
  await pending;
  assert.ok(root.querySelector('.home'));
  assert.equal(root.querySelector('.practice-result'), null);
  assert.equal(audio.events.some((event) => event.name === 'result'), false);
  app.disposeStage();
  root.remove();
});
