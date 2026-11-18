import * as THREE from 'three';
import { createPoseLedger, createTongueRig, TONGUE_RADIUS } from './tongue-rig.js';

// 本編の移動10秒周期の舌とダイヤ（描画と姿勢だけ）。
// 時間・抽選・抑止は処理側の game-extras-controller が持ち、ここは controller が返す
// travelTongue 枠 {phase, phaseProgress, jewelVisible, ...} だけから姿勢を決める。時計も乱数も持たない。
// ダイヤは舌が持つ専用の1形状（頂点の色・不透明・輪郭なし）で、舌の mesh の子。舌の長さの85%の点と
// 接線へ、同じ形状計算から追従する。舌の表示中は尻尾の宝石を隠す（二重表示しない）。

/** controller の段階（処理側 travel-tongue-motion.js と同じ名前・長さ）。 */
export const TRAVEL_PHASE_MS = Object.freeze({ prepare: 150, extend: 250, hold: 350, retract: 450, store: 200 });
/** ダイヤを置く、舌の長さの割合。 */
export const DIAMOND_ALONG = 0.85;
/** 保持中に舌全体を口の付け根を軸に上へ持ち上げる最大角（6度）。 */
export const TRAVEL_LIFT_RADIANS = 6 * Math.PI / 180;
const SPIN_RADIANS = Math.PI / 4;
/** 予備（150ms）のうち、口を開け切るまでの割合。舌はその後に口から出る。 */
export const MOUTH_OPEN_SHARE = 0.6;
/** 収納（200ms）のうち、舌を口へしまい切るまでの割合と、口を閉じ始める割合。 */
export const STORE_TONGUE_SHARE = 0.55;
export const STORE_CLOSE_FROM = 0.5;
/** これ以下の大きさは「口の中にしまい切った」とみなし、舌を描かない。 */
export const TONGUE_INSIDE = 0.002;
/** 開いた口の中（頭の座標）。舌の付け根を囲み、鼻先の少し前まで出る暗い楕円。縦は開き具合で伸ばす。 */
const MOUTH_CAVITY = Object.freeze({ x: 0.6, y: -0.135, rx: 0.12, ry: 0.075, rz: 0.2 });
/** 口の中の色（暗い赤）。色の空間変換は通さない。 */
const MOUTH_INSIDE = 0x6b1f33;

/** 舌の上面へ沈める量（浮いて見える隙間をなくす）。 */
const DIAMOND_SINK = 0.008;
/** ダイヤの寸法：既存宝石（半径0.2）を縦 1.15・横と奥行 0.85 に伸ばし、全体を 1.2 倍。 */
const DIAMOND_RADIUS = 0.2;
const DIAMOND_SCALE = Object.freeze({ x: 0.85 * 1.2, y: 1.15 * 1.2, z: 0.85 * 1.2 });
export const DIAMOND_HALF_HEIGHT = DIAMOND_RADIUS * DIAMOND_SCALE.y;
/** 縦軸まわり、カメラ側へ 12 度。面が2〜3枚見える。 */
const DIAMOND_YAW = 12 * Math.PI / 180;

const hexRgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
// 色の空間変換は通さず、書いた値がそのまま画面に出る（本編・ホームの描画器は色管理を使わない）。
const UPPER = hexRgb(0xc9fbff);
const UPPER_FLASH = hexRgb(0xeffeff);
const LOWER = hexRgb(0x5fd8ee);
const GLOW = hexRgb(0xffffff);
const GLOW_FLASH = hexRgb(0xfffbe0);
// 面ごとの明暗（宝石らしい面の見分け）。[+x+z, -x+z, +x-z, -x-z]
const UPPER_TONE = [1, 0.94, 0.97, 0.9];
const LOWER_TONE = [1, 0.9, 0.95, 0.84];

/** 舌の付け根（mesh の原点）から見た、舌・輪郭・ダイヤの範囲（持ち上げ・全段階を含む）。 */
const ENVELOPE = Object.freeze({ min: [-0.23, -0.17, -0.25], max: [1.06, 0.71, 0.25] });

const clamp = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
const clamp01 = (value) => clamp(value, 0, 1);
const mix = (a, b, k) => a + (b - a) * k;
const smoothstep = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const easeOutCubic = (u) => 1 - (1 - u) ** 3;
const easeOutQuart = (u) => 1 - (1 - u) ** 4;
const easeInCubic = (u) => u ** 3;
const easeInOutCubic = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);

/** ほどけ具合（0.6→1）に合わせたダイヤの大きさ。巻きが強い間は出さず、少し大きく見えてから落ち着く。 */
function diamondGrow(unroll) {
  const w = clamp01((unroll - 0.6) / 0.4);
  if (w <= 0) return 0;
  if (w < 0.75) return 1.08 * easeOutCubic(w / 0.75);
  return 1.08 - 0.08 * smoothstep(0, 1, (w - 0.75) / 0.25);
}

/**
 * controller の枠から姿勢を決める純粋な関数。枠が使えない（null・未知の段階）時は null を返す。
 * out を渡せば新しい物を作らずそこへ書く。
 * 戻り値 { mouthOpen, gazeWeight, headTilt, extension, unroll, storage, diamond, lift, glow, spin, face }。
 */
export function travelTonguePose(frame, out = {}) {
  const duration = frame ? TRAVEL_PHASE_MS[frame.phase] : undefined;
  if (!duration) return null;
  const u = clamp01(frame.phaseProgress);
  const ms = u * duration;
  let mouthOpen = 1;
  let gazeWeight = 1;
  let headTilt = 0.04;
  let extension = 0;
  let unroll = 0;
  let storage = 1;
  let diamond = 0;
  let lift = 0;
  let glow = 0;
  let spin = 0;
  // 頭を正面へ向ける強さ。予備で0→1、伸長・保持・収縮は1、収納で1→0（その時点の通常の向きへ戻る）。
  let face = 1;
  if (frame.phase === 'prepare') {
    face = easeInOutCubic(u);
    // 先に口を開け（前半の60%）、開いてから舌の先を口の中から出す（後半の40%）。
    const e = easeOutCubic(u);
    const peek = smoothstep(MOUTH_OPEN_SHARE, 1, u);
    mouthOpen = easeOutCubic(clamp01(u / MOUTH_OPEN_SHARE));
    gazeWeight = e;
    headTilt = 0.04 * e;
    extension = 0.05 * peek;
    storage = mix(0.001, 1, peek);
  } else if (frame.phase === 'extend') {
    extension = 0.05 + 0.95 * easeOutQuart(u);
    unroll = smoothstep(0.3, 1, u);
    diamond = diamondGrow(unroll);
  } else if (frame.phase === 'hold') {
    extension = 1;
    unroll = 1;
    diamond = 1;
    lift = easeOutCubic(clamp01(ms / 100));
    glow = ms < 200 ? Math.sin(Math.PI * ms / 200) : 0;
    spin = SPIN_RADIANS * u;
  } else if (frame.phase === 'retract') {
    const e = easeInOutCubic(u);
    extension = 1 - 0.95 * e;
    unroll = 1 - smoothstep(0.2, 0.8, u);
    gazeWeight = 1 - 0.5 * e;
    headTilt = 0.04 - 0.02 * e;
    lift = 1 - e;
    diamond = smoothstep(0.6, 0.95, unroll); // 先端が巻き始めたら、ダイヤは巻きの手前でしまう
    spin = SPIN_RADIANS;
  } else {
    // 舌を口の中へしまい切ってから（前半の55%）、口を閉じる（後半の50%）。
    const e = easeInOutCubic(u);
    extension = 0.05;
    mouthOpen = 1 - easeInOutCubic(clamp01((u - STORE_CLOSE_FROM) / (1 - STORE_CLOSE_FROM)));
    gazeWeight = 0.5 * (1 - e);
    headTilt = 0.02 * (1 - e);
    storage = 1 - 0.999 * easeInCubic(clamp01(u / STORE_TONGUE_SHARE));
    face = 1 - easeInOutCubic(u);
  }
  // controller が宝石を出さない枠（jewelVisible:false）では、ダイヤも出さない。
  if (frame.jewelVisible === false) diamond = 0;
  out.mouthOpen = mouthOpen;
  out.gazeWeight = gazeWeight;
  out.headTilt = headTilt;
  out.extension = extension;
  out.unroll = unroll;
  out.storage = storage;
  out.diamond = diamond;
  out.lift = lift;
  out.glow = glow;
  out.spin = spin;
  out.face = face;
  return out;
}

function createDiamondGeometry() {
  const geometry = new THREE.OctahedronGeometry(DIAMOND_RADIUS);
  geometry.scale(DIAMOND_SCALE.x, DIAMOND_SCALE.y, DIAMOND_SCALE.z);
  const position = geometry.attributes.position;
  const faces = [];
  for (let face = 0; face < position.count / 3; face++) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let v = 0; v < 3; v++) {
      cx += position.getX(face * 3 + v);
      cy += position.getY(face * 3 + v);
      cz += position.getZ(face * 3 + v);
    }
    const quadrant = (cx > 0 ? 0 : 1) + (cz > 0 ? 0 : 2);
    faces.push({ upper: cy > 0, quadrant, glow: cy > 0 && cx > 0 && cz > 0 });
  }
  const colors = new Float32Array(position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  return { geometry, faces, colors };
}

function paintDiamond({ geometry, faces, colors }, glow) {
  const g = clamp(glow, 0, 1);
  for (let face = 0; face < faces.length; face++) {
    const info = faces[face];
    let rgb;
    if (info.glow) rgb = [mix(GLOW[0], GLOW_FLASH[0], g), mix(GLOW[1], GLOW_FLASH[1], g), mix(GLOW[2], GLOW_FLASH[2], g)];
    else if (info.upper) {
      const tone = UPPER_TONE[info.quadrant];
      rgb = [mix(UPPER[0], UPPER_FLASH[0], g) * tone, mix(UPPER[1], UPPER_FLASH[1], g) * tone, mix(UPPER[2], UPPER_FLASH[2], g) * tone];
    } else {
      const tone = LOWER_TONE[info.quadrant];
      rgb = [LOWER[0] * tone, LOWER[1] * tone, LOWER[2] * tone];
    }
    for (let v = 0; v < 3; v++) {
      const offset = (face * 3 + v) * 3;
      colors[offset] = rgb[0];
      colors[offset + 1] = rgb[1];
      colors[offset + 2] = rgb[2];
    }
  }
  geometry.attributes.color.needsUpdate = true;
}

/**
 * 本編の主人公に、周期の舌とダイヤを足す。
 * 台帳が書く姿勢は 顎・口の高さ、頭と目の回転、尻尾の宝石の表示 の5種だけ。すべて「加算」または「置く」で、
 * 前フレームの値は prepareBase() が戻す（今の値がまだ自分の書いた値の時だけ）。
 * 呼ぶ順番：prepareBase() → 基本歩行・既存反応 → controller.step → apply(extra.travelTongue)。
 */
export function createTravelTongue(hero) {
  const { head, jewel, actorParts: { mouth, eyes } } = hero;
  const ledger = createPoseLedger();
  const rig = createTongueRig(hero, { name: 'travel-tongue' });
  const mesh = rig.mesh;
  // 開いた口の中（暗い赤の楕円）。舌の付け根を囲む。
  const cavityGeometry = new THREE.SphereGeometry(1, 16, 10);
  const cavityMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(MOUTH_INSIDE, THREE.NoColorSpace) });
  const cavity = new THREE.Mesh(cavityGeometry, cavityMaterial);
  cavity.name = 'travel-tongue-mouth';
  cavity.position.set(MOUTH_CAVITY.x, MOUTH_CAVITY.y, 0);
  cavity.visible = false;
  head.add(cavity);
  let diamondParts = null;
  let diamond = null;
  let material = null;
  try {
    diamondParts = createDiamondGeometry();
    material = new THREE.MeshBasicMaterial({ vertexColors: true });
    diamond = new THREE.Mesh(diamondParts.geometry, material);
    diamond.name = 'travel-tongue-diamond';
    diamond.rotation.order = 'ZYX';
    diamond.visible = false;
    paintDiamond(diamondParts, 0);
    mesh.add(diamond);
  } catch (error) {
    diamond?.removeFromParent();
    material?.dispose();
    diamondParts?.geometry.dispose();
    cavity.removeFromParent();
    cavityGeometry.dispose();
    cavityMaterial.dispose();
    rig.dispose();
    throw error;
  }
  const point = { x: 0, y: 0, z: 0 };
  const tangent = { x: 1, y: 0, z: 0 };
  const normal = { x: 0, y: 1, z: 0 };
  const pose = {};
  const last = { extension: NaN, unroll: NaN, storage: NaN, lift: NaN, diamond: NaN, spin: NaN, glow: NaN };
  let lastGlow = 0;
  let disposed = false;
  let poseWrites = 0;
  let diamondShown = false;

  function setCavity(open) {
    const k = clamp01(open);
    cavity.visible = k > 0.02;
    if (cavity.visible) cavity.scale.set(MOUTH_CAVITY.rx, MOUTH_CAVITY.ry * k, MOUTH_CAVITY.rz);
  }

  function hide() {
    rig.reset();
    setCavity(0);
    diamond.visible = false;
    diamondShown = false;
    last.extension = last.unroll = last.storage = last.lift = last.diamond = last.spin = last.glow = NaN;
  }

  function placeDiamond(size, spin) {
    rig.writePoint(DIAMOND_ALONG, point, tangent, normal);
    const rise = TONGUE_RADIUS + (DIAMOND_HALF_HEIGHT - DIAMOND_SINK) * size;
    diamond.position.set(point.x + normal.x * rise, point.y + normal.y * rise, 0);
    diamond.rotation.set(0, DIAMOND_YAW + spin, Math.atan2(tangent.y, tangent.x));
    diamond.scale.setScalar(size);
  }

  return {
    mesh,
    diamond,
    /** 前フレームに自分が書いた姿勢だけを元に戻す。基本歩行の前に呼ぶ。 */
    prepareBase() {
      if (disposed) return;
      ledger.restore();
    },
    /** controller の travelTongue 枠を反映する。null・未知の段階なら取消（姿勢を戻し、舌とダイヤを隠す）。 */
    apply(frame) {
      if (disposed) return;
      ledger.restore(); // 同じフレームに二度呼ばれても、補正が重ならない
      if (!travelTonguePose(frame, pose)) {
        if (mesh.visible || diamond.visible) hide();
        return;
      }
      // 口を開けている間は、閉じた口の線を隠す（口が二つに見えないように）。
      setCavity(pose.mouthOpen);
      if (cavity.visible) ledger.set(mouth, 'visible', false);
      // 振り返っていても、舌の間は口を胴の前へ出す。今の通常の向き（警戒・反応を反映した値）から
      // 正面へ face の割合だけ寄せる。台帳が次の基本姿勢・取消のたびに元の向きへ戻す。
      ledger.add(head.rotation, 'y', -clamp01(pose.face) * head.rotation.y);
      ledger.add(head.rotation, 'z', clamp(pose.headTilt, -0.04, 0.04));
      ledger.add(eyes[0].rotation, 'y', 0.18 * pose.gazeWeight);
      ledger.add(eyes[1].rotation, 'y', -0.18 * pose.gazeWeight);
      // 舌の表示中は尻尾の宝石を同時に出さない。戻る時は既存の演出が決めた表示へ。
      ledger.set(jewel, 'visible', false);
      poseWrites += 1;
      const storage = clamp(pose.storage, 0.001, 1);
      // 口の中にしまい切っている間（口を開けている途中・閉じる途中）は、舌を描かない。
      if (storage <= TONGUE_INSIDE) {
        if (mesh.visible || diamond.visible) {
          rig.reset();
          diamond.visible = false;
          diamondShown = false;
          last.extension = last.unroll = last.storage = last.lift = last.diamond = last.spin = last.glow = NaN;
        }
        return;
      }
      const size = clamp(pose.diamond, 0, 1.2);
      // 止まっている間（同じ枠）は形・ダイヤを書き直さない。
      if (pose.extension === last.extension && pose.unroll === last.unroll && storage === last.storage && pose.lift === last.lift
        && size === last.diamond && pose.spin === last.spin && pose.glow === last.glow && mesh.visible) return;
      rig.apply({ visible: true, extension: pose.extension, unroll: pose.unroll, storage });
      mesh.rotation.z = pose.lift * TRAVEL_LIFT_RADIANS;
      if (size > 0.001) {
        placeDiamond(size, pose.spin);
        if (pose.glow !== lastGlow) {
          paintDiamond(diamondParts, pose.glow);
          lastGlow = pose.glow;
        }
        diamond.visible = true;
        diamondShown = true;
      } else {
        diamond.visible = false;
        diamondShown = false;
      }
      last.extension = pose.extension;
      last.unroll = pose.unroll;
      last.storage = storage;
      last.lift = pose.lift;
      last.diamond = size;
      last.spin = pose.spin;
      last.glow = pose.glow;
    },
    /** 取消：姿勢を戻し、舌とダイヤを隠す。 */
    cancel() {
      if (disposed) return;
      ledger.restore();
      hide();
    },
    reset() {
      this.cancel();
    },
    /** 頭の座標での、舌・輪郭・ダイヤを含む範囲（持ち上げの角度まで、全段階）。 */
    getLocalEnvelope(outBox) {
      outBox.min.set(ENVELOPE.min[0], ENVELOPE.min[1], ENVELOPE.min[2]).add(mesh.position);
      outBox.max.set(ENVELOPE.max[0], ENVELOPE.max[1], ENVELOPE.max[2]).add(mesh.position);
      return outBox;
    },
    stats() {
      return {
        visible: mesh.visible,
        diamondVisible: diamondShown,
        shapeWrites: rig.stats().shapeWrites,
        poseWrites,
        // 表示中に増える描画呼出（舌・舌の輪郭・ダイヤ）と形（舌の管・ダイヤ）
        drawCalls: (mesh.visible ? (diamondShown ? 3 : 2) : 0) + (cavity.visible ? 1 : 0),
        geometries: 3,
        mouthVisible: cavity.visible,
      };
    },
    dispose() {
      if (disposed) return;
      ledger.restore();
      hide();
      disposed = true;
      diamond.removeFromParent();
      diamondParts.geometry.dispose();
      cavity.removeFromParent();
      cavityGeometry.dispose();
      cavityMaterial.dispose();
      material.dispose();
      rig.dispose();
    },
  };
}
