// 順位・自己ベスト・再審査・訂正・期限整理（受入試験 RANK-TEST-04〜07、REVIEW-TEST-01/02、CORRECT-TEST-01、DATA-TEST-01、R5、R9）。
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { SKIP, freshServer, count } from './helpers.mjs';
import { randomSecret } from '../../src/storage/store.js';
import { sha256Hex } from '../../src/net/api.js';

/** 正式記録などを直接作る（再計算は results.test.mjs で確かめ済み。ここでは順位の規則を見る）。 */
async function mk(srv, name, buildings, avg, { status = 'official', receivedAgo = null } = {}) {
  const secret = randomSecret();
  const hash = await sha256Hex(secret);
  const rows = await srv.sql(
    `insert into private.kamereoru_starts (request_id, secret_hash, launch_id, display_name, name_key, seed, rules_version, generator_version, game_version)
     values (gen_random_uuid(), decode($1, 'hex'), gen_random_uuid(), $2, $2, 1, 'kamereoru-rules-v1', 'kamereoru-course-v1', 't') returning play_id`,
    [hash, name],
  );
  const playId = rows[0].play_id;
  await srv.sql("insert into private.kamereoru_result_claims (play_id, result_id, chunk_total, total_length, body_sha256) values ($1, gen_random_uuid(), 1, 2, repeat('0', 64))", [playId]);
  await srv.sql(
    `insert into private.kamereoru_results (play_id, result_id, name_key, display_name, body, body_sha256, body_length, status, received_at)
     select $1, result_id, $2, $2, '{"history":[]}'::jsonb, repeat('0', 64), 2, 'verifying', now() - coalesce($3::interval, '0 seconds') from private.kamereoru_result_claims where play_id = $1`,
    [playId, name, receivedAgo],
  );
  await srv.sql('select private.kamereoru_finalize($1, $2, $3::jsonb, $4::jsonb)', [playId, status, JSON.stringify({ buildings, rankAverage: avg }), JSON.stringify({ reason: 'test' })]);
  return { playId, secret };
}

const best = async (srv, name) => (await srv.sql('select * from private.kamereoru_bests where name_key = $1', [name]))[0] ?? null;
const page = async (srv, params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return (await srv.call(`ranking${q ? `?${q}` : ''}`, null, { method: 'GET' })).body;
};

test('RANK-TEST-05/R9: 同率1位45名をページ分割しても、途中で新しい記録が入っても、45名全員に重複なく到達できる', { skip: SKIP }, async () => {
  const srv = await freshServer('rank1');
  try {
    for (let i = 0; i < 45; i += 1) await mk(srv, `tie${String(i).padStart(2, '0')}`, 50, 10000);
    await mk(srv, 'second', 50, 9999);
    const p1 = await page(srv, { limit: 30 });
    assert.equal(p1.rows.length, 30);
    assert.ok(p1.rows.every((r) => r.rank === 1));
    assert.equal(p1.nextAfter, 30);
    // 1ページ目を読んだ後に、新しい記録（別の名前の同率1位）が入った
    await mk(srv, 'aaa-newcomer', 50, 10000);
    const p2 = await page(srv, { version: p1.version, after: p1.nextAfter, limit: 30 });
    assert.equal(p2.version, p1.version, '同じ集計版の続きを読む');
    assert.equal(p2.restarted, false);
    const names = [...p1.rows, ...p2.rows].map((r) => r.name);
    assert.equal(new Set(names).size, names.length, '重複なし');
    assert.equal(names.filter((n) => n.startsWith('tie')).length, 45, '45名全員');
    assert.equal(names.includes('second'), false, '2位は46位のため30位以内に入らない');
    // 更新すると新しい集計の先頭へ
    const latest = await page(srv, { limit: 30 });
    assert.ok(latest.version > p1.version);
    assert.equal(latest.rows[0].name, 'aaa-newcomer');
    assert.equal(latest.nameCount, 47);
    // 古い版が整理された後に続きを頼むと、最新の先頭から読み直す
    await srv.sql('delete from private.kamereoru_ranking_versions where version = $1', [p1.version]);
    const gone = await page(srv, { version: p1.version, after: 30, limit: 30 });
    assert.equal(gone.restarted, true);
    assert.equal(gone.rows[0].position, 1);
  } finally {
    await srv.close();
  }
});

test('RANK-TEST-06/07: 自己ベストは実在する1プレイ。合成しない。0棟は候補外、同じ組なら従来のベストを維持', { skip: SKIP }, async () => {
  const srv = await freshServer('rank2');
  try {
    await mk(srv, 'たろう', 48, 9350);
    await mk(srv, 'たろう', 50, 8420);
    const third = await mk(srv, 'たろう', 50, 8870);
    let b = await best(srv, 'たろう');
    assert.equal(b.play_id, third.playId);
    assert.equal(b.buildings, 50);
    assert.equal(b.rank_avg, 8870);
    // 0棟：順位候補に入れない
    const zero = await mk(srv, 'たろう', 0, null);
    assert.equal((await srv.sql('select status from private.kamereoru_results where play_id = $1', [zero.playId]))[0].status, 'no_rank');
    // 同じ組を再達成：ベストは従来のまま
    await mk(srv, 'たろう', 50, 8870);
    b = await best(srv, 'たろう');
    assert.equal(b.play_id, third.playId);
    // 名前ごとに1枠（同名の別人も同じ枠）
    assert.equal(await count(srv, "select count(*) as n from private.kamereoru_bests where name_key = 'たろう'"), 1);
  } finally {
    await srv.close();
  }
});

test('REVIEW-TEST-01: 遅れて承認された弱い記録でベストを下げない。確認待ちは期限で処分せず、全件に照会できる', { skip: SKIP }, async () => {
  const srv = await freshServer('rank3');
  try {
    const strong = await mk(srv, 'はなこ', 50, 9000);
    const weakPending = await mk(srv, 'はなこ', 40, 9900, { status: 'pending_review', receivedAgo: '400 days' });
    const another = await mk(srv, 'はなこ', 30, 9000, { status: 'pending_review', receivedAgo: '200 days' });
    assert.equal((await best(srv, 'はなこ')).play_id, strong.playId, '確認待ちは順位へ反映しない');
    // 期限整理を何度走らせても、確認待ちは処分しない
    await srv.sql("select private.kamereoru_purge_details(now() + interval '10 years')");
    const pend = await srv.sql("select count(*) as n from private.kamereoru_results where status = 'pending_review' and body is not null");
    assert.equal(Number(pend[0].n), 2);
    // 送信元の端末は、すべての確認待ちを照会できる
    const st = await srv.call('status', { items: [weakPending, another].map((x) => ({ playId: x.playId, secret: x.secret })) });
    assert.deepEqual(st.body.items.map((x) => x.status), ['pending_review', 'pending_review']);
    // 管理者が承認しても、より強い既存ベストは残る
    await srv.sql("select private.kamereoru_admin_decide($1, 'official', '確認済み', 'admin')", [weakPending.playId]);
    assert.equal((await best(srv, 'はなこ')).play_id, strong.playId);
    const stats = (await srv.sql('select private.kamereoru_pending_stats() as s'))[0].s;
    assert.equal(stats.pendingReview, 1);
  } finally {
    await srv.close();
  }
});

test('CORRECT-TEST-01: 自己ベストを訂正で下げると、過去の正常な記録へ戻る。変更前後・理由・日時を本人に見せる', { skip: SKIP }, async () => {
  const srv = await freshServer('rank4');
  try {
    const a = await mk(srv, 'じろう', 50, 9000);
    const b = await mk(srv, 'じろう', 49, 9900);
    await mk(srv, 'ほか', 50, 8000);
    assert.equal((await best(srv, 'じろう')).play_id, a.playId);
    let top = await page(srv);
    assert.deepEqual(top.rows.map((r) => [r.name, r.rank]), [['じろう', 1], ['ほか', 2]]);
    await srv.sql("select private.kamereoru_admin_correct($1, 48, 9000, '計算の誤りを修正', 'admin')", [a.playId]);
    const nb = await best(srv, 'じろう');
    assert.equal(nb.play_id, b.playId, '過去の正常記録へ戻る（合成しない）');
    assert.equal(nb.buildings, 49);
    top = await page(srv);
    assert.deepEqual(top.rows.map((r) => [r.name, r.rank, r.buildings]), [['ほか', 1, 50], ['じろう', 2, 49]]);
    const st = await srv.call('status', { items: [{ playId: a.playId, secret: a.secret }] });
    const item = st.body.items[0];
    assert.equal(item.status, 'official');
    assert.deepEqual(item.official, { buildings: 48, rankAverage: 9000 });
    assert.equal(item.corrections.length, 1);
    assert.equal(item.corrections[0].reason, '計算の誤りを修正');
    assert.deepEqual(item.corrections[0].before, { status: 'official', buildings: 50, rankAverage: 9000 });
    assert.ok(item.corrections[0].at);
    // 理由のない訂正は受け付けない
    await assert.rejects(srv.sql("select private.kamereoru_admin_correct($1, 47, 9000, '', 'admin')", [a.playId]));
  } finally {
    await srv.close();
  }
});

test('R5: 同じ登録名の承認と訂正が同時に起きても、どちらが先でも強い方の実在記録がベストに残る', { skip: SKIP }, async () => {
  for (const order of ['approve-first', 'correct-first']) {
    const srv = await freshServer('rank5');
    const c1 = new pg.Client({ connectionString: srv.url });
    const c2 = new pg.Client({ connectionString: srv.url });
    try {
      await c1.connect();
      await c2.connect();
      const current = await mk(srv, 'さぶろう', 50, 9500);
      const pending = await mk(srv, 'さぶろう', 50, 9100, { status: 'pending_review' });
      await mk(srv, 'さぶろう', 49, 9990);
      const approve = (c) => c.query("select private.kamereoru_admin_decide($1, 'official', '確認済み', 'admin-a')", [pending.playId]);
      const correct = (c) => c.query("select private.kamereoru_admin_correct($1, 50, 8000, '計算の誤り', 'admin-b')", [current.playId]);
      const [first, second] = order === 'approve-first' ? [approve, correct] : [correct, approve];
      await c1.query('begin');
      await first(c1);
      await c2.query('begin');
      const waiting = second(c2); // 同じ名前の処理なので、先の取引の終わりを待つ
      const raced = await Promise.race([waiting.then(() => 'done'), new Promise((r) => setTimeout(() => r('blocked'), 300))]);
      assert.equal(raced, 'blocked', '同じ名前の処理は直列化される');
      await c1.query('commit');
      await waiting;
      await c2.query('commit');
      // 正解：正式記録の中で最も強い実在記録（50棟91.00）
      const b = await best(srv, 'さぶろう');
      assert.equal(b.play_id, pending.playId, order);
      assert.equal(b.rank_avg, 9100, order);
      const audits = await count(srv, "select count(*) as n from private.kamereoru_audit where action in ('correct', 'decide:official')");
      assert.equal(audits, 2);
    } finally {
      await c1.end().catch(() => {});
      await c2.end().catch(() => {});
      await srv.close();
    }
  }
});

test('REVIEW-TEST-02: 再審査の申請は1記録に1回、送信元の端末からだけ。名前や番号だけでは照会できない', { skip: SKIP }, async () => {
  const srv = await freshServer('rank6');
  try {
    const r = await mk(srv, 'しろう', 20, 9000, { status: 'rejected' });
    const other = await srv.call('review', { playId: r.playId, secret: randomSecret() });
    assert.equal(other.status, 403);
    const ok = await srv.call('review', { playId: r.playId, secret: r.secret });
    assert.equal(ok.body.status, 'under_review');
    const twice = await srv.call('review', { playId: r.playId, secret: r.secret });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.error, 'not_rejected');
    // 再審査の結果が拒否なら、もう申請できない
    await srv.sql("select private.kamereoru_admin_decide($1, 'rejected', '再審査でも成立せず', 'admin')", [r.playId]);
    const third = await srv.call('review', { playId: r.playId, secret: r.secret });
    assert.equal(third.body.error, 'review_already_requested');
    const peek = await srv.call('status', { items: [{ playId: r.playId, secret: randomSecret() }] });
    assert.equal(peek.body.items[0].error, 'forbidden');
  } finally {
    await srv.close();
  }
});

test('R5/DATA-TEST-01: 拒否から31日後の初回申請と期限整理が同時でも証拠を消さない。正常記録の詳細だけ整理し、集計は残す', { skip: SKIP }, async () => {
  const srv = await freshServer('rank7');
  const c1 = new pg.Client({ connectionString: srv.url });
  const c2 = new pg.Client({ connectionString: srv.url });
  try {
    await c1.connect();
    await c2.connect();
    const rejected = await mk(srv, 'ごろう', 30, 9000, { status: 'rejected', receivedAgo: '31 days' });
    const official = await mk(srv, 'ごろう', 40, 8000, { receivedAgo: '31 days' });
    const fresh = await mk(srv, 'ろくろう', 40, 8000);
    // 申請（未確定）と期限整理を同時に走らせる
    await c1.query('begin');
    await c1.query('select private.kamereoru_request_review($1, decode($2, \'hex\'))', [rejected.playId, await sha256Hex(rejected.secret)]);
    const purge = c2.query('select private.kamereoru_purge_details(now()) as n');
    await new Promise((r) => setTimeout(r, 200));
    await c1.query('commit');
    const purged = Number((await purge).rows[0].n);
    assert.equal(purged, 1, '31日を過ぎた正常記録の詳細だけを整理');
    const rows = await srv.sql('select play_id, status, body is null as purged from private.kamereoru_results order by received_at');
    const byId = Object.fromEntries(rows.map((r) => [r.play_id, r]));
    assert.equal(byId[rejected.playId].status, 'under_review');
    assert.equal(byId[rejected.playId].purged, false, '再審査に必要な詳細は残す');
    assert.equal(byId[official.playId].purged, true);
    assert.equal(byId[fresh.playId].purged, false);
    // 集計・自己ベスト・重複防止の情報は残る
    assert.equal((await best(srv, 'ごろう')).play_id, official.playId);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_result_claims'), 3);
    const st = await srv.call('status', { items: [{ playId: official.playId, secret: official.secret }] });
    assert.deepEqual(st.body.items[0].official, { buildings: 40, rankAverage: 8000 });
    // もう一度整理しても、再審査中の詳細は残る
    await srv.sql("select private.kamereoru_purge_details(now() + interval '1 year')");
    assert.equal((await srv.sql('select body is null as p from private.kamereoru_results where play_id = $1', [rejected.playId]))[0].p, false);
  } finally {
    await c1.end().catch(() => {});
    await c2.end().catch(() => {});
    await srv.close();
  }
});

test('ホームと結果は同じ集計元：個人の正式順位は、上位一覧を切り出す前に計算する', { skip: SKIP }, async () => {
  const srv = await freshServer('rank8');
  try {
    for (let i = 0; i < 35; i += 1) await mk(srv, `p${String(i).padStart(2, '0')}`, 50, 9000 - i);
    const r = await srv.call('rank', { name: 'p34' });
    assert.equal(r.body.rank, 35);
    const none = await srv.call('rank', { name: 'いない' });
    assert.equal(none.body.rank, null);
    const empty = await srv.call('rank', { name: '   ' });
    assert.equal(empty.body.rank, null);
  } finally {
    await srv.close();
  }
});
