import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { RULES_V1 } from '../../src/rules/v1/index.js';
import { createGameExtrasController } from '../../src/presentation/game-extras-controller.js';

// 舞台の mode 分岐（IF01）と step の入力（IF02/IF09）。立体の舞台そのものは tests/e2e/travel-tongue.e2e.mjs で実ブラウザで確かめる。
const stageModule = await import('../../src/scene/stage.js');
const { createDomStage, resolvePresentationMode, createExtendedStepper } = stageModule;

const { window, document } = parseHTML('<html><body><div id="host"></div></body></html>');
Object.assign(globalThis, { document, Node: window.Node });
const realMatchMedia = globalThis.matchMedia;
afterEach(() => { if (realMatchMedia === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = realMatchMedia; });

function fakeMedia(initial = false) {
  const listeners = new Set();
  const media = {
    matches: initial, added: 0, removed: 0,
    addEventListener(type, fn) { assert.equal(type, 'change'); listeners.add(fn); media.added++; },
    removeEventListener(type, fn) { assert.equal(type, 'change'); listeners.delete(fn); media.removed++; },
    set(value) { media.matches = value; for (const fn of [...listeners]) fn({ matches: value, media: '(prefers-reduced-motion: reduce)' }); },
    listenerCount: () => listeners.size,
  };
  globalThis.matchMedia = (query) => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; };
  return media;
}
function spyController() {
  const calls = [];
  return { calls, step(input) { calls.push(input); return { travelTongue: null, cameo: null, policeExtra: null, precisionBadge: null }; }, event() {}, snapshot() { return {}; }, dispose() {} };
}
const view = (t, over = {}) => ({ t, playId: 'p', passed: 2, building: 3, phase: 'eval', color: { h: 1, s: 2, v: 3 }, policeStage: 1, running: true, matchState: null, combo: 0, maxCombo: 0, moving: true, hidden: false, guideActive: false, guidanceActive: false, warningActive: false, evaluationSegments: [], ...over });
const NONE = { railway: false, water: false, robot: false, bird: false, midpoint: false, policeSettled: false, existing: {} };
function domStage(options = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  return createDomStage(host, { course: { targets: Array.from({ length: 50 }, () => ({ h: 3000, s: 5000, v: 10000 })) }, rules: RULES_V1, ...options });
}
const update = (stage, presentation) => stage.update({ t: presentation?.t ?? 0, color: { h: 1, s: 2, v: 3 }, policeStage: 0, presentation });

test('mode: legacy80 unless extended96 is named explicitly AND a controller is present', () => {
  assert.equal(typeof resolvePresentationMode, 'function');
  const controller = spyController();
  assert.equal(resolvePresentationMode({}), 'legacy80');
  assert.equal(resolvePresentationMode(), 'legacy80');
  assert.equal(resolvePresentationMode({ gameExtrasController: controller }), 'legacy80', 'a controller alone never switches');
  assert.equal(resolvePresentationMode({ presentationSet: 'legacy80', gameExtrasController: controller }), 'legacy80');
  assert.equal(resolvePresentationMode({ presentationSet: 'extended96' }), 'legacy80', 'no controller to step');
  assert.equal(resolvePresentationMode({ presentationSet: 'extended96', gameExtrasController: {} }), 'legacy80');
  assert.equal(resolvePresentationMode({ presentationSet: 'extended96', gameExtrasController: controller }), 'extended96');
});

test('DOM stage: legacy80 never steps the controller even when one is passed', () => {
  const controller = spyController();
  const stage = domStage({ presentationSet: 'legacy80', gameExtrasController: controller });
  for (let i = 0; i < 5; i++) update(stage, view(i * 16));
  const plain = domStage({ gameExtrasController: controller });
  for (let i = 0; i < 5; i++) update(plain, view(i * 16));
  assert.equal(controller.calls.length, 0);
  assert.equal(stage.presentationStats().mode, 'legacy80');
  stage.dispose(); plain.dispose();
});

test('DOM stage: extended96 steps once per update with drawable:false, no placements and the game clock t', () => {
  const controller = spyController();
  fakeMedia(false);
  const stage = domStage({ presentationSet: 'extended96', gameExtrasController: controller });
  const segment = { building: 3, from: 100, to: 200, matchUnits: 1, unitsPerPercent: 1, evaluationEnd: 300 };
  const presentation = view(5000, { evaluationSegments: [segment] });
  const before = JSON.stringify(presentation);
  stage.update({ t: 123, color: { h: 1, s: 2, v: 3 }, policeStage: 1, presentation });
  assert.equal(controller.calls.length, 1, 'exactly one step per update');
  const input = controller.calls[0];
  assert.equal(input.t, 5000, 'presentation.t, not the scene t');
  assert.equal(input.drawable, false);
  assert.deepEqual(input.actorBusy, { hero: false, police: false });
  assert.deepEqual(input.placements, NONE);
  assert.equal(input.reducedMotion, false);
  assert.equal(input.frameIntervalMs, 0);
  assert.equal(input.bestDistance, null);
  assert.deepEqual(input.evaluationSegments, [segment], 'evaluation segments are never dropped');
  assert.equal(input.playId, 'p'); assert.equal(input.policeStage, 1); assert.equal(input.building, 3); assert.equal(input.moving, true);
  assert.equal('priority' in input, false, 'no visual-side priority (the controller owns suppression)');
  assert.equal(JSON.stringify(presentation), before, 'the App view is not mutated');
  update(stage, undefined);
  assert.equal(controller.calls.length, 1, 'no presentation, no step');
  update(stage, view(5016));
  assert.equal(controller.calls.length, 2);
  assert.equal(stage.presentationStats().mode, 'extended96');
  stage.dispose();
});

test('DOM stage: bestDistance is the stage value and invalid values become null', () => {
  const controller = spyController();
  const stage = domStage({ presentationSet: 'extended96', gameExtrasController: controller });
  update(stage, view(0));
  for (const [value, expected] of [[0, 0], [25, 25], [50, 50], [51, null], [-1, null], [2.5, null], [undefined, null], [null, null], [NaN, null], ['7', null]]) {
    stage.setBestDistance(value);
    update(stage, view(controller.calls.length * 16 + 16));
    assert.equal(controller.calls.at(-1).bestDistance, expected, `bestDistance ${String(value)}`);
  }
  stage.dispose();
});

test('frameIntervalMs is the running presentation.t difference; first, paused, hidden and invalid frames are 0', () => {
  const controller = spyController();
  const stage = domStage({ presentationSet: 'extended96', gameExtrasController: controller });
  const intervals = [];
  const run = (presentation) => { update(stage, presentation); intervals.push(controller.calls.at(-1).frameIntervalMs); };
  run(view(1000));                              // 初回 0
  run(view(1016));                              // 16
  run(view(1033));                              // 17
  run(view(1233));                              // 200（遅いフレームも差のまま）
  run(view(1233));                              // 同じ t は 0
  run(view(1250, { running: false }));          // 停止 0
  run(view(1266));                              // 停止の直後は基準が無いので 0
  run(view(1282));                              // 16
  run(view(1298, { hidden: true }));            // 非表示 0
  run(view(1314));                              // 非表示の直後は 0
  run(view(1330));                              // 16
  run(view(1300));                              // 逆行 0
  run(view(1316));                              // 逆行の直後は新しい基準 16
  run(view(1316.5));                            // 整数でない t は 0
  run(view(1332));                              // 基準が無いので 0
  run(view(NaN));                               // 不正は 0
  run(view(1348));                              // 0
  assert.deepEqual(intervals, [0, 16, 17, 200, 0, 0, 0, 16, 0, 0, 16, 0, 16, 0, 0, 0, 0]);
  assert.ok(intervals.every((value) => Number.isFinite(value) && value >= 0));
  stage.dispose();
});

test('reducedMotion is read from prefers-reduced-motion as a boolean on every step, and the subscription is released once', () => {
  const media = fakeMedia(false);
  const controller = spyController();
  const stage = domStage({ presentationSet: 'extended96', gameExtrasController: controller });
  update(stage, view(0));
  assert.equal(controller.calls.at(-1).reducedMotion, false);
  media.set(true);
  update(stage, view(16));
  assert.equal(controller.calls.at(-1).reducedMotion, true);
  media.matches = false;
  update(stage, view(32));
  assert.equal(controller.calls.at(-1).reducedMotion, false);
  assert.equal(media.listenerCount(), 0, 'the simple stage has nothing to retract, so it keeps no subscription');
  stage.dispose(); stage.dispose();
  assert.equal(media.listenerCount(), 0);
  update(stage, view(48));
  assert.equal(controller.calls.length, 3, 'a disposed stage does not step');
  // matchMedia が無い環境でも boolean
  delete globalThis.matchMedia;
  const other = spyController();
  const stage2 = domStage({ presentationSet: 'extended96', gameExtrasController: other });
  update(stage2, view(0));
  assert.strictEqual(other.calls[0].reducedMotion, false);
  stage2.dispose();
  // addListener しか無い古い環境
  const legacy = { matches: true, listeners: new Set(), addListener(fn) { legacy.listeners.add(fn); }, removeListener(fn) { legacy.listeners.delete(fn); } };
  globalThis.matchMedia = () => legacy;
  const stage3 = domStage({ presentationSet: 'extended96', gameExtrasController: other });
  update(stage3, view(0));
  assert.strictEqual(other.calls.at(-1).reducedMotion, true);
  assert.equal(legacy.listeners.size, 0);
  stage3.dispose();
  const watched = createExtendedStepper({ controller: other, onReducedMotionChange: () => {} });
  assert.equal(legacy.listeners.size, 1);
  watched.dispose(); watched.dispose();
  assert.equal(legacy.listeners.size, 0);
});

test('the stepper reports reduced-motion changes through its callback and stops after dispose', () => {
  assert.equal(typeof createExtendedStepper, 'function');
  const media = fakeMedia(false);
  const changes = [];
  const stepper = createExtendedStepper({ controller: spyController(), onReducedMotionChange: (matches) => changes.push(matches) });
  media.set(true); media.set(false);
  assert.deepEqual(changes, [true, false]);
  stepper.dispose(); stepper.dispose();
  media.set(true);
  assert.deepEqual(changes, [true, false]);
});

test('the stepper passes placements and actor busy through and does not read them from the presentation', () => {
  fakeMedia(false);
  const controller = spyController();
  const stepper = createExtendedStepper({ controller });
  const placements = { ...NONE, railway: true, midpoint: true, policeSettled: true, existing: { 12: false } };
  stepper.step(view(0, { drawable: true, placements: { water: true }, actorBusy: { hero: true } }), { drawable: true, actorBusy: { hero: false, police: true }, placements });
  const input = controller.calls[0];
  assert.equal(input.drawable, true);
  assert.deepEqual(input.actorBusy, { hero: false, police: true });
  assert.deepEqual(input.placements, placements);
  stepper.dispose();
});

test('extended96 DOM stage with the real controller keeps the evaluation segment and the one-time badge claim (no stage-side suppression)', async () => {
  fakeMedia(false);
  let claims = 0;
  const controller = createGameExtrasController({ playId: 'p', rules: RULES_V1, seed: 1, extrasPort: { fresh: true, claimCameoStart: () => true, claimPrecisionBadge: async () => { claims++; return true; } } });
  const stage = domStage({ presentationSet: 'extended96', gameExtrasController: controller });
  const segment = { building: 3, from: 11500, to: 12000, matchUnits: 98000000, unitsPerPercent: 1000000, evaluationEnd: 14500 };
  update(stage, view(11000));
  update(stage, view(12000, { evaluationSegments: [segment] }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.snapshot().precisionBadge?.kind, 'nearPerfect');
  assert.equal(claims, 1);
  update(stage, view(12100, { guideActive: false, warningActive: false }));
  assert.equal(controller.snapshot().precisionBadge.elapsedMs, 100, 'the badge keeps running through plain frames');
  assert.deepEqual(controller.snapshot().cameo, null, 'no cameo is placeable in the simple stage');
  stage.dispose(); controller.dispose();
});

test('legacy80 DOM stage keeps its stats shape and hides nothing new', () => {
  const stage = domStage();
  assert.deepEqual(Object.keys(stage.presentationStats()).sort(), ['activeIds', 'ambientParticles', 'drawCalls', 'enabled', 'geometries', 'mode', 'staticDecorations', 'textures']);
  stage.dispose();
});
