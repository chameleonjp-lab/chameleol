// カメレオるの受付（Edge Function の本体）。Web 標準の Request / Response だけを使い、Deno と Node の両方で動く。
// - 入力の形式・大きさを検査し、送信元の秘密は SHA-256 の照合値だけをデータベースへ渡す（秘密そのものは保存・記録しない）。
// - 重複防止・1開始1結果・照合・順位の計算はデータベースの関数と制約で保証する。
// - 頻度制限は接続元のハッシュ単位。名前では制限しない。同じ要求の正当な再送は新規として数えない。
import { normalizeName } from './shared/name.js';
import { RULES_V1, RULES_V3 } from './rules/v1/index.js';
import { verifyResult } from './replay.ts';

export interface Db {
  query(text: string, params?: unknown[]): Promise<any[]>;
}

export interface HandlerOptions {
  db: Db;
  ipSalt?: string;
  allowedOrigin?: string;
  waitUntil?: (p: Promise<unknown>) => void;
  leaseSeconds?: number;
  limits?: Partial<typeof DEFAULT_LIMITS>;
  log?: (entry: Record<string, unknown>) => void;
  processAfterComplete?: boolean;
}

export const DEFAULT_LIMITS = {
  startPer10m: 30,
  launchPer10m: 300,
  chunkPer10m: 3000,
  statusPer10m: 600,
  readPer10m: 1200,
  maxChunkChars: 160 * 1024,
  maxRequestBytes: 200 * 1024,
  maxTotalLength: 8 * 1024 * 1024,
  maxStatusItems: 50,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const VERSION = /^[0-9A-Za-z._+-]{1,64}$/;
const SHA = /^[0-9a-f]{64}$/;

class HttpError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  detail: unknown;
  constructor(status: number, code: string, retryable = false, detail: unknown = null) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.detail = detail;
  }
}

const bad = (code: string, detail: unknown = null) => new HttpError(422, code, false, detail);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function mapDbError(err: any): HttpError {
  const code: string = err?.code ?? '';
  const msg: string = err?.message ?? 'db_error';
  if (code === 'KM403') return new HttpError(403, 'forbidden');
  if (code === 'KM404') return new HttpError(404, msg);
  if (code === 'KM409') return new HttpError(409, msg);
  if (code === 'KM422') return new HttpError(422, msg);
  if (code === 'KM425') return new HttpError(409, msg, true);
  if (code === 'KM429') return new HttpError(429, 'rate_limited', true);
  if (code === 'KM503') return new HttpError(503, msg, false);
  return new HttpError(503, 'temporarily_unavailable', true);
}

export function createHandler(options: HandlerOptions) {
  const { db } = options;
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const leaseSeconds = options.leaseSeconds ?? 60;
  const log = options.log ?? (() => {});
  const cors = {
    'access-control-allow-origin': options.allowedOrigin ?? '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info',
    'access-control-max-age': '600',
    vary: 'origin',
  };

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

  async function call(sql: string, params: unknown[] = []): Promise<any[]> {
    try {
      return await db.query(sql, params);
    } catch (err) {
      throw mapDbError(err);
    }
  }

  async function rate(req: Request, kind: string, limit: number) {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    const bucket = `${kind}:${(await sha256Hex(`${options.ipSalt ?? ''}|${ip}`)).slice(0, 32)}`;
    const rows = await call('select private.kamereoru_rate_hit($1, $2::interval, $3) as ok', [bucket, '10 minutes', limit]);
    if (!rows[0]?.ok) throw new HttpError(429, 'rate_limited', true);
  }

  async function readJson(req: Request): Promise<any> {
    const len = Number(req.headers.get('content-length') ?? '0');
    if (len > limits.maxRequestBytes) throw new HttpError(413, 'too_large');
    const text = await req.text();
    if (text.length > limits.maxRequestBytes) throw new HttpError(413, 'too_large');
    try {
      const v = JSON.parse(text);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
      return v;
    } catch {
      throw bad('invalid_json');
    }
  }

  const need = (cond: boolean, code: string) => {
    if (!cond) throw bad(code);
  };

  async function secretHash(secret: unknown): Promise<string> {
    need(typeof secret === 'string' && SECRET.test(secret), 'bad_secret');
    return sha256Hex(secret as string);
  }

  /** 検証待ちを処理する。止まった作業は期限が過ぎれば再取得され、確定は1回だけ適用される。 */
  async function processJobs(limit = 2): Promise<{ processed: number }> {
    const jobs = await call('select * from private.kamereoru_claim_jobs($1, $2::interval)', [limit, `${leaseSeconds} seconds`]);
    let processed = 0;
    for (const job of jobs) {
      const rows = await call('select private.kamereoru_job_input($1) as j', [job.play_id]);
      const input = rows[0]?.j;
      if (!input || input.status !== 'verifying') {
        continue;
      }
      let v;
      try {
        v = verifyResult(input);
      } catch (err) {
        if (Number(job.attempts) < 3) continue; // 期限後に再試行
        v = { status: 'pending_review', values: {}, verdict: { reason: 'verifier_error', notes: [String((err as Error)?.message ?? err).slice(0, 200)] } };
      }
      await call('select private.kamereoru_finalize($1, $2, $3::jsonb, $4::jsonb) as s', [job.play_id, v.status, JSON.stringify(v.values), JSON.stringify(v.verdict)]);
      processed += 1;
      log({ event: 'verified', status: v.status, reason: v.verdict.reason });
    }
    return { processed };
  }

  const background = (p: Promise<unknown>) => {
    const guarded = p.catch((err) => log({ event: 'background_error', message: String(err?.message ?? err) }));
    if (options.waitUntil) options.waitUntil(guarded);
  };

  const routes: Record<string, (req: Request, url: URL) => Promise<Response>> = {
    async start(req) {
      const b = await readJson(req);
      need(typeof b.requestId === 'string' && UUID.test(b.requestId), 'bad_request_id');
      need(typeof b.launchId === 'string' && UUID.test(b.launchId), 'bad_launch_id');
      need(typeof b.gameVersion === 'string' && VERSION.test(b.gameVersion), 'bad_game_version');
      const supported = b.supportedRulesVersions === undefined ? [RULES_V1.rulesVersion] : b.supportedRulesVersions;
      need(Array.isArray(supported) && supported.length >= 1 && supported.length <= 2
        && new Set(supported).size === supported.length
        && supported.every((v: unknown) => v === RULES_V1.rulesVersion || v === RULES_V3.rulesVersion), 'unsupported_rules_versions');
      const hash = await secretHash(b.secret);
      const n = normalizeName(b.name);
      if (!n.ok || n.empty) throw bad('bad_name', n.ok ? 'empty' : n.error);
      if (n.name !== b.name) throw bad('name_not_normalized', n.name);
      const existing = await call('select 1 from private.kamereoru_starts where request_id = $1', [b.requestId]);
      if (!existing.length) await rate(req, 'start', limits.startPer10m);
      const rows = await call('select private.kamereoru_start_compatible($1, decode($2, \'hex\'), $3, $4, $5, $6, $7::text[]) as r', [
        b.requestId,
        hash,
        b.launchId,
        n.name,
        n.key,
        b.gameVersion,
        supported,
      ]);
      const r = rows[0].r;
      return json(200, { ok: true, ...r, seed: Number(r.seed) });
    },

    async launch(req) {
      const b = await readJson(req);
      need(typeof b.launchId === 'string' && UUID.test(b.launchId), 'bad_launch_id');
      need(typeof b.ranked === 'boolean', 'bad_ranked');
      need(typeof b.gameVersion === 'string' && VERSION.test(b.gameVersion), 'bad_game_version');
      let hash = null;
      if (b.ranked) {
        need(typeof b.playId === 'string' && UUID.test(b.playId), 'bad_play_id');
        hash = await secretHash(b.secret);
      } else need(b.playId == null, 'unranked_with_play');
      await rate(req, 'launch', limits.launchPer10m);
      const rows = await call('select private.kamereoru_launch($1, $2, $3, decode($4, \'hex\'), $5) as r', [b.launchId, b.ranked, b.ranked ? b.playId : null, hash, b.gameVersion]);
      return json(200, { ok: true, ...rows[0].r });
    },

    async abandon(req) {
      const b = await readJson(req);
      need(typeof b.requestId === 'string' && UUID.test(b.requestId), 'bad_request_id');
      const hash = await secretHash(b.secret);
      const rows = await call('select private.kamereoru_abandon($1, decode($2, \'hex\')) as s', [b.requestId, hash]);
      return json(200, { ok: true, status: rows[0].s });
    },

    async chunk(req) {
      const b = await readJson(req);
      need(typeof b.playId === 'string' && UUID.test(b.playId), 'bad_play_id');
      need(typeof b.resultId === 'string' && UUID.test(b.resultId), 'bad_result_id');
      need(Number.isInteger(b.index) && Number.isInteger(b.total) && b.total >= 1 && b.total <= 64 && b.index >= 0 && b.index < b.total, 'chunk_range');
      need(Number.isInteger(b.length) && b.length >= 1 && b.length <= limits.maxTotalLength, 'bad_length');
      need(typeof b.sha256 === 'string' && SHA.test(b.sha256), 'bad_sha256');
      need(typeof b.data === 'string' && b.data.length >= 1 && b.data.length <= limits.maxChunkChars, 'chunk_size');
      const hash = await secretHash(b.secret);
      await rate(req, 'chunk', limits.chunkPer10m);
      const rows = await call('select private.kamereoru_put_chunk($1, $2, decode($3, \'hex\'), $4, $5, $6, $7, $8) as r', [b.playId, b.resultId, hash, b.index, b.total, b.length, b.sha256, b.data]);
      return json(200, { ok: true, ...rows[0].r });
    },

    async complete(req) {
      const b = await readJson(req);
      need(typeof b.playId === 'string' && UUID.test(b.playId), 'bad_play_id');
      need(typeof b.resultId === 'string' && UUID.test(b.resultId), 'bad_result_id');
      const hash = await secretHash(b.secret);
      const rows = await call('select private.kamereoru_accept($1, $2, decode($3, \'hex\')) as r', [b.playId, b.resultId, hash]);
      // 完全受付を返してから検証する（受付と検証待ちは同じ取引で保存済み）
      if (options.processAfterComplete !== false) background(processJobs(2));
      return json(200, { ok: true, ...rows[0].r });
    },

    async status(req) {
      const b = await readJson(req);
      need(Array.isArray(b.items) && b.items.length <= limits.maxStatusItems, 'bad_items');
      const ids: string[] = [];
      const hashes: string[] = [];
      for (const item of b.items) {
        need(item && typeof item.playId === 'string' && UUID.test(item.playId), 'bad_play_id');
        ids.push(item.playId);
        hashes.push(await secretHash(item.secret));
      }
      await rate(req, 'status', limits.statusPer10m);
      const rows = await call("select private.kamereoru_status($1::uuid[], array(select decode(x, 'hex') from unnest($2::text[]) as x)) as r", [ids, hashes]);
      background(processJobs(2));
      return json(200, { ok: true, items: rows[0].r });
    },

    async review(req) {
      const b = await readJson(req);
      need(typeof b.playId === 'string' && UUID.test(b.playId), 'bad_play_id');
      const hash = await secretHash(b.secret);
      const rows = await call('select private.kamereoru_request_review($1, decode($2, \'hex\')) as s', [b.playId, hash]);
      return json(200, { ok: true, status: rows[0].s });
    },

    async rank(req) {
      const b = await readJson(req);
      const n = normalizeName(b.name);
      if (!n.ok || n.empty) return json(200, { ok: true, rank: null });
      await rate(req, 'read', limits.readPer10m);
      const rows = await call('select private.kamereoru_rank_of($1) as r', [n.key]);
      return json(200, { ok: true, ...rows[0].r });
    },

    async ranking(req, url) {
      const version = url.searchParams.get('version');
      const after = url.searchParams.get('after');
      const limit = url.searchParams.get('limit');
      need(version == null || /^\d{1,18}$/.test(version), 'bad_version');
      need(after == null || /^\d{1,6}$/.test(after), 'bad_after');
      need(limit == null || /^\d{1,3}$/.test(limit), 'bad_limit');
      await rate(req, 'read', limits.readPer10m);
      const rows = await call('select private.kamereoru_ranking_page($1::bigint, $2::int, $3::int) as r', [version, after, limit]);
      const r = rows[0].r;
      return json(200, { ok: true, ...r, version: Number(r.version) });
    },

    async process(req) {
      await rate(req, 'read', limits.readPer10m);
      const r = await processJobs(5);
      return json(200, { ok: true, ...r });
    },
  };

  const handle = async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const route = url.pathname.split('/').filter(Boolean).pop() ?? '';
    const fn = routes[route];
    const allowed = route === 'ranking' ? req.method === 'GET' : req.method === 'POST';
    if (!fn || !allowed) return json(404, { ok: false, error: 'not_found' });
    try {
      return await fn(req, url);
    } catch (err) {
      const e = err instanceof HttpError ? err : new HttpError(500, 'internal_error', true);
      if (!(err instanceof HttpError)) log({ event: 'error', route, message: String((err as Error)?.message ?? err).slice(0, 300) });
      return json(e.status, { ok: false, error: e.code, retryable: e.retryable, detail: e.detail ?? undefined });
    }
  };
  return Object.assign(handle, { processJobs });
}
