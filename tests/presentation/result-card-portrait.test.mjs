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
  assert.deepEqual(renderer.sizes[0], [472, 708]);
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

test('portrait capture includes offscreen surfaces, readback and the real No.28 eye image in its peak budget', async (t) => {
  const { window } = setup();
  const doc = window.document, previous = globalThis.document;
  globalThis.document = doc;
  const surfaces = new Set();let peak = 0, largestRead = 0;
  const measure = (readback = 0) => {
    const held = [...surfaces].reduce((sum,c) => sum + c.width*c.height*4, 0);
    peak = Math.max(peak, 11_673_600 + 756_000 + held + readback);
  };
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag, ...args) => {
    const canvas = create(tag, ...args);
    if (tag !== 'canvas') return canvas;
    let w = canvas.width || 300, h = canvas.height || 150;
    Object.defineProperties(canvas, {
      width: { configurable:true,get:()=>w,set:v=>{w=Number(v);measure();} },
      height: { configurable:true,get:()=>h,set:v=>{h=Number(v);measure();} },
    });
    surfaces.add(canvas);
    const get = canvas.getContext.bind(canvas);
    canvas.getContext = (...params) => {
      const ctx = get(...params);
      ctx.getImageData = (_x,_y,width,height) => {
        const data = new Uint8ClampedArray(width*height*4).fill(255);
        largestRead = Math.max(largestRead,data.byteLength);measure(data.byteLength);
        return { data,width,height };
      };
      return ctx;
    };
    return canvas;
  };
  try {
    const canvas = doc.createElement('canvas');
    const renderer = { domElement:canvas,setPixelRatio(){},setSize(w,h){canvas.width=w;canvas.height=h;},render(){} };
    // Use the production model, including its 256x256 eye texture; only GPU drawing is substituted.
    const result = await createResultPortrait({ hero:hero(),signal:new AbortController().signal,rendererLease:lease(renderer) });
    assert.ok([...surfaces].some(c=>c.width===256&&c.height===256),'the eye image is included');
    assert.ok(largestRead>0,'the readback buffer is counted at its real allocation point');
    assert.ok(peak<=16_777_216,`capture peak ${peak} exceeds the 16MiB image budget`);
    t.diagnostic(`capture peak including offscreen surfaces, readback and eye image: ${peak} bytes`);
    assert.ok(result.image.width*result.image.height*4<=691_200);
    result.dispose();
  } finally {
    doc.createElement = create;
    if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
  }
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
