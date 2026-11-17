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

export function polygonDistance(A, B) {
  const segments = P => P.map((p, i) => [p, P[(i + 1) % P.length]]);
  const inside = (p, polygon) => {
    let sign = 0;
    for (const [a, b] of segments(polygon)) {
      const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (c !== 0) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
    }
    return true;
  };
  if (A.some(p => inside(p, B)) || B.some(p => inside(p, A))) return 0;
  const pointSegment = (p, [a, b]) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const k = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
  };
  return Math.min(...A.flatMap(p => segments(B).map(s => pointSegment(p, s))), ...B.flatMap(p => segments(A).map(s => pointSegment(p, s))));
}
