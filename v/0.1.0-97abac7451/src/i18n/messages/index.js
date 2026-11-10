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

export const MESSAGES = Object.freeze({
  ja,
  en,
  es,
  'pt-BR': ptBR,
  'zh-Hans': zhHans,
  fr,
  de,
  ko,
  ru,
  it,
  'zh-Hant': zhHant,
  id,
  tr,
  vi,
  th,
});
