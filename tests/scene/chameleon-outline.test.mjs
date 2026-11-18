import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createChameleon, createOutlineMaterial } from '../../src/scene/chameleon28.js';
import { createFerret } from '../../src/scene/characters.js';

const context = { beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }) };
globalThis.document = { createElement: () => ({ getContext: () => context }) };

const { outlineForBuilding, OUTLINE_STAGES, DEFAULT_OUTLINE_RGB } = await import('../../src/scene/chameleon-outline.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

// 仕様 DES-02 と docs/requirements/chameleol-design-followups.json の outline に一致させる表。
// 2026-11-18 本人指示：色は全段階で現行の濃い色、段階は太さだけで変える。
const TABLE = [
  { stage: 0, from: 1, to: 10, thickness: 0.0255, rgb: 0.1059 },
  { stage: 1, from: 11, to: 15, thickness: 0.034, rgb: 0.1059 },
  { stage: 2, from: 16, to: 20, thickness: 0.0425, rgb: 0.1059 },
  { stage: 3, from: 21, to: 25, thickness: 0.051, rgb: 0.1059 },
  { stage: 4, from: 26, to: 30, thickness: 0.0595, rgb: 0.1059 },
  { stage: 5, from: 31, to: 35, thickness: 0.068, rgb: 0.1059 },
  { stage: 6, from: 36, to: 39, thickness: 0.0765, rgb: 0.1059 },
  { stage: 7, from: 40, to: 50, thickness: 0.085, rgb: 0.1059 },
];

function need() {
  assert.equal(typeof outlineForBuilding, 'function', 'chameleon-outline.js must export outlineForBuilding');
}
function outlineMeshes(root) {
  const found = [];
  root.traverse(node => {
    const m = node.material;
    if (m && m.uniforms && m.uniforms.uThick) found.push(node);
  });
  return found;
}
function outlineMaterials(root) {
  return [...new Set(outlineMeshes(root).map(node => node.material))];
}
function snapshot(root) {
  const toon = new Set();
  const basic = new Set();
  root.traverse(node => {
    const m = node.material;
    if (!m) return;
    if (m.uniforms && m.uniforms.uColor) toon.add(m.uniforms.uColor.value.toArray().join(','));
    else if (m.isMeshBasicMaterial) basic.add(`${m.color.getHex()}:${m.map ? 'map' : 'flat'}`);
  });
  return { toon: [...toon].sort(), basic: [...basic].sort() };
}
function rgbOf(material) {
  const v = material.uniforms.uOutlineRgb.value;
  return [v.x, v.y, v.z];
}

test('outlineForBuilding matches the DES-02 table for every building 1..50', () => {
  need();
  for (let building = 1; building <= 50; building++) {
    const row = TABLE.find(r => building >= r.from && building <= r.to);
    const got = outlineForBuilding(building);
    assert.equal(got.stage, row.stage, `building ${building}`);
    assert.equal(got.thickness, row.thickness, `building ${building}`);
    assert.equal(got.rgb.length, 3);
    for (const c of got.rgb) assert.equal(c, row.rgb, `building ${building}`);
  }
});

test('stage boundaries change on the exact building', () => {
  need();
  for (const [a, b] of [[10, 11], [15, 16], [20, 21], [25, 26], [30, 31], [35, 36], [39, 40]]) {
    assert.equal(outlineForBuilding(b).stage, outlineForBuilding(a).stage + 1, `${a}->${b}`);
  }
  assert.equal(outlineForBuilding(50).stage, 7);
  assert.equal(outlineForBuilding(40).stage, 7);
});

test('stage 7 keeps the current 0.085 thickness and 0.1059 colour exactly', () => {
  need();
  const s = outlineForBuilding(40);
  assert.equal(s.thickness, 0.085);
  assert.deepEqual([...s.rgb], [0.1059, 0.1059, 0.1059]);
  assert.deepEqual([...DEFAULT_OUTLINE_RGB], [0.1059, 0.1059, 0.1059]);
});

test('only the thickness changes: thicker means a harder building, the colour stays the current dark grey', () => {
  need();
  assert.equal(OUTLINE_STAGES.length, 8);
  for (let i = 1; i < OUTLINE_STAGES.length; i++) {
    assert.ok(OUTLINE_STAGES[i].thickness > OUTLINE_STAGES[i - 1].thickness);
  }
  for (const row of OUTLINE_STAGES) assert.deepEqual([...row.rgb], [...DEFAULT_OUTLINE_RGB]);
});

test('anything that is not an integer 1..50 falls back to the first stage', () => {
  need();
  for (const bad of [0, 51, -1, -40, 1.5, 39.9, NaN, Infinity, '10', '40', null, undefined, {}, [], true]) {
    const got = outlineForBuilding(bad);
    assert.equal(got.stage, 0, String(bad));
    assert.equal(got.thickness, 0.0255);
  }
});

test('results are frozen and shared, not rebuilt per call', () => {
  need();
  const a = outlineForBuilding(12);
  assert.equal(a, outlineForBuilding(15));
  assert.ok(Object.isFrozen(a));
  assert.ok(Object.isFrozen(a.rgb));
});

test('createOutlineMaterial keeps its argument and default values', () => {
  const def = createOutlineMaterial();
  assert.equal(def.uniforms.uThick.value, 0.085);
  assert.deepEqual(rgbOf(def).map(v => Math.round(v * 10000) / 10000), [0.1059, 0.1059, 0.1059]);
  assert.equal(def.side, THREE.BackSide);
  assert.equal(def.transparent, false);
  const thin = createOutlineMaterial(0.03);
  assert.equal(thin.uniforms.uThick.value, 0.03);
  def.dispose();
  thin.dispose();
});

test('hero starts at the current look (stage 7, 0.085, 0.1059)', () => {
  const hero = createChameleon();
  const mats = outlineMaterials(hero.group);
  assert.equal(mats.length, 1, 'all hero outlines share one material');
  assert.equal(mats[0].uniforms.uThick.value, 0.085);
  for (const c of rgbOf(mats[0])) assert.ok(Math.abs(c - 0.1059) < 1e-6);
  const style = hero.getOutlineStyle();
  assert.equal(style.stage, 7);
  assert.equal(style.thickness, 0.085);
  assert.equal(style.writes, 0);
  hero.dispose();
});

test('setOutlineStyle rewrites the existing material only and leaves police, inner lines and body colour alone', () => {
  need();
  const hero = createChameleon();
  const police = createFerret();
  hero.setColor([0.3, 0.6, 0.2]);
  const heroBefore = snapshot(hero.group);
  const policeBefore = outlineMaterials(police.group).map(m => [m.uniforms.uThick.value, rgbOf(m)]);
  const policeSnap = snapshot(police.group);
  const geosBefore = [];
  const matsBefore = [];
  hero.group.traverse(n => { if (n.geometry) geosBefore.push(n.geometry); if (n.material) matsBefore.push(n.material); });
  const heroMat = outlineMaterials(hero.group)[0];
  const meshCount = outlineMeshes(hero.group).length;
  const bodyColor = hero.comparisonMaterials[0].uniforms.uColor.value.toArray();

  hero.setOutlineStyle(outlineForBuilding(1));

  assert.equal(outlineMaterials(hero.group)[0], heroMat, 'same material instance');
  assert.equal(outlineMeshes(hero.group).length, meshCount);
  assert.equal(heroMat.uniforms.uThick.value, 0.0255);
  for (const c of rgbOf(heroMat)) assert.ok(Math.abs(c - 0.1059) < 1e-6);
  assert.deepEqual(snapshot(hero.group), heroBefore, 'body toon colours and dark inner materials unchanged');
  assert.deepEqual(hero.comparisonMaterials[0].uniforms.uColor.value.toArray(), bodyColor);
  assert.deepEqual(outlineMaterials(police.group).map(m => [m.uniforms.uThick.value, rgbOf(m)]), policeBefore, 'police outline unchanged');
  assert.deepEqual(snapshot(police.group), policeSnap);
  for (const m of outlineMaterials(police.group)) {
    assert.equal(m.uniforms.uThick.value, 0.085);
    assert.notEqual(m, heroMat);
  }
  const geosAfter = [];
  const matsAfter = [];
  hero.group.traverse(n => { if (n.geometry) geosAfter.push(n.geometry); if (n.material) matsAfter.push(n.material); });
  assert.deepEqual(geosAfter, geosBefore);
  assert.deepEqual(matsAfter, matsBefore);
  hero.dispose();
  police.dispose();
});

test('inner dark lines (mouth, nose) use their own materials, not the outline material', () => {
  const hero = createChameleon();
  const heroMat = outlineMaterials(hero.group)[0];
  const basics = [];
  hero.group.traverse(n => { if (n.material && n.material.isMeshBasicMaterial && n.material.color.getHex() === 0x1b1b1b) basics.push(n.material); });
  assert.ok(basics.length > 0, 'dark inner-line material exists');
  hero.setOutlineStyle(outlineForBuilding(1));
  for (const m of basics) assert.equal(m.color.getHex(), 0x1b1b1b);
  assert.ok(!basics.includes(heroMat));
  hero.dispose();
});

test('same stage does not write again; a new stage writes once', () => {
  need();
  const hero = createChameleon();
  const mat = outlineMaterials(hero.group)[0];
  hero.setOutlineStyle(outlineForBuilding(1));
  assert.equal(hero.getOutlineStyle().writes, 1);
  for (let i = 0; i < 1000; i++) hero.setOutlineStyle(outlineForBuilding(1 + (i % 10)));
  assert.equal(hero.getOutlineStyle().writes, 1, 'buildings 1..10 share stage 0');
  const before = mat.uniforms.uThick.value;
  hero.setOutlineStyle(outlineForBuilding(11));
  assert.equal(hero.getOutlineStyle().writes, 2);
  assert.equal(mat.uniforms.uThick.value, 0.034);
  assert.notEqual(mat.uniforms.uThick.value, before);
  hero.setOutlineStyle(outlineForBuilding(45));
  assert.equal(hero.getOutlineStyle().writes, 3);
  assert.equal(mat.uniforms.uThick.value, 0.085);
  assert.equal(hero.getOutlineStyle().stage, 7);
  for (const c of rgbOf(mat)) assert.ok(Math.abs(c - 0.1059) < 1e-6);
  hero.dispose();
});

test('setOutlineStyle ignores malformed input without throwing', () => {
  const hero = createChameleon();
  hero.setOutlineStyle(null);
  hero.setOutlineStyle({});
  hero.setOutlineStyle({ stage: 3, thickness: NaN, rgb: [1, 2] });
  assert.equal(hero.getOutlineStyle().stage, 7);
  assert.equal(hero.getOutlineStyle().writes, 0);
  hero.dispose();
});

test('every hero outline mesh (body, eye turret, tongue) follows the stage', () => {
  need();
  const hero = createChameleon();
  const meshes = outlineMeshes(hero.group);
  assert.ok(meshes.length >= 10);
  hero.setOutlineStyle(outlineForBuilding(25));
  for (const node of meshes) assert.equal(node.material.uniforms.uThick.value, 0.051);
  hero.dispose();
});

test('the table equals the machine-readable requirement (docs/requirements/chameleol-design-followups.json outline)', () => {
  need();
  const json = JSON.parse(readFileSync(new URL('../../docs/requirements/chameleol-design-followups.json', import.meta.url), 'utf8'));
  let outline = null;
  const find = (o) => { if (outline || !o || typeof o !== 'object') return; if (Array.isArray(o.outline)) { outline = o.outline; return; } for (const v of Object.values(o)) find(v); };
  find(json);
  assert.ok(outline && outline.length === 8);
  outline.forEach((row, i) => {
    const s = OUTLINE_STAGES[i];
    assert.equal(s.from, row.from);
    assert.equal(s.to, row.to);
    assert.equal(s.thickness, row.thickness);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(s.rgb[c] - row.rgb[c]) < 1e-12, `stage ${i} channel ${c}`);
  });
});
