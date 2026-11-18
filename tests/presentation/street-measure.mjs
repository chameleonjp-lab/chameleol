// Measurement helper (not a test): prints where each story picture lands on the 3 layouts.
// Usage: node tests/presentation/street-measure.mjs [building] [heroOffsetFromBx]
import * as THREE from 'three';
import {createStreetAccents, storyPoses} from '../../src/presentation/street-accents.js';
import {VIEWPORTS, streetCamera, streetSlots, frameInfoFor} from './street-fixture.mjs';

const building = Number(process.argv[2] ?? 5), offset = Number(process.argv[3] ?? 0);
const bx = (building - 1) * 10;
const v = new THREE.Vector3(), euler = new THREE.Euler();
for (const key of Object.keys(VIEWPORTS)) {
  const vp = VIEWPORTS[key];
  const camera = streetCamera(vp.width, vp.height, bx + offset);
  const slots = streetSlots(building);
  const accents = createStreetAccents({scene: new THREE.Scene(), camera, slots, atlas: new THREE.Texture(), mode: 'extended96', seed: 1});
  const fi = {...frameInfoFor(key), reasons: []};
  const p = accents.placements({building, phase: 'grace', t: 5000}, fi);
  const pm = accents.placements({building, phase: 'eval', t: 125500}, fi);
  console.log(`== ${key} ${vp.width}x${vp.height} building ${building}  placements`, JSON.stringify({...p, midpoint: pm.midpoint}), fi.reasons.join(' | '));
  const proj = (x, y, z) => { v.set(x, y, z).project(camera); return [(v.x + 1) / 2 * vp.width, (1 - v.y) / 2 * vp.height]; };
  const wall = proj(bx + 5, 0, 0)[1];
  console.log(`   wall base y=${wall.toFixed(0)} band ${(wall + 4).toFixed(0)}..${vp.height - 4}`);
  for (const id of [20, 67, 68, 69, 56]) {
    for (const ms of id === 56 ? [0, 800, 1100, 1400] : [0, 500, 1000, 1500, 1900]) {
      const specs = storyPoses(id, ms, {building, roof: 9.3});
      const shift = 0.002 * ms;
      const text = specs.map(sp => {
        let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
        euler.set(sp.rx ?? 0, 0, sp.rz ?? 0, 'XYZ');
        for (const [cx, cy] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]]) {
          const lv = new THREE.Vector3(cx * Math.abs(sp.w), cy * sp.h, 0).applyEuler(euler);
          const [sx, sy] = proj(sp.x + lv.x - shift, sp.y + lv.y, sp.z + lv.z);
          l = Math.min(l, sx); r = Math.max(r, sx); t = Math.min(t, sy); b = Math.max(b, sy);
        }
        return `${sp.name}[${l.toFixed(0)},${t.toFixed(0)} ${(r - l).toFixed(0)}x${(b - t).toFixed(0)}]`;
      });
      console.log(`   E${id} ${String(ms).padStart(4)}ms ${text.join(' ')}`);
    }
  }
  accents.dispose();
}
