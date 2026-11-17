import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChameleon, createFerret } from '../../src/scene/characters.js';
import { createStreetAccents } from '../../src/presentation/street-accents.js';
import { makeDecorations } from '../../src/rules/v1/course.js';
import { VIEWPORTS, streetCamera, streetSlots } from './street-fixture.mjs';
import { hull, polygonDistance, projectMesh } from '../scene/projection-fixture.mjs';

const context = new Proxy({}, { get: (_, key) => ['createRadialGradient', 'createLinearGradient'].includes(key) ? () => ({ addColorStop() {} }) : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => context }) };

for (const [key, vp] of Object.entries(VIEWPORTS)) {
  test(`${key}: road pictures keep the designed 6px from actual torso geometry, separately from feet and head`, t => {
    const hero = createChameleon(); const police = createFerret();
    const heroRoot = new THREE.Group(); const policeRoot = new THREE.Group();
    heroRoot.add(hero.group); policeRoot.add(police.group); heroRoot.rotation.y = -.42; policeRoot.rotation.y = -.36; policeRoot.scale.setScalar(.9);
    const camera = streetCamera(vp.width, vp.height, 40);
    const torso = hero.comparePoint.parent.children.find(o => o.isMesh && hero.comparisonMaterials.includes(o.material));
    const policeTorso = police.actorParts.body.children.find(o => o.isMesh);
    t.after(() => { hero.dispose(); police.dispose?.(); });
    let measured = 0; let minimum = Infinity;
    for (const id of [20, 68]) {
      const scene = new THREE.Scene();
      const accents = createStreetAccents({ scene, camera, slots: streetSlots(5), atlas: new THREE.Texture(), mode: 'extended96' });
      const sprites = scene.children[0].children[0];
      for (let ms = 0; ms < 2000; ms += 50) {
        const x = 40 + .002 * ms;
        camera.placeAt(x);
        heroRoot.position.set(x, .22, 2.5); policeRoot.position.set(x - 2.9, .22, 2.7);
        hero.animate(.05, { walking: true, nervous: .5 }); police.animate(.05, { walking: true });
        heroRoot.updateMatrixWorld(true); policeRoot.updateMatrixWorld(true);
        const screenX = r => { const p = r.position.clone().add(new THREE.Vector3(0, 1.5, 0)).project(camera); return (p.x + 1) * vp.width / 2; };
        const fi = { viewport: vp, hudBottom: 76, heroX: screenX(heroRoot), policeX: [screenX(policeRoot)], policeVisible: [true, false] };
        accents.tick({ t: 20000 + ms, building: 5, running: true, phase: 'grace' }, { cameo: { id, building: 5, startedAt: 20000, elapsedMs: ms, durationMs: 2000 }, actors: fi });
        const count = accents.stats().storySprites;
        for (let index = sprites.count - count; index < sprites.count; index++) {
          const matrix = new THREE.Matrix4(); sprites.getMatrixAt(index, matrix);
          const points = [];
          for (const cx of [-.5, .5]) for (const cy of [-.5, .5]) {
            const p = new THREE.Vector3(cx, cy, 0).applyMatrix4(matrix).project(camera);
            points.push([(p.x + 1) * vp.width / 2, (1 - p.y) * vp.height / 2]);
          }
          const picture = hull(points);
          for (const mesh of [torso, policeTorso]) {
            const gap = polygonDistance(picture, projectMesh(mesh, camera, vp));
            minimum = Math.min(minimum, gap);
            assert.ok(gap >= 6, `${id}/${ms}: actual torso gap ${gap}px`);
          }
          measured++;
        }
      }
      accents.dispose();
    }
    assert.ok(measured >= 100, `non-vacuous road drawings: ${measured}`);
    t.diagnostic(JSON.stringify({ measured, minimum }));
  });

  test(`${key}: first-grace bird plans use the unchanged real roof heights and remain frozen through the whole route`, t => {
    const decorations = makeDecorations(1);
    let available = 0; let drawn = 0;
    for (let building = 2; building <= 50; building++) {
      const x = (building - 1) * 10;
      const camera = streetCamera(vp.width, vp.height, x);
      const slots = streetSlots(building).map(s => ({ ...s, height: 9 * .92 * (decorations[s.index - 1]?.heightScale ?? 100) / 100 }));
      const scene = new THREE.Scene();
      const accents = createStreetAccents({ scene, camera, slots, atlas: new THREE.Texture(), mode: 'extended96' });
      const fi = { viewport: vp, hudBottom: 76, heroX: vp.heroX, policeX: vp.policeX, policeVisible: [false, false] };
      const placements = accents.placements({ t: (building - 1) * 5000, building, phase: 'grace' }, fi);
      if (placements.bird) {
        available++;
        let frozen = null; let tallest = 0;
        for (let ms = 0; ms < 2000; ms += 50) {
          camera.placeAt(x + .002 * ms);
          accents.tick({ t: (building - 1) * 5000 + ms, building, phase: 'grace', running: true }, { cameo: { id: 69, building, startedAt: (building - 1) * 5000, elapsedMs: ms, durationMs: 2000 }, actors: fi });
          const stats = accents.stats();
          assert.equal(stats.storySprites, 3, `${building}/${ms}: every offered bird picture is drawn`);
          assert.ok(stats.storyLayout, 'the accepted route is actually consumed');
          frozen ??= stats.storyLayout;
          assert.deepEqual(stats.storyLayout, frozen, 'scrolling never restages an active story');
          const sprites = scene.children[0].children[0];
          const envelope = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
          for (let i = sprites.count - 3; i < sprites.count; i++) {
            const matrix = new THREE.Matrix4(); sprites.getMatrixAt(i, matrix);
            const box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
            for (const cx of [-.5, .5]) for (const cy of [-.5, .5]) {
              const p = new THREE.Vector3(cx, cy, 0).applyMatrix4(matrix).project(camera);
              const sx = (p.x + 1) * vp.width / 2; const sy = (1 - p.y) * vp.height / 2;
              box.l = Math.min(box.l, sx); box.r = Math.max(box.r, sx); box.t = Math.min(box.t, sy); box.b = Math.max(box.b, sy);
            }
            assert.ok(box.t >= 82, `${building}/${ms}: HUD plus 6px`);
            if (ms === 1000) assert.ok(box.l >= 8 && box.r <= vp.width - 8 && box.t >= 8 && box.b <= vp.height - 8, 'actual instance stays 8px inside canvas at the defined inset');
            for (const s of slots.filter(s => s.group.visible)) {
              const project = wx => new THREE.Vector3(wx, s.height, 0).project(camera);
              const l = (project(s.cx - s.width / 2).x + 1) * vp.width / 2;
              const r = (project(s.cx + s.width / 2).x + 1) * vp.width / 2;
              if (r >= box.l && l <= box.r) assert.ok(box.b <= (1 - project(s.cx).y) * vp.height / 2 - 4, `${building}/${ms}: roof line plus 4px`);
            }
            envelope.t = Math.min(envelope.t, box.t); envelope.b = Math.max(envelope.b, box.b);
          }
          tallest = Math.max(tallest, envelope.b - envelope.t);
          drawn++;
        }
        assert.ok(tallest >= 56, `the whole bird route retains 56px: ${tallest}`);
        accents.tick({ t: building * 5000, building, running: true }, { cameo: null, actors: fi });
        assert.equal(accents.stats().storyLayout, null, 'cancel releases the copied route');
      }
      accents.dispose();
    }
    assert.ok(available > 0, 'each real canvas must have first-grace bird opportunities');
    assert.ok(drawn >= 40);
    t.diagnostic(JSON.stringify({ available, opportunities: 49, drawn }));
  });
}
