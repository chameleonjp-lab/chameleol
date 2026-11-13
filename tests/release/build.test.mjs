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

function build({ api = '', publicUrl = 'https://example.invalid/chameleol/', standalone = '', env = 'production', args = [] } = {}) {
  execFileSync(process.execPath, ['scripts/build.mjs', ...args], {
    cwd: root,
    env: {
      ...process.env,
      KAMEREORU_ENV: env,
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

test('release metadata distinguishes preferred ranked and standalone rules while retaining all readable versions', () => {
  for (const options of [{ api: 'https://example.invalid/kamereoru' }, { standalone: '1' }]) {
    const release = build(options);
    assert.equal(release.rulesVersion, options.standalone ? 'kamereoru-rules-v4' : 'kamereoru-rules-v3');
    assert.deepEqual(release.supportedRulesVersions, ['kamereoru-rules-v1', 'kamereoru-rules-v2', 'kamereoru-rules-v3', 'kamereoru-rules-v4']);
    assert.equal(release.preferredRankedRulesVersion, 'kamereoru-rules-v3');
    assert.equal(release.defaultStandaloneRulesVersion, 'kamereoru-rules-v4');
    const versioned = JSON.parse(readFileSync(join(root, 'dist/v', release.assetVersion, 'release.json'), 'utf8'));
    assert.deepEqual(versioned, release);
  }
});

test('standalone selection creates a separate asset version even without a configured API', () => {
  const ranked = build({ env: 'verification' });
  const standalone = build({ env: 'verification', standalone: '1', args: ['--keep', 'dist'] });
  assert.notEqual(standalone.assetVersion, ranked.assetVersion);
  assert.deepEqual(standalone.keptVersions, [ranked.assetVersion]);
});
