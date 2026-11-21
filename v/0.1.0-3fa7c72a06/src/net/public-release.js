const ASSET_VERSION = /^\d+\.\d+\.\d+-[a-f0-9]{10}$/;
const CHECK_INTERVAL_MS = 60_000;
const CHECK_TIMEOUT_MS = 5_000;

function publicEntry(publicUrl, current) {
  if (!publicUrl) return null;
  try {
    const base = new URL(publicUrl);
    if (base.protocol !== 'https:' || base.origin !== current.origin || base.username || base.password) return null;
    base.search = '';
    base.hash = '';
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    if ([base.pathname, base.pathname + 'index.html'].includes(current.pathname)) return base;
  } catch {
    /* 検証用や無効なURLからは公開版の確認を行わない。 */
  }
  return null;
}

// 正式URLのホームが安全に切り替えられる間だけ実行する。保存再開用の版別URLは対象外。
export function watchPublicRelease(runtime, canSwitch, {
  page = globalThis,
  read = (...args) => fetch(...args),
  now = Date.now,
} = {}) {
  if (runtime.env !== 'production' || !page.location?.href || !ASSET_VERSION.test(runtime.assetVersion)) return;
  const current = new URL(page.location.href);
  const base = publicEntry(runtime.publicUrl, current);
  if (!base) return;
  let pending;
  let disposed = false;
  let nextCheck = -Infinity;

  const safe = () => !disposed && page.document.visibilityState !== 'hidden' && canSwitch();
  async function check() {
    if (!safe() || pending || now() < nextCheck) return;
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
      if (!safe() || controller.signal.aborted || release?.env !== 'production' || !ASSET_VERSION.test(release.assetVersion)) return;
      const target = release.assetVersion;
      if (target === runtime.assetVersion || target === current.searchParams.get('release-target')) return;
      // CDNの切り替え途中に古いHTMLが返っても、同じ版への再読込を繰り返さない。
      const fresh = new URL(current.href);
      fresh.pathname = base.pathname;
      fresh.searchParams.set('release-refresh', String(checkedAt));
      fresh.searchParams.set('release-target', target);
      page.location.replace(fresh.href);
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
