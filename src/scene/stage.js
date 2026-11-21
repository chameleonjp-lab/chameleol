// 描画の入口。WebGLが使えれば Three.js の街、使えなければ仮の図形（DOM）で同じ判定・同じ色を見せる。
import { RULES_V1, hsvToHex } from '../rules/v1/index.js';
import { h } from '../ui/dom.js';
import { clearPortraitUrl } from '../presentation/result-fallback-portrait.js';
import { createVisiblePresentationClock } from './presentation-clock.js';
import { startShopEscape } from './opening.js';
import { outlineForBuilding } from './chameleon-outline.js';

export { createGamePresentationClock, createVisiblePresentationClock } from './presentation-clock.js';

/**
 * 演出の組（IF01）。既定は legacy80（旧経路）。extended96 は、呼び出し側が明示し、かつ step できる controller がある時だけ。
 * controller が渡されただけでは新経路にしない。
 */
export function resolvePresentationMode(opts = {}) {
  return opts?.presentationSet === 'extended96' && typeof opts.gameExtrasController?.step === 'function' ? 'extended96' : 'legacy80';
}

/** 舞台が配置できない時（簡易表示・演出オフ・開始演出・終了演出）に渡す、配置不可の組。 */
export const NO_PLACEMENTS = Object.freeze({ railway: false, water: false, robot: false, bird: false, midpoint: false, policeSettled: false });
export const IDLE_BUSY = Object.freeze({ hero: false, police: false });

/**
 * step へ渡す placements を作る。配置できるか（描画できる時だけ）は C の部品（accents.placements）が決め、ここは
 * 事実（描画可否・警察が立ち位置に着いたか）と合わせるだけ。描けない時は部品を呼ばず、すべて配置不可。
 */
export function composePlacements({ drawable, accents, view, info, policeSettled }) {
  if (!drawable) return NO_PLACEMENTS;
  return { ...NO_PLACEMENTS, existing: {}, ...(info && accents?.placements ? accents.placements(view, info) : null), policeSettled: policeSettled === true };
}

/**
 * extended96 の舞台が controller へ step を渡す口（IF02/IF09）。立体の舞台と簡易表示が同じものを使う。
 * 値は観測するだけで、抑止・抽選・時計は controller が持つ。priority は作らない。
 *  - t は presentation.t（ゲーム時計）。
 *  - reducedMotion は prefers-reduced-motion の今の値を毎回 boolean で。変更は onReducedMotionChange で知らせる。
 *  - frameIntervalMs は進行中の presentation.t の前回との差。初回・停止・非表示・逆行・不正値は 0。
 *  - bestDistance は 0〜50 の整数か null。
 */
export function createExtendedStepper({ controller, onReducedMotionChange = null } = {}) {
  const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  const onChange = (event) => onReducedMotionChange?.((event?.matches ?? media?.matches) === true);
  if (media && onReducedMotionChange) {
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener?.(onChange);
  }
  let disposed = false;
  let previousT = null;
  let bestDistance = null;
  return {
    reducedMotion: () => media?.matches === true,
    setBestDistance(value) {
      bestDistance = Number.isInteger(value) && value >= 0 && value <= 50 ? value : null;
    },
    /** presentation（App の playView 等）と、舞台が測った値を合わせて1回 step する。戻り値は controller の出力。 */
    step(presentation, { drawable = false, actorBusy = IDLE_BUSY, placements = NO_PLACEMENTS } = {}) {
      if (disposed || !presentation) return null;
      const t = presentation.t;
      const advancing = presentation.running === true && !presentation.hidden && Number.isSafeInteger(t);
      const frameIntervalMs = advancing && previousT !== null && t >= previousT ? t - previousT : 0;
      previousT = advancing ? t : null;
      return controller.step({
        ...presentation,
        drawable: drawable === true,
        actorBusy: { hero: actorBusy?.hero === true, police: actorBusy?.police === true },
        placements: { ...NO_PLACEMENTS, existing: {}, ...placements },
        reducedMotion: media?.matches === true,
        frameIntervalMs,
        bestDistance,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (media && onReducedMotionChange) {
        if (media.removeEventListener) media.removeEventListener('change', onChange);
        else media.removeListener?.(onChange);
      }
    },
  };
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** 仮の図形の舞台。現在と次の壁、体色の比較面だけを出す。 */
export function createDomStage(container, { course, rules = RULES_V1, presentationSet, gameExtrasController, showOpeningShop = false, centerOnBuilding = false } = {}) {
  const mode = resolvePresentationMode({ presentationSet, gameExtrasController });
  // extended96 では簡易表示でも1フレーム1回 step する（評価区間と一度だけの取得処理を落とさない）。描く物は無い。
  const stepper = mode === 'extended96' ? createExtendedStepper({ controller: gameExtrasController }) : null;
  let disposed = false;
  const walls = [h('div', { class: 'dom-wall' }), h('div', { class: 'dom-wall' }), h('div', { class: 'dom-wall' })];
  const hero = h('div', { class: 'dom-hero' }, [h('div', { class: 'dom-hero-eye' })]);
  if (centerOnBuilding) hero.style.left = '50%';
  const police = [h('div', { class: 'dom-police' }), h('div', { class: 'dom-police' })];
  const root = h('div', { class: 'dom-stage' }, [...walls, ...police, hero]);
  const shop = showOpeningShop ? h('div', { class: 'dom-wall dom-jewelry-shop', 'aria-hidden': 'true' }, [
    h('i', { class: 'dom-shop-sign' }), h('i', { class: 'dom-shop-windows' })
  ]) : null;
  const jewel = shop ? h('i', { class: 'dom-stolen-jewel', hidden: true }) : null;
  if (shop) { root.prepend(shop); root.append(jewel); }
  container.append(root);
  let escape = null, stopClearEnding = null;
  function placeStreet(block) {
    const W = root.clientWidth * 0.62;
    const anchor = centerOnBuilding ? root.clientWidth * 0.5 + 3 : root.clientWidth * 0.32;
    const current = Math.max(1, Math.floor(block) + 1);
    walls.forEach((wall, i) => {
      const index = current - 1 + i;
      const valid = index >= 1 && index <= rules.buildingCount;
      wall.style.display = valid ? 'block' : 'none';
      if (!valid) return;
      wall.style.background = hsvToHex(course.targets[index - 1]);
      wall.style.width = `${W - 6}px`;
      wall.style.transform = `translateX(${(index - 1 - block) * W + anchor}px)`;
    });
    if (shop) {
      shop.hidden = block >= 1.5;
      shop.style.width = `${W - 6}px`;
      shop.style.transform = `translateX(${(-1 - block) * W + anchor}px)`;
    }
  }
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
    // Only the currently playable TA wall receives its actual target color.
    setTimeAttackTarget(index,value) {
      if (index>=1&&index<=rules.buildingCount) course.targets[index-1]={...value};
    },
    outlineStyle: () => ({ stage: outlineInfo.stage, thickness: outlineInfo.thickness, rgb: [...outlineInfo.rgb] }),
    update({ t, color, policeStage = 0, presentation }) {
      if (disposed) return;
      stepper?.step(presentation, { drawable: false });
      if (escape) return;
      const block = t / rules.buildingMs;
      const current = Math.floor(block) + 1;
      applyOutline(presentation?.building ?? Math.min(rules.buildingCount, current));
      placeStreet(block);
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
    setBestDistance(value) { stepper?.setBestDistance(value); },
    presentationStats:()=>({mode,activeIds:[],enabled:false,staticDecorations:0,ambientParticles:0,drawCalls:0,geometries:0,textures:0}),
    forcePresentationEffect:()=>false,
    fx() {},
    async playEnding(kind, { signal, onFrame = () => {} } = {}) {
      if (signal?.aborted || disposed) return;
      onFrame(0);
      if (kind !== 'cleared') return;
      hero.classList.add('dom-hero-cleared');
      hero.style.setProperty('--clear-portrait', 'url("' + clearPortraitUrl + '")');
      const clock = createVisiblePresentationClock({visibilityTarget:document});
      await new Promise(resolve => {
        let frame;
        const stop = () => {
          cancelAnimationFrame(frame);
          signal?.removeEventListener('abort',stop);
          clock.dispose(); stopClearEnding=null; resolve();
        };
        const step = now => {
          if (signal?.aborted || disposed) return stop();
          const {elapsed}=clock(now,document.hidden);
          if (!document.hidden) onFrame(elapsed);
          if (elapsed>=3000) stop();
          else if (stopClearEnding) frame=requestAnimationFrame(step);
        };
        stopClearEnding=stop;
        signal?.addEventListener('abort',stop,{once:true});
        frame=requestAnimationFrame(step);
      });
    },
    async playOpening({ sceneT = rules.buildingMs * 0.4, color, signal, playbackRate = 1, onCue = () => {} } = {}) {
      if (!shop) return;
      hero.style.background = hsvToHex(color ?? { h: 12000, s: 7000, v: 9000 });
      escape = startShopEscape({
        destination: sceneT / rules.buildingMs, playbackRate, signal, onCue,
        reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        draw(pose) {
          placeStreet(pose.block);
          const width = root.clientWidth;
          const anchor = width * 0.32;
          const winX = anchor + (-1 - pose.block + 0.60) * width * 0.62;
          const jump = pose.jump * 28;
          const carryX = anchor + 31 - 51 * pose.stowed;
          const winHeight = root.clientHeight * 0.22;
          const carryHeight = 42 + jump - 14 * pose.stowed;
          hero.style.transform = `translateY(${-jump}px)`;
          shop.style.setProperty('--alarm', Math.round(100 * pose.alarm) + '%');
          jewel.style.left = `${winX + (carryX - winX) * pose.pickup}px`;
          jewel.style.bottom = `calc(18% + ${winHeight + (carryHeight - winHeight) * pose.pickup}px)`;
          jewel.hidden = pose.stowed === 1;
        },
      });
      await escape.finished;
      escape = null;
    },
    resetEnding() { stopClearEnding?.(); hero.classList.remove('dom-hero-cleared'); },
    stats: () => ({ objects: root.querySelectorAll('*').length }),
    resize() {},
    dispose() {
      disposed = true;
      escape?.stop();
      stopClearEnding?.();
      stepper?.dispose();
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
