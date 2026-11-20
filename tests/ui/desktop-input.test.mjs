import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerRouter } from '../../src/ui/pointer-router.js';
import { pointFromHs } from '../../src/rules/v1/index.js';
import {
  hasDesktopControls, normalizeScrollSpeed, wheelBrightnessDelta,
  keyBrightnessDelta, createBrightnessInput,
} from '../../src/ui/desktop-input.js';

const GEO = {
  palette: { cx: 150, cy: 150, r: 120 },
  bar: { x: 320, y: 30, w: 52, h: 240 },
};

test('PC判定: 細かいポインター＋ホバーを要求し、スマホとiPadは除外', () => {
  const fine = () => ({ matches: true });
  assert.equal(hasDesktopControls({ navigator: { userAgent: 'Mozilla/5.0 Windows NT 10.0' }, matchMedia: fine }), true);
  assert.equal(hasDesktopControls({ navigator: { userAgent: 'Mozilla/5.0 iPhone' }, matchMedia: fine }), false);
  assert.equal(hasDesktopControls({ navigator: { userAgent: 'Mozilla/5.0 Android' }, matchMedia: fine }), false);
  assert.equal(hasDesktopControls({ navigator: { userAgent: 'Mozilla/5.0 Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }, matchMedia: fine }), false);
  assert.equal(hasDesktopControls({ navigator: { userAgentData: { mobile: true } }, matchMedia: fine }), false);
  assert.equal(hasDesktopControls({ navigator: { userAgent: 'Windows NT 10.0' }, matchMedia: () => ({ matches: false }) }), false);
  assert.equal(hasDesktopControls({ navigator: {}, matchMedia: null }), false);
});

test('速度は25%～300%、25%刻み。無効値は100%へ戻す', () => {
  assert.equal(normalizeScrollSpeed(undefined), 100);
  assert.equal(normalizeScrollSpeed(''), 100);
  assert.equal(normalizeScrollSpeed('abc'), 100);
  assert.equal(normalizeScrollSpeed(10), 25);
  assert.equal(normalizeScrollSpeed(112), 100);
  assert.equal(normalizeScrollSpeed(162), 150);
  assert.equal(normalizeScrollSpeed(9999), 300);
});

test('PCパレット: 押さずにカーソル移動で色を変え、円外・停止中・指操作中は保持', () => {
  const changes = [];
  const router = createPointerRouter({ onChange: (v, meta) => changes.push({ v, meta }) });
  router.setGeometry(GEO);
  const p = pointFromHs(9000, 6000, GEO.palette.r);
  assert.equal(router.hoverPalette(GEO.palette.cx + p.dx, GEO.palette.cy + p.dy), true);
  assert.deepEqual(router.values, { h: 9000, s: 6000, v: 10000 });
  assert.equal(changes.at(-1).meta.phase, 'move');
  assert.equal(router.activeParts().length, 0, 'ホバーで指の割り当ては取らない');
  assert.equal(router.hoverPalette(900, 900), false);
  assert.equal(router.values.h, 9000);
  router.down(1, GEO.palette.cx, GEO.palette.cy - 30);
  assert.equal(router.hoverPalette(GEO.palette.cx + p.dx, GEO.palette.cy + p.dy), false);
  router.up(1);
  router.setEnabled(false);
  assert.equal(router.hoverPalette(150, 150), false);
  assert.equal(router.values.h, 0);
});

test('バー: 未開放・停止中・ドラッグ中のキー／ホイール操作は拒否', () => {
  const router = createPointerRouter();
  router.setGeometry(GEO);
  assert.equal(router.adjustBrightness(-1000), false);
  assert.equal(router.values.v, 10000);
  router.setBarLocked(false);
  assert.equal(router.adjustBrightness(-500), true);
  assert.equal(router.values.v, 9500);
  router.down(1, 346, 150);
  assert.equal(router.adjustBrightness(-1000), false);
  assert.equal(router.values.v, 5000);
  router.up(1);
  assert.equal(router.adjustBrightness(10000), true);
  assert.equal(router.values.v, 10000);
  assert.equal(router.adjustBrightness(-10000), true);
  assert.equal(router.values.v, 0);
  router.setEnabled(false);
  assert.equal(router.adjustBrightness(200), false);
  assert.equal(router.values.v, 0);
});

test('マウスホイールは上で明るく、下で暗く。トラックパッド・行・ページ単位を同じ基準に変換', () => {
  assert.equal(wheelBrightnessDelta({ deltaY: -100, deltaMode: 0 }, 100), 500);
  assert.equal(wheelBrightnessDelta({ deltaY: 100, deltaMode: 0 }, 200), -1000);
  assert.equal(wheelBrightnessDelta({ deltaY: -3, deltaMode: 1 }, 100), 240);
  assert.equal(wheelBrightnessDelta({ deltaY: 1, deltaMode: 2 }, 100, 240), -1200);
  assert.equal(wheelBrightnessDelta({ deltaY: NaN }, 100), 0);
  assert.equal(keyBrightnessDelta('ArrowUp'), 200);
  assert.equal(keyBrightnessDelta('ArrowDown'), -200);
  assert.equal(keyBrightnessDelta('W'), 200);
  assert.equal(keyBrightnessDelta('s'), -200);
  assert.equal(keyBrightnessDelta('a'), 0);
});

test('本編と設定の共通ドライバー: 少量スクロールも積算し、入力中と拡大操作を保護', () => {
  let value = 5000;
  let allowed = true;
  let speed = 100;
  const input = createBrightnessInput({
    read: () => value,
    write: (v) => { value = v; },
    canOperate: () => allowed,
    speed: () => speed,
  });
  const wheel = (deltaY, extra = {}) => input.wheel({ deltaY, deltaMode: 0, ...extra });
  assert.equal(wheel(-0.1), true);
  assert.equal(value, 5000, '小さな動きでは丸めで消えないよう繰り越す');
  assert.equal(wheel(-0.1), true);
  assert.equal(value, 5001);
  assert.equal(wheel(-100), true);
  assert.equal(value, 5501);
  speed = 200;
  assert.equal(wheel(100), true);
  assert.equal(value, 4501);
  assert.equal(input.keydown({ key: 'ArrowUp' }), true);
  assert.equal(value, 4701);
  assert.equal(input.keydown({ key: 'S' }), true);
  assert.equal(value, 4501);
  assert.equal(input.keydown({ key: 'ArrowDown', target: { closest: () => ({ tagName: 'INPUT' }) } }), false);
  assert.equal(input.keydown({ key: 'w', ctrlKey: true }), false);
  assert.equal(wheel(-100, { ctrlKey: true }), false, 'トラックパッドのピンチ拡大を奪わない');
  allowed = false;
  assert.equal(wheel(-100), false);
  assert.equal(input.keydown({ key: 'w' }), false);
  assert.equal(value, 4501);
});

test('画面切替後のグローバル入力は破棄し、非PCでは登録しない', async () => {
  const { parseHTML } = await import('linkedom');
  const { createControls } = await import('../../src/ui/controls.js');
  const { document, window } = parseHTML('<html><body></body></html>');
  const prev = Object.fromEntries(['document', 'Node', 'addEventListener', 'removeEventListener'].map((k) => [k, globalThis[k]]));
  const listeners = new Map();
  let controls;
  Object.assign(globalThis, {
    document, Node: window.Node,
    addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  });
  try {
    const changes = [];
    controls = createControls({ desktop: true, scrollSpeed: 150, onChange: (v) => changes.push(v) });
    document.body.append(controls.el);
    controls.router.setGeometry(GEO);
    controls.setLocked(false);
    assert.equal(listeners.get('wheel')?.size, 1);
    assert.equal(listeners.get('keydown')?.size, 1);
    const wheelFn = [...listeners.get('wheel')][0];
    let prevented = 0;
    wheelFn({ deltaY: 100, deltaMode: 0, target: document.body, preventDefault() { prevented++; } });
    assert.equal(controls.values.v, 9250);
    assert.equal(prevented, 1);
    const keyFn = [...listeners.get('keydown')][0];
    keyFn({ key: 'w', target: document.body, preventDefault() { prevented++; } });
    assert.equal(controls.values.v, 9450);
    controls.setEnabled(false);
    wheelFn({ deltaY: 100, target: document.body, preventDefault() { prevented++; } });
    assert.equal(controls.values.v, 9450);
    controls.destroy();
    controls = null;
    assert.equal(listeners.get('wheel')?.size, 0);
    assert.equal(listeners.get('keydown')?.size, 0);
    const mobile = createControls({ desktop: false });
    assert.equal(listeners.get('wheel')?.size, 0);
    mobile.destroy();
    assert.ok(changes.length >= 2);
  } finally {
    controls?.destroy();
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
