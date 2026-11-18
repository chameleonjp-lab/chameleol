// サーバー（Supabase Edge Function `kamereoru`）との通信。時間切れを設け、HTTPの成功だけで受付成功と判断しない。
// 失敗は「再試行できる」（通信断・時間切れ・5xx・429）と「再試行しない」（形式や照合の拒否）に分ける。

export class ApiError extends Error {
  constructor(code, { retryable = false, status = 0, detail = null } = {}) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.detail = detail;
  }
}

export function createApi({ base, fetchImpl = null, timeoutMs = 8000, headers = {} } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const configured = typeof base === 'string' && base.length > 0;

  async function request(method, path, body = null, { timeout = timeoutMs } = {}) {
    if (!configured) throw new ApiError('not_configured', { retryable: false });
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeout);
    let res;
    try {
      res = await doFetch(`${base.replace(/\/$/, '')}/${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller?.signal,
        cache: 'no-store',
      });
    } catch (err) {
      throw new ApiError(err?.name === 'AbortError' ? 'timeout' : 'network', { retryable: true });
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (res.ok && data && data.ok === true) return data;
    const code = data?.error ?? `http_${res.status}`;
    const retryable = res.status === 0 || res.status >= 500 || res.status === 429 || res.status === 408 || data?.retryable === true;
    throw new ApiError(code, { retryable, status: res.status, detail: data?.detail ?? null });
  }

  return {
    configured,
    post: (path, body, opts) => request('POST', path, body, opts),
    get: (path, params = {}, opts) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, String(v));
      const qs = q.toString();
      return request('GET', qs ? `${path}?${qs}` : path, null, opts);
    },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function uuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
