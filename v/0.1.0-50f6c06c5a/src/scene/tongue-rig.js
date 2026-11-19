import * as THREE from 'three';

// 舌の形の共通部品。ホーム（showcase-tongue.js）と本編（travel-tongue.js）が同じ管を使う。
// ここに置くのは「形」と「先端・途中の座標と接線」と「片付け」だけ。時間制御・乱数・姿勢は持たない。
// 座標は舌の mesh の局所（舌の付け根＝原点、+x が前、+y が上、舌は z=0 の面で曲がる）。

export const TONGUE_SEGMENTS = 32;
export const TONGUE_RADIAL = 6;
export const TONGUE_RADIUS = 0.05;
const STRAIGHT_SEGMENTS = 10;
const CURL_RADIUS = 0.12;
const CURL_ANGLE = Math.PI * 2 * 1.25;
const clamp = (value, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/**
 * 姿勢の加算を一箇所で管理する台帳。書く直前の値（before）と直後の値（after）を覚え、
 * 戻す時は「今の値がまだ after のままの時だけ」before へ代入し直す（引き算はしない）。
 * 通常の歩行などが値を上書きしていれば、古い補正を引かない。同じ項目へ二度 add しても重ならない。
 */
export function createPoseLedger() {
  const entries = [];
  const entryFor = (target, key) => {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].target === target && entries[i].key === key) return entries[i];
    }
    const entry = { target, key, before: target[key], after: target[key], applied: false };
    entries.push(entry);
    return entry;
  };
  const restoreOne = (entry) => {
    if (entry.applied && entry.target[entry.key] === entry.after) entry.target[entry.key] = entry.before;
    entry.applied = false;
  };
  return {
    /** target[key] へ delta を足す。 */
    add(target, key, delta) {
      const entry = entryFor(target, key);
      restoreOne(entry);
      entry.before = target[key];
      entry.after = entry.before + delta;
      target[key] = entry.after;
      entry.applied = true;
    },
    /** target[key] へ値を置く（真偽値など）。戻す時は置く前の値へ。 */
    set(target, key, value) {
      const entry = entryFor(target, key);
      restoreOne(entry);
      entry.before = target[key];
      entry.after = value;
      target[key] = value;
      entry.applied = true;
    },
    restore() {
      for (let i = 0; i < entries.length; i++) restoreOne(entries[i]);
    },
    /** 戻さずに忘れる。 */
    clear() {
      for (let i = 0; i < entries.length; i++) entries[i].applied = false;
    },
    appliedCount() {
      let count = 0;
      for (let i = 0; i < entries.length; i++) if (entries[i].applied) count += 1;
      return count;
    },
  };
}

/**
 * 主人公の舌の管（まっすぐ部分＋巻き部分）を、頭の子として1つ作る。
 * 材質は hero.tongue の舌・輪郭の材質を借りるだけで、破棄しない。形・メッシュは作った側が一度だけ片付ける。
 * apply(shape) は形だけを書く。姿勢（顎・目・頭）は呼び出し側の責任。
 */
export function createTongueRig(hero, { name = 'tongue' } = {}) {
  const { head, tongue: original } = hero;
  const ringX = new Float64Array(TONGUE_SEGMENTS + 1);
  const ringY = new Float64Array(TONGUE_SEGMENTS + 1);
  const ringTX = new Float64Array(TONGUE_SEGMENTS + 1);
  const ringTY = new Float64Array(TONGUE_SEGMENTS + 1);
  const ringS = new Float64Array(TONGUE_SEGMENTS + 1);
  let geometry;
  let mesh;
  let disposed = false;
  let lastExtension = NaN;
  let lastUnroll = NaN;
  let shapeWrites = 0;

  // まっすぐ部分と、接線の合う巻き部分で1本の管。巻きがほどけると、巻き部分は短い直線の先端になる。
  // 解析的な接線は、完全にほどけた時や収納時も有限。各リングの中心・接線・累積の長さも同じ計算で残す。
  function deform(extension, unroll) {
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const straight = 0.02 + 0.74 * extension;
    const curlRadius = CURL_RADIUS * (1 - unroll);
    const angle = CURL_ANGLE * (1 - unroll);
    const tipStraight = 0.20 * unroll;
    for (let ring = 0; ring <= TONGUE_SEGMENTS; ring++) {
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
        const t = (ring - STRAIGHT_SEGMENTS) / (TONGUE_SEGMENTS - STRAIGHT_SEGMENTS);
        const a = angle * t;
        x = straight + tipStraight * t + curlRadius * Math.sin(a);
        y = curlRadius * (1 - Math.cos(a));
        tangentX = tipStraight + curlRadius * angle * Math.cos(a);
        tangentY = curlRadius * angle * Math.sin(a);
        const length = Math.hypot(tangentX, tangentY) || 1;
        tangentX /= length;
        tangentY /= length;
      }
      ringX[ring] = x;
      ringY[ring] = y;
      ringTX[ring] = tangentX;
      ringTY[ring] = tangentY;
      ringS[ring] = ring === 0 ? 0 : ringS[ring - 1] + Math.hypot(x - ringX[ring - 1], y - ringY[ring - 1]);
      // 末端は半径0のリングで閉じる。他のリングは指定の半径 .05。
      const radius = ring === TONGUE_SEGMENTS ? 0 : TONGUE_RADIUS;
      for (let side = 0; side <= TONGUE_RADIAL; side++) {
        const a = side / TONGUE_RADIAL * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const nx = -tangentY * cos;
        const ny = tangentX * cos;
        const offset = (ring * (TONGUE_RADIAL + 1) + side) * 3;
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
    lastExtension = extension;
    lastUnroll = unroll;
    shapeWrites += 1;
  }

  function reset() {
    original.visible = false;
    if (mesh) {
      mesh.visible = false;
      mesh.scale.setScalar(1);
      mesh.rotation.set(0, 0, 0);
    }
  }

  try {
    geometry = new THREE.BufferGeometry();
    const vertexCount = (TONGUE_SEGMENTS + 1) * (TONGUE_RADIAL + 1);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const indices = new Uint16Array(TONGUE_SEGMENTS * TONGUE_RADIAL * 6);
    let offset = 0;
    for (let ring = 0; ring < TONGUE_SEGMENTS; ring++) {
      for (let side = 0; side < TONGUE_RADIAL; side++) {
        const a = ring * (TONGUE_RADIAL + 1) + side;
        const b = a + TONGUE_RADIAL + 1;
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
    // 固定の広い境界。毎フレームの境界の計算をせず、全部ほどけた時にも切り捨てない。
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-0.18, -0.06, -0.06), new THREE.Vector3(1.02, 0.30, 0.06));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.42, 0.12, 0), 0.66);
    mesh = new THREE.Mesh(geometry, original.material);
    mesh.name = name;
    mesh.position.copy(original.position);
    mesh.visible = false;
    const outline = new THREE.Mesh(geometry, original.children[0].material);
    outline.name = `${name}-outline`;
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
    mesh,
    /** shape = { visible, extension:0..1, unroll:0..1, storage:0..1 }。同じ extension・unroll なら形を書き直さない。 */
    apply(shape) {
      if (disposed) return;
      if (!shape?.visible) {
        reset();
        return;
      }
      const extension = clamp(shape.extension);
      const unroll = clamp(shape.unroll);
      if (extension !== lastExtension || unroll !== lastUnroll) deform(extension, unroll);
      mesh.scale.setScalar(Math.max(0.001, clamp(shape.storage ?? 1)));
      mesh.visible = true;
      original.visible = false;
    },
    /**
     * 舌の長さの割合 u（0＝付け根、1＝先端）の点と単位接線（と、上向きの単位法線）を、最後に apply した形から返す。
     * 形を作る計算と同じ中心線（リングの中心）の上の点で、別の曲線は使わない。mesh の局所座標。
     */
    writePoint(u, outPosition, outTangent, outNormal = null) {
      const total = ringS[TONGUE_SEGMENTS];
      const target = clamp(u) * total;
      let i = 0;
      while (i < TONGUE_SEGMENTS - 1 && ringS[i + 1] < target) i++;
      const span = ringS[i + 1] - ringS[i];
      const f = span > 1e-12 ? clamp((target - ringS[i]) / span) : 0;
      let tx = ringTX[i] + (ringTX[i + 1] - ringTX[i]) * f;
      let ty = ringTY[i] + (ringTY[i + 1] - ringTY[i]) * f;
      const length = Math.hypot(tx, ty) || 1;
      tx /= length;
      ty /= length;
      if (outPosition) {
        outPosition.x = ringX[i] + (ringX[i + 1] - ringX[i]) * f;
        outPosition.y = ringY[i] + (ringY[i + 1] - ringY[i]) * f;
        outPosition.z = 0;
      }
      if (outTangent) {
        outTangent.x = tx;
        outTangent.y = ty;
        outTangent.z = 0;
      }
      if (outNormal) {
        outNormal.x = -ty;
        outNormal.y = tx;
        outNormal.z = 0;
      }
    },
    writeTip(outPosition, outTangent, outNormal = null) {
      this.writePoint(1, outPosition, outTangent, outNormal);
    },
    /** 頭の座標での、舌と輪郭を含む範囲（巻いた形から全部ほどけた形まで）。 */
    getLocalEnvelope(outBox) {
      const thickness = original.children[0].material.uniforms?.uThick?.value ?? 0.085;
      const margin = TONGUE_RADIUS + Math.max(0, thickness) + 0.00001;
      outBox.min.set(-CURL_RADIUS - margin, -margin, -margin).add(original.position);
      outBox.max.set(0.96 + margin, CURL_RADIUS * 2 + margin, margin).add(original.position);
      return outBox;
    },
    reset,
    stats: () => ({ shapeWrites }),
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
    },
  };
}
