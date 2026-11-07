// 登録名の整理（受入試験 NAME-TEST-03〜05 の判定部分）。端末とサーバーは同じファイルを使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, countGraphemes, NAME_RULES } from '../src/shared/name.js';
import { normalizeName as serverNormalize } from '../supabase/functions/_shared/kamereoru/shared/name.js';

const cp = (...codes) => String.fromCodePoint(...codes);
const FAMILY = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466);
const SKIN_FAMILY = cp(0x1f468, 0x1f3fb, 0x200d, 0x1f469, 0x1f3fb, 0x200d, 0x1f467, 0x1f3fb, 0x200d, 0x1f466, 0x1f3fb);

test('NAME-TEST-03: 全角半角と空白だけを整理し、大文字小文字・アクセントは区別する', () => {
  assert.equal(normalizeName('ＡＢＣ').name, 'ABC');
  assert.equal(normalizeName('ABC').name, 'ABC');
  assert.notEqual(normalizeName('ABC').key, normalizeName('abc').key);
  assert.notEqual(normalizeName('José').key, normalizeName('Jose').key);
  // 結合済みのé（U+00E9）と、e＋結合アクセント（U+0065 U+0301）は NFKC で同じになる
  assert.equal(normalizeName(`Jos${cp(0x65, 0x301)}`).key, normalizeName(`Jos${cp(0xe9)}`).key);
  assert.equal(normalizeName(`  山田${cp(0x3000)}${cp(0x3000)}太郎  `).name, '山田 太郎');
  assert.equal(normalizeName(`a${cp(0xa0)}${cp(0x2003)}b`).name, 'a b');
  assert.deepEqual(normalizeName('   '), { ok: true, empty: true, name: '' });
  assert.deepEqual(normalizeName(''), { ok: true, empty: true, name: '' });
  // NFKCで変わる例も、保存予定名として見せる（隠さない）
  assert.equal(normalizeName(cp(0x2460)).name, '1');
});

test('NAME-TEST-04: 見た目の文字（書記素）で20文字まで。21文字は明示エラーで、切り捨てない', () => {
  assert.equal(normalizeName('x'.repeat(20)).ok, true);
  const over = normalizeName('x'.repeat(21));
  assert.equal(over.ok, false);
  assert.equal(over.error, 'too_long');
  assert.equal(over.graphemes, 21);
  assert.equal(normalizeName(FAMILY).graphemes, 1);
  assert.equal(normalizeName(FAMILY.repeat(20)).ok, true);
  assert.equal(normalizeName(FAMILY.repeat(21)).error, 'too_long');
  assert.equal(normalizeName(SKIN_FAMILY.repeat(20)).ok, true);
  // 各言語
  for (const s of ['あ'.repeat(20), 'ก'.repeat(20), 'Ж'.repeat(20), '가'.repeat(20), 'ع'.repeat(20)]) {
    assert.equal(normalizeName(s).ok, true, s);
    assert.equal(normalizeName(s + s[0]).error, 'too_long', s);
  }
  // 正当な結合文字（ZWJ・ZWNJ・異体字セレクタ・タグ）は消さない
  const persian = `${cp(0x645, 0x6cc, 0x200c, 0x62e, 0x648, 0x627, 0x647, 0x645)}`;
  assert.equal(normalizeName(persian).name, persian);
  const flag = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0073, 0xe0063, 0xe0074, 0xe007f);
  assert.equal(normalizeName(flag).name, flag);
  assert.equal(countGraphemes(FAMILY + 'ab'), 3);
});

test('NAME-TEST-05: 内容は審査しない。改行・方向制御・制御文字・結合文字の大量入力・巨大データは拒否', () => {
  assert.equal(normalizeName('<script>alert(1)</script>').error, 'too_long');
  assert.equal(normalizeName('<b>hi</b>').ok, true); // 文字列として扱う（表示時も textContent）
  assert.equal(normalizeName('ばか').ok, true); // 内容による審査はしない
  assert.equal(normalizeName('a\nb').error, 'newline');
  assert.equal(normalizeName('a\r\nb').error, 'newline');
  assert.equal(normalizeName(`a${cp(0x2028)}b`).error, 'newline');
  assert.equal(normalizeName(`a${cp(0x202e)}b`).error, 'bidi_control');
  assert.equal(normalizeName(`a${cp(0x2067)}b`).error, 'bidi_control');
  assert.equal(normalizeName(`a${cp(0x200f)}b`).error, 'bidi_control');
  assert.equal(normalizeName(`a${cp(0x07)}b`).error, 'control');
  assert.equal(normalizeName(`a${cp(0xfeff)}b`).error, 'unsupported_char');
  assert.equal(normalizeName(`a${cp(0xe000)}b`).error, 'unsupported_char');
  assert.equal(normalizeName(`e${cp(0x301).repeat(40)}`).error, 'grapheme_too_large');
  assert.equal(normalizeName('x'.repeat(3000)).error, 'too_large');
  assert.equal(normalizeName(`${String.fromCharCode(0xd800)}abc`).error, 'unsupported_char');
  assert.equal(normalizeName(42).error, 'not_text');
});

test('端末とサーバーで同じ結果になる（同じファイルを使う）', () => {
  const samples = ['ＡＢＣ', 'José', FAMILY.repeat(20), 'x'.repeat(21), `a${cp(0x202e)}b`, '  a  b  ', 'محمد علي', 'क्षत्रिय'];
  for (const s of samples) assert.deepEqual(serverNormalize(s), normalizeName(s), s);
  assert.equal(NAME_RULES.maxGraphemes, 20);
});
