import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const asset = name => fileURLToPath(new URL(`../../src/presentation/assets/${name}`, import.meta.url));

function webpSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return {kind, width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1};
  }
  if (kind === 'VP8X') return {kind, width: (b.readUIntLE(24, 3)) + 1, height: (b.readUIntLE(27, 3)) + 1};
  return {kind, width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff};
}

test('street atlas grows to 8x12 and keeps the 61 existing cells at their indexes', () => {
  const atlas = JSON.parse(readFileSync(asset('atlas.json'), 'utf8'));
  assert.equal(atlas.columns, 8);
  assert.equal(atlas.rows, 12);
  assert.equal(atlas.height, 1536);
  const names = Object.keys(atlas.street);
  assert.equal(names.length, 80);
  names.forEach((name, i) => assert.equal(atlas.street[name].index, i, name));
  assert.equal(atlas.street.pavement0.index, 0);
  assert.equal(atlas.street.residentFace.index, 60);
  assert.deepEqual(names.slice(61), ['crossingPost', 'crossingPostLit', 'crossingArm', 'tram', 'droneA', 'droneB', 'midFlag', 'gutterWaterA', 'gutterWaterB', 'gutterSwirl', 'robotPaint', 'robotFoot', 'robotLook', 'paintStripe', 'birdCarryA', 'birdCarryB', 'parcel', 'rope', 'footprint']);
  for (const [name, cell] of Object.entries(atlas.street)) {
    assert.equal(cell.x, (cell.index % 8) * 128, name);
    assert.equal(cell.y, Math.floor(cell.index / 8) * 128, name);
  }
});

test('street atlas image is 1024x1536 and every image stays inside the budgets', () => {
  const size = webpSize(asset('atlas.webp'));
  assert.deepEqual([size.width, size.height], [1024, 1536]);
  const compressed = ['atlas.webp', 'result-atlas.webp', 'detected.webp'].reduce((n, f) => n + statSync(asset(f)).size, 0);
  assert.ok(compressed <= 1.5 * 1024 * 1024, `compressed ${compressed}`);
  // Decoded size held during play: the street atlas plus the ending comic (the result atlas belongs to another screen).
  const sizes = ['atlas.webp', 'detected.webp'].map(f => webpSize(asset(f)));
  const decoded = sizes.reduce((n, s) => n + s.width * s.height * 4, 0);
  assert.ok(decoded <= 16 * 1024 * 1024, `decoded ${decoded}`);
});

// ---------------------------------------------------------------------------------------------
// extended96 street accents
import * as THREE from 'three';
import {createStreetAccents, storyPoses} from '../../src/presentation/street-accents.js';
import {VIEWPORTS, streetCamera, streetSlots, frameInfoFor} from './street-fixture.mjs';

const plainFixture = () => ({scene: new THREE.Scene(), slots: Array.from({length: 7}, (_, i) => ({index: 40 + i, cx: (39 + i) * 10 + 5, height: 8, width: 8.7, deco: {kind: 'house', windows: 3}, group: {visible: true}})), atlas: new THREE.Texture()});
const run = (view) => ({running: true, phase: 'eval', building: 43, t: 0, ...view});
const cameoOf = (id, elapsedMs, extra = {}) => ({id, startedAt: 0, elapsedMs, durationMs: id === 56 ? 1500 : 2000, building: 43, phase: id === 56 ? 'delivery' : 'story', ...extra});
const spritesMesh = args => args.scene.children[0].children[0];

test('extended96 never asks the old director: no background without a controller cameo', () => {
  const args = plainFixture(), a = createStreetAccents({...args, seed: 10000, mode: 'extended96'});
  a.tick(run({t: 1000}), {cameo: null, policeExtra: null});
  for (let t = 2000; t < 40000; t += 4500) {
    a.tick(run({t, phase: 'grace'}), {cameo: null, policeExtra: null});
    a.tick(run({t: t + 1500, phase: 'eval'}), {cameo: null, policeExtra: null});
    assert.equal(a.stats().backgroundGroups, 0);
    assert.equal(a.stats().count, 0);
  }
  assert.equal(a.stats().mode, 'extended96');
  assert.equal(a.stats().storySprites, 0);
  a.dispose();
  // The same sequence in legacy80 does pick a cameo with this seed (the old director is still alive there).
  const legacy = plainFixture(), l = createStreetAccents({...legacy, seed: 10000});
  l.tick(run({t: 1000}));
  l.tick(run({t: 2000, phase: 'grace'}));
  assert.equal(l.stats().backgroundGroups, 1);
  assert.equal(l.stats().mode, 'legacy80');
  l.dispose();
});

test('extended96 with cameo null draws nothing and never falls back to an old drawing', () => {
  const args = plainFixture(), a = createStreetAccents({...args, seed: 10000, mode: 'extended96'});
  a.tick(run({t: 1000}), {});
  a.tick(run({t: 2000, phase: 'grace'}), {cameo: null});
  const mesh = spritesMesh(args), cameos = args.scene.children[0].children.find(m => m.name === 'street-cameos');
  assert.equal(cameos.count, 0);
  assert.equal(a.stats().backgroundGroups, 0);
  for (const name of ['crossingPost', 'crossingArm', 'tram', 'gutterWaterA', 'gutterSwirl', 'robotPaint', 'birdCarryA', 'midFlag', 'ufo', 'bus', 'cat', 'bird']) assert.ok(!a.stats().visibleArtwork.includes(name), name);
  assert.ok(mesh.count > 0, 'the normal street decorations still draw');
  a.dispose();
});

test('an old cameo id from the controller is drawn with the controller clock, not by a second director', () => {
  const args = plainFixture(), a = createStreetAccents({...args, mode: 'extended96'});
  a.tick(run({t: 1000}), {cameo: null});
  a.tick(run({t: 2500, phase: 'grace'}), {cameo: cameoOf(13, 500)});
  assert.equal(a.stats().backgroundGroups, 1);
  assert.ok(a.stats().visibleArtwork.includes('cat'));
  a.tick(run({t: 4500, phase: 'grace'}), {cameo: cameoOf(13, 2000)});
  assert.equal(a.stats().backgroundGroups, 0, 'the controller says it ended');
  a.tick(run({t: 4600, phase: 'grace'}), {cameo: null});
  assert.equal(a.stats().backgroundGroups, 0);
  assert.equal(a.stats().count, 0);
  a.dispose();
});

const names = (a) => a.stats().visibleArtwork;
function storyCase(id, ms, over = {}) {
  const args = plainFixture(), a = createStreetAccents({...args, mode: 'extended96', ...over.accents});
  a.tick(run({t: 1000}), {cameo: null});
  a.tick(run({t: 2000 + ms, phase: 'grace'}), {cameo: cameoOf(id, ms, over.cameo)});
  return {a, args};
}

test('E020 crossing: lamps, arm and tram follow the controller clock (three pictures at most)', () => {
  const at = ms => { const {a} = storyCase(20, ms); const s = a.stats(); const n = names(a).filter(x => ['crossingPost', 'crossingPostLit', 'crossingArm', 'tram'].includes(x)); a.dispose(); return {n, s}; };
  assert.deepEqual(at(100).n.sort(), ['crossingArm', 'crossingPostLit']);
  assert.deepEqual(at(1000).n.sort(), ['crossingArm', 'crossingPostLit', 'tram']);
  assert.equal(at(1000).s.storySprites, 3);
  assert.deepEqual(at(1800).n.sort(), ['crossingArm', 'crossingPostLit'].filter(() => false).concat(['crossingArm', 'crossingPost']).sort(), 'the lamps are out after 1750');
  assert.deepEqual(at(1950).n.sort(), ['crossingArm', 'crossingPost']);
  assert.equal(at(1950).s.backgroundGroups, 1);
  // Closed, then re-opened: the arm angle is raised at both ends and flat in between.
  const arm = ms => storyPoses(20, ms).find(p => p.name === 'crossingArm').rz;
  assert.ok(arm(0) > 0.5 && arm(800) === 0 && arm(1450) === 0 && arm(1990) > 0.5);
  // The lamps alternate (the picture is mirrored) every 250ms.
  const mirror = ms => storyPoses(20, ms).find(p => p.name.startsWith('crossingPost')).w < 0;
  assert.deepEqual([mirror(100), mirror(300), mirror(600)], [false, true, false]);
  // The tram crosses from the right to the left while the gate is down and is not there before 450ms or after 1450ms.
  const tram = ms => storyPoses(20, ms).find(p => p.name === 'tram')?.x;
  assert.equal(tram(400), undefined);
  assert.ok(tram(500) > tram(1000) && tram(1000) > tram(1400));
  assert.equal(tram(1500), undefined);
});

test('E067 gutter: water and swirl only (two pictures, no particles)', () => {
  for (const ms of [0, 100, 500, 1000, 1900]) {
    const {a} = storyCase(67, ms);
    const n = names(a).filter(x => x.startsWith('gutter'));
    assert.deepEqual(n.sort(), ['gutterSwirl', ms >= 200 && Math.floor((ms - 200) / 120) % 2 ? 'gutterWaterB' : 'gutterWaterA'].sort());
    assert.equal(a.stats().storySprites, 2);
    assert.ok(a.stats().ambientParticles <= 8);
    a.dispose();
  }
  const water = ms => storyPoses(67, ms).find(p => p.name.startsWith('gutterWater'));
  assert.ok(water(0).h <= 0.01 && water(250).h > 1.8, 'the water grows from the top');
  assert.ok(water(1990).w < water(1000).w, 'and thins at the end');
});

test('E068 robot: paints, paints its own foot, looks down; the paint is small', () => {
  const at = ms => { const {a} = storyCase(68, ms); const n = names(a).filter(x => x.startsWith('robot') || x === 'paintStripe'); a.dispose(); return n.sort(); };
  assert.deepEqual(at(400), ['paintStripe', 'robotPaint']);
  assert.deepEqual(at(1000), ['paintStripe', 'robotFoot']);
  assert.deepEqual(at(1800), ['paintStripe', 'robotLook']);
  const stripe = ms => storyPoses(68, ms).find(p => p.name === 'paintStripe');
  assert.ok(stripe(0) === undefined && stripe(400).w < stripe(800).w && stripe(800).w <= 0.7 + 1e-9 && stripe(1800).w <= 0.7 + 1e-9);
});

test('E069 bird: bird, parcel and rope (three), it cannot lift the parcel and comes back', () => {
  const {a} = storyCase(69, 1000);
  assert.deepEqual(names(a).filter(x => ['birdCarryA', 'birdCarryB', 'parcel', 'rope'].includes(x)).sort(), ['birdCarryB', 'parcel', 'rope']);
  assert.equal(a.stats().storySprites, 3);
  a.dispose();
  const y = (ms, name) => storyPoses(69, ms, {roof: 9}).find(p => p.name.startsWith(name)).y;
  assert.ok(y(1000, 'bird') > y(0, 'bird') + 0.7, 'lifts');
  assert.ok(y(1000, 'parcel') - y(0, 'parcel') < y(1000, 'bird') - y(0, 'bird'), 'the parcel is not lifted as much');
  assert.ok(Math.abs(y(1900, 'bird') - y(0, 'bird')) < 1e-9, 'returns to the roof');
  const rope = storyPoses(69, 1000, {roof: 9}).find(p => p.name === 'rope');
  assert.ok(rope.h > 0.1);
});

test('E056 midpoint: drone delivers the flag in 1500ms, then the static flag stays; best 25 moves it by one unit', () => {
  const {a} = storyCase(56, 400, {cameo: {id: 56, phase: 'delivery', building: 25}});
  assert.ok(names(a).includes('midFlag') && names(a).some(n => n.startsWith('drone')));
  assert.equal(a.stats().storySprites, 2);
  assert.equal(a.stats().staticFlag, false);
  a.dispose();
  const args = plainFixture(), s = createStreetAccents({...args, mode: 'extended96'});
  s.tick(run({t: 1000}), {cameo: null});
  const staticFlag = {id: 56, startedAt: 125000, elapsedMs: 0, phase: 'static', building: 25, durationMs: 0};
  for (const ms of [0, 1, 70000]) {
    s.tick(run({t: 126600 + ms, building: 43}), {cameo: staticFlag});
    assert.equal(s.stats().staticFlag, true);
    assert.equal(s.stats().storySprites, 0);
    assert.ok(s.stats().staticDecorations <= 24);
  }
  const x = i => { const m = new THREE.Matrix4(), p = new THREE.Vector3(); spritesMesh(args).getMatrixAt(i, m); p.setFromMatrixPosition(m); return p.x; };
  assert.ok(names(s).indexOf('midFlag') >= 0);
  assert.equal(x(names(s).indexOf('midFlag')), 250);
  s.setBestDistance(25);
  s.tick(run({t: 126700, building: 43}), {cameo: staticFlag});
  assert.equal(x(names(s).indexOf('midFlag')), 249);
  assert.equal(storyPoses(56, 0, {phase: 'static', bestDistance: 25})[0].x, 249);
  assert.equal(storyPoses(56, 0, {phase: 'static'})[0].x, 250);
  s.tick(run({t: 126800, building: 43}), {cameo: null});
  assert.equal(s.stats().staticFlag, false);
  s.dispose();
});

test('reduced motion shows one still frame for the whole time', () => {
  const story = n => ['crossingPost', 'crossingPostLit', 'crossingArm', 'tram', 'gutterWaterA', 'gutterWaterB', 'gutterSwirl', 'robotPaint', 'robotFoot', 'robotLook', 'paintStripe', 'birdCarryA', 'birdCarryB', 'parcel', 'rope'].includes(n);
  for (const [id, expect] of [[20, ['crossingArm', 'crossingPostLit', 'tram']], [67, ['gutterSwirl', 'gutterWaterA']], [68, ['paintStripe', 'robotFoot']], [69, ['birdCarryB', 'parcel', 'rope']]]) {
    const frames = [];
    for (const ms of [0, 700, 1900]) {
      const {a} = storyCase(id, ms, {accents: {reducedMotion: true}});
      frames.push(names(a).filter(story).sort());
      a.dispose();
    }
    assert.deepEqual(frames[0], expect.slice().sort(), String(id));
    assert.deepEqual(frames[1], frames[0]);
    assert.deepEqual(frames[2], frames[0]);
  }
});

test('legacy80 ignores the extra argument and keeps its own director', () => {
  const args = plainFixture(), a = createStreetAccents({...args, seed: 10000});
  a.tick(run({t: 1000}), {cameo: cameoOf(20, 500), policeExtra: {kind: 'footprints', elapsedMs: 500, building: 43, id: 39, startedAt: 1000}});
  assert.ok(!names(a).includes('crossingPost'));
  assert.equal(a.stats().footprints, 0);
  assert.deepEqual(a.placements({building: 43, phase: 'grace', t: 3000}, {viewport: {width: 402, height: 420}}), {railway: false, water: false, robot: false, bird: false, midpoint: false, existing: {}});
  a.dispose();
});

test('footprints: three static prints with the police extra, gone on cancel and on a building change', () => {
  const args = plainFixture(), a = createStreetAccents({...args, mode: 'extended96'});
  const fp = (elapsedMs, building = 43) => ({id: 39, kind: 'footprints', startedAt: 5000, elapsedMs, durationMs: 1500, building, phase: 'investigate'});
  a.tick(run({t: 4000}), {});
  a.tick(run({t: 5000, phase: 'grace'}), {policeExtra: fp(0)});
  assert.equal(a.stats().footprints, 1);
  a.tick(run({t: 5200, phase: 'grace'}), {policeExtra: fp(200)});
  assert.equal(a.stats().footprints, 3);
  assert.equal(names(a).filter(n => n === 'footprint').length, 3);
  assert.ok(a.stats().staticDecorations <= 24);
  a.tick(run({t: 5300, phase: 'grace'}), {policeExtra: null});
  assert.equal(a.stats().footprints, 0);
  a.tick(run({t: 5400, phase: 'grace'}), {policeExtra: fp(400)});
  assert.equal(a.stats().footprints, 3);
  a.tick(run({t: 5500, phase: 'grace', building: 44}), {policeExtra: fp(500)});
  assert.equal(a.stats().footprints, 0, 'a print never survives a building change');
  a.tick(run({t: 5600, phase: 'grace'}), {policeExtra: {id: 34, kind: 'inquiry', startedAt: 5000, elapsedMs: 100, durationMs: 1200, building: 43, phase: 'investigate'}});
  assert.equal(a.stats().footprints, 0, 'the inquiry leaves no prints');
  a.dispose();
});

test('footprints stay where the officer started, they do not follow the camera', () => {
  const key = '402x700', vp = VIEWPORTS[key];
  const slots = streetSlots(5), scene = new THREE.Scene();
  const camera = streetCamera(vp.width, vp.height, 40);
  const a = createStreetAccents({scene, camera, slots, atlas: new THREE.Texture(), mode: 'extended96'});
  const fi = frameInfoFor(key);
  const fp = ms => ({id: 39, kind: 'footprints', startedAt: 41000, elapsedMs: ms, durationMs: 1500, building: 5, phase: 'investigate'});
  a.tick(run({t: 20000, building: 5}), {});
  a.tick(run({t: 20000, building: 5, phase: 'grace'}), {policeExtra: fp(0), actors: fi});
  const m = new THREE.Matrix4(), first = new THREE.Vector3(), later = new THREE.Vector3();
  const mesh = scene.children[0].children[0];
  const idx = () => a.stats().visibleArtwork.indexOf('footprint');
  mesh.getMatrixAt(idx(), m); first.setFromMatrixPosition(m);
  camera.placeAt(42);
  a.tick(run({t: 21000, building: 5, phase: 'grace'}), {policeExtra: fp(600), actors: fi});
  mesh.getMatrixAt(idx(), m); later.setFromMatrixPosition(m);
  assert.ok(Math.abs(first.x - later.x) < 1e-6, `${first.x} ${later.x}`);
  // The first print is about 0.8 units ahead of the officer, who stands about 2.9 units behind the hero.
  assert.ok(first.x < 40 && first.x > 40 - 6, String(first.x));
  a.dispose();
});

test('all story and decoration budgets hold together at every time (static 24, story 3, particles 8)', () => {
  const args = plainFixture(), a = createStreetAccents({...args, mode: 'extended96'});
  const fp = ms => ({id: 39, kind: 'footprints', startedAt: 0, elapsedMs: ms, durationMs: 1500, building: 43, phase: 'investigate'});
  let t = 1000;
  a.tick(run({t}), {});
  for (const id of [20, 67, 68, 69, 56]) {
    for (let ms = 0; ms <= 2000; ms += 50) {
      t += 50;
      const staticFlag = {id: 56, startedAt: 125000, elapsedMs: 0, phase: 'static', building: 25, durationMs: 0};
      a.tick(run({t, phase: 'grace'}), {cameo: id === 56 && ms % 100 ? staticFlag : cameoOf(id, ms), policeExtra: fp(Math.min(1500, ms))});
      const s = a.stats();
      assert.ok(s.staticDecorations <= 24, `${id}@${ms} static ${s.staticDecorations}`);
      assert.ok(s.storySprites <= 3, `${id}@${ms}`);
      assert.ok(s.ambientParticles <= 8);
      assert.ok(s.drawCalls <= 12 && s.geometries <= 16 && s.textures <= 4);
    }
  }
  a.dispose();
  assert.equal(args.scene.children.length, 0);
});

test('placements are facts about the picture area: only the wide enough layouts can place each story', () => {
  const place = (key, {building = 5, height = 8.3, phase = 'grace', t = 5000, size = null} = {}) => {
    const vp = size ?? VIEWPORTS[key];
    const camera = streetCamera(vp.width, vp.height, (building - 1) * 10);
    const a = createStreetAccents({scene: new THREE.Scene(), camera, slots: streetSlots(building, {height}), atlas: new THREE.Texture(), mode: 'extended96'});
    const fi = size ? {viewport: {width: size.width, height: size.height}, hudBottom: 76, heroX: size.width * 0.38, policeX: [size.width * 0.17, 20], policeVisible: [true, false]} : frameInfoFor(key);
    const out = a.placements({building, phase, t}, fi);
    a.dispose();
    return out;
  };
  for (const key of Object.keys(VIEWPORTS)) {
    const p = place(key);
    assert.equal(p.railway, true, `${key} railway`);
    assert.equal(p.robot, true, `${key} robot`);
    assert.deepEqual(p.existing, {12: true});
  }
  assert.equal(place('402x700').water, true);
  assert.equal(place('874x402').water, true);
  assert.equal(place('402x874').water, false, 'the gap is outside this narrow, tall canvas');
  // A building whose roof reaches under the HUD cannot host the bird; a low one can.
  assert.equal(place('402x700', {height: 8.3}).bird, false);
  assert.equal(place('874x402', {height: 5}).bird, true);
  assert.equal(place('402x700', {height: 5}).bird, true);
  // Nothing is placeable outside grace, and a too short canvas leaves no band of road.
  const quiet = place('402x700', {phase: 'eval'});
  assert.deepEqual([quiet.railway, quiet.water, quiet.robot, quiet.bird, quiet.midpoint], [false, false, false, false, false]);
  
  // Without a viewport/camera nothing can be verified, so nothing is offered (the resident fact still works).
  const noFrame = createStreetAccents({...plainFixture(), mode: 'extended96'});
  assert.deepEqual(noFrame.placements({building: 43, phase: 'grace', t: 5000}, null), {railway: false, water: false, robot: false, bird: false, midpoint: false, existing: {12: true}});
  noFrame.dispose();
});

test('midpoint placement is a fact about the flag position, only inside the 125000..126500 window', () => {
  const at = (key, t, building = 26, heroX = 250) => {
    const vp = VIEWPORTS[key];
    const camera = streetCamera(vp.width, vp.height, heroX);
    const a = createStreetAccents({scene: new THREE.Scene(), camera, slots: streetSlots(building), atlas: new THREE.Texture(), mode: 'extended96'});
    const out = a.placements({building, phase: 'eval', t}, frameInfoFor(key));
    a.dispose();
    return out.midpoint;
  };
  assert.equal(at('402x700', 125500), true);
  assert.equal(at('874x402', 125500), true);
  assert.equal(at('402x700', 124999), false);
  assert.equal(at('402x700', 126500), false);
  assert.equal(at('402x700', 125500, 26, 262), false, 'the flag is already off the left of the screen');
});

test('the resident window fact needs a visible slot with windows', () => {
  const args = plainFixture();
  args.slots.forEach(s => { s.deco.windows = 0; });
  const a = createStreetAccents({...args, mode: 'extended96'});
  assert.deepEqual(a.placements({building: 43, phase: 'grace', t: 1}, null).existing, {12: false});
  args.slots[3].deco.windows = 2;
  assert.deepEqual(a.placements({building: 43, phase: 'grace', t: 1}, null).existing, {12: true});
  args.slots[3].group.visible = false;
  assert.deepEqual(a.placements({building: 43, phase: 'grace', t: 1}, null).existing, {12: false});
  a.dispose();
});

test('footprints that would sit within 4px of the hero box are not drawn', () => {
  const key = '402x700', vp = VIEWPORTS[key];
  const camera = streetCamera(vp.width, vp.height, 40), slots = streetSlots(5), scene = new THREE.Scene();
  const a = createStreetAccents({scene, camera, slots, atlas: new THREE.Texture(), mode: 'extended96'});
  const fi = frameInfoFor(key);
  const fp = ms => ({id: 39, kind: 'footprints', startedAt: 41000, elapsedMs: ms, durationMs: 1500, building: 5, phase: 'investigate'});
  a.tick(run({t: 20000, building: 5}), {});
  a.tick(run({t: 20000, building: 5, phase: 'grace'}), {policeExtra: fp(300), actors: fi});
  assert.equal(a.stats().footprints, 3, 'the officer stands behind the hero: all three prints are clear of the hero');
  // An officer standing on the hero (the prints would be right under the hero) leaves them out.
  a.tick(run({t: 20100, building: 5, phase: 'eval'}), {});
  a.tick(run({t: 20200, building: 5, phase: 'grace'}), {policeExtra: {...fp(300), startedAt: 42000, id: 40}, actors: {...fi, policeX: [fi.heroX - 25, 20]}});
  assert.ok(a.stats().footprints < 3);
  a.dispose();
});
