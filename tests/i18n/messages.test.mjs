// 15言語の辞書（受入試験 LANG-TEST-01/02 の判定部分）。翻訳の自然さは自動では確かめられないため、別に記録する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { LANGUAGE_IDS, SUPPORTED_LANGUAGES, resolveLanguage, languageFromLocale } from '../../src/i18n/languages.js';
import { t } from '../../src/i18n/i18n.js';
import { buildResultShareText, buildIntentUrl } from '../../src/ui/share.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// サイノメ js/language-options.js（commit 82055351bf8c8b0bae3fa3e00172325eff1d0237）で確認した定義
const SAINOME = [
  ['ja', '日本語', 'ja-JP'], ['en', 'English', 'en-US'], ['es', 'Español', 'es-ES'], ['pt-BR', 'Português (Brasil)', 'pt-BR'],
  ['zh-Hans', '简体中文', 'zh-CN'], ['fr', 'Français', 'fr-FR'], ['de', 'Deutsch', 'de-DE'], ['ko', '한국어', 'ko-KR'],
  ['ru', 'Русский', 'ru-RU'], ['it', 'Italiano', 'it-IT'], ['zh-Hant', '繁體中文', 'zh-TW'], ['id', 'Bahasa Indonesia', 'id-ID'],
  ['tr', 'Türkçe', 'tr-TR'], ['vi', 'Tiếng Việt', 'vi-VN'], ['th', 'ไทย', 'th-TH'],
];

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (p.endsWith('.js') && !p.includes(`${join('i18n', 'messages')}`)) yield p;
  }
}

test('LANG-01: 15言語の識別子・名称・地域設定がサイノメの定義と同じ', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES.map((l) => [l.id, l.name, l.locale]), SAINOME);
  assert.deepEqual(Object.keys(MESSAGES).sort(), [...LANGUAGE_IDS].sort());
});

test('LANG-TEST-01: 15辞書の全キー・埋め込み値が日本語と一致し、空の文言がない', () => {
  const base = MESSAGES.ja;
  const keys = Object.keys(base).sort();
  for (const lang of LANGUAGE_IDS) {
    const dict = MESSAGES[lang];
    assert.deepEqual(Object.keys(dict).sort(), keys, `${lang}: keys`);
    for (const k of keys) {
      assert.equal(typeof dict[k], 'string', `${lang}.${k}`);
      assert.ok(dict[k].trim().length > 0, `${lang}.${k} is empty`);
      assert.deepEqual(placeholders(dict[k]), placeholders(base[k]), `${lang}.${k} placeholders`);
    }
  }
});

test('英語以外の辞書が英語の文をそのまま流用していない（外来語として同じ綴りの語は5%まで）', () => {
  const keys = Object.keys(MESSAGES.en).filter((k) => /[A-Za-z]{4,}/.test(MESSAGES.en[k]) && !['app.title', 'share.home.title', 'share.hashtag'].includes(k));
  for (const lang of LANGUAGE_IDS.filter((l) => l !== 'en')) {
    const same = keys.filter((k) => MESSAGES[lang][k] === MESSAGES.en[k]);
    assert.ok(same.length <= keys.length * 0.05, `${lang} copies English: ${same.join(', ')}`);
    // 文章（10語以上）が英語と同じものは許さない
    assert.deepEqual(same.filter((k) => MESSAGES.en[k].split(' ').length >= 10), [], lang);
  }
});

test('ソースで使う翻訳キーは、すべて辞書にある', () => {
  const used = new Set();
  for (const f of sourceFiles(join(ROOT, 'src'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\b(?:t|button|toast)\(\s*'([a-zA-Z0-9_.]+\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/(?:titleKey|bodyKey|key): '([a-zA-Z0-9_.]+\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/'((?:guide|howto|game|practice|result|records|settings|share|notice|start|storage|pause|ranking|name|controls|common|home)\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  for (const k of ['easy', 'standard', 'hard']) used.add(`practice.difficulty.${k}`);
  for (const k of ['basic', 'brightness']) used.add(`practice.kind.${k}`);
  for (const k of ['music', 'sfx', 'ambient']) used.add(`settings.${k}`);
  const missing = [...used].filter((k) => !(k in MESSAGES.ja));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 150, `used ${used.size}`);
});

test('LANG-TEST-02: 保存した言語→対応するブラウザ言語→未対応のみなら英語→言語情報なしなら日本語', () => {
  assert.equal(resolveLanguage('th', ['fr-FR']), 'th');
  assert.equal(resolveLanguage(null, ['fr-CA', 'en']), 'fr');
  assert.equal(resolveLanguage(undefined, ['xx-YY', 'de-AT']), 'de');
  assert.equal(resolveLanguage(null, ['xx', 'yy']), 'en');
  assert.equal(resolveLanguage(null, []), 'ja');
  assert.equal(resolveLanguage('xx', null), 'ja');
  assert.equal(languageFromLocale('zh-TW'), 'zh-Hant');
  assert.equal(languageFromLocale('zh-HK'), 'zh-Hant');
  assert.equal(languageFromLocale('zh-Hant-CN'), 'zh-Hant');
  assert.equal(languageFromLocale('zh-CN'), 'zh-Hans');
  assert.equal(languageFromLocale('zh'), 'zh-Hans');
  assert.equal(languageFromLocale('pt-PT'), 'pt-BR');
  assert.equal(languageFromLocale('es_MX'), 'es');
});

test('SHARE-TEST-01: 共有文は選んだ言語で作り、未確定の順位を入れない。照会情報やIDを含めない', () => {
  for (const lang of LANGUAGE_IDS) {
    const official = buildResultShareText({ result: { buildings: 50, rankAverage: 9235, endReason: 'cleared' }, officialRank: 3, lang });
    const pending = buildResultShareText({ result: { buildings: 50, rankAverage: 9235, endReason: 'cleared' }, officialRank: null, lang });
    assert.ok(official.includes(t('share.result.title', null, lang)), lang);
    assert.ok(official.split('\n').length > pending.split('\n').length, `${lang}: rank only when official`);
    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}/.test(official), false);
  }
  const url = buildIntentUrl({ text: 'a&b #x\n改行', url: 'https://example.invalid/game/' });
  assert.ok(url.startsWith('https://x.com/intent/post?'));
  const q = new URL(url).searchParams;
  assert.equal(q.get('text'), 'a&b #x\n改行');
  assert.equal(q.get('url'), 'https://example.invalid/game/');
});
