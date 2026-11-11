import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'kamereoru-build-'));
const source = new URL('../../', import.meta.url);
const files = ['scripts', 'src', 'vendor', 'assets', 'index.html', 'package.json', 'supabase'];
for (const file of files) cpSync(new URL(file, source), join(root, file), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: root });
execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'test'], { cwd: root });

function build({ api = '', publicUrl = 'https://example.invalid/chameleol/', standalone = '', args = [] } = {}) {
  execFileSync(process.execPath, ['scripts/build.mjs', ...args], {
    cwd: root,
    env: {
      ...process.env,
      KAMEREORU_ENV: 'production',
      KAMEREORU_API: api,
      KAMEREORU_PUBLIC_URL: publicUrl,
      KAMEREORU_STANDALONE: standalone,
    },
    stdio: 'pipe',
  });
  return JSON.parse(readFileSync(join(root, 'dist/release.json'), 'utf8'));
}

test('接続先だけ変更しても配布版を分け、旧版の入口をそのまま残す', () => {
  const oldApi = 'https://old.example.invalid/kamereoru';
  const previous = build({ api: oldApi });
  const entry = join('v', previous.assetVersion, 'index.html');
  const oldHtml = readFileSync(join(root, 'dist', entry), 'utf8');
  const current = build({ api: 'https://new.example.invalid/kamereoru', args: ['--keep', 'dist'] });
  assert.notEqual(current.assetVersion, previous.assetVersion);
  assert.deepEqual(current.keptVersions, [previous.assetVersion]);
  assert.equal(readFileSync(join(root, 'dist', entry), 'utf8'), oldHtml);
});

test('単独公開を指定するとランキングの接続先なしで本番版を作れる', () => {
  assert.throws(() => build(), /KAMEREORU_API/);
  const release = build({ standalone: '1' });
  assert.equal(release.env, 'production');
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.match(html, /name="kamereoru-api" content=""/);
  assert.match(html, /rel="canonical" href="https:\/\/example\.invalid\/chameleol\/"/);
  assert.throws(() => build({ standalone: '1', api: 'https://unexpected.example.invalid/' }), /KAMEREORU_STANDALONE/);
});
