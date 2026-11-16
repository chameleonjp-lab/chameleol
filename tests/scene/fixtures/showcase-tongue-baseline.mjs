import * as THREE from 'three';

const SEGMENTS = 32;
const RADIAL = 6;
const STRAIGHT_SEGMENTS = 10;
const RADIUS = 0.05;
const CURL_RADIUS = 0.12;
const CURL_ANGLE = Math.PI * 2 * 1.25;
const clamp = (value, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/** Home-only curled tongue. The hero owns every borrowed material. */
export function createShowcaseTongue(hero) {
  const { head, tongue: original, actorParts: { jaw, mouth, eyes } } = hero;
  const jawPosition = jaw.position.clone();
  const mouthPosition = mouth.position.clone();
  const jawRotation = jaw.rotation.clone();
  const mouthRotation = mouth.rotation.clone();
  const jawScale = jaw.scale.clone();
  const mouthScale = mouth.scale.clone();
  // Remember both sides of each additive pose. Normal animation can replace
  // these values between calls; reset must not subtract an obsolete offset.
  const poses = [
    { rotation: head.rotation, axis: 'z', before: 0, after: 0, applied: false },
    ...eyes.map(eye => ({ rotation: eye.rotation, axis: 'y', before: 0, after: 0, applied: false })),
  ];
  let geometry;
  let mesh;
  let disposed = false;

  function removeAdditivePose() {
    for (const pose of poses) {
      if (pose.applied && pose.rotation[pose.axis] === pose.after) pose.rotation[pose.axis] = pose.before;
      pose.applied = false;
    }
  }

  // A straight section and a tangent-matched curling section form one tube.
  // As the curl opens, its arc becomes a short straight tip. The analytic
  // tangent stays finite even at complete unrolling or mouth storage.
  function deform(extension, unroll) {
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const straight = 0.02 + 0.74 * extension;
    const curlRadius = CURL_RADIUS * (1 - unroll);
    const angle = CURL_ANGLE * (1 - unroll);
    const tipStraight = 0.20 * unroll;
    for (let ring = 0; ring <= SEGMENTS; ring++) {
      let x;
      let y;
      let tangentX;
      let tangentY;
      if (ring <= STRAIGHT_SEGMENTS) {
        x = straight * ring / STRAIGHT_SEGMENTS;
        y = 0;
        tangentX = 1;
        tangentY = 0;
      } else {
        const t = (ring - STRAIGHT_SEGMENTS) / (SEGMENTS - STRAIGHT_SEGMENTS);
        const a = angle * t;
        x = straight + tipStraight * t + curlRadius * Math.sin(a);
        y = curlRadius * (1 - Math.cos(a));
        tangentX = tipStraight + curlRadius * angle * Math.cos(a);
        tangentY = curlRadius * angle * Math.sin(a);
        const length = Math.hypot(tangentX, tangentY) || 1;
        tangentX /= length;
        tangentY /= length;
      }
      // Close the end with a final zero-radius ring, without deriving normals
      // from degenerate triangles. Other rings keep the specified .05 radius.
      const radius = ring === SEGMENTS ? 0 : RADIUS;
      for (let side = 0; side <= RADIAL; side++) {
        const a = side / RADIAL * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const nx = -tangentY * cos;
        const ny = tangentX * cos;
        const offset = (ring * (RADIAL + 1) + side) * 3;
        positions[offset] = x + radius * nx;
        positions[offset + 1] = y + radius * ny;
        positions[offset + 2] = radius * sin;
        normals[offset] = nx;
        normals[offset + 1] = ny;
        normals[offset + 2] = sin;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
  }

  function reset() {
    removeAdditivePose();
    jaw.position.copy(jawPosition);
    jaw.rotation.copy(jawRotation);
    jaw.scale.copy(jawScale);
    mouth.position.copy(mouthPosition);
    mouth.rotation.copy(mouthRotation);
    mouth.scale.copy(mouthScale);
    original.visible = false;
    if (mesh) {
      mesh.visible = false;
      mesh.scale.setScalar(1);
    }
  }

  try {
    geometry = new THREE.BufferGeometry();
    const vertexCount = (SEGMENTS + 1) * (RADIAL + 1);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const indices = new Uint16Array(SEGMENTS * RADIAL * 6);
    let offset = 0;
    for (let ring = 0; ring < SEGMENTS; ring++) {
      for (let side = 0; side < RADIAL; side++) {
        const a = ring * (RADIAL + 1) + side;
        const b = a + RADIAL + 1;
        indices[offset++] = a;
        indices[offset++] = a + 1;
        indices[offset++] = b;
        indices[offset++] = b;
        indices[offset++] = a + 1;
        indices[offset++] = b + 1;
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    deform(0, 0);
    // Fixed broad bounds avoid a per-frame bounding-volume allocation or a
    // stale culling sphere when a stored curl becomes fully extended.
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-0.18, -0.06, -0.06), new THREE.Vector3(1.02, 0.30, 0.06));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.42, 0.12, 0), 0.66);
    mesh = new THREE.Mesh(geometry, original.material);
    mesh.name = 'showcase-tongue';
    mesh.position.copy(original.position);
    mesh.visible = false;
    const outline = new THREE.Mesh(geometry, original.children[0].material);
    outline.name = 'showcase-tongue-outline';
    outline.renderOrder = -1;
    mesh.add(outline);
    head.add(mesh);
    original.visible = false;
  } catch (error) {
    mesh?.removeFromParent();
    geometry?.dispose();
    throw error;
  }

  return {
    apply(frame) {
      if (disposed) return;
      if (frame.tonguePhase === 'idle') {
        reset();
        return;
      }
      removeAdditivePose();
      const mouthOpen = clamp(frame.mouthOpen);
      jaw.position.copy(jawPosition);
      jaw.position.y -= 0.05 * mouthOpen;
      mouth.position.copy(mouthPosition);
      mouth.position.y -= 0.025 * mouthOpen;
      const gaze = clamp(frame.gazeWeight);
      for (let i = 0; i < poses.length; i++) {
        const pose = poses[i];
        pose.before = pose.rotation[pose.axis];
        const offset = i === 0 ? clamp(frame.headTilt, -0.04, 0.04) : (i === 1 ? 0.18 : -0.18) * gaze;
        pose.after = pose.before + offset;
        pose.rotation[pose.axis] = pose.after;
        pose.applied = true;
      }
      deform(clamp(frame.extension), clamp(frame.unroll));
      const storage = frame.tonguePhase === 'settle' ? 1 - clamp(frame.tonguePhaseMs / 150) : 1;
      mesh.scale.setScalar(Math.max(0.001, storage));
      mesh.visible = true;
      original.visible = false;
    },
    getLocalEnvelope(outBox) {
      const thickness = original.children[0].material.uniforms?.uThick?.value ?? 0.085;
      const margin = RADIUS + Math.max(0, thickness) + 0.00001;
      outBox.min.set(-CURL_RADIUS - margin, -margin, -margin).add(original.position);
      outBox.max.set(0.96 + margin, CURL_RADIUS * 2 + margin, margin).add(original.position);
      return outBox;
    },
    reset,
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
    },
  };
}
