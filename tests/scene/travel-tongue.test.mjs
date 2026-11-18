import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChameleon, createFerret } from '../../src/scene/characters.js';
import { createActorReactions } from '../../src/presentation/actor-reactions.js';
import { createPresentationScope } from '../../src/presentation/scope.js';
import { createTravelTongueMotion } from '../../src/scene/travel-tongue-motion.js';
import { createTongueRig } from '../../src/scene/tongue-rig.js';

// 2D の描画面の代用：何も描かず、グラデーションだけ返す（キャラクターの光の素材づくりが呼ぶ）。
const context = new Proxy({}, { get: (target, key) => (key in target ? target[key] : (key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (target, key, value) => { target[key] = value; return true; } });
globalThis.document = { createElement: () => ({ getContext: () => context, width: 0, height: 0 }) };
const travel = await import('../../src/scene/travel-tongue.js').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

const PHASES = { prepare: 150, extend: 250, hold: 350, retract: 450, store: 200 };
const frame = (phase, phaseProgress, extra = {}) => ({
  id: 'travel-tongue:1', startedAt: 10000, elapsedMs: 0, building: 3, phase, phaseProgress,
  jewelVisible: ['extend', 'hold', 'retract'].includes(phase), ...extra,
});
const close = (actual, expected, epsilon = 1e-9, message = '') => assert.ok(Math.abs(actual - expected) <= epsilon, `${message} ${actual} should equal ${expected}`);

function fixture(t) {
  assert.equal(typeof travel.createTravelTongue, 'function', 'travel-tongue.js must export createTravelTongue');
  const hero = createChameleon();
  const original = new Set(hero.head.children);
  const tongue = travel.createTravelTongue(hero);
  const added = hero.head.children.filter((child) => !original.has(child));
  t.after(() => { tongue.dispose(); hero.dispose(); });
  return { hero, tongue, mesh: tongue.mesh, diamond: tongue.diamond, added };
}
const poseNodes = (hero) => {
  const p = hero.actorParts;
  return JSON.stringify([
    p.head.rotation.toArray().slice(0, 3), p.eyes[0].rotation.toArray().slice(0, 3), p.eyes[1].rotation.toArray().slice(0, 3),
    p.jaw.position.toArray(), p.mouth.position.toArray(), p.jaw.rotation.toArray().slice(0, 3), p.mouth.rotation.toArray().slice(0, 3),
    p.arms.map((a) => a.rotation.toArray().slice(0, 3)), p.legs.map((l) => l.rotation.toArray().slice(0, 3)),
    p.jewel.visible, p.jewel.position.toArray(), p.jewel.scale.toArray(), hero.tongue.visible,
  ]);
};

test('pose comes from the controller frame alone: a pure function of phase and phaseProgress', () => {
  assert.equal(typeof travel.travelTonguePose, 'function');
  const a = travel.travelTonguePose(frame('hold', 0.5));
  const b = travel.travelTonguePose(frame('hold', 0.5, { elapsedMs: 99999, startedAt: 1, building: 50, id: 'other' }));
  assert.deepEqual(a, b, 'elapsedMs, id, startedAt and building do not change the pose');
  const out = {};
  assert.equal(travel.travelTonguePose(frame('hold', 0.5), out), out, 'writes into the given object');
  for (const bad of [null, undefined, {}, { phase: 'idle', phaseProgress: 0 }, { phase: 'anticipate', phaseProgress: 0 }, { phase: 'settle', phaseProgress: 0 }]) {
    assert.equal(travel.travelTonguePose(bad), null);
  }
  assert.equal(Object.isFrozen(travel.TRAVEL_PHASE_MS), true);
  assert.deepEqual({ ...travel.TRAVEL_PHASE_MS }, PHASES);
  // 範囲外・非有限の phaseProgress は 0..1 に収める
  assert.deepEqual(travel.travelTonguePose(frame('extend', 7)), travel.travelTonguePose(frame('extend', 1)));
  assert.deepEqual(travel.travelTonguePose(frame('extend', NaN)), travel.travelTonguePose(frame('extend', 0)));
});

test('five phases follow the design table at their boundaries and middles', () => {
  const pose = (phase, u, extra) => travel.travelTonguePose(frame(phase, u, extra));
  let p = pose('prepare', 0);
  close(p.mouthOpen, 0); close(p.extension, 0); close(p.storage, 0.001, 1e-9); close(p.diamond, 0);
  // The mouth opens first; the tongue stays inside until the mouth is fully open.
  p = pose('prepare', travel.MOUTH_OPEN_SHARE);
  close(p.mouthOpen, 1); close(p.extension, 0); close(p.storage, 0.001, 1e-9);
  assert.ok(pose('prepare', 0.3).mouthOpen > 0.5 && pose('prepare', 0.3).storage < 0.01, 'opening mouth, tongue still inside');
  p = pose('prepare', 1);
  close(p.mouthOpen, 1); close(p.headTilt, 0.04); close(p.extension, 0.05); close(p.storage, 1);
  p = pose('extend', 0);
  close(p.extension, 0.05); close(p.unroll, 0); close(p.diamond, 0); close(p.lift, 0);
  p = pose('extend', 1);
  close(p.extension, 1); close(p.unroll, 1); close(p.diamond, 1, 1e-9);
  assert.ok(pose('extend', 0.9).diamond > 0.5 && pose('extend', 0.9).diamond <= 1.08 + 1e-9, 'the diamond grows a little past 1 then settles');
  assert.equal(pose('extend', 0.2).diamond, 0, 'no diamond while the curl is still tight');
  p = pose('hold', 0);
  close(p.extension, 1); close(p.unroll, 1); close(p.diamond, 1); close(p.lift, 0); close(p.glow, 0); close(p.spin, 0);
  p = pose('hold', 100 / 350);
  close(p.lift, 1); close(p.glow, Math.sin(Math.PI * 100 / 200), 1e-9);
  p = pose('hold', 1);
  close(p.lift, 1); close(p.glow, 0); close(p.spin, Math.PI / 4);
  p = pose('retract', 0);
  close(p.extension, 1); close(p.unroll, 1); close(p.lift, 1); close(p.gazeWeight, 1); close(p.headTilt, 0.04);
  p = pose('retract', 1);
  close(p.extension, 0.05); close(p.unroll, 0); close(p.lift, 0); close(p.gazeWeight, 0.5); close(p.headTilt, 0.02); close(p.diamond, 0);
  p = pose('store', 0);
  close(p.mouthOpen, 1); close(p.extension, 0.05); close(p.storage, 1); close(p.diamond, 0);
  // The tongue is fully stored before the mouth has closed noticeably.
  p = pose('store', travel.STORE_CLOSE_FROM);
  close(p.mouthOpen, 1); assert.ok(p.storage > 0.001, 'tongue still going in while the mouth is open');
  p = pose('store', travel.STORE_TONGUE_SHARE);
  close(p.storage, 0.001, 1e-9); assert.ok(p.mouthOpen > 0.95, 'mouth still open when the tongue is in');
  p = pose('store', 1);
  close(p.mouthOpen, 0); close(p.gazeWeight, 0); close(p.headTilt, 0); close(p.storage, 0.001, 1e-9);
});

test('the head turns to the front over the prepare and back to its current pose over the store', (t) => {
  const pose = (phase, u) => travel.travelTonguePose(frame(phase, u));
  close(pose('prepare', 0).face, 0); close(pose('prepare', 1).face, 1);
  for (const phase of ['extend', 'hold', 'retract']) for (const u of [0, 0.5, 1]) close(pose(phase, u).face, 1);
  close(pose('store', 0).face, 1); close(pose('store', 1).face, 0);
  for (let u = 0.1; u < 1; u += 0.1) assert.ok(pose('prepare', u).face >= pose('prepare', u - 0.1).face && pose('store', u).face <= pose('store', u - 0.1).face);
  // The start and end angles follow whatever the walk/reactions wrote this frame.
  const { hero, tongue } = fixture(t);
  for (const glance of [-0.92, -0.4, 0.35]) {
    for (const [phase, u, k] of [['prepare', 0, 1], ['prepare', 0.5, 0.5], ['hold', 0.5, 0], ['store', 0.5, 0.5], ['store', 1, 1]]) {
      tongue.prepareBase();
      hero.head.rotation.y = glance;
      tongue.apply(frame(phase, u));
      close(hero.head.rotation.y, glance * k, 1e-9, `${phase} ${u} from ${glance}`);
    }
    tongue.cancel();
    close(hero.head.rotation.y, glance, 1e-12, 'cancel returns the exact current pose');
  }
});

test('phases join without jumps and jewelVisible:false removes the diamond', () => {
  const edge = (a, b, keys) => {
    const x = travel.travelTonguePose(frame(a, 1));
    const y = travel.travelTonguePose(frame(b, 0));
    for (const key of keys) close(x[key], y[key], 1e-9, `${a}->${b} ${key}`);
  };
  const keys = ['mouthOpen', 'gazeWeight', 'headTilt', 'extension', 'unroll', 'storage', 'diamond', 'lift', 'face'];
  edge('prepare', 'extend', ['mouthOpen', 'gazeWeight', 'headTilt', 'extension', 'storage', 'lift', 'face']);
  edge('extend', 'hold', keys);
  edge('hold', 'retract', keys);
  edge('retract', 'store', ['mouthOpen', 'headTilt', 'extension', 'unroll', 'lift', 'diamond', 'face']);
  assert.equal(travel.travelTonguePose(frame('hold', 0.5, { jewelVisible: false })).diamond, 0);
  assert.equal(travel.travelTonguePose(frame('hold', 0.5)).diamond, 1);
});

test('the travel tongue adds the tongue and the open-mouth inside as head children, with the outline and the diamond below the tongue', (t) => {
  const { hero, mesh, diamond, added } = fixture(t);
  assert.equal(added.length, 2);
  assert.equal(added[0], mesh);
  assert.equal(added[1].name, 'travel-tongue-mouth');
  assert.equal(added[1].visible, false, 'the mouth inside is hidden until the mouth opens');
  assert.equal(added[1].children.length, 0);
  assert.equal(mesh.name, 'travel-tongue');
  assert.equal(mesh.children[0].geometry, mesh.geometry);
  assert.equal(mesh.children[1], diamond);
  assert.equal(mesh.material, hero.tongue.material);
  assert.equal(mesh.children[0].material, hero.tongue.children[0].material);
  assert.notEqual(diamond.geometry, hero.jewel.geometry, 'a dedicated diamond shape, not the tail jewel');
  assert.notEqual(diamond.material, hero.jewel.material);
  assert.equal(diamond.material.vertexColors, true);
  assert.equal(diamond.material.transparent, false);
  assert.equal(diamond.material.depthWrite, true);
  assert.equal(diamond.children.length, 0, 'no outline or extra draw for the diamond');
  assert.equal(mesh.visible, false);
  assert.equal(diamond.visible, false);
});

test('the diamond sits at 85% of the tongue length along its tangent and rests on the top surface', (t) => {
  const { tongue, mesh, diamond } = fixture(t);
  const probeHero = createChameleon();
  const probe = createTongueRig(probeHero, { name: 'probe' });
  t.after(() => { probe.dispose(); probeHero.dispose(); });
  const point = { x: 0, y: 0, z: 0 }; const tangent = { x: 0, y: 0, z: 0 }; const normal = { x: 0, y: 0, z: 0 };
  for (const f of [frame('extend', 1), frame('hold', 0.3), frame('hold', 1), frame('retract', 0.2), frame('extend', 0.7)]) {
    tongue.apply(f);
    const pose = travel.travelTonguePose(f);
    assert.equal(diamond.visible, true);
    probe.apply({ visible: true, extension: pose.extension, unroll: pose.unroll, storage: 1 });
    probe.writePoint(travel.DIAMOND_ALONG, point, tangent, normal);
    const rise = 0.05 + (travel.DIAMOND_HALF_HEIGHT - 0.008) * pose.diamond;
    close(diamond.position.x, point.x + normal.x * rise, 1e-9);
    close(diamond.position.y, point.y + normal.y * rise, 1e-9);
    close(diamond.position.z, 0, 1e-12);
    close(diamond.rotation.z, Math.atan2(tangent.y, tangent.x), 1e-9, 'follows the tangent');
    close(diamond.scale.x, pose.diamond, 1e-9);
    assert.equal(diamond.parent, mesh);
    // 下端は舌の中心線から（半径＋小さな沈み）の高さにある
    const bottom = diamond.position.clone().addScaledVector(new THREE.Vector3(normal.x, normal.y, 0), -travel.DIAMOND_HALF_HEIGHT * pose.diamond);
    const toCenter = Math.hypot(bottom.x - point.x, bottom.y - point.y);
    assert.ok(toCenter <= 0.05 + 1e-9 && toCenter >= 0.04, `lower tip touches the top surface (${toCenter})`);
  }
  assert.equal(travel.DIAMOND_ALONG, 0.85);
});

test('the tail jewel is hidden only while the tongue is shown and goes back to the previous state', (t) => {
  const { hero, tongue } = fixture(t);
  hero.jewel.visible = true; // 既存演出がたまたま出していた場合
  tongue.apply(frame('hold', 0.5));
  assert.equal(hero.jewel.visible, false);
  tongue.cancel();
  assert.equal(hero.jewel.visible, true);
  hero.jewel.visible = false;
  tongue.apply(frame('extend', 0.5));
  assert.equal(hero.jewel.visible, false);
  tongue.apply(null);
  assert.equal(hero.jewel.visible, false);
  assert.equal(tongue.mesh.visible, false);
  assert.equal(tongue.diamond.visible, false);
});

test('cancelling, null frames and unknown phases restore every pose value written and hide both shapes', (t) => {
  const { hero, tongue } = fixture(t);
  hero.animate(0.016, { walking: true });
  const before = poseNodes(hero);
  for (const phase of Object.keys(PHASES)) {
    tongue.prepareBase();
    hero.animate(0, { walking: false });
    tongue.apply(frame(phase, 0.5));
    // 予備の中ほどは口を開けている途中で、舌はまだ口の中（描かない）。
    assert.equal(tongue.mesh.visible, phase !== 'prepare', phase);
  }
  tongue.cancel();
  assert.equal(tongue.mesh.visible, false);
  assert.equal(tongue.diamond.visible, false);
  assert.equal(tongue.stats().drawCalls, 0);
  assert.equal(hero.tongue.visible, false);
  // 取消の後の基本姿勢は、舌が無かった時と同じ
  assert.equal(typeof before, 'string');
  const control = createChameleon();
  t.after(() => control.dispose());
  hero.animate(0, { walking: false });
  control.animate(0.016, { walking: true });
  for (const phase of Object.keys(PHASES)) control.animate(0, { walking: false });
  control.animate(0, { walking: false });
  assert.equal(poseNodes(hero), poseNodes(control));
  tongue.apply(frame('hold', 0.5));
  tongue.apply({ phase: 'unknown', phaseProgress: 0.5 });
  assert.equal(tongue.mesh.visible, false);
});

test('1000 cycles mixed with the real hero, existing reactions and stops leave exactly the pose of a hero without the tongue', (t) => {
  const { hero, tongue } = fixture(t);
  const control = createChameleon();
  const ferret = createFerret(); const controlFerret = createFerret();
  const scope = createPresentationScope({ id: 'probe', kind: 'game' });
  const controlScope = createPresentationScope({ id: 'probe-control', kind: 'game' });
  const reactions = createActorReactions({ hero, police: [ferret], scope });
  const controlReactions = createActorReactions({ hero: control, police: [controlFerret], scope: controlScope });
  t.after(() => { scope.dispose(); controlScope.dispose(); control.dispose(); ferret.dispose?.(); controlFerret.dispose?.(); });
  const phases = Object.keys(PHASES);
  const view = (n) => ({ t: n * 16, building: 1 + (n % 7), passed: n % 7, phase: ['grace', 'eval', 'grace', 'eval'][n % 4], matchState: n % 5 === 0 ? 'success' : null, policeStage: n % 11 === 0 ? 1 : 0, running: n % 13 !== 0, combo: 0, maxCombo: 0, guideActive: false, lastEvalSuccess: n % 17 === 0 });
  for (let n = 0; n < 1000; n++) {
    const v = view(n);
    for (let k = 0; k < 5; k++) { // 1周期＝5段階の枠。途中で止まる（同じ枠を繰り返す）・取り消す・別の反応と重なる
      const f = frame(phases[(n + k) % 5], ((n * 7 + k) % 10) / 10);
      tongue.prepareBase();
      if (v.running) { hero.animate(0.016, { walking: true }); control.animate(0.016, { walking: true }); ferret.animate(0.016, { walking: true }); controlFerret.animate(0.016, { walking: true }); }
      reactions.tick(v); controlReactions.tick(v);
      if (n % 9 === 4 && k === 2) tongue.apply(null); else tongue.apply(f);
      if (n % 5 === 1) tongue.apply(f); // 同じフレームに二度
    }
  }
  tongue.cancel();
  // 最後に両方を同じ姿勢の入力で一度進め、舌の補正が残っていないことを見る
  tongue.prepareBase();
  hero.animate(0.016, { walking: true }); control.animate(0.016, { walking: true });
  assert.equal(poseNodes(hero), poseNodes(control));
  assert.equal(tongue.stats().drawCalls, 0);
  assert.equal(hero.jewel.visible, control.jewel.visible);
});

test('a stopped controller (same frame repeated) rewrites neither the shape nor the diamond', (t) => {
  const { hero, tongue } = fixture(t);
  tongue.apply(frame('hold', 0.4));
  const stats = tongue.stats();
  const snapshot = poseNodes(hero);
  for (let i = 0; i < 1000; i++) {
    tongue.prepareBase();
    tongue.apply(frame('hold', 0.4));
  }
  assert.equal(tongue.stats().shapeWrites, stats.shapeWrites, 'no shape update while stopped');
  assert.equal(poseNodes(hero), snapshot, 'the pose is held, not accumulated');
  tongue.apply(frame('hold', 0.41));
  assert.equal(tongue.stats().shapeWrites, stats.shapeWrites, 'hold has a constant tube; only the diamond spin moves');
  tongue.apply(frame('extend', 0.9));
  assert.ok(tongue.stats().shapeWrites > stats.shapeWrites);
});

test('drawn parts: tube, outline, diamond and the open-mouth inside = 4 draw calls, 3 shapes, and nothing when hidden', (t) => {
  const { tongue } = fixture(t);
  assert.deepEqual({ ...tongue.stats(), shapeWrites: 0, poseWrites: 0 }, { visible: false, diamondVisible: false, shapeWrites: 0, poseWrites: 0, drawCalls: 0, geometries: 3, mouthVisible: false });
  tongue.apply(frame('hold', 0.5));
  assert.equal(tongue.stats().drawCalls, 4);
  assert.equal(tongue.stats().mouthVisible, true);
  tongue.apply(frame('prepare', 0.5));
  assert.equal(tongue.stats().drawCalls, 1, 'opening mouth only: the stored tongue is not drawn');
  tongue.apply(frame('prepare', 0.9));
  assert.equal(tongue.stats().drawCalls, 3, 'the tongue tip peeks out of the open mouth');
  tongue.apply(frame('store', 1));
  assert.equal(tongue.stats().mouthVisible, false, 'the closed mouth draws no inside');
  tongue.apply(null);
  assert.equal(tongue.stats().drawCalls, 0);
  assert.equal(tongue.stats().mouthVisible, false);
});

test('the envelope contains the tube, its outline and the diamond across the real controller timeline', (t) => {
  const { tongue, mesh, diamond } = fixture(t);
  const box = new THREE.Box3();
  assert.equal(tongue.getLocalEnvelope(box), box);
  const motion = createTravelTongueMotion();
  const thick = mesh.children[0].material.uniforms.uThick.value;
  const v = new THREE.Vector3(); const nrm = new THREE.Vector3(); const corner = new THREE.Vector3();
  let seen = 0;
  for (let ms = 0; ms <= 11600; ms += 4) {
    const extra = motion.sample({ t: ms, moving: true, running: true, drawable: true, building: 2 });
    tongue.apply(extra);
    if (!extra) continue;
    seen += 1;
    mesh.updateMatrix(); diamond.updateMatrix();
    const pos = mesh.geometry.attributes.position; const nor = mesh.geometry.attributes.normal;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i); nrm.fromBufferAttribute(nor, i); v.addScaledVector(nrm, thick).multiplyScalar(mesh.scale.x).applyMatrix4(new THREE.Matrix4().makeRotationZ(mesh.rotation.z)).add(mesh.position);
      assert.ok(box.containsPoint(v), `tube ${ms}ms ${v.toArray()}`);
    }
    if (diamond.visible) {
      const dpos = diamond.geometry.attributes.position;
      for (let i = 0; i < dpos.count; i++) {
        corner.fromBufferAttribute(dpos, i).applyMatrix4(diamond.matrix).multiplyScalar(mesh.scale.x).applyMatrix4(new THREE.Matrix4().makeRotationZ(mesh.rotation.z)).add(mesh.position);
        assert.ok(box.containsPoint(corner), `diamond ${ms}ms ${corner.toArray()}`);
      }
    }
  }
  assert.ok(seen >= 300, 'the whole 1,400 ms cycle was exercised');
  assert.ok(box.max.x - mesh.position.x < 1.1 && box.max.y - mesh.position.y < 0.75, 'the envelope is not wastefully large');
});

test('dispose is idempotent, removes only owned parts, frees the tube and diamond once and never disposes borrowed materials', (t) => {
  assert.equal(typeof travel.createTravelTongue, 'function');
  const hero = createChameleon();
  t.after(() => hero.dispose());
  const before = [...hero.head.children];
  const tongue = travel.createTravelTongue(hero);
  let geometries = 0; let diamondMaterial = 0; let borrowed = 0;
  tongue.mesh.geometry.addEventListener('dispose', () => geometries++);
  tongue.diamond.geometry.addEventListener('dispose', () => geometries++);
  tongue.diamond.material.addEventListener('dispose', () => diamondMaterial++);
  hero.tongue.material.addEventListener('dispose', () => borrowed++);
  hero.tongue.children[0].material.addEventListener('dispose', () => borrowed++);
  tongue.apply(frame('hold', 0.5));
  const jewelBefore = hero.jewel.visible;
  tongue.dispose(); tongue.dispose();
  tongue.apply(frame('hold', 0.5)); tongue.prepareBase(); tongue.cancel();
  assert.deepEqual(hero.head.children, before);
  assert.equal(geometries, 2);
  assert.equal(diamondMaterial, 1);
  assert.equal(borrowed, 0);
  assert.equal(hero.tongue.visible, false);
  assert.notEqual(jewelBefore, undefined);
});

test('a failure while attaching the diamond removes the tongue and frees the tube', () => {
  assert.equal(typeof travel.createTravelTongue, 'function');
  const hero = createChameleon();
  const before = [...hero.head.children];
  const original = THREE.Mesh.prototype.add;
  let tubeGeometry = null; let disposals = 0;
  THREE.Mesh.prototype.add = function (...objects) {
    if (this.name === 'travel-tongue' && objects.some((o) => o.name === 'travel-tongue-diamond')) {
      tubeGeometry = this.geometry;
      tubeGeometry.addEventListener('dispose', () => disposals++);
      throw new Error('diamond failed');
    }
    return original.apply(this, objects);
  };
  try {
    assert.throws(() => travel.createTravelTongue(hero), /diamond failed/);
    assert.deepEqual(hero.head.children, before);
    assert.equal(disposals, 1);
  } finally { THREE.Mesh.prototype.add = original; hero.dispose(); }
});
