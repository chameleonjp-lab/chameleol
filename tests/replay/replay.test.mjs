// 照合例：固定した操作履歴を、端末の判定規則とサーバーの検証処理の両方で再計算し、全項目が一致すること。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createGame, replayHistory, RULES_V1 } from '../../src/rules/v1/index.js';
import * as serverRules from '../../supabase/functions/_shared/kamereoru/rules/v1/index.js';
import { verifyResult } from '../../supabase/functions/_shared/kamereoru/replay.ts';

const DIR = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')));

test('照合例が6件あり、クリア・途中終了・発見を含む', () => {
  assert.equal(fixtures.length, 6);
  const reasons = new Set(fixtures.map((f) => f.expected.endReason));
  assert.deepEqual([...reasons].sort(), ['cleared', 'detected', 'quit']);
});

for (const f of fixtures) {
  test(`照合例 ${f.name}: 端末の判定規則で期待どおり`, () => {
    assert.equal(f.rulesVersion, RULES_V1.rulesVersion);
    const r = replayHistory(createGame({ seed: f.seed }), f.history);
    assert.deepEqual(r.summary, f.expected);
  });
  test(`照合例 ${f.name}: サーバーの検証処理でも全項目一致し、正式扱い`, () => {
    const r = serverRules.replayHistory(serverRules.createGame({ seed: f.seed }), f.history);
    assert.deepEqual(r.summary, f.expected);
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
