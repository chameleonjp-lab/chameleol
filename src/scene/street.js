// 斜め視点の立体の街（Three.js）。透視カメラを街の手前・やや上に置き、主人公の少し先から街路の奥を見る。
// - 50棟を同時には作らない。今の棟の前後だけを4つの枠で使い回す（GEN-07、SCOPE-03）。物体数は一定。
// - 比較面の色ルール（COLOR-01/03）：
//   * 建物の正面（ファサード）は MeshBasicMaterial・fog:false・toneMapped:false で、目標色の8ビット値をそのまま描く。
//   * 体の色は characters 側の「比較用トゥーン」が同じ値をそのまま出す。照明・霧・色調整・全画面のぼかしは比較面に使わない。
//   * 側面の壁・屋根・庇・窓枠・看板・道路・空・遠景・影は判定の対象外。ここだけ照明・霧・時間帯の色を使う。
//   * 正面はすべて同じ奥行き（z=0）にそろえ、棟ごとの凹凸は面より奥（背面側）だけで変える。
// - 通りの構成：z=0 が建物の正面、歩道（縁石つき）、車道（レーンの破線・側溝）。主人公は歩道を歩く。
//   歩道・車道は繰り返しテクスチャで、カメラの x に合わせて10の倍数にそろえて置き直す（毎フレームの生成なし）。
// - 窓・庇・看板・屋上の小物・街灯は InstancedMesh で共有し、枠ごとの範囲だけを書き換える。
// - 空はカメラに付けた背景（頂点色）、星・月、遠景のビル群（窓の灯り）、霧で空の色へなじませる。
// - 判定の基準点は主人公の胴体中心の x（playerX）。歩行のアニメーション・カメラの揺れでは動かさない（TIME-02）。
// - 影は実時間の影ではなく、歩道に置く丸い影（ぼかしテクスチャ）だけ。
// - 警察官は背景ではなく、主人公と同じ歩道の並び・同じ大きさ・同じ描き方の登場人物。主人公の後ろ（左）から来る。
//   見失えば立ち止まって探し、見つければ指をさして追う。壁と体色を大きく隠さない位置にとどめる（UI-02）。
// - 粒や記号（effects.js）は不透明で、色を混ぜない。カメラの揺れはごく小さく、判定の位置は動かさない（FX-03）。
import * as THREE from 'three';
import { RULES_V1 } from '../rules/v1/index.js';
import { areaOf } from '../rules/v1/course.js';
import { createChameleon, createFerret, createJewelryShop } from './characters.js';
import { SKY, TOD, rgbFloat } from './palette-colors.js';
import { createEffects } from './effects.js';
import { createGamePresentationClock, createVisiblePresentationClock } from './stage.js';

const W = 10; // 1棟の幅（ワールド座標）
const GAP = 1.3; // 建物の間の路地の幅
const SLOTS = 7; // 今の棟の前2・後4まで。横長の舞台でも棟の抜けが出ないようにする
const NL = 8; // 街灯の数
const SIDEWALK_Y = 0.22; // 歩道の上面
const SIDEWALK_D = 4.45; // 歩道の奥行き（z=0 から縁石まで）
const HERO_Z = 2.5; // 主人公が歩く位置
const HERO_YAW = -0.42; // カメラ側へ少し向ける
const PRACTICE_X = 3.2; // 練習時の主人公の位置
const SCREEN_X = 0.38; // 主人公の横位置（左から）。後ろに警察が並ぶ分だけ、少し中央へ寄せる
const FERRET_SCALE = 0.9; // 主人公（高さ約3）と並べて見える大きさ
const FERRET_YAW = -0.36; // 主人公と同じく、カメラ側へ少し向ける
// 警察の立ち位置（主人公からの x の差）と、歩く列（z）。1人目は主人公とほぼ同じ列、2人目は半歩奥
const FERRET_NEAR = [-2.9, -4.4];
const FERRET_AWAY = [-14, -17];
const FERRET_Z = [HERO_Z + 0.2, HERO_Z - 0.55];
const CLOUD_N = 5;
const SCREEN_Y = 0.31; // 主人公の胴の高さの画面位置（下から）
// カメラ：主人公の少し先（x+）から、街路の奥（右）へゆるく振る
const CAM = { dx: 3.2, y: 5.2, z: 22, lookDx: 6, lookY: 4.2, lookZ: 0, fov: 44 };
const HEIGHT_K = 0.92; // 建物の高さの見た目の係数（空が見えるように）

const CAP_BOX = 56; // 1棟あたりの箱の数
const CAP_CYL = 3;
const CAP_GLASS = 8;
const CAP_RAIL = 2;

const TRIMS = [0xece6da, 0x5d626e, 0xc2ad8e, 0x93513f];
const SIGN_COLORS = [0xff6f61, 0xffd166, 0x06d6a0, 0x118ab2, 0xef476f, 0xf78c6b];
const AWNING_COLORS = [0xd64541, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0xe67e73];
const LIT_GLASS = 0xffd98a;
const COLOR_KEYS = ['top', 'bottom', 'far', 'road', 'ground', 'hemiSky', 'hemiGround', 'dir', 'glass', 'walk', 'curb', 'cloud'];
const NUM_KEYS = ['hemi', 'dirI', 'glow', 'stars', 'cloudA'];

const hash = (a) => {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

function canvasOf(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  draw(g, w, h);
  return canvas;
}

export function createThreeStage(container, { course, decorations, rules = RULES_V1, showOpeningShop = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, stencil: true });
  // 色をそのまま出す：色管理・トーンマッピングを使わない。
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.domElement.className = 'stage-canvas';
  container.append(renderer.domElement);
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy?.() ?? 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdff4ff, 28, 200);
  const camera = new THREE.PerspectiveCamera(CAM.fov, 0.78, 0.5, 700);
  scene.add(camera); // 空・星・暗幕をカメラに付けるため

  // ---- 比較面の保護（ステンシル） ----
  // 比較面（壁の正面・体の比較用の材質）は描いた画素にステンシル 1 を書き、
  // 光・影・にじみなど重ね描きの材質は、その画素には描かない（比較面の色を絶対に変えない）。
  const maskWrite = (m) => {
    m.stencilWrite = true;
    m.stencilRef = 1;
    m.stencilWriteMask = 0xff;
    m.stencilFunc = THREE.AlwaysStencilFunc;
    m.stencilFail = THREE.KeepStencilOp;
    m.stencilZFail = THREE.KeepStencilOp;
    m.stencilZPass = THREE.ReplaceStencilOp;
  };
  const maskAvoid = (m) => {
    m.stencilWrite = true;
    m.stencilRef = 1;
    m.stencilFuncMask = 0xff;
    m.stencilWriteMask = 0;
    m.stencilFunc = THREE.NotEqualStencilFunc;
    m.stencilFail = THREE.KeepStencilOp;
    m.stencilZFail = THREE.KeepStencilOp;
    m.stencilZPass = THREE.KeepStencilOp;
  };

  const textures = [];
  const makeTexture = (canvas, { repeat = false, aniso = false } = {}) => {
    const tex = new THREE.CanvasTexture(canvas);
    if (repeat) tex.wrapS = THREE.RepeatWrapping;
    if (repeat) tex.wrapT = THREE.RepeatWrapping;
    if (aniso) tex.anisotropy = maxAniso;
    textures.push(tex);
    return tex;
  };

  // ---- 照明（比較面は使わない。側面・道路・屋上などだけ） ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0xa89f94, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.55);
  sun.position.set(-8, 14, 12);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  // ---- テクスチャ ----
  const sidewalkTex = makeTexture(
    canvasOf(256, 256, (g, w, h) => {
      g.fillStyle = '#dcdcde';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i += 1) {
        g.fillStyle = `rgba(${hash(i) > 0.5 ? '255,255,255' : '120,120,130'},${0.05 + hash(i + 999) * 0.07})`;
        g.fillRect(hash(i + 31) * w, hash(i + 77) * h, 2 + hash(i + 5) * 3, 2 + hash(i + 9) * 3);
      }
      g.strokeStyle = '#a9a9b2';
      g.lineWidth = 5;
      g.strokeRect(0, 0, w, h);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w / 2, 0);
      g.lineTo(w / 2, h);
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
      g.stroke();
    }),
    { repeat: true, aniso: true },
  );
  const ROAD_D = 19.5;
  const roadTex = makeTexture(
    canvasOf(1024, 512, (g, w, h) => {
      g.fillStyle = '#cbcbd0';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i += 1) {
        g.fillStyle = `rgba(${hash(i) > 0.5 ? '255,255,255' : '40,40,50'},${0.05 + hash(i + 7) * 0.1})`;
        g.fillRect(hash(i + 3) * w, hash(i + 4) * h, 2 + hash(i + 5) * 4, 2 + hash(i + 6) * 4);
      }
      const px = (z) => ((z - 4.8) / ROAD_D) * h; // 縁石側が上
      g.fillStyle = 'rgba(40,40,52,0.55)'; // 側溝
      g.fillRect(0, px(4.8), w, px(5.5) - px(4.8));
      g.fillStyle = 'rgba(255,255,255,0.85)'; // 路側帯
      g.fillRect(0, px(5.65), w, px(5.8) - px(5.65));
      g.fillStyle = 'rgba(255,236,150,0.95)'; // 中央のレーン破線
      for (const x0 of [0, w / 2]) g.fillRect(x0 + 40, px(9.0), w * 0.3, px(9.18) - px(9.0));
      g.fillStyle = 'rgba(255,255,255,0.8)'; // 手前のレーン線
      for (const x0 of [0, w / 2]) g.fillRect(x0 + 40, px(13.2), w * 0.25, px(13.32) - px(13.2));
    }),
    { repeat: true, aniso: true },
  );
  const glassTex = makeTexture(
    canvasOf(64, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#b9c5d2');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a4252';
      g.fillRect(w / 2 - 2, 0, 4, h);
      g.fillRect(0, h * 0.42, w, 4);
    }),
  );
  const railTex = makeTexture(
    canvasOf(128, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, 5);
      for (let x = 4; x < w; x += 11) g.fillRect(x, 0, 3, h);
    }),
  );
  const stripeTex = makeTexture(
    canvasOf(64, 16, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#9a9a9a';
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 8, h);
    }),
  );
  const signTex = makeTexture(
    canvasOf(128, 32, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#5a5a5a';
      for (let i = 0; i < 5; i += 1) g.fillRect(14 + i * 22, 8, 14 + (i % 2) * 3, 16);
    }),
  );
  const blobTex = makeTexture(
    canvasOf(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.6)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),
  );
  const glowTex = makeTexture(
    canvasOf(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),
  );
  const farTex = makeTexture(
    canvasOf(64, 128, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c4ccd8';
      for (let y = 6; y < h - 4; y += 10) for (let x = 6; x < w - 4; x += 14) g.fillRect(x, y, 8, 6);
    }),
  );
  const farLitTex = makeTexture(
    canvasOf(64, 128, (g, w, h) => {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, w, h);
      let n = 0;
      for (let y = 6; y < h - 4; y += 10) {
        for (let x = 6; x < w - 4; x += 14) {
          n += 1;
          if (hash(n * 13) < 0.42) {
            g.fillStyle = hash(n) < 0.8 ? '#ffd88a' : '#9fd0ff';
            g.fillRect(x, y, 8, 6);
          }
        }
      }
    }),
  );
  const moonTex = makeTexture(
    canvasOf(128, 128, (g, w, h) => {
      const halo = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      halo.addColorStop(0, 'rgba(255,248,220,0.55)');
      halo.addColorStop(1, 'rgba(255,248,220,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff6d8';
      g.beginPath();
      g.arc(w / 2, h / 2, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(200,190,150,0.5)';
      g.beginPath();
      g.arc(w / 2 + 7, h / 2 - 5, 5, 0, Math.PI * 2);
      g.arc(w / 2 - 8, h / 2 + 8, 4, 0, Math.PI * 2);
      g.fill();
    }),
  );
  const spotTex = makeTexture(
    canvasOf(512, 512, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.1, 'rgba(0,0,0,0)');
      grad.addColorStop(0.2, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }),
  );

  // ---- 時間帯の色（lerp 用の置き場。毎フレームの生成なし） ----
  const palettes = {};
  for (const k of Object.keys(TOD)) palettes[k] = { ...SKY[k], ...TOD[k] };
  const cur = {};
  for (const k of COLOR_KEYS) cur[k] = new THREE.Color();
  for (const k of NUM_KEYS) cur[k] = 0;
  const tmpColor = new THREE.Color();

  // ---- 空（カメラに付ける背景）・星・月 ----
  const skyPos = new Float32Array(6 * 3);
  const skyCol = new Float32Array(6 * 3);
  const skyGeo = new THREE.BufferGeometry();
  skyGeo.setAttribute('position', new THREE.BufferAttribute(skyPos, 3));
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  skyGeo.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  camera.add(sky);

  const STAR_N = 140;
  const starNdc = new Float32Array(STAR_N * 2);
  for (let i = 0; i < STAR_N; i += 1) {
    starNdc[i * 2] = hash(i * 3 + 1) * 2 - 1;
    starNdc[i * 2 + 1] = hash(i * 3 + 2) * 1.1 - 0.1;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STAR_N * 3), 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -90;
  camera.add(stars);
  const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMat);
  moon.frustumCulled = false;
  moon.renderOrder = -89;
  camera.add(moon);
  // 雲：空の奥をゆっくり流れる（遠景のビルより奥。比較面にはかからない）
  const cloudTex = makeTexture(
    canvasOf(256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const puff = (x, y, r) => {
        const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.7, 'rgba(255,255,255,0.75)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      };
      puff(70, 78, 44);
      puff(118, 60, 54);
      puff(170, 74, 46);
      puff(205, 86, 30);
      puff(40, 90, 26);
    }),
  );
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  const clouds = Array.from({ length: CLOUD_N }, (_, i) => {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -88;
    camera.add(mesh);
    return { mesh, x: hash(i * 7 + 1) * 3 - 1.5, y: 0.25 + hash(i * 7 + 2) * 0.7, size: 0.6 + hash(i * 7 + 3) * 0.7, drift: 0.006 + hash(i * 7 + 4) * 0.008 };
  });

  // ---- 地面・歩道・縁石・道路 ----
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x6f747c });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 560), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.06, -250);
  scene.add(ground);

  const STREET_L = 480;
  sidewalkTex.repeat.set(STREET_L / 2.5, SIDEWALK_D / 2.5);
  const walkMat = new THREE.MeshLambertMaterial({ map: sidewalkTex, color: 0xcfcfd0 });
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(STREET_L, SIDEWALK_D), walkMat);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(0, SIDEWALK_Y, SIDEWALK_D / 2);
  scene.add(sidewalk);
  const curbMat = new THREE.MeshLambertMaterial({ color: 0xe6e5e1 });
  const curb = new THREE.Mesh(new THREE.BoxGeometry(STREET_L, SIDEWALK_Y + 0.03, 0.35), curbMat);
  curb.position.set(0, (SIDEWALK_Y + 0.03) / 2, SIDEWALK_D + 0.175);
  scene.add(curb);
  roadTex.repeat.set(STREET_L / 10, 1);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex, color: 0x8a8f99 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(STREET_L, ROAD_D), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 4.8 + ROAD_D / 2);
  scene.add(road);

  // ---- 共有ジオメトリ・インスタンス群 ----
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const tM = new THREE.Matrix4();
  const tQ = new THREE.Quaternion();
  const tE = new THREE.Euler();
  const tP = new THREE.Vector3();
  const tS = new THREE.Vector3();
  const tC = new THREE.Color();

  function makePool(geo, mat, total, colored = true) {
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < total; i += 1) {
      mesh.setMatrixAt(i, ZERO);
      if (colored) mesh.setColorAt(i, tC.set(0xffffff));
    }
    scene.add(mesh);
    return mesh;
  }
  function put(mesh, i, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    tE.set(rx, ry, rz);
    tQ.setFromEuler(tE);
    tP.set(x, y, z);
    tS.set(sx, sy, sz);
    tM.compose(tP, tQ, tS);
    mesh.setMatrixAt(i, tM);
    if (color !== undefined) mesh.setColorAt(i, tC.set(color));
  }
  const flag = (mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  /** 枠ごとの範囲を順に書く入れ物。 */
  function range(mesh, start, cap) {
    let n = 0;
    return {
      begin() {
        n = 0;
      },
      add(...args) {
        if (n >= cap) return -1;
        put(mesh, start + n, ...args);
        n += 1;
        return start + n - 1;
      },
      end() {
        for (let i = n; i < cap; i += 1) mesh.setMatrixAt(start + i, ZERO);
        flag(mesh);
      },
    };
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const LAMP_BOX0 = SLOTS * CAP_BOX;
  const boxes = makePool(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), LAMP_BOX0 + NL * 4);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const LAMP_CYL0 = SLOTS * CAP_CYL;
  const cyls = makePool(cylGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), LAMP_CYL0 + NL);
  const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, color: 0xffffff });
  const glass = makePool(new THREE.PlaneGeometry(1, 1), glassMat, SLOTS * CAP_GLASS);
  const rails = makePool(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: railTex, alphaTest: 0.5, side: THREE.DoubleSide }), SLOTS * CAP_RAIL);
  const awnings = makePool(boxGeo, new THREE.MeshLambertMaterial({ map: stripeTex }), SLOTS);
  const signs = makePool(boxGeo, new THREE.MeshBasicMaterial({ map: signTex }), SLOTS);
  // 街灯の電球・光だまり・にじみ
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x777777, fog: false });
  const bulbs = makePool(new THREE.SphereGeometry(1, 10, 8), bulbMat, NL, false);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffc870, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pools = makePool(new THREE.PlaneGeometry(1, 1), poolMat, NL, false);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NL * 3), 3));
  const haloMat = new THREE.PointsMaterial({ map: glowTex, color: 0xffc870, size: 4.2, sizeAttenuation: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  maskAvoid(poolMat);
  maskAvoid(haloMat);
  maskAvoid(cloudMat);
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  scene.add(halos);

  const prismGeo = new THREE.CylinderGeometry(1, 1, 1, 3);
  prismGeo.rotateX(-Math.PI / 2); // 切妻屋根：三角の断面を前に向ける（頂点が上）

  // ---- 遠景のビル群（x を一定周期で置き直す。窓の灯りは加算の重ね） ----
  const FAR_P = 330;
  const farLayers = [
    { z: -42, spacing: 11, hMin: 12, hMax: 26 },
    { z: -80, spacing: 15, hMin: 18, hMax: 40 },
    { z: -135, spacing: 22, hMin: 26, hMax: 60 },
  ];
  let farTotal = 0;
  for (const l of farLayers) {
    l.n = Math.round(FAR_P / l.spacing);
    farTotal += l.n * 3;
  }
  const farMat = new THREE.MeshBasicMaterial({ map: farTex, color: 0xa9c4d8 });
  const farMesh = makePool(boxGeo, farMat, farTotal);
  const farGlowMat = new THREE.MeshBasicMaterial({ map: farLitTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  maskAvoid(farGlowMat);
  const farGlow = makePool(boxGeo, farGlowMat, farTotal, false);
  {
    let id = 0;
    farLayers.forEach((l, li) => {
      const step = FAR_P / l.n;
      for (let rep = -1; rep <= 1; rep += 1) {
        for (let i = 0; i < l.n; i += 1) {
          const hh = l.hMin + hash(li * 977 + i * 13) * (l.hMax - l.hMin);
          const ww = step * (0.55 + hash(li * 311 + i * 7) * 0.35);
          const x = rep * FAR_P + i * step + (hash(i + li * 50) - 0.5) * 2;
          const tone = 0.78 + hash(i * 5 + li) * 0.28;
          put(farMesh, id, x, hh / 2 - 0.05, l.z - hash(i + 9) * 6, ww, hh, 9, tC.setRGB(tone, tone, tone * 1.02));
          put(farGlow, id, x, hh / 2 - 0.05, l.z - hash(i + 9) * 6, ww * 1.004, hh * 1.002, 9.05);
          id += 1;
        }
      }
    });
    flag(farMesh);
    flag(farGlow);
  }

  // ---- 建物の枠 ----
  const ranges = {};
  const rangesFor = (s) => ({
    box: range(boxes, s * CAP_BOX, CAP_BOX),
    cyl: range(cyls, s * CAP_CYL, CAP_CYL),
    glass: range(glass, s * CAP_GLASS, CAP_GLASS),
    rail: range(rails, s * CAP_RAIL, CAP_RAIL),
    awning: range(awnings, s, 1),
    sign: range(signs, s, 1),
  });

  function makeSlot(s) {
    const facadeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
    maskWrite(facadeMat);
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), facadeMat);
    facade.name = 'wall';
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xece6da });
    const cap = new THREE.Mesh(boxGeo, trimMat);
    const roof = new THREE.Mesh(prismGeo, trimMat);
    const group = new THREE.Group();
    group.add(facade, body, cap, roof);
    scene.add(group);
    ranges[s] = rangesFor(s);
    return { group, facade, facadeMat, body, bodyMat, cap, roof, trimMat, glassLit: [], glassStart: s * CAP_GLASS, glassN: 0, index: -1, deco: null, width: W - GAP, height: 9, cx: 0 };
  }

  const slots = Array.from({ length: SLOTS }, (_, s) => makeSlot(s));

  function hideSlot(slot, s) {
    slot.index = -1;
    slot.group.visible = false;
    const r = ranges[s];
    for (const k of Object.keys(r)) {
      r[k].begin();
      r[k].end();
    }
    slot.glassN = 0;
  }

  function layoutSlot(s, index, target, deco) {
    const slot = slots[s];
    const r = ranges[s];
    slot.index = index;
    slot.deco = deco;
    slot.group.visible = true;
    const width = W - GAP;
    const height = 9 * HEIGHT_K * (deco.heightScale / 100);
    const cx = (index - 1) * W + W / 2;
    const depth = 7 + hash(index * 17 + 3) * 4; // 凹凸は面より奥だけ
    slot.width = width;
    slot.height = height;
    slot.cx = cx;
    // 比較に使う外壁の正面：目標色をそのまま（照明・霧・色調整なし）
    const [cr, cg, cb] = rgbFloat(target);
    slot.facadeMat.color.setRGB(cr, cg, cb);
    slot.facade.scale.set(width, height, 1);
    slot.facade.position.set(cx, height / 2, 0);
    // 側面・屋根は判定対象外：暗く、少し無彩色へ寄せる
    const luma = cr * 0.3 + cg * 0.59 + cb * 0.11;
    slot.bodyMat.color.setRGB((cr * 0.7 + luma * 0.2) * 0.85, (cg * 0.7 + luma * 0.2) * 0.85, (cb * 0.7 + luma * 0.2) * 0.85);
    slot.body.scale.set(width, height, depth);
    slot.body.position.set(cx, height / 2, -depth / 2 - 0.02);
    const trim = TRIMS[deco.trimTone % TRIMS.length];
    slot.trimMat.color.set(trim);
    const house = deco.kind === 'house';
    slot.cap.visible = !house;
    slot.roof.visible = house;
    if (house) {
      const sy = 1.15;
      slot.roof.scale.set((width + 0.9) / 1.732, sy, 8.5);
      slot.roof.position.set(cx, height + 0.5 * sy, 0.7 - 8.5 / 2);
    } else {
      slot.cap.scale.set(width + 0.5, 0.5, 1.2);
      slot.cap.position.set(cx, height + 0.1, 0.15);
    }
    const roofTop = house ? height : height + 0.35;
    const dark = 0x2b2f3a;
    const sillCol = tC.set(trim).multiplyScalar(1.05).getHex();

    r.box.begin();
    r.cyl.begin();
    r.glass.begin();
    r.rail.begin();
    r.awning.begin();
    r.sign.begin();

    // 窓：枠・ガラス・窓台・まぐさ。主人公の頭より上（y>=5.3）にだけ置く
    const rowY1 = Math.min(Math.max(height - 1.15, 5.95), 6.9);
    const rows = [rowY1];
    if (rowY1 + 2.3 + 0.7 < height - 0.4) rows.push(rowY1 + 2.3);
    const n = deco.windows;
    const spacing = 2.15;
    slot.glassN = 0;
    const balconyKs = [];
    rows.forEach((cy, row) => {
      for (let k = 0; k < n; k += 1) {
        const lx = (k - (n - 1) / 2) * spacing;
        const x = cx + lx;
        r.box.add(x, cy, 0.14, 1.55, 1.4, 0.28, trim);
        r.box.add(x, cy + 0.7 + 0.06, 0.2, 1.85, 0.12, 0.4, sillCol);
        r.box.add(x, cy - 0.7 - 0.07, 0.25, 1.95, 0.14, 0.5, sillCol);
        const gi = r.glass.add(x, cy, 0.285, 1.2, 1.08, 1, 0xffffff);
        if (gi >= 0) {
          slot.glassLit[slot.glassN] = hash(index * 31 + row * 7 + k * 3) < 0.42;
          slot.glassN += 1;
        }
        if (row === 0 && house === false && k % 2 === index % 2 && n >= 2) balconyKs.push(x);
        if (row === 0 && house && k % 2 === index % 2 && n >= 2) balconyKs.push(x);
      }
    });
    // バルコニー（窓の下。手すりは透かしテクスチャ）
    if (deco.kind !== 'shop') {
      balconyKs.slice(0, CAP_RAIL).forEach((x) => {
        const sy = rowY1 - 1.0;
        r.box.add(x, sy, 0.55, 2.2, 0.16, 1.1, sillCol);
        r.rail.add(x, sy + 0.08 + 0.42, 1.08, 2.2, 0.84, 1, dark);
      });
    }
    // 店：庇と看板（主人公の頭より上）
    if (deco.kind === 'shop') {
      r.awning.add(cx - width / 2 + 3.3, 4.35, 0.8, 4.2, 0.12, 1.7, AWNING_COLORS[index % AWNING_COLORS.length], 0.28);
      if (deco.sign >= 0) r.sign.add(cx + width / 2 - 2.5, 5.0, 0.2, 2.6, 0.62, 0.3, SIGN_COLORS[deco.sign % SIGN_COLORS.length]);
    }
    // 事務所・ビル：柱と帯（主人公の頭より上の帯）
    if (!house) {
      r.box.add(cx - width / 2 + 0.18, height / 2, 0.14, 0.36, height, 0.28, trim);
      r.box.add(cx + width / 2 - 0.18, height / 2, 0.14, 0.36, height, 0.28, trim);
      if (deco.kind !== 'shop') r.box.add(cx, 5.05, 0.09, width, 0.14, 0.18, trim);
    }
    // 右端の扉（少し引っ込んだ扉と段）
    {
      const dx = cx + width / 2 - 1.3;
      r.box.add(dx, SIDEWALK_Y + 1.35, 0.11, 1.75, 2.7, 0.22, trim);
      r.box.add(dx, SIDEWALK_Y + 1.2, 0.2, 1.3, 2.4, 0.08, deco.kind === 'shop' ? 0x3d6b7d : 0x4a3a30);
      r.box.add(dx + 0.38, SIDEWALK_Y + 1.1, 0.26, 0.1, 0.1, 0.06, 0xe9c46a);
      r.box.add(dx, SIDEWALK_Y + 0.07, 0.5, 2.1, 0.14, 0.9, sillCol);
    }
    // 屋上の小物
    const roofKind = deco.roof % 3;
    if (house) {
      r.box.add(cx + 2.6, height + 1.15, -1.8, 0.7, 1.9, 0.7, 0x8a4b3a); // 煙突
    } else if (deco.kind === 'tower') {
      r.box.add(cx - 1.4, roofTop + 0.8, -3.2, 3.2, 1.6, 3, tC.set(trim).multiplyScalar(0.85).getHex());
      r.cyl.add(cx + 2.4, roofTop + 2.0, -3.2, 0.05, 4.0, 0.05, dark);
      r.box.add(cx + 2.4, roofTop + 3.2, -3.2, 1.2, 0.05, 0.05, dark);
    } else if (roofKind === 0) {
      r.box.add(cx - 2.6, roofTop + 0.35, -2.0, 1.4, 0.7, 1.0, 0xb8bcc4);
      r.box.add(cx - 0.9, roofTop + 0.3, -2.2, 1.1, 0.6, 0.9, 0xa4a8b0);
      r.box.add(cx + 2.3, roofTop + 0.6, -3.0, 0.9, 1.2, 0.9, 0x9a9ea6);
    } else if (roofKind === 1) {
      r.box.add(cx - 2.3, roofTop + 0.3, -2.4, 1.5, 0.6, 1.5, 0x777b84);
      r.cyl.add(cx - 2.3, roofTop + 1.5, -2.4, 0.85, 1.7, 0.85, 0x8a5a3c);
    } else {
      r.cyl.add(cx + 2.8, roofTop + 1.75, -2.5, 0.05, 3.5, 0.05, dark);
      r.box.add(cx + 2.8, roofTop + 2.8, -2.5, 1.3, 0.05, 0.05, dark);
      r.box.add(cx + 2.8, roofTop + 2.3, -2.5, 0.9, 0.05, 0.05, dark);
      r.box.add(cx - 2.5, roofTop + 0.35, -2.0, 1.4, 0.7, 1.0, 0xb8bcc4);
    }
    r.box.end();
    r.cyl.end();
    r.glass.end();
    r.rail.end();
    r.awning.end();
    r.sign.end();
    refreshGlass.dirty = true;
    refreshGlass();
  }

  // ---- 街灯・車止め（建物の境目 x=k*W だけ） ----
  let lampBase = Number.NaN;
  function placeLamps(k0) {
    if (k0 === lampBase) return;
    lampBase = k0;
    const dark = 0x3a3f4c;
    for (let j = 0; j < NL; j += 1) {
      // 街灯は歩道の奥（路地の中央 x=k*W、主人公の後ろ）に立て、腕を通りへ伸ばして頭より高い所に灯りを置く
      const kx = (k0 - 2 + j) * W;
      const poleZ = 0.45;
      const armLen = 2.4;
      put(cyls, LAMP_CYL0 + j, kx, SIDEWALK_Y + 2.7, poleZ, 0.09, 5.4, 0.09, dark);
      put(boxes, LAMP_BOX0 + j * 4, kx, SIDEWALK_Y + 0.15, poleZ, 0.4, 0.3, 0.4, dark);
      put(boxes, LAMP_BOX0 + j * 4 + 1, kx, SIDEWALK_Y + 5.4, poleZ + armLen / 2, 0.1, 0.1, armLen, dark);
      put(boxes, LAMP_BOX0 + j * 4 + 2, kx, SIDEWALK_Y + 5.4, poleZ + armLen, 0.6, 0.18, 0.7, dark);
      put(bulbs, j, kx, SIDEWALK_Y + 5.25, poleZ + armLen, 0.24, 0.17, 0.24);
      put(pools, j, kx, SIDEWALK_Y + 0.012, poleZ + armLen - 0.2, 7, 4.6, 1, undefined, -Math.PI / 2);
      haloGeo.attributes.position.setXYZ(j, kx, SIDEWALK_Y + 5.25, poleZ + armLen);
    }
    haloGeo.attributes.position.needsUpdate = true;
    flag(boxes);
    flag(cyls);
    flag(bulbs);
    flag(pools);
  }

  // ---- 窓の灯り（時間帯で色を変える。窓の枠・壁の色には触れない） ----
  let glassKey = '';
  function refreshGlass(force = false) {
    const key = `${Math.round(cur.glow * 60)}|${cur.glass.getHex()}`;
    if (!force && key === glassKey && !refreshGlass.dirty) return;
    glassKey = key;
    refreshGlass.dirty = false;
    for (const slot of slots) {
      for (let i = 0; i < slot.glassN; i += 1) {
        const lit = slot.glassLit[i];
        tC.copy(cur.glass);
        if (lit) tC.lerp(tmpColor.set(LIT_GLASS), cur.glow);
        else if (cur.glow > 0) tC.multiplyScalar(1 - 0.35 * cur.glow);
        glass.setColorAt(slot.glassStart + i, tC);
      }
    }
    if (glass.instanceColor) glass.instanceColor.needsUpdate = true;
  }
  refreshGlass.dirty = true;

  // ---- 宝石店（開始演出） ----
  let shop = null;
  let shopExtras = null;
  if (showOpeningShop) {
    shop = createJewelryShop(W - GAP, 9);
    shop.position.set(-W / 2, 0, 0);
    scene.add(shop);
    shopExtras = new THREE.Group();
    const sBody = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xb59f86 }));
    sBody.scale.set(W - GAP, 9, 9);
    sBody.position.set(-W / 2, 4.5, -4.52);
    const sCap = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7a3e9d }));
    sCap.scale.set(W - GAP + 0.5, 0.5, 1.2);
    sCap.position.set(-W / 2, 9.1, 0.15);
    shopExtras.add(sBody, sCap);
    scene.add(shopExtras);
  }
  // 宝石店の警報ランプ（開始演出の間だけ点滅する）
  let alarmMat = null;
  if (shopExtras) {
    alarmMat = new THREE.MeshBasicMaterial({ color: 0x6a1a1a, fog: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), alarmMat);
    lamp.position.set(-W / 2 + 3.4, 9.75, 0.5);
    const lampBase = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f4c }));
    lampBase.scale.set(0.5, 0.2, 0.5);
    lampBase.position.set(-W / 2 + 3.4, 9.45, 0.5);
    shopExtras.add(lamp, lampBase);
  }

  // ---- 主人公・警察・影 ----
  const heroRoot = new THREE.Group();
  const hero = createChameleon();
  heroRoot.add(hero.group);
  heroRoot.rotation.y = HERO_YAW;
  heroRoot.position.set(0, SIDEWALK_Y, HERO_Z);
  scene.add(heroRoot);
  const jewelHome = hero.jewel.position.clone();
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const makeBlob = (sx, sz) => {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(sx, sz, 1);
    scene.add(m);
    return m;
  };
  maskAvoid(blobMat);
  const heroShadow = makeBlob(2.8, 1.7);
  const ferrets = [createFerret(), createFerret()];
  const ferretRoots = ferrets.map((f, i) => {
    const root = new THREE.Group();
    root.add(f.group);
    root.scale.setScalar(FERRET_SCALE);
    root.rotation.y = FERRET_YAW;
    root.position.set(-100, SIDEWALK_Y, FERRET_Z[i]);
    scene.add(root);
    return root;
  });
  // 警察の光（透明・加算の材質）は比較面にかけない。キャラクター側が glowMaterials を公開していればそれを使う
  ferrets.forEach((f) => {
    const glows = f.glowMaterials ?? [];
    if (!glows.length) {
      f.beam.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach((m) => m.transparent && glows.push(m));
      });
    }
    glows.forEach(maskAvoid);
  });
  const ferretShadows = ferrets.map(() => makeBlob(2.6, 1.6));

  // 粒・記号の演出（不透明。色を混ぜない）
  const fx = createEffects(scene);
  const reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  fx.setEnabled(!reducedMotion); // 動きを減らす設定では粒を出さない（「！」「？」の記号は出す）
  let shake = 0; // カメラの小さな揺れの大きさ
  let heroHopT = -1; // 主人公の小さな跳ね（秒）。-1 は跳ねていない
  let heroHopH = 0;
  let dustClock = 0;
  let sweatClock = 0;
  let lastPoliceStage = 0;
  const ferretMode = ['run', 'run'];
  const HERO_ICON = 2;

  // 発見演出：カメラに付けた暗幕（中心だけ抜ける）と、主人公に集まる探照灯
  const darkMat = new THREE.MeshBasicMaterial({ map: spotTex, color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false });
  const darkPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), darkMat);
  darkPlane.renderOrder = 998;
  darkPlane.visible = false;
  darkPlane.frustumCulled = false;
  camera.add(darkPlane);
  const BEAM_LEN = 14;
  const beams = [];
  for (let i = 0; i < 6; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, BEAM_LEN, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    beam.visible = false;
    beam.renderOrder = 999;
    scene.add(beam);
    beams.push(beam);
  }

  // ---- 画面・カメラ ----
  let viewW = 1;
  let viewH = 1;
  let playerX = 0;
  let refX = 0; // カメラが追う位置
  const gameTick = createGamePresentationClock();
  const practiceTick = createVisiblePresentationClock({ visibilityTarget: document });
  let ferretRel = [...FERRET_AWAY];
  let ending = null; // 終了演出の状態 { kind, start, duration, done:{} }
  let worldClock = 0;
  const cutsceneCleanups = new Set();
  let opening = false; // 開始演出の間は update を止める（二重に描かない）
  let lastArgs = null;
  let camQuat = new THREE.Quaternion();
  let heroNdc = { x: 0, y: 0 };
  let horizonNdc = 0;
  const v3 = new THREE.Vector3();
  const sampleRay = new THREE.Raycaster();

  function ndcToCam(nx, ny, depth, out) {
    out.set(nx, ny, 0.5).applyMatrix4(camera.projectionMatrixInverse);
    return out.multiplyScalar(depth / -out.z);
  }

  let disposed = false; // dispose 後は描画・読み取りをしない（失われた文脈への描画を防ぐ）

  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    renderer.setSize(viewW, viewH, false);
    const aspect = viewW / viewH;
    // 縦長で狭いときは視野を広げ、横に約1棟ぶんが入るようにする
    const vfov = (2 * Math.atan(Math.tan((CAM.fov * Math.PI) / 360) * Math.max(1, 0.78 / aspect)) * 180) / Math.PI;
    camera.fov = vfov;
    camera.aspect = aspect;
    camera.clearViewOffset();
    camera.position.set(CAM.dx, CAM.y, CAM.z);
    camera.lookAt(CAM.lookDx, CAM.lookY, CAM.lookZ);
    camQuat = camera.quaternion.clone();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    // 主人公の胴体が画面の左 SCREEN_X・下 SCREEN_Y に来るよう、投影をずらす
    v3.set(0, SIDEWALK_Y + 1.4, HERO_Z).project(camera);
    heroNdc = { x: v3.x, y: v3.y };
    const tx = SCREEN_X * 2 - 1;
    const ty = SCREEN_Y * 2 - 1;
    camera.setViewOffset(viewW, viewH, ((v3.x - tx) / 2) * viewW, ((ty - v3.y) / 2) * viewH, viewW, viewH);
    camera.updateMatrixWorld(true);
    // 空：地平線の位置に合わせた3段のグラデーション
    const D = 400;
    sky.position.set(0, 0, -D);
    v3.set(0, CAM.y, -5000).project(camera);
    const hor = Math.max(-0.9, Math.min(0.9, v3.y));
    horizonNdc = hor;
    const tl = ndcToCam(-1.4, 1.4, D, new THREE.Vector3());
    const br = ndcToCam(1.4, -1.4, D, new THREE.Vector3());
    const hy = ndcToCam(0, hor, D, new THREE.Vector3()).y;
    [[tl.x, tl.y], [br.x, tl.y], [tl.x, hy], [br.x, hy], [tl.x, br.y], [br.x, br.y]].forEach(([x, y], i) => {
      skyPos[i * 3] = x;
      skyPos[i * 3 + 1] = y;
      skyPos[i * 3 + 2] = 0;
    });
    skyGeo.attributes.position.needsUpdate = true;
    // 星と月
    const sp = starGeo.attributes.position;
    for (let i = 0; i < STAR_N; i += 1) {
      const ny = hor + (1.05 - hor) * (starNdc[i * 2 + 1] / 1.0);
      ndcToCam(starNdc[i * 2] * 1.05, Math.min(1, Math.max(hor, ny)), D - 10, v3);
      sp.setXYZ(i, v3.x, v3.y, -(D - 10));
    }
    sp.needsUpdate = true;
    ndcToCam(0.58, 0.45, D - 20, v3);
    moon.position.set(v3.x, v3.y, -(D - 20));
    moon.scale.setScalar(D * 0.16);
    // 暗幕：画面を覆い、穴を主人公の位置に合わせる
    const dd = 3;
    const halfH = dd * Math.tan((camera.fov * Math.PI) / 360);
    ndcToCam(tx, ty, dd, v3);
    darkPlane.position.set(v3.x, v3.y, -dd);
    darkPlane.scale.setScalar(halfH * 7.5);
    refreshGlass.dirty = true;
  }

  function assignSlots(current) {
    const wanted = [current - 2, current - 1, current, current + 1, current + 2, current + 3, current + 4].filter((i) => i >= 1 && i <= rules.buildingCount);
    slots.forEach((s, si) => {
      if (s.index !== -1 && !wanted.includes(s.index)) hideSlot(s, si);
    });
    for (const index of wanted) {
      if (slots.some((s) => s.index === index)) continue;
      const si = slots.findIndex((s) => s.index === -1);
      if (si < 0) continue;
      layoutSlot(si, index, course.targets[index - 1], decorations[index - 1]);
    }
  }

  function setTimeOfDay(building, fraction) {
    const a = areaOf(Math.min(rules.buildingCount, building));
    const next = areaOf(Math.min(rules.buildingCount, building + 1));
    const k = a.time !== next.time ? Math.max(0, fraction - 0.4) / 0.6 : 0;
    const A = palettes[a.time];
    const B = palettes[next.time];
    for (const key of COLOR_KEYS) cur[key].set(A[key]).lerp(tmpColor.set(B[key]), k);
    for (const key of NUM_KEYS) cur[key] = A[key] + (B[key] - A[key]) * k;
    const { top, bottom } = cur;
    [top, top, bottom, bottom, bottom, bottom].forEach((c, i) => {
      skyCol[i * 3] = c.r;
      skyCol[i * 3 + 1] = c.g;
      skyCol[i * 3 + 2] = c.b;
    });
    skyGeo.attributes.color.needsUpdate = true;
    scene.fog.color.copy(bottom);
    farMat.color.copy(cur.far);
    groundMat.color.copy(cur.ground).multiplyScalar(0.9);
    roadMat.color.copy(cur.road);
    walkMat.color.copy(cur.walk);
    curbMat.color.copy(cur.curb);
    hemi.color.copy(cur.hemiSky);
    hemi.groundColor.copy(cur.hemiGround);
    hemi.intensity = cur.hemi;
    sun.color.copy(cur.dir);
    sun.intensity = cur.dirI;
    bulbMat.color.setRGB(0.5, 0.5, 0.52).lerp(tmpColor.set(0xffe9b0), Math.min(1, cur.glow * 1.1));
    poolMat.opacity = cur.glow * 0.55;
    pools.visible = poolMat.opacity > 0.001;
    haloMat.opacity = cur.glow * 0.85;
    halos.visible = haloMat.opacity > 0.001;
    farGlowMat.opacity = Math.min(1, cur.glow * 1.05);
    farGlow.visible = farGlowMat.opacity > 0.001;
    starMat.opacity = cur.stars;
    stars.visible = starMat.opacity > 0.001;
    moonMat.opacity = Math.min(1, cur.stars * 1.1);
    moon.visible = moonMat.opacity > 0.001;
    cloudMat.color.copy(cur.cloud);
    cloudMat.opacity = cur.cloudA;
    // 警察官の色味：夜は少し青く落とす（主人公の体色は比較面なので変えない）
    ferrets.forEach((f) => f.setTint?.(1 - cur.glow * 0.2, 1 - cur.glow * 0.15, 1 - cur.glow * 0.02));
    refreshGlass();
  }

  /** 位置の基準 x に合わせて、カメラ・繰り返す地面・遠景・街灯・影を置く。 */
  function placeWorld(x, time = 0) {
    refX = x;
    const now = worldClock * 1000;
    const sx = reducedMotion ? 0 : Math.sin(now * 0.071) * shake;
    const sy = reducedMotion ? 0 : Math.cos(now * 0.093) * shake * 0.7;
    camera.position.set(x + CAM.dx + sx, CAM.y + Math.sin(time / 1000 * 1.7) * 0.025 + sy, CAM.z);
    camera.quaternion.copy(camQuat);
    // 雲：時間と進み具合で少しずつ流す
    for (const c of clouds) {
      let nx = c.x - (now / 1000) * c.drift - x * 0.0016;
      nx = ((((nx + 1.6) % 3.2) + 3.2) % 3.2) - 1.6;
      ndcToCam(nx, horizonNdc + (1 - horizonNdc) * c.y, 372, v3);
      c.mesh.position.set(v3.x, v3.y, -372);
      c.mesh.scale.set(372 * 0.5 * c.size, 372 * 0.25 * c.size, 1);
    }
    const snap = Math.floor(x / 10) * 10;
    sidewalk.position.x = snap;
    curb.position.x = snap;
    road.position.x = snap;
    ground.position.x = x;
    const fp = Math.floor(x / FAR_P) * FAR_P;
    farMesh.position.x = fp;
    farGlow.position.x = fp;
    placeLamps(Math.floor(x / W));
    sun.target.position.set(x, 0, 0);
    sun.position.set(x - 8, 14, 12);
  }

  function placeHero(x, y = 0) {
    heroRoot.position.set(x, SIDEWALK_Y + y, HERO_Z);
    heroShadow.position.set(x + 0.3, SIDEWALK_Y + 0.02, HERO_Z - 0.2);
    heroShadow.material.opacity = 1;
    const s = 1 - Math.min(0.5, y * 0.3);
    heroShadow.scale.set(2.8 * s, 1.7 * s, 1);
  }

  /** 主人公の小さな跳ね（見た目だけ。判定の位置 playerX は動かさない）。 */
  function hopHero(height = 0.5) {
    if (reducedMotion) return;
    heroHopT = 0;
    heroHopH = height;
  }
  const HOP_S = 0.36;
  function heroHopY(dt) {
    if (heroHopT < 0) {
      heroRoot.scale.set(1, 1, 1);
      return 0;
    }
    heroHopT += dt;
    const k = Math.min(1, heroHopT / HOP_S);
    const sq = 1 + Math.sin(k * Math.PI * 2) * 0.07; // 踏み切りで伸び、着地でつぶれる
    heroRoot.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (k >= 1) {
      heroHopT = -1;
      heroRoot.scale.set(1, 1, 1);
      fx.emit('dust', heroRoot.position.x, SIDEWALK_Y + 0.12, HERO_Z, { count: 3 });
      return 0;
    }
    return Math.sin(k * Math.PI) * heroHopH;
  }

  /** 警察官の位置・動き・記号。mode は 'run'・'search'・'chase'。 */
  function updatePolice(dt, stage, mode, { near = FERRET_NEAR, withBeam = true, walking = true } = {}) {
    ferrets.forEach((f, i) => {
      const active = stage > i;
      // 見失った時は少し下がり、見つけた時は詰める
      const target = active ? near[i] + (mode === 'search' ? -0.55 : mode === 'chase' ? 0.3 : 0) : FERRET_AWAY[i];
      ferretRel[i] += (target - ferretRel[i]) * Math.min(1, dt * (target > ferretRel[i] ? 2.8 : 1.6));
      const show = ferretRel[i] > -11;
      const root = ferretRoots[i];
      root.visible = show;
      ferretShadows[i].visible = show;
      root.position.x = playerX + ferretRel[i];
      const m = active ? mode : 'run';
      // 立ち位置に着いてから状態が変わった時に、頭の上に記号を出す（走り込みの「！」とは重ねない）
      const arrived = active && Math.abs(target - ferretRel[i]) < 1.2;
      if (!arrived) {
        ferretMode[i] = 'run';
      } else if (m !== ferretMode[i]) {
        if (m === 'search') fx.showIcon(i, '?', 1500);
        else if (m === 'chase') fx.showIcon(i, '!', 800);
        else fx.hideIcon(i);
        ferretMode[i] = m;
      }
      if (!show || !active) fx.hideIcon(i);
      f.animate(dt, { walking: walking || !active, mode: m });
      const hop = f.hop * FERRET_SCALE;
      const sh = 1 - Math.min(0.5, hop * 0.3);
      ferretShadows[i].scale.set(2.6 * sh, 1.6 * sh, 1);
      ferretShadows[i].position.set(root.position.x + 0.2, SIDEWALK_Y + 0.02, root.position.z - 0.15);
      fx.placeIcon(i, root.position.x + 0.35, SIDEWALK_Y + 3.6 * FERRET_SCALE + hop + 0.75, root.position.z);
      f.beam.visible = withBeam && active && show;
    });
  }


  // ---- 終了演出（毎フレームの update から呼ぶ） ----
  const eDir = new THREE.Vector3();
  const eSrc = new THREE.Vector3();
  const eTarget = new THREE.Vector3();
  const eUp = new THREE.Vector3(0, -1, 0);
  function applyEnding(dt, now) {
    const e = ending;
    const k = Math.min(1, now / e.duration);
    const once = (name, at, fn) => {
      if (k >= at && !e.done[name]) {
        e.done[name] = true;
        fn();
      }
    };
    const x = heroRoot.position.x;
    if (e.kind === 'detected') {
      // 見つかった：主人公が飛び上がり、警察が指をさして詰め寄る。光が1本ずつ増えて集まり、周りは暗くなる
      once('shock', 0, () => {
        hopHero(0.75);
        fx.showIcon(HERO_ICON, '!', 1300);
        fx.emit('shock', x + 0.2, SIDEWALK_Y + 3.0, HERO_Z + 0.3);
        shake = 0.14;
        ferrets.forEach((f) => f.react());
      });
      hero.animate(dt, { walking: false, nervous: 1 });
      if (!reducedMotion) heroRoot.position.x += Math.sin(now * 0.07) * 0.03 * Math.min(1, k * 3); // 震える
      sweatClock += dt;
      if (sweatClock > 0.22 && k < 0.8) {
        sweatClock = 0;
        fx.emit('sweat', x - 0.2, SIDEWALK_Y + 2.8, HERO_Z + 0.35, { dirX: Math.random() < 0.5 ? -1.4 : 1.2 });
      }
      updatePolice(dt, 2, 'chase', { near: [-2.6, -4.3], walking: k < 0.5 });
      darkPlane.visible = true;
      darkMat.opacity = Math.min(0.85, k * 1.1);
      const n = Math.min(beams.length, Math.floor(k * (beams.length + 1)));
      eTarget.set(playerX, SIDEWALK_Y + 1.5, HERO_Z);
      beams.forEach((b, i) => {
        b.visible = i < n;
        const a = -1 + (i / (beams.length - 1)) * 2;
        const conv = 1 - 0.55 * k; // だんだん主人公へ寄る
        eSrc.set(eTarget.x + a * 9 * conv, 11, eTarget.z + 6 + Math.abs(a) * 2);
        eDir.copy(eTarget).sub(eSrc);
        const dist = eDir.length();
        eDir.divideScalar(dist);
        b.quaternion.setFromUnitVectors(eUp, eDir);
        b.scale.set(1.0 + k * 0.3, dist / BEAM_LEN, 1.0 + k * 0.3);
        b.position.copy(eSrc).addScaledVector(eDir, dist / 2);
        b.material.opacity = 0.09;
      });
    } else if (e.kind === 'cleared') {
      // 逃げ切った：尻尾から宝石を出して掲げ、跳ねて喜ぶ。紙吹雪
      hero.animate(dt, { walking: false });
      updatePolice(dt, 0, 'run');
      once('hop1', 0.04, () => hopHero(0.8));
      once('conf1', 0.28, () => fx.emit('confetti', x - 1.4, SIDEWALK_Y + 3.4, HERO_Z + 0.6));
      once('hop2', 0.45, () => hopHero(0.9));
      once('conf2', 0.52, () => fx.emit('confetti', x + 1.6, SIDEWALK_Y + 3.8, HERO_Z + 0.6));
      once('hop3', 0.78, () => hopHero(0.6));
      once('conf3', 0.8, () => fx.emit('confetti', x, SIDEWALK_Y + 4.2, HERO_Z + 0.6));
      const j = Math.min(1, Math.max(0, (k - 0.2) / 0.5));
      const up = 1 - (1 - j) * (1 - j);
      hero.jewel.visible = k > 0.2;
      hero.jewel.position.set(jewelHome.x + up * 1.3, jewelHome.y + up * 2.9, jewelHome.z + up * 0.8);
      hero.jewel.rotation.y += dt * 5;
      hero.jewel.scale.setScalar(1 + up * 0.8);
      hero.head.rotation.y = -0.5 * up;
      hero.tail.scale.set(1 + up * 0.25, 1 - up * 0.2, 1);
      sweatClock += dt;
      if (k > 0.3 && sweatClock > 0.28) {
        sweatClock = 0;
        hero.jewel.getWorldPosition(v3);
        fx.emit('gem', v3.x, v3.y, v3.z + 0.2);
      }
    } else {
      hero.animate(dt, { walking: false });
      updatePolice(dt, 0, 'run');
    }
  }

  resize();
  const onResize = () => resize();
  globalThis.addEventListener('resize', onResize);

  function drawFrame() {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  /** 体の比較用の材質（キャラクター側が公開していればそれを使い、なければトゥーンの材質を探す）。 */
  let cmpMats = null;
  function comparisonMats() {
    if (cmpMats) return cmpMats;
    if (hero.comparisonMaterials?.length) cmpMats = [...hero.comparisonMaterials];
    else {
      let best = null;
      hero.group.traverse((o) => {
        const m = o.material;
        if (m?.isShaderMaterial && m.uniforms?.uColor && m.uniforms?.uGloss && (!best || m.uniforms.uGloss.value > best.uniforms.uGloss.value)) best = m;
      });
      cmpMats = best ? [best] : [];
    }
    return cmpMats;
  }

  comparisonMats().forEach(maskWrite);

  const heroWorldPoint = (out) => {
    heroRoot.updateMatrixWorld(true);
    if (hero.comparePoint) return hero.comparePoint.getWorldPosition(out);
    return out.set(-0.05, 1.15, 0.3).applyMatrix4(hero.group.matrixWorld);
  };

  // 初めて警察や演出が出るときの描画の引っかかりを避けるため、最初に一度だけ全部の材質を準備する
  {
    const restore = [];
    const show = (o) => {
      restore.push([o, o.visible]);
      o.visible = true;
    };
    ferretRoots.forEach((r) => {
      show(r);
      r.traverse((o) => o !== r && show(o));
    });
    ferrets.forEach((f) => f.beam.traverse(show));
    beams.forEach(show);
    show(darkPlane);
    show(hero.jewel);
    show(halos);
    show(pools);
    show(farGlow);
    show(stars);
    show(moon);
    fx.objects().forEach(show);
    renderer.compile(scene, camera);
    restore.reverse().forEach(([o, v]) => (o.visible = v));
  }

  const api = {
    kind: 'three',
    renderer,
    /** 毎フレーム。t はゲーム内時刻、color は体色（HSV整数）、policeStage は警察の人数、matchState は今の一致の段階。 */
    update(args, cutsceneFrame = null) {
      if (disposed || opening) return;
      if (ending && !cutsceneFrame) { lastArgs = args; return; }
      lastArgs = args;
      const { t, color, policeStage = 0, searching = false, nervous = 0, walking = true, matchState = null } = args;
      const dt = cutsceneFrame?.dt ?? (ending ? 0 : gameTick(args.presentation?.t ?? t, args.presentation?.running ?? args.running ?? true));
      const now = cutsceneFrame?.elapsed ?? 0;
      worldClock += dt;
      playerX = (t / rules.buildingMs) * W; // 判定と同じ時刻から位置を決める
      const building = Math.min(rules.buildingCount, Math.floor(t / rules.buildingMs) + 1);
      assignSlots(building);
      setTimeOfDay(building, (t % rules.buildingMs) / rules.buildingMs);
      shake *= Math.exp(-dt * 7);
      placeWorld(playerX, worldClock * 1000);
      const hopY = heroHopY(dt);
      placeHero(playerX, hopY);
      hero.setColor(rgbFloat(color));
      if (ending) {
        applyEnding(dt, now);
      } else {
        hero.animate(dt, { walking, nervous });
        // 警察：通常は画面外。段階に応じて主人公の後ろ（同じ歩道の並び）へ走り込み、回復で後退する
        if (policeStage > lastPoliceStage) {
          const i = Math.min(ferrets.length, policeStage) - 1;
          ferrets[i].react();
          fx.showIcon(i, '!', 900);
          shake = Math.max(shake, 0.05);
        }
        lastPoliceStage = policeStage;
        const mode = policeStage > 0 && (matchState === 'success' || (matchState == null && searching)) ? 'search' : policeStage > 0 && matchState === 'danger' ? 'chase' : 'run';
        updatePolice(dt, policeStage, mode, { walking });
        if (walking) {
          // 足元の土ぼこり
          dustClock += dt;
          if (dustClock > 0.38) {
            dustClock = 0;
            fx.emit('dust', playerX - 0.35, SIDEWALK_Y + 0.1, HERO_Z, { dirX: -0.8 });
            ferretRoots.forEach((r) => r.visible && fx.emit('dust', r.position.x - 0.3, SIDEWALK_Y + 0.1, r.position.z, { count: 1, dirX: -0.8 }));
          }
          // 焦りの汗（警戒が高い時）
          if (nervous >= 0.5) {
            sweatClock += dt;
            if (sweatClock > (nervous >= 1 ? 0.32 : 0.6)) {
              sweatClock = 0;
              fx.emit('sweat', playerX - 0.25, SIDEWALK_Y + 2.75 + hopY, HERO_Z + 0.35, { dirX: -1.4 });
            }
          }
        }
      }
      fx.placeIcon(HERO_ICON, heroRoot.position.x + 0.35, SIDEWALK_Y + 3.75 + hopY, HERO_Z);
      fx.update(dt, camQuat);
      if (shop) {
        const vis = playerX < W * 1.5;
        shop.visible = vis;
        shopExtras.visible = vis;
      }
      drawFrame();
    },
    /**
     * 本編の出来事に合わせた小さな演出（見た目だけ。得点や判定には関わらない）。
     * success＝擬態成功のきらめき、pass＝棟の成功通過、combo＝連続成功の節目、milestone＝区間の節目、unlock＝明るさの解放。
     */
    presentationEvent(_event) {},
    fx(name) {
      if (disposed || ending) return;
      const x = heroRoot.position.x;
      const y = SIDEWALK_Y;
      if (name === 'success') {
        fx.emit('sparkle', x, y + 1.6, HERO_Z + 0.4);
        hopHero(0.28);
      } else if (name === 'pass') {
        fx.emit('pass', x + 0.2, y + 3.2, HERO_Z + 0.2);
      } else if (name === 'combo') {
        fx.emit('confetti', x, y + 2.6, HERO_Z + 0.5);
        hopHero(0.55);
      } else if (name === 'milestone') {
        fx.emit('confetti', x + 1.5, y + 3.4, HERO_Z + 0.5);
        fx.emit('confetti', x - 1.2, y + 3.0, HERO_Z + 0.5, { count: 8 });
      } else if (name === 'unlock') {
        fx.emit('sparkle', x, y + 1.6, HERO_Z + 0.4, { count: 12 });
        hopHero(0.4);
      }
    },
    /** 練習用：目標の壁だけを見せる。 */
    showPractice(target) {
      if (disposed) return;
      slots.forEach((s, i) => hideSlot(s, i));
      layoutSlot(0, 1, target, { heightScale: 100, kind: 'house', windows: 2, roof: 0, trimTone: 0, sign: -1 });
      ferretRoots.forEach((r, i) => {
        r.visible = false;
        ferretShadows[i].visible = false;
      });
      fx.clear();
      if (shop) {
        shop.visible = false;
        shopExtras.visible = false;
      }
    },
    renderPractice(color, target) {
      if (disposed) return;
      const s = slots[0];
      const [r, g, b] = rgbFloat(target);
      s.facadeMat.color.setRGB(r, g, b);
      setTimeOfDay(1, 0);
      const { dt } = practiceTick(performance.now(), document.hidden);
      worldClock += dt;
      placeWorld(PRACTICE_X);
      placeHero(PRACTICE_X, heroHopY(dt));
      hero.setColor(rgbFloat(color));
      hero.animate(dt, { walking: false });
      fx.update(dt, camQuat);
      drawFrame();
    },
    /** 終了演出。結果は先に確定しているので、スキップしても結果は変わらない。 */
    async playEnding(kind, { signal, onFrame = () => {} } = {}) {
      const duration = kind === 'detected' ? 2800 : kind === 'cleared' ? 3000 : 600;
      const tick = createVisiblePresentationClock({ visibilityTarget: document });
      const currentEnding = { kind, duration, done: {} };
      ending = currentEnding;
      hero.jewel.position.copy(jewelHome); // 宝石は常に尻尾の元の位置から出す（開始演出を飛ばしても胸からは出さない）
      return new Promise((resolve) => {
        let frameId = null;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (frameId != null) cancelAnimationFrame(frameId);
          tick.dispose();
          cutsceneCleanups.delete(finish);
          signal?.removeEventListener('abort', finish);
          resolve();
        };
        cutsceneCleanups.add(finish);
        signal?.addEventListener('abort', finish, { once: true });
        const step = (now) => {
          if (signal?.aborted || disposed || ending !== currentEnding) { finish(); return; }
          const frame = tick(now, document.hidden);
          const k = Math.min(1, frame.elapsed / duration);
          if (!document.hidden) {
            onFrame(frame.elapsed);
            if (finished || signal?.aborted || disposed) { finish(); return; }
            if (lastArgs) api.update(lastArgs, frame);
          }
          if (k >= 1) {
            finish();
            return;
          }
          frameId = requestAnimationFrame(step);
        };
        if (signal?.aborted || disposed) finish();
        else frameId = requestAnimationFrame(step);
      });
    },
    /** 初回の開始演出：警報の鳴る宝石店から飛び出し、宝石を尻尾に隠す。onCue は音を合わせるための合図。 */
    async playOpening({ signal, onCue = () => {} } = {}) {
      const tick = createVisiblePresentationClock({ visibilityTarget: document });
      const duration = 2800;
      const done = {};
      opening = true;
      fx.clear();
      hero.jewel.visible = true;
      return new Promise((resolve) => {
        let frameId = null;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          if (frameId != null) cancelAnimationFrame(frameId);
          tick.dispose();
          cutsceneCleanups.delete(finish);
          signal?.removeEventListener('abort', finish);
          opening = false;
          heroRoot.position.y = SIDEWALK_Y;
          hero.jewel.visible = false;
          hero.jewel.position.copy(jewelHome);
          hero.jewel.rotation.y = 0;
          alarmMat?.color.set(0x6a1a1a);
          fx.clear();
          resolve();
        };
        cutsceneCleanups.add(finish);
        signal?.addEventListener('abort', finish, { once: true });
        const step = (timestamp) => {
          if (signal?.aborted || disposed || !opening) { finish(); return; }
          const { elapsed: now, dt } = tick(timestamp, document.hidden);
          if (document.hidden && !signal?.aborted && !disposed) { frameId = requestAnimationFrame(step); return; }
          worldClock += dt;
          const k = Math.min(1, now / duration);
          const once = (name, at, fn) => {
            if (k >= at && !done[name]) {
              done[name] = true;
              fn();
            }
          };
          const x = -W * 0.6 + k * W * 0.6;
          const y = Math.max(0, Math.sin(k * Math.PI * 2) * 1.2 * (1 - k));
          setTimeOfDay(1, 0);
          assignSlots(1);
          placeWorld(x);
          placeHero(x, y);
          once('alarm', 0, () => onCue('alarm'));
          once('burst', 0.03, () => {
            fx.emit('glass', x + 0.4, SIDEWALK_Y + 1.8, HERO_Z - 0.6);
            onCue('jump');
          });
          once('land', 0.5, () => fx.emit('dust', x, SIDEWALK_Y + 0.12, HERO_Z, { count: 4 }));
          once('hide', 0.82, () => {
            hero.jewel.getWorldPosition(v3);
            fx.emit('gem', v3.x, v3.y, v3.z + 0.3, { count: 6 });
            onCue('jewel');
          });
          if (alarmMat) alarmMat.color.set(Math.floor(now / 150) % 2 ? 0xff3b3b : 0x6a1a1a);
          hero.jewel.position.set(jewelHome.x + (1 - k) * 1.5, jewelHome.y + (1 - k) * 1.6, jewelHome.z);
          hero.jewel.rotation.y += dt * 5;
          hero.jewel.visible = k < 0.85;
          hero.animate(dt, { walking: true });
          ferretRoots.forEach((r, i) => {
            r.visible = false;
            ferretShadows[i].visible = false;
          });
          fx.update(dt, camQuat);
          if (shop) {
            shop.visible = true;
            shopExtras.visible = true;
          }
          drawFrame();
          if (k >= 1) {
            finish();
            return;
          }
          frameId = requestAnimationFrame(step);
        };
        if (signal?.aborted || disposed) finish();
        else frameId = requestAnimationFrame(step);
      });
    },
    resetEnding() {
      for (const finish of cutsceneCleanups) finish();
      ending = null;
      darkPlane.visible = false;
      darkMat.opacity = 0;
      beams.forEach((b) => (b.visible = false));
      hero.jewel.visible = false;
      hero.jewel.position.copy(jewelHome);
      hero.jewel.scale.setScalar(1);
      hero.tail.scale.set(1, 1, 1);
      fx.clear();
      heroHopT = -1;
      shake = 0;
    },
    /** 検証用：ワールド座標の1点（x,y,z）を、描画済みの画面から読む（8ビットのRGB）。 */
    pixelAt(worldX, worldY, worldZ = 0) {
      if (disposed) return null;
      camera.updateMatrixWorld(true);
      const v = new THREE.Vector3(worldX, worldY, worldZ).project(camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null; // 画面の外
      const canvas = renderer.domElement;
      const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(((v.x + 1) / 2) * canvas.width)));
      const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(((v.y + 1) / 2) * canvas.height)));
      const gl = renderer.getContext();
      const buf = new Uint8Array(4);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return [buf[0], buf[1], buf[2]];
    },
    /**
     * 検証用：棟 index の外壁（正面の面・窓より下）と、主人公の胴（比較点）の色。
     * 壁は、主人公・警察・街灯から画面上で最も離れた位置の点を選び、手前に何も入らないようにする。
     */
    sampleComparison(index) {
      if (disposed) return null;
      drawFrame();
      camera.updateMatrixWorld(true);
      const heroP = heroWorldPoint(new THREE.Vector3());
      const slot = slots.find((s) => s.index === index);
      const cx = slot ? slot.cx : (index - 1) * W + W / 2;
      const width = slot ? slot.width : W - GAP;
      const canvasW = renderer.domElement.width;
      const toScreen = (p) => {
        const v = p.clone().project(camera);
        return [((v.x + 1) / 2) * canvasW, ((1 - v.y) / 2) * renderer.domElement.height];
      };
      const blockers = [toScreen(heroP)];
      ferretRoots.forEach((r) => {
        if (r.visible) blockers.push(toScreen(new THREE.Vector3(r.position.x, SIDEWALK_Y + 1.5, r.position.z)));
      });
      const k0 = Math.floor(refX / W);
      for (let j = -2; j <= 5; j += 1) blockers.push(toScreen(new THREE.Vector3((k0 + j) * W, 2.5, 0.45)));
      // 候補点ごとに、カメラからの視線の最初の不透明な物体が正面の面かを確かめる（手前に人・街灯などが入る点は使わない）
      const slotFacade = slot ? slot.facade : null;
      const isClear = (p) => {
        sampleRay.set(camera.position, p.clone().sub(camera.position).normalize());
        const hits = sampleRay.intersectObjects(scene.children, true);
        for (const h of hits) {
          const o = h.object;
          let hidden = false;
          for (let q = o; q; q = q.parent) if (!q.visible) hidden = true;
          if (hidden || o.material?.transparent || o.material?.depthWrite === false || o.isPoints) continue;
          return o === slotFacade;
        }
        return false;
      };
      let best = null;
      for (const wy of [2.3, 3.4, 1.5]) {
        for (let lx = -width / 2 + 1.0; lx <= width / 2 - 2.6; lx += 0.5) {
          const p = new THREE.Vector3(cx + lx, wy, 0);
          const [px, py] = toScreen(p);
          if (px < canvasW * 0.04 || px > canvasW * 0.96 || py < renderer.domElement.height * 0.1 || py > renderer.domElement.height * 0.95) continue;
          if (!isClear(p)) continue;
          const score = Math.min(...blockers.map(([bx]) => Math.abs(bx - px)));
          if (!best || score > best.score) best = { score, lx, wy };
        }
      }
      if (!best) return null; // 手前に何も入らない壁の点が見つからない
      const lx = best.lx;
      const WALL_Y = best.wy;
      const wall = api.pixelAt(cx + lx, WALL_Y, 0);
      const heroPx = api.pixelAt(heroP.x, heroP.y, heroP.z);
      if (!wall || !heroPx) return null;
      return { wall, hero: heroPx };
    },
    /**
     * 検証用：見えている壁の正面（全面）と体の中央の色が、判定と同じ値かを全画素で調べる。
     * 比較面だけを区別できる色で塗った版を描き、その画素が通常の描画でも同じ値かを読み比べる。
     * 光・影・霧のような重ね描きが比較面にかかっていれば、不一致として数える。
     */
    checkComparisonSurfaces() {
      if (disposed) return null;
      drawFrame();
      const gl = renderer.getContext();
      const cw = renderer.domElement.width;
      const ch = renderer.domElement.height;
      const readAll = () => {
        const b = new Uint8Array(cw * ch * 4);
        gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, b);
        return b;
      };
      const normal = readAll();
      const mats = new Map();
      scene.traverse((o) => {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.set(m, m.colorWrite));
      });
      // 不透明な物（手前の人・手足の輪郭・街灯など）はそのまま描いて、比較面を隠す所を除く。重ね描きの光（透明）だけ消す
      for (const m of mats.keys()) if (m.transparent) m.colorWrite = false;
      const live = slots.filter((sl) => sl.index > 0 && sl.group.visible);
      const saved = live.map((sl) => sl.facadeMat.color.clone());
      const wallMarkStep = Math.floor(255 / SLOTS); // 全ての描画枠の印を8ビットに収める
      live.forEach((sl, i) => {
        sl.facadeMat.colorWrite = true;
        sl.facadeMat.color.setRGB(((i + 1) * wallMarkStep) / 255, 0, 0);
      });
      const bodyMats = comparisonMats().filter((m) => m.uniforms?.uColor);
      const bodySaved = bodyMats.map((m) => m.uniforms.uColor.value.clone());
      const bodyTarget = bodyMats.length ? bodyMats[0].uniforms.uColor.value.toArray().map((x) => Math.round(x * 255)) : null;
      bodyMats.forEach((m) => {
        m.colorWrite = true;
        m.uniforms.uColor.value.setRGB(0, 128 / 255, 0);
      });
      const clearSaved = renderer.getClearColor(new THREE.Color());
      renderer.setClearColor(0x000000, 1);
      const bgFog = scene.fog;
      scene.fog = null;
      renderer.render(scene, camera);
      const mask = readAll();
      scene.fog = bgFog;
      renderer.setClearColor(clearSaved, 1);
      for (const [m, c] of mats) m.colorWrite = c;
      live.forEach((sl, i) => sl.facadeMat.color.copy(saved[i]));
      bodyMats.forEach((m, i) => m.uniforms.uColor.value.copy(bodySaved[i]));
      drawFrame();
      const key = (i) => mask[i] * 65536 + mask[i + 1] * 256 + mask[i + 2];
      const res = { wallPixels: 0, wallMismatches: 0, bodyPixels: 0, bodyMismatches: 0, maxDev: 0, perSlot: live.map((sl) => ({ index: sl.index, pixels: 0, mismatches: 0 })) };
      const targets = live.map((sl) => saved[live.indexOf(sl)].toArray().map((x) => Math.round(x * 255)));
      for (let y = 2; y < ch - 2; y += 1) {
        for (let x = 2; x < cw - 2; x += 1) {
          const i = (y * cw + x) * 4;
          let kind = 0;
          let tgt = null;
          let slotNo = -1;
          if (mask[i + 1] === 0 && mask[i + 2] === 0 && mask[i] > 0 && mask[i] % wallMarkStep === 0 && mask[i] / wallMarkStep <= live.length) {
            kind = 1;
            slotNo = mask[i] / wallMarkStep - 1;
            tgt = targets[slotNo];
          } else if (bodyTarget && mask[i] === 0 && mask[i + 1] === 128 && mask[i + 2] === 0) {
            kind = 2;
            tgt = bodyTarget;
          }
          if (!kind) continue;
          const k = key(i);
          let same = true;
          for (let dy = -2; dy <= 2 && same; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (key(((y + dy) * cw + x + dx) * 4) !== k) { same = false; break; }
          if (!same) continue;
          const dev = Math.max(Math.abs(normal[i] - tgt[0]), Math.abs(normal[i + 1] - tgt[1]), Math.abs(normal[i + 2] - tgt[2]));
          if (kind === 1) {
            res.wallPixels += 1;
            res.perSlot[slotNo].pixels += 1;
            if (dev > 0) {
              res.wallMismatches += 1;
              res.perSlot[slotNo].mismatches += 1;
            }
          } else {
            res.bodyPixels += 1;
            if (dev > 0) {
              res.bodyMismatches += 1;
              res.bodyBad = res.bodyBad ?? { x, y: ch - 1 - y, got: [normal[i], normal[i + 1], normal[i + 2]], want: tgt, maskPx: [mask[i], mask[i + 1], mask[i + 2]], right: [normal[i + 4], normal[i + 5], normal[i + 6]], left: [normal[i - 4], normal[i - 3], normal[i - 2]] };
            }
          }
          if (dev > res.maxDev) res.maxDev = dev;
        }
      }
      return res;
    },
    /** 描画物体の数（連戦での増加の確認用、SCOPE-03）。 */
    stats() {
      let objects = 0;
      scene.traverse(() => (objects += 1));
      return { objects, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls };
    },
    resize,
    dispose() {
      for (const finish of cutsceneCleanups) finish();
      practiceTick.dispose();
      if (disposed) return;
      disposed = true;
      globalThis.removeEventListener('resize', onResize);
      hero.dispose?.();
      ferrets.forEach((f) => f.dispose?.());
      fx.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        if (o.isInstancedMesh) o.dispose();
      });
      textures.forEach((t) => t.dispose());
      shop?.userData?.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
  return api;
}
