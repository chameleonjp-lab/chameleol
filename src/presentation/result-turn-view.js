// E090 回して見る：結果の主人公を、横になぞった時だけ回して見せる（主カードは回さない）。
// 描画器は所有者（result.resultRendererOwner）から 'model' で借り、閉じる・取り上げられる時に必ず手放す。
// 描くのは動かした時の1回だけ（描画ループを持たない）。横 8px 以上かつ縦より大きい動きだけ回転、縦はスクロールのまま。
import * as THREE from 'three';
import { t } from '../i18n/i18n.js';
import { rtext } from './result-card-text.js';
import { createPosedHero, PORTRAIT_MAX_BYTES } from './result-portrait.js';
import { RESULT_ATLAS } from './assets/result-atlas-bounds.js';

export const TURN_PANEL_ID = 'turn';
export const TURN_STAGE_PX = 300;
export const TURN_MAX_BACKING = 560;
export const TURN_MAX_BYTES = 1_254_400;
const TURN_THRESHOLD_PX = 8;
const TURN_PER_PX = 0.012;
const TURN_STEP = Math.PI / 6;
const BASE_ANGLE = -0.35;

const heroSignature = (hero) => JSON.stringify([hero?.status, hero?.building, hero?.hsv, hero?.outlineBuilding]);

/** 裏の大きさ（画素数の辺）。準備中は 300、それ以外は 560 以下で端末の倍率まで。 */
export function turnBackingSide(pending, devicePixelRatio = 1, portraitImage = null) {
  const ratio = pending ? 1 : Math.max(1, Math.min(Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1, TURN_MAX_BACKING / TURN_STAGE_PX));
  const pixels = (portraitImage?.width ?? portraitImage?.naturalWidth) * (portraitImage?.height ?? portraitImage?.naturalHeight);
  const portraitBytes = Number.isFinite(pixels) && pixels > 0 ? Math.min(PORTRAIT_MAX_BYTES, pixels * 4) : PORTRAIT_MAX_BYTES;
  // Count the No.28 eye canvas too. Pending reserves both its small screen card and PNG generation.
  const available = 16_777_216 - RESULT_ATLAS.width * RESULT_ATLAS.height * 4 - 256 * 256 * 4
    - portraitBytes - 1200 * 630 * 4 - (pending ? 600 * 315 * 4 : 0);
  return Math.min(Math.round(TURN_STAGE_PX * ratio), Math.floor(Math.sqrt(Math.max(0, available) / 4)));
}

/** E090 のパネル定義。getOwner は result.resultRendererOwner を返す。 */
export function createTurnPanel({ getSnapshot, register, getOwner, deps = {} }) {
  return {
    id: TURN_PANEL_ID,
    order: 70,
    labelKey: 'evidence.turn.title',
    labelFallback: (locale) => rtext('evidence.turn.title', undefined, locale),
    needsData: false,
    render(container, _data, ctx) {
      const doc = ctx.doc;
      const win = doc.defaultView;
      const el = (tag, cls, text, parent) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; parent?.append(n); return n; };
      const wrap = el('div', 'result-turn', null, container);
      wrap.setAttribute('data-testid', 'result-turn');
      const stage = el('div', 'result-turn-stage', null, wrap);
      stage.setAttribute('data-testid', 'result-turn-stage');
      const left = el('button', 'result-turn-step result-turn-left', '◀', stage);
      const right = el('button', 'result-turn-step result-turn-right', '▶', stage);
      left.type = 'button';
      right.type = 'button';
      const note = el('p', 'result-turn-note', null, wrap);
      note.setAttribute('aria-live', 'polite');
      const hint = el('p', 'result-turn-hint', null, wrap);

      let snapshot = getSnapshot();
      let disposed = false;
      let token = 0;
      let lease = null;
      let abort = null;
      let canvas = null;
      let rig = null;
      let scene = null;
      let camera = null;
      let angle = 0;
      let raf = 0;
      let sig = null;
      let waiting = false;
      let side = 0;
      const locale = () => snapshot?.model?.locale ?? 'en';

      const setTexts = () => {
        left.setAttribute('aria-label', rtext('evidence.turn.left', undefined, locale()));
        right.setAttribute('aria-label', rtext('evidence.turn.right', undefined, locale()));
        hint.textContent = rtext('evidence.turn.hint', undefined, locale());
        canvas?.setAttribute('aria-label', rtext('evidence.turn.alt', undefined, locale()));
      };

      function paint() {
        raf = 0;
        if (disposed || !lease || !rig || !canvas) return;
        try {
          rig.group.rotation.y = BASE_ANGLE + angle;
          lease.renderer.render(scene, camera);
        } catch { /* 描画の失敗で結果画面を止めない */ }
      }
      function schedule() {
        if (raf || disposed || !lease) return;
        const request = win?.requestAnimationFrame?.bind(win) ?? ((fn) => setTimeout(fn, 16));
        raf = request(paint);
      }

      /** 借りている物をすべて片付ける（描画器そのものは所有者が壊す）。冪等。 */
      function teardown() {
        if (raf) { try { (win?.cancelAnimationFrame ?? clearTimeout)(raf); } catch { /* noop */ } raf = 0; }
        abort?.abort();
        abort = null;
        if (scene && rig) scene.remove(rig.group);
        try { rig?.dispose?.(); } catch { /* noop */ }
        rig = null;
        scene = null;
        camera = null;
        if (canvas) { try { canvas.remove(); } catch { /* noop */ } canvas = null; }
        const l = lease;
        lease = null;
        side = 0;
        try { l?.release?.(); } catch { /* noop */ }
      }

      function show(text) { note.textContent = text ?? ''; }

      function applySize() {
        if (!lease) return;
        const pending = snapshot?.state === 'pending';
        const ratio = turnBackingSide(pending, win?.devicePixelRatio || 1, snapshot?.portraitImage) / TURN_STAGE_PX;
        lease.renderer.setPixelRatio(ratio);
        lease.renderer.setSize(TURN_STAGE_PX, TURN_STAGE_PX, false);
        side = canvas ? canvas.width : Math.round(TURN_STAGE_PX * ratio);
      }

      async function start() {
        teardown();
        const my = (token += 1);
        const hero = snapshot?.model?.hero;
        sig = heroSignature(hero);
        waiting = false;
        angle = 0;
        if (!hero || hero.status === 'pending') { show(t('evidence.pending', undefined, locale())); return; }
        const owner = getOwner?.();
        if (!owner) { show(t('evidence.unavailable', undefined, locale())); return; }
        show('');
        abort = new AbortController();
        const mine = abort;
        const onRevoke = () => {
          if (my !== token || disposed) return;
          // 撮影が優先：自分の表示を片付けて、カードの準備が終わるのを待つ。
          teardown();
          waiting = true;
          show(t('card.preparing', undefined, locale()));
        };
        let got = null;
        try { got = await owner.acquire('model', { signal: mine.signal, onRevoke }); } catch { got = null; }
        if (my !== token || disposed || mine.signal.aborted) { try { got?.release(); } catch { /* noop */ } return; }
        if (!got) { show(t('evidence.unavailable', undefined, locale())); return; }
        lease = got;
        try {
          canvas = lease.renderer.domElement;
          canvas.classList.add('result-turn-canvas');
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('data-testid', 'result-turn-canvas');
          stage.prepend(canvas);
          applySize();
          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
          camera.position.set(0, 1.7, 7.6);
          camera.lookAt(0, 1.3, 0);
          rig = createPosedHero(hero, deps);
          scene.add(rig.group);
          setTexts();
          paint();
        } catch {
          teardown();
          show(t('evidence.unavailable', undefined, locale()));
        }
      }

      // 操作：横 8px 以上かつ縦より大きい動きだけ回す。それまではタップ・スクロールのまま。
      let drag = null;
      const onDown = (event) => { if (event.target?.closest?.('.result-turn-step')) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, angle, turning: false }; };
      const onMove = (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (!drag.turning) {
          if (Math.abs(dx) >= TURN_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
            drag.turning = true;
            try { stage.setPointerCapture?.(event.pointerId); } catch { /* noop */ }
          } else return;
        }
        angle = drag.angle + dx * TURN_PER_PX;
        schedule();
        event.preventDefault?.();
      };
      const onUp = (event) => {
        if (!drag || (event && event.pointerId !== drag.id)) return;
        try { if (drag.turning) stage.releasePointerCapture?.(drag.id); } catch { /* noop */ }
        drag = null;
      };
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onUp);
      const step = (dir) => () => { angle += dir * TURN_STEP; schedule(); };
      const onLeft = step(-1), onRight = step(1);
      left.addEventListener('click', onLeft);
      right.addEventListener('click', onRight);
      setTexts();

      const instance = {
        update(next) {
          if (disposed || !next) return;
          const before = snapshot;
          snapshot = next;
          setTexts();
          const nextSig = heroSignature(next.model?.hero);
          if (nextSig !== sig) {
            // 主人公が変わった：手放して、撮影の後に今の model で借り直す。
            teardown();
            token += 1;
            sig = nextSig;
            waiting = true;
            show(t('card.preparing', undefined, locale()));
            if (next.state !== 'pending') void start();
            return;
          }
          if (waiting && next.state !== 'pending') { void start(); return; }
          if (lease && before?.state !== next.state) { applySize(); schedule(); }
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          token += 1;
          stage.removeEventListener('pointerdown', onDown);
          stage.removeEventListener('pointermove', onMove);
          stage.removeEventListener('pointerup', onUp);
          stage.removeEventListener('pointercancel', onUp);
          left.removeEventListener('click', onLeft);
          right.removeEventListener('click', onRight);
          teardown();
          unregister?.();
          wrap.remove();
        },
        stats() {
          return { leased: Boolean(lease), waiting, canvasBytes: canvas ? canvas.width * canvas.height * 4 : 0, backingSide: side, angle };
        },
        /** 試験用：今の向き。 */
        get angle() { return angle; },
      };
      const unregister = register?.(instance);
      void start();
      return instance;
    },
  };
}
