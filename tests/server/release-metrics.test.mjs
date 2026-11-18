import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SKIP, freshServer, sendChunks, count } from './helpers.mjs';
import { createHandler } from '../../supabase/functions/_shared/kamereoru/handlers.ts';
import { randomSecret } from '../../src/storage/store.js';
import { uuid, sha256Hex } from '../../src/net/api.js';
import { RULES_V4, createGame, createRecorder, replayHistory, summarize } from '../../src/rules/v1/index.js';

const stats = async (srv) => (await srv.call('stats', null, { method: 'GET' })).body;
const status = async (srv, ...items) => (await srv.call('status', { items })).body.items;
const launch = (srv, body) => srv.call('launch', { gameVersion: 'test', ...body });

test('stats accepts GET from the lab Pages origin and rejects POST', async () => {
  const origin = 'https://chameleonjp-lab.github.io';
  const db = { query: async (sql) => sql.includes('rate_hit') ? [{ ok: true }] : [{ r: { totalPlays: 4, clearerCount: 1 } }] };
  const handle = createHandler({ db, allowedOrigin: origin });
  const url = 'http://localhost/functions/v1/kamereoru/stats';
  const res = await handle(new Request(url, { headers: { origin } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await res.json(), { ok: true, totalPlays: 4, clearerCount: 1 });
  assert.equal((await handle(new Request(url, { method: 'POST' }))).status, 404);
});

function perfectRun(seed, buildings) {
  const game = createGame({ seed, rules: RULES_V4 });
  const rec = createRecorder(RULES_V4);
  for (let i = 0; i < buildings; i++) {
    rec.push({ type: 'color', t: i * RULES_V4.buildingMs, ...game.course.targets[i] });
  }
  if (buildings < 50) rec.push({ type: 'quit', t: buildings * RULES_V4.buildingMs + 1 });
  const claimed = summarize(replayHistory(game, rec.entries).state, RULES_V4);
  assert.equal(claimed.buildings, buildings);
  return { history: rec.entries, claimed };
}

async function namedRun(srv, name, buildings, { early = false } = {}) {
  const secret = randomSecret();
  const launchId = uuid();
  const gameVersion = 'test';
  const start = await srv.call('start', { requestId: uuid(), launchId, secret, name, gameVersion,
    supportedRulesVersions: [RULES_V4.rulesVersion] });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const { playId, seed, rulesVersion, generatorVersion } = start.body;
  const owner = { playId, secret };
  const launched = { launchId, ranked: true, ...owner };
  const sendLaunch = async () => assert.equal((await launch(srv, launched)).body.counted, true);
  if (!early) await sendLaunch();
  await srv.sql("update private.kamereoru_starts set accepted_at=now()-interval '10 minutes' where play_id=$1", [playId]);
  const text = JSON.stringify({ format: 'kamereoru-result-v1', playId, launchId, seed, rulesVersion,
    generatorVersion, gameVersion, ...perfectRun(seed, buildings) });
  const resultId = uuid();
  const sent = await sendChunks(srv, owner, resultId, { text, sha: await sha256Hex(text) });
  assert.ok(sent.responses.every(r => r.status === 200));
  const complete = () => srv.call('complete', { ...owner, resultId });
  if (early) {
    const pending = await complete();
    assert.equal(pending.status, 409);
    assert.deepEqual(pending.body, { ok: false, error: 'launch_not_received', retryable: true });
    await sendLaunch();
  }
  assert.equal((await complete()).status, 200);
  await srv.handler.processJobs();
  return { owner, complete, launched };
}

test('four real starts: anonymous clear, A50, B30, A7; launch and result retries are idempotent', { skip: SKIP }, async () => {
  const srv = await freshServer('release_four', { processAfterComplete: false });
  try {
    assert.deepEqual(await stats(srv), { ok: true, totalPlays: 0, clearerCount: 0 });
    const anonymous = { launchId: uuid(), ranked: false };
    assert.equal((await launch(srv, anonymous)).body.counted, true);
    assert.equal(perfectRun(42, 50).claimed.endReason, 'cleared');
    const a = await namedRun(srv, 'A', 50, { early: true });
    const b = await namedRun(srv, 'B', 30);
    const again = await namedRun(srv, 'A', 7);
    assert.equal((await launch(srv, a.launched)).body.counted, false);
    assert.equal((await a.complete()).body.duplicate, true);
    assert.equal((await launch(srv, anonymous)).body.counted, false);
    assert.deepEqual(await stats(srv), { ok: true, totalPlays: 4, clearerCount: 1 });
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_results'), 3);
    const items = await status(srv, a.owner, b.owner, again.owner);
    assert.deepEqual(items.map(i => i.metrics), [1, 2, 3].map((runRank, i) => ({ runRank, totalPlays: 4, clearOrdinal: i === 0 ? 1 : null })));
    const rows = (await srv.call('ranking', null, { method: 'GET' })).body.rows;
    assert.deepEqual(rows.map(r => [r.name, r.rank, r.buildings]), [['A', 1, 50], ['B', 2, 30]]);
    const repeat = await namedRun(srv, 'A', 50);
    assert.deepEqual(await stats(srv), { ok: true, totalPlays: 5, clearerCount: 1 });
    assert.deepEqual((await status(srv, repeat.owner))[0].metrics, { runRank: 1, totalPlays: 5, clearOrdinal: 1 });
    assert.deepEqual((await status(srv, { playId: a.owner.playId, secret: randomSecret() }))[0], { playId: a.owner.playId, error: 'forbidden' });
    const zero = await namedRun(srv, 'zero', 0);
    assert.deepEqual((await status(srv, zero.owner))[0].metrics, { runRank: null, totalPlays: 6, clearOrdinal: null });
  } finally { await srv.close(); }
});

test('clear admissions survive review, correction, backfill and concurrent approval', { skip: SKIP }, async () => {
  const srv = await freshServer('release_order', { processAfterComplete: false });
  const migration = readFileSync(new URL('../../supabase/migrations/20261118100000_release_metrics.sql', import.meta.url), 'utf8');
  const decide = (id, state) => srv.sql("select private.kamereoru_admin_decide($1,$2,'test','test')", [id, state]);
  try {
    const runs = [];
    for (const name of ['A', 'B', 'A', 'C', 'C']) runs.push(await namedRun(srv, name, 50));
    const owners = runs.map(r => r.owner);
    const [a, b, , c, c2] = owners.map(o => o.playId);
    const ordinals = async () => (await status(srv, ...owners)).map(i => i.metrics.clearOrdinal);
    // Simulate migration of existing clears, breaking an official_at tie by play ID.
    await srv.sql('truncate private.kamereoru_clear_admissions');
    await srv.sql("update private.kamereoru_results set official_at='-infinity' where play_id=any($1::uuid[])", [[a, b]]);
    await srv.sql(migration);
    const before = await srv.sql('select play_id,confirmed_order from private.kamereoru_clear_admissions order by confirmed_order');
    assert.deepEqual(before.slice(0, 2).map(x => x.play_id), [a, b].sort());
    await srv.sql(migration);
    assert.deepEqual(await srv.sql('select play_id,confirmed_order from private.kamereoru_clear_admissions order by confirmed_order'), before);
    const initial = await ordinals();
    await decide(a, 'rejected');
    assert.deepEqual(await ordinals(), [null, 1, 2, 3, 3]);
    await srv.call('review', owners[0]);
    assert.deepEqual(await ordinals(), [null, 1, 2, 3, 3]);
    await decide(a, 'official');
    assert.deepEqual(await ordinals(), initial);
    await Promise.all([c, c2].map(id => decide(id, 'rejected')));
    assert.equal((await stats(srv)).clearerCount, 2);
    // Distinct connections race to admit two runs of one name and one of another.
    const d = await namedRun(srv, 'D', 50);
    await decide(d.owner.playId, 'rejected');
    await srv.sql('delete from private.kamereoru_clear_admissions where play_id=any($1::uuid[])', [[c, c2, d.owner.playId]]);
    const first = await srv.pool.connect();
    const waiting = [];
    try {
      await first.query('begin');
      await first.query("select private.kamereoru_admin_decide($1,'official','test','test')", [c]);
      waiting.push(decide(c2, 'official'), decide(d.owner.playId, 'official'));
      let blocked = 0;
      for (let tries = 0; tries < 100 && blocked < 2; tries++) {
        blocked = await count(srv, "select count(*) as n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
        if (blocked < 2) await new Promise(resolve => setTimeout(resolve, 5));
      }
      assert.equal(blocked, 2, 'both approval connections wait for admission order to commit');
      await first.query('commit');
    } finally {
      await first.query('rollback');
      first.release();
      await Promise.all(waiting);
    }
    assert.equal((await stats(srv)).clearerCount, 4);
    const last = (await status(srv, owners[3], owners[4], d.owner)).map(i => i.metrics.clearOrdinal);
    assert.equal(last[0], last[1]);
    assert.deepEqual([...new Set(last)].sort(), [3, 4]);
    const partial = await namedRun(srv, 'E', 7);
    await srv.sql("select private.kamereoru_admin_correct($1,50,10000,'test','test')", [partial.owner.playId]);
    assert.equal((await status(srv, partial.owner))[0].metrics.clearOrdinal, null);
    assert.equal((await stats(srv)).clearerCount, 4);
  } finally { await srv.close(); }
});
