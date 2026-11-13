// ホーム専用の表示。色・姿勢・巻きベロは一つの表示時計と描画予約を使う。
import * as THREE from 'three';
import { createChameleon } from './chameleon28.js';
import { createVisiblePresentationClock } from './presentation-clock.js';
import { createHomeIdleMotion } from './showcase-motion.js';
import { createShowcaseTongue } from './showcase-tongue.js';

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

// Bounds are computed at construction/resize, never during the animation loop.
function visibleLocalBox(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  root.traverseVisible(object => {
    if (!object.geometry) return;
    object.geometry.computeBoundingBox();
    box.union(object.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
  });
  return box;
}

function boxCorners(box) {
  const corners = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  return corners;
}

function presentationEnvelope(hero, tongue) {
  const envelope = visibleLocalBox(hero.group);
  const headBox = visibleLocalBox(hero.head);
  if (tongue) headBox.union(tongue.getLocalEnvelope(new THREE.Box3()));
  // Eye pivots can turn by .18rad; cover their full orbit before bounding the head tilt.
  for (const eye of hero.actorParts.eyes) {
    const eyeBox = visibleLocalBox(eye);
    const radius = Math.max(...boxCorners(eyeBox).map(point => point.length()));
    eyeBox.expandByScalar(2 * Math.sin(0.18 / 2) * radius);
    eye.updateMatrix();
    headBox.union(eyeBox.applyMatrix4(eye.matrix));
  }
  const radius = Math.max(...boxCorners(headBox).map(point => point.length()));
  headBox.expandByScalar(2 * Math.sin(0.04 / 2) * radius + 0.05);
  hero.group.updateWorldMatrix(true, true);
  headBox.applyMatrix4(hero.group.matrixWorld.clone().invert().multiply(hero.head.matrixWorld));
  envelope.union(headBox);
  // The extrema of x*cos(yaw)+z*sin(yaw) and -x*sin(yaw)+z*cos(yaw)
  // occur at endpoints or stationary angles. This covers the whole continuous yaw range.
  const rotated = new THREE.Box3();
  for (const point of boxCorners(envelope)) {
    const candidates = [-1.2, -0.5];
    for (const angle of [Math.atan2(point.z, point.x), Math.atan2(-point.x, point.z)]) {
      for (let turn = -2; turn <= 2; turn++) {
        const yaw = angle + turn * Math.PI;
        if (yaw >= -1.2 && yaw <= -0.5) candidates.push(yaw);
      }
    }
    for (const yaw of candidates) {
      rotated.expandByPoint(new THREE.Vector3(point.x * Math.cos(yaw) + point.z * Math.sin(yaw), point.y, -point.x * Math.sin(yaw) + point.z * Math.cos(yaw)));
    }
  }
  return rotated;
}

/** The optional dependencies let tests exercise the real model without a WebGL context. */
export function createShowcase(container, {
  now = () => performance.now(),
  random = Math.random,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
  rendererFactory = options => new THREE.WebGLRenderer(options),
} = {}) {
  let renderer, hero, tongue, shadowTexture, shadowGeometry, shadowMaterial, observer, media;
  let alive = true;
  let contextLost = false;
  let zeroSize = true;
  let pendingFrame = null;
  let generation = 0;
  let renderCount = 0;
  let envelope;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const clock = createVisiblePresentationClock({ now });
  let motion;
  const frame = { colorRgb: new Float64Array(3), tonguePhase: 'idle', tonguePhaseMs: 0, extension: 0, unroll: 0, mouthOpen: 0, gazeWeight: 0, headTilt: 0, yaw: -0.85 };
  const stopped = () => document.hidden || contextLost || zeroSize;
  const cancelPending = () => {
    generation++;
    if (pendingFrame !== null) cancelFrame(pendingFrame);
    pendingFrame = null;
  };
  const schedule = () => {
    if (!alive || stopped() || pendingFrame !== null) return;
    const scheduledGeneration = generation;
    const id = requestFrame(() => {
      if (!alive || scheduledGeneration !== generation || pendingFrame !== id) return;
      pendingFrame = null;
      try { draw(); schedule(); } catch { dispose(); }
    });
    pendingFrame = id;
  };
  const pose = (elapsed, dt) => {
    motion.sample(elapsed, frame);
    hero.setColor(frame.colorRgb);
    hero.animate(Math.min(0.1, dt), { walking: false });
    tongue?.apply(frame);
    hero.group.rotation.y = frame.yaw;
  };
  const draw = () => {
    if (!alive || stopped()) return;
    const { elapsed, dt } = clock(now(), false);
    pose(elapsed, dt);
    renderer.render(scene, camera);
    renderCount++;
  };
  const reconcile = () => {
    if (!alive) return;
    clock(now(), stopped());
    cancelPending();
    schedule();
  };
  const onContextLost = event => {
    if (!alive) return;
    event.preventDefault();
    contextLost = true;
    reconcile();
  };
  const onContextRestored = () => {
    if (!alive) return;
    contextLost = false;
    reconcile();
  };
  const onReducedMotion = () => {
    if (!alive) return;
    const { elapsed } = clock(now(), stopped());
    motion.setReducedMotion(media.matches, elapsed);
    tongue?.reset();
    pose(elapsed, 0);
    if (!stopped()) { renderer.render(scene, camera); renderCount++; }
  };
  const resize = () => {
    if (!alive) return;
    const { width, height } = container.getBoundingClientRect();
    zeroSize = !(width > 0 && height > 0);
    if (!zeroSize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const center = envelope.getCenter(new THREE.Vector3());
      const extent = envelope.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const availableX = Math.max(0.01, 1 - 16 / width);
      const availableY = Math.max(0.01, 1 - 16 / height);
      const distance = envelope.max.z + Math.max(extent.x / (tangent * camera.aspect * availableX), extent.y / (tangent * availableY)) + 0.01;
      camera.position.set(center.x, center.y, distance);
      camera.lookAt(center.x, center.y, 0);
      camera.far = Math.max(100, distance + 20);
      camera.updateProjectionMatrix();
    }
    reconcile();
  };
  const dispose = () => {
    if (!alive) return;
    alive = false;
    cancelPending();
    document.removeEventListener('visibilitychange', reconcile);
    renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
    renderer?.domElement.removeEventListener('webglcontextrestored', onContextRestored);
    media?.removeEventListener('change', onReducedMotion);
    observer?.disconnect();
    clock.dispose();
    motion?.dispose();
    tongue?.dispose();
    hero?.dispose();
    shadowGeometry?.dispose();
    shadowMaterial?.dispose();
    shadowTexture?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
  };
  try {
    renderer = rendererFactory({ antialias: true, alpha: true });
    THREE.ColorManagement.enabled = false;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    renderer.domElement.className = 'showcase-canvas';
    container.append(renderer.domElement);
    hero = createChameleon();
    hero.jewel.visible = true;
    scene.add(hero.group);
    // A failed home-only attachment must leave the model and color loop usable.
    try { tongue = createShowcaseTongue(hero); } catch { tongue = null; }
    envelope = presentationEnvelope(hero, tongue);
    shadowTexture = radialTexture();
    shadowGeometry = new THREE.CircleGeometry(1.5, 24);
    shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    scene.add(shadow);
    media = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)');
    motion = createHomeIdleMotion({ random, reducedMotion: media?.matches ?? false });
    pose(0, 0);
    document.addEventListener('visibilitychange', reconcile);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
    media?.addEventListener('change', onReducedMotion);
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    }
    resize();
    draw();
  } catch (error) { dispose(); throw error; }
  return {
    hero, resize, dispose,
    stats: () => ({
      active: alive && !stopped(), renderCount, pendingFrames: pendingFrame === null ? 0 : 1,
      colorRgb: Array.from(frame.colorRgb), tonguePhase: frame.tonguePhase,
      drawCalls: renderer.info?.render?.calls ?? 0,
      geometries: renderer.info?.memory?.geometries ?? 0,
      textures: renderer.info?.memory?.textures ?? 0,
    }),
  };
}
