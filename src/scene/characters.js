// 警察官（フェレット）と宝石店。体色の変更対象外なので、光の当たる材質で立体的に描く。
// 原画（フェレット警察官 No.02）の照合前の仮モデル：紺の制服・帽子・懐中電灯。
import * as THREE from 'three';
import { POLICE } from './palette-colors.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/** フェレットの警察官。原点は足元、+x を向く。 */
export function createFerret() {
  const group = new THREE.Group();
  const uniform = lambert(POLICE.uniform);
  const fur = lambert(POLICE.fur);
  const mask = lambert(POLICE.mask);
  const dark = lambert(0x222222);
  const body = new THREE.Group();
  group.add(body);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.05, 6, 16), uniform);
  torso.position.set(0, 1.55, 0);
  torso.rotation.z = -0.22;
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 24), dark);
  belt.position.set(0.04, 1.22, 0);
  belt.rotation.x = Math.PI / 2;
  body.add(belt);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.1, 6), new THREE.MeshBasicMaterial({ color: POLICE.badge }));
  badge.position.set(0.25, 1.85, 0.43);
  body.add(badge);

  const head = new THREE.Group();
  head.position.set(0.55, 2.5, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), fur);
  skull.scale.set(1.35, 0.95, 0.95);
  head.add(skull);
  const eyeMask = new THREE.Mesh(new THREE.SphereGeometry(0.41, 24, 10, 0, Math.PI * 2, 0.95, 0.55), mask);
  eyeMask.scale.set(1.35, 0.95, 0.95);
  head.add(eyeMask);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dark);
  nose.position.set(0.53, -0.03, 0);
  head.add(nose);
  for (const z of [0.2, -0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), dark);
    eye.position.set(0.32, 0.1, z);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fur);
    ear.position.set(-0.2, 0.32, z * 1.1);
    head.add(ear);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.3, 20), lambert(POLICE.cap));
  cap.position.set(-0.05, 0.4, 0);
  head.add(cap);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.55), dark);
  visor.position.set(0.28, 0.27, 0);
  head.add(visor);
  body.add(head);

  const limbGeo = new THREE.CapsuleGeometry(0.13, 0.62, 4, 10);
  const legs = [];
  for (const z of [0.2, -0.2]) {
    const leg = new THREE.Mesh(limbGeo, uniform);
    leg.position.set(-0.08, 0.52, z);
    group.add(leg);
    legs.push(leg);
  }
  const arm = new THREE.Mesh(limbGeo, uniform);
  arm.position.set(0.35, 1.7, 0.42);
  arm.rotation.z = -1.2;
  body.add(arm);
  // 懐中電灯と、地面だけを照らす光（比較面には重ねない）
  const flashlight = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.5, 12), dark);
  flashlight.position.set(0.85, 1.55, 0.45);
  flashlight.rotation.z = Math.PI / 2 - 0.3;
  body.add(flashlight);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: POLICE.light }));
  lens.position.set(1.1, 1.47, 0.45);
  lens.rotation.y = Math.PI / 2;
  body.add(lens);
  const beam = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    new THREE.MeshBasicMaterial({ color: POLICE.light, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  beam.rotation.x = -Math.PI / 2;
  beam.scale.set(1.6, 0.7, 1);
  beam.position.set(2.6, 0.03, 0.4);
  beam.userData.noPick = true;
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
      body.position.y = Math.abs(Math.sin(phase)) * 0.06;
    },
  };
}

/** 宝石店（初回の開始演出用）。幅 width、奥行きのある建物。正面は z=0。 */
export function createJewelryShop(width, height) {
  const group = new THREE.Group();
  const wall = lambert(0xf3e6d2);
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, height, 7), wall);
  box.position.set(0, height / 2, -3.5);
  group.add(box);
  const trim = lambert(0x7a3e9d);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.5, 0.8), trim);
  cornice.position.set(0, height + 0.25, 0.1);
  group.add(cornice);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, height * 0.12, 0.3), trim);
  sign.position.set(0, height * 0.82, 0.2);
  group.add(sign);
  for (let i = 0; i < 5; i += 1) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: [0x9ff3ff, 0xff7ab6, 0xffe066, 0x8affc1, 0xc4a1ff][i] }));
    gem.position.set(-width * 0.32 + i * width * 0.16, height * 0.82, 0.45);
    group.add(gem);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.55, height * 0.28), new THREE.MeshBasicMaterial({ color: 0xbfe7ff }));
  glass.position.set(-width * 0.12, height * 0.48, 0.02);
  group.add(glass);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.2), lambert(0x5a3b2a));
  door.position.set(width * 0.3, 1.3, 0.05);
  group.add(door);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1.2), trim);
  awning.position.set(width * 0.3, 2.9, 0.6);
  awning.rotation.x = 0.25;
  group.add(awning);
  return group;
}
