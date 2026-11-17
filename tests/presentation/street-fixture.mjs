// Shared fixture: a camera built exactly like the street stage does (resize + placeWorld), so that
// projections in unit tests match what the browser draws. Not a test file.
import * as THREE from 'three';

const CAM = {dx: 3.2, y: 5.2, z: 22, lookDx: 6, lookY: 4.2, lookZ: 0, fov: 44};
const SIDEWALK_Y = 0.22, HERO_Z = 2.5, SCREEN_X = 0.38, SCREEN_Y = 0.31;

/** The stage canvas sizes measured for the three phone layouts (CSS px). */
export const VIEWPORTS = {
  '402x700': {width: 402, height: 420, hudBottom: 76, heroX: 153, policeX: [68, 40]},
  '402x874': {width: 402, height: 514, hudBottom: 76, heroX: 153, policeX: [49, 24]},
  '874x402': {width: 454, height: 402, hudBottom: 76, heroX: 173, policeX: [92, 66]},
};

export function streetCamera(viewW, viewH, heroWorldX = 0) {
  const camera = new THREE.PerspectiveCamera(CAM.fov, 0.78, 0.5, 700);
  const aspect = viewW / viewH;
  camera.fov = (2 * Math.atan(Math.tan((CAM.fov * Math.PI) / 360) * Math.max(1, 0.78 / aspect)) * 180) / Math.PI;
  camera.aspect = aspect;
  camera.clearViewOffset();
  camera.position.set(CAM.dx, CAM.y, CAM.z);
  camera.lookAt(CAM.lookDx, CAM.lookY, CAM.lookZ);
  const quaternion = camera.quaternion.clone();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const v = new THREE.Vector3(0, SIDEWALK_Y + 1.4, HERO_Z).project(camera);
  const tx = SCREEN_X * 2 - 1, ty = SCREEN_Y * 2 - 1;
  camera.setViewOffset(viewW, viewH, ((v.x - tx) / 2) * viewW, ((ty - v.y) / 2) * viewH, viewW, viewH);
  const place = x => { camera.position.set(x + CAM.dx, CAM.y, CAM.z); camera.quaternion.copy(quaternion); camera.updateMatrixWorld(true); };
  place(heroWorldX);
  camera.placeAt = place;
  return camera;
}

/** Seven slots around `building`, like the street keeps: two before, four after. */
export function streetSlots(building, {height = 8.3, windows = 3} = {}) {
  return Array.from({length: 7}, (_, i) => {
    const index = building - 2 + i;
    return {index, cx: (index - 1) * 10 + 5, width: 8.7, height, deco: {kind: 'house', windows}, group: {visible: index >= 1 && index <= 50}};
  });
}

export function frameInfoFor(key) {
  const v = VIEWPORTS[key];
  return {viewport: {width: v.width, height: v.height}, hudBottom: v.hudBottom, heroX: v.heroX, policeX: v.policeX, policeVisible: [true, false]};
}
