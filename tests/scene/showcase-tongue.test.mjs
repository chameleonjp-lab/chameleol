import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChameleon } from '../../src/scene/chameleon28.js';

const { createShowcaseTongue } = await import('../../src/scene/showcase-tongue.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const context = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
globalThis.document = { createElement: () => ({ getContext: () => context }) };

function frame(overrides = {}) {
  return { tonguePhase: 'hold', tonguePhaseMs: 0, extension: 1, unroll: 1, mouthOpen: 1, gazeWeight: 1, headTilt: 0.04, ...overrides };
}
function fixture(t) {
  assert.equal(typeof createShowcaseTongue, 'function', 'home tongue implementation must be available');
  const hero = createChameleon();
  const original = new Set(hero.head.children);
  const tongue = createShowcaseTongue(hero);
  const mesh = hero.head.children.find(child => !original.has(child));
  t.after(() => { tongue.dispose(); hero.dispose(); });
  return { hero, tongue, mesh };
}
function center(mesh, ring) {
  const points = mesh.geometry.attributes.position;
  const value = new THREE.Vector3();
  for (let side = 0; side < 6; side++) value.add(new THREE.Vector3().fromBufferAttribute(points, ring * 7 + side));
  return value.divideScalar(6);
}
function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should equal ${expected}`);
}

// Removing curvature, moving the mouth anchor, or reallocating buffers breaks this behavior.
test('a connected curled tube unrolls through distinct shapes using one 32 by 6 geometry', t => {
  const { hero, tongue, mesh } = fixture(t);
  assert.ok(mesh?.isMesh);
  assert.equal(mesh.children[0].geometry, mesh.geometry);
  assert.equal(mesh.material, hero.tongue.material);
  assert.equal(mesh.children[0].material, hero.tongue.children[0].material);
  assert.equal(mesh.geometry.attributes.position.count, 33 * 7);
  assert.equal(mesh.geometry.index.count, 32 * 6 * 6);
  assert.equal(hero.tongue.visible, false);
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const index = mesh.geometry.index;
  const snapshots = [];
  for (const state of [
    frame({ tonguePhase: 'anticipate', extension: 0, unroll: 0 }),
    frame({ tonguePhase: 'extend', extension: 0.45, unroll: 0.45 }),
    frame(),
    frame({ tonguePhase: 'retract', extension: 0.3, unroll: 0.2 }),
  ]) {
    hero.animate(0, { walking: false });
    tongue.apply(state);
    assert.deepEqual(mesh.position.toArray(), hero.tongue.position.toArray());
    assert.equal(mesh.visible, true);
    assert.equal(mesh.geometry.attributes.position, position);
    assert.equal(mesh.geometry.attributes.normal, normal);
    assert.equal(mesh.geometry.index, index);
    const start = center(mesh, 0);
    close(start.length(), 0);
    for (const values of [position.array, normal.array]) assert.ok(values.every(Number.isFinite));
    for (let i = 0; i < normal.count; i++) close(new THREE.Vector3().fromBufferAttribute(normal, i).length(), 1);
    for (let ring = 1; ring <= 32; ring++) assert.ok(center(mesh, ring).distanceTo(center(mesh, ring - 1)) < 0.09, 'adjacent rings remain joined');
    snapshots.push(Array.from(position.array));
  }
  for (let i = 1; i < snapshots.length; i++) assert.notDeepEqual(snapshots[i], snapshots[i - 1]);
  tongue.apply(frame({ tonguePhase: 'anticipate', extension: 0, unroll: 0 }));
  assert.ok(center(mesh, 18).y > 0.15, 'stored tip has a visible loop');
  assert.ok(center(mesh, 26).x < center(mesh, 14).x, 'curled centerline turns back on itself');
  tongue.apply(frame());
  close(center(mesh, 32).y, 0);
  assert.ok(center(mesh, 32).x > 0.85, 'unrolled tip reaches forward');
});

// Underbounding the curl or its outline would clip it when the home camera fits the model.
test('the head-local envelope includes every deformation and borrowed outline', t => {
  const { tongue, mesh } = fixture(t);
  const envelope = new THREE.Box3();
  assert.equal(tongue.getLocalEnvelope(envelope), envelope);
  const thick = mesh.children[0].material.uniforms.uThick.value;
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let extension = 0; extension <= 1; extension += 0.1) {
    for (let unroll = 0; unroll <= 1; unroll += 0.1) {
      tongue.apply(frame({ extension, unroll }));
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        point.fromBufferAttribute(mesh.geometry.attributes.position, i).add(mesh.position);
        normal.fromBufferAttribute(mesh.geometry.attributes.normal, i);
        point.addScaledVector(normal, thick);
        assert.ok(envelope.containsPoint(point), `envelope misses ${point.toArray()}`);
      }
    }
  }
  assert.ok(envelope.max.x - mesh.position.x <= 1.101, 'tongue stays within the 1.10 protrusion budget');
});

// Accumulating offsets or restoring construction-time head motion breaks these live pose assertions.
test('1000 updates preserve the live animated pose and reset exact jaw and mouth transforms', t => {
  const { hero, tongue } = fixture(t);
  const { jaw, mouth, eyes } = hero.actorParts;
  const jawPosition = jaw.position.clone();
  const mouthPosition = mouth.position.clone();
  const jawRotation = jaw.rotation.clone();
  const mouthRotation = mouth.rotation.clone();
  const liveHead = 0.17;
  const eyeBases = [0.31, 2.73];
  for (let i = 0; i < 1000; i++) {
    hero.head.rotation.z = liveHead;
    eyes.forEach((eye, index) => { eye.rotation.y = eyeBases[index]; });
    tongue.apply(frame());
    close(hero.head.rotation.z, liveHead + 0.04);
    close(jaw.position.y, jawPosition.y - 0.05);
    assert.ok(Math.abs(eyes[0].rotation.y - eyeBases[0]) > 0.01);
  }
  // Reapplying without animate must also avoid a second offset.
  const applied = [hero.head.rotation.z, ...eyes.map(eye => eye.rotation.y)];
  for (let i = 0; i < 1000; i++) tongue.apply(frame());
  assert.deepEqual([hero.head.rotation.z, ...eyes.map(eye => eye.rotation.y)], applied);
  tongue.reset();
  close(hero.head.rotation.z, liveHead);
  eyes.forEach((eye, index) => close(eye.rotation.y, eyeBases[index]));
  assert.deepEqual(jaw.position, jawPosition);
  assert.deepEqual(mouth.position, mouthPosition);
  assert.deepEqual(jaw.rotation.toArray(), jawRotation.toArray());
  assert.deepEqual(mouth.rotation.toArray(), mouthRotation.toArray());
  tongue.reset();
  close(hero.head.rotation.z, liveHead);
});

test('reset does not subtract stale offsets after normal animation has replaced them', t => {
  const { hero, tongue } = fixture(t);
  tongue.apply(frame());
  hero.animate(0, { walking: false });
  const head = hero.head.rotation.clone();
  const eyes = hero.actorParts.eyes.map(eye => eye.rotation.clone());
  tongue.reset();
  assert.deepEqual(hero.head.rotation.toArray(), head.toArray());
  hero.actorParts.eyes.forEach((eye, index) => assert.deepEqual(eye.rotation.toArray(), eyes[index].toArray()));
});

test('settling tucks the curl into the mouth before idle hides it', t => {
  const { tongue, mesh } = fixture(t);
  tongue.apply(frame({ tonguePhase: 'settle', tonguePhaseMs: 0, extension: 0, unroll: 0 }));
  const start = mesh.scale.x;
  tongue.apply(frame({ tonguePhase: 'settle', tonguePhaseMs: 149, extension: 0, unroll: 0, mouthOpen: 0, gazeWeight: 0, headTilt: 0 }));
  assert.ok(mesh.visible);
  assert.ok(mesh.scale.x < start * 0.1);
  tongue.apply(frame({ tonguePhase: 'idle', extension: 0, unroll: 0, mouthOpen: 0, gazeWeight: 0, headTilt: 0 }));
  assert.equal(mesh.visible, false);
  for (const attribute of ['position', 'normal']) assert.ok(mesh.geometry.attributes[attribute].array.every(Number.isFinite));
});

test('idempotent disposal removes only owned parts and frees geometry once without borrowed materials', t => {
  const { hero, tongue, mesh } = fixture(t);
  const before = hero.head.children.filter(child => child !== mesh);
  let geometries = 0;
  let materials = 0;
  mesh.geometry.addEventListener('dispose', () => geometries++);
  mesh.material.addEventListener('dispose', () => materials++);
  mesh.children[0].material.addEventListener('dispose', () => materials++);
  tongue.apply(frame());
  tongue.dispose();
  tongue.dispose();
  tongue.apply(frame());
  assert.deepEqual(hero.head.children, before);
  assert.equal(geometries, 1);
  assert.equal(materials, 0);
  assert.equal(hero.tongue.visible, false);
});

test('a partial attachment failure removes the new part and releases its geometry', () => {
  assert.equal(typeof createShowcaseTongue, 'function', 'home tongue implementation must be available');
  const hero = createChameleon();
  const before = [...hero.head.children];
  const add = hero.head.add;
  let geometry;
  let disposals = 0;
  hero.head.add = function (mesh) {
    geometry = mesh.geometry;
    geometry.addEventListener('dispose', () => disposals++);
    add.call(this, mesh);
    throw new Error('attachment failed');
  };
  try {
    assert.throws(() => createShowcaseTongue(hero), /attachment failed/);
    assert.deepEqual(hero.head.children, before);
    assert.ok(geometry);
    assert.equal(disposals, 1);
  } finally {
    hero.head.add = add;
    hero.dispose();
  }
});

// Reversing the eye offsets would make both pupils look away from the +x tongue.
test('both eyes turn their forward direction toward the extended tongue', t => {
  const { hero, tongue } = fixture(t);
  const directions = hero.actorParts.eyes.map(eye => new THREE.Vector3(0, 0, 1).applyEuler(eye.rotation).x);
  tongue.apply(frame());
  hero.actorParts.eyes.forEach((eye, index) => {
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(eye.rotation);
    assert.ok(forward.x > directions[index], 'gaze moves toward local +x');
  });
});
