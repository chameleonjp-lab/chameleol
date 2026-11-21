import { getLanguage, t, formatNumber } from '../i18n/i18n.js';
import { centiseconds, formatTime, TIME_ATTACK_BUILDING_COUNT, timeAttackBuildingCount, titleForTime } from '../rules/time-attack/v1/index.js';
import { hsvToHex, isValidHsv } from '../rules/v1/color.js';
import { createFallbackPortrait } from '../presentation/result-fallback-portrait.js';
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

function renderTrickyColors(colors, lang) {
  if (!Array.isArray(colors) || !colors.length) return null;
  const items = colors.slice(0, 3).filter(item => item && isValidHsv(item.hsv) &&
    Number.isSafeInteger(item.elapsedMs) && item.elapsedMs > 0 && Number.isInteger(item.building));
  if (!items.length) return null;
  const chameleons = items.map(({ hsv, elapsedMs, building }) => {
    const portrait = h('div', { class: 'ta-tricky-portrait', 'aria-hidden': 'true' },
      h('span', { class: 'ta-tricky-swatch' }));
    createFallbackPortrait({ hero: { status: 'wall', hsv, outlineBuilding: building } })
      .then(({ image, dispose }) => {
        if (portrait.isConnected) portrait.replaceChildren(image);
        else dispose();
      }).catch(() => {});
    const time = formatTime(centiseconds(elapsedMs), lang);
    const card = h('figure', { class: 'ta-tricky-color' }, [
      portrait, h('figcaption', {}, time),
    ]);
    card.style.setProperty('--ta-target-color', hsvToHex(hsv));
    return card;
  });
  return h('section', { class: 'ta-tricky-colors', 'data-testid': 'ta-tricky-colors' }, [
    h('h2', {}, t('ta.trickyColors', null, lang)), h('div', { class: 'ta-tricky-row' }, chameleons),
  ]);
}

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
  const total = timeAttackBuildingCount(result.rulesVersion);
  const time = formatTime(result.elapsedCs, lang);
  const title = cleared ? translate(titleForTime(result.elapsedCs, result.rulesVersion) ?? 'ta.cleared', { total }) : null;
  const statusKey = status === 'official' && total !== TIME_ATTACK_BUILDING_COUNT ? 'ta.status.archived'
    : Object.hasOwn(STATUS_KEYS, status) ? STATUS_KEYS[status] : STATUS_KEYS.not_received;
  const action = (key, onClick, testid, className = 'btn') =>
    h('button', { type: 'button', class: className, onClick, 'data-testid': testid }, translate(key));

  return h('main', { class: 'screen result time-attack-result', 'data-testid': 'ta-result' }, [
    h('h1', { class: 'result-title' }, translate('ta.mode')),
    h('div', { class: 'time-attack-result-main' }, [
      h('p', { class: 'time-attack-result-label' }, cleared
        ? translate('ta.clearTime', { total })
        : translate('ta.quitSummary', { count: formatNumber(result.clearedCount, {}, lang), total })),
      title && h('p', { class: 'time-attack-result-title', 'data-testid': 'ta-result-title' }, title),
      h('p', { class: 'time-attack-result-time', 'data-testid': 'ta-result-time' }, time),
      renderTrickyColors(result.trickyColors, lang),
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
