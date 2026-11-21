// ランキング表示。サーバーは殿堂入りを除く正式ベストの全順位を計算し、ゲーム画面だけ上位30位（同率を含む）に絞る。
// 端末は順位を作り直さない（index + 1 で順位を作らない）。ページは同じ集計版と続き位置で読む。
import { h, isolatedText, clear } from './dom.js';
import { t, formatNumber, formatPercent2 } from '../i18n/i18n.js';
import { button } from './screens.js';

const DETAIL_URL = 'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol';

export function rankingLink(testid) {
  return h('a', { class: 'btn ranking-link', href: DETAIL_URL, 'data-testid': testid }, [
    testid === 'home-ranking' ? h('span', { class: 'ranking-link-icon', 'aria-hidden': 'true' }, '🏆') : null,
    h('span', {}, t('home.ranking')),
  ]);
}

/** 同じ集計版の続きを position でまとめ、版が切り替わったときは全行を交換する。 */
export function mergeRankingPage(current, page) {
  const restarted = !!current && (current.version !== page.version || page.restarted);
  const rows = current && !restarted ? current.rows.slice() : [];
  const seen = new Set(rows.map(r => r.position));
  for (const row of page.rows) {
    if (row.rank > 30 || seen.has(row.position)) continue;
    rows.push(row);
    seen.add(row.position);
  }
  return { version: page.version, rows, nextAfter: page.nextAfter, nameCount: page.nameCount, restarted };
}

export function rankingRow(r) {
  return h('li', { class: 'rank-row', 'data-rank': String(r.rank) }, [
    h('span', { class: 'rank-no' }, t('ranking.rankNo', { n: formatNumber(r.rank) })),
    h('span', { class: 'rank-name' }, [isolatedText(r.name)]),
    h('span', { class: 'rank-buildings' }, t('ranking.buildings', { n: formatNumber(r.buildings) })),
    h('span', { class: 'rank-avg' }, formatPercent2(r.average)),
  ]);
}

export function createRankingView({ api, name = null, pageSize = 30, result = false, onRefresh }) {
  const list = h('ol', { class: 'rank-list', tabindex: result ? 0 : null, 'aria-label': t('ranking.top') });
  const status = h('div', { class: 'rank-status', role: 'status' });
  const meta = h('p', { class: 'rank-meta' });
  const mine = h('p', { class: 'rank-mine' });
  const more = button('ranking.more', () => loadMore(), { className: 'btn-small' });
  const refresh = button('ranking.refresh', () => {
    onRefresh?.();
    return load();
  }, { className: 'btn-small' });
  more.hidden = true;
  const el = h('div', { class: result ? 'ranking ranking-result' : 'ranking' }, [h('p', { class: 'rank-note' }, t('ranking.note')), meta, mine, status, list, h('div', { class: 'row' }, [result ? null : more, refresh])]);
  let state = null;
  let seq = 0, mineSeq = 0;

  function render() {
    clear(list);
    if (!state) return;
    for (const r of state.rows) list.append(rankingRow(r));
    meta.textContent = t('ranking.nameCount', { n: formatNumber(state.nameCount) });
    more.hidden = state.nextAfter == null;
    status.textContent = state.rows.length ? (state.restarted ? t('ranking.restarted') : '') : t('ranking.empty');
  }

  async function fetchPage(params) {
    const my = ++seq;
    status.textContent = t('ranking.loading');
    el.classList.add('loading');
    let restarted = false;
    try {
      do {
        const page = await api.get('ranking', { limit: pageSize, ...params });
        if (my !== seq) return;
        if (!Number.isSafeInteger(page.version) || !Array.isArray(page.rows)) throw Error('ranking_page_invalid');
        const replaced = params.after != null && (params.version !== page.version || page.restarted);
        if (replaced) {
          if (restarted || !page.restarted || params.version === page.version) {
            params = {};
            throw Error('ranking_version_changed');
          }
          restarted = true;
        }
        if (page.nextAfter != null && (!Number.isSafeInteger(page.nextAfter) || !page.rows.length ||
            page.nextAfter <= (replaced ? 0 : params.after ?? 0))) throw Error('ranking_cursor_stalled');
        state = mergeRankingPage(params.after != null ? state : null, page);
        if (page.rows.some(row => row.rank > 30)) state.nextAfter = null;
        render();
        if (!result || state.nextAfter == null) break;
        params = { version: state.version, after: state.nextAfter };
        status.textContent = t('ranking.loading');
      } while (my === seq);
    } catch (err) {
      if (my !== seq) return;
      status.textContent = '';
      status.append(t(err?.code === 'not_configured' ? 'ranking.notConfigured' : 'ranking.error'), ' ', button('common.retry', () => fetchPage(params), { className: 'btn-small' }));
    } finally {
      if (my === seq) el.classList.remove('loading');
    }
  }

  async function loadMine() {
    const request = ++mineSeq;
    mine.textContent = '';
    if (!name) return;
    try {
      const r = await api.post('rank', { name });
      if (request === mineSeq && r.rank != null) {
        mine.append(t('ranking.mine'), ' ', isolatedText(name), ' ', t('ranking.mineValue', { rank: formatNumber(r.rank), buildings: formatNumber(r.buildings), average: formatPercent2(r.average) }));
      }
    } catch {
      /* 個人の順位が取れなくても一覧は見せる */
    }
  }

  function load() {
    state = null;
    if (api.configured === false) {
      status.textContent = t('ranking.notConfigured');
      return Promise.resolve();
    }
    loadMine();
    return fetchPage({});
  }

  function loadMore() {
    if (!state || state.nextAfter == null) return Promise.resolve();
    return fetchPage({ version: state.version, after: state.nextAfter });
  }

  return { el, load, loadMore, dispose() { seq += 1; mineSeq += 1; }, get state() {
    return state;
  } };
}
