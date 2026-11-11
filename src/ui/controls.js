// 円形パレット（色合い・鮮やかさ）と縦バー（明るさ）。本編と練習で同じ部品を使う。
// 位置とサイズは途中解放で変えない。プレビューとマーカーはタッチを奪わない（pointer-events: none）。
import { RULES_V1, hsvToHex, pointFromHs, barFromV } from '../rules/v1/index.js';
import { createPointerRouter } from './pointer-router.js';
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';

function drawPalette(canvas, size) {
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  const px = Math.max(2, Math.round(size * dpr));
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(px, px);
  const r = px / 2;
  for (let y = 0; y < px; y += 1) {
    for (let x = 0; x < px; x += 1) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * px + x) * 4;
      if (dist > r) {
        img.data[i + 3] = 0;
        continue;
      }
      // 真上0度・時計回り。表示用なので組み込み関数で描く（採点には使わない）。
      let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      const s = Math.min(1, dist / r);
      const hh = deg / 60;
      const c = s;
      const xx = c * (1 - Math.abs((hh % 2) - 1));
      const m = 1 - c;
      const sec = Math.floor(hh) % 6;
      const rgb = [
        [c, xx, 0],
        [xx, c, 0],
        [0, c, xx],
        [0, xx, c],
        [xx, 0, c],
        [c, 0, xx],
      ][sec];
      img.data[i] = Math.round((rgb[0] + m) * 255);
      img.data[i + 1] = Math.round((rgb[1] + m) * 255);
      img.data[i + 2] = Math.round((rgb[2] + m) * 255);
      // 縁をなめらかに
      img.data[i + 3] = dist > r - 1 ? Math.round(255 * (r - dist)) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * root に操作部品を作る。
 * onChange({h,s,v}) は整数の値が変わった時だけ呼ばれる。
 */
export function createControls({ rules = RULES_V1, onChange = () => {}, onLockedTap = () => {} } = {}) {
  const canvas = h('canvas', { class: 'palette-canvas', 'aria-hidden': 'true' });
  const paletteMarker = h('div', { class: 'marker palette-marker', 'aria-hidden': 'true' });
  const paletteGuide = h('div', { class: 'guide-target palette-guide-target', 'aria-hidden': 'true', style: {pointerEvents:'none',position:'absolute',left:'0',top:'0',display:'none'} });
  const palette = h('div', { class: 'palette', role: 'slider', 'aria-label': t('controls.palette') }, [canvas, paletteGuide, paletteMarker]);
  const barFill = h('div', { class: 'bar-fill' });
  const barMarker = h('div', { class: 'marker bar-marker', 'aria-hidden': 'true' });
  const barGuide = h('div', { class: 'guide-target bar-guide-target', 'aria-hidden': 'true', style: {pointerEvents:'none',position:'absolute',top:'0',display:'none'} });
  const lockLabel = h('div', { class: 'bar-lock' }, [h('span', { class: 'lock-icon', 'aria-hidden': 'true' }, '🔒'), h('span', { class: 'lock-text', 'data-i18n': 'controls.locked' }, t('controls.locked'))]);
  const bar = h('div', { class: 'bar', role: 'slider', 'aria-label': t('controls.bar') }, [barFill, barGuide, barMarker, lockLabel]);
  const barHint = h('div', { class: 'bar-hint', 'aria-hidden': 'true' }, [
    h('span', { 'data-i18n': 'controls.barTop' }, t('controls.barTop')),
    h('span', { 'data-i18n': 'controls.barBottom' }, t('controls.barBottom')),
  ]);
  const preview = h('div', { class: 'preview', 'aria-label': t('controls.preview') });
  const el = h('div', { class: 'controls' }, [preview, palette, h('div', { class: 'bar-wrap' }, [bar, barHint])]);

  const router = createPointerRouter({ rules, onChange: (v) => render(v) || onChange(v), onLockedTap });
  let paletteSize = 0;
  let guideTarget = null;

  function render(values = router.values) {
    if (guideTarget) {
      const radius = router.geometry.palette.r;
      const pos = pointFromHs(guideTarget.h, guideTarget.s, radius);
      paletteGuide.style.transform = `translate(${radius + pos.dx}px, ${radius + pos.dy}px) translate(-50%, -50%)`;
      barGuide.style.transform = `translate(-50%, ${barFromV(guideTarget.v, router.geometry.bar.h)}px) translateY(-50%)`;
    }
    const hex = hsvToHex(values);
    preview.style.background = hex;
    const { r } = router.geometry.palette;
    const p = pointFromHs(values.h, values.s, r);
    paletteMarker.style.transform = `translate(${r + p.dx}px, ${r + p.dy}px)`;
    const full = hsvToHex({ h: values.h, s: values.s, v: rules.valMax });
    barFill.style.background = `linear-gradient(to bottom, ${full}, #000)`;
    const bh = router.geometry.bar.h;
    barMarker.style.transform = `translateY(${barFromV(values.v, bh)}px)`;
    palette.setAttribute('aria-valuetext', `${Math.round(values.h / 100)}°, ${Math.round(values.s / 100)}%`);
    bar.setAttribute('aria-valuetext', `${Math.round(values.v / 100)}%`);
  }

  function layout() {
    const pr = palette.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const size = Math.min(pr.width, pr.height);
    if (size > 0 && Math.abs(size - paletteSize) > 0.5) {
      paletteSize = size;
      drawPalette(canvas, size);
    }
    router.setGeometry({
      palette: { cx: pr.left + pr.width / 2, cy: pr.top + pr.height / 2, r: size / 2 },
      bar: { x: br.left, y: br.top, w: br.width, h: br.height },
    });
    render();
  }

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const part = router.down(e.pointerId, e.clientX, e.clientY);
    if (part === 'palette' || part === 'bar') {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 一部のブラウザでは失敗してもよい */
      }
      e.preventDefault();
    }
  };
  const onMove = (e) => router.move(e.pointerId, e.clientX, e.clientY);
  const onUp = (e) => router.up(e.pointerId);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  // iOSの長押しメニュー・拡大・選択を操作領域でだけ止める
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  const resize = () => layout();
  globalThis.addEventListener?.('resize', resize);

  return {
    el,
    router,
    layout,
    setGuideTarget(target) {
      guideTarget = target;
      paletteGuide.style.display = target ? '' : 'none';
      barGuide.style.display = target && target.showBrightness !== false ? '' : 'none';
      render();
    },
    setValues(values) {
      router.setValues(values);
      render();
    },
    get values() {
      return router.values;
    },
    setLocked(locked) {
      router.setBarLocked(locked);
      el.classList.toggle('bar-locked', locked);
      lockLabel.hidden = !locked;
    },
    setEnabled(on) {
      router.setEnabled(on);
      el.classList.toggle('disabled', !on);
    },
    releaseAll() {
      router.releaseAll();
    },
    destroy() {
      globalThis.removeEventListener?.('resize', resize);
    },
  };
}
