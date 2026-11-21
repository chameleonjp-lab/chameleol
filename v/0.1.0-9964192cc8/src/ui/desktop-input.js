// PC向けの入力判定・明るさ操作。表示値だけを変え、採点・保存形式には触れない。
export const DEFAULT_SCROLL_SPEED = 100;
export const MIN_SCROLL_SPEED = 25;
export const MAX_SCROLL_SPEED = 300;
export const SCROLL_SPEED_STEP = 25;
export const KEY_BRIGHTNESS_STEP = 200; // 2% / key press (OS repeat is supported).

/** タッチ端末やiPadをPC設定対象と誤判定しない。PCのタッチ操作は従来どおり使える。 */
export function hasDesktopControls({ navigator: nav = globalThis.navigator, matchMedia = globalThis.matchMedia } = {}) {
  if (nav?.userAgentData?.mobile === true) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent ?? '')) return false;
  if (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1) return false;
  try {
    return Boolean(matchMedia?.call(globalThis, '(hover: hover) and (pointer: fine)')?.matches);
  } catch {
    return false;
  }
}

export function normalizeScrollSpeed(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_SCROLL_SPEED;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SCROLL_SPEED;
  return Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, Math.round(n / SCROLL_SPEED_STEP) * SCROLL_SPEED_STEP));
}

export function clampBrightness(value, valMax = 10000) {
  return Math.max(0, Math.min(valMax, Math.round(value)));
}

/** WheelEvent の単位差（ピクセル、行、ページ）を吸収。上へ回すと明るくする。 */
export function wheelBrightnessDelta(event, speed = DEFAULT_SCROLL_SPEED, pageHeight = 240) {
  const raw = Number(event?.deltaY);
  if (!Number.isFinite(raw) || raw === 0) return 0;
  const unit = event?.deltaMode === 1 ? 16 : event?.deltaMode === 2 ? Math.max(240, pageHeight) : 1;
  return -raw * unit * 5 * normalizeScrollSpeed(speed) / DEFAULT_SCROLL_SPEED;
}

export function keyBrightnessDelta(key) {
  if (key === 'ArrowUp' || String(key).toLowerCase() === 'w') return KEY_BRIGHTNESS_STEP;
  if (key === 'ArrowDown' || String(key).toLowerCase() === 's') return -KEY_BRIGHTNESS_STEP;
  return 0;
}

export function isTypingTarget(target) {
  if (target?.isContentEditable) return true;
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

/** 本編と設定画面の見本が同じ変換・速度・境界処理を使う。 */
export function createBrightnessInput({
  read,
  write,
  canOperate = () => true,
  speed = () => DEFAULT_SCROLL_SPEED,
  valMax = 10000,
  pageHeight = () => 240,
}) {
  let wheelRemainder = 0;
  const canHandle = (event) =>
    canOperate() && !event?.ctrlKey && !event?.metaKey && !event?.altKey && !isTypingTarget(event?.target);

  return {
    wheel(event) {
      if (!canHandle(event)) return false;
      const delta = wheelBrightnessDelta(event, speed(), pageHeight());
      if (delta === 0) return false;
      const combined = wheelRemainder + delta;
      const whole = Math.trunc(combined);
      wheelRemainder = combined - whole; // 小さなトラックパッド操作も積算する。
      if (whole) {
        const before = read();
        const next = clampBrightness(before + whole, valMax);
        if (next !== before) write(next);
        else wheelRemainder = 0;
      }
      return true;
    },
    keydown(event) {
      if (!canHandle(event) || event?.isComposing) return false;
      const delta = keyBrightnessDelta(event?.key);
      if (!delta) return false;
      wheelRemainder = 0;
      const before = read();
      const next = clampBrightness(before + delta, valMax);
      if (next !== before) write(next);
      return true;
    },
    reset() {
      wheelRemainder = 0;
    },
  };
}
