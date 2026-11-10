// ホーム画面の飾り：カメレオン No.28（提供されたデザインの緑 #58c43c そのまま）。
// 遊ぶ画面（street.js）と同じモデル（chameleon28.js）を、別の小さな描画で見せる。ホームを離れたら片付ける。
import * as THREE from 'three';
import { createChameleon } from './chameleon28.js';

function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** ホーム用：ゆっくり向きを変えるカメレオン（デザインの緑そのまま）。 */
export function createShowcase(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.className = 'showcase-canvas';
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.8, 8.6);
  camera.lookAt(0, 1.45, 0);
  // モデルの原点は両足の間の地面、+x が顔の向き、高さは約3
  const hero = createChameleon();
  hero.setColor([0x58 / 255, 0xc4 / 255, 0x3c / 255]);
  hero.jewel.visible = true; // 尻尾に隠した宝石を少し見せる
  scene.add(hero.group);
  const shadowTex = radialTexture('rgba(0,0,0,0.35)');
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  scene.add(shadow);
  const BASE_YAW = -0.85; // 顔を少しこちらへ向ける
  let raf = 0;
  let last = performance.now();
  let alive = true;
  const resize = () => {
    const r = container.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  const loop = () => {
    if (!alive) return;
    const now = performance.now();
    hero.animate(Math.min(0.1, (now - last) / 1000), { walking: false });
    hero.group.rotation.y = BASE_YAW + Math.sin(now / 2400) * 0.35;
    last = now;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  resize();
  loop();
  return {
    hero,
    resize,
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      hero.dispose?.();
      shadow.geometry.dispose();
      shadow.material.dispose();
      shadowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
