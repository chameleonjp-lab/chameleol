// キャラクターの仮モデル（単純な図形）。原画（カメレオンNo.28、フェレット警察官No.02）の照合前の代替。
// - 主人公：大きな渦巻きの目、尖った頭、丸まった尻尾、二足歩行。服は着せない。頭・胴・手足・尻尾に体色を反映。
// - 尻尾に宝石を隠し、クリア時に取り出す。
// - 警察官：紺の制服・帽子・懐中電灯。体色の変更対象外。
// すべて照明を使わない MeshBasicMaterial。体色の面は判定と同じ値をそのまま描く。
import * as THREE from 'three';
import { POLICE } from './palette-colors.js';

function swirlTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 7;
  g.beginPath();
  for (let a = 0; a < Math.PI * 7; a += 0.1) {
    const r = 4 + a * 2.7;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.lineWidth = 6;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function outlined(mesh, scale = 1.08) {
  const outline = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x1b1b1b, side: THREE.BackSide }));
  outline.scale.setScalar(scale);
  outline.renderOrder = -1;
  mesh.add(outline);
  return mesh;
}

/** カメレオン。bodyMaterial の色だけを差し替えて体色を変える。 */
export function createChameleon() {
  const group = new THREE.Group();
  const body = new THREE.MeshBasicMaterial({ color: 0x6aff4d });
  const parts = new THREE.Group();
  group.add(parts);

  const torso = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 16), body));
  torso.scale.set(0.95, 1.15, 0.8);
  torso.position.set(0, 1.35, 0);
  parts.add(torso);

  const head = new THREE.Group();
  head.position.set(0.35, 2.35, 0);
  const skull = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), body));
  skull.scale.set(1.15, 0.95, 0.85);
  head.add(skull);
  // 尖った頭（後頭部の突起）
  const crest = outlined(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 12), body));
  crest.position.set(-0.45, 0.42, 0);
  crest.rotation.z = Math.PI * 0.32;
  head.add(crest);
  // 口元
  const snout = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), body));
  snout.position.set(0.5, -0.12, 0);
  snout.scale.set(1.2, 0.7, 0.8);
  head.add(snout);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
  mouth.position.set(0.55, -0.22, 0.25);
  mouth.rotation.set(0, 0, Math.PI);
  head.add(mouth);
  // 大きな渦巻きの目
  const eyeTex = swirlTexture();
  const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex });
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), eyeMat);
  eye.position.set(0.18, 0.15, 0.48);
  head.add(eye);
  const eyeBulge = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), body), 1.06);
  eyeBulge.position.set(0.18, 0.15, 0.3);
  eyeBulge.scale.set(1, 1, 0.55);
  head.add(eyeBulge);
  parts.add(head);

  // 手足
  const limbGeo = new THREE.CapsuleGeometry(0.13, 0.55, 4, 8);
  const legs = [];
  for (const z of [0.25, -0.25]) {
    const leg = outlined(new THREE.Mesh(limbGeo, body));
    leg.position.set(0, 0.45, z);
    parts.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const z of [0.4, -0.4]) {
    const arm = outlined(new THREE.Mesh(limbGeo, body));
    arm.scale.set(0.85, 0.75, 0.85);
    arm.position.set(0.35, 1.45, z);
    arm.rotation.z = -0.9;
    parts.add(arm);
    arms.push(arm);
  }

  // 丸まった尻尾（渦巻きの曲線に沿った管）
  const tailCurvePts = [];
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI * 3.2;
    const r = 0.75 * (1 - i / 48);
    tailCurvePts.push(new THREE.Vector3(-0.55 - Math.sin(a) * r * 0.9 - (i < 6 ? (6 - i) * 0.04 : 0), 0.95 - (1 - Math.cos(a)) * r * 0.55, 0));
  }
  const tail = outlined(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailCurvePts), 64, 0.13, 8, false), body), 1.05);
  parts.add(tail);

  // 宝石（逃走中は尻尾に隠す）
  const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: 0x9ff3ff }));
  const jewelShine = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  jewel.add(jewelShine);
  jewel.position.set(-1.05, 0.7, 0);
  jewel.visible = false;
  parts.add(jewel);

  let walkPhase = 0;
  return {
    group,
    bodyMaterial: body,
    jewel,
    head,
    tail,
    setColor(rgb) {
      body.color.setRGB(rgb[0], rgb[1], rgb[2]);
    },
    /** 見た目の歩行だけ（判定の基準点は group の位置で、アニメーションでは動かさない）。 */
    animate(dt, { walking = true, nervous = 0 } = {}) {
      if (walking) walkPhase += dt * 9;
      const swing = Math.sin(walkPhase) * 0.5;
      legs[0].rotation.z = swing;
      legs[1].rotation.z = -swing;
      arms[0].rotation.z = -0.9 - swing * 0.4;
      arms[1].rotation.z = -0.9 + swing * 0.4;
      parts.position.y = Math.abs(Math.sin(walkPhase)) * 0.08 - nervous * 0.18;
      // 警戒が高いと振り返る・低い姿勢
      head.rotation.y = nervous > 0.5 ? Math.sin(walkPhase * 0.3) * 0.9 : nervous > 0 ? Math.sin(walkPhase * 0.2) * 0.4 : 0;
      parts.rotation.z = -nervous * 0.12;
    },
    dispose() {
      eyeTex.dispose();
    },
  };
}

/** フェレットの警察官。紺の制服・帽子・懐中電灯。 */
export function createFerret() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshBasicMaterial({ color: POLICE.uniform });
  const fur = new THREE.MeshBasicMaterial({ color: POLICE.fur });
  const mask = new THREE.MeshBasicMaterial({ color: POLICE.mask });
  const dark = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });

  const torso = outlined(new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 4, 12), uniform));
  torso.position.set(0, 1.45, 0);
  torso.rotation.z = -0.25;
  group.add(torso);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.09, 6), new THREE.MeshBasicMaterial({ color: POLICE.badge }));
  badge.position.set(0.25, 1.7, 0.42);
  group.add(badge);
  const head = new THREE.Group();
  head.position.set(0.55, 2.35, 0);
  const skull = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), fur));
  skull.scale.set(1.3, 0.95, 0.9);
  head.add(skull);
  const eyeMask = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 8, 0, Math.PI * 2, 0.9, 0.6), mask);
  eyeMask.scale.set(1.3, 0.95, 0.9);
  head.add(eyeMask);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dark);
  nose.position.set(0.5, -0.02, 0);
  head.add(nose);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), dark);
  eye.position.set(0.28, 0.1, 0.3);
  head.add(eye);
  for (const z of [0.22, -0.22]) {
    const ear = outlined(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fur));
    ear.position.set(-0.15, 0.3, z);
    head.add(ear);
  }
  // 帽子
  const cap = outlined(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.28, 16), new THREE.MeshBasicMaterial({ color: POLICE.cap })));
  cap.position.set(-0.05, 0.38, 0);
  head.add(cap);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.5), dark);
  visor.position.set(0.25, 0.26, 0);
  head.add(visor);
  group.add(head);

  const limbGeo = new THREE.CapsuleGeometry(0.12, 0.6, 4, 8);
  const legs = [];
  for (const z of [0.2, -0.2]) {
    const leg = outlined(new THREE.Mesh(limbGeo, uniform));
    leg.position.set(-0.1, 0.5, z);
    group.add(leg);
    legs.push(leg);
  }
  // 懐中電灯と、地面だけを照らす光（比較面には重ねない）
  const flashlight = outlined(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 10), dark));
  flashlight.position.set(0.75, 1.55, 0.35);
  flashlight.rotation.z = Math.PI / 2;
  group.add(flashlight);
  const beam = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: POLICE.light, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  beam.scale.set(1.3, 0.25, 1);
  beam.position.set(2.2, 0.05, 0.6);
  group.add(beam);

  let phase = Math.random() * 6;
  return {
    group,
    beam,
    head,
    animate(dt, { walking = true, searching = false } = {}) {
      if (walking) phase += dt * 10;
      const swing = Math.sin(phase) * 0.55;
      legs[0].rotation.z = swing;
      legs[1].rotation.z = -swing;
      head.rotation.y = searching ? Math.sin(phase * 0.25) * 1.1 : 0;
      group.position.y = Math.abs(Math.sin(phase)) * 0.06;
    },
  };
}

/** 宝石店（初回の開始演出用の建物）。 */
export function createJewelryShop(width, height) {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: 0xf6e7d0 }));
  wall.position.set(0, height / 2, 0);
  group.add(wall);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.8, height * 0.12), new THREE.MeshBasicMaterial({ color: 0x7a3e9d }));
  sign.position.set(0, height * 0.86, 0.01);
  group.add(sign);
  for (let i = 0; i < 5; i += 1) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: [0x9ff3ff, 0xff7ab6, 0xffe066, 0x8affc1, 0xc4a1ff][i] }));
    gem.position.set(-width * 0.32 + i * width * 0.16, height * 0.86, 0.05);
    group.add(gem);
  }
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xbfe7ff });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.6, height * 0.3), windowMat);
  win.position.set(0, height * 0.45, 0.01);
  group.add(win);
  return group;
}
