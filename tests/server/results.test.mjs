// 終了結果の受付と再計算（受入試験 NET-TEST-04/05、VERIFY-TEST-01〜03、SEC-TEST-01 の一部、R3/R4）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKIP, freshServer, rankedStart, playBody, sendChunks, submitPlay, count } from './helpers.mjs';
import { randomSecret } from '../../src/storage/store.js';
import { uuid } from '../../src/net/api.js';
import { RULES_V1 } from '../../src/rules/v1/index.js';

const resultRow = async (srv, playId) => (await srv.sql('select * from private.kamereoru_results where play_id = $1', [playId]))[0];

test('分割した結果の全片がそろって完全受付→再計算→正式登録。値は端末の申告ではなく再計算値', { skip: SKIP }, async () => {
  const srv = await freshServer('res1');
  try {
    const s = await rankedStart(srv, 'まる');
    const { done, body } = await submitPlay(srv, s, { chunkChars: 2048 });
    assert.equal(done.status, 200);
    assert.equal(done.body.status, 'verifying');
    await srv.settle();
    const r = await resultRow(srv, s.playId);
    assert.equal(r.status, body.summary.buildings > 0 ? 'official' : 'no_rank');
    assert.equal(r.buildings, body.summary.buildings);
    assert.equal(r.rank_avg, body.summary.rankAverage);
    assert.equal(r.display_name, 'まる');
    assert.equal(r.verdict.reason, 'verified');
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_jobs'), 0);
    // 状況照会（送信元の秘密）
    const st = await srv.call('status', { items: [{ playId: s.playId, secret: s.secret }] });
    assert.equal(st.body.items[0].status, r.status);
  } finally {
    await srv.close();
  }
});

test('NET-TEST-04: 片が欠けている間は受け付けず（順位にも入らない）、再送後に1回だけ確定', { skip: SKIP }, async () => {
  const srv = await freshServer('res2');
  try {
    const s = await rankedStart(srv, 'かけ');
    const body = await playBody(s);
    const resultId = uuid();
    const { total } = await sendChunks(srv, s, resultId, body, { chunkChars: 1500, skip: [1] });
    assert.ok(total >= 3);
    const early = await srv.call('complete', { playId: s.playId, resultId, secret: s.secret });
    assert.equal(early.status, 409);
    assert.equal(early.body.error, 'incomplete');
    assert.equal(early.body.retryable, true);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_results'), 0);
    // 欠けた片を含めて全片を再送（同じ内容の片は受理済みとして扱う）
    await sendChunks(srv, s, resultId, body, { chunkChars: 1500 });
    const ok = await srv.call('complete', { playId: s.playId, resultId, secret: s.secret });
    assert.equal(ok.status, 200);
    const again = await srv.call('complete', { playId: s.playId, resultId, secret: s.secret });
    assert.equal(again.body.duplicate, true);
    await srv.settle();
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_results'), 1);
    assert.equal(await count(srv, "select count(*) as n from private.kamereoru_audit where action like 'verify:%'"), 1);
  } finally {
    await srv.close();
  }
});

test('R3: 同じ位置に違う内容の片・別の結果番号・別端末（別の秘密）の片は拒否し、正常な片を上書きしない', { skip: SKIP }, async () => {
  const srv = await freshServer('res3');
  try {
    const s = await rankedStart(srv, 'さしかえ');
    const body = await playBody(s);
    const resultId = uuid();
    await sendChunks(srv, s, resultId, body, { chunkChars: 1500 });
    const original = (await srv.sql('select chunk from private.kamereoru_uploads where play_id = $1 and chunk_index = 0', [s.playId]))[0].chunk;
    const total = Math.ceil(body.text.length / 1500);
    const swapped = await srv.call('chunk', { playId: s.playId, resultId, secret: s.secret, index: 0, total, length: body.text.length, sha256: body.sha, data: `X${original.slice(1)}` });
    assert.equal(swapped.status, 409);
    assert.equal(swapped.body.error, 'chunk_conflict');
    const otherResult = await srv.call('chunk', { playId: s.playId, resultId: uuid(), secret: s.secret, index: 0, total, length: body.text.length, sha256: body.sha, data: original });
    assert.equal(otherResult.body.error, 'result_conflict');
    const otherMeta = await srv.call('chunk', { playId: s.playId, resultId, secret: s.secret, index: 0, total: total + 1, length: body.text.length, sha256: body.sha, data: original });
    assert.equal(otherMeta.body.error, 'chunk_meta_conflict');
    const otherDevice = await srv.call('chunk', { playId: s.playId, resultId, secret: randomSecret(), index: 0, total, length: body.text.length, sha256: body.sha, data: original });
    assert.equal(otherDevice.status, 403);
    assert.equal((await srv.sql('select chunk from private.kamereoru_uploads where play_id = $1 and chunk_index = 0', [s.playId]))[0].chunk, original);
    const done = await srv.call('complete', { playId: s.playId, resultId, secret: s.secret });
    assert.equal(done.status, 200);
    // 完全受付の後も、別の結果番号で同じ開始を確定できない
    const second = await srv.call('complete', { playId: s.playId, resultId: uuid(), secret: s.secret });
    assert.equal(second.status, 409);
    const forged = await srv.call('complete', { playId: s.playId, resultId, secret: randomSecret() });
    assert.equal(forged.status, 403);
  } finally {
    await srv.close();
  }
});

test('NET-TEST-05: 同じ結果の同時再送でも1件だけ。応答を失って再送しても同じ受付を返す', { skip: SKIP }, async () => {
  const srv = await freshServer('res4', { processAfterComplete: false });
  try {
    const s = await rankedStart(srv, 'どうじ');
    const body = await playBody(s);
    const resultId = uuid();
    // 片の同時送信（順序も入れ替える）
    const chunks = Math.ceil(body.text.length / 1000);
    const sends = [];
    for (let i = chunks - 1; i >= 0; i -= 1) {
      const req = { playId: s.playId, resultId, secret: s.secret, index: i, total: chunks, length: body.text.length, sha256: body.sha, data: body.text.slice(i * 1000, (i + 1) * 1000) };
      sends.push(srv.call('chunk', req), srv.call('chunk', req));
    }
    const res = await Promise.all(sends);
    assert.ok(res.every((r) => r.status === 200), JSON.stringify(res.find((r) => r.status !== 200)));
    const completes = await Promise.all([1, 2, 3, 4].map(() => srv.call('complete', { playId: s.playId, resultId, secret: s.secret })));
    assert.ok(completes.every((r) => r.status === 200 && r.body.resultId === resultId));
    assert.equal(completes.filter((r) => r.body.duplicate === false).length, 1);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_results'), 1);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_jobs'), 1);
  } finally {
    await srv.close();
  }
});

test('R4: 完全受付の直後に検証処理が止まっても、再起動後に再取得して1回だけ確定する', { skip: SKIP }, async () => {
  const srv = await freshServer('res5', { processAfterComplete: false });
  try {
    const s = await rankedStart(srv, 'ていし');
    await submitPlay(srv, s);
    assert.equal((await resultRow(srv, s.playId)).status, 'verifying');
    // 取り出した直後に止まった（確定しないまま）：期限が過ぎるまで他の処理は取り出さない
    const stuck = srv.restart({ leaseSeconds: 1, processAfterComplete: false });
    await srv.sql("select * from private.kamereoru_claim_jobs(5, '1 second'::interval)");
    assert.deepEqual(await stuck.processJobs(5), { processed: 0 });
    await new Promise((r) => setTimeout(r, 1200));
    // 再起動した検証処理が期限切れの作業を再取得して確定。端末の再送は不要
    const restarted = srv.restart({ leaseSeconds: 60 });
    assert.deepEqual(await restarted.processJobs(5), { processed: 1 });
    assert.deepEqual(await restarted.processJobs(5), { processed: 0 });
    const r = await resultRow(srv, s.playId);
    assert.notEqual(r.status, 'verifying');
    // 二重に確定しない（確定処理を直接もう一度呼んでも状態は同じ）
    const again = await srv.sql("select private.kamereoru_finalize($1, 'rejected', '{}'::jsonb, '{}'::jsonb) as s", [s.playId]);
    assert.equal(again[0].s, r.status);
    assert.equal(await count(srv, "select count(*) as n from private.kamereoru_audit where action like 'verify:%'"), 1);
  } finally {
    await srv.close();
  }
});

test('VERIFY-TEST-03: 補助履歴だけの違いは正式登録＋内部記録、順位値の違いは確認待ち、成立しない申告は拒否', { skip: SKIP }, async () => {
  const srv = await freshServer('res6');
  try {
    const cases = [
      ['aux', (b) => ({ ...b, claimed: { ...b.claimed, score: { ...b.claimed.score, total: b.claimed.score.total + 7 }, maxCombo: b.claimed.maxCombo + 1 } }), 'official', 'verified_aux_mismatch'],
      ['rank', (b) => ({ ...b, claimed: { ...b.claimed, rankAverage: Math.min(10000, (b.claimed.rankAverage ?? 0) + 1) } }), 'pending_review', 'rank_mismatch'],
      ['51', (b) => ({ ...b, claimed: { ...b.claimed, buildings: 51 } }), 'rejected', 'impossible_claim'],
      ['over100', (b) => ({ ...b, claimed: { ...b.claimed, rankAverage: 10001 } }), 'rejected', 'impossible_claim'],
      ['backwards', (b) => ({ ...b, history: [...b.history.slice(0, 5), [0, -5, 1, 1, 10000], ...b.history.slice(5)] }), 'rejected', 'history_invalid'],
      ['locked', (b) => ({ ...b, history: [[0, 2000, 100, 5000, 4000], ...b.history] }), 'rejected', 'impossible_input'],
      ['seed', (b) => ({ ...b, seed: (b.seed + 1) >>> 0 }), 'rejected', 'start_mismatch'],
    ];
    for (const [label, mutate, status, reason] of cases) {
      const s = await rankedStart(srv, `ケース${label}`);
      await submitPlay(srv, s, { mutate, quitAt: 60000 });
      await srv.settle();
      const r = await resultRow(srv, s.playId);
      assert.equal(r.status, status, label);
      assert.equal(r.verdict.reason, reason, label);
      if (status === 'pending_review') {
        assert.equal(r.verdict.claimed.rankAverage === r.verdict.computed.rankAverage, false);
        assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_bests where play_id = $1', [s.playId]), 0, '確認待ちは順位へ反映しない');
      }
    }
  } finally {
    await srv.close();
  }
});

test('VERIFY-TEST-03: 50棟・高い一致度という合法な高記録は、高いだけでは排除しない', { skip: SKIP }, async () => {
  const srv = await freshServer('res7');
  try {
    const s = await rankedStart(srv, 'たつじん');
    // 毎棟の評価開始前に目標色へ合わせる、完璧に近い操作
    const perfect = (b) => {
      const { makeCourse } = globalThis.__rules;
      const course = makeCourse(b.seed);
      const hist = [];
      let last = 0;
      course.targets.forEach((tg, i) => {
        const t = i * 5000 + 1400;
        hist.push([0, t - last, tg.h, tg.s, i + 1 >= 20 ? tg.v : 10000]);
        last = t;
      });
      return { ...b, history: hist, claimed: globalThis.__claimed(b.seed, hist) };
    };
    const rules = await import('../../src/rules/v1/index.js');
    globalThis.__rules = rules;
    globalThis.__claimed = (seed, hist) => rules.replayHistory(rules.createGame({ seed }), hist).summary;
    await submitPlay(srv, s, { mutate: perfect });
    await srv.settle();
    const r = await resultRow(srv, s.playId);
    assert.equal(r.status, 'official');
    assert.equal(r.buildings, 50);
    assert.ok(r.rank_avg > 9900, String(r.rank_avg));
    assert.equal(r.end_reason, 'cleared');
  } finally {
    await srv.close();
  }
});

test('実時間より速いゲーム内時間は成立しない（開始受付から受信までより長いプレイ）', { skip: SKIP }, async () => {
  const srv = await freshServer('res8');
  try {
    const s = await rankedStart(srv, 'はやい');
    await srv.sql('update private.kamereoru_starts set accepted_at = now() where play_id = $1', [s.playId]);
    await submitPlay(srv, s, { quitAt: 120000 });
    await srv.settle();
    const r = await resultRow(srv, s.playId);
    assert.equal(r.status, 'rejected');
    assert.equal(r.verdict.reason, 'faster_than_real_time');
  } finally {
    await srv.close();
  }
});

test('この検証処理が持たない判定規則の版は、処分せず確認待ちとして保護する', { skip: SKIP }, async () => {
  const srv = await freshServer('res9');
  try {
    await srv.sql("update private.kamereoru_config set accepted_rules_versions = array['kamereoru-rules-v1', 'kamereoru-rules-v0']");
    const s = await rankedStart(srv, 'むかし');
    await srv.sql("update private.kamereoru_starts set rules_version = 'kamereoru-rules-v0' where play_id = $1", [s.playId]);
    await submitPlay(srv, s, { mutate: (b) => ({ ...b, rulesVersion: 'kamereoru-rules-v0' }) });
    await srv.settle();
    const r = await resultRow(srv, s.playId);
    assert.equal(r.status, 'pending_review');
    assert.equal(r.verdict.reason, 'unsupported_rules_version');
    assert.notEqual(r.body, null);
    assert.equal(RULES_V1.rulesVersion, 'kamereoru-rules-v1');
  } finally {
    await srv.close();
  }
});

test('SEC-TEST-01: 応答に照会の秘密・管理用の値を含めない。番号や名前だけでは非公開の状況を読めない', { skip: SKIP }, async () => {
  const logs = [];
  const srv = await freshServer('res10', { log: (e) => logs.push(e) });
  try {
    const s = await rankedStart(srv, 'ひみつ');
    const { done } = await submitPlay(srv, s);
    await srv.settle();
    const text = JSON.stringify(done.body) + JSON.stringify(logs);
    assert.equal(text.includes(s.secret), false);
    const peek = await srv.call('status', { items: [{ playId: s.playId, secret: randomSecret() }] });
    assert.deepEqual(peek.body.items, [{ playId: s.playId, error: 'forbidden' }]);
    const rank = await srv.call('rank', { name: 'ひみつ' });
    assert.equal(rank.status, 200);
    assert.equal(JSON.stringify(rank.body).includes(s.playId), false, '順位の応答にプレイ番号を出さない');
  } finally {
    await srv.close();
  }
});
