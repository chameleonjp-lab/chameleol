// Both working trees, PostgreSQL, Playwright Chromium and Python jsonschema are required.
// node scripts/smoke-release-ranking.mjs ../chameleonjp_lab
// Build into a temporary tree and redirect the release URLs to local files and a disposable API.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startLocalApi } from './local-api.mjs';
import { startServer } from './serve.mjs';
import { ROOT, startCluster, buildTemplate, createTestDb, dropTestDb } from './testdb.mjs';
import { chromium, openHome, completeStationaryGuide } from '../tests/e2e/helpers.mjs';

const lab = resolve(process.argv[2] || '../chameleonjp_lab');
const root = await mkdtemp(join(tmpdir(), 'chameleol-release-'));
const gameUrl = 'https://chameleonjp-lab.github.io/chameleol/';
const labUrl = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
const detail = labUrl + 'ranking.html?game=chameleol';
const gateway = 'https://release-test.invalid/functions/v1/kamereoru';
const dbName = 'release_smoke_' + process.pid;
const cluster = await startCluster();
let api, server, browser;
try {
  buildTemplate(cluster.adminUrl);
  api = await startLocalApi({ dbUrl: createTestDb(cluster.adminUrl, dbName) });
  for (const file of ['scripts', 'src', 'supabase', 'vendor', 'assets', 'ranking-manifest.json', 'index.html']) {
    await cp(join(ROOT, file), join(root, 'game', file), { recursive: true });
  }
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: join(root, 'game'),
    env: { ...process.env, KAMEREORU_ENV: 'production', KAMEREORU_PUBLIC_URL: gameUrl, KAMEREORU_API: gateway, KAMEREORU_STANDALONE: '' } });
  for (const file of ['scripts/build-pages.mjs', 'index.html', 'ranking.html', 'terms.html', 'chameleol-ranking.js', 'banner', 'IMG_7589.JPG']) {
    await cp(join(lab, file), join(root, 'lab', file));
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: lab, encoding: 'utf8' }).trim();
  execFileSync(process.execPath, ['scripts/build-pages.mjs'], { cwd: join(root, 'lab'), env: { ...process.env, GITHUB_SHA: revision } });
  execFileSync('python3', ['-c',
    'import json,sys,jsonschema; jsonschema.validate(*[json.load(open(p)) for p in sys.argv[1:]])',
    join(root, 'game/dist/ranking-manifest.json'), join(lab, 'docs/chameleonjp-lab/schemas/ranking-manifest-v1.schema.json')]);

  server = await startServer({ rootDir: root, listenPort: 0 });
  const local = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 402, height: 874 } });
  const observed = [];
  await context.route('**/*', async route => {
    const url = route.request().url();
    let target;
    if (url.startsWith(gameUrl)) target = local + '/game/dist/' + url.slice(gameUrl.length);
    else if (url.startsWith(labUrl)) target = local + '/lab/dist/' + url.slice(labUrl.length);
    else if (url.startsWith(gateway + '/')) target = api.base + url.slice(gateway.length);
    else return route.abort(); // Includes the lab's unrelated CDN and generic score API.
    const response = await route.fetch({ url: target });
    if (url.startsWith(gateway + '/ranking?')) observed.push(await response.json());
    await route.fulfill({ response });
  });
  const page = await context.newPage();
  await openHome(page, gameUrl);
  assert.equal(await page.getByTestId('home-ranking').getAttribute('href'), detail);
  assert.equal(await page.evaluate(async () => (await (await fetch('ranking-manifest.json')).json()).submission_mode), 'verified');

  for (const [name, buildings] of [['', 50], ['A', 50], ['B', 30], ['A', 7]]) {
    await page.locator('#name-input').fill(name);
    await page.getByTestId('home-start').click();
    await page.waitForFunction(() => globalThis.__kamereoru?.guidance && !globalThis.__kamereoru.startAttempt);
    await completeStationaryGuide(page);
    await page.waitForFunction(() => globalThis.__kamereoru.session?.running);
    const meta = await page.evaluate(() => globalThis.__kamereoru.session.meta);
    assert.equal(meta.ranked, Boolean(name));
    if (name) {
      // Simulated inputs cover minutes of game time within a single browser task.
      await api.pool.query("update private.kamereoru_starts set accepted_at=now()-interval '10 minutes' where play_id=$1", [meta.playId]);
    }
    await page.evaluate(buildings => {
      const s = globalThis.__kamereoru.session;
      for (let i = 0; i < buildings; i++) {
        s.apply({ type: 'color', t: Math.max(s.state.t, i * s.rules.buildingMs), ...s.game.course.targets[i] });
      }
      s.apply({ type: buildings === 50 ? 'tick' : 'quit', t: buildings * s.rules.buildingMs });
    }, buildings);
    await page.getByTestId('result-home').waitFor();
    assert.equal(await page.getByTestId('result-ranking').getAttribute('href'), detail);
    await page.waitForFunction(buildings => globalThis.__kamereoru.lastResult?.summary.buildings === buildings, buildings);
    if (name) {
      await page.waitForFunction(() => globalThis.__kamereoru.lastResult?.netState === 'official');
      const metrics = await page.evaluate(() => globalThis.__kamereoru.lastResult.metrics);
      if (buildings === 50) {
        assert.equal(metrics.clearOrdinal, 1);
        assert.match(await page.locator('.result-clear-ordinal').textContent(), /1人目/);
      }
      if (buildings === 7) {
        assert.deepEqual(metrics, { runRank: 3, totalPlays: 4, clearOrdinal: null });
        assert.match(await page.locator('.result-rank').textContent(), /3位／4人中/);
      }
    }
    if (buildings !== 7) await page.getByTestId('result-home').click();
  }
  // Refresh the post-registration ranking after the third named result was admitted.
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().startsWith(gateway + '/ranking?')),
    page.locator('.ranking-result').getByRole('button', {name: '最新にする', exact: true}).click(),
  ]);
  const gameTable = await response.json();
  assert.deepEqual(gameTable.rows.map(row => [row.name, row.rank, row.buildings]), [['A',1,50],['B',2,30]]);
  assert.deepEqual(await page.locator('.ranking-result .rank-name').allTextContents(), ['A','B']);
  assert.deepEqual(await page.locator('.ranking-result .rank-buildings').allTextContents(), ['50棟','30棟']);
  assert.deepEqual(await page.locator('.ranking-result .rank-no').allTextContents(), ['1位','2位']);
  await page.getByTestId('result-ranking').click();
  await page.locator('#bestRanking .rank-row').first().waitFor();
  assert.equal(page.url(), detail);
  assert.deepEqual(await page.locator('#bestRanking .rank-name').allTextContents(), ['A','B']);
  assert.deepEqual(await page.locator('#bestRanking .rank-no').allTextContents(), ['1位','2位']);
  assert.deepEqual(await page.locator('#bestRanking .rank-score').allTextContents(),
    gameTable.rows.map(row => row.buildings+'棟 · '+(row.average / 100).toFixed(2)+'%'));
  assert.equal(await page.locator('#bestRanking').getAttribute('data-version'), String(gameTable.version));
  assert.deepEqual(observed.at(-1).rows, gameTable.rows);
  await page.waitForFunction(() => document.querySelector('#totalPlayCount')?.textContent === '4回');
  assert.equal(await page.locator('#playerCount').textContent(), '1人');
  await page.getByRole('link', {name:'ゲームで遊ぶ'}).click();
  await page.getByTestId('home-start').waitFor();
  assert.equal(page.url(), gameUrl);
  assert.equal(Number((await api.pool.query('select count(*) from private.kamereoru_results')).rows[0].count), 3);
  console.log('Built pages: 4 launches, 3 named results, 1 clearer, A7 rank 3/4; game and lab share ranking version', gameTable.version, 'and the same best rows. Verified manifest and return link.');
} finally {
  await browser?.close();
  server?.close();
  await api?.close();
  if (api) dropTestDb(cluster.adminUrl, dbName);
  cluster.stop();
  await rm(root, {recursive:true, force:true});
}
