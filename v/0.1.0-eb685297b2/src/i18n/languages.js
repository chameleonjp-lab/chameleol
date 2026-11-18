// 対応言語。サイノメ js/language-options.js（確認時 commit 82055351bf8c8b0bae3fa3e00172325eff1d0237）と同じ15言語・同じ名称・同じ地域設定。
export const SUPPORTED_LANGUAGES = Object.freeze(
  [
    { id: 'ja', name: '日本語', locale: 'ja-JP' },
    { id: 'en', name: 'English', locale: 'en-US' },
    { id: 'es', name: 'Español', locale: 'es-ES' },
    { id: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
    { id: 'zh-Hans', name: '简体中文', locale: 'zh-CN' },
    { id: 'fr', name: 'Français', locale: 'fr-FR' },
    { id: 'de', name: 'Deutsch', locale: 'de-DE' },
    { id: 'ko', name: '한국어', locale: 'ko-KR' },
    { id: 'ru', name: 'Русский', locale: 'ru-RU' },
    { id: 'it', name: 'Italiano', locale: 'it-IT' },
    { id: 'zh-Hant', name: '繁體中文', locale: 'zh-TW' },
    { id: 'id', name: 'Bahasa Indonesia', locale: 'id-ID' },
    { id: 'tr', name: 'Türkçe', locale: 'tr-TR' },
    { id: 'vi', name: 'Tiếng Việt', locale: 'vi-VN' },
    { id: 'th', name: 'ไทย', locale: 'th-TH' },
  ].map(Object.freeze),
);

export const LANGUAGE_IDS = Object.freeze(SUPPORTED_LANGUAGES.map((l) => l.id));

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.some(({ id }) => id === language);
}

export function getLanguageLocale(language) {
  return SUPPORTED_LANGUAGES.find(({ id }) => id === language)?.locale ?? 'en-US';
}

/** ブラウザの言語タグ → 対応言語（なければ null）。サイノメと同じ規則。 */
export function languageFromLocale(locale) {
  if (typeof locale !== 'string') return null;
  const tag = locale.trim().toLowerCase().replaceAll('_', '-');
  const parts = tag.split('-');
  const base = parts[0];
  if (base === 'zh') {
    if (parts.includes('hant')) return 'zh-Hant';
    if (parts.includes('hans')) return 'zh-Hans';
    return parts.some((part) => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-Hant' : 'zh-Hans';
  }
  if (base === 'pt') return 'pt-BR';
  return isSupportedLanguage(base) ? base : null;
}

/**
 * 表示言語を決める：保存した言語 → 対応するブラウザ言語 → 未対応のみなら英語 → 言語情報なしなら日本語。
 */
export function resolveLanguage(saved, browserLanguages) {
  if (isSupportedLanguage(saved)) return saved;
  const list = Array.isArray(browserLanguages) ? browserLanguages.filter((x) => typeof x === 'string' && x.trim()) : [];
  if (!list.length) return 'ja';
  for (const tag of list) {
    const id = languageFromLocale(tag);
    if (id) return id;
  }
  return 'en';
}
