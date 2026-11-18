// 街の中の小さな演出：粒（土ぼこり・きらめき・紙吹雪・汗）と、頭の上の「！」「？」。
// - どれも透明を使わない（輪郭を切り抜いた不透明の板）。壁や体の色に何も混ぜず、手前を一瞬横切るだけ。
//   判定の対象外で、得点にも関わらない（COLOR-01・COLOR-03）。
// - 数は最初に決めた分だけ作って使い回す。プレイ中に物体を増やさない（SCOPE-03）。
// - 板は常にカメラへ向ける（カメラの回転をそのまま写す）。
import * as THREE from 'three';

const STAR_N = 56;
const DOT_N = 56;
const ICON_N = 3;

function canvasOf(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function starPath(g, cx, cy, outer, inner, points = 4) {
  g.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function bubbleTexture(glyph, ink) {
  const tex = new THREE.CanvasTexture(
    canvasOf(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      // 吹き出し：白い丸と太い輪郭、下に小さなしっぽ
      g.fillStyle = '#1b1b1b';
      g.beginPath();
      g.arc(s / 2, s * 0.44, s * 0.4, 0, Math.PI * 2);
      g.moveTo(s * 0.36, s * 0.74);
      g.lineTo(s * 0.5, s * 0.99);
      g.lineTo(s * 0.64, s * 0.74);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(s / 2, s * 0.44, s * 0.33, 0, Math.PI * 2);
      g.moveTo(s * 0.42, s * 0.72);
      g.lineTo(s * 0.5, s * 0.88);
      g.lineTo(s * 0.58, s * 0.72);
      g.fill();
      g.fillStyle = ink;
      g.font = `900 ${Math.round(s * 0.56)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(glyph, s / 2, s * 0.47);
    }),
  );
  return tex;
}

// 粒の出し方の型。n=数、shape=形、colors=色の候補、speed=初速、up=上向きの足し、gravity=落ちる強さ、life=秒、size=大きさ
const PRESETS = {
  dust: { n: 2, shape: 'dot', colors: [0xf2efe6, 0xd9d4c8], speed: 0.7, up: 0.9, gravity: 1.5, life: 0.45, size: 0.26, grow: 1.6, spread: 0.25 },
  sparkle: { n: 7, shape: 'star', colors: [0xffffff, 0xfff3a0, 0xb8fff0], speed: 2.6, up: 1.2, gravity: 1.8, life: 0.6, size: 0.36, grow: 0.2, spread: 0.9, ring: 1.0 },
  pass: { n: 4, shape: 'star', colors: [0xffffff, 0xfff3a0], speed: 2.0, up: 2.4, gravity: 3.5, life: 0.55, size: 0.3, grow: 0.2, spread: 0.6, ring: 0.8 },
  confetti: { n: 16, shape: 'dot', colors: [0xff6f61, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xf78cff, 0xffffff], speed: 3.6, up: 4.6, gravity: 6.5, life: 1.2, size: 0.24, grow: 1, spread: 0.5 },
  sweat: { n: 1, shape: 'dot', colors: [0x9fe3ff, 0xd6f4ff], speed: 1.3, up: 1.8, gravity: 5.5, life: 0.45, size: 0.2, grow: 1, spread: 0.15 },
  shock: { n: 9, shape: 'star', colors: [0xffffff, 0xffe066, 0xff8a5c], speed: 4.2, up: 0.6, gravity: 0.5, life: 0.4, size: 0.42, grow: 0.3, spread: 0.2, ring: 0.6 },
  gem: { n: 3, shape: 'star', colors: [0xffffff, 0x9ff3ff, 0xfff3a0], speed: 1.2, up: 0.8, gravity: 0.4, life: 0.7, size: 0.34, grow: 0.2, spread: 0.3, ring: 0.5 },
  glass: { n: 10, shape: 'star', colors: [0xe6f7ff, 0xbfe7ff, 0xffffff], speed: 3.4, up: 2.6, gravity: 7, life: 0.8, size: 0.26, grow: 0.6, spread: 0.6 },
};

export function createEffects(scene) {
  const starTex = new THREE.CanvasTexture(
    canvasOf(64, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#ffffff';
      starPath(g, s / 2, s / 2, s * 0.48, s * 0.16);
      g.fill();
    }),
  );
  const dotTex = new THREE.CanvasTexture(
    canvasOf(64, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
      g.fill();
    }),
  );
  const plane = new THREE.PlaneGeometry(1, 1);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(0xffffff);

  function makePool(tex, n) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, fog: false, toneMapped: false });
    const mesh = new THREE.InstancedMesh(plane, mat, n);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i += 1) {
      mesh.setMatrixAt(i, ZERO);
      mesh.setColorAt(i, white);
    }
    mesh.renderOrder = 5;
    mesh.visible = false; // 粒がない間は描かない
    scene.add(mesh);
    const items = Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, size: 0, grow: 1, spin: 0, rot: 0 }));
    return { mesh, mat, items, next: 0, live: 0 };
  }
  const pools = { star: makePool(starTex, STAR_N), dot: makePool(dotTex, DOT_N) };

  // 頭の上の記号
  const bangTex = bubbleTexture('!', '#e5383b');
  const askTex = bubbleTexture('?', '#3a6fd8');
  const iconMats = {
    '!': new THREE.MeshBasicMaterial({ map: bangTex, alphaTest: 0.5, fog: false, toneMapped: false }),
    '?': new THREE.MeshBasicMaterial({ map: askTex, alphaTest: 0.5, fog: false, toneMapped: false }),
  };
  const icons = Array.from({ length: ICON_N }, () => {
    const mesh = new THREE.Mesh(plane, iconMats['!']);
    mesh.visible = false;
    mesh.renderOrder = 6;
    scene.add(mesh);
    return { mesh, glyph: null, age: 0, hold: 0, closing: 0 };
  });

  const tQ = new THREE.Quaternion();
  const tR = new THREE.Quaternion();
  const tP = new THREE.Vector3();
  const tS = new THREE.Vector3();
  const tM = new THREE.Matrix4();
  const tC = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1);
  let enabled = true;

  function emit(name, x, y, z, { count = null, dirX = 0 } = {}) {
    const p = PRESETS[name];
    if (!p || !enabled) return;
    const pool = pools[p.shape];
    const n = count ?? p.n;
    for (let i = 0; i < n; i += 1) {
      const it = pool.items[pool.next];
      const slot = pool.next;
      pool.next = (pool.next + 1) % pool.items.length;
      const a = Math.random() * Math.PI * 2;
      const sp = p.speed * (0.5 + Math.random() * 0.7);
      const r = p.ring ?? 0;
      it.x = x + Math.cos(a) * r + (Math.random() - 0.5) * p.spread;
      it.y = y + Math.sin(a) * r * 0.9 + (Math.random() - 0.5) * p.spread;
      it.z = z + (Math.random() - 0.5) * p.spread * 0.5;
      it.vx = Math.cos(a) * sp + dirX;
      it.vy = Math.sin(a) * sp * 0.6 + p.up * (0.6 + Math.random() * 0.6);
      it.vz = (Math.random() - 0.5) * sp * 0.3;
      it.g = p.gravity;
      it.max = p.life * (0.75 + Math.random() * 0.5);
      it.life = it.max;
      it.size = p.size * (0.7 + Math.random() * 0.6);
      it.grow = p.grow;
      it.rot = Math.random() * Math.PI;
      it.spin = (Math.random() - 0.5) * 8;
      pool.mesh.setColorAt(slot, tC.set(p.colors[Math.floor(Math.random() * p.colors.length)]));
      pool.mesh.instanceColor.needsUpdate = true;
    }
  }

  function updatePool(pool, dt, camQuat) {
    let live = 0;
    for (let i = 0; i < pool.items.length; i += 1) {
      const it = pool.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) {
        pool.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      live += 1;
      it.vy -= it.g * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      it.rot += it.spin * dt;
      const k = it.life / it.max; // 1→0
      // grow>=1 はふくらんで消える（土ぼこり）、小さい値はしぼんで消える（星）
      const s = it.size * (it.grow >= 1 ? (1 + (it.grow - 1) * (1 - k)) * Math.min(1, k * 3) : it.grow + (1 - it.grow) * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.5));
      tQ.copy(camQuat).multiply(tR.setFromAxisAngle(Z, it.rot));
      tM.compose(tP.set(it.x, it.y, it.z), tQ, tS.set(s, s, s));
      pool.mesh.setMatrixAt(i, tM);
    }
    if (live || pool.live) pool.mesh.instanceMatrix.needsUpdate = true;
    pool.live = live;
    pool.mesh.visible = live > 0;
  }

  return {
    /** 粒を出す。name は型の名前。 */
    emit,
    /** 記号を出す。i は置き場の番号、glyph は '!' か '?'、ms は見せる時間。 */
    showIcon(i, glyph, ms = 900) {
      const ic = icons[i];
      if (!ic || !iconMats[glyph]) return;
      if (ic.glyph === glyph && ic.hold > 0) {
        ic.hold = Math.max(ic.hold, ms / 1000);
        return;
      }
      ic.glyph = glyph;
      ic.mesh.material = iconMats[glyph];
      ic.age = 0;
      ic.hold = ms / 1000;
      ic.closing = 0;
    },
    hideIcon(i) {
      const ic = icons[i];
      if (ic && ic.hold > 0) ic.hold = 0.0001;
    },
    /** 記号の位置（頭の上）。毎フレーム呼ぶ。 */
    placeIcon(i, x, y, z) {
      icons[i]?.mesh.position.set(x, y, z);
    },
    iconActive: (i) => (icons[i]?.hold ?? 0) > 0,
    update(dt, camQuat) {
      updatePool(pools.star, dt, camQuat);
      updatePool(pools.dot, dt, camQuat);
      for (const ic of icons) {
        if (ic.hold <= 0 && ic.closing <= 0) {
          ic.mesh.visible = false;
          continue;
        }
        ic.age += dt;
        let s;
        if (ic.hold > 0) {
          ic.hold -= dt;
          if (ic.hold <= 0) ic.closing = 0.15;
          // ぽんと出る（少し行き過ぎてから戻る）
          const k = Math.min(1, ic.age / 0.22);
          s = k < 1 ? 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2 : 1;
          s *= 1 + Math.sin(ic.age * 9) * 0.04;
        } else {
          ic.closing -= dt;
          s = Math.max(0, ic.closing / 0.15);
        }
        ic.mesh.visible = s > 0.01;
        ic.mesh.quaternion.copy(camQuat);
        ic.mesh.scale.setScalar(1.15 * s);
      }
    },
    /** すべて消す（画面を作り直した時・演出の後）。 */
    clear() {
      for (const pool of Object.values(pools)) {
        pool.items.forEach((it, i) => {
          it.life = 0;
          pool.mesh.setMatrixAt(i, ZERO);
        });
        pool.mesh.instanceMatrix.needsUpdate = true;
        pool.mesh.visible = false;
        pool.live = 0;
      }
      icons.forEach((ic) => {
        ic.hold = 0;
        ic.closing = 0;
        ic.glyph = null;
        ic.mesh.visible = false;
      });
    },
    setEnabled(on) {
      enabled = on;
    },
    /** 準備用：最初の描画で材質を作らせるための一覧。 */
    objects: () => [pools.star.mesh, pools.dot.mesh, ...icons.map((ic) => ic.mesh)],
    dispose() {
      // 形と材質は scene.traverse 側でも捨てるが、画像はここで捨てる
      [starTex, dotTex, bangTex, askTex].forEach((t) => t.dispose());
      Object.values(iconMats).forEach((m) => m.dispose());
    },
  };
}
