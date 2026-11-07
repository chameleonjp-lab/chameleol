// 記録の状況と順位ページの端末側の扱い（受入試験 REVIEW-TEST-01、RANK-TEST-05、NET-TEST-07 の端末部分）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../../src/storage/store.js';
import { recordState, collectRecords, STATE_KEYS } from '../../src/ui/record-status.js';
import { mergeRankingPage } from '../../src/ui/ranking.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';

test('送信待ち・失敗・検証中・確認待ち・拒否・再審査中・正式・訂正・対象外を区別する', () => {
  const cases = [
    [{ source: 'outbox' }, 'pending'],
    [{ source: 'outbox', lastError: 'network' }, 'retryable_failed'],
    [{ source: 'outbox', state: 'permanent_failed', lastError: 'result_conflict' }, 'permanent_failed'],
    [{ source: 'record', status: 'verifying' }, 'verifying'],
    [{ source: 'record', status: 'pending_review' }, 'pending_review'],
    [{ source: 'record', status: 'rejected' }, 'rejected'],
    [{ source: 'record', status: 'under_review' }, 'under_review'],
    [{ source: 'record', status: 'official', corrections: [] }, 'official'],
    [{ source: 'record', status: 'official', corrections: [{}] }, 'corrected'],
    [{ source: 'record', status: 'no_rank' }, 'no_rank'],
    [{ source: 'local' }, 'unranked'],
  ];
  for (const [item, state] of cases) assert.equal(recordState(item), state, JSON.stringify(item));
  // すべての状態に表示文言がある（表示の文字列を処理の条件には使わない）
  for (const key of Object.values(STATE_KEYS)) assert.ok(MESSAGES.ja[key], key);
});

test('送信待ち・受付済み・ローカルの記録を、新しい順にすべて並べる', async () => {
  const store = await openStore({ indexedDB: new IDBFactory(), name: 'rs1' });
  await store.put('outbox', { playId: 'o', createdAt: 30 });
  await store.put('records', { playId: 'r1', acceptedAt: 10, status: 'pending_review' });
  await store.put('records', { playId: 'r2', acceptedAt: 50, status: 'official' });
  await store.put('localResults', { playId: 'l', createdAt: 40 });
  const items = await collectRecords(store);
  assert.deepEqual(items.map((x) => x.playId), ['r2', 'l', 'o', 'r1']);
  store.close();
});

test('順位ページは同じ版の続きをつなぎ、重複させない。版が変わったら先頭から', () => {
  const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ position: from + i, rank: 1, name: `n${from + i}` }));
  let s = mergeRankingPage(null, { version: 5, rows: rows(1, 30), nextAfter: 30, nameCount: 45 });
  s = mergeRankingPage(s, { version: 5, rows: rows(31, 45), nextAfter: null, nameCount: 45 });
  assert.equal(s.rows.length, 45);
  // 同じページを二重に受け取っても重複しない
  s = mergeRankingPage(s, { version: 5, rows: rows(31, 45), nextAfter: null, nameCount: 45 });
  assert.equal(s.rows.length, 45);
  // サーバーが先頭から読み直した（古い版が整理された）
  s = mergeRankingPage(s, { version: 7, rows: rows(1, 30), nextAfter: 30, nameCount: 46, restarted: true });
  assert.equal(s.version, 7);
  assert.equal(s.rows.length, 30);
  assert.equal(s.restarted, true);
});
