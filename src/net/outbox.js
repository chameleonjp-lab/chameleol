// 終了結果の送信待ちと再送。
// - 発見・途中終了・クリアの確定結果と履歴は、端末へ先に保存（store.endRun）してから送る。演出や画面移動とは独立。
// - 大きい結果は分割して送る。各片は 結果番号・順番・総数・全体の長さ・内容の指紋 を付ける。
// - 全片がそろってからサーバーが「完全受付」を返す。受付証と照会情報を端末へ保存できてから送信待ちを外す。
// - 1件の恒久的な拒否や失敗が、ほかの記録の送信を止めない。
import { ApiError, sha256Hex, uuid } from './api.js';
import { canSendRecord } from './destination.js';
import { readMetrics } from './result-metrics.js';
import { validateVerifiedScore } from './verified-score.js';

export const CHUNK_CHARS = 128 * 1024; // 試作値（文字数。履歴はASCIIのJSONなのでバイト数と同じ）
export const RESULT_FORMAT = 'kamereoru-result-v1';
const statusRequests = new WeakMap();
const STATUS_BATCH_SIZE = 50; // サーバーが一度に照会できる上限

/** 終了結果の本文を作る。端末の要約は照合用で、サーバーは開始記録と再計算値を使う。 */
export function buildResultBody(snapshot, summary, { gameVersion, endedAt = Date.now() } = {}) {
  const { meta } = snapshot;
  return JSON.stringify({
    format: RESULT_FORMAT,
    playId: meta.playId,
    launchId: meta.launchId,
    rulesVersion: meta.rulesVersion,
    generatorVersion: meta.generatorVersion,
    gameVersion: gameVersion ?? meta.gameVersion,
    seed: meta.seed,
    history: snapshot.history,
    claimed: summary,
    endedAt,
  });
}

export async function makeOutboxItem({ snapshot, summary, secret, gameVersion }) {
  const body = buildResultBody(snapshot, summary, { gameVersion });
  const bodySha = await sha256Hex(body);
  const chunkTotal = Math.max(1, Math.ceil(body.length / CHUNK_CHARS));
  return {
    playId: snapshot.meta.playId,
    launchId: snapshot.meta.launchId,
    requiresLaunch: snapshot.meta.requiresLaunch === true,
    destination: snapshot.meta.destination,
    resultId: uuid(),
    ranked: true,
    name: snapshot.meta.name,
    secret,
    body,
    bodySha,
    bodyLength: body.length,
    chunkTotal,
    acked: [],
    summary,
  };
}

export function chunkOf(item, index) {
  return item.body.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS);
}

/** 1件を送る。完全受付まで進んだら受付証を返す。 */
export async function sendOne(api, item, { onProgress = () => {} } = {}) {
  if (!await canSendRecord(api, item)) throw new ApiError('destination_unknown', { retryable: true });
  for (let index = 0; index < item.chunkTotal; index += 1) {
    if (item.acked.includes(index)) continue;
    await api.post('chunk', {
      playId: item.playId,
      resultId: item.resultId,
      secret: item.secret,
      index,
      total: item.chunkTotal,
      length: item.bodyLength,
      sha256: item.bodySha,
      data: chunkOf(item, index),
    });
    item.acked.push(index);
    await onProgress(index + 1, item.chunkTotal);
  }
  const receipt = await api.post('complete', { playId: item.playId, resultId: item.resultId, secret: item.secret });
  if (receipt.playId !== item.playId || receipt.resultId !== item.resultId || typeof receipt.status !== 'string') {
    throw new ApiError('invalid_receipt', { retryable: true });
  }
  return receipt;
}

/** 受付証と照会情報を保存し、同じ取引で送信待ちを外す。 */
export async function settleAccepted(store, item, receipt) {
  return store.acceptOutbox({
    playId: item.playId,
    resultId: item.resultId,
    secret: item.secret,
    name: item.name,
    summary: item.summary,
    receipt,
    status: receipt.status,
    destination: item.destination,
    metrics: readMetrics(receipt),
    official: receipt.official ?? null,
    serverAccepted: true,
    acceptedAt: Date.now(),
    corrections: [],
    reviewRequested: false,
  });
}

/**
 * 送信待ちをすべて試す。1件ずつ独立に扱い、失敗は記録して次へ進む。
 * 戻り値：{ accepted, retryable, permanent }
 */
export async function flushOutbox({ api, store, onUpdate = () => {} }) {
  const summary = { accepted: 0, retryable: 0, permanent: 0 };
  if (!api.configured) return summary;
  const items = (await store.getAll('outbox')).sort((a, b) => a.createdAt - b.createdAt);
  for (const item of items) {
    if (item.destination !== undefined && item.destination !== api.destination) continue;
    if (item.state === 'permanent_failed') {
      summary.permanent += 1;
      continue;
    }
    try {
      if (item.destination === undefined) {
        if (!await canSendRecord(api, item)) continue;
        item.destination = api.destination;
      }
      if (item.launchId) {
        const launch = await store.getOne('launches', item.launchId);
        if (item.requiresLaunch && launch?.rejected) throw new ApiError(launch.rejected);
        if ((launch && !launch.sent) || (item.requiresLaunch && !launch)) {
          summary.retryable += 1;
          onUpdate({ playId: item.playId, state: 'retryable_failed' });
          continue;
        }
      }
      onUpdate({ playId: item.playId, state: 'sending' });
      const receipt = await sendOne(api, item, {
        onProgress: async () => {
          // 送れた片を記録（再送で同じ片を送り直さない。送っても同じ内容なら受理される）
          await store.updateOutbox(item, { acked: item.acked.slice(), destination: item.destination }).catch(() => {});
        },
      });
      if (!await settleAccepted(store, item, receipt)) continue;
      summary.accepted += 1;
      onUpdate({ playId: item.playId, state: 'accepted', receipt });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError('unknown', { retryable: true });
      if (item.destination === undefined) continue; // Failed legacy ownership probe, retain untouched.
      const state = e.retryable ? 'retryable_failed' : 'permanent_failed';
      // サーバーに片がそろっていない：送ったつもりの片を数え直し、次の再送で全片を送る（同じ内容なら受理される）
      const acked = e.code === 'incomplete' ? [] : item.acked;
      const saved = await store
        .updateOutbox(item, { destination: item.destination, acked, state: e.retryable ? 'pending' : 'permanent_failed', lastError: e.code, attempts: (item.attempts ?? 0) + 1, lastTriedAt: Date.now() })
        .catch(() => true); // If the store is unavailable, still report the delivery failure.
      if (!saved) continue;
      if (e.retryable) summary.retryable += 1;
      else summary.permanent += 1;
      onUpdate({ playId: item.playId, state, error: e.code });
    }
  }
  return summary;
}

/** 受付済みの記録の状況を照会する（送信元の秘密を使う）。 */
export async function refreshRecords({ api, store, playId, isCurrent = () => true }) {
  if (!api.configured) return [];
  const rows = playId === undefined ? await store.getAll('records') : [await store.getOne('records', playId)];
  // For a legacy row this owner-only lookup also verifies the original project.
  const records = rows.filter(r => r && (r.destination === undefined || r.destination === api.destination));
  const updated = [];
  for (let i = 0; i < records.length; i += STATUS_BATCH_SIZE) {
    const batch = records.slice(i, i + STATUS_BATCH_SIZE);
    const requests = statusRequests.get(store) ?? new Map();
    statusRequests.set(store, requests);
    const token = Symbol();
    for (const row of batch) requests.set(row.playId, token);
    try {
      const data = await api.post('status', { items: batch.map((r) => ({ playId: r.playId, secret: r.secret })) });
      if (!isCurrent()) break;
      const byId = new Map((data.items ?? []).map((x) => [x.playId, x]));
      for (const r of batch) {
        const s = byId.get(r.playId);
        if (!s || s.error || typeof s.status !== 'string' || !isCurrent() || requests.get(r.playId) !== token) continue;
        const next = { ...r, destination: api.destination, metrics: readMetrics(s), status: s.status, official: s.official ?? null, corrections: s.corrections ?? [], reviewRequested: s.reviewRequests > 0, lastCheckedAt: Date.now() };
        const verifiedScore = validateVerifiedScore(s.verifiedScore, {
          playId: r.playId, responsePlayId: s.playId, rulesVersion: r.summary?.rulesVersion, summary: r.summary, status: s.status,
        });
        // Missing or malformed corrections never erase the last verified value.
        // Auxiliary corrections are not ranking changes and do not set unseenChange.
        if (verifiedScore) next.verifiedScore = verifiedScore;
        const changed = JSON.stringify(next.corrections) !== JSON.stringify(r.corrections) || next.status !== r.status;
        if (changed) next.unseenChange = (r.unseenChange ?? false) || (r.status != null && r.status !== next.status) || next.corrections.length > (r.corrections?.length ?? 0);
        await store.put('records', next);
        if (isCurrent() && requests.get(r.playId) === token) updated.push(next);
      }
    } finally {
      for (const row of batch) {
        if (requests.get(row.playId) === token) requests.delete(row.playId);
      }
    }
  }
  return updated;
}

export async function requestReview({ api, store, playId }) {
  const r = await store.getOne('records', playId);
  if (!r) throw new ApiError('unknown_record');
  if (!await canSendRecord(api, r)) throw new ApiError('destination_unknown');
  const data = await api.post('review', { playId, secret: r.secret });
  // Successful moderation supersedes any status snapshot still in flight.
  statusRequests.get(store)?.delete(playId);
  await store.put('records', { ...r, destination: api.destination, status: data.status, metrics: readMetrics(data), reviewRequested: true });
  return data;
}
