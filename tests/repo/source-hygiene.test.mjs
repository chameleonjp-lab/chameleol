// ソースの衛生検査：見えない制御文字・方向制御文字が紛れ込んでいないか、秘密情報を置いていないか。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIRS = ['src', 'tests', 'scripts', 'supabase', 'docs', 'index.html', 'README.md'];
const SKIP = new Set(['node_modules', 'dist', 'fixtures']);

function* files(p) {
  const full = join(ROOT, p);
  let st;
  try {
    st = statSync(full);
  } catch {
    return;
  }
  if (st.isFile()) {
    yield p;
    return;
  }
  for (const name of readdirSync(full)) {
    if (SKIP.has(name)) continue;
    yield* files(join(p, name));
  }
}

test('ソースに見えない制御文字（行区切り・方向制御・BOMなど）が入っていない', () => {
  const bad = /[\u0085\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u061C]/;
  const hits = [];
  for (const dir of DIRS) {
    for (const f of files(dir)) {
      if (!/\.(m?js|ts|sql|md|html|css|json)$/.test(f)) continue;
      const text = readFileSync(join(ROOT, f), 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (bad.test(line)) hits.push(`${f}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(hits, []);
});

test('管理用の秘密鍵やトークンをリポジトリに置いていない', () => {
  const suspicious = /(service_role|sb_secret_[A-Za-z0-9]|eyJhbGciOiJ[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+)/;
  const hits = [];
  for (const dir of ['src', 'index.html', 'supabase/functions']) {
    for (const f of files(dir)) {
      const text = readFileSync(join(ROOT, f), 'utf8');
      if (suspicious.test(text)) hits.push(f);
    }
  }
  assert.deepEqual(hits, []);
});
