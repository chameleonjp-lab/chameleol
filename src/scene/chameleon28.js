// カメレオン No.28。提供された「カメレオン No.28 エディター」（docs/design/chameleon-no28-editor.html）の
// 形づくり・表情・ポーズを移植し、書き出された CHAMELEON28 の値で作る。
// 体（頭・角・胴・腕・脚・尻尾・まぶた）は選んだ体色、目は体色を少し白に寄せた地色に渦。舌・口の中は固定色。
// 体の描き方は skin-material.js（中央は設定色そのまま）。
import * as THREE from 'three';
import { createEyeMaterial, createSkinMaterial, createSpiralMask } from './skin-material.js';

// エディターから書き出された値（2026-11-07 に提供）
export const CHAMELEON28 = Object.freeze({
  P: Object.freeze({
    gloss: 0.45, hx: 1.136, hy: 0.929, hz: 1.075, jaw: 0.087, hh: 0.108, ht: 0.04,
    cw: 0.865, ch: 1.055, cl: 0.253, cc: 1.98, cz: -0.105,
    es: 1, ex: 0.899, ey: 0.114, ez: 0.404, ef: 0.84, ew: 1.1, sp: 3.862, sw: 26.08,
    my: -0.435, mw: 1.306, mt: 0.982,
    tw: 0.648, td: 0.756, th: 1.031, tt: 0.003,
    ar: 0.221, al: 0.738, hs: 1.169, fs: 1.15, sx: 1.4,
    lr: 0.267, ll: 1.008, lx: 0.34, fw: 1.006, fz: 1.41,
    tn: 1.691, tr: 0.755, tk: 0.712, tp: 1,
  }),
  C: Object.freeze({ body: '#58c43c', eyeBase: '#72d455', spiral: '#fbfff6', tongue: '#ee8a9e' }),
});

// 表情 [左まぶた, 右まぶた, 傾き, 口の開き, 口のカーブ, 目の大きさ, 口の幅]（エディターと同じ）
export const EXPRESSIONS = Object.freeze({
  通常: [0, 0, 0, 0.5, -0.5, 1, 1],
  閉じ口: [0, 0, 0, 0, -0.3, 1, 0.8],
  笑顔: [0.85, 0.85, 0, 0.9, -1, 1, 1.15],
  驚き: [0, 0, 0, 0.55, 0, 1.15, 0.45],
  困り: [0.3, 0.3, -0.6, 0, 0.7, 1, 0.8],
  怒り: [0.5, 0.5, 0.8, 0, 0.8, 1, 0.9],
  ウインク: [0, 1, 0, 0.7, -0.7, 1, 1],
  悲しみ: [0.4, 0.4, -0.9, 0, 1, 0.95, 0.7],
  とぼけ: [0.55, 0.55, 0, 0.15, 0, 1, 0.5],
});

// ポーズ [左腕外, 左腕前, 右腕外, 右腕前, 左脚, 右脚, 高さ, 前傾]（エディターと同じ）
export const POSES = Object.freeze({
  待機: (t) => [0.25, 0, 0.25, 0, 0, 0, Math.sin(t * 2) * 0.02, 0],
  手を振る: (t) => [0.25, 0, 2.5 + Math.sin(t * 9) * 0.3, 0, 0, 0, Math.sin(t * 2) * 0.02, -0.04],
  歩き: (t) => {
    const s = Math.sin(t * 6);
    return [0.2, s * 0.6, 0.2, -s * 0.6, s * 0.7, -s * 0.7, Math.abs(Math.cos(t * 6)) * 0.06, 0.08];
  },
  走り: (t) => {
    const s = Math.sin(t * 10);
    return [0.35, s * 1.1, 0.35, -s * 1.1, s * 1.1, -s * 1.1, Math.abs(Math.cos(t * 10)) * 0.15, 0.35];
  },
  ジャンプ: (t) => {
    const j = Math.abs(Math.sin(t * 3));
    return [2.3, 0.1, 2.3, 0.1, 0.5 * j, -0.3 * j, j * 1.1, -0.1];
  },
  喜び: (t) => [2.6, 0.2, 2.6, 0.2, 0, 0, Math.abs(Math.sin(t * 5)) * 0.15, -0.05],
  座り: () => [0.3, 0.7, 0.3, 0.7, 1.45, 1.45, -0.62, -0.05],
});

const hexToVec = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

/**
 * カメレオンを作る。group の原点は足元、+z が顔の向き。
 * setColor([r,g,b]) は 0〜1 の値（判定と同じ8ビット値/255）。
 */
export function createChameleon28({ params = CHAMELEON28.P, colors = CHAMELEON28.C } = {}) {
  const P = { ...params };
  const T = THREE;
  const skin = createSkinMaterial({ color: hexToVec(colors.body), gloss: P.gloss });
  const mask = createSpiralMask({ turns: P.sp, width: P.sw });
  const eyeMat = createEyeMaterial(mask);
  eyeMat.uniforms.uSpiral.value.set(...hexToVec(colors.spiral));
  const tongueMat = new T.MeshLambertMaterial({ color: colors.tongue });
  const innerMat = new T.MeshLambertMaterial({ color: new T.Color(colors.tongue).multiplyScalar(0.4) });
  const lineMat = new T.MeshBasicMaterial({ color: new T.Color(colors.body).multiplyScalar(0.45) });
  const skinMeshes = [];

  const tag = (o) => {
    if (o.material === skin) skinMeshes.push(o);
    return o;
  };
  // 変形できる球（エディターの ell と同じ）
  const ell = (rx, ry, rz, fn, m = skin) => {
    const g = new T.SphereGeometry(1, 32, 24);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const t = fn ? fn(y) : 1;
      const a = rx * t;
      const c = rz * t;
      p.setXYZ(i, x * a, y * ry, z * c);
      const nx = n.getX(i) / a;
      const ny = n.getY(i) / ry;
      const nz = n.getZ(i) / c;
      const l = Math.hypot(nx, ny, nz) || 1;
      n.setXYZ(i, nx / l, ny / l, nz / l);
    }
    return tag(new T.Mesh(g, m));
  };
  const S = (r, x = 1, y = 1, z = 1, m = skin) => ell(r * x, r * y, r * z, 0, m);
  const limb = (r, l) => {
    const g = new T.Group();
    const c = tag(new T.Mesh(new T.CylinderGeometry(r * 0.9, r, l, 20), skin));
    c.position.y = -l / 2;
    const e = S(r * 0.9);
    e.position.y = -l;
    g.add(c, S(r), e);
    return g;
  };
  class Spiral extends T.Curve {
    getPoint(t, o = new T.Vector3()) {
      const R = P.tr;
      const a = -0.5 - t * P.tn * 2 * Math.PI;
      const r = R * (1 - 0.78 * t);
      return o.set(0, R * 0.479 + r * Math.sin(a), -R * 0.878 + r * Math.cos(a));
    }
  }
  const rad = (t) => P.tk * (0.22 * (1 - P.tp * t) + 0.035);
  const tube = () => {
    const N = 140;
    const Rd = 14;
    const c = new Spiral();
    const g = new T.TubeGeometry(c, N, 1, Rd, false);
    const p = g.attributes.position;
    for (let i = 0; i <= N; i += 1) {
      const q = c.getPointAt(i / N);
      const r = rad(i / N);
      for (let j = 0; j <= Rd; j += 1) {
        const k = i * (Rd + 1) + j;
        p.setXYZ(k, q.x + (p.getX(k) - q.x) * r, q.y + (p.getY(k) - q.y) * r, q.z + (p.getZ(k) - q.z) * r);
      }
    }
    // 法線は元の管の放射方向のまま（半径を変えても向きは同じ）
    return g;
  };

  const root = new T.Group();
  const body = new T.Group();
  root.add(body);

  // ---- 組み立て（エディターの build と同じ配置） ----
  const hip = P.ll + 0.28;
  const tb = hip - 0.35;
  const tcy = tb + P.th;
  const tq = tb + 2 * P.th;
  const cy = P.hy * 0.74;
  const jw = (y) => 1 - P.jaw * Math.pow(Math.max(0, -y), 1.5);
  const torso = ell(P.tw, P.th, P.td, (y) => 1 - P.tt * Math.max(0, y));
  torso.position.y = tcy;
  body.add(torso);
  const head = new T.Group();
  head.position.y = tq + 0.05 + P.hh;
  head.rotation.x = P.ht;
  body.add(head);
  const hd = ell(P.hx, P.hy, P.hz, jw);
  hd.position.set(0, cy, 0.05);
  head.add(hd);
  const pts = [];
  for (let i = 0; i <= 14; i += 1) {
    const u = i / 14;
    pts.push(new T.Vector2(P.cw * Math.pow(1 - u, P.cc) + 0.004, -0.3 + u * P.ch * 1.5));
  }
  const crest = tag(new T.Mesh(new T.LatheGeometry(pts, 32), skin));
  crest.position.set(0, cy + P.hy - 0.28, P.cz);
  crest.rotation.x = -P.cl;
  head.add(crest);
  const eyes = [-1, 1].map((s) => {
    const g = new T.Group();
    const n = new T.Group();
    g.position.set(s * P.ex * P.hx, cy + P.ey * P.hy, 0.05 + P.ez * P.hz);
    g.rotation.set(-0.08, s * P.ew, 0, 'YXZ');
    n.scale.z = P.ef;
    const ball = new T.Mesh(new T.SphereGeometry(0.42, 40, 28), eyeMat);
    const lid = tag(new T.Mesh(new T.SphereGeometry(0.44, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), skin));
    lid.rotation.order = 'ZXY';
    n.add(ball, lid);
    g.add(n);
    head.add(g);
    return { g, lid, s };
  });
  const yn = P.my;
  const mz = 0.05 + P.hz * jw(yn) * Math.sqrt(Math.max(0, 1 - yn * yn)) - 0.06;
  const mouth = new T.Group();
  mouth.position.set(0, cy + yn * P.hy, mz);
  mouth.rotation.x = -yn * 0.55;
  head.add(mouth);
  const line = new T.Mesh(new T.TorusGeometry(0.26, 0.016, 8, 24, Math.PI), lineMat);
  line.position.z = 0.06;
  const mIn = S(1, 1, 1, 1, innerMat);
  const tgn = S(1, 1, 1, 1, tongueMat);
  tgn.position.z = 0.03;
  mouth.add(line, mIn, tgn);
  const sh = tq - 0.25;
  const yb = (sh - tcy) / P.th;
  const wd = P.tw * Math.sqrt(Math.max(0, 1 - yb * yb)) * (1 - P.tt * Math.max(0, yb));
  const arm = (s) => {
    const g = limb(P.ar, P.al);
    g.rotation.order = 'ZXY';
    g.position.set(s * wd * P.sx, sh, 0.05);
    const h = S(0.23 * P.hs, 1, 1.05, 0.8);
    h.position.set(0, -P.al - 0.1 * P.hs, 0.04);
    g.add(h);
    [
      [-0.13, 0.25],
      [0, 0.32],
      [0.13, 0.25],
    ].forEach(([x, d]) => {
      const f = S(0.085 * P.fs);
      f.position.set(x * P.hs, -P.al - d * P.hs, 0.07);
      g.add(f);
    });
    body.add(g);
    return g;
  };
  const leg = (s) => {
    const g = limb(P.lr, P.ll);
    g.position.set(s * P.lx, hip, 0.05);
    const f = S(0.3 * P.fw, 1, 0.5, 1.35);
    f.position.set(0, 0.15 * P.fw - hip, 0.2);
    g.add(f);
    [-0.14, 0, 0.14].forEach((x) => {
      const t = S(0.1 * P.fz, 1, 0.9, 1);
      t.position.set(x * P.fw, 0.15 * P.fw - hip - 0.01, 0.2 + (x ? 0.32 : 0.36) * P.fw);
      g.add(t);
    });
    body.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const legL = leg(-1);
  const legR = leg(1);
  const ty = hip - 0.28;
  const yr = (ty - tcy) / P.th;
  const tailG = new T.Group();
  tailG.position.set(0, ty, -P.td * Math.sqrt(Math.max(0, 1 - yr * yr)) + 0.12);
  body.add(tailG);
  const tail = tag(new T.Mesh(tube(), skin));
  const tip = S(rad(1));
  tip.position.copy(new Spiral().getPoint(1));
  tailG.add(tail, tip);

  // 宝石：尻尾の渦の中に隠す。クリア時に取り出す
  const jewel = new T.Group();
  const gem = new T.Mesh(new T.OctahedronGeometry(0.26, 0), new T.MeshBasicMaterial({ color: 0x9ff3ff }));
  const shine = new T.Mesh(new T.OctahedronGeometry(0.13, 0), new T.MeshBasicMaterial({ color: 0xffffff }));
  gem.scale.set(1, 1.3, 1);
  jewel.add(gem, shine);
  const jewelHome = new T.Vector3(0, P.tr * 0.479, -P.tr * 0.878);
  jewel.position.copy(jewelHome);
  jewel.visible = false;
  tailG.add(jewel);

  // ---- 動き ----
  const curE = EXPRESSIONS.通常.slice();
  const curP = POSES.待機(0).slice();
  let time = 0;
  let pose = '待機';
  let expression = '通常';
  let lookBack = 0;
  let crouch = 0;

  const api = {
    group: root,
    skin,
    skinMeshes,
    torso,
    jewel,
    head,
    tailGroup: tailG,
    /** 体色（判定と同じ値）。目の地色は体色を18%白に寄せ、口の線は体色を暗くした色。 */
    setColor([r, g, b]) {
      skin.uniforms.uColor.value.set(r, g, b);
      eyeMat.uniforms.uBase.value.set(r + (1 - r) * 0.18, g + (1 - g) * 0.18, b + (1 - b) * 0.18);
      lineMat.color.setRGB(r * 0.45, g * 0.45, b * 0.45);
    },
    setPose(name) {
      if (POSES[name]) pose = name;
    },
    setExpression(name) {
      if (EXPRESSIONS[name]) expression = name;
    },
    /** 警戒が高い時の振り返り（0〜1）と低い姿勢（0〜1）。見た目だけで、判定の基準点は動かさない。 */
    setNervous(back, low) {
      lookBack = back;
      crouch = low;
    },
    /** 宝石を取り出す演出（0〜1）。尻尾の渦から、頭の上の前へ持ち上げる。 */
    showJewel(k) {
      jewel.visible = k > 0;
      const e = 1 - (1 - k) * (1 - k);
      jewel.position.set(jewelHome.x, jewelHome.y + e * 4.6, jewelHome.z + e * 2.4);
      jewel.scale.setScalar(1 + e * 0.9);
      jewel.rotation.y += 0.06;
    },
    hideJewel() {
      jewel.visible = false;
      jewel.position.copy(jewelHome);
      jewel.scale.setScalar(1);
    },
    animate(dt) {
      time += dt;
      const ex = EXPRESSIONS[expression];
      for (let i = 0; i < 7; i += 1) curE[i] += (ex[i] - curE[i]) * Math.min(1, dt * 12);
      const tg = POSES[pose](time);
      for (let i = 0; i < 8; i += 1) curP[i] += (tg[i] - curP[i]) * Math.min(1, dt * 9);
      const c = curP;
      const blink = time % 4.2 < 0.13 ? 1 : 0;
      armL.rotation.set(-c[1], 0, -c[0]);
      armR.rotation.set(-c[3], 0, c[2]);
      legL.rotation.x = -c[4];
      legR.rotation.x = -c[5];
      body.position.y = c[6] - crouch * 0.35;
      body.rotation.x = c[7] + crouch * 0.18;
      tailG.rotation.y = Math.sin(time * 3) * 0.18;
      head.rotation.z = Math.sin(time * 1.3) * 0.03;
      head.rotation.y = lookBack * (0.9 + Math.sin(time * 1.7) * 0.25);
      eyes.forEach((e, i) => {
        e.g.scale.setScalar(P.es * curE[5]);
        e.lid.rotation.x = -1.75 + Math.max(curE[i], blink) * 3.3;
        e.lid.rotation.z = e.s * curE[2] * 0.55;
      });
      const o = curE[3];
      const w = curE[6] * P.mw;
      line.visible = o < 0.06;
      mIn.visible = tgn.visible = o >= 0.06;
      line.scale.set(w, curE[4] * 0.6 || 0.05, 1);
      mIn.scale.set(0.3 * w, 0.03 + 0.2 * o, 0.1);
      tgn.scale.set(0.18 * w * P.mt, (0.015 + 0.1 * o) * P.mt, 0.1);
      tgn.position.y = -0.07 * o;
    },
    dispose() {
      mask.dispose();
      root.traverse((o) => o.geometry?.dispose?.());
      [skin, eyeMat, tongueMat, innerMat, lineMat, gem.material, shine.material].forEach((m) => m.dispose());
    },
  };
  api.animate(0);
  return api;
}
