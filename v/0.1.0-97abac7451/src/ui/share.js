// Xで共有。自動投稿せず投稿画面を開く。開けない時はコピー、コピーもできない時は選択できる本文を出す。
// 非公開の照会情報・内部ID・名前・未確定の順位を含めない。正式URLは公開工程で決める。
import { t, formatNumber, formatPercent2 } from '../i18n/i18n.js';

export const X_INTENT = 'https://x.com/intent/post';

/** 結果の共有文（URLは別に渡す）。順位は正式な時だけ入れる。 */
export function buildResultShareText({ result, officialRank = null, lang }) {
  const lines = [t('share.result.title', null, lang)];
  if (result.endReason === 'cleared') lines.push(t('share.result.cleared', null, lang));
  lines.push(
    t('share.result.values', { buildings: formatNumber(result.buildings, {}, lang), average: formatPercent2(result.rankAverage, lang) }, lang),
  );
  if (officialRank != null) lines.push(t('share.result.rank', { rank: formatNumber(officialRank, {}, lang) }, lang));
  lines.push(t('share.hashtag', null, lang));
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
