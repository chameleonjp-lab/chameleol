import { getLanguage, t } from '../i18n/i18n.js';
import { formatTime, HOLD_MS, isTimeAttackCentiseconds, TIME_ATTACK_BUILDING_COUNT, timeAttackBuildingCount } from '../rules/time-attack/v1/index.js';
import { GAME_URL, xShareForm } from './share.js';

const HASHTAG = '#カメレオる';

export function isTimeAttackClear(result) {
  const total = timeAttackBuildingCount(result?.rulesVersion);
  const minClearMs = total * HOLD_MS;
  return Boolean(
    total &&
    (result?.reason ?? result?.endReason) === 'cleared' &&
    result.clearedCount === total &&
    (result.elapsedMs == null || result.elapsedMs >= minClearMs) &&
    isTimeAttackCentiseconds(result.elapsedCs) &&
    result.elapsedCs >= minClearMs / 10,
  );
}

function shareLines(result, lang) {
  if (!isTimeAttackClear(result)) return null;
  const time = formatTime(result.elapsedCs, lang, { share: true });
  return [
    timeAttackBuildingCount(result.rulesVersion) === TIME_ATTACK_BUILDING_COUNT
      ? `${t('ta.mode', null, lang)} (${t('ta.homeNote', null, lang)})`
      : t('ta.mode', null, lang),
    t('ta.shareRecord', { time }, lang),
    HASHTAG,
  ];
}

export function buildTimeAttackShareText(result, lang = getLanguage()) {
  const lines = shareLines(result, lang);
  return lines ? [...lines, GAME_URL].join('\n') : null;
}

export function createTimeAttackShare(result, lang = getLanguage()) {
  const lines = shareLines(result, lang);
  return lines ? xShareForm(lines.join('\n'), 'ta-share', { lang }).el : null;
}
