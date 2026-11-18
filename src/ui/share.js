// Xで共有。自動投稿せず投稿画面を開く。開けない時はコピー、コピーもできない時は選択できる本文を出す。
// 非公開の照会情報・内部ID・名前・未確定の順位を含めない。正式URLは公開工程で決める。
import { t, formatNumber } from '../i18n/i18n.js';

export const X_INTENT = 'https://x.com/intent/post';

export const GAME_URL = 'https://chameleonjp-lab.github.io/chameleol/';

export function formatRunMetrics(run) {
  const { locale, runRank, totalPlays, clearOrdinal } = run;
  const number = n => formatNumber(n, {}, locale);
  return {
    rank: runRank == null ? null : t('releaseRunRank', {rank:number(runRank), total:number(totalPlays)}, locale),
    ordinal: clearOrdinal == null ? null : t('releaseClearOrdinal', {ordinal:number(clearOrdinal)}, locale),
  };
}

export function buildResultShareText({ run }) {
  const { locale, endReason, score, buildings } = run;
  const lines = [t('share.result.title', null, locale)];
  if (buildings === 50 && endReason === 'cleared') lines.push(t('share.result.cleared', null, locale));
  else lines.push(t(locale === 'ja' ? 'releasePassed' : 'card.passed', { count:formatNumber(buildings, {}, locale) }, locale));
  if (score !== null) lines.push(t('card.score', { score:formatNumber(score, {}, locale) }, locale));
  const {rank,ordinal} = formatRunMetrics(run);
  if (ordinal) lines.push(ordinal);
  if (rank) lines.push(rank);
  else if (run.rankState === 'pending') lines.push(t('releasePending', null, locale));
  lines.push(t('share.hashtag', null, locale));
  return lines.join('\n');
}

export function buildHomeShareText({ lang }) {
  return [t('share.home.title', null, lang), t('share.home.body', null, lang), t('share.hashtag', null, lang)].join('\n');
}

export function buildIntentUrl({ text, url }) {
  const params = new URLSearchParams();
  params.set('text', text);
  if (url) params.set('url', url);
  return `${X_INTENT}?${params.toString()}`;
}

/**
 * 投稿画面を開く。戻り値：'opened' | 'copied' | 'manual'
 * ポップアップが止められた（null）・例外の時は、本文とURLのコピーへ進む。
 */
export async function shareToX({ text, url, openImpl = (u) => globalThis.open?.(u, '_blank'), clipboard = globalThis.navigator?.clipboard }) {
  const intent = buildIntentUrl({ text, url });
  let win = null;
  try {
    win = openImpl(intent);
  } catch {
    win = null;
  }
  if (win) {
    try {
      win.opener = null;
    } catch {
      /* 別オリジン */
    }
    return 'opened';
  }
  try {
    await clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'copied';
  } catch {
    return 'manual';
  }
}
