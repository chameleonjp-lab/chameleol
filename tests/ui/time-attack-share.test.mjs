import test from 'node:test';
import assert from 'node:assert/strict';
import { t } from '../../src/i18n/i18n.js';
import { LANGUAGE_IDS } from '../../src/i18n/languages.js';
import { buildTimeAttackShareText } from '../../src/ui/time-attack-share.js';
import { GAME_URL } from '../../src/ui/share.js';

const result = {
  reason: 'cleared', clearedCount: 30, elapsedCs: 8345, elapsedMs: 83450,
  name: 'PRIVATE NAME', rank: 4, score: 29271, bestElapsedCs: 2300,
};

test('shares the fixed URL and hashtag with only the current time in each of 15 languages', () => {
  for (const lang of LANGUAGE_IDS) {
    const text = buildTimeAttackShareText(result, lang);
    assert.deepEqual(text.split('\n'), [
      t('ta.mode', null, lang),
      t('ta.shareRecord', { time: lang === 'ja' ? '1分23秒45' : '01:23.45' }, lang),
      '#カメレオる',
      GAME_URL,
    ], lang);
  }
});

test('does not create an intent for a quit, incomplete run, invalid time, or absent result', () => {
  for (const invalid of [
    null,
    { ...result, reason: 'quit' },
    { ...result, clearedCount: 29 },
    { ...result, elapsedMs: 14999, elapsedCs: 1500 },
    { ...result, elapsedCs: 9e15 },
    { ...result, elapsedCs: '8345' },
  ]) assert.equal(buildTimeAttackShareText(invalid), null);
});
