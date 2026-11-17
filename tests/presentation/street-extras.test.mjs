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

test('E056 midpoint: drone delivers the flag in 1500ms, then the static flag stays ahead of best 25', () => {
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
  assert.equal(x(names(s).indexOf('midFlag')), 253);
  s.setBestDistance(25);
  s.tick(run({t: 126700, building: 43}), {cameo: staticFlag});
  assert.equal(x(names(s).indexOf('midFlag')), 253);
  assert.equal(storyPoses(56, 0, {phase: 'static', bestDistance: 25})[0].x, 253);
  assert.equal(storyPoses(56, 0, {phase: 'static'})[0].x, 253);
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

test('midpoint fits after the building-entry reaction in all real camera layouts, including best 25', () => {
  const projectBox=(camera,vp,sp)=>{
    const xs=[],ys=[];
    for(const dx of [-sp.w/2,sp.w/2])for(const dy of [-sp.h/2,sp.h/2]){
      const p=new THREE.Vector3(sp.x+dx,sp.y+dy,sp.z).project(camera);
      xs.push((p.x+1)*vp.width/2);ys.push((1-p.y)*vp.height/2);
    }
    return {l:Math.min(...xs),r:Math.max(...xs),t:Math.min(...ys),b:Math.max(...ys)};
  };
  for(const [key,vp] of Object.entries(VIEWPORTS))for(const best of [null,25]){
    const camera=streetCamera(vp.width,vp.height,250);
    const a=createStreetAccents({scene:new THREE.Scene(),camera,slots:streetSlots(26),atlas:new THREE.Texture(),mode:'extended96'});
    a.setBestDistance(best);
    const available=[];
    for(let t=125632;t<126500;t+=16){
      camera.placeAt(t*.002);
      if(a.placements({building:26,phase:'grace',t},frameInfoFor(key)).midpoint)available.push(t);
    }
    assert.ok(available.length>0,`${key}/best=${best}: delivery must fit after the 600ms entry reaction`);
    camera.placeAt(127152*.002); // delivery started at 125632 has now become static
    const flag=projectBox(camera,vp,storyPoses(56,0,{phase:'static',bestDistance:best})[0]);
    assert.ok(flag.l>=8&&flag.r<=vp.width-8&&flag.t>=8&&flag.b<=vp.height-8,`${key}: whole static flag remains visible`);
    if(best===25){
      const old=projectBox(camera,vp,{x:250,y:.9,z:-.6,w:1.8,h:2.4});
      const gap=Math.hypot(Math.max(0,old.l-flag.r,flag.l-old.r),Math.max(0,old.t-flag.b,flag.t-old.b));
      assert.ok(gap>=6,`${key}: midpoint and best flags keep 6px (${gap})`);
    }
    a.dispose();
  }
});

test('gutter water clears the lamp pole and the swirl lies on the pavement inside the same alley',()=>{
  for(const building of [2,6,26,49])for(const ms of [0,500,1000,1500,1990]){
    const poleX=building*10;
    const [water,swirl]=storyPoses(67,ms,{building});
    assert.ok(water.x+Math.abs(water.w)/2<poleX-.045,'water does not cross the 0.09-wide pole');
    assert.ok(swirl.x+Math.abs(swirl.w)/2<poleX-.045,'swirl does not sit behind the pole');
    assert.ok(water.x-Math.abs(water.w)/2>poleX-.65,'water remains in the alley');
    assert.ok(swirl.x-Math.abs(swirl.w)/2>poleX-.65,'swirl remains in the alley');
    assert.equal(swirl.y,.25);assert.equal(swirl.z,.9);assert.equal(swirl.rx,-Math.PI/2);
  }
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

// ---------------------------------------------------------------------------------------------
// Real controller + accents: nothing is drawn before the start is claimed, and cancellations clear it.
import {createGameExtrasController} from '../../src/presentation/game-extras-controller.js';

function controllerWith(claim) {
  return createGameExtrasController({playId: 'integ', seed: 1, extrasPort: {fresh: true, initialState: {count: 0, lastStartedAt: null, rngState: 1, reservedMidpoint: true, midpointUsed: false}, claimCameoStart: claim, claimPrecisionBadge: async () => true}});
}
const stepInput = (t, over = {}) => ({t, playId: 'integ', building: 43, passed: 42, phase: 'eval', running: true, hidden: false, moving: true, policeStage: 0, matchState: null, lastEvalSuccess: false, guideActive: false, guidanceActive: false, warningActive: false, drawable: true, frameIntervalMs: 16, bestDistance: null, actorBusy: {hero: false, police: false}, placements: {railway: true, water: true, robot: true, bird: true, midpoint: true, policeSettled: true, existing: {12: true}}, reducedMotion: false, ...over});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('nothing is drawn before the controller has the claim; it appears after, and goes with a cancel', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const controller = controllerWith(() => gate.then(() => true));
  const args = plainFixture(), accents = createStreetAccents({...args, mode: 'extended96'});
  const frame = (t, over) => { const extra = controller.step(stepInput(t, over)); accents.tick(run({t, ...over}), extra); return extra; };
  try {
    frame(1000);
    // Starts are tried at the first grace frame; the claim is still pending, so the snapshot has no cameo.
    let started = false;
    for (let t = 2000; t < 2400 && !started; t += 16) { const extra = frame(t, {phase: 'grace'}); started = extra.cameo !== null; }
    assert.equal(started, false, 'claim pending: no cameo yet');
    assert.equal(accents.stats().backgroundGroups, 0);
    assert.equal(accents.stats().storySprites, 0);
    release(); await flush(); await flush();
    const extra = frame(2400, {phase: 'grace'});
    assert.ok(extra.cameo, 'the claim resolved: the controller now reports a story');
    assert.equal(accents.stats().backgroundGroups, 1);
    // A cancel from the controller (police 0 -> 2, guide, warning) removes the picture in the same frame.
    const cancelled = frame(2500, {phase: 'grace', policeStage: 2});
    assert.equal(cancelled.cameo, null);
    assert.equal(accents.stats().backgroundGroups, 0);
    assert.equal(accents.stats().storySprites, 0);
  } finally { accents.dispose(); controller.dispose(); }
});

test('police 1->0 and 1->2 cancel the real E034 and clear the actor offset', async () => {
  const ctx = new Proxy({}, {get: (_, k) => k === 'createRadialGradient' ? () => ({addColorStop() {}}) : () => {}});
  globalThis.document = {createElement: () => ({getContext: () => ctx})};
  const {createActorReactions} = await import('../../src/presentation/actor-reactions.js');
  const {createChameleon, createFerret} = await import('../../src/scene/characters.js');
  for (const next of [0, 2]) {
    const controller = controllerWith(async () => false);
    const hero = createChameleon(), police = [createFerret(), createFerret()], reactions = createActorReactions({hero, police});
    try {
      const play = (t, over) => {
        const view = {playId: 'integ', t, running: true, phase: 'grace', policeStage: 1, combo: 0, passed: 1, building: 2, matchState: null, lastEvalSuccess: false, ...over};
        hero.animate(0, {walking: false}); police.forEach(p => p.animate(0, {walking: false}));
        reactions.tick(view);
        const extra = controller.step(stepInput(t, {building: 2, passed: 1, policeStage: view.policeStage, phase: view.phase, actorBusy: reactions.busy(), ...over}));
        return {extra, shift: reactions.applyPoliceExtra(extra.policeExtra, view)};
      };
      play(900, {phase: 'eval', policeStage: 0});
      play(1000, {phase: 'eval'});     // the radio reaction starts and ends before the investigation may begin
      play(1800, {phase: 'eval'});
      const begin = play(1900, {});
      assert.equal(begin.extra.policeExtra?.kind, 'inquiry');
      const mid = play(2300, {});
      assert.ok(mid.extra.policeExtra && mid.shift.dx < 0);
      const gone = play(2316, {policeStage: next});
      assert.equal(gone.extra.policeExtra, null);
      assert.equal(gone.shift.dx, 0);
      assert.equal(police[0].group.position.x, 0, 'the formal position is never moved here');
    } finally { reactions.dispose(); controller.dispose(); hero.dispose(); police.forEach(p => p.dispose()); }
  }
});

test('an expired midpoint reservation keeps a static flag forever and the accents draw it', async () => {
  const controller = controllerWith(async () => true);
  const args = plainFixture(), accents = createStreetAccents({...args, mode: 'extended96'});
  try {
    controller.event({type: 'pass', building: 25});
    for (const t of [124000, 125000, 126400, 126600, 130000, 190000]) {
      const extra = controller.step(stepInput(t, {building: 26, placements: {midpoint: false, existing: {}}}));
      accents.tick(run({t, building: 26}), extra);
    }
    const last = controller.snapshot().cameo;
    assert.equal(last?.phase, 'static');
    assert.equal(accents.stats().staticFlag, true);
    assert.equal(accents.stats().storySprites, 0);
  } finally { accents.dispose(); controller.dispose(); }
});
