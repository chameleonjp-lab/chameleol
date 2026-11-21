import { getLanguage, t, formatNumber } from '../i18n/i18n.js';
import { formatTime, titleForTime } from '../rules/time-attack/v1/index.js';
import { h } from './dom.js';
import { createTimeAttackShare, isTimeAttackClear } from './time-attack-share.js';

export const TIME_ATTACK_RANKING_URL =
  'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack';

const STATUS_KEYS = Object.freeze({
  local_only: 'result.status.unranked',
  not_received: 'result.status.pending',
  uploading: 'result.status.sending',
  verifying: 'result.status.verifying',
  official: 'ta.status.official',
  no_rank: 'ta.status.noRank',
  pending_review: 'result.status.pendingReview',
  rejected: 'ta.status.rejected',
  under_review: 'result.status.underReview',
  too_large: 'ta.status.tooLarge',
  retryable_failed: 'result.status.retryable',
  permanent_failed: 'ta.status.noRank',
  storage_failed: 'ta.storageFailed',
});

export function createTimeAttackResult({
  result,
  bestElapsedCs = null,
  newBest = false,
  status = 'local_only',
  onRetry,
  onHome,
  onReview,
  onResend,
  reviewRequested = false,
  lang = getLanguage(),
}) {
  const translate = (key, params) => t(key, params, lang);
  const cleared = isTimeAttackClear(result);
  const time = formatTime(result.elapsedCs, lang);
  const title = cleared ? translate(titleForTime(result.elapsedCs) ?? 'ta.cleared') : null;
  const statusKey = Object.hasOwn(STATUS_KEYS, status) ? STATUS_KEYS[status] : STATUS_KEYS.not_received;
  const action = (key, onClick, testid, className = 'btn') =>
    h('button', { type: 'button', class: className, onClick, 'data-testid': testid }, translate(key));

  return h('main', { class: 'screen result time-attack-result', 'data-testid': 'ta-result' }, [
    h('h1', { class: 'result-title' }, translate('ta.mode')),
    h('div', { class: 'time-attack-result-main' }, [
      h('p', { class: 'time-attack-result-label' }, cleared
        ? translate('ta.clearTime')
        : translate('ta.quitSummary', { count: formatNumber(result.clearedCount, {}, lang) })),
      h('p', { class: 'time-attack-result-time', 'data-testid': 'ta-result-time' }, time),
      title && h('p', { class: 'time-attack-result-title', 'data-testid': 'ta-result-title' }, title),
    ]),
    bestElapsedCs != null && h('p', { class: 'note' }, translate('ta.best', { time: formatTime(bestElapsedCs, lang) })),
    cleared && newBest && h('p', { class: 'time-attack-result-new-best' }, translate('ta.newBest')),
    h('p', { class: 'note', role: 'status', 'data-testid': 'ta-result-status' }, translate(statusKey)),
    status === 'retryable_failed' && onResend && action('ta.retry', onResend, 'ta-resend'),
    status === 'rejected' && !reviewRequested && onReview && action('records.requestReview', onReview, 'ta-request-review'),
    h('div', { class: 'result-actions' }, [
      action('ta.again', onRetry, 'ta-again', 'btn btn-primary'),
      h('a', { class: 'btn', href: TIME_ATTACK_RANKING_URL, 'data-testid': 'ta-ranking' }, translate('ranking.title')),
      createTimeAttackShare(result, lang),
      action('ta.homeAction', onHome, 'ta-home'),
    ]),
  ]);
}
