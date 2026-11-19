import { pathToFileURL } from 'node:url';
import { GAME_URL } from '../src/ui/share.js';

const origin = new URL(GAME_URL).origin;
const validCount = value => Number.isSafeInteger(value) && value >= 0;

export async function checkRankingRelease(endpoint, read = fetch) {
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
  return { totalPlays: stats.totalPlays, clearerCount: stats.clearerCount, rankingVersion: ranking.version, nameCount: ranking.nameCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const counts = await checkRankingRelease(process.argv[2] ?? process.env.KAMEREORU_API);
    console.log('公開ページから集計へ接続できます。');
    console.log(JSON.stringify(counts));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
