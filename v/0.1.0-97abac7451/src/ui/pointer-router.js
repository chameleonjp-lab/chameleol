// 指（ポインター）ごとに、押し始めた操作部品を記憶して値へ変える。画面（DOM）から切り離した純粋な処理。
// - パレット：円外は外周へ制限。遠く外れたら最後の値を保持し、戻ると追跡を再開する。
// - バー：上下の外は端の値。遠く外れたら保持。
// - 別の指は先の指を奪わない。指が他方の部品の上へ入っても対象を変えない。
import { RULES_V1, hsFromPoint, vFromBar } from '../rules/v1/index.js';

export const DEFAULT_TOLERANCE = Object.freeze({
  paletteHitScale: 1.12, // 押し始めの当たり判定（半径の倍率）
  paletteFarScale: 1.9, // これより遠くは保持（半径の倍率）
  barHitPadX: 14,
  barHitPadY: 10,
  barFarPadX: 64,
  barFarScaleY: 0.35,
});

export function createPointerRouter({ rules = RULES_V1, tolerance = DEFAULT_TOLERANCE, onChange = () => {}, onLockedTap = () => {} } = {}) {
  let geometry = { palette: { cx: 0, cy: 0, r: 1 }, bar: { x: 0, y: 0, w: 1, h: 1 } };
  const values = { ...rules.initialColor };
  let barLocked = true;
  let enabled = true;
  const byPointer = new Map(); // pointerId → 'palette' | 'bar'
  const byPart = new Map(); // part → pointerId

  const emit = (next) => {
    if (next.h === values.h && next.s === values.s && next.v === values.v) return;
    Object.assign(values, next);
    onChange({ ...values });
  };

  function hit(x, y) {
    const p = geometry.palette;
    const dx = x - p.cx;
    const dy = y - p.cy;
    const inPalette = Math.sqrt(dx * dx + dy * dy) <= p.r * tolerance.paletteHitScale;
    const b = geometry.bar;
    const inBar =
      x >= b.x - tolerance.barHitPadX &&
      x <= b.x + b.w + tolerance.barHitPadX &&
      y >= b.y - tolerance.barHitPadY &&
      y <= b.y + b.h + tolerance.barHitPadY;
    if (inPalette && inBar) {
      const barDist = Math.abs(x - (b.x + b.w / 2));
      return barDist < Math.sqrt(dx * dx + dy * dy) - p.r ? 'bar' : 'palette';
    }
    if (inPalette) return 'palette';
    if (inBar) return 'bar';
    return null;
  }

  function track(part, x, y) {
    if (part === 'palette') {
      const p = geometry.palette;
      const dx = x - p.cx;
      const dy = y - p.cy;
      if (Math.sqrt(dx * dx + dy * dy) > p.r * tolerance.paletteFarScale) return; // 保持
      const hs = hsFromPoint(dx, dy, p.r, rules);
      // 中心ちょうどでは色合いが決まらないので、前の色合いを残す
      emit({ h: hs.s === 0 ? values.h : hs.h, s: hs.s, v: values.v });
    } else if (part === 'bar') {
      if (barLocked) return;
      const b = geometry.bar;
      const farY = b.h * tolerance.barFarScaleY;
      if (x < b.x - tolerance.barFarPadX || x > b.x + b.w + tolerance.barFarPadX) return;
      if (y < b.y - farY || y > b.y + b.h + farY) return;
      emit({ h: values.h, s: values.s, v: vFromBar(y - b.y, b.h, rules) });
    }
  }

  return {
    setGeometry(next) {
      geometry = next;
    },
    get geometry() {
      return geometry;
    },
    setValues(next) {
      Object.assign(values, next);
    },
    get values() {
      return { ...values };
    },
    setBarLocked(locked) {
      barLocked = locked;
      if (locked && byPart.has('bar')) {
        byPointer.delete(byPart.get('bar'));
        byPart.delete('bar');
      }
    },
    get barLocked() {
      return barLocked;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) this.releaseAll();
    },
    /** 押し始め。割り当てた部品名、ロック中のバーなら 'bar-locked'、対象外なら null。 */
    down(pointerId, x, y) {
      if (!enabled || byPointer.has(pointerId)) return null;
      const part = hit(x, y);
      if (!part) return null;
      if (part === 'bar' && barLocked) {
        onLockedTap();
        return 'bar-locked';
      }
      if (byPart.has(part)) return null; // 先の指を奪わない
      byPointer.set(pointerId, part);
      byPart.set(part, pointerId);
      track(part, x, y); // 再タップは触れた位置を直接選ぶ
      return part;
    },
    move(pointerId, x, y) {
      if (!enabled) return;
      const part = byPointer.get(pointerId);
      if (part) track(part, x, y);
    },
    up(pointerId) {
      const part = byPointer.get(pointerId);
      if (!part) return;
      byPointer.delete(pointerId);
      byPart.delete(part);
    },
    cancel(pointerId) {
      this.up(pointerId);
    },
    /** 中断・画面離脱：指の割り当てだけを解放し、値は残す。 */
    releaseAll() {
      byPointer.clear();
      byPart.clear();
    },
    activeParts() {
      return [...byPart.keys()];
    },
  };
}
