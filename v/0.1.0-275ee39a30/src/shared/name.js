// 登録名の整理と検査。端末（ブラウザ）とサーバー（Edge Function）で同じファイルを使う。
// 内容による審査（禁止語など）はしない。表示や処理を壊す入力だけを技術的に拒否する。
//
// 手順：
//   1. 整理前に、データ量・不正な文字列・改行と制御文字・文字の向きを変える制御文字などを検査する
//   2. 全角半角などの互換表記をそろえる（NFKC）。前後の空白を除き、連続する空白を1つにする
//   3. 整理後にもう一度検査し、データ量と「見た目の文字」（書記素クラスター）20文字以内を確かめる
// 大文字小文字・アクセント・別の文字体系の似た字は区別する。集約キーは整理後の文字列そのもの（バイト単位で比較）。

export const NAME_RULES = Object.freeze({
  maxGraphemes: 20,
  maxRawBytes: 2048,
  maxBytes: 1000,
  maxGraphemeBytes: 64,
  maxGraphemeCodePoints: 16,
  normalization: 'NFKC',
});

const encoder = new TextEncoder();
export const utf8Bytes = (s) => encoder.encode(s).length;

const RE_LINE = /[\n\r\u0085\u2028\u2029]/u;
const RE_CONTROL = /\p{Cc}/u;
// 文字の向きを変える制御文字（ALM, LRM, RLM, LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI）
const RE_BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
// 表示を壊しやすい書式文字・非文字・私用・未割当
const RE_BROKEN = /[\uFEFF\uFFF9-\uFFFB]|\p{Noncharacter_Code_Point}|\p{Co}|\p{Cn}/u;
const RE_SPACES = /\p{White_Space}+/gu;

function isWellFormed(s) {
  if (typeof s.isWellFormed === 'function') return s.isWellFormed();
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
}

let segmenter = null;
function graphemes(s) {
  if (segmenter === null) {
    segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : false;
  }
  if (!segmenter) return Array.from(s); // 古い環境：コードポイントで代用（サーバー側の判定が正）
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

function checkForm(s) {
  if (RE_LINE.test(s)) return 'newline';
  if (RE_CONTROL.test(s)) return 'control';
  if (RE_BIDI.test(s)) return 'bidi_control';
  if (RE_BROKEN.test(s)) return 'unsupported_char';
  return null;
}

/**
 * 名前を整理する。
 * 戻り値：
 *   { ok: true, empty: true }                          空欄・空白だけ（ランキングに参加しない）
 *   { ok: true, name, key, graphemes, bytes }          受け付ける名前
 *   { ok: false, error, graphemes? }                   直してもらう必要がある名前
 */
export function normalizeName(raw) {
  if (raw == null) return { ok: true, empty: true, name: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'not_text' };
  if (utf8Bytes(raw) > NAME_RULES.maxRawBytes) return { ok: false, error: 'too_large' };
  if (!isWellFormed(raw)) return { ok: false, error: 'unsupported_char' };
  const before = checkForm(raw);
  if (before) return { ok: false, error: before };
  let name = raw.normalize(NAME_RULES.normalization);
  const after = checkForm(name);
  if (after) return { ok: false, error: after };
  name = name.replace(RE_SPACES, ' ').trim();
  if (!name) return { ok: true, empty: true, name: '' };
  const bytes = utf8Bytes(name);
  if (bytes > NAME_RULES.maxBytes) return { ok: false, error: 'too_large' };
  const parts = graphemes(name);
  if (parts.length > NAME_RULES.maxGraphemes) return { ok: false, error: 'too_long', graphemes: parts.length };
  for (const g of parts) {
    if (utf8Bytes(g) > NAME_RULES.maxGraphemeBytes || Array.from(g).length > NAME_RULES.maxGraphemeCodePoints) {
      return { ok: false, error: 'grapheme_too_large', graphemes: parts.length };
    }
  }
  return { ok: true, empty: false, name, key: name, graphemes: parts.length, bytes };
}

/** 入力欄の文字数表示（整理後の見た目の文字数）。 */
export function countGraphemes(raw) {
  const r = normalizeName(raw);
  if (r.ok) return r.empty ? 0 : r.graphemes;
  return r.graphemes ?? null;
}
