// すべての言語の辞書（同梱して、通信なしでも切り替えられるようにする）。
// 言語の一覧と順番は src/i18n/languages.js（サイノメと同じ15言語）。
import ja from './ja.js';
import en from './en.js';
import es from './es.js';
import ptBR from './pt-BR.js';
import zhHans from './zh-Hans.js';
import fr from './fr.js';
import de from './de.js';
import ko from './ko.js';
import ru from './ru.js';
import it from './it.js';
import zhHant from './zh-Hant.js';
import id from './id.js';
import tr from './tr.js';
import vi from './vi.js';
import th from './th.js';
import { PC_MESSAGES } from './desktop-extra.js';
import { TIME_ATTACK_MESSAGES } from './time-attack.js';
import { TIME_ATTACK_TITLE_MESSAGES } from './time-attack-titles.js';

export const MESSAGES = Object.freeze({
  ja: { ...ja, ...PC_MESSAGES["ja"], ...TIME_ATTACK_MESSAGES["ja"], ...TIME_ATTACK_TITLE_MESSAGES["ja"] },
  en: { ...en, ...PC_MESSAGES["en"], ...TIME_ATTACK_MESSAGES["en"], ...TIME_ATTACK_TITLE_MESSAGES["en"] },
  es: { ...es, ...PC_MESSAGES["es"], ...TIME_ATTACK_MESSAGES["es"], ...TIME_ATTACK_TITLE_MESSAGES["es"] },
  'pt-BR': { ...ptBR, ...PC_MESSAGES["pt-BR"], ...TIME_ATTACK_MESSAGES["pt-BR"], ...TIME_ATTACK_TITLE_MESSAGES["pt-BR"] },
  'zh-Hans': { ...zhHans, ...PC_MESSAGES["zh-Hans"], ...TIME_ATTACK_MESSAGES["zh-Hans"], ...TIME_ATTACK_TITLE_MESSAGES["zh-Hans"] },
  fr: { ...fr, ...PC_MESSAGES["fr"], ...TIME_ATTACK_MESSAGES["fr"], ...TIME_ATTACK_TITLE_MESSAGES["fr"] },
  de: { ...de, ...PC_MESSAGES["de"], ...TIME_ATTACK_MESSAGES["de"], ...TIME_ATTACK_TITLE_MESSAGES["de"] },
  ko: { ...ko, ...PC_MESSAGES["ko"], ...TIME_ATTACK_MESSAGES["ko"], ...TIME_ATTACK_TITLE_MESSAGES["ko"] },
  ru: { ...ru, ...PC_MESSAGES["ru"], ...TIME_ATTACK_MESSAGES["ru"], ...TIME_ATTACK_TITLE_MESSAGES["ru"] },
  it: { ...it, ...PC_MESSAGES["it"], ...TIME_ATTACK_MESSAGES["it"], ...TIME_ATTACK_TITLE_MESSAGES["it"] },
  'zh-Hant': { ...zhHant, ...PC_MESSAGES["zh-Hant"], ...TIME_ATTACK_MESSAGES["zh-Hant"], ...TIME_ATTACK_TITLE_MESSAGES["zh-Hant"] },
  id: { ...id, ...PC_MESSAGES["id"], ...TIME_ATTACK_MESSAGES["id"], ...TIME_ATTACK_TITLE_MESSAGES["id"] },
  tr: { ...tr, ...PC_MESSAGES["tr"], ...TIME_ATTACK_MESSAGES["tr"], ...TIME_ATTACK_TITLE_MESSAGES["tr"] },
  vi: { ...vi, ...PC_MESSAGES["vi"], ...TIME_ATTACK_MESSAGES["vi"], ...TIME_ATTACK_TITLE_MESSAGES["vi"] },
  th: { ...th, ...PC_MESSAGES["th"], ...TIME_ATTACK_MESSAGES["th"], ...TIME_ATTACK_TITLE_MESSAGES["th"] },
});
