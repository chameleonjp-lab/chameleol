import * as THREE from 'three';

/** Convex hull of projected mesh vertices, matching street.presentationGeometry. */
export function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function projectMesh(mesh, camera, viewport, thickness = 0) {
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const points = [];
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    if (thickness) p.addScaledVector(n.fromBufferAttribute(normal, i), thickness);
    p.applyMatrix4(mesh.matrixWorld).project(camera);
    points.push([(p.x + 1) * viewport.width / 2, (1 - p.y) * viewport.height / 2]);
  }
  return hull(points);
}

export { polygonDistance } from './polygon-distance.mjs';
