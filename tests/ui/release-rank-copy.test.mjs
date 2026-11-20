// 結果画面とX投稿文に共通の順位表示。総数は一度だけ表示する。
import test from 'node:test';
import assert from 'node:assert/strict';

import { MESSAGES } from '../../src/i18n/messages/index.js';
import { formatNumber } from '../../src/i18n/i18n.js';
import { formatRunMetrics, buildResultShareText } from '../../src/ui/share.js';

test('Japanese rank display omits the repeated cumulative play count', () => {
  assert.equal(MESSAGES.ja.releaseRunRank, '今回のプレイ順位　{rank}位／{total}人中');
});

for (const locale of Object.keys(MESSAGES)) {
  test(`rank count appears once in the result and share copy: ${locale}`, () => {
    const template = MESSAGES[locale].releaseRunRank;
    assert.equal(template.split('{rank}').length - 1, 1);
    assert.equal(template.split('{total}').length - 1, 1);

    const run = {
      locale,
      runRank: 12,
      totalPlays: 150,
      clearOrdinal: null,
      buildings: 23,
      score: 999,
      rankState: 'official',
    };
    const { rank } = formatRunMetrics(run);
    const totalLabel = formatNumber(150, {}, locale);
    assert.equal(rank.split(totalLabel).length - 1, 1);

    const shareText = buildResultShareText({ run });
    assert.equal(shareText.split('\n').filter(line => line === rank).length, 1);
    assert.equal(shareText.split(totalLabel).length - 1, 1);
  });
}
