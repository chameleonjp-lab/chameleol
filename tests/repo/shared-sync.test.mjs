// 端末とサーバーが同じ判定規則・名前の整理を使っていること（配布物の版・内容の指紋の一致）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { check, computeManifest } from '../../scripts/sync-shared.mjs';
import * as client from '../../src/rules/v1/index.js';
import * as server from '../../supabase/functions/_shared/kamereoru/rules/v1/index.js';

test('Edge Function の共有コードは src と1バイトも違わない（npm run sync で更新）', () => {
  assert.deepEqual(check(), []);
  assert.match(computeManifest().fingerprint, /^[0-9a-f]{64}$/);
});

test('両方の判定規則の版が同じで、同じ出題・同じ再計算になる', () => {
  assert.equal(server.RULES_V1.rulesVersion, client.RULES_V1.rulesVersion);
  for (const seed of [0, 1, 4294967295]) {
    assert.deepEqual(server.makeCourse(seed).targets, client.makeCourse(seed).targets);
  }
});
