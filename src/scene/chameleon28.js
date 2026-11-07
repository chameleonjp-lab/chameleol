// カメレオンNo.28：持ち主が渡した設定値（CHAMELEON28）から、立体のカメレオンを組み立てる。
// - 体色の面は「比較用トゥーン」。中央は体色そのまま（照明・フォグ・色調整なし）、輪郭ぎわだけ陰（リム）、
//   中心から離れた所にだけ小さなつや。判定に使う胴の中央（comparePoint）では色を一切変えない。
// - 太い輪郭線は、裏面を法線方向に押し出した殻（視点空間で一定の太さ）。
// - 設定値の意味は元の道具が手元になく不明。下の「解釈」に沿って読み、直す時はこのファイルだけで済むようにしてある。

import * as THREE from 'three';

/** 持ち主の設定値（そのまま） */
export const CHAMELEON28 = {
  "P": { "gloss": 0.45, "hx": 1.136, "hy": 0.929, "hz": 1.075, "jaw": 0.087, "hh": 0.108, "ht": 0.04,
    "cw": 0.865, "ch": 1.055, "cl": 0.253, "cc": 1.98, "cz": -0.105,
    "es": 1, "ex": 0.899, "ey": 0.114, "ez": 0.404, "ef": 0.84, "ew": 1.1,
    "sp": 3.862, "sw": 26.08,
    "my": -0.435, "mw": 1.306, "mt": 0.982,
    "tw": 0.648, "td": 0.756, "th": 1.031, "tt": 0.003,
    "ar": 0.221, "al": 0.738, "hs": 1.169, "fs": 1.15, "sx": 1.4,
    "lr": 0.267, "ll": 1.008, "lx": 0.34, "fw": 1.006, "fz": 1.41,
    "tn": 1.691, "tr": 0.755, "tk": 0.712, "tp": 1 },
  "C": { "body": "#58c43c", "eyeBase": "#72d455", "spiral": "#fbfff6", "tongue": "#ee8a9e" },
};

// 解釈。元の道具の定義は未確認。
// gloss  つや（光る小さな点）の強さ 0..1
// hx hy hz  頭の大きさの倍率：前後(x)・上下(y)・左右(z)
// jaw    下あごの下がり（口の開き）
// hh     頭を胴の上端より持ち上げる量
// ht     頭の上向き角（ラジアン、鼻先が上）
// cw ch cl  尖った頭（カスク）の幅・高さ・後ろへの長さ
// cc     カスクの反り（後ろへ曲がる度合い）
// cz     カスクの前後位置（負で後ろ）
// es     目の大きさ
// ex ey ez  目の位置（前後・上下・左右。頭の大きさに対する割合）
// ef     目の筒が横へ飛び出す量
// ew     目の横幅の伸び
// sp     目の渦の巻き数
// sw     渦の線の太さ（256px の目の画像上の px。隙間が残るよう上限をかける）
// my mw mt  口の線：上下位置・長さ・太さ
// tw td th  胴の幅（横）・奥行き（前後）・高さ
// tt     胴の傾き
// ar al hs  腕の太さ・長さ・手の大きさ
// fs     足の大きさ、fw fz 足の幅・長さ（前）
// sx     肩の開き（腕の横位置の倍率）
// lr ll lx  脚の太さ・長さ・左右の間隔
// tn tr tk tp  尻尾の巻き数・巻きの半径・太さ・先細り（1で先端まで細くなる）
// C.body  体色の既定値（実行時は常にプレイヤーの体色）
// C.eyeBase  目の筒の色。体色に対する明るい色味として、実行時は体色から同じ関係で作る
// C.spiral  渦の線の色、C.tongue  舌の色

// 形づくりのための係数（設定値からの寸法の換算。ここにまとめる）
const K = {
  headR: 0.5, // 頭の基準半径
  torsoRx: 0.62, torsoRy: 0.62, torsoRz: 0.55,
  legLen: 0.82, legR: 0.55, footR: 0.2,
  armR: 0.5, armLen: 0.8, handR: 0.5,
  casqueBase: 0.31, casqueH: 0.5, casqueReach: 2.2,
  eyeR: 0.34, eyeCap: 1.0,
  tailR: 0.62, tailThick: 0.19,
  outline: 0.085, // 輪郭線の太さ（ワールド単位）
};

const hex3 = (s) => {
  const c = new THREE.Color();
  c.setStyle(s, THREE.NoColorSpace);
  return [c.r, c.g, c.b];
};

// ---------- 比較用トゥーン（体色の面）と輪郭線の材質 ----------
const TOON_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const TOON_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGloss;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 N = normalize(vN);
  vec3 V = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vV);
  float nv = dot(N, V);
  // 輪郭ぎわの陰。dot(N,V) >= 0.45 では厳密に 0
  float r = 1.0 - smoothstep(0.18, 0.45, nv);
  if (nv >= 0.45) r = 0.0;
  vec3 c = uColor * (1.0 - 0.30 * r);
  // 小さなつや。胴の中央から外れた所（右上）にだけ出る。それ以外は厳密に 0
  vec3 L = normalize(vec3(0.62, 0.75, 0.0));
  vec3 H = normalize(L + V);
  float nh = dot(N, H);
  float s = uGloss * 0.55 * smoothstep(0.955, 0.985, nh);
  if (nh < 0.955) s = 0.0;
  c = c + s * (1.0 - c);
  gl_FragColor = vec4(c, 1.0);
}`;

const OUT_VERT = /* glsl */ `
uniform float uThick;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uThick;
  gl_Position = projectionMatrix * mv;
}`;
const OUT_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(0.1059, 0.1059, 0.1059, 1.0); }`;

/** 比較用トゥーン。uColor が中央の色そのもの。 */
export function createToonMaterial(rgb, gloss) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]) }, uGloss: { value: gloss } },
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
  });
}

export function createOutlineMaterial(thick = K.outline) {
  return new THREE.ShaderMaterial({
    uniforms: { uThick: { value: thick } },
    vertexShader: OUT_VERT,
    fragmentShader: OUT_FRAG,
    side: THREE.BackSide,
  });
}

// ---------- 形状の部品 ----------
/**
 * 先細りの管（xy 平面上の曲線に沿う）。radiusFn(t) は断面の半径（t は 0..1）。
 * 継ぎ目なしの法線を自前で作る（先端は尖る）。
 */
export function taperedTube(curve, segments, radial, radiusFn) {
  const len = curve.getLength();
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  const e = 0.01;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tg = curve.getTangentAt(t).normalize();
    const nx = -tg.y;
    const ny = tg.x; // 面内の法線
    const r = radiusFn(t);
    const dr = (radiusFn(Math.min(1, t + e)) - radiusFn(Math.max(0, t - e))) / ((Math.min(1, t + e) - Math.max(0, t - e)) * len);
    for (let j = 0; j <= radial; j += 1) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dx = nx * c;
      const dy = ny * c;
      const dz = s;
      pos.push(p.x + dx * r, p.y + dy * r, p.z + dz * r);
      const v = new THREE.Vector3(dx - tg.x * dr, dy - tg.y * dr, dz).normalize();
      nor.push(v.x, v.y, v.z);
      uvs.push(j / radial, t);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** 目の渦を重ねる球冠（北極を +z に向け、画像は平面に貼る） */
function eyeCapGeometry(radius, thetaMax) {
  const g = new THREE.SphereGeometry(radius, 28, 10, 0, Math.PI * 2, 0, thetaMax);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const rr = radius * Math.sin(thetaMax);
  for (let i = 0; i < p.count; i += 1) uv.setXY(i, 0.5 + p.getX(i) / (2 * rr), 0.5 - p.getY(i) / (2 * rr));
  return g;
}

/** 目の渦の画像：渦の線（近い白＋細い暗い縁）と暗い瞳。背景は透明で、筒の色が見える。 */
function eyeTexture(P, C) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const R = 118;
  const pitch = R / P.sp;
  const w = Math.max(6, Math.min(P.sw, pitch * 0.5)); // 隙間が残るように上限
  const edge = 4;
  const path = () => {
    g.beginPath();
    const total = Math.PI * 2 * P.sp;
    for (let a = 0; a <= total; a += 0.04) {
      const r = (a / total) * R;
      const x = size / 2 + Math.cos(a) * r;
      const y = size / 2 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = w + edge * 2;
  path();
  g.stroke();
  g.strokeStyle = C.spiral;
  g.lineWidth = w;
  path();
  g.stroke();
  g.fillStyle = '#1b1b1b';
  g.beginPath();
  g.arc(size / 2, size / 2, 17, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(size / 2, size / 2, 122, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// 楕円体と、原点から出る半直線の交点までの距離（遠い側）
function rayEllipsoid(d, c, r) {
  let a = 0;
  let b = 0;
  let cc = 0;
  for (let i = 0; i < 3; i += 1) {
    a += (d[i] / r[i]) ** 2;
    b += (-c[i] * d[i]) / (r[i] * r[i]);
    cc += (c[i] / r[i]) ** 2;
  }
  cc -= 1;
  const disc = b * b - a * cc;
  if (disc < 0) return 0;
  return (-b + Math.sqrt(disc)) / a;
}

/**
 * カメレオンを作る。原点は両足の間の地面（y=0）、+x が進行方向、+z がカメラ側。高さは約3。
 * 返す group の x は動かさない（判定の基準点は group の位置）。
 */
export function createChameleon(design = CHAMELEON28) {
  const { P, C } = design;
  const geos = [];
  const mats = [];
  const track = (g) => {
    geos.push(g);
    return g;
  };

  // 色：体色の面はすべて bodyMat を共有。目の筒は体色から作った明るい色味。
  const bodyRgb0 = hex3(C.body);
  const eyeRgb0 = hex3(C.eyeBase);
  let tint = 0;
  let n = 0;
  for (let i = 0; i < 3; i += 1) {
    if (bodyRgb0[i] < 0.98) {
      tint += (eyeRgb0[i] - bodyRgb0[i]) / (1 - bodyRgb0[i]);
      n += 1;
    }
  }
  tint = n ? tint / n : 0.18;
  const bodyMat = createToonMaterial(bodyRgb0, P.gloss);
  const eyeMat = createToonMaterial(eyeRgb0, P.gloss * 0.6);
  const outMat = createOutlineMaterial();
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
  const tongueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setStyle(C.tongue, THREE.NoColorSpace) });
  const jewelMat = new THREE.MeshBasicMaterial({ color: 0x9ff3ff });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeTex = eyeTexture(P, C);
  const decalMat = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mats.push(bodyMat, eyeMat, outMat, darkMat, tongueMat, jewelMat, shineMat, decalMat);

  const unitSphere = track(new THREE.SphereGeometry(1, 28, 20));
  /** 体色の面＋輪郭線 */
  const part = (geo, mat = bodyMat, outline = true) => {
    const m = new THREE.Mesh(geo, mat);
    if (outline) {
      const o = new THREE.Mesh(geo, outMat);
      o.renderOrder = -1;
      m.add(o);
    }
    return m;
  };
  const ellipsoid = (rx, ry, rz, mat = bodyMat) => {
    const m = part(unitSphere, mat);
    m.scale.set(rx, ry, rz);
    return m;
  };

  // ---- 寸法 ----
  const torsoRx = P.td * K.torsoRx;
  const torsoRy = P.th * K.torsoRy;
  const torsoRz = P.tw * K.torsoRz;
  const legLen = P.ll * K.legLen;
  const legR = P.lr * K.legR;
  const footR = K.footR * P.fs;
  const footH = footR * 0.5;
  const hipY = legLen + footH;
  const cy = hipY + torsoRy * 0.78; // 胴の中心の高さ
  const headRx = K.headR * P.hx;
  const headRy = K.headR * P.hy;
  const headRz = K.headR * P.hz;
  const headX = torsoRx * 0.5;
  const headY = cy + torsoRy * 0.8 + headRy * 0.72 + P.hh;

  const group = new THREE.Group();
  const root = new THREE.Group(); // 歩行の上下
  group.add(root);
  const upper = new THREE.Group(); // 胴の中心が軸。傾けても胴の中央は動かない
  upper.position.set(0, cy, 0);
  root.add(upper);
  const rig = new THREE.Group(); // group 座標に戻す
  rig.position.set(0, -cy, 0);
  upper.add(rig);

  // ---- 胴 ----
  const torso = ellipsoid(torsoRx, torsoRy, torsoRz);
  torso.position.set(0, cy, 0);
  torso.rotation.z = -P.tt;
  rig.add(torso);
  // 判定点：胴の +z 側の表面、胴の中心の高さ（x=0）
  const comparePoint = new THREE.Object3D();
  comparePoint.position.set(0, cy, torsoRz);
  rig.add(comparePoint);

  // ---- 頭 ----
  const head = new THREE.Group();
  head.position.set(headX, headY, 0);
  rig.add(head);
  const skull = ellipsoid(headRx, headRy, headRz);
  head.add(skull);
  const snoutC = [headRx * 0.62, -headRy * 0.2, 0];
  const snoutR = [headRx * 0.62, headRy * 0.52, headRz * 0.58];
  const snout = ellipsoid(snoutR[0], snoutR[1], snoutR[2]);
  snout.position.set(...snoutC);
  head.add(snout);
  // 下あご
  const jawDrop = P.jaw * 1.5;
  const jaw = ellipsoid(headRx * 0.62, headRy * 0.26, headRz * 0.7);
  jaw.position.set(headRx * 0.38, -headRy * 0.62 - jawDrop, 0);
  head.add(jaw);

  // 口の線：頭と鼻先の表面に沿わせる（+z 側）
  const mouthPts = [];
  const skullR = [headRx, headRy, headRz];
  const sin0 = P.my * 0.62;
  const len = P.mw;
  for (let i = 0; i <= 16; i += 1) {
    const u = i / 16;
    const phi = -0.38 + u * 0.62 * len * 1.55;
    const lift = u > 0.7 ? (u - 0.7) * 0.42 : 0;
    const sb = Math.max(-0.95, Math.min(0.95, sin0 + lift));
    const cb = Math.sqrt(1 - sb * sb);
    const d = [Math.cos(phi) * cb, sb, Math.sin(phi) * cb];
    const t = Math.max(rayEllipsoid(d, [0, 0, 0], skullR), rayEllipsoid(d, snoutC, snoutR));
    const o = t * 1.012 + 0.004;
    mouthPts.push(new THREE.Vector3(d[0] * o, d[1] * o, d[2] * o));
  }
  const mouth = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mouthPts), 28, 0.019 * P.mt, 6, false)), darkMat);
  head.add(mouth);
  // 鼻の穴
  for (const side of [1, -1]) {
    const nos = new THREE.Mesh(unitSphere, darkMat);
    nos.scale.setScalar(0.028);
    nos.position.set(snoutC[0] + snoutR[0] * 0.85, snoutC[1] + snoutR[1] * 0.55, side * snoutR[2] * 0.38);
    head.add(nos);
  }

  // 尖った頭（カスク）：後頭部から上へ、後ろに反って伸びる
  const baseX = headRx * (-0.36 + P.cz);
  const baseY = headRy * 0.45;
  const reach = P.cl * K.casqueReach;
  const cH = P.ch * K.casqueH;
  const cPts = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    cPts.push(new THREE.Vector3(baseX - reach * t ** P.cc, baseY - 0.1 + (cH + 0.1) * t, 0));
  }
  const casqueR = P.cw * K.casqueBase;
  const casqueGeo = track(taperedTube(new THREE.CatmullRomCurve3(cPts), 20, 16, (t) => Math.max(0.004, casqueR * (1 - t) ** 0.85)));
  const casque = part(casqueGeo);
  casque.scale.z = 0.72;
  head.add(casque);

  // 舌（歩行中は隠す。x の向きに伸ばす）
  const tongueGeo = track(new THREE.CapsuleGeometry(0.05, 1.0, 4, 10));
  tongueGeo.rotateZ(-Math.PI / 2);
  tongueGeo.translate(0.55, 0, 0);
  const tongue = new THREE.Mesh(tongueGeo, tongueMat);
  const tOut = new THREE.Mesh(tongueGeo, outMat);
  tOut.renderOrder = -1;
  tongue.add(tOut);
  tongue.position.set(snoutC[0] + snoutR[0] * 0.8, snoutC[1] - 0.04, 0);
  tongue.visible = false;
  head.add(tongue);

  // ---- 目：飛び出した筒と渦 ----
  const eyeR = K.eyeR * P.es;
  const capTheta = K.eyeCap;
  const capGeo = track(eyeCapGeometry(eyeR * 1.012, capTheta));
  const eyes = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(P.ex * headRx * 0.4, headRy * (0.36 + P.ey), side * (P.ez * headRz + P.ef * eyeR * 0.62));
    const base = side > 0 ? 0.42 : Math.PI - 0.42;
    pivot.rotation.set(0, base, 0);
    const turret = part(unitSphere, eyeMat);
    turret.scale.set(eyeR * P.ew, eyeR, eyeR);
    pivot.add(turret);
    const decal = new THREE.Mesh(capGeo, decalMat);
    decal.scale.set(P.ew, 1, 1);
    pivot.add(decal);
    head.add(pivot);
    eyes.push({ pivot, base, side });
  }

  // ---- 腕 ----
  const armR = P.ar * K.armR;
  const armLen = P.al * K.armLen;
  const handR = P.ar * P.hs * K.handR;
  const armGeo = track(new THREE.CapsuleGeometry(armR, Math.max(0.05, armLen - armR * 2), 6, 12));
  armGeo.translate(0, -armLen / 2, 0);
  const arms = [];
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(torsoRx * 0.5, cy + torsoRy * 0.34, side * torsoRz * 0.62 * P.sx);
    const splay = new THREE.Group();
    splay.rotation.x = -side * 0.3;
    shoulder.add(splay);
    splay.add(part(armGeo));
    const hand = ellipsoid(handR, handR * 0.9, handR);
    hand.position.set(0, -armLen, 0);
    splay.add(hand);
    rig.add(shoulder);
    arms.push({ shoulder, side });
  }

  // ---- 脚と足 ----
  const legGeo = track(new THREE.CapsuleGeometry(legR, Math.max(0.05, legLen - legR * 2), 6, 12));
  legGeo.translate(0, -legLen / 2, 0);
  const legs = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.02, hipY, side * P.lx * 0.6);
    const thigh = part(legGeo);
    pivot.add(thigh);
    const foot = ellipsoid(footR * P.fz * 0.5, footH, footR * P.fw);
    foot.position.set(footR * P.fz * 0.28, -legLen, 0);
    pivot.add(foot);
    root.add(pivot);
    legs.push({ pivot, thigh, foot, side });
  }

  // ---- 尻尾：渦巻きに巻く、先細りの管 ----
  const tailBase = new THREE.Vector3(-torsoRx * 0.62, cy - torsoRy * 0.55, 0);
  const tail = new THREE.Group();
  tail.position.copy(tailBase);
  const R0 = P.tr * K.tailR;
  const a0 = -0.3;
  const S = new THREE.Vector3(-0.2, -0.14, 0);
  const C0 = new THREE.Vector3(S.x - R0 * Math.cos(a0), S.y - R0 * Math.sin(a0), 0);
  const tPts = [new THREE.Vector3(0.2, 0.12, 0), new THREE.Vector3(0.0, 0.0, 0)];
  const steps = 56;
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const a = a0 - Math.PI * 2 * P.tn * s;
    const r = R0 * (1 - 0.8 * s);
    tPts.push(new THREE.Vector3(C0.x + Math.cos(a) * r, C0.y + Math.sin(a) * r, 0));
  }
  const tailR = P.tk * K.tailThick;
  const tailGeo = track(
    taperedTube(new THREE.CatmullRomCurve3(tPts), 96, 14, (t) => Math.max(0.006, tailR * (1 - P.tp * t * 0.96) + tailR * 0.1 * (1 - P.tp) * t)),
  );
  tail.add(part(tailGeo));
  rig.add(tail);

  // ---- 宝石：尻尾の巻きの中に隠す（逃走中は見えない）----
  const jewel = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.2)), jewelMat);
  const shine = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.11)), shineMat);
  jewel.add(shine);
  jewel.position.set(tailBase.x + C0.x, tailBase.y + C0.y, 0);
  jewel.visible = false;
  rig.add(jewel);

  // ---- 動き ----
  let phase = 0;
  let swingAmt = 0;
  const lenOf = (nervous) => legLen * (1 - 0.24 * nervous);
  function animate(dt, { walking = true, nervous = 0 } = {}) {
    if (walking) phase += dt * 8.5;
    swingAmt += ((walking ? 1 : 0) - swingAmt) * Math.min(1, dt * 8);
    const s = Math.sin(phase) * swingAmt;
    const a = s * 0.55;
    const len = lenOf(nervous);
    const lift = Math.cos(a) * len; // 足が地面に着くよう、体を上下させる（歩きの上下動）
    root.position.y = lift - legLen + Math.max(0, Math.sin(phase * 2 + 1.2)) * 0.012 * swingAmt;
    for (const l of legs) {
      const ang = a * -l.side;
      l.pivot.rotation.z = ang;
      l.thigh.scale.y = len / legLen;
      l.foot.position.y = -len;
      l.foot.rotation.z = -ang * 0.8;
    }
    for (const arm of arms) arm.shoulder.rotation.z = 0.95 + s * arm.side * 0.28;
    // 警戒が高いと低い姿勢、前かがみ、後ろを振り返る
    upper.rotation.z = -nervous * 0.2 + Math.sin(phase) * 0.012 * swingAmt;
    const glance = nervous > 0.05 ? (0.5 + 0.5 * Math.sin(phase * 0.42)) * 1.15 * Math.min(1, nervous * 1.6) : 0;
    head.rotation.y = -glance;
    head.rotation.z = P.ht - nervous * 0.12 + Math.sin(phase * 2) * 0.012 * swingAmt;
    tail.rotation.z = Math.sin(phase * 0.5 - 0.6) * 0.1 * (0.4 + 0.6 * swingAmt) - nervous * 0.12;
    tail.rotation.y = Math.sin(phase * 0.5) * 0.12;
    for (const e of eyes) e.pivot.rotation.y = e.base + Math.sin(phase * 0.37 + e.side) * 0.12 + (nervous > 0.05 ? -glance * 0.2 : 0);
  }
  animate(0, { walking: false });

  return {
    group,
    jewel,
    head,
    tail,
    tongue,
    comparePoint,
    setColor(rgb) {
      bodyMat.uniforms.uColor.value.setRGB(rgb[0], rgb[1], rgb[2]);
      eyeMat.uniforms.uColor.value.setRGB(rgb[0] + (1 - rgb[0]) * tint, rgb[1] + (1 - rgb[1]) * tint, rgb[2] + (1 - rgb[2]) * tint);
    },
    animate,
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      eyeTex.dispose();
    },
  };
}
