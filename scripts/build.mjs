// 公開用の配布物を dist/ に作る。
// - 資源は版ごとのフォルダ v/<assetVersion>/ に置く。各版のフォルダは単独で遊べる入口（index.html）を持つ。
// - dist/index.html は「今の版」の入口。切り戻しは入口だけを旧版へ戻し、新旧の v/ フォルダは両方残す。
// - release.json に、版・判定規則・保存形式・各ファイルの SHA-256・共有コードの指紋を残す。
// 使い方:
//   KAMEREORU_ENV=verification KAMEREORU_API=https://<ref>.supabase.co/functions/v1/kamereoru node scripts/build.mjs
//   旧版の資源を残す: node scripts/build.mjs --keep <以前の dist または v/ を含むフォルダ>
// 正式URL（KAMEREORU_PUBLIC_URL）は公開工程で決める。指定しなければ canonical・共有URLを入れない。
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GAME_VERSION } from '../src/config/runtime.js';
import { RULES_V1, RULES_V2, RULES_V3, RULES_V4 } from '../src/rules/v1/index.js';
import { SNAPSHOT_FORMAT } from '../src/game/session.js';
import { RESULT_FORMAT } from '../src/net/outbox.js';
import { computeManifest, check as checkShared } from './sync-shared.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');
const args = process.argv.slice(2);
const keepIdx = args.indexOf('--keep');
const keepFrom = keepIdx >= 0 ? args[keepIdx + 1] : null;
const socialImage = 'social-card.jpg';
const socialImageSource = `assets/${socialImage}`;

const env = process.env.KAMEREORU_ENV ?? 'verification';
const api = process.env.KAMEREORU_API ?? '';
const publicUrl = process.env.KAMEREORU_PUBLIC_URL ?? '';
const standalone = process.env.KAMEREORU_STANDALONE === '1';
if (standalone && api) {
  console.error('KAMEREORU_STANDALONE cannot be combined with KAMEREORU_API');
  process.exit(1);
}
if (env === 'production' && (!publicUrl || (!standalone && !api))) {
  console.error('production build needs KAMEREORU_PUBLIC_URL and either KAMEREORU_API or KAMEREORU_STANDALONE=1');
  process.exit(1);
}
const shared = checkShared();
if (shared.length) {
  console.error(`shared code is out of sync: ${shared.join(', ')} (run npm run sync)`);
  process.exit(1);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* git がない環境 */
}

// 配布内容の指紋から版名を決める。接続先や公開設定の異なる版も分ける。
const sources = ['src', 'vendor'];
const contentHash = createHash('sha256');
for (const dir of sources) {
  for (const f of [...walk(join(ROOT, dir))].sort()) {
    contentHash.update(relative(ROOT, f));
    contentHash.update(readFileSync(f));
  }
}
for (const file of ['index.html', 'assets/credits.md', socialImageSource, 'scripts/build.mjs', 'ranking-manifest.json']) {
  contentHash.update(file);
  contentHash.update(readFileSync(join(ROOT, file)));
}
contentHash.update(JSON.stringify({ env, api, publicUrl, standalone, commit }));
const assetVersion = `${GAME_VERSION}-${contentHash.digest('hex').slice(0, 10)}`;

// 以前の版のフォルダを残す（切り戻し・旧版の保存の再開のため）
const kept = [];
const preserved = join(ROOT, '.tmp', 'build-keep');
rmSync(preserved, { recursive: true, force: true });
if (keepFrom) {
  const vdir = existsSync(join(keepFrom, 'v')) ? join(keepFrom, 'v') : keepFrom;
  if (existsSync(vdir)) {
    for (const name of readdirSync(vdir)) {
      if (name === assetVersion) continue;
      cpSync(join(vdir, name), join(preserved, name), { recursive: true });
      kept.push(name);
    }
  }
}
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'v'), { recursive: true });
for (const name of kept) cpSync(join(preserved, name), join(DIST, 'v', name), { recursive: true });

const vroot = join(DIST, 'v', assetVersion);
for (const dir of sources) cpSync(join(ROOT, dir), join(vroot, dir), { recursive: true });
cpSync(join(ROOT, 'assets', 'credits.md'), join(vroot, 'credits.md'));
cpSync(join(ROOT, socialImageSource), join(vroot, socialImage));

const manifest = JSON.parse(readFileSync(join(ROOT, 'ranking-manifest.json'), 'utf8'));
const socialImageAlt = '宝石を持ったカメレオンと、夜の街並み、色を選ぶ円形パレット。';

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function entryHtml(prefix) {
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const setMeta = (name, value) => {
    html = html.replace(new RegExp(`<meta name="${name}" content="[^"]*" />`), `<meta name="${name}" content="${value}" />`);
  };
  setMeta('kamereoru-env', env);
  setMeta('kamereoru-api', api);
  setMeta('kamereoru-public-url', publicUrl);
  setMeta('kamereoru-version', GAME_VERSION);
  html = html.replace('<meta name="kamereoru-public-url"', `<meta name="kamereoru-asset-version" content="${assetVersion}" />\n    <meta name="kamereoru-commit" content="${commit}" />\n    <meta name="kamereoru-public-url"`);
  html = html.replace('href="./src/ui/game.css"', `href="${prefix}src/ui/game.css"`);
  html = html.replace('"three": "./vendor/three.module.min.js"', `"three": "${prefix}vendor/three.module.min.js"`);
  html = html.replace('src="./src/app.js"', `src="${prefix}src/app.js"`);
  if (publicUrl) {
    const imageUrl = new URL(`${publicUrl.replace(/\/$/, '')}/v/${assetVersion}/${socialImage}`).href;
    const url = escapeAttribute(publicUrl);
    const image = escapeAttribute(imageUrl);
    const title = escapeAttribute(manifest.title);
    const description = escapeAttribute(manifest.description);
    html = html.replace('</title>', () => `</title>
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="600" />
    <meta property="og:image:alt" content="${socialImageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@Chameleonjp26" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${socialImageAlt}" />`);
  }
  return html;
}

for (const dir of [DIST, vroot]) cpSync(join(ROOT, 'ranking-manifest.json'), join(dir, 'ranking-manifest.json'));
writeFileSync(join(vroot, 'index.html'), entryHtml('./'));
writeFileSync(join(DIST, 'index.html'), entryHtml(`./v/${assetVersion}/`));
// GitHub Pages で Jekyll の処理を止める
writeFileSync(join(DIST, '.nojekyll'), '');

const files = {};
for (const f of [...walk(vroot)].sort()) files[relative(DIST, f)] = sha(readFileSync(f));
files['ranking-manifest.json'] = sha(readFileSync(join(DIST, 'ranking-manifest.json')));
files['index.html'] = sha(readFileSync(join(DIST, 'index.html')));
const release = {
  gameVersion: GAME_VERSION,
  assetVersion,
  commit,
  env,
  rankingApi: env === 'production' && !standalone ? api : null,
  rulesVersion: RULES_V4.rulesVersion,
  supportedRulesVersions: [RULES_V1, RULES_V2, RULES_V3, RULES_V4].map((rules) => rules.rulesVersion),
  preferredRankedRulesVersion: RULES_V4.rulesVersion,
  defaultStandaloneRulesVersion: RULES_V4.rulesVersion,
  generatorVersion: RULES_V1.generatorVersion,
  historyFormat: RULES_V1.historyFormat,
  snapshotFormat: SNAPSHOT_FORMAT,
  resultFormat: RESULT_FORMAT,
  sharedCodeFingerprint: computeManifest().fingerprint,
  keptVersions: kept,
  files,
};
writeFileSync(join(DIST, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
writeFileSync(join(vroot, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
console.log(JSON.stringify({ assetVersion, env, api: api || null, publicUrl: publicUrl || null, kept, files: Object.keys(files).length }, null, 2));
