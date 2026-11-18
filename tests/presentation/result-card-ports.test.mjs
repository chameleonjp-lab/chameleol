import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import * as THREE from 'three';
import { createResultCardPorts } from '../../src/presentation/result-card-ports.js';
import { createTurnPanel, turnBackingSide } from '../../src/presentation/result-turn-view.js';
import { createMiniaturePanel, modelCellOrigin } from '../../src/presentation/result-miniature-view.js';
import { mountResultPanels } from '../../src/presentation/result-evidence-view.js';
import { createResultRendererOwner } from '../../src/presentation/result-renderer-owner.js';
import { USED_FALLBACKS, usedFallbackReport } from '../../src/presentation/result-card-text.js';
import { installFakeCanvas } from './helpers/fake-canvas.mjs';
import { setLanguage, t } from '../../src/i18n/i18n.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';

const FORBIDDEN = ['navigator', 'shareImpl', 'urlApi', 'waitForPresentation', 'focusTarget', 'visibilityTarget', 'createCanvas', 'encodePng'];
const matched = { status: 'matched', building: 12, hsv: { h: 9000, s: 6000, v: 8000 }, outlineBuilding: 12, average: 90, instantMatch: 95 };
const baseModel = (over = {}) => ({ revision: 1, locale: 'ja', passed: 20, rankKey: 'expert', totalScore: 7280, bonusCount: 23, countState: 'known', hero: matched, verificationState: null, ...over });
const cells = (passed = 3, arrived = passed + 1) => ({
  available: true, reason: null,
  cells: Array.from({ length: 50 }, (_, i) => ({ building: i + 1, state: i + 1 <= passed ? 'passed' : i + 1 === arrived ? 'arrived' : 'unreached', wallHsv: i === 1 ? null : { h: i * 600, s: 5000, v: 9000 }, bodyHsv: i === 0 ? { h: 100, s: 100, v: 9000 } : null })),
});
const snap = (over = {}) => ({ model: baseModel(), miniature: cells(), state: 'ready', prepared: { revision: 1 }, revision: 1, portraitImage: { width: 200, height: 300 }, ...over });

function setup({ markup = true } = {}) {
  const { document, window } = parseHTML('<html><body><main class="screen result"></main></body></html>');
  installFakeCanvas(window);
  const host = document.querySelector('main');
  if (markup) {
    host.innerHTML = '<div class="result-burst"></div><h1 class="result-title">Cleared</h1><div class="result-main"></div><div class="result-actions"><button data-testid="result-again">Again</button><a data-testid="result-ranking">Ranking</a><button data-testid="result-share" class="btn-x">Share</button></div><button data-testid="result-home">Home</button><div class="result-ranking"></div>';
  }
  return { document, window, host };
}
function fakeController(initial) {
  let current = initial;
  const calls = { share: 0, retry: 0, getImageUrl: 0, revoke: 0 };
  return {
    calls,
    set(next) { current = next; },
    snapshot: () => current,
    share() { calls.share += 1; return Promise.resolve('shared'); },
    retry() { calls.retry += 1; },
    getImageUrl() { calls.getImageUrl += 1; return current.prepared ? 'blob:fake-url' : null; },
    revokeImageUrl() { calls.revoke += 1; },
  };
}
const scopeStub = () => { const own = []; return { own: (fn) => own.push(fn), run: () => own.splice(0).forEach((fn) => fn()) }; };
const click = (window, node) => node.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));

test('the product ports expose exactly the drawing ports and none of the test-only substitutes (D01)', () => {
  const ports = createResultCardPorts({ result: {}, host: null, scope: scopeStub() });
  assert.deepEqual(Object.keys(ports).sort(), ['createRenderer', 'createResultPortrait', 'describeResources', 'destroyRenderer', 'drawResultCard', 'getLayoutKey', 'mount', 'onChange', 'panels'].sort());
  for (const key of FORBIDDEN) assert.equal(key in ports, false, `${key} must not be defined`);
  assert.equal(ports.getLayoutKey(), 'card-1200x630-v1');
  assert.deepEqual(ports.panels.map((p) => p.id), ['model', 'turn']);
  assert.ok(ports.panels.every((p) => p.needsData === false));
});

test('the factory builds nothing: no renderer lease, no DOM, only a cleanup on the scope', () => {
  const { host } = setup();
  const before = host.innerHTML;
  let acquires = 0;
  const result = { resultRendererOwner: { acquire() { acquires += 1; return Promise.resolve(null); } } };
  const scope = scopeStub();
  createResultCardPorts({ result, host, scope });
  assert.equal(acquires, 0);
  assert.equal(host.innerHTML, before);
  assert.equal(host.classList.contains('has-result-card'), false);
});

test('the first onChange arrives before mount: mount draws controller.snapshot(), not the stale latest', () => {
  const { host, document } = setup();
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(snap({ state: 'pending', prepared: null, model: baseModel({ rankKey: 'beginning', passed: 0 }) }));
  assert.equal(host.querySelector('.result-card'), null, 'nothing is mounted yet');
  const controller = fakeController(snap({ model: baseModel({ rankKey: 'legend', passed: 50 }) }));
  const view = ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  const canvas = host.querySelector('.result-card-canvas');
  assert.ok(canvas.getAttribute('aria-label').includes(t('card.rank.legend', undefined, 'ja')));
  assert.ok(!canvas.getAttribute('aria-label').includes(t('card.rank.beginning', undefined, 'ja')));
  assert.equal(canvas.width, 1200, 'the snapshot was ready, so the full size');
  view.dispose();
  void document;
});

test('mount moves the existing action nodes without cloning, replacing or double-registering them', () => {
  const { host, window } = setup();
  const actions = host.querySelector('.result-actions');
  const again = host.querySelector('[data-testid="result-again"]');
  const share = host.querySelector('[data-testid="result-share"]');
  const home = host.querySelector('[data-testid="result-home"]');
  const controller = fakeController(snap());
  let appClicks = 0;
  share.addEventListener('click', () => { appClicks += 1; controller.share(); });
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(controller.snapshot());
  const view = ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  assert.ok(host.classList.contains('has-result-card'));
  assert.equal(host.querySelector('.result-actions'), actions, 'same node');
  assert.equal(host.querySelector('[data-testid="result-share"]'), share, 'same node');
  assert.equal(host.querySelectorAll('[data-testid="result-share"]').length, 1);
  assert.equal(host.querySelector('[data-testid="result-again"]'), again);
  const order = [...host.children].map((c) => c.className.split(' ')[0]);
  assert.ok(order.indexOf('result-title') < order.indexOf('result-card') && order.indexOf('result-card') < order.indexOf('result-actions'));
  const kids = [...actions.children];
  assert.deepEqual(kids, [again, host.querySelector('[data-testid="result-ranking"]'), share]);
  assert.equal(home.nextElementSibling, host.querySelector('.result-ranking'));
  assert.equal(home.nextElementSibling.nextElementSibling, host.querySelector('.result-card-secondary'));
  click(window, share);
  assert.equal(appClicks, 1);
  assert.equal(controller.calls.share, 1, 'one tap is one share() call, made by the App handler, never by the view');
  view.dispose();
  assert.equal(host.querySelector('.result-card'), null);
  assert.equal(host.querySelector('.result-card-secondary'), null);
  assert.equal(host.classList.contains('has-result-card'), false);
  assert.equal(host.querySelector('[data-testid="result-share"]'), share, 'the App node stays');
  view.dispose();
});

test('state-by-state wording, share button state and retry visibility', () => {
  setLanguage('ja');
  const { host } = setup();
  const controller = fakeController(snap({ state: 'pending', prepared: null, portraitImage: null }));
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(controller.snapshot());
  ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  const status = host.querySelector('.result-card-status');
  const share = host.querySelector('[data-testid="result-share"]');
  const retry = host.querySelector('.result-card-retry');
  const canvas = host.querySelector('.result-card-canvas');
  assert.equal(status.textContent, t('card.preparing'));
  assert.equal(share.getAttribute('aria-disabled'), 'true');
  assert.equal(retry.hidden, true);
  assert.equal(canvas.width, 600, 'the preparing card is the 600x315 canvas');
  const apply = (s) => { controller.set(s); ports.onChange(s); };
  apply(snap({ state: 'failed', prepared: null, portraitImage: null }));
  assert.equal(status.textContent, t('card.failed'));
  assert.equal(retry.hidden, false);
  assert.equal(share.getAttribute('aria-disabled'), null, 'a failed preparation still answers the tap (guidance only)');
  apply(snap({ state: 'ready' }));
  assert.equal(status.textContent, '');
  assert.equal(retry.hidden, true);
  apply(snap({ state: 'sharing' }));
  assert.equal(share.getAttribute('aria-disabled'), 'true');
  apply(snap({ state: 'ready' }));
  assert.equal(status.textContent, t('card.shareClosed'), 'sharing -> ready shows the closed note');
  apply(snap({ state: 'unavailable' }));
  assert.equal(status.textContent, t('card.shareUnavailable'));
  apply(snap({ state: 'failed' }));
  assert.equal(status.textContent, t('card.shareFailed'), 'failed sharing offers localized save/text guidance');
  assert.equal(host.querySelector('.result-card-secondary').classList.contains('is-share-failed'), false);
  assert.deepEqual(usedFallbackReport(), []);
});

test('retry and text share happen only on an explicit tap and a retry never shares by itself', () => {
  const { host, window } = setup();
  const controller = fakeController(snap({ state: 'failed', prepared: null, portraitImage: null }));
  let text = 0;
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(controller.snapshot());
  ports.mount({ host, controller, scope: scopeStub(), onTextShare: () => { text += 1; } });
  assert.equal(controller.calls.retry + controller.calls.share + text, 0, 'nothing happens on its own');
  click(window, host.querySelector('.result-card-retry'));
  assert.equal(controller.calls.retry, 1);
  assert.equal(controller.calls.share, 0);
  click(window, host.querySelector('.result-card-text'));
  assert.equal(text, 1);
  assert.equal(controller.calls.share, 0, 'a cancelled share never opens the text window by itself');
});

test('the save screen asks for the URL only on tap, shows an img, frees the canvas, and revokes on close', () => {
  const { host, window, document } = setup();
  const controller = fakeController(snap());
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(controller.snapshot());
  ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  assert.equal(controller.calls.getImageUrl, 0);
  const canvas = host.querySelector('.result-card-canvas');
  click(window, host.querySelector('.result-card-save'));
  assert.equal(controller.calls.getImageUrl, 1);
  const viewer = document.querySelector('[data-testid="result-card-viewer"]');
  assert.ok(viewer);
  assert.equal(viewer.getAttribute('role'), 'dialog');
  assert.equal(viewer.getAttribute('aria-modal'), 'true');
  assert.equal(viewer.querySelector('img').getAttribute('src'), 'blob:fake-url');
  assert.equal(viewer.querySelector('a').getAttribute('download'), 'chameleol-result.png');
  assert.equal(canvas.width * canvas.height, 0, 'the screen card releases its pixels while the viewer covers it');
  assert.equal(ports.describeResources().viewerImageBytes, 1200 * 630 * 4);
  click(window, viewer.querySelector('[data-testid="result-card-viewer-close"]'));
  assert.equal(document.querySelector('[data-testid="result-card-viewer"]'), null);
  assert.equal(controller.calls.revoke, 1);
  assert.equal(canvas.width, 1200, 'the card is drawn again');
  // 準備中は開かない
  controller.set(snap({ state: 'pending', prepared: null }));
  ports.onChange(controller.snapshot());
  click(window, host.querySelector('.result-card-save'));
  assert.equal(document.querySelector('[data-testid="result-card-viewer"]'), null);
  assert.equal(host.querySelector('.result-card-status').textContent, t('card.preparing'));
});

for (const exit of ['close', 'revision', 'dispose']) {
  test(`save dialog isolates the background and restores existing state on ${exit}`, () => {
    const { host, window, document } = setup();
    const controller = fakeController(snap());
    const ports = createResultCardPorts({ result:{}, host, scope:scopeStub() });
    const view = ports.mount({host,controller,scope:scopeStub(),onTextShare(){}});
    const other=document.createElement('aside');other.setAttribute('inert','already');other.setAttribute('aria-hidden','false');document.body.append(other);
    document.documentElement.style.overflow='auto';
    Object.assign(document.body.style,{overflow:'scroll',position:'relative',top:'13px',left:'7px',width:'95%'});
    const oldX=window.scrollX,oldY=window.scrollY,oldScroll=window.scrollTo;
    const restored=[];window.scrollX=12;window.scrollY=430;window.scrollTo=(x,y)=>restored.push([x,y]);
    try {
      click(window,host.querySelector('.result-card-save'));
      const dialog=document.querySelector('.result-card-viewer');
      assert.equal(host.hasAttribute('inert'),true,'the real background cannot receive user interaction');
      assert.equal(host.getAttribute('aria-hidden'),'true');
      assert.equal(dialog.hasAttribute('inert'),false,'the image and native save gesture remain available');
      assert.equal(document.documentElement.style.getPropertyValue('overflow-x'),'hidden');
      assert.equal(document.documentElement.style.getPropertyValue('overflow-y'),'hidden');
      assert.equal(document.body.style.position,'fixed');
      assert.equal(document.body.style.top,'-430px');
      assert.equal(document.body.style.left,'-12px');
      assert.equal(dialog.style.getPropertyValue('overscroll-behavior'),'contain');
      document.body.style.backgroundColor='black';
      if(exit==='close')click(window,dialog.querySelector('.result-card-viewer-close'));
      else if(exit==='revision')ports.onChange(snap({revision:2,state:'pending',prepared:null}));
      else view.dispose();
      assert.equal(document.querySelector('.result-card-viewer'),null);
      assert.equal(host.hasAttribute('inert'),false);assert.equal(host.hasAttribute('aria-hidden'),false);
      assert.equal(other.getAttribute('inert'),'already');assert.equal(other.getAttribute('aria-hidden'),'false');
      assert.equal(document.documentElement.style.overflow,'auto');
      assert.equal(document.body.style.overflow,'scroll');assert.equal(document.body.style.position,'relative');
      assert.equal(document.body.style.top,'13px');assert.equal(document.body.style.left,'7px');assert.equal(document.body.style.width,'95%');
      assert.equal(document.body.style.backgroundColor,'black','unrelated style updates are preserved');
      assert.deepEqual(restored,exit==='dispose'?[]:[[12,430]],'only the same screen restores its scroll');
      view.dispose();assert.equal(controller.calls.revoke,1,'cleanup is idempotent');
    } finally {window.scrollX=oldX;window.scrollY=oldY;window.scrollTo=oldScroll;}
  });
}

test('save dialog restores single-axis overflow and mixed priorities without losing declarations', () => {
  const {host,window,document}=setup();
  // LinkeDOM does not expand CSS shorthands. Model the CSSOM overflow boundary;
  // the browser suite also exercises these declarations with native CSSStyleDeclaration.
  const cssStyle=(initial)=>{
    const values=new Map(initial);
    const parts=(property)=>property==='overflow'?['overflow-x','overflow-y']:[property];
    return {
      getPropertyValue(property){
        if(property!=='overflow')return values.get(property)?.[0]??'';
        const x=values.get('overflow-x'),y=values.get('overflow-y');
        if(!x||!y||x[1]!==y[1])return '';
        return x[0]===y[0]?x[0]:`${x[0]} ${y[0]}`;
      },
      getPropertyPriority(property){
        if(property!=='overflow')return values.get(property)?.[1]??'';
        const x=values.get('overflow-x'),y=values.get('overflow-y');
        return x&&y&&x[1]===y[1]?x[1]:'';
      },
      setProperty(property,value,priority=''){for(const part of parts(property))values.set(part,[value,priority]);},
      removeProperty(property){for(const part of parts(property))values.delete(part);},
      declarations:()=>[...values].sort(([a],[b])=>a.localeCompare(b)),
    };
  };
  const htmlStyle=cssStyle([['overflow-x',['hidden','important']],['overflow-y',['scroll','']]]);
  const bodyStyle=cssStyle([['overflow-y',['scroll','important']]]);
  Object.defineProperty(document.documentElement,'style',{value:htmlStyle});
  Object.defineProperty(document.body,'style',{value:bodyStyle});
  const before=[htmlStyle.declarations(),bodyStyle.declarations()];
  const controller=fakeController(snap()),ports=createResultCardPorts({result:{},host,scope:scopeStub()});
  const view=ports.mount({host,controller,scope:scopeStub(),onTextShare(){}});
  click(window,host.querySelector('.result-card-save'));
  for(const style of [htmlStyle,bodyStyle])for(const axis of ['overflow-x','overflow-y']){
    assert.equal(style.getPropertyValue(axis),'hidden');assert.equal(style.getPropertyPriority(axis),'important');
  }
  click(window,document.querySelector('.result-card-viewer-close'));
  assert.deepEqual([htmlStyle.declarations(),bodyStyle.declarations()],before);
  view.dispose();
});

test('a revised image restores the save action focus, while screen disposal never focuses an outgoing view', () => {
  const { host, window, document } = setup();
  const controller = fakeController(snap());
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  const view = ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  const save = host.querySelector('.result-card-save');
  let restored = 0;save.focus = () => { restored += 1; };
  click(window, save);
  ports.onChange(snap({ revision: 2, state: 'pending', prepared: null }));
  assert.equal(document.querySelector('.result-card-viewer'), null);
  assert.equal(restored, 1, 'same-screen automatic closure returns to its save action');
  controller.set(snap());click(window, save);view.dispose();
  assert.equal(restored, 1, 'leaving results does not focus an old action');
});
test('a new revision closes the viewer, Escape closes it, and disposing the screen revokes the URL', () => {
  const { host, window, document } = setup();
  const controller = fakeController(snap());
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(controller.snapshot());
  const view = ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  click(window, host.querySelector('.result-card-save'));
  ports.onChange(snap({ state: 'sharing' }));
  assert.ok(document.querySelector('[data-testid="result-card-viewer"]'), 'a state-only change keeps the viewer');
  ports.onChange(snap({ revision: 2, prepared: null, state: 'pending' }));
  assert.equal(document.querySelector('[data-testid="result-card-viewer"]'), null, 'a stale image is closed');
  controller.set(snap());
  click(window, host.querySelector('.result-card-save'));
  document.dispatchEvent(Object.assign(new window.Event('keydown', { bubbles: true, cancelable: true }), { key: 'Escape' }));
  assert.equal(document.querySelector('[data-testid="result-card-viewer"]'), null);
  const revokes = controller.calls.revoke;
  click(window, host.querySelector('.result-card-save'));
  view.dispose();
  assert.equal(document.querySelector('[data-testid="result-card-viewer"]'), null);
  assert.equal(controller.calls.revoke, revokes + 1);
});

test('tapping the share button while pending shows the preparing note without delaying anything', () => {
  const { host, window } = setup();
  const controller = fakeController(snap({ state: 'pending', prepared: null }));
  const ports = createResultCardPorts({ result: {}, host, scope: scopeStub() });
  ports.onChange(controller.snapshot());
  ports.mount({ host, controller, scope: scopeStub(), onTextShare() {} });
  host.querySelector('.result-card-status').textContent = '';
  click(window, host.querySelector('[data-testid="result-share"]'));
  assert.equal(host.querySelector('.result-card-status').textContent, t('card.preparing'));
  assert.equal(controller.calls.share, 0);
});

// ---- E075 ----
test('E075 draws all 50 buildings with passed, arrived and unreached told apart and missing colors left empty', () => {
  const { document, window } = setup({ markup: false });
  let latest = snap({ miniature: cells(3, 4) });
  const live = new Set();
  const panel = createMiniaturePanel({ getSnapshot: () => latest, register: (i) => { live.add(i); return () => live.delete(i); } });
  const host = document.createElement('div');
  document.body.append(host);
  const instance = panel.render(host, null, { doc: document });
  const groups = [...host.querySelectorAll('g[data-building]')];
  assert.equal(groups.length, 50);
  const count = (state) => groups.filter((g) => g.getAttribute('data-state') === state).length;
  assert.deepEqual([count('passed'), count('arrived'), count('unreached')], [3, 1, 46]);
  assert.equal(groups[1].getAttribute('data-wall'), 'missing', 'a missing wall color is not guessed');
  assert.equal(groups[1].querySelector('path'), null, 'no top/side faces are painted for a missing color');
  assert.ok(groups[0].querySelectorAll('rect').length >= 2, 'passed building has a body-color tag');
  assert.ok(host.querySelector('svg').getAttribute('aria-label').startsWith(t('result.buildings', undefined, 'ja')));
  assert.equal(host.querySelectorAll('.result-miniature-legend li').length, 4);
  // 50棟クリア
  latest = snap({ miniature: cells(50, 50) });
  live.forEach((i) => i.update(latest));
  assert.equal([...host.querySelectorAll('g[data-state="passed"]')].length, 50);
  assert.ok(host.querySelector('g[data-building="50"] rect[stroke="#ffd43b"]'), 'the 50th building is outlined in gold');
  assert.equal(host.querySelector('canvas'), null, 'no canvas');
  // 利用不可
  latest = snap({ miniature: { available: false, reason: 'invalid_progress', cells: [] } });
  live.forEach((i) => i.update(latest));
  assert.ok(host.querySelector('.evidence-empty'));
  instance.dispose();
  assert.equal(live.size, 0);
  void window;
  assert.deepEqual(modelCellOrigin(0), { x: 22, y: 52 });
  assert.deepEqual(modelCellOrigin(10), { x: 292, y: 96 }, 'odd rows run right to left');
});

test('E075 preserves a recorded body color when only the wall color is missing', () => {
  const { host, document } = setup({ markup: false });
  const miniature = cells(1, 2);miniature.cells[0].wallHsv = null;
  miniature.cells[0].bodyHsv = { h: 0, s: 10000, v: 10000 };
  const panel = createMiniaturePanel({ getSnapshot: () => snap({ miniature }) });
  const instance = panel.render(host, null, { doc: document });
  const building = host.querySelector('g[data-building="1"]');
  assert.equal(building.getAttribute('data-wall'), 'missing');
  assert.equal(building.querySelector('rect[width="8"][height="8"]')?.getAttribute('fill'), '#ff0000');
  instance.dispose();
});

test('E090 keeps full requested detail when possible and reserves the real eye image at the maximum portrait size', () => {
  const base = 11_673_600 + 3_024_000 + 262_144;
  const small = { width: 258, height: 434 };
  assert.equal(turnBackingSide(false, 2, small), 560, 'the normal portrait keeps the current resolution');
  const largest = { width: 360, height: 480 };
  const side = turnBackingSide(false, 3, largest);
  assert.ok(base + largest.width * largest.height * 4 + side * side * 4 <= 16_777_216, 'E090, eye texture, portrait, screen and atlas fit together');
  assert.ok(side >= 528, 'use the available resolution instead of a coarse fallback');
});

// ---- E090 ----
function turnHarness({ hero = matched, state = 'ready' } = {}) {
  const { document, window } = setup({ markup: false });
  const events = [];
  const owner = { acquires: 0, signals: [], pending: [] };
  const rendererFor = () => ({
    domElement: document.createElement('canvas'), renders: 0, sizes: [], ratios: [],
    setPixelRatio(r) { this.ratios.push(r); }, setSize(w, h) { this.sizes.push([w, h]); const r=this.ratios.at(-1)??1;this.domElement.width=Math.floor(w*r);this.domElement.height=Math.floor(h*r); }, render() { this.renders += 1; },
  });
  const leases = [];
  owner.acquire = (kind, { signal, onRevoke }) => {
    owner.acquires += 1;
    events.push(['acquire', kind]);
    return Promise.resolve().then(() => {
      const lease = { renderer: rendererFor(), signal, released: 0, release() { this.released += 1; }, onRevoke };
      leases.push(lease);
      return lease;
    });
  };
  let latest = snap({ state, model: baseModel({ hero }) });
  const live = new Set();
  const rig = () => ({ group: new THREE.Group(), head: { rotation: { z: 0 } }, jewel: { visible: false }, setColor() {}, setOutlineStyle() {}, animate() {}, dispose() { rig.disposed = (rig.disposed ?? 0) + 1; } });
  const panel = createTurnPanel({ getSnapshot: () => latest, register: (i) => { live.add(i); return () => live.delete(i); }, getOwner: () => owner, deps: { createModel: rig } });
  const host = document.createElement('div');
  document.body.append(host);
  return {
    document, window, host, owner, leases, panel, rig,
    open: () => panel.render(host, null, { doc: document }),
    push(next) { latest = next; live.forEach((i) => i.update(next)); },
    get latest() { return latest; },
  };
}
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

test('E090 does not borrow a renderer while the hero is pending and borrows the model one otherwise', async () => {
  const pending = turnHarness({ hero: { status: 'pending', building: null, hsv: null, outlineBuilding: 1 } });
  const a = pending.open();
  await flush();
  assert.equal(pending.owner.acquires, 0);
  assert.ok(pending.host.textContent.includes(t('evidence.pending')));
  a.dispose();
  const h = turnHarness({ state: 'pending' });
  const b = h.open();
  await flush();
  assert.equal(h.owner.acquires, 1, 'it may open during the first 600ms (state pending)');
  assert.equal(h.leases[0].renderer.ratios.at(-1), 1, 'a preparing card keeps the 300x300 backing');
  assert.equal(h.leases[0].renderer.renders, 1);
  b.dispose();
  assert.equal(h.leases[0].released, 1, 'closing releases the lease');
  b.dispose();
  assert.equal(h.leases[0].released, 1);
});

test('E090 gives way to the portrait capture, waits while pending, then borrows again with the current model', async () => {
  const h = turnHarness({ state: 'pending' });
  const instance = h.open();
  await flush();
  const first = h.leases[0];
  // 撮影が優先：所有者が onRevoke を呼び、その後で release する
  first.onRevoke();
  first.release();
  assert.equal(instance.stats().leased, false);
  assert.ok(h.host.textContent.includes(t('card.preparing')));
  assert.equal(h.owner.acquires, 1, 'no re-acquire inside onRevoke');
  h.push(snap({ state: 'pending', model: baseModel({ hero: { ...matched, building: 30 } }) }));
  await flush();
  assert.equal(h.owner.acquires, 1, 'still waiting while the card is pending');
  const newHero = { ...matched, building: 30, hsv: { h: 1000, s: 2000, v: 3000 } };
  h.push(snap({ state: 'ready', model: baseModel({ hero: newHero }) }));
  await flush();
  assert.equal(h.owner.acquires, 2, 'borrowed again once the card finished');
  assert.equal(instance.stats().leased, true);
  assert.equal(instance.stats().backingSide, 300);
  assert.equal(instance.stats().canvasBytes, 360_000);
  instance.dispose();
});

test('E090 rotates only for a horizontal drag of 8px or more and never draws in a loop', async () => {
  const h = turnHarness();
  const instance = h.open();
  await flush();
  const stage = h.host.querySelector('.result-turn-stage');
  const ev = (type, x, y, id = 1) => { const e = new h.window.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: id, clientX: x, clientY: y }); return e; };
  const renders = () => h.leases[0].renderer.renders;
  const before = renders();
  stage.dispatchEvent(ev('pointerdown', 100, 100));
  stage.dispatchEvent(ev('pointermove', 106, 100));
  assert.equal(instance.angle, 0, '6px is not a turn');
  stage.dispatchEvent(ev('pointermove', 103, 140));
  assert.equal(instance.angle, 0, 'a vertical drag stays a scroll');
  stage.dispatchEvent(ev('pointerup', 103, 140));
  stage.dispatchEvent(ev('pointerdown', 100, 100, 2));
  stage.dispatchEvent(ev('pointermove', 130, 105, 2));
  assert.ok(Math.abs(instance.angle - 30 * 0.012) < 1e-9);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(renders(), before + 1, 'one draw per move batch');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(renders(), before + 1, 'no loop');
  h.host.querySelector('.result-turn-right').dispatchEvent(new h.window.Event('click', { bubbles: true }));
  assert.ok(Math.abs(instance.angle - (30 * 0.012 + Math.PI / 6)) < 1e-9);
  instance.dispose();
});

test('the panel chips use the selected dictionary, and still open one at a time', () => {
  setLanguage('ja');
  const { document, window } = setup({ markup: false });
  const ports = createResultCardPorts({ result: {}, host: null, scope: scopeStub() });
  const host = document.createElement('div');
  document.body.append(host);
  const view = mountResultPanels({ host, t: (k, p) => t(k, p, 'ja'), state: { status: 'missing' }, panels: ports.panels });
  const chips = [...host.querySelectorAll('.evidence-chip')].map((c) => c.textContent);
  assert.equal(chips.length, 7);
  assert.ok(chips.includes(t('evidence.model.title', undefined, 'ja')));
  assert.ok(chips.includes(t('evidence.turn.title', undefined, 'ja')));
  assert.ok(chips.every((c) => !c.includes('evidence.')));
  view.open('model');
  assert.equal(view.stats().openCount, 1);
  view.open('turn');
  assert.equal(view.stats().openCount, 1);
  view.dispose();
  void window;
});

test('panels created by the factory keep one owner: a fake owner shared with the portrait is the only renderer source', async () => {
  const created = [];
  const owner = createResultRendererOwner({ createRenderer: () => { const r = { domElement: { remove() {}, width: 1, height: 1 }, setPixelRatio() {}, setSize() {}, render() {}, disposed: 0, dispose() { this.disposed += 1; } }; created.push(r); return r; }, destroyRenderer: (r) => r.dispose() });
  const portrait = owner.acquire('portrait', {});
  const model = owner.acquire('model', {});
  const first = await portrait;
  assert.ok(first);
  assert.equal(created.length, 1, 'never two contexts at once');
  first.release();
  const second = await model;
  assert.ok(second);
  assert.equal(created.length, 2);
  second.release();
});

test('all 15 dictionaries reach card/error/save/model/turn DOM and aria text without emergency fallbacks', () => {
  USED_FALLBACKS.clear();
  for (const [locale, M] of Object.entries(MESSAGES)) {
    const {host, window, document} = setup();
    const current = snap({model:baseModel({locale, countState:'missing', bonusCount:null}), miniature:cells(17, 18)});
    const controller = fakeController(current), scope = scopeStub();
    const ports = createResultCardPorts({result:{}, host, scope});
    const view = ports.mount({host, controller, scope, onTextShare(){}});
    assert.ok(host.querySelector('.result-card-canvas').getAttribute('aria-label').includes(M['card.bonusMissing']), locale);
    assert.ok(host.querySelector('.result-card-summary').textContent.includes(M['card.bonusMissing']), locale);
    controller.set({...current, state:'failed'});ports.onChange(controller.snapshot());
    assert.equal(host.querySelector('.result-card-status').textContent, M['card.shareFailed'], locale);
    click(window, host.querySelector('.result-card-save'));
    assert.equal(document.querySelector('.result-card-viewer-title').textContent, M['card.viewerTitle'], locale);
    assert.ok(document.querySelector('.result-card-viewer-image').alt.includes(M['card.bonusMissing']), locale);
    click(window, document.querySelector('.result-card-viewer-close'));
    const panels = mountResultPanels({host, t:(key, params)=>t(key, params, locale), state:{status:'missing'}, panels:ports.panels});
    assert.equal(host.querySelector('[data-panel=model]').textContent, M['evidence.model.title'], locale);
    assert.equal(host.querySelector('[data-panel=turn]').textContent, M['evidence.turn.title'], locale);
    panels.open('model');
    assert.deepEqual([...host.querySelectorAll('.result-miniature-legend li')].map(el=>el.textContent), ['passed','arrived','unreached','missing'].map(key=>M[`evidence.model.${key}`]), locale);
    assert.ok(host.querySelector('.result-miniature-svg').getAttribute('aria-label').includes(M['evidence.model.alt'].replace('{passed}','17').replace('{arrived}','18')), locale);
    panels.open('turn');
    assert.equal(host.querySelector('.result-turn-left').getAttribute('aria-label'), M['evidence.turn.left'], locale);
    assert.equal(host.querySelector('.result-turn-right').getAttribute('aria-label'), M['evidence.turn.right'], locale);
    assert.equal(host.querySelector('.result-turn-hint').textContent, M['evidence.turn.hint'], locale);
    panels.dispose();view.dispose();scope.run();
  }
  assert.deepEqual(usedFallbackReport(), []);
});
