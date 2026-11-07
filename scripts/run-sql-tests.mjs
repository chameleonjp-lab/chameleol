// データベースとサーバー処理の試験をまとめて実行する。
// 使い方: npm run test:sql
//   1. 使い捨ての PostgreSQL を起動（または KAMEREORU_TEST_ADMIN_URL を使う）
//   2. Supabase の役割を模してマイグレーションを適用
//   3. supabase/tests/*.sql を実行（権限・順位などの検査）
//   4. tests/server/*.test.mjs を実行（受付・再送・検証・順位・訂正の通し試験）
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, buildTemplate, createTestDb, dropTestDb, psql, startCluster } from './testdb.mjs';

const cluster = await startCluster();
let failed = false;
try {
  buildTemplate(cluster.adminUrl);
  const sqlDir = join(ROOT, 'supabase', 'tests');
  for (const f of readdirSync(sqlDir).filter((x) => x.endsWith('.sql')).sort()) {
    const name = `sqltest_${f.replace(/\W/g, '_')}`.toLowerCase();
    const url = createTestDb(cluster.adminUrl, name);
    const r = psql(url, ['-f', join(sqlDir, f)], { check: false });
    process.stdout.write(`${r.status === 0 ? 'ok' : 'not ok'} - supabase/tests/${f}\n`);
    if (r.status !== 0) {
      failed = true;
      process.stdout.write(r.stdout + r.stderr);
    } else if (r.stdout.trim()) {
      process.stdout.write(r.stdout.split('\n').map((l) => `#   ${l}`).join('\n') + '\n');
    }
    dropTestDb(cluster.adminUrl, name);
  }
  const files = readdirSync(join(ROOT, 'tests', 'server')).filter((x) => x.endsWith('.test.mjs')).map((x) => join('tests', 'server', x));
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, KAMEREORU_TEST_ADMIN_URL_RUNNING: cluster.adminUrl },
  });
  if (r.status !== 0) failed = true;
} finally {
  cluster.stop();
}
process.exit(failed ? 1 : 0);
