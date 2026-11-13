import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SKIP, freshServer, rankedStart, submitPlay, sendChunks, count } from './helpers.mjs';
import { uuid, sha256Hex } from '../../src/net/api.js';
import { randomSecret } from '../../src/storage/store.js';
import { createGame, createRecorder, replayHistory, summarize, rulesForVersion } from '../../src/rules/v1/index.js';
import { verifyResult } from '../../supabase/functions/_shared/kamereoru/replay.ts';

const V1 = 'kamereoru-rules-v1';
const V3 = 'kamereoru-rules-v3';
const V4 = 'kamereoru-rules-v4';
const versions = [V3, V1];
const request = (supportedRulesVersions = versions) => ({ requestId: uuid(), secret: randomSecret(), launchId: uuid(), name: 'bonus', gameVersion: '0.1.0', ...(supportedRulesVersions === undefined ? {} : { supportedRulesVersions }) });
const identity = ({ requestId, playId, seed, rulesVersion, generatorVersion, gameVersion, name, acceptedAt }) => ({ requestId, playId, seed, rulesVersion, generatorVersion, gameVersion, name, acceptedAt });
const config = (srv, accepted) => srv.sql('update private.kamereoru_config set accepted_rules_versions=$1', [accepted]);
const status = async (srv, s, secret = s.secret) => (await srv.call('status', { items: [{ playId: s.playId, secret }] })).body.items[0];

async function bonusStart(srv) {
  const req = request();
  const r = await srv.call('start', req);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rulesVersion, V3);
  await srv.sql("update private.kamereoru_starts set accepted_at=now()-interval '10 minutes' where request_id=$1", [req.requestId]);
  return { ...req, ...r.body };
}

function perfectBody(start, { quitAt = null } = {}) {
  const rules = rulesForVersion(V3);
  const game = createGame({ seed: start.seed, rules });
  const rec = createRecorder(rules);
  for (let i = 0; i < 50 && (quitAt == null || i * 5000 < quitAt); i += 1) rec.push({ type: 'color', t: i * 5000, ...game.course.targets[i] });
  if (quitAt != null) rec.push({ type: 'quit', t: quitAt });
  const { state } = replayHistory(game, rec.entries);
  const summary = summarize(state, rules);
  return {
    body: { format: 'kamereoru-result-v1', playId: start.playId, launchId: start.launchId, seed: start.seed, rulesVersion: V3, generatorVersion: 'kamereoru-course-v1', gameVersion: '0.1.0', history: rec.entries, claimed: summary },
    summary,
  };
}

async function submitBonus(srv, start, opts = {}) {
  const { body, summary } = perfectBody(start, opts);
  opts.mutate?.(body.claimed);
  const text = JSON.stringify(body);
  const resultId = uuid();
  const sent = await sendChunks(srv, start, resultId, { text, sha: await sha256Hex(text) });
  assert.ok(sent.responses.every((r) => r.status === 200));
  const done = await srv.call('complete', { playId: start.playId, resultId, secret: start.secret });
  assert.equal(done.status, 200);
  return { body, summary, resultId };
}

test('old_new_start_matrix and invalid ranked version lists', { skip: SKIP }, async () => {
  const srv = await freshServer('bonus_matrix');
  try {
    // The retained eight-argument function models the old server contract.
    for (const supported of [undefined, versions]) {
      const req = request(supported);
      const rows = await srv.sql("select private.kamereoru_start($1, decode($2,'hex'), $3, $4, $4, $5, 'kamereoru-course-v1', $6) as r", [req.requestId, await sha256Hex(req.secret), req.launchId, req.name, V1, req.gameVersion]);
      assert.equal(rows[0].r.rulesVersion, V1);
    }
    const oldReq = request(); delete oldReq.supportedRulesVersions;
    assert.equal((await srv.call('start', oldReq)).body.rulesVersion, V1);
    assert.equal((await srv.call('start', request())).body.rulesVersion, V3);
    for (const invalid of [[], [V4], ['future'], [V1, V1], [V3, V1, V4], null, V3, [null]]) {
      const r = await srv.call('start', request(invalid));
      assert.equal(r.status, 422, JSON.stringify(invalid));
    }
    await config(srv, [V1]);
    assert.equal((await srv.call('start', request())).body.rulesVersion, V1);
    assert.equal((await srv.call('start', request([V3]))).status, 422);
  } finally { await srv.close(); }
});

test('accepted_response_lost_during_upgrade preserves acceptance before and after setting changes', { skip: SKIP }, async () => {
  const srv = await freshServer('bonus_lost');
  try {
    await config(srv, [V1]);
    const req = request();
    const before = await srv.call('start', req);
    assert.equal(before.body.rulesVersion, V1);
    await config(srv, versions);
    srv.restart();
    assert.deepEqual(identity((await srv.call('start', req)).body), identity(before.body));
    const next = request();
    const after = await srv.call('start', next);
    assert.equal(after.body.rulesVersion, V3);
    await config(srv, [V1]);
    await srv.sql('select private.kamereoru_set_accepting(false)');
    assert.deepEqual(identity((await srv.call('start', next)).body), identity(after.body));
    assert.equal((await srv.call('start', { ...next, supportedRulesVersions: [V1] })).status, 409);
    for (const change of [{ secret: randomSecret() }, { launchId: uuid() }, { name: 'changed' }, { gameVersion: 'next' }]) {
      assert.equal((await srv.call('start', { ...next, ...change })).status, change.secret ? 403 : 409);
    }
  } finally { await srv.close(); }
});

test('concurrent_same_request_same_seed_version including a conflicting version selection', { skip: SKIP }, async () => {
  const srv = await freshServer('bonus_concurrent');
  try {
    const req = request();
    const results = await Promise.all(Array.from({ length: 8 }, () => srv.call('start', req)));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(results.filter((r) => r.body.created).length, 1);
    for (const r of results) assert.deepEqual(identity(r.body), identity(results[0].body));
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_starts'), 1);

    // Hold the winner uncommitted while the compatible call selects v3 and waits
    // on INSERT. Its conflict path must reread and return the winner's v1.
    const winner = await srv.pool.connect();
    const race = request();
    try {
      await winner.query('begin');
      const row = (await winner.query("select private.kamereoru_start($1, decode($2,'hex'), $3, $4, $4, $5, 'kamereoru-course-v1', $6) as r", [race.requestId, await sha256Hex(race.secret), race.launchId, race.name, V1, race.gameVersion])).rows[0].r;
      const loser = srv.call('start', race);
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i += 1) {
        waiting = (await srv.sql("select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock') as waiting"))[0].waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.equal(waiting, true, 'compatible insert must reach the conflict');
      await winner.query('commit');
      const lost = await loser;
      assert.equal(lost.status, 200);
      assert.deepEqual(identity(lost.body), identity(row));
      assert.equal(lost.body.created, false);
    } finally { await winner.query('rollback'); winner.release(); }
  } finally { await srv.close(); }
});

test('v3 replay ignores forged auxiliary bonuses and preserves v1 ranking conditions', { skip: SKIP }, async () => {
  const srv = await freshServer('bonus_verified', { processAfterComplete: false });
  try {
    const s = await bonusStart(srv);
    const { body, summary } = await submitBonus(srv, s, { mutate(claimed) {
      claimed.score.total = -1; claimed.score.bonus = 999999;
      claimed.maxCombo = -1; claimed.perBuilding[0][2] = -5;
      claimed.bonus = { format: 'invented', points: -500, totals: {}, awards: [{ id: 'duplicate', kind: 'unknown', points: 999999 }, { id: 'duplicate', kind: 'unknown', points: -1 }] };
    } });
    assert.equal((await status(srv, s)).verifiedScore, undefined, 'verifying is private');
    await srv.settle(); await srv.handler.processJobs();
    const verified = await status(srv, s);
    assert.equal(verified.status, 'official');
    assert.equal(verified.verifiedScore.rulesVersion, V3);
    assert.equal(verified.verifiedScore.score.total, 7280);
    assert.equal(verified.verifiedScore.score.bonus, 1200);
    assert.equal(verified.verifiedScore.bonus.awards.length, 156);
    assert.equal(verified.verifiedScore.maxCombo, 50);
    assert.equal(verified.verifiedScore.perBuilding[0][2], 120);
    assert.equal(verified.verifiedScore.perBuilding[49][2], 160);
    const row = (await srv.sql('select verdict, body from private.kamereoru_results where play_id=$1', [s.playId]))[0];
    assert.deepEqual(row.verdict.verifiedScore, verified.verifiedScore);
    assert.ok(row.verdict.notes.includes('aux_bonus'));
    assert.equal(row.body.claimed.score.total, -1, 'original claim retained');
    assert.deepEqual((await status(srv, s, randomSecret())), { playId: s.playId, error: 'forbidden' });
    const ranking = (await srv.call('ranking', {}, { method: 'GET' })).body.rows;
    assert.equal(ranking.length, 1);
    assert.deepEqual(Object.keys(ranking[0]).sort(), ['average', 'buildings', 'name', 'position', 'rank']);
    const old = replayHistory(createGame({ seed: s.seed, rules: rulesForVersion(V1) }), body.history).state;
    const newState = replayHistory(createGame({ seed: s.seed, rules: rulesForVersion(V3) }), body.history).state;
    const legacySummary = summarize(old, rulesForVersion(V1));
    assert.equal(legacySummary.score.total, 6080);
    for (const key of ['buildings', 'rankAverage', 'meanNum', 'meanDen', 'endReason', 'endT']) assert.deepEqual(summary[key], legacySummary[key], key);
    assert.equal(newState.alert, old.alert);
  } finally { await srv.close(); }
});

test('verifiedScore appears only for completed v3 official and no_rank results', { skip: SKIP }, async () => {
  const srv = await freshServer('bonus_visibility', { processAfterComplete: false });
  try {
    const s = await bonusStart(srv);
    await submitBonus(srv, s, { quitAt: 0 });
    await srv.handler.processJobs();
    assert.equal((await status(srv, s)).status, 'no_rank');
    assert.equal((await status(srv, s)).verifiedScore.score.total, 0);
    await srv.settle();
    for (const state of ['verifying', 'pending_review', 'under_review', 'rejected']) {
      await srv.sql('update private.kamereoru_results set status=$2 where play_id=$1', [s.playId, state]);
      assert.equal((await status(srv, s)).verifiedScore, undefined, state);
      await srv.settle();
    }
    const old = await rankedStart(srv);
    await submitPlay(srv, old, { quitAt: 0 });
    await srv.handler.processJobs();
    assert.equal((await status(srv, old)).verifiedScore, undefined, 'legacy record shape');
  } finally { await srv.close(); }
});

test('bonus migration can be reapplied without altering old rows or duplicating configuration', { skip: SKIP }, async () => {
  const srv = await freshServer('bonus_migration');
  try {
    const s = await rankedStart(srv);
    await submitPlay(srv, s, { quitAt: 0 }); await srv.settle();
    const oldStarts = await srv.sql('select to_jsonb(s) as row from private.kamereoru_starts s');
    const oldResults = await srv.sql('select to_jsonb(r) as row from private.kamereoru_results r');
    const path = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).find((p) => p.endsWith('_bonus_score_versions.sql'));
    const sql = readFileSync(new URL(`../../supabase/migrations/${path}`, import.meta.url), 'utf8');
    await srv.sql(sql); await srv.sql(sql);
    assert.deepEqual(await srv.sql('select to_jsonb(s) as row from private.kamereoru_starts s'), oldStarts);
    assert.deepEqual(await srv.sql('select to_jsonb(r) as row from private.kamereoru_results r'), oldResults);
    assert.equal(await count(srv, 'select count(*) as n from private.kamereoru_config'), 1);
  } finally { await srv.close(); }
});

test('bonus-only forged claims are recomputed while ranking mismatches stay under review', () => {
  const start = { playId: uuid(), launchId: uuid(), seed: 42 };
  const { body } = perfectBody(start);
  const input = { ...start, rulesVersion: V3, generatorVersion: 'kamereoru-course-v1', acceptedAt: '2026-11-13T00:00:00Z', receivedAt: '2026-11-13T00:10:00Z', body };
  for (const mutate of [
    (bonus) => { bonus.points = 999999; },
    (bonus) => { bonus.points = -1; },
    (bonus) => { bonus.awards[0].kind = 'unknown'; },
    (bonus) => { bonus.awards.push({ ...bonus.awards[0] }); },
  ]) {
    const tampered = structuredClone(input);
    mutate(tampered.body.claimed.bonus);
    const verdict = verifyResult(tampered);
    assert.equal(verdict.status, 'official');
    assert.equal(verdict.verdict.reason, 'verified_aux_mismatch');
    assert.deepEqual(verdict.verdict.notes, ['aux_bonus']);
    assert.equal(verdict.verdict.verifiedScore.score.total, 7280);
    assert.equal(verdict.verdict.verifiedScore.bonus.points, 1200);
    assert.equal(verdict.verdict.verifiedScore.bonus.awards.length, 156);
  }
  const badRank = structuredClone(input);
  badRank.body.claimed.rankAverage = 9000;
  assert.equal(verifyResult(badRank).status, 'pending_review');
  assert.equal(verifyResult(badRank).verdict.verifiedScore, undefined);
  const standalone = structuredClone(input);
  standalone.rulesVersion = standalone.body.rulesVersion = V4;
  assert.equal(verifyResult(standalone).verdict.reason, 'unsupported_rules_version');
  assert.equal(verifyResult(standalone).verdict.verifiedScore, undefined);
});
