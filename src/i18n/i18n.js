// 翻訳。辞書はすべて同梱し、通信できなくても言語を切り替えられるようにする。
// 名前や内部IDは翻訳しない。数値の地域向け表示は画面だけに使い、送信・比較には使わない。
import { MESSAGES } from './messages/index.js';
import { getLanguageLocale, isSupportedLanguage } from './languages.js';

let current = 'ja';
const listeners = new Set();

export function getLanguage() {
  return current;
}

export function setLanguage(id) {
  if (!isSupportedLanguage(id)) return false;
  current = id;
  if (globalThis.document?.documentElement) {
    document.documentElement.lang = id;
    document.documentElement.dir = 'ltr';
  }
  for (const fn of listeners) fn(id);
  return true;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function fill(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in params ? String(params[key]) : m));
}

/** 文言を引く。見つからなければ英語、次に日本語、最後にキーそのもの。 */
export function t(key, params, lang = current) {
  const dict = MESSAGES[lang] ?? MESSAGES.en;
  const template = dict[key] ?? MESSAGES.en[key] ?? MESSAGES.ja[key] ?? key;
  return fill(template, params);
}

/** 画面表示用の数値（地域の区切り）。送信や比較には使わない。 */
export function formatNumber(value, options = {}, lang = current) {
  try {
    return new Intl.NumberFormat(getLanguageLocale(lang), options).format(value);
  } catch {
    return String(value);
  }
}

/** 0.01%単位の整数を「86.67%」のように表示する（地域の小数点記号を使う）。 */
export function formatPercent2(value, lang = current) {
  if (value == null) return '—';
  return `${formatNumber(value / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, lang)}%`;
}

/** 1%の100万分の1単位の一致度を、練習の表示用に小数1桁で。 */
export function formatMatch(units, lang = current) {
  if (units == null) return '—';
  return `${formatNumber(Math.floor(units / 100000) / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, lang)}%`;
}

export function formatSeconds(ms, lang = current) {
  if (ms == null) return '—';
  return t('unit.seconds', { n: formatNumber(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, lang) }, lang);
}
