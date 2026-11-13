import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShowcase } from '../../src/scene/showcase.js';

class Events extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn, options) {
    super.addEventListener(type, fn, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn, options) {
    super.removeEventListener(type, fn, options);
    this.listeners.get(type)?.delete(fn);
  }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function harness({ reduced = false, hidden = false, width = 320, height = 210, failAt = null } = {}) {
  let time = 1000;
  let nextId = 0;
  const queued = new Map();
  const callbacks = [];
  const canvas = new Events();
  canvas.remove = () => { canvas.removed = true; };
  const media = new Events();
  media.matches = reduced;
  const document = new Events();
  document.hidden = hidden;
  const context = {
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillRect() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  document.createElement = () => ({ getContext: () => context });
  document.createElementNS = () => assert.fail('createShowcase must honor injected rendererFactory instead of constructing WebGLRenderer');
  const originals = ['document', 'window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  globalThis.document = document;
  globalThis.window = { matchMedia: () => media };
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  };
  const requestFrame = fn => { const id = nextId++; queued.set(id, fn); callbacks.push(fn); return id; };
  const cancelFrame = id => queued.delete(id);
  // The original implementation reaches these globals; the injected contract must replace them.
  globalThis.requestAnimationFrame = requestFrame;
  globalThis.cancelAnimationFrame = cancelFrame;
  let size = { width, height };
  const container = { append(node) { this.child = node; }, getBoundingClientRect: () => size };
  const renderer = {
    domElement: canvas,
    info: { render: { calls: 3 }, memory: { geometries: 12, textures: 2 } },
    setPixelRatio() {},
    setSize(w, h) { if (failAt === 'resize') throw Error('size failed'); this.size = [w, h]; },
    render(scene, camera) {
      if (failAt === 'render') throw Error('render failed');
      this.scene = scene; this.camera = camera;
      this.renders = (this.renders || 0) + 1;
    },
    dispose() { this.disposals = (this.disposals || 0) + 1; },
  };
  return {
    document, media, canvas, renderer, container, observers, callbacks, queued,
    create: () => createShowcase(container, { now: () => time, random: () => 0, requestFrame, cancelFrame, rendererFactory: () => renderer }),
    frame(ms) { time = 1000 + ms; const entries = [...queued]; queued.clear(); for (const [, callback] of entries) callback(time); },
    at(ms) { time = 1000 + ms; },
    hide(value, ms) { this.at(ms); document.hidden = value; document.dispatchEvent(new Event('visibilitychange')); },
    context(value, ms) { this.at(ms); const event = new Event(value ? 'webglcontextlost' : 'webglcontextrestored', { cancelable: true }); canvas.dispatchEvent(event); return event; },
    reduce(value, ms) { this.at(ms); media.matches = value; media.dispatchEvent(new Event('change')); },
    resize(w, h, ms) { this.at(ms); size = { width: w, height: h }; for (const observer of observers) observer.callback([]); },
    restore() { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

function withShowcase(options, run) {
  const env = harness(options);
  let showcase;
  try { showcase = env.create(); return run(showcase, env); }
  finally { showcase?.dispose(); env.restore(); }
}

function rgb(showcase, expected) {
  const actual = showcase.stats().colorRgb;
  expected.forEach((byte, i) => assert.ok(Math.abs(actual[i] - byte / 255) < 1e-10, `${actual} expected ${expected}/255`));
}

test('injected clock drives green, midpoint, next color and a single frame chain including RAF id zero', () => {
  withShowcase({}, (showcase, env) => {
    rgb(showcase, [88, 196, 60]);
    assert.equal(env.queued.size, 1);
    assert.equal(showcase.stats().pendingFrames, 1);
    env.frame(250); rgb(showcase, [105, 196, 60]);
    env.frame(500); rgb(showcase, [122, 196, 60]);
    assert.equal(env.queued.size, 1);
    const copy = showcase.stats(); copy.colorRgb[0] = 0;
    rgb(showcase, [122, 196, 60]);
  });
});

test('visibility notifications alone freeze elapsed time and stale frames cannot render or schedule', () => {
  withShowcase({}, (showcase, env) => {
    env.frame(50);
    const stale = env.callbacks.at(-1);
    env.hide(true, 60);
    assert.equal(env.queued.size, 0);
    assert.equal(showcase.stats().active, false);
    env.hide(false, 9000);
    const resumedCount = env.renderer.renders;
    stale();
    assert.equal(env.renderer.renders, resumedCount);
    assert.equal(env.queued.size, 1);
    env.frame(9050);
    rgb(showcase, [94.8, 196, 60]);
    showcase.dispose(); const count = env.renderer.renders;
    stale(); showcase.resize();
    assert.equal(env.renderer.renders, count);
    assert.equal(env.queued.size, 0);
  });
});

for (const restoreContextFirst of [false, true]) {
  test(`overlapping context loss and hidden state rebase only after all reasons clear (context first: ${restoreContextFirst})`, () => {
    withShowcase({}, (showcase, env) => {
      env.frame(50);
      assert.equal(env.context(true, 60).defaultPrevented, true);
      env.hide(true, 100);
      if (restoreContextFirst) env.context(false, 5000);
      else env.hide(false, 5000);
      assert.equal(env.queued.size, 0);
      assert.equal(showcase.stats().active, false);
      rgb(showcase, [91.4, 196, 60]);
      if (restoreContextFirst) env.hide(false, 9000);
      else env.context(false, 9000);
      rgb(showcase, [91.4, 196, 60]);
      assert.equal(env.queued.size, 1);
      env.frame(9050); rgb(showcase, [94.8, 196, 60]);
    });
  });
}

test('a home created while hidden waits for visibility before starting its clock', () => {
  withShowcase({ hidden: true }, (showcase, env) => {
    assert.equal(env.renderer.renders, undefined);
    assert.equal(env.queued.size, 0);
    rgb(showcase, [88, 196, 60]);
    env.hide(false, 8000);
    env.frame(8050);
    rgb(showcase, [91.4, 196, 60]);
  });
});

test('zero size freezes clock, retains no frame and resumes after a valid observed size', () => {
  withShowcase({ width: 0, height: 0 }, (showcase, env) => {
    assert.equal(env.queued.size, 0);
    assert.equal(showcase.stats().renderCount, 0);
    env.resize(320, 210, 8000);
    env.frame(8050); rgb(showcase, [91.4, 196, 60]);
    env.resize(0, 210, 8100); assert.equal(env.queued.size, 0);
    env.resize(320, 210, 12000); env.frame(12050); rgb(showcase, [94.8, 196, 60]);
  });
});

test('reduced motion from construction fixes spatial pose while colors continue', () => {
  withShowcase({ reduced: true }, (showcase, env) => {
    const head = showcase.hero.head.rotation.toArray();
    env.frame(2000); env.frame(2200);
    assert.equal(showcase.stats().tonguePhase, 'idle');
    assert.equal(showcase.hero.group.rotation.y, -0.85);
    assert.deepEqual(showcase.hero.head.rotation.toArray(), head);
    assert.notDeepEqual(showcase.stats().colorRgb, [88 / 255, 196 / 255, 60 / 255]);
  });
});

test('enabling reduced motion immediately resets tongue, jaw, eyes and yaw without waiting for a frame', () => {
  withShowcase({}, (showcase, env) => {
    const { jaw, mouth, eyes } = showcase.hero.actorParts;
    const rest = [jaw.position.y, mouth.scale.y, showcase.hero.head.rotation.z, ...eyes.map(eye => eye.rotation.y)];
    env.frame(2000); env.frame(2300);
    assert.equal(showcase.stats().tonguePhase, 'hold');
    assert.notEqual(jaw.position.y, rest[0]);
    env.reduce(true, 2300);
    assert.equal(showcase.stats().tonguePhase, 'idle');
    assert.equal(showcase.hero.group.rotation.y, -0.85);
    assert.deepEqual([jaw.position.y, mouth.scale.y, showcase.hero.head.rotation.z, ...eyes.map(eye => eye.rotation.y)], rest);
    env.reduce(false, 2400); env.frame(8300);
    assert.equal(showcase.stats().tonguePhase, 'idle');
  });
});

test('disposal removes every observer and listener, and later notifications stay inert', () => {
  withShowcase({}, (showcase, env) => {
    const notifications = [
      ...[...env.document.listeners.values()].flatMap(set => [...set]),
      ...[...env.media.listeners.values()].flatMap(set => [...set]),
      ...[...env.canvas.listeners.values()].flatMap(set => [...set]),
      ...env.observers.map(observer => observer.callback),
    ];
    showcase.dispose(); showcase.dispose();
    const count = env.renderer.renders;
    for (const notify of notifications) notify(new Event('change'));
    assert.equal(env.queued.size, 0);
    assert.equal(env.renderer.renders, count);
    assert.equal(env.renderer.disposals, 1);
    assert.equal(env.canvas.removed, true);
    assert.equal(env.document.count() + env.media.count() + env.canvas.count(), 0);
    assert.ok(env.observers.every(observer => !observer.connected));
  });
});

for (const failAt of ['resize', 'render']) {
  test(`construction ${failAt} failure releases model, shadow, renderer and installed observers`, () => {
    const env = harness({ failAt });
    const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
    const originalMaterialDispose = THREE.Material.prototype.dispose;
    const originalTextureDispose = THREE.Texture.prototype.dispose;
    const disposed = new Map();
    const record = function () { disposed.set(this, (disposed.get(this) || 0) + 1); };
    THREE.BufferGeometry.prototype.dispose = record;
    THREE.Material.prototype.dispose = record;
    THREE.Texture.prototype.dispose = record;
    try {
      assert.throws(() => env.create(), /failed/);
      assert.equal(env.renderer.disposals, 1);
      assert.equal(env.canvas.removed, true);
      assert.equal(env.queued.size, 0);
      assert.equal(env.document.count() + env.media.count() + env.canvas.count(), 0);
      assert.ok(env.observers.every(observer => !observer.connected));
      assert.ok([...disposed.keys()].filter(resource => resource.isBufferGeometry).length > 10);
      assert.ok([...disposed.keys()].filter(resource => resource.isTexture).length >= 2);
      assert.ok([...disposed.values()].every(count => count === 1));
    } finally {
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
      THREE.Material.prototype.dispose = originalMaterialDispose;
      THREE.Texture.prototype.dispose = originalTextureDispose;
      env.restore();
    }
  });
}

test('failure to attach the home tongue preserves borrowed materials and the color loop', () => {
  const env = harness();
  const originalAdd = THREE.Object3D.prototype.add;
  const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
  const originalMaterialDispose = THREE.Material.prototype.dispose;
  let failedGeometry;
  let borrowed;
  let geometryDisposals = 0;
  let borrowedDisposals = 0;
  THREE.Object3D.prototype.add = function (...objects) {
    if (objects.some(object => object.name === 'showcase-tongue')) {
      failedGeometry = objects[0].geometry;
      borrowed = objects[0].material;
      throw Error('home tongue attachment failed');
    }
    return originalAdd.apply(this, objects);
  };
  THREE.BufferGeometry.prototype.dispose = function () {
    if (this === failedGeometry) geometryDisposals++;
    return originalGeometryDispose.call(this);
  };
  THREE.Material.prototype.dispose = function () {
    if (this === borrowed) borrowedDisposals++;
    return originalMaterialDispose.call(this);
  };
  let showcase;
  try {
    showcase = env.create();
    assert.ok(failedGeometry);
    assert.equal(geometryDisposals, 1);
    assert.equal(borrowedDisposals, 0);
    assert.equal(showcase.hero.head.getObjectByName('showcase-tongue'), undefined);
    env.frame(500); rgb(showcase, [122, 196, 60]);
    showcase.dispose();
    assert.equal(geometryDisposals, 1);
    assert.equal(borrowedDisposals, 1);
  } finally {
    showcase?.dispose();
    THREE.Object3D.prototype.add = originalAdd;
    THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
    THREE.Material.prototype.dispose = originalMaterialDispose;
    env.restore();
  }
});

function assertInsideFrame(scene, camera, width, height) {
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const modelView = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  scene.traverseVisible(object => {
    if (!object.isMesh || object.rotation.x === -Math.PI / 2) return;
    const vertices = object.geometry.attributes.position;
    const normals = object.geometry.attributes.normal;
    const thickness = object.material.uniforms?.uThick?.value ?? 0;
    modelView.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    normalMatrix.getNormalMatrix(modelView);
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(modelView);
      if (thickness) {
        normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
        point.addScaledVector(normal, thickness);
      }
      point.applyMatrix4(camera.projectionMatrix);
      assert.ok(Math.abs(point.x) <= 1 - 16 / width + 1e-6, `x ${point.x} exceeds 8px margin at ${width}x${height}`);
      assert.ok(Math.abs(point.y) <= 1 - 16 / height + 1e-6, `y ${point.y} exceeds 8px margin at ${width}x${height}`);
    }
  });
}

for (const [width, height] of [[320, 210], [320, 170], [160, 210]]) {
  test(`fixed camera contains all yaw and tongue phases with 8px margin in ${width}x${height}`, () => {
    withShowcase({ width, height }, (showcase, env) => {
      const camera = env.renderer.camera;
      const cameraPosition = camera.position.clone();
      for (const ms of [0, 2000, 2075, 2150, 2225, 2300, 2380, 2565, 2750, 2825, 2900]) {
        env.frame(ms);
        for (const yaw of [-1.2, -1.025, -0.85, -0.675, -0.5]) {
          showcase.hero.group.rotation.y = yaw;
          assertInsideFrame(env.renderer.scene, camera, width, height);
        }
        assert.deepEqual(camera.position, cameraPosition);
      }
    });
  });
}
