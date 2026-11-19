// Xの投稿画面に渡す本文と共有ボタンを作る。
// 非公開の照会情報・内部ID・名前・未確定の順位を含めない。
import { t, formatNumber } from '../i18n/i18n.js';
import { h } from './dom.js';

const X_INTENT = 'https://x.com/intent/tweet';

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

export function xShareForm(text, testid, {buttonKey = 'share.button', preferImage} = {}) {
  // Xへのリンクを非表示にする設定でも操作できるよう、ボタンから投稿画面を開く。
  const textInput = h('input', { type: 'hidden', name: 'text', value: text });
  const el = h('form', {
    action: X_INTENT,
    method: 'get',
    target: '_blank',
    rel: 'noopener noreferrer',
  }, [
    textInput,
    h('input', { type: 'hidden', name: 'url', value: GAME_URL }),
    h('button', { type: 'submit', class: 'btn btn-x', 'data-testid': testid }, t(buttonKey)),
  ]);
  if (preferImage) el.addEventListener('submit', event => {
    if (preferImage()) event.preventDefault();
  });
  return { el, setText(value) { textInput.value = value; } };
}
