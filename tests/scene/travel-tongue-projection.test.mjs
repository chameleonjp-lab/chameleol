import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChameleon } from '../../src/scene/characters.js';
import { createTravelTongue, travelTonguePose } from '../../src/scene/travel-tongue.js';
import { VIEWPORTS, streetCamera } from '../presentation/street-fixture.mjs';
import { polygonDistance, projectMesh } from './projection-fixture.mjs';

const context = new Proxy({}, { get: (_, key) => ['createRadialGradient', 'createLinearGradient'].includes(key) ? () => ({ addColorStop() {} }) : () => {} });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const phases = ['prepare', 'extend', 'hold', 'retract', 'store'];

for (const [key, vp] of Object.entries(VIEWPORTS)) {
  test(`${key}: all five tongue phases keep 4px from the real torso through walking and the maximal one-officer glance`, t => {
    const hero = createChameleon();
    const tongue = createTravelTongue(hero);
    const root = new THREE.Group();
    root.add(hero.group); root.position.set(0, .22, 2.5); root.rotation.y = -.42;
    const camera = streetCamera(vp.width, vp.height);
    const torso = hero.comparePoint.parent.children.find(o => o.isMesh && hero.comparisonMaterials.includes(o.material));
    assert.ok(torso, 'the actual comparison torso is measured');
    t.after(() => { tongue.dispose(); hero.dispose(); });
    const minima = Object.fromEntries(phases.map(p => [p, Infinity]));
    const diamondMinima = { value: Infinity };
    for (let walk = 0; walk < 32; walk++) {
      tongue.prepareBase();
      hero.animate(.04, { walking: true, nervous: .5 });
      for (const phase of phases) for (const turn of [0, -.92]) for (const progress of [0, .1, .25, .5, .75, .9, 1]) {
        tongue.prepareBase();
        hero.head.rotation.y = turn;
        const before = [hero.head.rotation.y, hero.head.rotation.z, hero.actorParts.jaw.position.y, hero.jewel.visible];
        const frame = { phase, phaseProgress: progress };
        tongue.apply(frame);
        // 予備で今の向きから正面へ、収納で正面から今の向きへ、なめらかに回る。伸長・保持・収縮は正面。
        const facing = turn * (1 - travelTonguePose(frame).face);
        assert.ok(Math.abs(hero.head.rotation.y - facing) < 1e-9, `the presentation head turns toward the front (${hero.head.rotation.y} vs ${facing})`);
        root.updateMatrixWorld(true);
        if (!tongue.mesh.visible) {
          // 口の中にしまい切っている（描かない）。保護の対象になる舌は無い。
          tongue.prepareBase();
          assert.deepEqual([hero.head.rotation.y, hero.head.rotation.z, hero.actorParts.jaw.position.y, hero.jewel.visible], before, 'prepareBase restores the exact original pose');
          continue;
        }
        const body = projectMesh(torso, camera, vp);
        const projected = projectMesh(tongue.mesh, camera, vp, .085);
        const gap = polygonDistance(body, projected);
        minima[phase] = Math.min(minima[phase], gap);
        assert.ok(gap >= 4, `${phase}/${progress}/turn${turn}/walk${walk}: ${gap}px`);
        for (const [x, y] of projected) assert.ok(x >= 8 && x <= vp.width - 8 && y >= vp.hudBottom && y <= vp.height - 8, 'the entire outlined tongue stays in the protected canvas');
        if (tongue.diamond.visible) {
          const diamond = projectMesh(tongue.diamond, camera, vp);
          const diamondGap = polygonDistance(body, diamond);
          diamondMinima.value = Math.min(diamondMinima.value, diamondGap);
          assert.ok(diamondGap >= 4, `${phase}/${progress}: diamond ${diamondGap}px`);
          for (const [x, y] of diamond) assert.ok(x >= 8 && x <= vp.width - 8 && y >= vp.hudBottom && y <= vp.height - 8, 'the full diamond stays inside canvas');
        }
        // A stopped/hidden controller repeats the same output. Resume starts by restoring the base.
        tongue.apply(frame);
        assert.ok(Math.abs(hero.head.rotation.y - facing) < 1e-9, 'the repeated frame does not accumulate');
        tongue.prepareBase();
        assert.deepEqual([hero.head.rotation.y, hero.head.rotation.z, hero.actorParts.jaw.position.y, hero.jewel.visible], before, 'prepareBase restores the exact original pose');
        tongue.apply(frame);
        tongue.cancel();
        assert.deepEqual([hero.head.rotation.y, hero.head.rotation.z, hero.actorParts.jaw.position.y, hero.jewel.visible], before, 'cancel restores the original glance and jewel');
      }
    }
    t.diagnostic(JSON.stringify({ minima, diamondMin: diamondMinima.value }));
  });
}
