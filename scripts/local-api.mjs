// 検証用の受付サーバー。Edge Function と同じ処理（handlers.ts）を Node で動かし、使い捨ての PostgreSQL につなぐ。
// 本番の Supabase には接続しない。自動ブラウザの通し試験と、手元での確認に使う。
// 使い方（手元）: node scripts/local-api.mjs  → 表示された URL を、localhost で開いたゲームの
//   localStorage 'kamereoru.apiBase' に入れる。
import { createServer } from 'node:http';
import pg from 'pg';
import { createHandler } from '../supabase/functions/_shared/kamereoru/handlers.ts';

/**
 * options.failRoutes に入れた入口は 503 を返す（通信障害の再現用）。
 */
export async function startLocalApi({ dbUrl, port = 0, failRoutes = new Set(), log = () => {} }) {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 8 });
  const background = [];
  const handler = createHandler({
    db: { query: async (text, params) => (await pool.query(text, params)).rows },
    waitUntil: (p) => background.push(p),
    log,
  });
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = `http://${req.headers.host}${req.url}`;
    const route = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (failRoutes.has(route) && req.method !== 'OPTIONS') {
      res.writeHead(503, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: false, error: 'temporarily_unavailable', retryable: true }));
      return;
    }
    const request = new Request(url, {
      method: req.method,
      headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/functions/v1/kamereoru`;
  return {
    base,
    pool,
    failRoutes,
    async settle() {
      while (background.length) await background.shift().catch(() => {});
    },
    async close() {
      server.close();
      await Promise.allSettled(background);
      await pool.end();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { startCluster, buildTemplate, createTestDb } = await import('./testdb.mjs');
  const cluster = await startCluster();
  buildTemplate(cluster.adminUrl);
  const dbUrl = createTestDb(cluster.adminUrl, 'kamereoru_local');
  const api = await startLocalApi({ dbUrl, port: Number(process.env.PORT ?? 8787), log: (e) => console.log(JSON.stringify(e)) });
  console.log(`local API: ${api.base}`);
  console.log(`DB: ${dbUrl}`);
  const stop = async () => {
    await api.close();
    cluster.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
