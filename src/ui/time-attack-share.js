import { getLanguage, t } from '../i18n/i18n.js';
import { formatTime, isTimeAttackCentiseconds, TIME_ATTACK_BUILDING_COUNT, TIME_ATTACK_MIN_CLEAR_MS } from '../rules/time-attack/v1/index.js';
import { GAME_URL, xShareForm } from './share.js';

const MIN_CLEAR_CS = TIME_ATTACK_MIN_CLEAR_MS / 10;
const HASHTAG = '#カメレオる';

export function isTimeAttackClear(result) {
  return Boolean(
    (result?.reason ?? result?.endReason) === 'cleared' &&
    result.clearedCount === TIME_ATTACK_BUILDING_COUNT &&
    (result.elapsedMs == null || result.elapsedMs >= TIME_ATTACK_MIN_CLEAR_MS) &&
    isTimeAttackCentiseconds(result.elapsedCs) &&
    result.elapsedCs >= MIN_CLEAR_CS,
  );
}

function shareLines(result, lang) {
  if (!isTimeAttackClear(result)) return null;
  const time = formatTime(result.elapsedCs, lang, { share: true });
  return [
    t('ta.mode', null, lang),
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
