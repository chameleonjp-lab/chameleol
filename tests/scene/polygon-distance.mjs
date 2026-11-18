// Convex projected polygon distance. Touching or crossing edges always have distance zero.
// Shared by CPU projections and browser protection assertions; no Three.js or browser imports.
export function polygonDistance(A, B) {
  if (!A?.length || !B?.length) return Infinity;
  const segments = P => P.map((p, i) => [p, P[(i + 1) % P.length]]);
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const onSegment = (a, b, p) => cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
  const intersects = ([a, b], [c, d]) => {
    const ac = cross(a, b, c); const ad = cross(a, b, d);
    const ca = cross(c, d, a); const cb = cross(c, d, b);
    if (((ac < 0 && ad > 0) || (ac > 0 && ad < 0)) && ((ca < 0 && cb > 0) || (ca > 0 && cb < 0))) return true;
    return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
  };
  const aSegments = segments(A); const bSegments = segments(B);
  if (aSegments.some(a => bSegments.some(b => intersects(a, b)))) return 0;
  const inside = (p, polygon) => {
    if (polygon.length < 3) return false;
    let sign = 0;
    for (const [a, b] of segments(polygon)) {
      const c = cross(a, b, p);
      if (c !== 0) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
    }
    return sign !== 0;
  };
  if (A.some(p => inside(p, B)) || B.some(p => inside(p, A))) return 0;
  const pointSegment = (p, [a, b]) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const k = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
  };
  return Math.min(...A.flatMap(p => bSegments.map(s => pointSegment(p, s))), ...B.flatMap(p => aSegments.map(s => pointSegment(p, s))));
}
