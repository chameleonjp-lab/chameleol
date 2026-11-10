// キャラクターと宝石店の立体モデル。
// - 主人公カメレオンは chameleon28.js（持ち主の設定値）から作る。体色の面は照明なしの「比較用トゥーン」。
// - 警察官（フェレット）は主人公と同じ並びの登場人物。主人公と同じ太さの輪郭線と、照明を受けないトゥーンで描く。
// - 宝石店は比較面ではないので、照明を受ける3段階のトゥーン材質で立体感を出す。
//   街が HemisphereLight と DirectionalLight を置く前提（体色・壁の比較面には影響しない）。
// - 警察官は体色の変更対象外。紺の制服・帽子・懐中電灯。光は地面だけを照らし、壁（比較面）には当てない。
// - 描画の数を抑えるため、動かない部品は頂点色つきで1つの形にまとめる（three の本体だけで足りる小さな結合）。
import * as THREE from 'three';
import { POLICE } from './palette-colors.js';
import { createChameleon, createOutlineMaterial, taperedTube } from './chameleon28.js';

export { createChameleon };

// ---------- 照明を受ける材質（3段階のトゥーン）。画像はこの物の専用で、材質を捨てると一緒に捨てる ----------
function makeLitMaterial() {
  const gradient = new THREE.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  mat.addEventListener('dispose', () => gradient.dispose());
  return mat;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// ---------- 静的な部品の結合（頂点色つき） ----------
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** 位置・回転(オイラー)・拡大から行列を作る */
function T(p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), _q.clone(), new THREE.Vector3(...s));
}

class Merge {
  constructor() {
    this.p = [];
    this.n = [];
    this.c = [];
    this.op = [];
    this.on = [];
  }

  /** geo を matrix で焼き込み、色 color をつけて足す。outline=true なら輪郭線の殻にも入れる */
  add(geo, matrix, color, outline = false) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const col = new THREE.Color(color);
    for (let i = 0; i < pos.length; i += 3) this.c.push(col.r, col.g, col.b);
    for (let i = 0; i < pos.length; i += 1) {
      this.p.push(pos[i]);
      this.n.push(nor[i]);
      if (outline) {
        this.op.push(pos[i]);
        this.on.push(nor[i]);
      }
    }
    g.dispose();
    return this;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }

  outlineGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.op, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.on, 3));
    return g;
  }
}

/** 位置 from→to に沿う太さ r のカプセルの行列と長さ */
function limbMatrix(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Matrix4().compose(
    from.clone().add(to).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    new THREE.Vector3(1, 1, 1),
  );
  return { m, len };
}

// ---------- 警察官の材質：主人公と同じ「照明を受けないトゥーン」 ----------
// 主人公と同じ見え方（太い輪郭線・輪郭ぎわの陰・時間帯で暗くならない色）にして、背景ではなく同じ並びの登場人物として見せる。
// 色は頂点色（制服・毛・帽子）。比較面ではないので、下向きの面を少し暗くする簡単な陰と、時間帯の色味（uTint）を使う。
const FERRET_VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vC = color;
  gl_Position = projectionMatrix * mv;
}`;
const FERRET_FRAG = /* glsl */ `
uniform vec3 uTint;
varying vec3 vN;
varying vec3 vV;
varying vec3 vC;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float rim = 1.0 - smoothstep(0.18, 0.45, dot(N, V));
  float under = 1.0 - step(-0.35, N.y); // 下を向いた面だけ一段暗く
  vec3 c = vC * (1.0 - 0.28 * rim) * (1.0 - 0.16 * under) * uTint;
  gl_FragColor = vec4(c, 1.0);
}`;

function makeFerretMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: FERRET_VERT,
    fragmentShader: FERRET_FRAG,
  });
}

const ease = (cur, target, dt, rate) => cur + (target - cur) * Math.min(1, dt * rate);

/**
 * フェレットの警察官。紺の制服・帽子・懐中電灯。主人公と同じ太さの輪郭線と、照明を受けないトゥーンで描く。
 * 動き：走る（run）・見失って探す（search）・見つけて追う（chase）。気づいた時は跳ねる（react）。描画はおよそ20個。
 */
export function createFerret() {
  const group = new THREE.Group();
  const geos = [];
  const mats = [];
  const trackG = (g) => {
    geos.push(g);
    return g;
  };
  const outMat = createOutlineMaterial(); // 主人公と同じ太さ
  const litMat = makeFerretMaterial();
  mats.push(outMat, litMat);

  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const capsule = (r, mid) => new THREE.CapsuleGeometry(r, mid, 6, 12);
  const cyl = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const tmpGeos = [sphere];
  const tmp = (g) => {
    tmpGeos.push(g);
    return g;
  };
  const ell = (m, c, rx, ry, rz, color, outline, p, r = [0, 0, 0]) => m.add(sphere, T(p, r, [rx, ry, rz]), color, outline);

  const NAVY = POLICE.uniform;
  const FUR = POLICE.fur;
  const DARK = 0x1b1b1b;
  const lean = new THREE.Group(); // 走る時の前かがみ（腰が軸）
  lean.position.set(0, 0.95, 0);
  group.add(lean);
  const body = new THREE.Group(); // 歩行の上下
  body.position.set(0, -0.95, 0);
  lean.add(body);
  const meshOf = (m, parent, withOutline = true) => {
    const g = trackG(m.geometry());
    const mesh = new THREE.Mesh(g, litMat);
    if (withOutline) {
      const og = trackG(m.outlineGeometry());
      const o = new THREE.Mesh(og, outMat);
      o.renderOrder = -1;
      mesh.add(o);
    }
    parent.add(mesh);
    return mesh;
  };

  // ---- 胴・前の腕・懐中電灯・ベルト・バッジ（動かない部品を1つに） ----
  const st = new Merge();
  st.add(tmp(capsule(0.4, 0.95)), T([0, 1.55, 0], [0, 0, -0.1], [1, 1, 0.86]), NAVY, true);
  st.add(tmp(new THREE.TorusGeometry(0.41, 0.05, 8, 24)), T([0.03, 1.2, 0], [Math.PI / 2, 0, 0], [1, 0.86, 1]), DARK);
  st.add(tmp(new THREE.BoxGeometry(0.12, 0.12, 0.08)), T([0.44, 1.2, 0]), POLICE.badge);
  const badgeGeo = tmp(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6));
  st.add(badgeGeo, T([0.13, 1.92, 0.34], [Math.PI / 2, 0, 0]), POLICE.badge);
  for (let i = 0; i < 3; i += 1) ell(st, 0, 0.035, 0.035, 0.035, POLICE.badge, false, [0.37 - i * 0.012, 1.7 - i * 0.2, 0]);
  // 襟と肩章（制服らしさ）
  st.add(tmp(new THREE.TorusGeometry(0.3, 0.06, 8, 20)), T([0.06, 2.3, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]), 0xf4f1e8);
  for (const side of [1, -1]) st.add(tmp(new THREE.BoxGeometry(0.2, 0.05, 0.14)), T([0.03, 2.2, side * 0.33], [0, 0, 0]), POLICE.badge);
  const shoulderF = new THREE.Vector3(0.08, 2.05, 0.42);
  const handF = new THREE.Vector3(0.95, 1.55, 0.42);
  const arm = limbMatrix(shoulderF, handF);
  st.add(tmp(capsule(0.115, Math.max(0.02, arm.len - 0.23))), arm.m, NAVY, true);
  ell(st, 0, 0.13, 0.13, 0.13, FUR, true, handF.toArray());
  // 懐中電灯（前下がりに構える）
  const lightDir = new THREE.Vector3(0.88, -0.47, 0).normalize();
  const flashM = new THREE.Matrix4().compose(handF, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lightDir), new THREE.Vector3(1, 1, 1));
  const inFlash = (m) => new THREE.Matrix4().multiplyMatrices(flashM, m);
  st.add(tmp(cyl(0.075, 0.09, 0.5, 12)), inFlash(T([0, 0.05, 0])), 0x4a4f5c, true);
  st.add(tmp(cyl(0.14, 0.09, 0.18, 12)), inFlash(T([0, 0.38, 0])), 0x4a4f5c, true);
  st.add(tmp(new THREE.CircleGeometry(0.125, 14)), inFlash(T([0, 0.475, 0], [-Math.PI / 2, 0, 0])), POLICE.light);
  meshOf(st, body);

  // ---- 頭（首から上。向きを変える）----
  const head = new THREE.Group();
  head.position.set(0.3, 2.72, 0);
  body.add(head);
  const hd = new Merge();
  ell(hd, 0, 0.52, 0.41, 0.41, FUR, true, [0, 0, 0]);
  ell(hd, 0, 0.3, 0.2, 0.22, FUR, true, [0.42, -0.11, 0]);
  ell(hd, 0, 0.07, 0.055, 0.07, 0xd98a8a, false, [0.7, -0.03, 0]);
  const bandGeo = tmp(new THREE.SphereGeometry(1, 24, 6, Math.PI - 1.35, 2.7, 1.12, 0.62));
  hd.add(bandGeo, T([0, 0, 0], [0, 0, 0], [0.528, 0.418, 0.418]), POLICE.mask);
  for (const side of [1, -1]) {
    ell(hd, 0, 0.12, 0.13, 0.07, FUR, true, [-0.12, 0.2, side * 0.36]);
    ell(hd, 0, 0.07, 0.08, 0.03, 0xd98a8a, false, [-0.1, 0.2, side * 0.41]);
  }
  // 帽子：山・上面・帯・つば・バッジ
  hd.add(tmp(cyl(0.34, 0.4, 0.26, 20)), T([-0.04, 0.4, 0], [0, 0, 0.08]), POLICE.cap, true);
  hd.add(tmp(cyl(0.4, 0.4, 0.05, 20)), T([-0.03, 0.54, 0], [0, 0, 0.08]), POLICE.cap, true);
  hd.add(tmp(cyl(0.4, 0.42, 0.06, 20)), T([-0.03, 0.29, 0], [0, 0, 0.08]), POLICE.badge);
  ell(hd, 0, 0.34, 0.035, 0.36, DARK, true, [0.3, 0.27, 0], [0, 0, -0.12]);
  hd.add(badgeGeo, T([0.37, 0.41, 0], [0, 0, Math.PI / 2], [0.8, 1, 0.8]), POLICE.badge);
  meshOf(hd, head);

  // 目（まばたきで縦につぶす）・眉（追う時に前下がり）・口（追う時に開く）
  const eyes = new THREE.Group();
  eyes.position.set(0.3, 0.09, 0);
  const ey = new Merge();
  for (const side of [1, -1]) {
    ell(ey, 0, 0.085, 0.1, 0.06, DARK, false, [0, 0, side * 0.33]);
    ell(ey, 0, 0.028, 0.028, 0.022, 0xffffff, false, [0.04, 0.035, side * 0.385]);
  }
  meshOf(ey, eyes, false);
  head.add(eyes);
  const brows = new THREE.Group();
  brows.position.set(0.36, 0.215, 0);
  const br = new Merge();
  const browGeo = tmp(new THREE.BoxGeometry(0.24, 0.05, 0.05));
  for (const side of [1, -1]) br.add(browGeo, T([-0.03, 0, side * 0.365], [0, side * -0.35, 0]), 0x4a3526);
  meshOf(br, brows, false);
  head.add(brows);
  const mouth = new THREE.Group();
  mouth.position.set(0.52, -0.27, 0);
  const mo = new Merge();
  ell(mo, 0, 0.13, 0.09, 0.13, 0x5a1f24, false, [0, 0, 0]);
  ell(mo, 0, 0.07, 0.035, 0.08, 0xee8a9e, false, [0.01, -0.05, 0]);
  meshOf(mo, mouth, false);
  mouth.scale.set(1, 0.001, 1);
  head.add(mouth);

  // ---- 後ろの腕（振る。追う時は前へ伸ばして指さす）----
  const backArm = new THREE.Group();
  backArm.position.set(0.05, 2.05, -0.4);
  const ba = new Merge();
  const sleeve = capsule(0.115, 0.5);
  sleeve.translate(0, -0.37, 0);
  ba.add(tmp(sleeve), T(), NAVY, true);
  ell(ba, 0, 0.12, 0.12, 0.12, FUR, true, [0, -0.78, 0]);
  meshOf(ba, backArm);
  body.add(backArm);

  // ---- 脚とブーツ（2本とも同じ形を共有）----
  const lg = new Merge();
  const legGeo = capsule(0.14, 0.55);
  legGeo.translate(0, -0.42, 0);
  lg.add(tmp(legGeo), T(), NAVY, true);
  ell(lg, 0, 0.26, 0.13, 0.17, 0x15161c, true, [0.1, -0.84, 0]);
  const legGeoM = trackG(lg.geometry());
  const legOutG = trackG(lg.outlineGeometry());
  const legs = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.04, 0.95, side * 0.21);
    const mesh = new THREE.Mesh(legGeoM, litMat);
    const o = new THREE.Mesh(legOutG, outMat);
    o.renderOrder = -1;
    mesh.add(o);
    pivot.add(mesh);
    group.add(pivot);
    legs.push({ pivot, side });
  }

  // ---- 尻尾（ふさふさ。先は濃い色）----
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.1, 0.1, 0),
    new THREE.Vector3(-0.45, -0.12, 0),
    new THREE.Vector3(-1.0, -0.38, 0),
    new THREE.Vector3(-1.5, -0.15, 0),
    new THREE.Vector3(-1.78, 0.35, 0),
  ]);
  const tail = new THREE.Group();
  tail.position.set(-0.3, 1.2, 0);
  const tl = new Merge();
  tl.add(tmp(taperedTube(tailCurve, 28, 12, (t) => 0.17 - 0.09 * t)), T(), FUR, true);
  const tp = tailCurve.getPointAt(0.99);
  ell(tl, 0, 0.085, 0.1, 0.085, POLICE.mask, true, [tp.x, tp.y, tp.z]);
  meshOf(tl, tail);
  body.add(tail);

  // ---- 懐中電灯の光：レンズから地面の先までの薄い円錐と、地面に落ちる光だまり（壁には向けない）----
  const beam = new THREE.Group();
  const lensPos = handF.clone().addScaledVector(lightDir, 0.475);
  beam.position.copy(lensPos);
  const toGround = new THREE.Vector3(2.5, -(lensPos.y - 0.05), 0);
  const coneGeo = trackG(new THREE.ConeGeometry(0.85, toGround.length(), 24, 1, true));
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(POLICE.light) } },
    vertexShader: 'varying float vK; void main(){ vK = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vK; void main(){ gl_FragColor = vec4(uColor, 0.05 + 0.2 * vK); }',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), toGround.clone().normalize());
  cone.position.copy(toGround).multiplyScalar(0.5);
  beam.add(cone);
  const glowTex = makeGlowTexture();
  const poolGeo = trackG(new THREE.CircleGeometry(1, 28));
  const poolMat = new THREE.MeshBasicMaterial({ color: POLICE.light, map: glowTex, transparent: true, opacity: 0.8, depthWrite: false });
  poolMat.addEventListener('dispose', () => glowTex.dispose());
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(1.5, 0.9, 1);
  pool.position.set(toGround.x + 0.15, toGround.y, 0);
  beam.add(pool);
  body.add(beam);
  mats.push(coneMat, poolMat);
  tmpGeos.forEach((g) => g.dispose());

  let phase = Math.random() * 6;
  let clock = Math.random() * 10;
  let blinkAt = 1 + Math.random() * 3;
  let hopT = -1; // 跳ねている間の経過（秒）。-1 は跳ねていない
  // なめらかに切り替える値
  const k = { lean: 0, point: 0, angry: 0, mouth: 0, look: 0, swing: 1 };
  const HOP_S = 0.38;
  return {
    group,
    beam,
    head,
    /** 街の覆い（ステンシル）用：光の演出の透明な材質 */
    glowMaterials: [coneMat, poolMat],
    /** 時間帯の色味（夜は少し青く暗く）。 */
    setTint(r, g, b) {
      litMat.uniforms.uTint.value.setRGB(r, g, b);
    },
    /** 気づいた時などに一度跳ねる。 */
    react() {
      if (hopT < 0) hopT = 0;
    },
    /** 今の跳ねの高さ（影を小さくするため）。 */
    get hop() {
      return group.position.y;
    },
    /**
     * mode: 'run'（近づく）・'search'（見失って探す）・'chase'（見つけて追う）。
     * 以前の呼び方（walking・searching）もそのまま使える。
     */
    animate(dt, { walking = true, searching = false, mode = null } = {}) {
      const m = mode ?? (searching ? 'search' : 'run');
      const chase = m === 'chase';
      const search = m === 'search';
      clock += dt;
      const speed = !walking ? 0 : chase ? 12.5 : search ? 5.5 : 9.5;
      phase += dt * speed;
      k.lean = ease(k.lean, !walking ? 0 : chase ? -0.24 : search ? 0.04 : -0.12, dt, 6);
      k.point = ease(k.point, chase ? 1 : 0, dt, 7);
      k.angry = ease(k.angry, chase ? 1 : search ? -0.5 : 0.25, dt, 8);
      k.mouth = ease(k.mouth, chase ? 0.75 + Math.sin(clock * 16) * 0.25 : 0, dt, 14);
      k.look = ease(k.look, search ? 1 : 0, dt, 5);
      k.swing = ease(k.swing, !walking ? 0 : search ? 0.6 : chase ? 1.25 : 1, dt, 6);
      const swing = Math.sin(phase) * 0.55 * k.swing;
      for (const l of legs) l.pivot.rotation.z = swing * -l.side;
      // 後ろの腕：ふだんは振り、追う時は前へ伸ばして指さす
      backArm.rotation.z = (swing * 0.6 + 0.1) * (1 - k.point) + (1.75 + Math.sin(clock * 14) * 0.08) * k.point;
      body.position.y = -0.95 + Math.abs(Math.sin(phase)) * 0.07 * k.swing;
      lean.rotation.z = k.lean;
      // 探す時は首と光を左右に振る
      const sweep = Math.sin(clock * 2.4);
      head.rotation.y = sweep * 0.95 * k.look;
      head.rotation.z = -k.lean * 0.7 + (search ? Math.sin(clock * 1.2) * 0.06 : 0);
      beam.rotation.y = sweep * 0.4 * k.look + Math.sin(phase * 0.5) * 0.04 * (1 - k.look);
      tail.rotation.z = Math.sin(phase * 0.5) * 0.12 + k.point * 0.25;
      tail.rotation.y = Math.sin(phase * 0.5 + 1) * 0.1;
      brows.rotation.z = -0.5 * Math.max(0, k.angry) + 0.25 * Math.max(0, -k.angry);
      brows.position.y = 0.215 + 0.04 * Math.max(0, -k.angry);
      mouth.scale.y = Math.max(0.001, k.mouth);
      mouth.visible = k.mouth > 0.05;
      // まばたき
      blinkAt -= dt;
      if (blinkAt < -0.12) blinkAt = 1.6 + Math.random() * 3.2;
      eyes.scale.y = blinkAt < 0 ? 0.12 : 1 + 0.12 * k.point;
      // 跳ねる
      if (hopT >= 0) {
        hopT += dt;
        const h = Math.min(1, hopT / HOP_S);
        group.position.y = Math.sin(h * Math.PI) * 0.55;
        // 伸び縮み：踏み切りと着地で少しつぶれる
        const sq = 1 + Math.sin(h * Math.PI * 2) * 0.08;
        group.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        if (h >= 1) {
          hopT = -1;
          group.position.y = 0;
          group.scale.set(1, 1, 1);
        }
      }
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}

/** 宝石店（初回の開始演出用の建物）。正面は z=0、地面は y=0。奥は -z に伸びる箱。描画は2個。 */
export function createJewelryShop(width, height) {
  const group = new THREE.Group();
  const depth = Math.max(3.5, width * 0.45);
  const lm = new Merge(); // 照明を受ける面
  const gm = new Merge(); // ガラス（照明なし）
  const tmpGeos = [];
  const tmp = (g) => {
    tmpGeos.push(g);
    return g;
  };
  const box = (w, h, d, color, x, y, z, rotX = 0, target = lm) => target.add(tmp(new THREE.BoxGeometry(w, h, d)), T([x, y, z], [rotX, 0, 0]), color);

  const WALL = 0xf3e2c6;
  const TRIM = 0x8d6b4a;
  const WOOD = 0x6a3b2a;
  const RED = 0xd6453d;
  const CREAM = 0xfff4e0;
  const GLASS = 0xbfe7ff;

  // 本体（奥行きのある箱。前面は z=0）
  box(width, height, depth, WALL, 0, height / 2, -depth / 2);
  box(width + 0.2, 0.35, 0.3, TRIM, 0, 0.175, 0.1); // 土台
  box(width + 0.5, 0.42, depth + 0.5, 0x5b4a63, 0, height + 0.21, -depth / 2 + 0.1); // 屋根のへり
  box(width + 0.2, 0.18, 0.4, TRIM, 0, height - 0.09, 0.15); // 前の軒
  box(0.12, height, 0.2, 0xd9c3a2, -width / 2 + 0.06, height / 2, 0.08); // 側面の目地
  box(0.12, height, 0.2, 0xd9c3a2, width / 2 - 0.06, height / 2, 0.08);

  // 看板：紫の板と宝石
  box(width * 0.82, height * 0.15, 0.4, 0x57296f, 0, height * 0.855, 0.2);
  box(width * 0.78, height * 0.115, 0.1, 0x7a3e9d, 0, height * 0.855, 0.43);
  const gemColors = [0x9ff3ff, 0xff7ab6, 0xffe066, 0x8affc1, 0xc4a1ff];
  const gemGeo = tmp(new THREE.OctahedronGeometry(0.28));
  for (let i = 0; i < 5; i += 1) lm.add(gemGeo, T([-width * 0.3 + i * width * 0.15, height * 0.855, 0.62], [0, 0, 0], [1, 1.25, 1]), gemColors[i]);

  // ショーウィンドウ：枠・ガラス・宝石の展示台
  const winW = width * 0.27;
  const winH = height * 0.24;
  const winY = height * 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * width * 0.2 - width * 0.1;
    box(winW + 0.36, winH + 0.36, 0.3, WOOD, x, winY, 0.1);
    box(winW, winH, 0.1, GLASS, x, winY, 0.28, 0, gm);
    box(winW * 0.96, 0.05, 0.12, 0x8fc7ea, x, winY + winH * 0.1, 0.34, 0, gm);
    box(winW * 0.9, 0.22, 0.6, 0x4a3a2f, x, winY - winH * 0.34, 0.5);
    for (let i = 0; i < 3; i += 1) {
      const k = 0.55 + (i === 1 ? 0.2 : 0);
      lm.add(gemGeo, T([x + (i - 1) * winW * 0.27, winY - winH * 0.34 + 0.35, 0.5], [0, 0, 0], [k, k, k]), gemColors[(i + (sx > 0 ? 2 : 0)) % 5]);
    }
  }

  // ひさし（赤と白のしま）
  const stripes = 8;
  const stripeW = (width * 0.94) / stripes;
  const awnY = height * 0.5;
  for (let i = 0; i < stripes; i += 1) box(stripeW, 0.14, 1.5, i % 2 ? CREAM : RED, -width * 0.47 + stripeW * (i + 0.5), awnY, 0.85, 0.38);
  box(width * 0.94, 0.3, 0.1, RED, 0, awnY - 0.62, 1.52);

  // ドア（右端）：枠・扉・窓・取っ手
  const doorX = width / 2 - 1.25;
  box(1.65, 2.75, 0.3, TRIM, doorX, 1.375, 0.1);
  box(1.35, 2.5, 0.14, WOOD, doorX, 1.25, 0.24);
  box(0.8, 0.8, 0.06, GLASS, doorX, 1.8, 0.33, 0, gm);
  lm.add(tmp(new THREE.SphereGeometry(0.08, 10, 8)), T([doorX - 0.45, 1.2, 0.36]), 0xf2c94c);

  const litGeo = lm.geometry();
  const glassGeo = gm.geometry();
  const litMat = makeLitMaterial();
  const glassMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(litGeo, litMat), new THREE.Mesh(glassGeo, glassMat));
  tmpGeos.forEach((g) => g.dispose());
  group.userData.dispose = () => {
    litGeo.dispose();
    glassGeo.dispose();
    litMat.dispose();
    glassMat.dispose();
  };
  return group;
}
