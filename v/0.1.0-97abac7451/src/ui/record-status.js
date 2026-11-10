// 記録の送信・確認状況。送信待ち・検証中・確認待ち・拒否・再審査中・正式・訂正を区別して、新しい順に全件へたどれる。
// 送信状態は固定値で管理し、表示の文字列から状態を判断しない。
import { h, isolatedText, clear } from './dom.js';
import { t, formatNumber, formatPercent2 } from '../i18n/i18n.js';
import { button } from './screens.js';

/** 端末の記録1件 → 表示する状態の固定値。 */
export function recordState(item) {
  if (item.source === 'local') return 'unranked';
  if (item.source === 'outbox') {
    if (item.state === 'permanent_failed') return 'permanent_failed';
    if (item.lastError) return 'retryable_failed';
    return 'pending';
  }
  switch (item.status) {
    case 'verifying':
      return 'verifying';
    case 'official':
      return item.corrections?.length ? 'corrected' : 'official';
    case 'no_rank':
      return 'no_rank';
    case 'pending_review':
      return 'pending_review';
    case 'rejected':
      return 'rejected';
    case 'under_review':
      return 'under_review';
    default:
      return 'verifying';
  }
}

export const STATE_KEYS = Object.freeze({
  unranked: 'records.state.unranked',
  pending: 'records.state.pending',
  retryable_failed: 'records.state.retryable',
  permanent_failed: 'records.state.permanent',
  verifying: 'records.state.verifying',
  official: 'records.state.official',
  corrected: 'records.state.corrected',
  no_rank: 'records.state.noRank',
  pending_review: 'records.state.pendingReview',
  rejected: 'records.state.rejected',
  under_review: 'records.state.underReview',
});

/** 送信待ち・受付済み・ローカルの記録を1つの一覧へまとめ、新しい順に並べる。 */
export async function collectRecords(store) {
  const [outbox, records, local] = await Promise.all([store.getAll('outbox'), store.getAll('records'), store.getAll('localResults')]);
  const items = [
    ...outbox.map((x) => ({ ...x, source: 'outbox', at: x.createdAt })),
    ...records.map((x) => ({ ...x, source: 'record', at: x.acceptedAt })),
    ...local.map((x) => ({ ...x, source: 'local', at: x.createdAt })),
  ];
  return items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

function values(item) {
  const v = item.official ?? item.summary ?? {};
  return t('records.values', { buildings: formatNumber(v.buildings ?? 0), average: formatPercent2(v.rankAverage ?? v.average ?? null) });
}

export function createRecordsView({ store, onResend, onReview, localOnly = false, pageSize = 20 }) {
  const list = h('ul', { class: 'records-list' });
  const more = button('records.more', () => {
    shown += pageSize;
    render();
  }, { className: 'btn-small' });
  const empty = h('p', { class: 'note' });
  const el = h('div', { class: 'records' }, [empty, list, more]);
  let items = [];
  let shown = pageSize;

  function render() {
    clear(list);
    empty.textContent = items.length ? '' : t('records.empty');
    for (const item of items.slice(0, shown)) {
      const state = recordState(item);
      const date = new Date(item.at ?? Date.now());
      const row = h('li', { class: `record record-${state}`, 'data-state': state }, [
        h('div', { class: 'record-head' }, [
          !localOnly && h('span', { class: 'record-state' }, t(STATE_KEYS[state])),
          h('time', { datetime: date.toISOString() }, date.toLocaleString()),
        ]),
        h('div', { class: 'record-body' }, localOnly ? values(item) : [item.name ? isolatedText(item.name) : t('records.noName'), ' ', values(item)]),
      ]);
      if (state === 'retryable_failed' || state === 'pending') row.append(button('records.resend', () => onResend?.(item), { className: 'btn-small' }));
      if (state === 'rejected' && !item.reviewRequested) row.append(button('records.requestReview', () => onReview?.(item), { className: 'btn-small' }));
      for (const c of item.corrections ?? []) {
        row.append(
          h('div', { class: 'record-correction' }, [
            h('strong', {}, t('records.corrected')),
            ' ',
            t('records.correction', {
              before: t('records.values', { buildings: c.before?.buildings ?? '—', average: formatPercent2(c.before?.rankAverage ?? null) }),
              after: t('records.values', { buildings: c.after?.buildings ?? '—', average: formatPercent2(c.after?.rankAverage ?? null) }),
              reason: c.reason ?? '—',
              date: new Date(c.at).toLocaleString(),
            }),
          ]),
        );
      }
      list.append(row);
    }
    more.hidden = items.length <= shown;
  }

  async function load() {
    items = localOnly
      ? (await store.getAll('localResults')).map((item) => ({ ...item, source: 'local', at: item.endedAt })).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      : await collectRecords(store);
    render();
    return items;
  }

  return { el, load };
}
