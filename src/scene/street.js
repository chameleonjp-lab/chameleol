// 立体的な街（Three.js）。主人公の左後方の少し上から、進む方向の通りを斜めに見る遠近カメラ。
// - 判定に使う建物の正面と、主人公の体の中央は、照明・霧・色調整をかけずに判定と同じ8ビット値で描く（COLOR-03）。
//   立体感は、建物の側面・屋根・窓枠・ひさし・街灯・道路・遠景と、体の縁の陰影で出す。
// - 50棟を同時には作らない。今の棟の前後だけを5つの枠で使い回す（GEN-07）。
// - 判定の基準点（主人公の胴体の中心）の位置は時刻だけで決まり、歩行のアニメーションでは動かさない（TIME-02）。
import * as THREE from 'three';
import { RULES_V1 } from '../rules/v1/index.js';
import { areaOf } from '../rules/v1/course.js';
import { createChameleon28 } from './chameleon28.js';
import { createFerret, createJewelryShop } from './characters.js';
import { SKY, rgbFloat } from './palette-colors.js';

const W = 10; // 1棟の幅
const DEPTH = 7; // 建物の奥行き
const HERO_Z = 1.35; // 主人公は壁の少し手前を歩く
const HERO_SCALE = 0.62;
const HERO_YAW = 0.95; // 右（進む方向）を向き、少しこちらを見る
const SLOTS = 5;
const WINDOW_MIN_Y = 4.4; // 窓は主人公の背より上だけ
const CAM = { offset: new THREE.Vector3(-4.6, 3.9, 15.5), look: new THREE.Vector3(1.4, 4.3, 0), fov: 42 };

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const lerpHex = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);

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

function windowGridTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 14) {
      if (rnd() < 0.45) {
        g.fillStyle = rnd() < 0.5 ? '#ffd27a' : '#ffe9b0';
        g.fillRect(x, y, 7, 9);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 125, 125);
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 128);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 建物1棟分の枠。中身（色・高さ・窓・看板）は layout で入れ替えて使い回す。 */
function makeSlot(shared) {
  const group = new THREE.Group();
  const frontMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const sideMat = lambert(0xffffff);
  const roofMat = lambert(0x777777);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [sideMat, sideMat, roofMat, sideMat, frontMat, sideMat]);
  body.name = 'wall';
  group.add(body);
  const trimMat = lambert(0x666666);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), trimMat);
  group.add(cornice);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), trimMat);
  group.add(base);
  const roof = new THREE.Mesh(shared.roofGeo, lambert(0x8a4b3c));
  group.add(roof);
  const windows = [];
  for (let i = 0; i < 9; i += 1) {
    const w = new THREE.Group();
    const frame = new THREE.Mesh(shared.unitBox, trimMat);
    frame.scale.set(1.25, 1.45, 0.25);
    frame.position.z = 0.05;
    const glass = new THREE.Mesh(shared.unitBox, shared.glassDark);
    glass.scale.set(1.0, 1.2, 0.25);
    glass.position.z = 0.1;
    const sill = new THREE.Mesh(shared.unitBox, trimMat);
    sill.scale.set(1.5, 0.14, 0.45);
    sill.position.set(0, -0.78, 0.18);
    w.add(frame, glass, sill);
    w.userData.glass = glass;
    group.add(w);
    windows.push(w);
  }
  const door = new THREE.Group();
  const doorPanel = new THREE.Mesh(shared.unitBox, lambert(0x5b3d2b));
  doorPanel.scale.set(1.3, 2.5, 0.2);
  doorPanel.position.set(0, 1.25, 0.08);
  const step = new THREE.Mesh(shared.unitBox, trimMat);
  step.scale.set(1.9, 0.18, 0.8);
  step.position.set(0, 0.09, 0.35);
  const awning = new THREE.Mesh(shared.unitBox, lambert(0xd9534f));
  awning.scale.set(2.4, 0.14, 1.3);
  awning.position.set(0, 3.05, 0.62);
  awning.rotation.x = 0.28;
  door.add(doorPanel, step, awning);
  door.userData = { awning };
  group.add(door);
  const sign = new THREE.Mesh(shared.unitBox, lambert(0xffffff));
  group.add(sign);
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 10), shared.metal);
  pole.position.y = 2.8;
  const arm = new THREE.Mesh(shared.unitBox, shared.metal);
  arm.scale.set(0.9, 0.09, 0.09);
  arm.position.set(0.4, 5.5, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), shared.lampMat);
  head.position.set(0.85, 5.35, 0);
  lamp.add(pole, arm, head);
  lamp.position.set(-W / 2 + 0.1, 0, 0.55); // 建物の左端（境目）
  group.add(lamp);
  const planter = new THREE.Group();
  const pot = new THREE.Mesh(shared.unitBox, lambert(0x9c7a5b));
  pot.scale.set(1.1, 0.7, 0.8);
  pot.position.y = 0.35;
  const bush = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), shared.leaf);
  bush.position.y = 1.05;
  bush.scale.set(1.1, 0.9, 0.9);
  planter.add(pot, bush);
  group.add(planter);
  return { group, body, frontMat, sideMat, roofMat, trimMat, cornice, base, roof, windows, door, sign, lamp, planter, index: 0 };
}

const SIGN_COLORS = [0xff6f61, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0xf78c6b];
const AWNING_COLORS = [0xd9534f, 0x2a9d8f, 0xe9c46a, 0x6c5ce7];

function layoutSlot(slot, index, x0, target, deco, shared) {
  slot.index = index;
  const height = 9 * (deco.heightScale / 100) + (deco.kind === 'tower' ? 4 : deco.kind === 'office' ? 2 : 0);
  const margin = 0.25;
  const width = W - margin * 2;
  slot.group.position.set(x0 + W / 2, 0, 0);
  const [r, g, b] = rgbFloat(target);
  // 判定に使う正面（照明・霧なし、そのままの値）
  slot.frontMat.color.setRGB(r, g, b);
  // 側面・縁は同じ色を少し暗く（光と影がつく）
  slot.sideMat.color.setRGB(r * 0.82, g * 0.82, b * 0.82);
  slot.trimMat.color.setRGB(0.25 + r * 0.45, 0.25 + g * 0.45, 0.25 + b * 0.45);
  slot.roofMat.color.set(deco.kind === 'house' ? 0x7d4a3a : 0x6f7480);
  slot.body.scale.set(width, height, DEPTH);
  slot.body.position.set(0, height / 2, -DEPTH / 2);
  slot.cornice.scale.set(width + 0.5, 0.45, 0.9);
  slot.cornice.position.set(0, height + 0.22, 0.05);
  slot.base.scale.set(width + 0.1, 0.35, 0.3);
  slot.base.position.set(0, 0.17, 0.12);
  slot.roof.visible = deco.kind === 'house';
  slot.roof.scale.set(width + 0.8, 2.4, DEPTH + 0.8);
  slot.roof.position.set(0, height + 0.4, -DEPTH - 0.4);
  slot.roof.material.color.set(deco.roof === 0 ? 0x7d4a3a : deco.roof === 1 ? 0x4a5d7d : 0x5d7d4a);
  // 窓：主人公より高い位置だけ
  const cols = 3;
  const rows = Math.max(1, Math.min(3, Math.floor((height - WINDOW_MIN_Y - 0.6) / 2.2)));
  let n = 0;
  slot.windows.forEach((w) => (w.visible = false));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols && n < slot.windows.length; col += 1) {
      if (deco.windows < 2 && col === 1) continue;
      const w = slot.windows[n];
      n += 1;
      w.visible = true;
      w.position.set(-width / 2 + 1.7 + col * ((width - 3.4) / (cols - 1)), WINDOW_MIN_Y + 1 + row * 2.2, 0);
      w.userData.glass.material = (index * 7 + n * 3 + deco.trimTone) % 5 < 2 ? shared.glassLit : shared.glassDark;
    }
  }
  // 扉・ひさし（住宅と店）
  slot.door.visible = deco.kind === 'house' || deco.kind === 'shop';
  slot.door.position.set(width / 2 - 1.3, 0, 0);
  slot.door.userData.awning.visible = deco.kind === 'shop';
  slot.door.userData.awning.material.color.set(AWNING_COLORS[(index + deco.trimTone) % AWNING_COLORS.length]);
  slot.sign.visible = deco.sign >= 0;
  slot.sign.material.color.set(SIGN_COLORS[Math.max(0, deco.sign)]);
  slot.sign.scale.set(2.6, 0.7, 0.25);
  slot.sign.position.set(width / 2 - 1.3, 3.75, 0.2);
  slot.planter.visible = deco.windows % 2 === 0;
  slot.planter.position.set(-width / 2 + 1.2, 0, 0.55);
}

export function createThreeStage(container, { course, decorations, rules = RULES_V1, showOpeningShop = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  // 色をそのまま出す：色管理・トーンマッピングを使わない（比較面の値を変えない）
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.className = 'stage-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6f7, 40, 170);
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.5, 600);

  // ---- 光 ----
  const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x9a8f80, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.9);
  scene.add(sun, sun.target);
  const lampLights = [new THREE.PointLight(0xffd59a, 0, 16, 1.6), new THREE.PointLight(0xffd59a, 0, 16, 1.6)];
  lampLights.forEach((l) => scene.add(l));

  // ---- 共有の部品 ----
  const shared = {
    unitBox: new THREE.BoxGeometry(1, 1, 1),
    roofGeo: (() => {
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0);
      s.lineTo(0.5, 0);
      s.lineTo(0, 1);
      s.lineTo(-0.5, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    })(),
    glassDark: lambert(0x7d9bb5),
    glassLit: lambert(0x7d9bb5, { emissive: 0xffd27a, emissiveIntensity: 0 }),
    metal: lambert(0x3b3f48),
    lampMat: new THREE.MeshBasicMaterial({ color: 0x777777 }),
    leaf: lambert(0x4f9a46),
  };

  // ---- 空・太陽と月・星・雲 ----
  const skyUniforms = { uTop: { value: new THREE.Color(SKY.day.top) }, uBottom: { value: new THREE.Color(SKY.day.bottom) } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uBottom; varying vec3 vP; void main(){ float k = clamp(normalize(vP).y * 1.6 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(uBottom, uTop, k), 1.0); }',
    }),
  );
  sky.userData.noPick = true;
  scene.add(sky);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xfff4c4, fog: false });
  const orb = new THREE.Mesh(new THREE.CircleGeometry(9, 32), orbMat);
  orb.userData.noPick = true;
  scene.add(orb);
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i += 1) {
    starPos.set([(Math.random() - 0.5) * 700, 40 + Math.random() * 220, -250 - Math.random() * 60], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 });
  const stars = new THREE.Points(starGeo, starMat);
  stars.userData.noPick = true;
  scene.add(stars);
  const cloudMat = lambert(0xffffff, { transparent: true, opacity: 0.9 });
  const clouds = [];
  for (let i = 0; i < 7; i += 1) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 3, 12, 8), cloudMat);
      puff.position.set(j * 5 - 7, Math.random() * 2, Math.random() * 3);
      puff.scale.y = 0.55;
      c.add(puff);
    }
    c.position.set(i * 45 - 120, 42 + Math.random() * 25, -150 - Math.random() * 40);
    c.userData.noPick = true;
    clouds.push(c);
    scene.add(c);
  }

  // ---- 遠景のビル（2層。本当の奥行きがあるので自然にゆっくり流れる） ----
  const winTex = windowGridTexture();
  const farLayers = [
    { z: -34, count: 26, span: 260, h: [10, 30], w: [5, 10], mat: lambert(SKY.day.far, { emissive: 0xffd27a, emissiveMap: winTex, emissiveIntensity: 0 }) },
    { z: -78, count: 26, span: 380, h: [22, 60], w: [8, 16], mat: lambert(SKY.day.far2, { emissive: 0xffd27a, emissiveMap: winTex, emissiveIntensity: 0 }) },
  ];
  const farBoxes = [];
  for (const layer of farLayers) {
    let x = -layer.span / 2;
    for (let i = 0; i < layer.count; i += 1) {
      const w = layer.w[0] + ((i * 7919) % 100) / 100 * (layer.w[1] - layer.w[0]);
      const h = layer.h[0] + ((i * 104729) % 100) / 100 * (layer.h[1] - layer.h[0]);
      const m = new THREE.Mesh(shared.unitBox, layer.mat);
      m.scale.set(w, h, w * 0.8);
      m.position.set(x + w / 2, h / 2 - 0.5, layer.z - ((i * 31) % 7));
      m.userData = { noPick: true, layer };
      x += w + 1 + ((i * 13) % 4);
      farBoxes.push(m);
      scene.add(m);
    }
    layer.span = x + layer.span / 2;
  }

  // ---- 通り（歩道・縁石・車道・白線） ----
  const tile = tileTexture();
  tile.repeat.set(60, 2);
  const sidewalkMat = lambert(SKY.day.sidewalk, { map: tile });
  const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(240, 0.3, 4), sidewalkMat);
  sidewalk.position.set(0, -0.15, 2);
  const curbMat = lambert(SKY.day.curb);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(240, 0.42, 0.35), curbMat);
  curb.position.set(0, -0.1, 4.1);
  const roadMat = lambert(SKY.day.road);
  const road = new THREE.Mesh(new THREE.BoxGeometry(240, 0.2, 40), roadMat);
  road.position.set(0, -0.42, 24.2);
  const backGround = new THREE.Mesh(new THREE.BoxGeometry(240, 0.2, 40), lambert(0x8e8a84));
  backGround.position.set(0, -0.2, -20);
  [sidewalk, curb, road, backGround].forEach((m) => {
    m.userData.noPick = true;
    scene.add(m);
  });
  const dashGeo = new THREE.BoxGeometry(3, 0.05, 0.25);
  const dashMat = lambert(0xf0f0f0);
  const dashes = [];
  for (let i = 0; i < 26; i += 1) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.set(i * 7, -0.3, 11);
    d.userData.noPick = true;
    dashes.push(d);
    scene.add(d);
  }

  // ---- 建物の枠 ----
  const slots = Array.from({ length: SLOTS }, () => makeSlot(shared));
  slots.forEach((s) => scene.add(s.group));
  let shop = null;
  if (showOpeningShop) {
    shop = createJewelryShop(W - 0.5, 9.5);
    shop.position.set(-W / 2, 0, 0);
    scene.add(shop);
  }

  // ---- 主人公と警察 ----
  const hero = createChameleon28();
  hero.group.scale.setScalar(HERO_SCALE);
  hero.group.rotation.y = HERO_YAW;
  hero.group.position.z = HERO_Z;
  scene.add(hero.group);
  const shadowTex = radialTexture();
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(1.6, 1.1, 1);
  blob.position.y = 0.02;
  blob.userData.noPick = true;
  scene.add(blob);
  const ferrets = [createFerret(), createFerret()];
  ferrets.forEach((f) => {
    f.group.position.set(-100, 0, 0.9);
    f.group.scale.setScalar(0.78);
    scene.add(f.group);
  });

  // ---- 発見の演出（暗幕と光の柱） ----
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), darkMat);
  dark.position.set(0, 0, -1);
  dark.renderOrder = 50;
  dark.visible = false;
  dark.userData.noPick = true;
  camera.add(dark);
  scene.add(camera);
  const beams = [];
  for (let i = 0; i < 6; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 16, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    beam.visible = false;
    beam.renderOrder = 55;
    beam.userData.noPick = true;
    scene.add(beam);
    beams.push(beam);
  }
  const heroOnTop = (on) => {
    hero.group.traverse((o) => {
      if (!o.isMesh) return;
      o.renderOrder = on ? 60 : 0;
      o.material.transparent = on;
      o.material.depthTest = !on ? true : true;
      o.material.needsUpdate = true;
    });
  };

  let playerX = 0;
  let lastFrame = performance.now();
  const ferretX = [-100, -100];
  let ending = null;
  let aspect = 1;

  function placeCamera(x) {
    const k = THREE.MathUtils.clamp(0.9 / aspect, 1, 1.35); // 縦長の画面では少し引く
    camera.position.set(x + CAM.offset.x * k, CAM.offset.y, CAM.offset.z * k);
    camera.lookAt(x + CAM.look.x, CAM.look.y, CAM.look.z);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    orb.position.set(camera.position.x + 70, 95, -300);
    orb.lookAt(camera.position);
    stars.position.x = camera.position.x;
    sun.position.set(x - 30, 60, 40);
    sun.target.position.set(x + 5, 0, 0);
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function assignSlots(current) {
    const wanted = [current - 1, current, current + 1, current + 2, current + 3].filter((i) => i >= 1 && i <= rules.buildingCount);
    for (const index of wanted) {
      if (slots.some((s) => s.index === index)) continue;
      const free = slots.find((s) => !wanted.includes(s.index));
      if (!free) continue;
      layoutSlot(free, index, (index - 1) * W, course.targets[index - 1], decorations[index - 1], shared);
      free.group.visible = true;
    }
    for (const s of slots) if (!wanted.includes(s.index)) s.group.visible = false;
  }

  function setTimeOfDay(building, fraction) {
    const a = areaOf(Math.min(rules.buildingCount, Math.max(1, building)));
    const next = areaOf(Math.min(rules.buildingCount, Math.max(1, building) + 1));
    const k = a.time !== next.time ? Math.max(0, fraction - 0.4) / 0.6 : 0;
    const A = SKY[a.time];
    const B = SKY[next.time];
    const mix = (key) => lerpHex(A[key], B[key], k);
    const num = (key) => A[key] + (B[key] - A[key]) * k;
    skyUniforms.uTop.value.copy(mix('top'));
    skyUniforms.uBottom.value.copy(mix('bottom'));
    scene.fog.color.copy(mix('fog'));
    hemi.color.copy(mix('hemiSky'));
    hemi.groundColor.copy(mix('hemiGround'));
    hemi.intensity = num('hemi');
    sun.color.copy(mix('sun'));
    sun.intensity = num('sunI');
    farLayers[0].mat.color.copy(mix('far'));
    farLayers[1].mat.color.copy(mix('far2'));
    const win = num('windows');
    farLayers.forEach((l) => (l.mat.emissiveIntensity = win * 0.9));
    shared.glassLit.emissiveIntensity = win;
    sidewalkMat.color.copy(mix('sidewalk'));
    curbMat.color.copy(mix('curb'));
    roadMat.color.copy(mix('road'));
    const lamps = num('lamps');
    shared.lampMat.color.copy(lerpHex(0x777777, 0xffe2a8, lamps));
    lampLights.forEach((l) => (l.intensity = lamps * 9));
    const night = Math.max(0, (num('windows') - 0.5) * 2);
    starMat.opacity = night;
    cloudMat.opacity = 0.9 * (1 - night * 0.8);
    orbMat.color.copy(lerpHex(0xfff4c4, 0xe8eeff, night));
  }

  function recycle(x) {
    for (const m of farBoxes) {
      const L = m.userData.layer;
      while (m.position.x < x - L.span / 2) m.position.x += L.span;
      while (m.position.x > x + L.span / 2) m.position.x -= L.span;
    }
    for (const c of clouds) {
      if (c.position.x < x - 170) c.position.x += 315;
    }
    for (const d of dashes) {
      while (d.position.x < x - 60) d.position.x += 26 * 7;
    }
    [sidewalk, curb, road, backGround].forEach((m) => (m.position.x = x));
    tile.offset.x = (x / 4) % 1;
    // 街灯の光：主人公の近くの2本
    const left = Math.floor(x / W) * W;
    lampLights[0].position.set(left + 0.95, 5.2, 1.4);
    lampLights[1].position.set(left + W + 0.95, 5.2, 1.4);
  }

  function heroMood({ walking, policeStage, matchState, searching }) {
    if (!walking) {
      hero.setPose('待機');
      hero.setExpression('通常');
    } else {
      hero.setPose('歩き');
      if (policeStage >= 2) hero.setExpression(matchState === 'success' ? 'とぼけ' : '驚き');
      else if (policeStage === 1) hero.setExpression(searching ? 'とぼけ' : '困り');
      else hero.setExpression(matchState === 'success' ? '笑顔' : matchState === 'danger' ? '困り' : '通常');
    }
    hero.setNervous(policeStage >= 1 ? Math.min(1, policeStage * 0.55) : 0, policeStage >= 2 ? 0.6 : policeStage * 0.2);
  }

  resize();
  const onResize = () => resize();
  globalThis.addEventListener('resize', onResize);
  setTimeOfDay(1, 0);

  const api = {
    kind: 'three',
    renderer,
    hero,
    /** 毎フレーム。t はゲーム内時刻、color は体色（HSV整数）、policeStage は警察の人数。 */
    update({ t, color, policeStage = 0, searching = false, walking = true, matchState = null }) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      playerX = (t / rules.buildingMs) * W; // 判定と同じ時刻から位置を決める
      const building = Math.min(rules.buildingCount, Math.floor(t / rules.buildingMs) + 1);
      assignSlots(building);
      setTimeOfDay(building, (t % rules.buildingMs) / rules.buildingMs);
      placeCamera(playerX);
      recycle(playerX);
      hero.group.position.set(playerX, 0, HERO_Z);
      blob.position.set(playerX, 0.02, HERO_Z);
      hero.setColor(rgbFloat(color));
      if (!ending) {
        heroMood({ walking, policeStage, matchState, searching });
        hero.animate(walking ? dt : dt * 0.6);
      }
      // 警察：通常は画面外。段階に応じて近づき、回復で後退する
      // 1人目は主人公の左2.6、2人目は左3.8・少し手前。いないときは画面の左外。
      const behind = [policeStage >= 1 ? playerX - 2.6 : playerX - 16, policeStage >= 2 ? playerX - 3.8 : playerX - 19];
      ferrets.forEach((f, i) => {
        if (ferretX[i] < playerX - 30) ferretX[i] = playerX - 18 - i * 3;
        ferretX[i] += (behind[i] - ferretX[i]) * Math.min(1, dt * 2.2);
        f.group.position.x = ferretX[i];
        f.group.position.z = i === 0 ? 2.1 : 3.0;
        f.animate(dt, { walking: true, searching });
        f.beam.visible = policeStage >= 1;
      });
      if (shop) shop.visible = playerX < W * 2.5;
      renderer.render(scene, camera);
    },
    /** 練習用：目標の壁だけを見せる。 */
    showPractice(target) {
      slots.forEach((s, i) => {
        if (i === 0) {
          layoutSlot(s, 1, -W / 2, target, { heightScale: 100, kind: 'house', windows: 2, trimTone: 0, sign: -1, roof: 0 }, shared);
          s.group.visible = true;
        } else s.group.visible = false;
      });
      ferrets.forEach((f) => (f.group.position.x = -100));
      if (shop) shop.visible = false;
      setTimeOfDay(1, 0);
    },
    renderPractice(color, target) {
      const s = slots[0];
      const [r, g, b] = rgbFloat(target);
      s.frontMat.color.setRGB(r, g, b);
      s.sideMat.color.setRGB(r * 0.82, g * 0.82, b * 0.82);
      playerX = 0;
      placeCamera(0);
      recycle(0);
      hero.group.position.set(0, 0, HERO_Z);
      blob.position.set(0, 0.02, HERO_Z);
      hero.setColor(rgbFloat(color));
      hero.setPose('待機');
      const now = performance.now();
      hero.animate(Math.min(0.1, (now - lastFrame) / 1000));
      lastFrame = now;
      renderer.render(scene, camera);
    },
    /** 終了演出。結果は先に確定しているので、スキップしても結果は変わらない。 */
    async playEnding(kind, { signal } = {}) {
      ending = kind;
      const start = performance.now();
      const duration = kind === 'detected' ? 2800 : kind === 'cleared' ? 2600 : 700;
      ferrets.forEach((f) => (f.beam.visible = false));
      if (kind === 'detected') {
        heroOnTop(true);
        hero.setExpression('驚き');
        hero.setPose('待機');
      } else if (kind === 'cleared') {
        hero.setExpression('笑顔');
        hero.setPose('喜び');
      } else {
        hero.setPose('待機');
        hero.setExpression('とぼけ');
      }
      let last = performance.now();
      return new Promise((resolve) => {
        const step = () => {
          const now = performance.now();
          const k = Math.min(1, (now - start) / duration);
          hero.animate(Math.min(0.1, (now - last) / 1000));
          last = now;
          if (kind === 'detected') {
            dark.visible = true;
            darkMat.opacity = Math.min(0.88, k * 1.15);
            const n = Math.min(beams.length, Math.floor(k * (beams.length + 1)));
            beams.forEach((b, i) => {
              b.visible = i < n;
              const a = -1 + (i / (beams.length - 1)) * 2;
              const top = new THREE.Vector3(playerX + a * 8, 15, HERO_Z + 6 - Math.abs(a) * 3);
              const target = new THREE.Vector3(playerX, 1.4, HERO_Z);
              b.position.copy(top).add(target).multiplyScalar(0.5);
              b.lookAt(target);
              b.rotateX(-Math.PI / 2);
              b.scale.set(1, top.distanceTo(target) / 16, 1);
            });
          } else if (kind === 'cleared') {
            hero.showJewel(Math.max(0, (k - 0.2) / 0.8));
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
    /** 初回の開始演出：宝石店から飛び出し、宝石を尻尾に隠して街へ。 */
    async playOpening({ signal } = {}) {
      const start = performance.now();
      const duration = 3000;
      hero.showJewel(0.6);
      hero.setExpression('笑顔');
      hero.setPose('走り');
      let last = performance.now();
      return new Promise((resolve) => {
        const step = () => {
          const now = performance.now();
          const k = Math.min(1, (now - start) / duration);
          const x = -W * 0.25 + k * W * 0.25;
          assignSlots(1);
          setTimeOfDay(1, 0);
          placeCamera(x);
          recycle(x);
          hero.group.position.set(x, Math.max(0, Math.sin(k * Math.PI * 2) * 0.9 * (1 - k)), 0.6 + k * (HERO_Z - 0.6));
          blob.position.set(x, 0.02, hero.group.position.z);
          if (k > 0.55) hero.showJewel(Math.max(0, 0.6 - (k - 0.55) * 1.5));
          hero.animate(Math.min(0.1, (now - last) / 1000));
          last = now;
          renderer.render(scene, camera);
          if (k >= 1 || signal?.aborted) {
            hero.group.position.y = 0;
            hero.hideJewel();
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
      dark.visible = false;
      beams.forEach((b) => (b.visible = false));
      heroOnTop(false);
      hero.hideJewel();
    },
    /** 検証用：ワールド座標の1点を、描画済みの画面から読む（8ビットのRGB）。 */
    pixelAt(worldPoint) {
      const v = worldPoint.clone().project(camera);
      const canvas = renderer.domElement;
      const px = Math.round(((v.x + 1) / 2) * canvas.width);
      const py = Math.round(((v.y + 1) / 2) * canvas.height);
      const gl = renderer.getContext();
      const buf = new Uint8Array(4);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return [buf[0], buf[1], buf[2]];
    },
    /**
     * 検証用：棟 index の正面と、主人公の胴の中央を、遮られていない所から読む。
     * カメラからの光線で最初に当たる物が対象の面であることを確かめてから読む。
     */
    sampleComparison(index) {
      const ray = new THREE.Raycaster();
      const pickables = [];
      scene.traverse((o) => {
        if (o.isMesh && o.visible && !o.userData.noPick) pickables.push(o);
      });
      const visibleChain = (o) => {
        for (let p = o; p; p = p.parent) if (!p.visible) return false;
        return true;
      };
      const firstHit = (point) => {
        ray.set(camera.position, point.clone().sub(camera.position).normalize());
        return ray.intersectObjects(pickables, false).find((h) => visibleChain(h.object));
      };
      let wall = null;
      const slot = slots.find((s) => s.index === index && s.group.visible);
      if (slot) {
        const x0 = (index - 1) * W;
        for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          for (const y of [2.2, 3.2, 1.4]) {
            const p = new THREE.Vector3(x0 + W * fx, y, 0);
            const hit = firstHit(p);
            if (hit && hit.object === slot.body && hit.face && hit.face.materialIndex === 4) {
              wall = api.pixelAt(hit.point);
              break;
            }
          }
          if (wall) break;
        }
      }
      let heroPx = null;
      const center = new THREE.Vector3();
      hero.torso.getWorldPosition(center);
      for (const [dx, dy] of [[0, 0], [0, 0.2], [0, -0.2], [0.15, 0], [-0.15, 0], [0, 0.35]]) {
        const p = center.clone().add(new THREE.Vector3(dx, dy, 0));
        const hit = firstHit(p);
        if (!hit || hit.object !== hero.torso) continue;
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        const view = camera.position.clone().sub(hit.point).normalize();
        if (n.dot(view) < 0.93) continue;
        heroPx = api.pixelAt(hit.point);
        break;
      }
      return { wall, hero: heroPx };
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
      [tile, winTex, shadowTex].forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  return api;
}

/** ホーム用：手を振るカメレオン（デザインの緑そのまま）。 */
export function createShowcase(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.className = 'showcase-canvas';
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 3.2, 13.5);
  camera.lookAt(0, 2.5, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbcd8b4, 1));
  const hero = createChameleon28();
  hero.group.rotation.y = 0.45;
  hero.setColor([0x58 / 255, 0xc4 / 255, 0x3c / 255]);
  hero.setPose('手を振る');
  hero.setExpression('笑顔');
  scene.add(hero.group);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.35)'), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  scene.add(shadow);
  // 宝石を少し見せる
  hero.showJewel(0.15);
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
    hero.animate(Math.min(0.1, (now - last) / 1000));
    hero.group.rotation.y = 0.45 + Math.sin(now / 2400) * 0.35;
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
      hero.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
