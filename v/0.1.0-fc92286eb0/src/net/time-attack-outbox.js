import {
  MODE_ID,
} from '../rules/time-attack/v1/index.js';
import { ApiError, sha256Hex, uuid } from './api.js';
import { requireTimeAttack } from './time-attack-start.js';

const bytes = new TextEncoder();
const decoder = new TextDecoder();
const TIME_ATTACK_MAX_HISTORY_BYTES = 8 * 1024 * 1024;
const TIME_ATTACK_MAX_CHUNKS = 64;
const MAX_CHUNK_BYTES = 128 * 1024;
const POLLING = new Set(['verifying', 'under_review', 'not_received']);
const SERVER_STATUSES = new Set([...POLLING, 'official', 'no_rank', 'rejected', 'pending_review']);
function confirm(condition) {
  if (!condition) throw new ApiError('unconfirmed_time_attack_receipt', { retryable: true });
}
const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 32, 60];

export function splitTimeAttackHistory(history) {
  const text = JSON.stringify(history);
  const encoded = bytes.encode(text);
  if (encoded.length > TIME_ATTACK_MAX_HISTORY_BYTES) return null;
  const chunks = [];
  for (let start = 0; start < encoded.length;) {
    let end = Math.min(encoded.length, start + MAX_CHUNK_BYTES);
    while (end < encoded.length && (encoded[end] & 0xc0) === 0x80) end--;
    chunks.push(decoder.decode(encoded.subarray(start, end)));
    start = end;
  }
  return chunks.length <= TIME_ATTACK_MAX_CHUNKS ? { text, chunks, length: encoded.length } : null;
}

export async function createTimeAttackUpload(history, launch) {
  const { launchId, playId, secret, gameVersion } = launch.body;
  const parts = splitTimeAttackHistory({ ...history, playId, launchId, gameVersion });
  if (!parts) return null;
  return {
    id: launchId, destination: launch.destination, modeId: MODE_ID,
    requestId: launch.requestId, launchId, playId, secret, resultId: uuid(),
    chunks: parts.chunks, length: parts.length, sha256: await sha256Hex(parts.text),
    nextChunk: 0,
  };
}

// Each receipt is durable before the next request. If another tab sends the
// same receipt concurrently the server will see the same identifiers and bytes.
export function createTimeAttackOutbox(api, { stores, onRecord = () => {}, online = () =>
  !globalThis.document?.hidden && globalThis.navigator?.onLine !== false } = {}) {
  let pending, timer, retryAt = 0;

  function schedule(at) {
    if (!Number.isFinite(at) || !online()) return;
    if (timer && retryAt <= at) return;
    clearTimeout(timer);
    retryAt = at;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, Math.max(1, at - Date.now()));
  }

  function failed(row, error) {
    const failures = (row.failures ?? 0) + 1;
    return { ...row, failures, permanent: !error.retryable,
      nextAt: Date.now() + Math.max(error.retryAfterMs ?? 0,
        BACKOFF_SECONDS[Math.min(failures - 1, BACKOFF_SECONDS.length - 1)] * 1000) };
  }

  async function send(store, table, row, work, force) {
    if (!online() || row.destination !== api.destination || row.permanent) return;
    if (row.nextAt > Date.now() && (!force || row.limited)) { schedule(row.nextAt); return; }
    try {
      await work();
    } catch (error) {
      const latest = await store.get(table, row.id);
      if (!latest || latest.sent) return;
      const deferred = { ...failed(latest, error), limited: error.status === 429 };
      if (table === 'outbox') {
        if (['missing_chunks', 'chunks_missing'].includes(error.code)) deferred.nextChunk = 0;
        if (error.code === 'launch_required') {
          const launch = await store.get('launches', row.launchId);
          if (launch) await store.put('launches', { ...launch, sent: false });
        }
      }
      await store.put(table, deferred);
      if (table === 'outbox' || (table === 'launches' && row.body.ranked)) {
        await setStatus(store, row.id, deferred.permanent ? 'permanent_failed' : 'retryable_failed');
      }
      if (!deferred.permanent) schedule(deferred.nextAt);
    }
  }

  async function setStatus(store, id, status, details = {}) {
    const record = await store.get('records', id);
    if (!record) return;
    const terminal = ['official', 'no_rank', 'rejected', 'pending_review', 'under_review'];
    if (terminal.includes(record.status) && !terminal.includes(status)) return;
    const next = { ...record, status,
      reviewRequested: record.reviewRequested === true || details.reviewRequested === true };
    if (record.status === next.status && Boolean(record.reviewRequested) === next.reviewRequested) return;
    await store.put('records', next);
    onRecord(next);
  }

  async function process(store, force) {
    const post = async (path, body) => requireTimeAttack(await api.post(path, body));
    for (const start of await store.getAll('starts')) {
      if (start.abandoned) await send(store, 'starts', start, async () => {
        const { requestId, launchId, secret } = start.request;
        await post('time-attack-abandon', { requestId, launchId, secret });
        await store.remove('starts', start.id);
      }, force);
    }
    for (const launch of await store.getAll('launches')) {
      if (!launch.sent) await send(store, 'launches', launch, async () => {
        const reply = await post('time-attack-launch', launch.body);
        confirm(reply.launchId === launch.id && reply.counted === true);
        await store.put('launches', { ...launch, sent: true, failures: 0, nextAt: 0 });
      }, force);
    }
    const launched = new Set((await store.getAll('launches')).filter(item => item.sent).map(item => item.id));
    for (const upload of await store.getAll('outbox')) {
      if (!launched.has(upload.launchId)) continue;
      await send(store, 'outbox', upload, async () => {
        let item = upload;
        await setStatus(store, upload.id, 'uploading');
        const { playId, resultId, secret, length, sha256, chunks } = item;
        for (let index = item.nextChunk; index < chunks.length; index++) {
          if (!online()) return;
          const reply = await post('time-attack-chunk', { playId, resultId, secret, length, sha256,
            index, total: chunks.length, data: chunks[index] });
          confirm(reply.accepted === index || (reply.playId === playId && reply.resultId === resultId && reply.index === index));
          item = { ...item, nextChunk: index + 1, failures: 0, nextAt: 0 };
          await store.put('outbox', item);
        }
        if (!online()) return;
        const reply = await post('time-attack-complete', { playId, resultId, secret });
        confirm(reply.playId === playId && reply.resultId === resultId && SERVER_STATUSES.has(reply.status));
        await setStatus(store, upload.id, reply.status);
        await store.remove('outbox', upload.id);
      }, force);
    }
    let nextPollAt = Infinity;
    const batch = [];
    for (const item of await store.getAll('records')) {
      if (!POLLING.has(item.status) || item.destination !== api.destination || item.permanent) continue;
      if (item.nextAt > Date.now() && (!force || item.limited)) {
        nextPollAt = Math.min(nextPollAt, item.nextAt);
      } else {
        batch.push(item);
      }
    }
    for (let index = 0; index < batch.length && online(); index += 50) {
      const items = batch.slice(index, index + 50);
      try {
        const reply = await post('time-attack-status', { items: items.map(({ playId, secret }) => ({ playId, secret })) });
        for (const item of items) {
          const status = reply.items?.find(candidate => candidate.playId === item.playId);
          if (SERVER_STATUSES.has(status?.status)) await setStatus(store, item.id, status.status, status);
          if (!status || POLLING.has(status.status)) nextPollAt = Math.min(nextPollAt, Date.now() + 2000);
        }
      } catch (error) {
        for (const item of items) {
          const deferred = { ...failed(item, error), limited: error.status === 429 };
          await store.put('records', deferred);
          if (!deferred.permanent) nextPollAt = Math.min(nextPollAt, deferred.nextAt);
        }
      }
    }
    schedule(nextPollAt);
  }

  function flush(force = false) {
    if (!api.configured || !online()) return Promise.resolve();
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        for (const store of stores()) await process(store, force).catch(() => schedule(Date.now() + 2000));
      }).finally(() => { pending = null; });
      return pending;
    }
    return pending.then(() => force ? flush() : undefined);
  }

  async function review(store, record) {
    const { playId, secret } = record;
    await requireTimeAttack(await api.post('time-attack-review', { playId, secret }));
    await setStatus(store, record.id, 'under_review', { reviewRequested: true });
    return flush(true);
  }

  return { flush, review };
}
