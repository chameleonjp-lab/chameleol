// 照合例：固定した操作履歴を、端末の判定規則とサーバーの検証処理の両方で再計算し、全項目が一致すること。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, replayHistory, RULES_V1, rulesForVersion } from '../../src/rules/v1/index.js';
import * as serverRules from '../../supabase/functions/_shared/kamereoru/rules/v1/index.js';
import { verifyResult } from '../../supabase/functions/_shared/kamereoru/replay.ts';

const { loadReplayFixtures } = await import('../../scripts/replay-fixtures.mjs');
const fixtures = loadReplayFixtures();

test('fixed legacy cases and bonus fixtures cover all four rules versions', () => {
  assert.equal(fixtures.filter(f => f.rulesVersion === RULES_V1.rulesVersion && !f.name.startsWith('pre-bonus')).length, 6);
  assert.deepEqual([...new Set(fixtures.map(f => f.rulesVersion))].sort(), [1,2,3,4].map(n => `kamereoru-rules-v${n}`));
  assert.deepEqual([...new Set(fixtures.map(f => f.expected.endReason))].sort(), ['cleared','detected','quit']);
});

for (const f of fixtures) {
  test(`照合例 ${f.name}: 端末の判定規則で期待どおり`, () => {
    const r = replayHistory(createGame({ seed: f.seed, rules: rulesForVersion(f.rulesVersion) }), f.history);
    assert.deepEqual(r.summary, f.expected);
  });
  test(`照合例 ${f.name}: 共有判定でも全項目一致し、ランキング版は正式扱い`, () => {
    const r = serverRules.replayHistory(serverRules.createGame({ seed: f.seed, rules: rulesForVersion(f.rulesVersion) }), f.history);
    assert.deepEqual(r.summary, f.expected);
    if (![1,3].some(n => f.rulesVersion === `kamereoru-rules-v${n}`)) return;
    const body = {
      format: 'kamereoru-result-v1',
      playId: 'p',
      launchId: 'l',
      rulesVersion: f.rulesVersion,
      generatorVersion: RULES_V1.generatorVersion,
      seed: f.seed,
      history: f.history,
      claimed: f.expected,
    };
    const v = verifyResult({ playId: 'p', launchId: 'l', seed: String(f.seed), rulesVersion: f.rulesVersion, generatorVersion: RULES_V1.generatorVersion, acceptedAt: '2026-01-01T00:00:00Z', receivedAt: '2026-01-02T00:00:00Z', body });
    assert.equal(v.status, 'official');
    assert.equal(v.verdict.reason, 'verified');
    assert.equal(v.values.rankAverage, f.expected.rankAverage);
  });
}
