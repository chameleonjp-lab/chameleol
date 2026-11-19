// Xで共有。自動投稿せず投稿画面を開く。開けない時はコピー、コピーもできない時は選択できる本文を出す。
// 非公開の照会情報・内部ID・名前・未確定の順位を含めない。正式URLは公開工程で決める。
import { t, formatNumber } from '../i18n/i18n.js';
import { h } from './dom.js';

export const X_INTENT = 'https://x.com/intent/tweet';

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
  else lines.push(t('releasePassed', { count:formatNumber(buildings, {}, locale) }, locale));
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

export function xShareLink(text, testid) {
  return h('a', {
    class: 'btn btn-x',
    href: buildIntentUrl({ text, url: GAME_URL }),
    target: '_blank',
    rel: 'noopener noreferrer',
    'data-testid': testid,
  }, t('share.button'));
}
