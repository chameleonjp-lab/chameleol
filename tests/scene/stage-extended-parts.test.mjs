import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStreetAccents } from '../../src/presentation/street-accents.js';
import { createActorReactions } from '../../src/presentation/actor-reactions.js';
import { createPresentationScope } from '../../src/presentation/scope.js';
import { createChameleon, createFerret } from '../../src/scene/characters.js';
import { streetCamera, streetSlots, frameInfoFor, VIEWPORTS } from '../presentation/street-fixture.mjs';

// C の部品（街の5案・警察の追加動作）を、舞台が使う口で確かめる。立体の舞台そのものは tests/e2e/extended-stage.e2e.mjs。
const context = new Proxy({}, { get: (target, key) => (key in target ? target[key] : (key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (target, key, value) => { target[key] = value; return true; } });
globalThis.document = { createElement: () => ({ getContext: () => context, width: 0, height: 0 }) };
const { composePlacements, NO_PLACEMENTS } = await import('../../src/scene/stage.js');

const view = (over = {}) => ({ t: 20000, building: 5, phase: 'grace', policeStage: 1, running: true, ...over });
function accentsFor(key, mode) {
  const v = VIEWPORTS[key];
  const camera = streetCamera(v.width, v.height, 40);
  const scene = new THREE.Scene();
  const accents = createStreetAccents({ scene, camera, slots: streetSlots(5), atlas: new THREE.Texture(), mode, seed: 1 });
  return { accents, scene, info: frameInfoFor(key) };
}
const calls = (accents) => { const original = accents.placements; const log = []; accents.placements = (...args) => { log.push(args); return original(...args); }; return log; };

test('composePlacements: an undrawable frame never asks the accents and places nothing; policeSettled is not reported', () => {
  assert.equal(typeof composePlacements, 'function');
  const { accents, info } = accentsFor('402x700', 'extended96');
  const log = calls(accents);
  assert.deepEqual(composePlacements({ drawable: false, accents, view: view(), info, policeSettled: true }), NO_PLACEMENTS);
  assert.equal(log.length, 0, 'the part is not consulted when nothing can be drawn');
  accents.dispose();
});

test('composePlacements: with the real extended accents the placeable stories come from the part and policeSettled from the stage', () => {
  const { accents, info } = accentsFor('402x700', 'extended96');
  const placed = composePlacements({ drawable: true, accents, view: view(), info, policeSettled: true });
  assert.equal(placed.railway, true);
  assert.equal(placed.policeSettled, true);
  assert.equal(typeof placed.existing, 'object');
  assert.deepEqual(Object.keys(placed).sort(), ['bird', 'existing', 'midpoint', 'policeSettled', 'railway', 'robot', 'water']);
  for (const key of ['railway', 'water', 'robot', 'bird', 'midpoint', 'policeSettled']) assert.equal(typeof placed[key], 'boolean');
  assert.equal(composePlacements({ drawable: true, accents, view: view(), info, policeSettled: false }).policeSettled, false);
  assert.equal(composePlacements({ drawable: true, accents, view: view(), info, policeSettled: undefined }).policeSettled, false, 'never a non-boolean');
  // 置くのは grace の間だけ（部品の決まり）。他の段階では配置不可
  const outside = composePlacements({ drawable: true, accents, view: view({ phase: 'eval' }), info, policeSettled: true });
  assert.deepEqual([outside.railway, outside.water, outside.robot, outside.bird], [false, false, false, false]);
  accents.dispose();
});

test('composePlacements: the legacy80 accents place none of the new stories, so nothing new is ever chosen', () => {
  const { accents, info } = accentsFor('402x700', 'legacy80');
  const placed = composePlacements({ drawable: true, accents, view: view(), info, policeSettled: true });
  assert.deepEqual([placed.railway, placed.water, placed.robot, placed.bird, placed.midpoint], [false, false, false, false, false]);
  accents.dispose();
});

test('composePlacements: no accents (effects off) or no frame facts place nothing', () => {
  assert.deepEqual(composePlacements({ drawable: true, accents: null, view: view(), info: null, policeSettled: false }), { ...NO_PLACEMENTS, existing: {} });
  const { accents } = accentsFor('402x700', 'extended96');
  assert.equal(composePlacements({ drawable: true, accents, view: view(), info: null, policeSettled: false }).railway, false);
  accents.dispose();
});

test('extended accents draw only what the controller offers: a null cameo draws no story and no background group', () => {
  const { accents, info } = accentsFor('402x700', 'extended96');
  for (let t = 20000; t < 24000; t += 100) {
    accents.tick(view({ t }), { cameo: null, policeExtra: null, actors: info });
    const stats = accents.stats();
    assert.equal(stats.storySprites, 0);
    assert.equal(stats.backgroundGroups, 0);
  }
  accents.tick(view({ t: 24000 }), { cameo: { id: 20, startedAt: 23500, elapsedMs: 500, durationMs: 2000, building: 5, phase: 'story' }, policeExtra: null, actors: info });
  assert.ok(accents.stats().storySprites >= 1 && accents.stats().storySprites <= 3);
  accents.tick(view({ t: 24016 }), { cameo: null, policeExtra: null, actors: info });
  assert.equal(accents.stats().storySprites, 0, 'when the controller drops it, the picture is gone at once (no fallback)');
  accents.dispose();
});

test('police extra: the real reactions return dx while running, hold the same dx while paused, and 0 after the controller cancels', () => {
  const hero = createChameleon(); const ferret = createFerret();
  const scope = createPresentationScope({ id: 'probe', kind: 'game' });
  const reactions = createActorReactions({ hero, police: [ferret], scope });
  try {
    assert.equal(typeof reactions.busy, 'function');
    assert.deepEqual(reactions.busy(), { hero: false, police: false });
    const extra = { id: 34, kind: 'inquiry', startedAt: 0, elapsedMs: 700, durationMs: 1200, building: 5, phase: 'investigate' };
    const running = view({ running: true });
    ferret.animate(0.016, { walking: false });
    reactions.tick(running);
    const { dx } = reactions.applyPoliceExtra(extra, running);
    assert.ok(dx < -0.5, `the officer slides (${dx})`);
    const poseWhileRunning = ferret.actorParts.head.rotation.y;
    // 停止中：姿勢へ二度は書かず、同じ dx を返す
    const paused = reactions.applyPoliceExtra(extra, view({ running: false }));
    assert.equal(paused.dx, dx);
    assert.equal(ferret.actorParts.head.rotation.y, poseWhileRunning);
    // 取消：次のフレームの基本の動きの前に姿勢が戻り、補正は0
    assert.deepEqual(reactions.applyPoliceExtra(null, running), { dx: 0 });
    ferret.animate(0.016, { walking: false });
    reactions.tick(running);
    for (let i = 0; i < 5; i++) { ferret.animate(0.016, { walking: false }); reactions.tick(running); reactions.applyPoliceExtra(null, running); }
    assert.equal(reactions.applyPoliceExtra(null, running).dx, 0);
  } finally { scope.dispose(); hero.dispose(); ferret.dispose?.(); }
});
