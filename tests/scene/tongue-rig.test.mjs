import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChameleon } from '../../src/scene/chameleon28.js';
import { createShowcaseTongue as createBaselineTongue } from './fixtures/showcase-tongue-baseline.mjs';

// 共通部品が無い状態ではこのファイルの主な試験は失敗する（RED）。
const rigModule = await import('../../src/scene/tongue-rig.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const showcaseModule = await import('../../src/scene/showcase-tongue.js');
const { createTongueRig, createPoseLedger } = rigModule;
const { createShowcaseTongue } = showcaseModule;
const context = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
globalThis.document = { createElement: () => ({ getContext: () => context }) };

function ready() {
  assert.equal(typeof createTongueRig, 'function', 'tongue-rig.js must export createTongueRig');
  assert.equal(typeof createPoseLedger, 'function', 'tongue-rig.js must export createPoseLedger');
}
function tubeOf(hero, before) {
  return hero.head.children.find(child => !before.has(child));
}
function homeFrame(overrides = {}) {
  return { tonguePhase: 'hold', tonguePhaseMs: 0, extension: 1, unroll: 1, mouthOpen: 1, gazeWeight: 1, headTilt: 0.04, ...overrides };
}

// 24 色・12 秒周期のホームの巻きベロの見た目を変えない：同じ入力なら管の頂点・法線・姿勢が今のファイルと一致する。
test('home tongue wrapper reproduces the pre-refactor tube vertices, normals and pose for a dense input grid', () => {
  ready();
  const baselineHero = createChameleon();
  const wrappedHero = createChameleon();
  const baselineBefore = new Set(baselineHero.head.children);
  const wrappedBefore = new Set(wrappedHero.head.children);
  const baseline = createBaselineTongue(baselineHero);
  const wrapped = createShowcaseTongue(wrappedHero);
  const baselineMesh = tubeOf(baselineHero, baselineBefore);
  const wrappedMesh = tubeOf(wrappedHero, wrappedBefore);
  try {
    let compared = 0;
    for (const phase of ['anticipate', 'extend', 'hold', 'retract', 'settle']) {
      for (let extension = 0; extension <= 1.0001; extension += 0.125) {
        for (let unroll = 0; unroll <= 1.0001; unroll += 0.125) {
          const frame = homeFrame({ tonguePhase: phase, tonguePhaseMs: 75, extension, unroll, mouthOpen: extension, gazeWeight: unroll, headTilt: 0.03 * extension });
          baselineHero.animate(0, { walking: false });
          wrappedHero.animate(0, { walking: false });
          baseline.apply(frame);
          wrapped.apply(frame);
          assert.deepEqual(Array.from(wrappedMesh.geometry.attributes.position.array), Array.from(baselineMesh.geometry.attributes.position.array), `positions ${phase} ${extension} ${unroll}`);
          assert.deepEqual(Array.from(wrappedMesh.geometry.attributes.normal.array), Array.from(baselineMesh.geometry.attributes.normal.array), `normals ${phase} ${extension} ${unroll}`);
          assert.equal(wrappedMesh.scale.x, baselineMesh.scale.x);
          assert.equal(wrappedMesh.visible, baselineMesh.visible);
          assert.deepEqual(wrappedHero.head.rotation.toArray(), baselineHero.head.rotation.toArray());
          assert.deepEqual(wrappedHero.actorParts.jaw.position.toArray(), baselineHero.actorParts.jaw.position.toArray());
          assert.deepEqual(wrappedHero.actorParts.mouth.position.toArray(), baselineHero.actorParts.mouth.position.toArray());
          wrappedHero.actorParts.eyes.forEach((eye, i) => assert.deepEqual(eye.rotation.toArray(), baselineHero.actorParts.eyes[i].rotation.toArray()));
          compared += 1;
        }
      }
    }
    assert.ok(compared > 300);
    baseline.apply(homeFrame({ tonguePhase: 'idle' }));
    wrapped.apply(homeFrame({ tonguePhase: 'idle' }));
    assert.equal(wrappedMesh.visible, false);
    assert.deepEqual(wrappedHero.head.rotation.toArray(), baselineHero.head.rotation.toArray());
  } finally {
    baseline.dispose(); wrapped.dispose(); baselineHero.dispose(); wrappedHero.dispose();
  }
});

test('the rig exposes the shared tube with 32x6 geometry and borrows the hero materials', () => {
  ready();
  const hero = createChameleon();
  try {
    const before = [...hero.head.children];
    const rig = createTongueRig(hero, { name: 'probe' });
    assert.equal(rig.mesh.name, 'probe');
    assert.equal(rig.mesh.parent, hero.head);
    assert.equal(rig.mesh.geometry.attributes.position.count, 33 * 7);
    assert.equal(rig.mesh.geometry.index.count, 32 * 6 * 6);
    assert.equal(rig.mesh.material, hero.tongue.material);
    assert.equal(rig.mesh.children[0].material, hero.tongue.children[0].material);
    assert.equal(rig.mesh.visible, false);
    assert.equal(hero.tongue.visible, false);
    rig.dispose();
    assert.deepEqual([...hero.head.children], before);
  } finally { hero.dispose(); }
});

test('applying the same extension and unroll does not rewrite the shape; a different one does', () => {
  ready();
  const hero = createChameleon();
  try {
    const rig = createTongueRig(hero);
    rig.apply({ visible: true, extension: 0.4, unroll: 0.3, storage: 1 });
    const writes = rig.stats().shapeWrites;
    for (let i = 0; i < 50; i++) rig.apply({ visible: true, extension: 0.4, unroll: 0.3, storage: 0.7 });
    assert.equal(rig.stats().shapeWrites, writes);
    rig.apply({ visible: true, extension: 0.5, unroll: 0.3, storage: 1 });
    assert.equal(rig.stats().shapeWrites, writes + 1);
    rig.apply({ visible: false });
    assert.equal(rig.mesh.visible, false);
    assert.equal(rig.stats().shapeWrites, writes + 1, 'hiding writes no shape');
    rig.dispose();
  } finally { hero.dispose(); }
});

test('writePoint follows the same centreline as the tube: unit tangent, upward normal, monotone along the length', () => {
  ready();
  const hero = createChameleon();
  try {
    const rig = createTongueRig(hero);
    for (const [extension, unroll] of [[1, 1], [0.5, 0.6], [0.05, 0], [0, 0]]) {
      rig.apply({ visible: true, extension, unroll, storage: 1 });
      const p = { x: 0, y: 0, z: 0 }; const tg = { x: 0, y: 0, z: 0 }; const n = { x: 0, y: 0, z: 0 };
      let lastX = -Infinity;
      for (const u of [0, 0.25, 0.5, 0.85, 1]) {
        rig.writePoint(u, p, tg, n);
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert.ok(Math.abs(Math.hypot(tg.x, tg.y) - 1) < 1e-9);
        assert.ok(Math.abs(n.x * tg.x + n.y * tg.y) < 1e-9);
        if (extension === 1 && unroll === 1) { assert.ok(p.x >= lastX); lastX = p.x; assert.ok(Math.abs(p.y) < 1e-9, 'fully unrolled tongue is straight'); }
      }
    }
    rig.apply({ visible: true, extension: 1, unroll: 1, storage: 1 });
    const point = { x: 0, y: 0, z: 0 };
    rig.writePoint(0.85, point, null, null);
    const positions = rig.mesh.geometry.attributes.position;
    const ringCenter = (ring) => { const v = new THREE.Vector3(); for (let s = 0; s < 6; s++) v.add(new THREE.Vector3().fromBufferAttribute(positions, ring * 7 + s)); return v.divideScalar(6); };
    assert.ok(point.x > ringCenter(0).x && point.x < ringCenter(32).x);
    rig.dispose();
  } finally { hero.dispose(); }
});

test('the envelope contains every deformation and the borrowed outline', () => {
  ready();
  const hero = createChameleon();
  try {
    const rig = createTongueRig(hero);
    const box = new THREE.Box3();
    assert.equal(rig.getLocalEnvelope(box), box);
    const thick = hero.tongue.children[0].material.uniforms.uThick.value;
    const v = new THREE.Vector3(); const nrm = new THREE.Vector3();
    for (let e = 0; e <= 1; e += 0.1) for (let u = 0; u <= 1; u += 0.1) {
      rig.apply({ visible: true, extension: e, unroll: u, storage: 1 });
      const pos = rig.mesh.geometry.attributes.position; const nor = rig.mesh.geometry.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).add(rig.mesh.position); nrm.fromBufferAttribute(nor, i); v.addScaledVector(nrm, thick);
        assert.ok(box.containsPoint(v), `envelope misses ${v.toArray()}`);
      }
    }
    rig.dispose();
  } finally { hero.dispose(); }
});

test('dispose is idempotent, frees the geometry once and never disposes borrowed materials', () => {
  ready();
  const hero = createChameleon();
  try {
    const rig = createTongueRig(hero);
    let geometries = 0; let materials = 0;
    rig.mesh.geometry.addEventListener('dispose', () => geometries++);
    hero.tongue.material.addEventListener('dispose', () => materials++);
    hero.tongue.children[0].material.addEventListener('dispose', () => materials++);
    rig.apply({ visible: true, extension: 1, unroll: 1, storage: 1 });
    rig.dispose(); rig.dispose();
    rig.apply({ visible: true, extension: 1, unroll: 1, storage: 1 });
    assert.equal(geometries, 1);
    assert.equal(materials, 0);
    assert.equal(rig.mesh.parent, null);
  } finally { hero.dispose(); }
});

test('a failed attachment removes the new part and frees its geometry', () => {
  ready();
  const hero = createChameleon();
  const before = [...hero.head.children];
  const add = hero.head.add;
  let geometry; let disposals = 0;
  hero.head.add = function (mesh) { geometry = mesh.geometry; geometry.addEventListener('dispose', () => disposals++); add.call(this, mesh); throw new Error('attachment failed'); };
  try {
    assert.throws(() => createTongueRig(hero), /attachment failed/);
    assert.deepEqual(hero.head.children, before);
    assert.equal(disposals, 1);
  } finally { hero.head.add = add; hero.dispose(); }
});

test('pose ledger: add accumulates once per key, restore puts back only values still equal to what it wrote', () => {
  ready();
  const target = { a: 1, b: 2, visible: true };
  const ledger = createPoseLedger();
  ledger.add(target, 'a', 0.5);
  ledger.add(target, 'a', 0.5); // 同じ項目への二度目は重ならない
  assert.equal(target.a, 1.5);
  ledger.set(target, 'visible', false);
  assert.equal(ledger.appliedCount(), 2);
  ledger.restore();
  assert.equal(target.a, 1); assert.equal(target.visible, true); assert.equal(ledger.appliedCount(), 0);
  ledger.add(target, 'b', 1);
  target.b = 10; // 通常の歩行が値を置き換えた
  ledger.restore();
  assert.equal(target.b, 10, 'an obsolete offset is not subtracted');
  ledger.add(target, 'a', 1);
  ledger.clear();
  ledger.restore();
  assert.equal(target.a, 2, 'clear forgets without restoring');
});
