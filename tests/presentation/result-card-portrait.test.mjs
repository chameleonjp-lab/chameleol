import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createResultPortrait, createPosedHero, alphaBounds, portraitSize, PORTRAIT_MAX_BYTES, destroyResultRenderer } from '../../src/presentation/result-portrait.js';
import { OUTLINE_STAGES } from '../../src/scene/chameleon-outline.js';
import { installFakeCanvas } from './helpers/fake-canvas.mjs';

const hero = (over = {}) => ({ status: 'matched', building: 5, hsv: { h: 9000, s: 6000, v: 8000 }, outlineBuilding: 5, average: 90, instantMatch: 95, ...over });

function fakeRig() {
  const calls = [];
  const group = { rotation: { y: 0 }, isObject3D: false };
  return {
    calls,
    group: Object.assign(new (class { constructor() { this.children = []; this.rotation = { y: 0 }; this.parent = null; } add() {} })(), {}),
    head: { rotation: { z: 0 } },
    jewel: { visible: false },
    setColor(rgb) { calls.push(['color', rgb]); },
    setOutlineStyle(style) { calls.push(['outline', style.stage]); },
    animate(t, o) { calls.push(['animate', t, o]); },
    dispose() { calls.push(['dispose']); },
    _g: group,
  };
}

function setup() {
  const { window } = parseHTML('<html><body></body></html>');
  const ctxOf = installFakeCanvas(window);
  const created = [];
  const createCanvas = () => { const c = window.document.createElement('canvas'); created.push(c); return c; };
  return { window, ctxOf, created, createCanvas };
}

function lease(renderer, signal = new AbortController().signal) { return { renderer, signal, release() {} }; }
const fakeRenderer = (onRender = () => {}, window) => ({ renders: 0, sizes: [], domElement: window?.document.createElement('canvas') ?? {}, setPixelRatio() {}, setSize(w, h) { this.sizes.push([w, h]); }, render() { this.renders += 1; onRender(); } });

test('the outline stage comes from hero.outlineBuilding and a missing hero uses stage 1', () => {
  const rigA = fakeRig();
  createPosedHero(hero({ outlineBuilding: 5 }), { createModel: () => rigA });
  assert.deepEqual(rigA.calls.find((c) => c[0] === 'outline'), ['outline', OUTLINE_STAGES[0].stage]);
  const rigB = fakeRig();
  createPosedHero(hero({ outlineBuilding: 45 }), { createModel: () => rigB });
  assert.deepEqual(rigB.calls.find((c) => c[0] === 'outline'), ['outline', 7]);
  const rigC = fakeRig();
  createPosedHero(hero({ status: 'missing', building: null, outlineBuilding: 1 }), { createModel: () => rigC });
  assert.deepEqual(rigC.calls.find((c) => c[0] === 'outline'), ['outline', 0]);
  const color = rigA.calls.find((c) => c[0] === 'color')[1];
  assert.ok(color.every((v) => v >= 0 && v <= 1), 'the real color is passed through the in-game conversion');
});

test('alpha bounds add a 4px margin and the crop is limited to 360x480 (691,200 bytes)', () => {
  const w = 20, h = 10, data = new Uint8ClampedArray(w * h * 4);
  data[(3 * w + 5) * 4 + 3] = 255;
  data[(6 * w + 9) * 4 + 3] = 255;
  assert.deepEqual(alphaBounds(data, w, h), { x: 1, y: 0, w: 13, h: 10 });
  assert.equal(alphaBounds(new Uint8ClampedArray(16), 2, 2), null);
  assert.deepEqual(portraitSize(300, 400), { w: 300, h: 400 });
  const big = portraitSize(720, 960);
  assert.deepEqual(big, { w: 360, h: 480 });
  assert.ok(big.w * big.h * 4 <= PORTRAIT_MAX_BYTES);
  assert.equal(360 * 480 * 4, 691_200);
});

test('an aborted capture throws AbortError before and during rendering and never touches the renderer afterwards', async () => {
  const { window, createCanvas } = setup();
  const aborted = new AbortController();
  aborted.abort();
  const renderer = fakeRenderer(() => {}, window);
  await assert.rejects(createResultPortrait({ hero: hero(), signal: aborted.signal, rendererLease: lease(renderer) }, { createCanvas, createModel: fakeRig }), { name: 'AbortError' });
  assert.equal(renderer.renders, 0);
  // リース側の中断（撮影優先で取り上げられた時）も同じ
  const leaseAbort = new AbortController();
  const r2 = fakeRenderer(() => leaseAbort.abort(), window);
  await assert.rejects(createResultPortrait({ hero: hero(), signal: new AbortController().signal, rendererLease: lease(r2, leaseAbort.signal) }, { createCanvas, createModel: fakeRig }), { name: 'AbortError' });
  assert.equal(r2.renders, 1);
});

test('a capture without a lease fails instead of creating its own renderer', async () => {
  const { createCanvas } = setup();
  await assert.rejects(createResultPortrait({ hero: hero(), signal: new AbortController().signal, rendererLease: null }, { createCanvas, createModel: fakeRig }), /unavailable/);
});

test('a successful capture returns a 2D canvas inside the byte limit that outlives the renderer, and frees every temporary', async () => {
  const { window, createCanvas, created } = setup();
  const rig = fakeRig();
  const renderer = fakeRenderer(() => {}, window);
  // 不透明な範囲を作る：getImageData を差し替えた文脈で 200x300 の塊を返す。
  const original = window.document.createElement('canvas');
  const proto = Object.getPrototypeOf(original);
  const baseGet = proto.getContext;
  proto.getContext = function patched(kind, opts) {
    const ctx = baseGet.call(this, kind, opts);
    ctx.getImageData = (x, y, w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 100; yy < 400; yy += 1) for (let xx = 100; xx < 300; xx += 1) data[(yy * w + xx) * 4 + 3] = 255;
      return { data, width: w, height: h };
    };
    return ctx;
  };
  const result = await createResultPortrait({ hero: hero(), signal: new AbortController().signal, rendererLease: lease(renderer) }, { createCanvas, createModel: () => rig });
  assert.equal(renderer.renders, 1);
  assert.deepEqual(renderer.sizes[0], [480, 720]);
  assert.equal(result.image.width, 208);
  assert.equal(result.image.height, 308);
  assert.ok(result.image.width * result.image.height * 4 <= PORTRAIT_MAX_BYTES);
  assert.equal(created.length, 2, 'one scratch canvas and the result canvas');
  const scratch = created.find((c) => c !== result.image);
  assert.equal(scratch.width, 0, 'the temporary canvas is freed');
  assert.ok(rig.calls.some((c) => c[0] === 'dispose'), 'the model is disposed');
  // 描画器を壊した後も使える
  destroyResultRenderer(renderer);
  assert.equal(result.image.width, 208);
  result.dispose();
  assert.equal(result.image.width, 0);
});

test('destroying a renderer twice is harmless and empties its canvas', () => {
  const canvas = { width: 100, height: 100, removed: 0, remove() { this.removed += 1; } };
  const calls = [];
  const renderer = { domElement: canvas, dispose: () => calls.push('dispose'), forceContextLoss: () => calls.push('loss') };
  destroyResultRenderer(renderer);
  destroyResultRenderer(renderer);
  assert.deepEqual([canvas.width, canvas.height], [0, 0]);
  assert.ok(calls.includes('dispose') && calls.includes('loss'));
  destroyResultRenderer(null);
});
