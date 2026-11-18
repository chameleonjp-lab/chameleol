// CL04 (C) parts check on the real street: the real stage draws the street, hero and police, and the
// extended96 accents are added to the same scene by hand. This does not use the stage's own extended
// path (that belongs to the stage owner); it proves the pictures against real wall fronts and camera.
// Set CL04_EVIDENCE_DIR to also write the frames as PNG files.
import { MESSAGES } from '../../src/i18n/messages/index.js';
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

test('E034 / E039 police poses render with the real actors (pose sheet, no page errors)', async () => {
  const env = await launch({width: 402, height: 700});
  try {
    await openHome(env.page, env.url);
    const frames = await env.page.evaluate(async () => {
      const THREE = await import('three');
      THREE.ColorManagement.enabled = false;
      const {createChameleon, createFerret} = await import('/src/scene/characters.js');
      const {createActorReactions} = await import('/src/presentation/actor-reactions.js');
      const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, preserveDrawingBuffer: true, stencil: true});
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.setSize(300, 230, false);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x8fa3b8);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), new THREE.MeshBasicMaterial({color: 0x5b5d66}));
      ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0.22, 2.5); scene.add(ground);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 10), new THREE.MeshBasicMaterial({color: 0xe66cf0}));
      wall.position.set(0, 5.2, 0); scene.add(wall);
      const hero = createChameleon(), ferret = createFerret();
      hero.group.position.set(0, 0.22, 2.5); scene.add(hero.group);
      ferret.group.scale.setScalar(0.9); ferret.group.rotation.y = -0.36; scene.add(ferret.group);
      const reactions = createActorReactions({hero, police: [ferret]});
      const camera = new THREE.PerspectiveCamera(40, 300 / 230, 0.5, 100);
      camera.position.set(-1.6, 3.6, 12); camera.lookAt(-1.6, 2.1, 0);
      const baseX = -2.9;
      const out = {inquiry: [], footprints: []};
      for (const kind of ['inquiry', 'footprints']) {
        const duration = kind === 'inquiry' ? 1200 : 1500;
        for (const ms of kind === 'inquiry' ? [0, 300, 450, 700, 1000, 1150] : [0, 300, 600, 900, 1200, 1400]) {
          for (let i = 0; i < 4; i++) { hero.animate(0.016, {walking: true}); ferret.animate(0.016, {walking: true, mode: 'run'}); }
          const view = {playId: 'p', t: 30000 + ms, running: true, phase: 'grace', policeStage: 1, combo: 0, passed: 3, building: 7, matchState: null, lastEvalSuccess: false};
          reactions.tick(view);
          const {dx} = reactions.applyPoliceExtra({id: kind === 'inquiry' ? 34 : 39, kind, startedAt: 30000, elapsedMs: ms, durationMs: duration, building: 7, phase: 'investigate'}, view);
          ferret.group.position.set(baseX + dx, 0.22, 2.7);
          renderer.render(scene, camera);
          out[kind].push({ms, dx, image: renderer.domElement.toDataURL('image/png')});
        }
      }
      reactions.dispose(); hero.dispose(); ferret.dispose(); renderer.dispose();
      return out;
    });
    for (const kind of ['inquiry', 'footprints']) {
      assert.equal(frames[kind].length, 6);
      frames[kind].forEach(f => save(`police-${kind}-${String(f.ms).padStart(4, '0')}.png`, f.image));
      assert.ok(frames[kind].some(f => f.dx < -0.5), `${kind} shifts the officer`);
      assert.ok(Math.abs(frames[kind][0].dx) < 1e-9);
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('street atlas: the 61 existing cells decode to exactly the pixels of the first sheet, new cells have art', async () => {
  const env = await launch({width: 402, height: 700});
  try {
    await openHome(env.page, env.url);
    const r = await env.page.evaluate(async () => {
      const load = async url => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0); return {w: c.width, h: c.height, g}; };
      const base = await load('/scripts/street-atlas-v1-base.webp'), now = await load('/src/presentation/assets/atlas.webp');
      let worst = 0, differing = 0;
      for (let i = 0; i < 61; i++) {
        const x = (i % 8) * 128, y = Math.floor(i / 8) * 128;
        const a = base.g.getImageData(x, y, 128, 128).data, b = now.g.getImageData(x, y, 128, 128).data;
        let cell = 0;
        for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); if (d > cell) cell = d; }
        if (cell) differing++;
        worst = Math.max(worst, cell);
      }
      const opaque = [];
      for (let i = 61; i < 80; i++) {
        const x = (i % 8) * 128, y = Math.floor(i / 8) * 128, d = now.g.getImageData(x, y, 128, 128).data;
        let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 200) n++;
        opaque.push(n);
      }
      return {base: [base.w, base.h], now: [now.w, now.h], worst, differing, opaque};
    });
    assert.deepEqual(r.base, [1024, 1024]);
    assert.deepEqual(r.now, [1024, 1536]);
    assert.equal(r.differing, 0, `61 cells: ${r.differing} differ, worst channel difference ${r.worst}`);
    assert.ok(r.opaque.every(n => n > 400), `every new cell has opaque art ${r.opaque}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

for (const layout of LAYOUTS) {
  test(`near-perfect badge at ${layout.key}: batch-less evaluation, real CSS, hidden for guide and warning`, async () => {
    const env = await launch({width: layout.width, height: layout.height});
    try {
      await openHome(env.page, env.url);
      await env.page.evaluate(async () => {
        await __kamereoru.debugStart({atMs: 2000, seed: 1, effects: true});
        const {mountBonusPresentation} = await import('/src/presentation/bonus-view.js');
        const {createPresentationScope} = await import('/src/presentation/scope.js');
        const host = document.querySelector('.stage-wrap');
        document.querySelectorAll('.cover,.pause-overlay').forEach(c => { c.style.display = 'none'; });   // the restore dialog only hides the street for this check
        const {t} = await import('/src/i18n/i18n.js');
        window.__badge = mountBonusPresentation({host, scope: createPresentationScope({id: 'cl04-badge', kind: 'game'}), t});
      });
      const wrap = env.page.locator('.stage-wrap');
      const probe = ms => env.page.evaluate((ms) => {
        const v = window.__badge, card = v.element, host = card.parentElement.getBoundingClientRect(), r = card.getBoundingClientRect();
        const cs = getComputedStyle(card), title = getComputedStyle(card.querySelector('.bonus-card-title'));
        return {hidden: card.hidden, badgeOnly: card.classList.contains('is-badge-only'), text: card.querySelector('.bonus-card-badge')?.textContent ?? null, titleDisplay: title.display, opacity: Number(cs.opacity), left: r.left - host.left, right: host.right - r.right, top: r.top - host.top, width: r.width, wrapWidth: host.width};
      }, ms);
      const set = (args) => env.page.evaluate((args) => window.__badge.tick({phase: 'eval', running: true, ...args}), args);
      for (const ms of [0, 150, 700, 1250, 1380]) {
        await set({activeMs: 2000 + ms, precisionBadge: {id: 'p', kind: 'nearPerfect', building: 1, startedAt: 2000, phase: 'notice', elapsedMs: ms}});
        const p = await probe(ms);
        assert.equal(p.hidden, false, `visible at +${ms}`);
        assert.equal(p.badgeOnly, true);
        assert.equal(p.text, `◎ ${MESSAGES.ja['presentation.nearPerfect']}`);
        assert.equal(p.titleDisplay, 'none', 'the title/points/rows are hidden by the integrated CSS');
        assert.ok(Math.abs(p.left - p.right) <= 2, `centred: ${p.left} ${p.right}`);
        assert.ok(p.width < p.wrapWidth - 20);
        if (ms === 700 || ms === 150) await wrap.screenshot({path: OUT ? join(OUT, `badge-${layout.key}-${ms}.png`) : undefined});
      }
      await set({activeMs: 3400, precisionBadge: null});
      assert.equal((await probe(1400)).hidden, true);
      // Guide and warning values hide it (the application also hands null in those cases).
      await set({activeMs: 2300, guideActive: true, precisionBadge: {kind: 'nearPerfect', elapsedMs: 300}});
      assert.equal((await probe(300)).hidden, true);
      await set({activeMs: 2300, warningActive: true, precisionBadge: {kind: 'nearPerfect', elapsedMs: 300}});
      assert.equal((await probe(300)).hidden, true);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}
