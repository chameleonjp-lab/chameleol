import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';

const root = mkdtempSync(join(tmpdir(), 'kamereoru-build-'));
const source = new URL('../../', import.meta.url);
const files = ['scripts', 'src', 'vendor', 'assets', 'index.html', 'latest.html', 'ranking-manifest.json', 'package.json', 'supabase'];
for (const file of files) cpSync(new URL(file, source), join(root, file), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: root });
execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'test'], { cwd: root });

function build({ api = '', publicUrl = 'https://example.invalid/chameleol/', standalone = '', env = 'production', args = [], taAvailable = '', taEnabled = '' } = {}) {
  execFileSync(process.execPath, ['scripts/build.mjs', ...args], {
    cwd: root,
    env: {
      ...process.env,
      KAMEREORU_ENV: env,
      KAMEREORU_API: api,
      KAMEREORU_PUBLIC_URL: publicUrl,
      KAMEREORU_STANDALONE: standalone,
      KAMEREORU_TA_AVAILABLE: taAvailable,
      KAMEREORU_TA_ENABLED: taEnabled,
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

test('公開版を切り替えても共有カードの画像URLは変わらない', () => {
  const publicUrl = 'https://example.invalid/chameleol';
  const first = build({ publicUrl, standalone: '1' });
  const release = build({ publicUrl, api: 'https://example.invalid/kamereoru', args: ['--keep', 'dist'] });
  assert.notEqual(first.assetVersion, release.assetVersion);
  const imagePath = 'social-card.jpg';
  const imageUrl = `${publicUrl}/${imagePath}`;
  const image = readFileSync(join(root, 'dist', imagePath));
  assert.equal(release.files[imagePath], createHash('sha256').update(image).digest('hex'));
  assert.deepEqual(image.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));

  for (const entry of ['index.html', `v/${first.assetVersion}/index.html`, `v/${release.assetVersion}/index.html`]) {
    const { document } = parseHTML(readFileSync(join(root, 'dist', entry), 'utf8'));
    const meta = (attribute, value) => document.head.querySelector(`meta[${attribute}="${value}"]`)?.content;
    assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
    assert.equal(meta('name', 'twitter:site'), '@Chameleonjp26');
    assert.equal(meta('name', 'twitter:title'), 'カメレオる');
    assert.equal(meta('name', 'twitter:image'), imageUrl);
    assert.equal(meta('property', 'og:image'), imageUrl);
    assert.equal(meta('property', 'og:url'), publicUrl);
  }
});

test('正式URLなしで作った検証版に共有カードを入れない', () => {
  build({ env: 'verification', publicUrl: '' });
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
  assert.doesNotMatch(html, /twitter:card|og:image|rel="canonical"/);
});

test('公開版を開く入口はアクセスごとに新しい正式URLへ進む', () => {
  const release = build({ standalone: '1' });
  const html = readFileSync(join(root, 'dist/latest.html'), 'utf8');
  assert.equal(release.files['latest.html'], createHash('sha256').update(html).digest('hex'));
  const { document } = parseHTML(html);
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), './');
  const redirects = [];
  for (const now of [10000, 10001]) {
    runInNewContext(document.querySelector('script').textContent, {
      URL, Date: { now: () => now },
      location: { href: 'https://example.invalid/chameleol/latest.html?old=1', replace: href => redirects.push(href) },
    });
  }
  assert.deepEqual(redirects, [
    'https://example.invalid/chameleol/?release-refresh=10000',
    'https://example.invalid/chameleol/?release-refresh=10001',
  ]);
});

test('release metadata distinguishes preferred ranked and standalone rules while retaining all readable versions', () => {
  for (const options of [{ api: 'https://example.invalid/kamereoru' }, { standalone: '1' }]) {
    const release = build(options);
    assert.equal(release.rulesVersion, 'kamereoru-rules-v5');
    assert.deepEqual(release.supportedRulesVersions, ['kamereoru-rules-v1', 'kamereoru-rules-v2', 'kamereoru-rules-v3', 'kamereoru-rules-v4', 'kamereoru-rules-v5']);
    assert.equal(release.preferredRankedRulesVersion, 'kamereoru-rules-v5');
    assert.equal(release.defaultStandaloneRulesVersion, 'kamereoru-rules-v5');
    assert.equal(release.generatorVersion, 'kamereoru-course-v2');
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

test('published game exposes its verified ranking manifest and only the production ranking API', () => {
  const api = 'https://example.invalid/functions/v1/kamereoru';
  const release = build({ api });
  assert.equal(release.rankingApi, api);
  const manifest = JSON.parse(readFileSync(join(root, 'dist/ranking-manifest.json'), 'utf8'));
  assert.equal(manifest.submission_mode, 'verified');
  assert.equal(build({ api, env: 'verification' }).rankingApi, null);
  assert.equal(build({ standalone: '1' }).rankingApi, null);
});


test('time attack availability and launch flags are separate production settings', () => {
  const api = 'https://example.invalid/functions/v1/kamereoru';
  const hidden = build({ api, taEnabled: '1' });
  const readOnly = build({ api, taAvailable: '1' });
  const enabled = build({ api, taAvailable: '1', taEnabled: '1' });
  assert.equal(hidden.timeAttack.available, false);
  assert.equal(hidden.timeAttack.enabled, false);
  assert.equal(readOnly.timeAttack.available, true);
  assert.equal(readOnly.timeAttack.enabled, false);
  assert.equal(enabled.timeAttack.available, true);
  assert.equal(enabled.timeAttack.enabled, true);
  assert.equal(enabled.timeAttack.rulesVersion, 'kamereoru-time-attack-rules-v2');
  assert.notEqual(readOnly.assetVersion, enabled.assetVersion);
  assert.match(readFileSync(join(root, 'dist/index.html'), 'utf8'), /name="kamereoru-time-attack" content="1"/);
});

test('a normal refresh of the official Pages build keeps time attack enabled and allows an explicit pause', () => {
  const official = {
    api: 'https://mlpnjgezrnhdxsxolyzj.supabase.co/functions/v1/kamereoru',
    publicUrl: 'https://chameleonjp-lab.github.io/chameleol/',
  };
  const active = build(official);
  assert.equal(active.timeAttack.available, true);
  assert.equal(active.timeAttack.enabled, true);
  const paused = build({ ...official, taEnabled: '0' });
  assert.equal(paused.timeAttack.available, true);
  assert.equal(paused.timeAttack.enabled, false);
  assert.notEqual(build({ ...official, api: 'https://example.invalid/kamereoru' }).timeAttack.available, true);
});
