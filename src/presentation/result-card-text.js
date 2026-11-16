// 結果画面の文言を引く。15辞書にまだ無いキー（設計票 §3.12）は、英語の控えで進める。
// 翻訳は実装の完了後にまとめて辞書へ入れる。辞書へ入ったキーは自動でそちらが使われ、控えは使われなくなる。
// 辞書は編集しない。使った控えは USED_FALLBACKS で一覧にできる（受渡し票用）。
import { t } from '../i18n/i18n.js';

/** 控え：key → [英語の文, 使う場所]。null の文は「文なし」（表示の枠だけで伝える）。 */
export const FALLBACK_TEXT = Object.freeze({
  'card.bonusMissing': [null, 'result-card-draw：旧版・破損のボーナス件数（代わりに bonus.card.title＋evidence.colors.missing）'],
  'card.shareFailed': [null, 'result-card-view：共有失敗の案内（文なし。小ボタン行の枠を強調）'],
  'card.viewerTitle': [null, 'result-card-view：保存画面の見出し（代わりに card.save）'],
  'evidence.model.title': ['City model', 'result-miniature-view：チップの名前'],
  'evidence.model.passed': ['Passed', 'result-miniature-view：凡例'],
  'evidence.model.arrived': ['Reached', 'result-miniature-view：凡例'],
  'evidence.model.unreached': ['Not reached', 'result-miniature-view：凡例'],
  'evidence.model.missing': ['No color record', 'result-miniature-view：凡例'],
  'evidence.model.alt': ['City model. {passed} of 50 buildings passed, reached building {arrived}.', 'result-miniature-view：読み上げ'],
  'evidence.turn.title': ['Turn and look', 'result-turn-view：チップの名前'],
  'evidence.turn.hint': ['Drag left or right to turn.', 'result-turn-view：説明の1行'],
  'evidence.turn.left': ['Turn left', 'result-turn-view：左ボタン'],
  'evidence.turn.right': ['Turn right', 'result-turn-view：右ボタン'],
  'evidence.turn.alt': ['This run’s chameleon. It can be turned left and right.', 'result-turn-view：読み上げ'],
  'presentation.nearPerfect': ['Near perfect!', 'bonus-view（C）：精密札'],
});

export const USED_FALLBACKS = new Set();

const fill = (template, params) => (params ? template.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : template);

/** 辞書に有ればそれ、無ければ英語の控え、控えが「文なし」ならキーを返さず null。 */
export function rtext(key, params, locale) {
  const value = t(key, params, locale);
  if (value !== key) return value;
  const fallback = FALLBACK_TEXT[key];
  if (!fallback) return key;
  USED_FALLBACKS.add(key);
  return fallback[0] === null ? null : fill(fallback[0], params);
}

/** 控えを使ったキーの一覧（key・控えの文・使う場所）。 */
export function usedFallbackReport() {
  return [...USED_FALLBACKS].sort().map((key) => ({ key, text: FALLBACK_TEXT[key][0], where: FALLBACK_TEXT[key][1] }));
}
