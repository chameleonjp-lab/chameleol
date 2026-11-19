// Edge Function の入口（supabase/functions/kamereoru/index.ts）を Deno で実際に起動し、HTTP で一通り呼ぶ確認。
// 本番には接続しない。使い捨ての PostgreSQL を使う。
// 使い方: DENO_BIN=/path/to/deno node scripts/deno-edge-smoke.mjs
import { spawn } from 'node:child_process';
import { startCluster, buildTemplate, createTestDb, psql } from './testdb.mjs';
import { randomSecret } from '../src/storage/store.js';
import { uuid, sha256Hex } from '../src/net/api.js';
import { RULES_V4, createGame, createRecorder, replayHistory } from '../src/rules/v1/index.js';

const deno = process.env.DENO_BIN ?? 'deno';
const cluster = await startCluster();
let child;
const log = [];
try {
  buildTemplate(cluster.adminUrl);
  const dbUrl = createTestDb(cluster.adminUrl, 'edge_smoke');
  child = spawn(deno, ['run', '--config', 'supabase/functions/kamereoru/deno.json', '--allow-net', '--allow-env', '--allow-read', 'supabase/functions/kamereoru/index.ts'], {
    env: { ...process.env, DENO_NO_UPDATE_CHECK: '1', SUPABASE_DB_URL: dbUrl, KAMEREORU_IP_SALT: 'smoke' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const base = 'http://127.0.0.1:8000/functions/v1/kamereoru';
  for (let i = 0; i < 100; i += 1) {
    try {
      await fetch(`${base}/ranking`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  const post = async (path, body) => {
    const res = await fetch(`${base}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const steps = [];
  const req = {
    requestId: uuid(), secret: randomSecret(), launchId: uuid(), name: 'デノ', gameVersion: '0.1.0',
    supportedRulesVersions: [RULES_V4.rulesVersion],
  };
  const start = await post('start', req);
  steps.push(['start', start.status, start.body.playId ? 'playId' : start.body.error]);
  const launch = await post('launch', { launchId: req.launchId, ranked: true, playId: start.body.playId, secret: req.secret, gameVersion: '0.1.0' });
  steps.push(['launch', launch.status, launch.body.counted]);
  // 3棟を通過する操作を再生する。検証用DBだけで、再生時間に合わせて開始時刻を戻す。
  psql(dbUrl, ['-c', "update private.kamereoru_starts set accepted_at = now() - interval '1 minute'"]);
  const game = createGame({ seed: start.body.seed, rules: RULES_V4 });
  const recorder = createRecorder(RULES_V4);
  for (let i = 0; i < 3; i += 1) {
    recorder.push({ type: 'color', t: i * RULES_V4.buildingMs, ...game.course.targets[i] });
  }
  recorder.push({ type: 'quit', t: 3 * RULES_V4.buildingMs });
  const history = recorder.entries;
  const claimed = replayHistory(game, history).summary;
  const text = JSON.stringify({
    format: 'kamereoru-result-v1', playId: start.body.playId, launchId: req.launchId,
    rulesVersion: start.body.rulesVersion, generatorVersion: start.body.generatorVersion,
    gameVersion: req.gameVersion, seed: start.body.seed, history, claimed, endedAt: 1,
  });
  const resultId = uuid();
  const sha = await sha256Hex(text);
  const chunk = await post('chunk', { playId: start.body.playId, resultId, secret: req.secret, index: 0, total: 1, length: text.length, sha256: sha, data: text });
  steps.push(['chunk', chunk.status, chunk.body.received]);
  const complete = await post('complete', { playId: start.body.playId, resultId, secret: req.secret });
  steps.push(['complete', complete.status, complete.body.status]);
  let result;
  for (let i = 0; i < 20; i += 1) {
    const st = await post('status', { items: [{ playId: start.body.playId, secret: req.secret }] });
    result = st.body.items?.[0];
    if (result?.status && result.status !== 'verifying') break;
    await new Promise((r) => setTimeout(r, 300));
  }
  steps.push(['status', 200, result?.status]);
  const ranking = await fetch(`${base}/ranking?limit=30`).then((r) => r.json());
  steps.push(['ranking', 200, `version=${ranking.version} rows=${ranking.rows?.length}`]);
  for (const s of steps) console.log(s.join('\t'));
  const best = ranking.rows?.[0];
  const ok = start.status === 200 && start.body.rulesVersion === RULES_V4.rulesVersion
    && launch.body.counted === true && complete.status === 200
    && result?.status === 'official' && result.verifiedScore?.score.total === claimed.score.total
    && claimed.buildings === 3 && ranking.ok === true && ranking.rows.length === 1
    && best?.name === req.name && best.rank === 1 && best.buildings === 3 && best.average === claimed.rankAverage;
  console.log(ok ? 'EDGE SMOKE OK' : 'EDGE SMOKE FAILED');
  if (!ok) console.log(log.join('').slice(-3000));
  process.exitCode = ok ? 0 : 1;
} finally {
  child?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  cluster.stop();
}
process.exit(process.exitCode ?? 0);
