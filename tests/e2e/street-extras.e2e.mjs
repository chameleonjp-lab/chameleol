// CL04 (C) parts check on the real street: the real stage draws the street, hero and police, and the
// extended96 accents are added to the same scene by hand. This does not use the stage's own extended
// path (that belongs to the stage owner); it proves the pictures against real wall fronts and camera.
// Set CL04_EVIDENCE_DIR to also write the frames as PNG files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {launch, openHome} from './helpers.mjs';

const LAYOUTS = [{key: '402x700', width: 402, height: 700}, {key: '402x874', width: 402, height: 874}, {key: '874x402', width: 874, height: 402}];
const OUT = process.env.CL04_EVIDENCE_DIR;
const save = (name, dataUrl) => { if (!OUT) return; mkdirSync(OUT, {recursive: true}); writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64')); };

// Everything below runs in the page. It returns plain data.
async function rig(page, {building}) {
  return page.evaluate(async ({building}) => {
    const THREE = await import('three');
    if (!THREE.WebGLRenderer.prototype.__cl04) {
      // The stage keeps its renderer, scene and camera private. Observe their creation instead of
      // changing the stage: the renderer announces itself when the stage sets its colour space, and the
      // scene when the camera is added to it.
      const d = Object.getOwnPropertyDescriptor(THREE.WebGLRenderer.prototype, 'outputColorSpace');
      Object.defineProperty(THREE.WebGLRenderer.prototype, 'outputColorSpace', {...d, set(v) { window.__renderer = this; d.set.call(this, v); }});
      const add = THREE.Object3D.prototype.add;
      THREE.Object3D.prototype.add = function (...objects) { if (this.isScene && objects.some(o => o.isCamera)) { window.__scene = this; window.__camera = objects.find(o => o.isCamera); } return add.apply(this, objects); };
      THREE.WebGLRenderer.prototype.__cl04 = true;
    }
    const app = __kamereoru;
    await app.debugStart({atMs: (building - 1) * 5000, seed: 1, effects: true});
    const {readPlayView} = await import('/src/presentation/events.js');
    const base = readPlayView(app.session, 0, {});
    app.stage.update({t: base.t, color: base.color, policeStage: 1, walking: true, presentation: {...base, running: true, phase: 'grace'}});
    const scene = window.__scene, camera = window.__camera, renderer = window.__renderer;
    scene.traverse(o => { if (o.name === 'street-accents') o.visible = false; });   // hide the legacy director's group
    const slots = [];
    scene.traverse(o => {
      if (o.name !== 'wall' || !o.isMesh) return;
      slots.push({index: Math.round((o.position.x - 5) / 10) + 1, cx: o.position.x, width: o.scale.x, height: o.scale.y, deco: {kind: 'house', windows: 0}, group: o.parent});
    });
    const {createStreetAccents} = await import('/src/presentation/street-accents.js');
    const atlas = await new THREE.TextureLoader().loadAsync('/src/presentation/assets/atlas.webp');
    const accents = createStreetAccents({scene, camera, slots, atlas, mode: 'extended96', seed: 1});
    let group = null;
    scene.traverse(o => { if (o.name === 'street-accents' && o.visible) group = o; });
    window.__rig = {THREE, app, scene, camera, renderer, accents, slots, base, building, readPlayView, group};
    const canvas = renderer.domElement, rect = canvas.getBoundingClientRect(), hud = document.querySelector('.hud')?.getBoundingClientRect();
    return {width: rect.width, height: rect.height, hudBottom: hud ? hud.bottom - rect.top : 76, slots: slots.map(s => ({index: s.index, height: s.height}))};
  }, {building});
}

// One frame: stage frame (hero, police, camera), then the accents for this controller state, then a render.
async function frame(page, {ms, cameo = null, policeStage = 1, policeExtra = null, phase = 'grace', t: tOverride = null, skipActors = false}) {
  return page.evaluate(({ms, cameo, policeStage, policeExtra, phase, tOverride, skipActors}) => {
    const {THREE, app, camera, renderer, accents, base, building} = window.__rig;
    const t = tOverride ?? ((building - 1) * 5000 + ms);
    const view = {...base, t, building, phase, running: true, policeStage};
    app.stage.update({t, color: base.color, policeStage, walking: true, presentation: view});
    const canvas = renderer.domElement, rect = canvas.getBoundingClientRect(), hud = document.querySelector('.hud')?.getBoundingClientRect();
    const playerX = (t / 5000) * 10, v = new THREE.Vector3();
    const sx = (x, y, z) => { v.set(x, y, z).project(camera); return (v.x + 1) / 2 * rect.width; };
    camera.updateMatrixWorld();
    const actors = skipActors ? null : {viewport: {width: rect.width, height: rect.height}, hudBottom: hud ? hud.bottom - rect.top : 76, heroX: sx(playerX, 1.5, 2.5), policeX: [sx(playerX - 2.9, 1.5, 2.7), sx(playerX - 4.4, 1.5, 1.95)], policeVisible: [policeStage > 0, policeStage > 1]};
    accents.tick(view, {cameo, policeExtra, actors});
    renderer.render(window.__rig.scene, camera);
    return {heroX: actors?.heroX ?? null, stats: accents.stats(), image: canvas.toDataURL('image/png'), actors, placements: accents.placements(view, actors ?? {viewport: {width: rect.width, height: rect.height}})};
  }, {ms, cameo, policeStage, policeExtra, phase, tOverride, skipActors});
}

const story = (id, ms, extra = {}) => ({id, startedAt: 0, elapsedMs: ms, durationMs: id === 56 ? 1500 : 2000, building: 5, phase: id === 56 ? 'delivery' : 'story', ...extra});
const check = page => page.evaluate(() => { const r = window.__rig.app.stage.checkComparisonSurfaces(); return {wallPixels: r.wallPixels, wallMismatches: r.wallMismatches, bodyPixels: r.bodyPixels, bodyMismatches: r.bodyMismatches}; });

for (const layout of LAYOUTS) {
  test(`E020/E067/E068/E069 on the real street at ${layout.key}: placed pictures leave every comparison pixel untouched`, async (t) => {
    const env = await launch({width: layout.width, height: layout.height});
    try {
      await openHome(env.page, env.url);
      const info = await rig(env.page, {building: 5});
      const probe = await frame(env.page, {ms: 0});
      // The hero stands at the left of the building at the start of grace, about 38% across the canvas.
      assert.ok(Math.abs(probe.heroX - info.width * 0.38) < 3, `hero x ${probe.heroX} of ${info.width}`);
      const results = {};
      for (const [id, name] of [[20, 'E020'], [67, 'E067'], [68, 'E068'], [69, 'E069']]) {
        const where = (await frame(env.page, {ms: 0})).placements;
        const placed = {20: where.railway, 67: where.water, 68: where.robot, 69: where.bird}[id];
        results[name] = placed;
        if (id === 20 || id === 68) assert.equal(placed, true, `${name} must be placeable at ${layout.key}`);
        if (!placed) continue;
        for (const ms of [0, 500, 1000, 1500, 1900]) {
          const f = await frame(env.page, {ms, cameo: story(id, ms)});
          assert.ok(f.stats.storySprites >= 1 && f.stats.storySprites <= 3, `${name}@${ms} drew ${f.stats.storySprites}`);
          save(`${layout.key}-${name}-${String(ms).padStart(4, '0')}.png`, f.image);
          const c = await check(env.page);
          // Hiding the whole group must not change a single wall pixel: the pictures never cover a wall front.
          await env.page.evaluate(() => { window.__rig.group.visible = false; });
          const without = await check(env.page);
          await env.page.evaluate(() => { window.__rig.group.visible = true; });
          assert.equal(c.wallPixels, without.wallPixels, `${name}@${ms} wall pixels with/without the pictures`);
          // The pictures add no mismatch of their own (the bare stage may have an edge pixel of its own).
          assert.ok(c.wallMismatches <= without.wallMismatches, `${name}@${ms} wall mismatches ${c.wallMismatches} vs bare ${without.wallMismatches}`);
          assert.ok(c.bodyMismatches <= without.bodyMismatches, `${name}@${ms} body mismatches ${c.bodyMismatches} vs bare ${without.bodyMismatches}`);
        }
      }
      t.diagnostic(`${layout.key} placed: ${JSON.stringify(results)} canvas ${info.width}x${info.height} hud ${info.hudBottom.toFixed(0)}`);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

for (const layout of LAYOUTS) {
  test(`E056 midpoint flag at ${layout.key}: delivery, static flag, wall pixels untouched`, async (t) => {
    const env = await launch({width: layout.width, height: layout.height});
    try {
      await openHome(env.page, env.url);
      await rig(env.page, {building: 26});
      const start = await frame(env.page, {ms: 500});
      const placed = start.placements.midpoint;
      t.diagnostic(`${layout.key} midpoint placement at t=125500: ${placed}`);
      if (placed) {
        for (const ms of [0, 500, 1100, 1400]) {
          const f = await frame(env.page, {ms, cameo: story(56, ms, {building: 25, startedAt: 125000})});
          assert.ok(f.stats.storySprites >= 1 && f.stats.storySprites <= 3);
          save(`${layout.key}-E056-${String(ms).padStart(4, '0')}.png`, f.image);
          const c = await check(env.page);
          await env.page.evaluate(() => { window.__rig.group.visible = false; });
          const without = await check(env.page);
          await env.page.evaluate(() => { window.__rig.group.visible = true; });
          assert.equal(c.wallPixels, without.wallPixels);
          assert.ok(c.wallMismatches <= without.wallMismatches && c.bodyMismatches <= without.bodyMismatches);
        }
      }
      // After the window (and for a flag that could not be delivered) only the static flag remains.
      const staticFlag = {id: 56, startedAt: 125000, elapsedMs: 0, phase: 'static', building: 25, durationMs: 0};
      const after = await frame(env.page, {ms: 1700, cameo: staticFlag});
      assert.equal(after.stats.storySprites, 0);
      save(`${layout.key}-E056-static.png`, after.image);
      const c = await check(env.page);
      await env.page.evaluate(() => { window.__rig.group.visible = false; });
      const without = await check(env.page);
      assert.ok(c.wallMismatches <= without.wallMismatches && c.bodyMismatches <= without.bodyMismatches);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}
