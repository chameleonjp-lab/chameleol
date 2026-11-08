// キャラクターと宝石店の立体モデル。
// - 主人公カメレオンは chameleon28.js（持ち主の設定値）から作る。体色の面は照明なしの「比較用トゥーン」。
// - 警察官（フェレット）と宝石店は比較面ではないので、照明を受ける3段階のトゥーン材質で立体感を出す。
//   街が HemisphereLight と DirectionalLight を置く前提（体色・壁の比較面には影響しない）。
// - 警察官は体色の変更対象外。紺の制服・帽子・懐中電灯。光は地面だけを照らし、壁（比較面）には当てない。
import * as THREE from 'three';
import { POLICE } from './palette-colors.js';
import { createChameleon, createOutlineMaterial, taperedTube } from './chameleon28.js';

export { createChameleon };

// ---------- 照明を受ける材質（3段階のトゥーン） ----------
let gradientMap = null;
function toonGradient() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}
const lit = (color) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

let glowMap = null;
function glowTexture() {
  if (!glowMap) {
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
    glowMap = new THREE.CanvasTexture(canvas);
  }
  return glowMap;
}

/** 位置 from→to に沿う太さ r のカプセル（静止姿勢用） */
function limbBetween(geoCache, from, to, r, mat, outMat) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const key = `${r}:${len.toFixed(3)}`;
  let geo = geoCache.get(key);
  if (!geo) {
    geo = new THREE.CapsuleGeometry(r, Math.max(0.02, len - r * 2), 6, 12);
    geoCache.set(key, geo);
  }
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, outMat);
  o.renderOrder = -1;
  m.add(o);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** フェレットの警察官。紺の制服・帽子・懐中電灯。 */
export function createFerret() {
  const group = new THREE.Group();
  const outMat = createOutlineMaterial(0.05);
  const uniform = lit(POLICE.uniform);
  const capMat = lit(POLICE.cap);
  const fur = lit(POLICE.fur);
  const furDark = lit(0xb59a78);
  const mask = lit(POLICE.mask);
  const dark = basic(0x1b1b1b);
  const gold = lit(POLICE.badge);
  const boot = lit(0x15161c);
  const metal = lit(0x4a4f5c);
  const lens = basic(POLICE.light);
  const white = basic(0xffffff);
  const nose = lit(0xd98a8a);
  const geos = [];
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  geos.push(sphere);
  const geoCache = new Map();

  const mk = (geo, mat, outline = true) => {
    const m = new THREE.Mesh(geo, mat);
    if (outline) {
      const o = new THREE.Mesh(geo, outMat);
      o.renderOrder = -1;
      m.add(o);
    }
    return m;
  };
  const ell = (rx, ry, rz, mat, outline = true) => {
    const m = mk(sphere, mat, outline);
    m.scale.set(rx, ry, rz);
    return m;
  };

  const body = new THREE.Group(); // 歩行の上下
  group.add(body);

  // 胴（長め。少し前かがみ）
  const torsoGeo = new THREE.CapsuleGeometry(0.4, 0.95, 8, 16);
  geos.push(torsoGeo);
  const torso = mk(torsoGeo, uniform);
  torso.scale.z = 0.86;
  torso.position.set(0, 1.55, 0);
  torso.rotation.z = -0.1;
  body.add(torso);
  // ベルトとバックル
  const beltGeo = new THREE.TorusGeometry(0.41, 0.05, 8, 24);
  geos.push(beltGeo);
  const belt = new THREE.Mesh(beltGeo, dark);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.86, 1);
  belt.position.set(0.03, 1.2, 0);
  body.add(belt);
  const buckleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.08);
  geos.push(buckleGeo);
  const buckle = new THREE.Mesh(buckleGeo, gold);
  buckle.position.set(0.44, 1.2, 0);
  body.add(buckle);
  // 肩のバッジ（カメラ側の側面）と胸ボタン
  const badgeGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6);
  geos.push(badgeGeo);
  const badge = new THREE.Mesh(badgeGeo, gold);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0.13, 1.92, 0.34);
  body.add(badge);
  for (let i = 0; i < 3; i += 1) {
    const b = new THREE.Mesh(sphere, gold);
    b.scale.setScalar(0.035);
    b.position.set(0.37 - i * 0.012, 1.7 - i * 0.2, 0.0);
    body.add(b);
  }

  // 頭
  const head = new THREE.Group();
  head.position.set(0.3, 2.72, 0);
  body.add(head);
  head.add(ell(0.52, 0.41, 0.41, fur));
  const snout = ell(0.3, 0.2, 0.22, fur);
  snout.position.set(0.42, -0.11, 0);
  head.add(snout);
  const noseM = ell(0.07, 0.055, 0.07, nose, false);
  noseM.position.set(0.7, -0.03, 0);
  head.add(noseM);
  // 目のまわりの濃い帯（顔の前半分を一周）
  const bandGeo = new THREE.SphereGeometry(1, 24, 6, Math.PI - 1.35, 2.7, 1.12, 0.62);
  geos.push(bandGeo);
  const band = new THREE.Mesh(bandGeo, mask);
  band.scale.set(0.528, 0.418, 0.418);
  head.add(band);
  for (const side of [1, -1]) {
    const eye = ell(0.075, 0.085, 0.06, dark, false);
    eye.position.set(0.3, 0.09, side * 0.33);
    head.add(eye);
    const glint = new THREE.Mesh(sphere, white);
    glint.scale.setScalar(0.022);
    glint.position.set(0.34, 0.12, side * 0.38);
    head.add(glint);
    const ear = ell(0.12, 0.13, 0.07, fur);
    ear.position.set(-0.12, 0.2, side * 0.36);
    head.add(ear);
    const inner = ell(0.07, 0.08, 0.03, nose, false);
    inner.position.set(-0.1, 0.2, side * 0.41);
    head.add(inner);
  }
  // 帽子：山・つば・帯・バッジ
  const crownGeo = new THREE.CylinderGeometry(0.34, 0.4, 0.26, 20);
  geos.push(crownGeo);
  const crown = mk(crownGeo, capMat);
  crown.position.set(-0.04, 0.4, 0);
  crown.rotation.z = 0.08;
  head.add(crown);
  const capTopGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20);
  geos.push(capTopGeo);
  const capTop = mk(capTopGeo, capMat);
  capTop.position.set(-0.03, 0.54, 0);
  capTop.rotation.z = 0.08;
  head.add(capTop);
  const hatBandGeo = new THREE.CylinderGeometry(0.4, 0.42, 0.06, 20);
  geos.push(hatBandGeo);
  const hatBand = new THREE.Mesh(hatBandGeo, gold);
  hatBand.position.set(-0.03, 0.29, 0);
  hatBand.rotation.z = 0.08;
  head.add(hatBand);
  const visor = mk(sphere, dark);
  visor.scale.set(0.34, 0.035, 0.36);
  visor.position.set(0.3, 0.27, 0);
  visor.rotation.z = -0.12;
  head.add(visor);
  const capBadge = new THREE.Mesh(badgeGeo, gold);
  capBadge.scale.set(0.8, 1, 0.8);
  capBadge.rotation.z = Math.PI / 2;
  capBadge.position.set(0.37, 0.41, 0);
  head.add(capBadge);

  // 後ろの腕（振る）と前の腕（懐中電灯を前に構える）
  const sleeveGeo = new THREE.CapsuleGeometry(0.115, 0.5, 6, 12);
  sleeveGeo.translate(0, -0.37, 0);
  geos.push(sleeveGeo);
  const backArm = new THREE.Group();
  backArm.position.set(0.05, 2.05, -0.4);
  backArm.add(mk(sleeveGeo, uniform));
  const backHand = ell(0.12, 0.12, 0.12, fur);
  backHand.position.set(0, -0.78, 0);
  backArm.add(backHand);
  body.add(backArm);

  const shoulderF = new THREE.Vector3(0.08, 2.05, 0.42);
  const handF = new THREE.Vector3(0.95, 1.55, 0.42);
  body.add(limbBetween(geoCache, shoulderF, handF, 0.115, uniform, outMat));
  const frontHand = ell(0.13, 0.13, 0.13, fur);
  frontHand.position.copy(handF);
  body.add(frontHand);
  geoCache.forEach((g) => geos.push(g));

  // 懐中電灯（前下がりに構える）
  const lightDir = new THREE.Vector3(0.88, -0.47, 0).normalize();
  const flash = new THREE.Group();
  flash.position.copy(handF);
  flash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lightDir);
  const flashGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.5, 12);
  const flashHeadGeo = new THREE.CylinderGeometry(0.14, 0.09, 0.18, 12);
  const lensGeo = new THREE.CircleGeometry(0.125, 14);
  geos.push(flashGeo, flashHeadGeo, lensGeo);
  const flashBody = mk(flashGeo, metal);
  flashBody.position.y = 0.05;
  flash.add(flashBody);
  const flashHead = mk(flashHeadGeo, metal);
  flashHead.position.y = 0.38;
  flash.add(flashHead);
  const flashLens = new THREE.Mesh(lensGeo, lens);
  flashLens.rotation.x = -Math.PI / 2;
  flashLens.position.y = 0.475;
  flash.add(flashLens);
  body.add(flash);

  // 脚とブーツ
  const legGeo = new THREE.CapsuleGeometry(0.14, 0.55, 6, 12);
  legGeo.translate(0, -0.42, 0);
  geos.push(legGeo);
  const legs = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.04, 0.95, side * 0.21);
    pivot.add(mk(legGeo, uniform));
    const bootM = ell(0.26, 0.13, 0.17, boot);
    bootM.position.set(0.1, -0.84, 0);
    pivot.add(bootM);
    group.add(pivot);
    legs.push({ pivot, side });
  }

  // 尻尾（ふさふさ。先は濃い色）
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.1, 0.1, 0),
    new THREE.Vector3(-0.45, -0.12, 0),
    new THREE.Vector3(-1.0, -0.38, 0),
    new THREE.Vector3(-1.5, -0.15, 0),
    new THREE.Vector3(-1.78, 0.35, 0),
  ]);
  const tailGeo = taperedTube(tailCurve, 28, 12, (t) => 0.17 - 0.09 * t);
  geos.push(tailGeo);
  const tail = new THREE.Group();
  tail.position.set(-0.3, 1.2, 0);
  tail.add(mk(tailGeo, fur));
  const tip = ell(0.085, 0.1, 0.085, mask);
  tip.position.copy(tailCurve.getPointAt(0.99));
  tail.add(tip);
  body.add(tail);

  // 懐中電灯の光：レンズから地面の先までの薄い円錐と、地面に落ちる光だまり（壁には向けない）
  const beam = new THREE.Group();
  const lensPos = handF.clone().addScaledVector(lightDir, 0.475);
  beam.position.copy(lensPos);
  const reachX = 2.5;
  const dropY = lensPos.y - 0.05;
  const toGround = new THREE.Vector3(reachX, -dropY, 0);
  const coneLen = toGround.length();
  const coneGeo = new THREE.ConeGeometry(0.85, coneLen, 24, 1, true);
  geos.push(coneGeo);
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
  const poolGeo = new THREE.CircleGeometry(1, 28);
  geos.push(poolGeo);
  const poolMat = new THREE.MeshBasicMaterial({ color: POLICE.light, map: glowTexture(), transparent: true, opacity: 0.8, depthWrite: false });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(1.5, 0.9, 1);
  pool.position.set(toGround.x + 0.15, toGround.y, 0);
  beam.add(pool);
  body.add(beam);

  let phase = Math.random() * 6;
  return {
    group,
    beam,
    head,
    animate(dt, { walking = true, searching = false } = {}) {
      if (walking) phase += dt * 9;
      const swing = Math.sin(phase) * 0.55;
      for (const l of legs) l.pivot.rotation.z = swing * -l.side;
      backArm.rotation.z = swing * 0.5 + 0.1;
      body.position.y = Math.abs(Math.sin(phase)) * 0.05;
      head.rotation.y = searching ? Math.sin(phase * 0.25) * 0.9 : 0;
      beam.rotation.y = searching ? Math.sin(phase * 0.25) * 0.35 : Math.sin(phase * 0.5) * 0.04;
      tail.rotation.z = Math.sin(phase * 0.5) * 0.1;
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      group.traverse((o) => o.material && o.material.dispose?.());
    },
  };
}

/** 宝石店（初回の開始演出用の建物）。正面は z=0、地面は y=0。奥は -z に伸びる箱。 */
export function createJewelryShop(width, height) {
  const group = new THREE.Group();
  const depth = Math.max(3.5, width * 0.45);
  const wallMat = lit(0xf3e2c6);
  const sideMat = lit(0xd9c3a2);
  const trim = lit(0x8d6b4a);
  const purple = lit(0x7a3e9d);
  const purpleDark = lit(0x57296f);
  const glass = basic(0xbfe7ff);
  const glassDeep = basic(0x8fc7ea);
  const woodDark = lit(0x6a3b2a);
  const red = lit(0xd6453d);
  const cream = lit(0xfff4e0);
  const goldM = lit(0xf2c94c);
  const roofMat = lit(0x5b4a63);
  const shelf = lit(0x4a3a2f);
  const geos = [];
  const box = (w, h, d, mat, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // 本体（奥行きのある箱。前面は z=0）
  box(width, height, depth, wallMat, 0, height / 2, -depth / 2);
  box(width + 0.2, 0.35, 0.3, trim, 0, 0.175, 0.1); // 土台
  box(width + 0.5, 0.42, depth + 0.5, roofMat, 0, height + 0.21, -depth / 2 + 0.1); // 屋根のへり
  box(width + 0.2, 0.18, 0.4, trim, 0, height - 0.09, 0.15); // 前の軒
  // 側面の目地（立体感）
  box(0.12, height, 0.2, sideMat, -width / 2 + 0.06, height / 2, 0.08);
  box(0.12, height, 0.2, sideMat, width / 2 - 0.06, height / 2, 0.08);

  // 看板：紫の板と宝石
  box(width * 0.82, height * 0.15, 0.4, purpleDark, 0, height * 0.855, 0.2);
  box(width * 0.78, height * 0.115, 0.1, purple, 0, height * 0.855, 0.43);
  const gemColors = [0x9ff3ff, 0xff7ab6, 0xffe066, 0x8affc1, 0xc4a1ff];
  const gemGeo = new THREE.OctahedronGeometry(0.28);
  geos.push(gemGeo);
  for (let i = 0; i < 5; i += 1) {
    const gem = new THREE.Mesh(gemGeo, lit(gemColors[i]));
    gem.position.set(-width * 0.3 + i * width * 0.15, height * 0.855, 0.62);
    gem.scale.y = 1.25;
    group.add(gem);
  }

  // ショーウィンドウ：枠・ガラス・宝石の展示台
  const winW = width * 0.27;
  const winH = height * 0.24;
  const winY = height * 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * width * 0.2 - width * 0.1;
    box(winW + 0.36, winH + 0.36, 0.3, woodDark, x, winY, 0.1);
    box(winW, winH, 0.1, glass, x, winY, 0.28);
    box(winW * 0.96, 0.05, 0.12, glassDeep, x, winY + winH * 0.1, 0.34); // ガラスの反射の筋
    box(winW * 0.9, 0.22, 0.6, shelf, x, winY - winH * 0.34, 0.5); // 展示台
    for (let i = 0; i < 3; i += 1) {
      const gem = new THREE.Mesh(gemGeo, lit(gemColors[(i + (sx > 0 ? 2 : 0)) % 5]));
      gem.scale.setScalar(0.55 + (i === 1 ? 0.2 : 0));
      gem.position.set(x + (i - 1) * winW * 0.27, winY - winH * 0.34 + 0.35, 0.5);
      group.add(gem);
    }
  }

  // ひさし（赤と白のしま）
  const stripes = 8;
  const stripeW = (width * 0.94) / stripes;
  const awnY = height * 0.5;
  for (let i = 0; i < stripes; i += 1) {
    const m = box(stripeW, 0.14, 1.5, i % 2 ? cream : red, -width * 0.47 + stripeW * (i + 0.5), awnY, 0.85);
    m.rotation.x = 0.38;
  }
  box(width * 0.94, 0.3, 0.1, red, 0, awnY - 0.62, 1.52); // ひさしの前の垂れ

  // ドア（右端）：枠・扉・窓・取っ手
  const doorX = width / 2 - 1.25;
  box(1.65, 2.75, 0.3, trim, doorX, 1.375, 0.1);
  box(1.35, 2.5, 0.14, woodDark, doorX, 1.25, 0.24);
  box(0.8, 0.8, 0.06, glass, doorX, 1.8, 0.33);
  const knobGeo = new THREE.SphereGeometry(0.08, 10, 8);
  geos.push(knobGeo);
  const knob = new THREE.Mesh(knobGeo, goldM);
  knob.position.set(doorX - 0.45, 1.2, 0.36);
  group.add(knob);

  group.userData.dispose = () => geos.forEach((g) => g.dispose());
  return group;
}
