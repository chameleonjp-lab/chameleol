// PC専用の操作設定と試運転バー。ゲームのバーと同じ速度変換を使用する。
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { createBrightnessInput, normalizeScrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED, SCROLL_SPEED_STEP } from './desktop-input.js';

export function desktopSettings({ scrollSpeed = 100, onChange = () => {} } = {}) {
  let speed = normalizeScrollSpeed(scrollSpeed);
  let value = 5000;
  let dragging = false;
  const slider = h('input', {
    type: 'range', min: String(MIN_SCROLL_SPEED), max: String(MAX_SCROLL_SPEED),
    step: String(SCROLL_SPEED_STEP), id: 'pc-scroll-speed', 'aria-label': t('settings.pcSpeed'),
    'data-testid': 'pc-scroll-speed',
  });
  slider.value = String(speed);
  const speedOutput = h('output', { for: 'pc-scroll-speed', class: 'pc-speed-output' }, speed + '%');
  const track = h('div', {
    class: 'pc-preview-track', role: 'slider', tabindex: '0',
    'aria-label': t('settings.pcPreview'), 'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-orientation': 'vertical', 'data-testid': 'pc-preview-bar',
  }, [
    h('div', { class: 'pc-preview-gradient', 'aria-hidden': 'true' }),
    h('div', { class: 'pc-preview-marker', 'aria-hidden': 'true' }),
  ]);
  const marker = track.querySelector('.pc-preview-marker');
  const readout = h('output', { class: 'pc-preview-value', 'data-testid': 'pc-preview-value', 'aria-live': 'polite' });
  const paint = () => {
    const pct = Math.round(value / 100);
    marker.style.top = (100 - value / 100) + '%';
    track.setAttribute('aria-valuenow', String(pct));
    readout.textContent = t('settings.pcPreviewValue', { n: pct });
  };
  const brightness = createBrightnessInput({
    read: () => value,
    write: (next) => { value = next; paint(); },
    speed: () => speed,
    pageHeight: () => track.getBoundingClientRect().height,
  });
  slider.addEventListener('input', () => {
    const next = normalizeScrollSpeed(slider.value);
    if (next === speed) return;
    speed = next;
    speedOutput.textContent = speed + '%';
    brightness.reset();
    onChange(speed);
  });
  track.addEventListener('wheel', (event) => {
    if (brightness.wheel(event)) event.preventDefault();
  }, { passive: false });
  track.addEventListener('keydown', (event) => {
    if (brightness.keydown(event)) event.preventDefault();
  });
  const setFromPointer = (event) => {
    const rect = track.getBoundingClientRect();
    if (!rect.height) return;
    value = Math.round(10000 * Math.max(0, Math.min(1, (rect.bottom - event.clientY) / rect.height)));
    brightness.reset();
    paint();
  };
  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    track.focus?.();
    setFromPointer(event);
    try { track.setPointerCapture(event.pointerId); } catch { /* optional */ }
    event.preventDefault();
  });
  track.addEventListener('pointermove', (event) => {
    if (dragging) setFromPointer(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    track.addEventListener(type, () => { dragging = false; });
  }
  paint();
  return h('div', { class: 'settings-pc', 'data-testid': 'pc-settings' }, [
    h('p', { class: 'note' }, t('settings.pcHelp')),
    h('label', { class: 'setting-row pc-speed-row' }, [
      h('span', {}, t('settings.pcSpeed')), slider, speedOutput,
    ]),
    h('p', { class: 'note' }, t('settings.pcPreviewHelp')),
    h('div', { class: 'pc-preview-area' }, [
      track,
      h('div', { class: 'pc-preview-description' }, [
        h('strong', {}, t('settings.pcPreview')),
        readout,
      ]),
    ]),
  ]);
}
