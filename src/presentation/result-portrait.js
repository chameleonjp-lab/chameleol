// 結果の主人公No.28。カード用の撮影と、E090（回して見る）の表示が同じ色・輪郭・姿勢を使う。
// 描画器はここで勝手に作らない（作るのは所有者だけ。createResultRenderer は ports 経由で所有者へ渡る）。
import * as THREE from 'three';
import { createChameleon } from '../scene/characters.js';
import { outlineForBuilding } from '../scene/chameleon-outline.js';
import { rgbFloat } from '../scene/palette-colors.js';

export const PORTRAIT_RENDER_SIZE = Object.freeze({ width: 480, height: 720 });
export const PORTRAIT_MAX = Object.freeze({ width: 360, height: 480 });
export const PORTRAIT_MAX_BYTES = 691_200;
export const PORTRAIT_MARGIN = 4;

const abortError = () => {
  try { return new DOMException('The operation was aborted.', 'AbortError'); } catch { const e = new Error('Aborted'); e.name = 'AbortError'; return e; }
};
const throwIfAborted = (...signals) => { if (signals.some((s) => s?.aborted)) throw abortError(); };

/** 描画器を作る（所有者の createRenderer）。色は本編と同じ扱い（色管理なし・トーンなし）で、実色を保つ。 */
export function createResultRenderer() {
  try {
    THREE.ColorManagement.enabled = false;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(1);
    return renderer;
  } catch {
    return null;
  }
}

/** 描画器を壊す。何度呼んでもよい（dispose → コンテキスト解放 → canvas を 0×0 → DOM から外す）。 */
export function destroyResultRenderer(renderer) {
  if (!renderer) return;
  const canvas = renderer.domElement;
  try { renderer.dispose?.(); } catch { /* 続けて解放する */ }
  try { renderer.forceContextLoss?.(); } catch { /* 続けて解放する */ }
  try { renderer.renderLists?.dispose?.(); } catch { /* 続けて解放する */ }
  if (canvas) {
    try { canvas.width = 0; canvas.height = 0; } catch { /* noop */ }
    try { canvas.remove?.(); } catch { /* noop */ }
  }
}

/** カードとE090が共通で使う姿勢の主人公を作る。色は処理側の model.hero.hsv、輪郭は hero.outlineBuilding の段階。 */
export function createPosedHero(hero, { createModel = createChameleon, colorOf = rgbFloat, outlineOf = outlineForBuilding } = {}) {
  const rig = createModel();
  try {
    if (hero?.hsv) rig.setColor(colorOf(hero.hsv));
    rig.setOutlineStyle(outlineOf(Number.isInteger(hero?.outlineBuilding) ? hero.outlineBuilding : 1));
    rig.animate(0.7, { walking: false });
    rig.group.rotation.y = -0.35;
    rig.head.rotation.z = 0.12;
    rig.jewel.visible = true;
  } catch (error) {
    rig.dispose?.();
    throw error;
  }
  return rig;
}

/** 不透明（alpha>20）の範囲を ±margin で囲む。何も無ければ null。 */
export function alphaBounds(data, width, height, margin = PORTRAIT_MARGIN, threshold = 20) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x0 = Math.max(0, minX - margin), y0 = Math.max(0, minY - margin);
  const x1 = Math.min(width, maxX + 1 + margin), y1 = Math.min(height, maxY + 1 + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 切り抜きの大きさ。360×480 を超える時は縦横比を保って縮める。 */
export function portraitSize(w, h) {
  const k = Math.min(1, PORTRAIT_MAX.width / w, PORTRAIT_MAX.height / h);
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)) };
}

/**
 * 主人公を1枚の切り抜き画像にする。描画器は rendererLease.renderer を使い、自分では作らない。
 * 返す image は 2D canvas で、描画器を壊した後も使える。中断された時は AbortError を投げる。
 */
export async function createResultPortrait({ hero, signal, rendererLease } = {}, deps = {}) {
  const makeCanvas = deps.createCanvas ?? (() => globalThis.document.createElement('canvas'));
  throwIfAborted(signal, rendererLease?.signal);
  const renderer = rendererLease?.renderer;
  if (!renderer) throw new Error('Rendering context unavailable');
  let rig = null, scene = null, scratch = null, output = null;
  try {
    renderer.setPixelRatio?.(1);
    renderer.setSize(PORTRAIT_RENDER_SIZE.width, PORTRAIT_RENDER_SIZE.height, false);
    const camera = new THREE.PerspectiveCamera(32, PORTRAIT_RENDER_SIZE.width / PORTRAIT_RENDER_SIZE.height, 0.1, 100);
    camera.position.set(5, 3.2, 8);
    camera.lookAt(0, 1.45, 0);
    rig = createPosedHero(hero, deps);
    scene = new THREE.Scene();
    scene.add(rig.group);
    throwIfAborted(signal, rendererLease?.signal);
    renderer.render(scene, camera);
    scratch = makeCanvas();
    scratch.width = PORTRAIT_RENDER_SIZE.width;
    scratch.height = PORTRAIT_RENDER_SIZE.height;
    const sctx = scratch.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(renderer.domElement, 0, 0);
    throwIfAborted(signal, rendererLease?.signal);
    const box = alphaBounds(sctx.getImageData(0, 0, scratch.width, scratch.height).data, scratch.width, scratch.height);
    if (!box) throw new Error('Empty portrait');
    const size = portraitSize(box.w, box.h);
    output = makeCanvas();
    output.width = size.w;
    output.height = size.h;
    output.getContext('2d').drawImage(scratch, box.x, box.y, box.w, box.h, 0, 0, size.w, size.h);
    throwIfAborted(signal, rendererLease?.signal);
    if (size.w * size.h * 4 > PORTRAIT_MAX_BYTES) throw new Error('Portrait too large');
    const image = output;
    output = null;
    return { image, dispose() { image.width = 0; image.height = 0; } };
  } finally {
    if (output) { output.width = 0; output.height = 0; }
    if (scratch) { scratch.width = 0; scratch.height = 0; }
    if (scene && rig) scene.remove(rig.group);
    rig?.dispose?.();
  }
}
