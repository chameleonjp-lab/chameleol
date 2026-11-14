// 描画の入口。WebGLが使えれば Three.js の街、使えなければ仮の図形（DOM）で同じ判定・同じ色を見せる。
import { RULES_V1, hsvToHex } from '../rules/v1/index.js';
import { h } from '../ui/dom.js';
import { outlineForBuilding } from './chameleon-outline.js';

export { createGamePresentationClock, createVisiblePresentationClock } from './presentation-clock.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** 仮の図形の舞台。現在と次の壁、体色の比較面だけを出す。 */
export function createDomStage(container, { course, rules = RULES_V1 } = {}) {
  const walls = [h('div', { class: 'dom-wall' }), h('div', { class: 'dom-wall' }), h('div', { class: 'dom-wall' })];
  const hero = h('div', { class: 'dom-hero' }, [h('div', { class: 'dom-hero-eye' })]);
  const police = [h('div', { class: 'dom-police' }), h('div', { class: 'dom-police' })];
  const root = h('div', { class: 'dom-stage' }, [...walls, ...police, hero]);
  container.append(root);
  let target = null;
  // 簡易表示の輪郭も同じ段階表を使う。段階が変わった時だけ CSS 変数を書く。
  let outlineInfo = null;
  const applyOutline = (building) => {
    const o = outlineForBuilding(building);
    if (o === outlineInfo) return;
    outlineInfo = o;
    // 枠は整数のCSS画素にそろえる（ブラウザが小数の枠を切り捨てても、色の面が58x74のまま動かない）。最も細い段階も1px以上
    hero.style.setProperty('--outline-w', `${Math.max(1, Math.floor((o.thickness / 0.085) * 3))}px`);
    hero.style.setProperty('--outline-rgb', o.rgb.map((c) => Math.round(c * 255)).join(' '));
    hero.dataset.outlineStage = String(o.stage);
  };
  applyOutline(1);
  return {
    kind: 'dom',
    outlineStyle: () => ({ stage: outlineInfo.stage, thickness: outlineInfo.thickness, rgb: [...outlineInfo.rgb] }),
    update({ t, color, policeStage = 0, presentation }) {
      const W = root.clientWidth * 0.62;
      const playerX = (t / rules.buildingMs) * W;
      const current = Math.floor(t / rules.buildingMs) + 1;
      applyOutline(presentation?.building ?? current);
      walls.forEach((wall, i) => {
        const index = current - 1 + i;
        const valid = index >= 1 && index <= rules.buildingCount;
        wall.style.display = valid ? 'block' : 'none';
        if (!valid) return;
        wall.style.background = hsvToHex(course.targets[index - 1]);
        wall.style.width = `${W - 6}px`;
        wall.style.transform = `translateX(${(index - 1) * W - playerX + root.clientWidth * 0.32}px)`;
      });
      hero.style.background = hsvToHex(color);
      police.forEach((p, i) => p.classList.toggle('visible', policeStage > i));
    },
    showPractice(tg) {
      target = tg;
    },
    renderPractice(color, tg, { building = 1 } = {}) {
      applyOutline(building);
      walls.forEach((wall, i) => {
        wall.style.display = i === 0 ? 'block' : 'none';
        wall.style.background = hsvToHex(tg ?? target);
        wall.style.width = `${root.clientWidth}px`;
        wall.style.transform = 'translateX(0)';
      });
      hero.style.background = hsvToHex(color);
    },
    presentationEvent() {},
    setBestDistance() {},
    presentationStats:()=>({activeIds:[],enabled:false,staticDecorations:0,ambientParticles:0,drawCalls:0,geometries:0,textures:0}),
    forcePresentationEffect:()=>false,
    fx() {},
    async playEnding(_kind, { signal, onFrame = () => {} } = {}) {
      if (!signal?.aborted) onFrame(0);
    },
    async playOpening() {},
    resetEnding() {},
    stats: () => ({ objects: root.querySelectorAll('*').length }),
    resize() {},
    dispose() {
      root.remove();
    },
  };
}

/** 舞台を作る。Three.js を読み込めない・WebGLがない場合は仮の図形へ切り替える。 */
export async function createStage(container, opts = {}) {
  if (!opts.forceDom && webglAvailable()) {
    try {
      const { createThreeStage } = await import('./street.js');
      return createThreeStage(container, opts);
    } catch (err) {
      console.warn('[kamereoru] WebGL stage unavailable, using simple stage', err);
    }
  }
  return createDomStage(container, opts);
}
