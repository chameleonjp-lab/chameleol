import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRankingRelease } from '../../scripts/check-ranking-release.mjs';

const endpoint = 'https://database.example/functions/v1/kamereoru';
const origin = 'https://chameleonjp-lab.github.io';
const stats = { ok: true, totalPlays: 4, clearerCount: 1 };
const ranking = { ok: true, version: 7, nameCount: 2, rows: [] };

test('uses the shared GitHub Pages origin on both public ranking reads', async () => {
  const urls = [];
  const result = await checkRankingRelease(endpoint + '/', async (url, options) => {
    urls.push(url);
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.headers.Origin, origin);
    return Response.json(url.endsWith('/stats') ? stats : ranking, { headers: { 'access-control-allow-origin': origin } });
  });
  assert.deepEqual(urls, [endpoint + '/stats', endpoint + '/ranking?limit=1']);
  assert.deepEqual(result, { totalPlays: 4, clearerCount: 1, rankingVersion: 7, nameCount: 2 });
});

test('rejects an undeployed API, missing public origin permission and invalid totals', async () => {
  await assert.rejects(checkRankingRelease(endpoint, async () => new Response(null, { status: 404 })), /HTTP 404/);
  await assert.rejects(checkRankingRelease(endpoint, async () => Response.json(stats)), /読み取りが許可されていません/);
  await assert.rejects(checkRankingRelease(endpoint, async url => Response.json(
    url.endsWith('/stats') ? { ...stats, clearerCount: 5 } : ranking,
    { headers: { 'access-control-allow-origin': '*' } },
  )), /stats 応答の形式/);
});
