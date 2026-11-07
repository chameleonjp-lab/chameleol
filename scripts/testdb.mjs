// 試験用の使い捨て PostgreSQL。Supabase の役割（anon / authenticated / service_role）を模して、マイグレーションを適用した型（template）を作る。
// - KAMEREORU_TEST_ADMIN_URL があればその PostgreSQL（CI のサービスなど）を使う。
// - なければ、このリポジトリの .tmp/pg に一時的なクラスタを作る（root で動かす時は postgres ユーザーで起動）。
// 本番の Supabase には接続しない。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const TEMPLATE_DB = 'kamereoru_template';

function pgBin(name) {
  for (const v of ['17', '16', '15']) {
    const p = `/usr/lib/postgresql/${v}/bin/${name}`;
    if (existsSync(p)) return p;
  }
  return name;
}

function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const asPg = (cmd, args, opts = {}) => (isRoot ? execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], opts) : execFileSync(cmd, args, opts));

export async function startCluster() {
  if (process.env.KAMEREORU_TEST_ADMIN_URL) {
    return { adminUrl: process.env.KAMEREORU_TEST_ADMIN_URL, stop: () => {} };
  }
  const base = join(ROOT, '.tmp');
  mkdirSync(base, { recursive: true });
  const dir = join(base, `pg-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (isRoot) execFileSync('chown', ['postgres:postgres', dir]);
  asPg(pgBin('initdb'), ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-instructions', '-E', 'UTF8', '--locale=C.UTF-8'], { stdio: 'ignore' });
  const port = await freePort();
  asPg(pgBin('pg_ctl'), ['-D', join(dir, 'data'), '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, '-l', join(dir, 'log.txt'), '-w', 'start'], { stdio: 'ignore' });
  const adminUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  return {
    adminUrl,
    stop() {
      try {
        asPg(pgBin('pg_ctl'), ['-D', join(dir, 'data'), '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

export function psql(url, args, { input = null, check = true } = {}) {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args], { input, encoding: 'utf8' });
  if (check && r.status !== 0) {
    throw new Error(`psql failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return r;
}

export const dbUrl = (adminUrl, db) => adminUrl.replace(/\/[^/?]+(\?|$)/, `/${db}$1`);

/** Supabase の役割を模し、マイグレーションを順に適用した型のデータベースを作る。 */
export function buildTemplate(adminUrl) {
  psql(adminUrl, ['-c', `drop database if exists ${TEMPLATE_DB}`]);
  psql(adminUrl, ['-c', `create database ${TEMPLATE_DB}`]);
  const url = dbUrl(adminUrl, TEMPLATE_DB);
  psql(url, ['-c', `
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists private;
    grant usage on schema private to anon, authenticated;  -- 権限の検査のため、スキーマの利用だけは許しておく
  `]);
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    psql(url, ['-f', join(dir, f)]);
  }
  return url;
}

/** 型から新しいデータベースを作る（試験ごとに独立させる）。 */
export function createTestDb(adminUrl, name) {
  psql(adminUrl, ['-c', `drop database if exists ${name}`, '-c', `create database ${name} template ${TEMPLATE_DB}`]);
  return dbUrl(adminUrl, name);
}

export function dropTestDb(adminUrl, name) {
  psql(adminUrl, ['-c', `drop database if exists ${name} with (force)`], { check: false });
}

export function readSql(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}
