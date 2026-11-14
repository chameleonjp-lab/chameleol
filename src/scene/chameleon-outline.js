/**
 * 主人公の外周線を、本編の棟（1〜50）に応じて8段階にする表。
 * three を読み込まない純粋なデータと関数だけ。値は仕様 DES-02 と
 * docs/requirements/chameleol-design-followups.json の outline に一致させる。
 * 40〜50棟は現行の太さ 0.085・色 0.1059（シェーダーの定数と同じ値）。
 */
export const DEFAULT_OUTLINE_RGB = Object.freeze([0.1059, 0.1059, 0.1059]);

const gray = (v) => Object.freeze([v / 255, v / 255, v / 255]);

export const OUTLINE_STAGES = Object.freeze([
  Object.freeze({ stage: 0, from: 1, to: 10, thickness: 0.0255, rgb: gray(158) }),
  Object.freeze({ stage: 1, from: 11, to: 15, thickness: 0.034, rgb: gray(139) }),
  Object.freeze({ stage: 2, from: 16, to: 20, thickness: 0.0425, rgb: gray(120) }),
  Object.freeze({ stage: 3, from: 21, to: 25, thickness: 0.051, rgb: gray(101) }),
  Object.freeze({ stage: 4, from: 26, to: 30, thickness: 0.0595, rgb: gray(82) }),
  Object.freeze({ stage: 5, from: 31, to: 35, thickness: 0.068, rgb: gray(63) }),
  Object.freeze({ stage: 6, from: 36, to: 39, thickness: 0.0765, rgb: gray(44) }),
  Object.freeze({ stage: 7, from: 40, to: 50, thickness: 0.085, rgb: DEFAULT_OUTLINE_RGB }),
]);

/** 最終段階（現行の見た目）。主人公の初期値。 */
export const CURRENT_OUTLINE_STAGE = OUTLINE_STAGES.length - 1;

/**
 * 棟番号から線の段階を返す。凍結済みの同じ要素を返す（呼ぶたびに作らない）。
 * 1〜50の整数以外は最初の段階。
 */
export function outlineForBuilding(building) {
  if (typeof building !== 'number' || !Number.isInteger(building) || building < 1 || building > 50) return OUTLINE_STAGES[0];
  for (const row of OUTLINE_STAGES) {
    if (building <= row.to) return row;
  }
  return OUTLINE_STAGES[0];
}
