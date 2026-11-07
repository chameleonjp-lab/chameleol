// サーバー試験の補助。npm run test:sql から起動された使い捨ての PostgreSQL に、試験ごとの新しいデータベースを作る。
import pg from 'pg';
import { createTestDb, dropTestDb } from '../../scripts/testdb.mjs';
import { createHandler } from '../../supabase/functions/_shared/kamereoru/handlers.ts';
import { randomSecret } from '../../src/storage/store.js';
import { uuid, sha256Hex } from '../../src/net/api.js';
import { normalizeName } from '../../src/shared/name.js';
import { buildResultBody } from '../../src/net/outbox.js';
import { simulatePlay } from '../helpers/simulate.mjs';
import { summarize } from '../../src/rules/v1/index.js';

export const ADMIN = process.env.KAMEREORU_TEST_ADMIN_URL_RUNNING ?? null;
export const SKIP = ADMIN ? false : 'npm run test:sql で実行する（使い捨ての PostgreSQL が必要）';

let counter = 0;

export async function freshServer(prefix, handlerOptions = {}) {
  const name = `${prefix}_${process.pid}_${(counter += 1)}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const url = createTestDb(ADMIN, name);
  const pool = new pg.Pool({ connectionString: url, max: 8 });
  const db = { query: async (text, params) => (await pool.query(text, params)).rows };
  const pending = [];
  const make = (opts = {}) =>
    createHandler({ db, waitUntil: (p) => pending.push(p), leaseSeconds: 60, ...handlerOptions, ...opts });
  let handler = make();
  const call = async (path, body = {}, { method = 'POST', ip = '10.0.0.1', h = handler } = {}) => {
    const res = await h(
      new Request(`http://localhost/functions/v1/kamereoru/${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  return {
    url,
    pool,
    db,
    get handler() {
      return handler;
    },
    /** サーバーの処理を作り直す（再起動の代わり）。 */
    restart(opts = {}) {
      handler = make(opts);
      return handler;
    },
    call,
    sql: (text, params) => db.query(text, params),
    settle: async () => {
      while (pending.length) await pending.shift();
    },
    async close() {
      await Promise.allSettled(pending);
      await pool.end();
      dropTestDb(ADMIN, name);
    },
  };
}

/** 名前ありの開始受付を通し、開始通知まで送る。 */
export async function rankedStart(srv, name = 'テスト', { launch = true } = {}) {
  const n = normalizeName(name);
  const req = { requestId: uuid(), secret: randomSecret(), launchId: uuid(), name: n.name, gameVersion: '0.1.0' };
  const r = await srv.call('start', req);
  if (r.status !== 200) throw new Error(`start failed ${JSON.stringify(r.body)}`);
  if (launch) {
    const l = await srv.call('launch', { launchId: req.launchId, ranked: true, playId: r.body.playId, secret: req.secret, gameVersion: '0.1.0' });
    if (l.status !== 200) throw new Error(`launch failed ${JSON.stringify(l.body)}`);
  }
  // 試験の操作は一瞬で終わるため、開始受付の時刻を過去へずらして「実時間より速い」判定を避ける
  await srv.sql("update private.kamereoru_starts set accepted_at = now() - interval '10 minutes' where request_id = $1", [req.requestId]);
  return { ...req, playId: r.body.playId, seed: r.body.seed };
}

/** 実際のプレイに近い履歴を作り、送信用の本文にする。 */
export async function playBody(start, { quitAt = null, mutate = null } = {}) {
  const live = simulatePlay(start.seed, { quitAt });
  const summary = summarize(live.state);
  const snapshot = {
    meta: { playId: start.playId, launchId: start.launchId, rulesVersion: 'kamereoru-rules-v1', generatorVersion: 'kamereoru-course-v1', gameVersion: '0.1.0', seed: start.seed },
    history: live.entries,
  };
  let body = JSON.parse(buildResultBody(snapshot, summary, { endedAt: 1 }));
  if (mutate) body = mutate(body) ?? body;
  const text = JSON.stringify(body);
  return { text, sha: await sha256Hex(text), summary, live };
}

/** 本文を chunkChars ごとに分けて送る。skip に入れた番号の片は送らない。 */
export async function sendChunks(srv, start, resultId, { text, sha }, { chunkChars = 4096, skip = [], ip } = {}) {
  const total = Math.max(1, Math.ceil(text.length / chunkChars));
  const responses = [];
  for (let i = 0; i < total; i += 1) {
    if (skip.includes(i)) continue;
    responses.push(
      await srv.call(
        'chunk',
        { playId: start.playId, resultId, secret: start.secret, index: i, total, length: text.length, sha256: sha, data: text.slice(i * chunkChars, (i + 1) * chunkChars) },
        { ip },
      ),
    );
  }
  return { total, responses };
}

export async function submitPlay(srv, start, opts = {}) {
  const body = await playBody(start, opts);
  const resultId = uuid();
  await sendChunks(srv, start, resultId, body, opts);
  const done = await srv.call('complete', { playId: start.playId, resultId, secret: start.secret });
  return { resultId, body, done };
}

export const count = async (srv, sql, params) => Number((await srv.sql(sql, params))[0].n);
