// 横スクロールの街（Three.js）。カメラは横向きに固定し、近景（判定に使う建物）と遠景（ゆっくり動く）で奥行きを作る。
// - 50棟を同時には作らない。今の棟の前後だけを4つの枠で使い回す（GEN-07）。
// - 比較面（壁・体）は照明・色調整を使わない。空・遠景・道路の色だけ時間帯で変える（COLOR-03）。
// - 判定の基準点はカメレオンの胴体中心に当たる x 座標。歩行のアニメーションでは動かさない（TIME-02）。
import * as THREE from 'three';
import { RULES_V1 } from '../rules/v1/index.js';
import { areaOf } from '../rules/v1/course.js';
import { createChameleon, createFerret, createJewelryShop } from './characters.js';
import { SKY, rgbFloat } from './palette-colors.js';

const W = 10; // 1棟の幅（ワールド座標）
const SLOTS = 4;
const PLAYER_SCREEN_X = 0.32; // 画面の左から32%に主人公

function lerpColor(a, b, k) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, k);
}

function makeBuildingSlot() {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMat);
  wall.name = 'wall';
  group.add(wall);
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trimMat);
  group.add(roof);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0x2b3a4a });
  const windows = [];
  for (let i = 0; i < 4; i += 1) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), windowMat);
    group.add(w);
    windows.push(w);
  }
  const signMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), signMat);
  group.add(sign);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trimMat);
  group.add(door);
  return { group, wall, wallMat, roof, trimMat, windows, windowMat, sign, signMat, door, index: 0 };
}

function layoutSlot(slot, index, target, deco) {
  slot.index = index;
  const x0 = (index - 1) * W;
  const height = 9 * (deco.heightScale / 100);
  const margin = 0.25;
  const width = W - margin * 2;
  slot.group.position.set(x0 + W / 2, 0, 0);
  // 判定に使う外壁の基本色（照明なし・そのままの値）
  const [r, g, b] = rgbFloat(target);
  slot.wallMat.color.setRGB(r, g, b);
  slot.wall.scale.set(width, height, 1);
  slot.wall.position.set(0, height / 2, 0);
  // 屋根・縁（判定対象外。控えめに）
  slot.trimMat.color.setRGB(r * 0.55, g * 0.55, b * 0.55);
  slot.roof.scale.set(width + 0.5, deco.kind === 'house' ? 0.7 : 0.35, 1);
  slot.roof.position.set(0, height + (deco.kind === 'house' ? 0.35 : 0.17), 0.01);
  // 窓は主人公より高い位置にだけ置き、主人公のまわりは壁の色だけにする
  const dark = deco.trimTone % 2 === 0;
  slot.windowMat.color.set(dark ? 0x2b3a4a : 0x9fc6e6);
  slot.windows.forEach((w, i) => {
    w.visible = i < deco.windows;
    w.scale.set(1.1, 1.0, 1);
    w.position.set(-width / 2 + 1.4 + i * 2.1, Math.max(5.2, height - 1.6), 0.01);
  });
  slot.sign.visible = deco.sign >= 0;
  slot.signMat.color.set([0xff6f61, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0xf78c6b][Math.max(0, deco.sign)]);
  slot.sign.scale.set(2.2, 0.55, 1);
  slot.sign.position.set(width / 2 - 1.8, Math.max(4.6, height - 3.2), 0.01);
  slot.door.visible = deco.kind === 'house' || deco.kind === 'shop';
  slot.door.scale.set(1.0, 1.8, 1);
  slot.door.position.set(width / 2 - 0.9, 0.9, 0.01);
}

export function createThreeStage(container, { course, decorations, rules = RULES_V1, showOpeningShop = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  // 色をそのまま出す：色管理・トーンマッピングを使わない。
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.className = 'stage-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  camera.position.set(0, 0, 50);

  // 空（カメラに追従するグラデーション）
  const skyGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  const skyColors = new Float32Array(4 * 3);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));
  sky.position.z = -30;
  scene.add(sky);

  // 遠景（ゆっくり動く）
  const farMat = new THREE.MeshBasicMaterial({ color: SKY.day.far });
  const farGroup = new THREE.Group();
  farGroup.position.z = -20;
  for (let i = 0; i < 18; i += 1) {
    const hgt = 6 + ((i * 7919) % 9);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, hgt), farMat);
    m.position.set(i * 4.1, hgt / 2 + 1.5, 0);
    farGroup.add(m);
  }
  scene.add(farGroup);

  // 道路
  const roadMat = new THREE.MeshBasicMaterial({ color: SKY.day.road });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 3), roadMat);
  road.position.set(0, -1.5, 3);
  scene.add(road);
  const curbMat = new THREE.MeshBasicMaterial({ color: SKY.day.ground });
  const curb = new THREE.Mesh(new THREE.PlaneGeometry(200, 0.4), curbMat);
  curb.position.set(0, -0.05, 3.1);
  scene.add(curb);

  const slots = Array.from({ length: SLOTS }, makeBuildingSlot);
  slots.forEach((s) => scene.add(s.group));

  let shop = null;
  if (showOpeningShop) {
    shop = createJewelryShop(W - 0.5, 9);
    shop.position.set(-W / 2, 0, 0);
    scene.add(shop);
  }

  const hero = createChameleon();
  hero.group.position.z = 6;
  scene.add(hero.group);
  const ferrets = [createFerret(), createFerret()];
  ferrets.forEach((f) => {
    f.group.position.set(-100, 0, 5);
    f.group.scale.setScalar(0.85);
    scene.add(f.group);
  });

  // 発見演出の光と暗幕（演出中だけ）
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
  const darkPlane = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), darkMat);
  darkPlane.position.z = 5.5;
  darkPlane.visible = false;
  scene.add(darkPlane);
  const beams = [];
  for (let i = 0; i < 6; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 14, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.visible = false;
    beam.position.z = 5.8;
    scene.add(beam);
    beams.push(beam);
  }

  let viewW = 16;
  let viewH = 16;
  let playerX = 0;
  let lastFrame = performance.now();
  let ferretX = [-100, -100];
  let ending = null;

  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const hgt = Math.max(1, rect.height);
    renderer.setSize(w, hgt, false);
    const aspect = w / hgt;
    // 横に1.6棟分を見せる。縦が足りなければ縦を基準にする
    viewW = Math.max(16, 13 * aspect);
    viewH = viewW / aspect;
    camera.left = -viewW * PLAYER_SCREEN_X;
    camera.right = viewW * (1 - PLAYER_SCREEN_X);
    camera.top = viewH * 0.78;
    camera.bottom = -viewH * 0.22;
    camera.updateProjectionMatrix();
    sky.scale.set(viewW * 1.2, viewH * 1.2, 1);
  }

  function assignSlots(current) {
    const wanted = [current - 1, current, current + 1, current + 2].filter((i) => i >= 1 && i <= rules.buildingCount);
    for (const index of wanted) {
      if (slots.some((s) => s.index === index)) continue;
      const free = slots.find((s) => !wanted.includes(s.index));
      if (!free) continue;
      layoutSlot(free, index, course.targets[index - 1], decorations[index - 1]);
      free.group.visible = true;
    }
    for (const s of slots) if (!wanted.includes(s.index)) s.group.visible = false;
  }

  function setTimeOfDay(building, fraction) {
    const a = areaOf(Math.min(rules.buildingCount, building));
    const next = areaOf(Math.min(rules.buildingCount, building + 1));
    const k = a.time !== next.time ? Math.max(0, fraction - 0.4) / 0.6 : 0;
    const A = SKY[a.time];
    const B = SKY[next.time];
    const top = lerpColor(A.top, B.top, k);
    const bottom = lerpColor(A.bottom, B.bottom, k);
    // 平面の頂点順：左上、右上、左下、右下
    [top, top, bottom, bottom].forEach((c, i) => skyColors.set([c.r, c.g, c.b], i * 3));
    skyGeo.attributes.color.needsUpdate = true;
    farMat.color.copy(lerpColor(A.far, B.far, k));
    roadMat.color.copy(lerpColor(A.road, B.road, k));
    curbMat.color.copy(lerpColor(A.ground, B.ground, k));
  }

  resize();
  const onResize = () => resize();
  globalThis.addEventListener('resize', onResize);

  const api = {
    kind: 'three',
    renderer,
    /** 毎フレーム。t はゲーム内時刻、color は体色（HSV整数）、stage は警察の人数。 */
    update({ t, color, policeStage = 0, searching = false, nervous = 0, walking = true }) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      playerX = (t / rules.buildingMs) * W; // 判定と同じ時刻から位置を決める
      const building = Math.min(rules.buildingCount, Math.floor(t / rules.buildingMs) + 1);
      assignSlots(building);
      setTimeOfDay(building, (t % rules.buildingMs) / rules.buildingMs);
      camera.position.x = playerX;
      sky.position.set(playerX + viewW * (0.5 - PLAYER_SCREEN_X), viewH * 0.28, -30);
      // 遠景は主人公の35%の速さで流れる（同じ並びを繰り返す）
      farGroup.position.x = playerX - viewW * PLAYER_SCREEN_X - ((playerX * 0.35) % 4.1) - 4.1;
      hero.group.position.x = playerX;
      hero.setColor(rgbFloat(color));
      if (!ending) hero.animate(dt, { walking, nervous });
      // 警察：通常は画面外。段階に応じて近づき、回復で後退する
      const left = playerX - viewW * PLAYER_SCREEN_X;
      const targets = [policeStage >= 1 ? left + viewW * 0.1 : left - 6, policeStage >= 2 ? left + viewW * 0.02 - 2 : left - 9];
      ferrets.forEach((f, i) => {
        if (ferretX[i] < left - 12) ferretX[i] = left - 8 - i * 3;
        ferretX[i] += (targets[i] - ferretX[i]) * Math.min(1, dt * 2.2);
        f.group.position.x = ferretX[i];
        f.animate(dt, { walking: true, searching });
        f.beam.visible = policeStage >= 1;
      });
      if (shop) shop.visible = playerX < W * 1.5;
      renderer.render(scene, camera);
    },
    /** 練習用：目標の壁だけを見せる。 */
    showPractice(target) {
      slots.forEach((s, i) => {
        if (i === 0) {
          layoutSlot(s, 1, target, { heightScale: 100, kind: 'house', windows: 2, trimTone: 0, sign: -1 });
          s.group.position.x = 0.5 * W - W * 0.32;
          s.group.visible = true;
        } else s.group.visible = false;
      });
      ferrets.forEach((f) => (f.group.position.x = -100));
      if (shop) shop.visible = false;
    },
    renderPractice(color, target) {
      const s = slots[0];
      const [r, g, b] = rgbFloat(target);
      s.wallMat.color.setRGB(r, g, b);
      camera.position.x = 0;
      sky.position.set(viewW * (0.5 - PLAYER_SCREEN_X), viewH * 0.28, -30);
      setTimeOfDay(1, 0);
      hero.group.position.x = 0;
      hero.setColor(rgbFloat(color));
      const now = performance.now();
      hero.animate(Math.min(0.1, (now - lastFrame) / 1000), { walking: false });
      lastFrame = now;
      renderer.render(scene, camera);
    },
    /** 終了演出。結果は先に確定しているので、スキップしても結果は変わらない。 */
    async playEnding(kind, { signal } = {}) {
      ending = kind;
      const start = performance.now();
      const duration = kind === 'detected' ? 2600 : kind === 'cleared' ? 2400 : 600;
      ferrets.forEach((f) => (f.beam.visible = false));
      return new Promise((resolve) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / duration);
          if (kind === 'detected') {
            darkPlane.visible = true;
            darkMat.opacity = Math.min(0.85, k * 1.1);
            darkPlane.position.x = playerX;
            const n = Math.min(beams.length, Math.floor(k * (beams.length + 1)));
            beams.forEach((b, i) => {
              b.visible = i < n;
              const a = -0.9 + (i / (beams.length - 1)) * 1.8;
              b.position.set(playerX + Math.sin(a) * 7, 1.6 + Math.cos(a) * 7 * 0.6, 5.8);
              b.rotation.z = Math.PI + a;
              b.material.opacity = 0.25;
            });
          } else if (kind === 'cleared') {
            hero.jewel.visible = k > 0.25;
            hero.jewel.position.set(-1.05 + k * 1.2, 0.7 + k * 2.4, 0.4);
            hero.jewel.rotation.y += 0.08;
            hero.head.rotation.y = -0.5 * k;
            hero.tail.scale.set(1 + k * 0.25, 1 - k * 0.2, 1);
          }
          renderer.render(scene, camera);
          if (k >= 1 || signal?.aborted) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    /** 初回の開始演出：宝石店から飛び出し、宝石を尻尾に隠す。 */
    async playOpening({ signal } = {}) {
      const start = performance.now();
      const duration = 2800;
      hero.jewel.visible = true;
      return new Promise((resolve) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / duration);
          const x = -W * 0.6 + k * W * 0.6;
          camera.position.x = 0;
          sky.position.set(viewW * (0.5 - PLAYER_SCREEN_X), viewH * 0.28, -30);
          setTimeOfDay(1, 0);
          assignSlots(1);
          hero.group.position.x = x;
          hero.group.position.y = Math.max(0, Math.sin(k * Math.PI * 2) * 1.2 * (1 - k));
          hero.jewel.position.set(-1.05 + (1 - k) * 1.5, 0.7 + (1 - k) * 1.6, 0.4);
          hero.jewel.visible = k < 0.85;
          hero.animate(0.016, { walking: true });
          renderer.render(scene, camera);
          if (k >= 1 || signal?.aborted) {
            hero.group.position.y = 0;
            hero.jewel.visible = false;
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    resetEnding() {
      ending = null;
      darkPlane.visible = false;
      beams.forEach((b) => (b.visible = false));
      hero.jewel.visible = false;
      hero.tail.scale.set(1, 1, 1);
    },
    /** 検証用：ワールド座標の1点を、描画済みの画面から読む（8ビットのRGB）。 */
    pixelAt(worldX, worldY) {
      const v = new THREE.Vector3(worldX, worldY, 0).project(camera);
      const canvas = renderer.domElement;
      const px = Math.round(((v.x + 1) / 2) * canvas.width);
      const py = Math.round(((v.y + 1) / 2) * canvas.height);
      const gl = renderer.getContext();
      const buf = new Uint8Array(4);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return [buf[0], buf[1], buf[2]];
    },
    /** 検証用：棟 index の外壁（窓より下・主人公から離れた所）と、主人公の胴の色。 */
    sampleComparison(index) {
      const wallX = (index - 1) * W + W / 2 + 2.6;
      return { wall: api.pixelAt(wallX, 2.4), hero: api.pixelAt(playerX, 1.35 + 0.0) };
    },
    /** 描画物体の数（連戦での増加の確認用、SCOPE-03）。 */
    stats() {
      let objects = 0;
      scene.traverse(() => (objects += 1));
      return { objects, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls };
    },
    resize,
    dispose() {
      globalThis.removeEventListener('resize', onResize);
      hero.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  return api;
}
