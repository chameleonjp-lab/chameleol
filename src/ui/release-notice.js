import { t } from '../i18n/i18n.js';
import { h } from './dom.js';

const ASSET_VERSION = /^\d+\.\d+\.\d+-[a-f0-9]{10}$/;
const CHECK_INTERVAL_MS = 60_000;
const CHECK_TIMEOUT_MS = 5_000;

function publicEntry(publicUrl, href, version) {
  if (!publicUrl || !href || !ASSET_VERSION.test(version)) return null;
  try {
    const base = new URL(publicUrl);
    const current = new URL(href);
    if (base.protocol !== 'https:' || base.origin !== current.origin || base.username || base.password) return null;
    base.search = '';
    base.hash = '';
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    const pinnedPath = new URL(`v/${version}/`, base).pathname;
    if ([base.pathname, base.pathname + 'index.html'].includes(current.pathname)) return { base, pinned: false };
    if ([pinnedPath, pinnedPath + 'index.html'].includes(current.pathname)) return { base, pinned: true };
  } catch {
    /* 検証用や無効なURLからは公開版の確認を行わない。 */
  }
  return null;
}

// ホームを表示している間だけ確認する。プレイや保存中にページを切り替えない。
export function mountReleaseNotice(host, runtime, {
  page = globalThis,
  read = (...args) => fetch(...args),
  now = Date.now,
} = {}) {
  if (runtime.env !== 'production') return;
  const entry = publicEntry(runtime.publicUrl, page.location?.href, runtime.assetVersion);
  if (!entry) return;

  const { base, pinned } = entry;
  const message = h('span', { role: 'status', hidden: true }, t('notice.releaseChanged'));
  const link = h('a', { class: 'btn btn-small', href: new URL('latest.html', base).href }, t('notice.openPublicRelease'));
  const notice = h('p', { class: 'notice notice-update', hidden: !pinned, 'data-testid': 'release-notice' }, [message, ' ', link]);
  host.append(notice);
  let pending;
  let disposed = false;
  let nextCheck = -Infinity;

  async function check() {
    if (disposed || pending || page.document.visibilityState === 'hidden' || now() < nextCheck) return;
    const checkedAt = now();
    nextCheck = checkedAt + CHECK_INTERVAL_MS;
    const url = new URL('release.json', base);
    url.searchParams.set('release-check', String(checkedAt));
    const controller = new AbortController();
    pending = controller;
    const timeout = page.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const response = await read(url.href, { cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (!response.ok) return;
      const release = await response.json();
      if (disposed || controller.signal.aborted || release?.env !== 'production' || !ASSET_VERSION.test(release.assetVersion)) return;
      message.hidden = release.assetVersion === runtime.assetVersion;
      notice.hidden = message.hidden && !pinned;
    } catch {
      /* バージョン確認ができない時も、そのまま遊べる。 */
    } finally {
      page.clearTimeout(timeout);
      pending = null;
    }
  }

  const timer = page.setInterval(check, CHECK_INTERVAL_MS);
  page.document.addEventListener('visibilitychange', check);
  page.addEventListener('pageshow', check);
  check();
  return () => {
    disposed = true;
    pending?.abort();
    page.clearInterval(timer);
    page.document.removeEventListener('visibilitychange', check);
    page.removeEventListener('pageshow', check);
  };
}
