import { pathToFileURL } from 'node:url';
import { GAME_URL } from '../src/ui/share.js';

import { MODE_ID } from '../src/rules/time-attack/v1/index.js';

const origin = new URL(GAME_URL).origin;
const validCount = value => Number.isSafeInteger(value) && value >= 0;

export async function checkRankingRelease(endpoint, read = fetch, { timeAttack = false } = {}) {
  let base;
  try { base = new URL(endpoint); } catch { throw Error('ランキング受付のHTTPS URLを指定してください'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw Error('ランキング受付には認証情報やパラメータを含まないHTTPS URLを指定してください');
  }
  const path = base.href.replace(/\/+$/, '');
  async function get(route, valid) {
    const response = await read(`${path}/${route}`, {
      headers: { Origin: origin, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error(`${route} HTTP ${response.status}`);
    const allowed = response.headers.get('access-control-allow-origin');
    if (allowed !== '*' && allowed !== origin) throw Error(`${route} 公開ページからの読み取りが許可されていません`);
    const data = await response.json();
    if (data?.ok !== true || !valid(data)) throw Error(`${route} 応答の形式が現在のゲームと一致しません`);
    return data;
  }
  const [stats, ranking] = await Promise.all([
    get('stats', data => validCount(data.totalPlays) && validCount(data.clearerCount) && data.clearerCount <= data.totalPlays),
    get('ranking?limit=1', data => validCount(data.version) && validCount(data.nameCount) && Array.isArray(data.rows)),
  ]);
  const result = { totalPlays: stats.totalPlays, clearerCount: stats.clearerCount,
    rankingVersion: ranking.version, nameCount: ranking.nameCount };
  if (timeAttack) {
    const [taStats, taRanking] = await Promise.all([
      get('time-attack-stats', data => data.modeId === MODE_ID && validCount(data.totalPlays) &&
        validCount(data.participantCount) && data.participantCount <= data.totalPlays),
      get('time-attack-ranking?limit=1', data => data.modeId === MODE_ID &&
        validCount(data.version) && validCount(data.nameCount) && Array.isArray(data.rows) &&
        data.rows.every(row => validCount(row.position) && validCount(row.rank) &&
          typeof row.name === 'string' && validCount(row.elapsedCs))),
    ]);
    result.timeAttack = { totalPlays: taStats.totalPlays, participantCount: taStats.participantCount,
      rankingVersion: taRanking.version, nameCount: taRanking.nameCount };
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flags = process.argv.slice(2);
    const counts = await checkRankingRelease(flags.find(value => !value.startsWith('--')) ?? process.env.KAMEREORU_API,
      fetch, { timeAttack: flags.includes('--time-attack') });
    console.log('公開ページから集計へ接続できます。');
    console.log(JSON.stringify(counts));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
