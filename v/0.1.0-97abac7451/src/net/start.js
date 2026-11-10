// 名前ありプレイの開始受付と、プレイ回数の開始通知。
//
// 開始受付：
//   - 送る前に要求番号（requestId）と推測困難な送信元の秘密を端末へ保存する。
//   - 同じ要求番号で「初回＋自動再試行2回」。失敗したら「もう一度試す／ランキング対象外で遊ぶ」を選んでもらう。
//   - 受付を確認してから本編の時計を始める。
// 開始通知（プレイ回数）：
//   - スタート操作1回につき launchId を1つ。実際に本編を始めた時だけ、端末へ保存してから送る。
//   - 名前ありの開始予約だけでは回数に入れない。再開・終了・再送では数えない。
import { RULES_V1 } from '../rules/v1/index.js';
import { randomSecret } from '../storage/store.js';
import { ApiError, UUID_RE, sleep, uuid } from './api.js';

export const START_RETRY_DELAYS = Object.freeze([700, 1600]); // 試作値

/** 開始受付の応答を検査する。HTTPの成功だけで受付成功としない。 */
export function validateStartResponse(data, { requestId, name, rules = RULES_V1 }) {
  const problems = [];
  if (data?.requestId !== requestId) problems.push('requestId');
  if (typeof data?.playId !== 'string' || !UUID_RE.test(data.playId)) problems.push('playId');
  if (!Number.isInteger(data?.seed) || data.seed < 0 || data.seed > 0xffffffff) problems.push('seed');
  if (data?.rulesVersion !== rules.rulesVersion) problems.push('rulesVersion');
  if (data?.generatorVersion !== rules.generatorVersion) problems.push('generatorVersion');
  if (data?.name !== name) problems.push('name');
  return problems;
}

/**
 * 開始要求を作って端末へ保存する（送信前）。
 */
export async function createStartRequest(store, { name, launchId, gameVersion }) {
  const record = {
    requestId: uuid(),
    secret: randomSecret(),
    launchId,
    name,
    gameVersion,
    status: 'requesting',
    createdAt: Date.now(),
    attempts: 0,
  };
  await store.put('starts', record);
  return record;
}

/**
 * 同じ要求番号で送る。初回＋自動再試行（delays の数だけ）。
 * isCurrent() が false を返したら（利用者が対象外プレイ等へ進んだら）、結果を現在のプレイへ取り付けない。
 */
export async function sendStartRequest(api, store, record, { delays = START_RETRY_DELAYS, onAttempt = () => {}, isCurrent = () => true } = {}) {
  let lastError = null;
  for (let i = 0; i <= delays.length; i += 1) {
    if (i > 0) await sleep(delays[i - 1]);
    if (!isCurrent()) break;
    onAttempt(i + 1, delays.length + 1);
    try {
      record.attempts += 1;
      const data = await api.post('start', {
        requestId: record.requestId,
        secret: record.secret,
        launchId: record.launchId,
        name: record.name,
        gameVersion: record.gameVersion,
      });
      const problems = validateStartResponse(data, { requestId: record.requestId, name: record.name });
      if (problems.length) throw new ApiError('invalid_start_response', { retryable: false, detail: problems });
      const accepted = { ...record, status: 'accepted', response: data, acceptedAt: Date.now() };
      if (!isCurrent()) {
        // 古い応答が遅れて届いた：現在のプレイには取り付けず、元の要求の中止として残す
        await store.put('starts', { ...accepted, status: 'abandoned', abandonedAt: Date.now() });
        return { ok: false, stale: true, data };
      }
      await store.put('starts', accepted);
      return { ok: true, data, record: accepted };
    } catch (err) {
      lastError = err instanceof ApiError ? err : new ApiError('unknown', { retryable: true });
      if (!lastError.retryable) break;
    }
  }
  await store.put('starts', { ...record, status: 'failed', lastError: lastError?.code ?? null });
  return { ok: false, error: lastError };
}

/** 利用者が対象外プレイ等へ進んだ：開始要求を中止として記録し、可能ならサーバーにも伝える。 */
export async function abandonStart(api, store, record) {
  const latest = (await store.getOne('starts', record.requestId)) ?? record;
  await store.put('starts', { ...latest, status: 'abandoned', abandonedAt: Date.now() });
  if (!api.configured) return;
  try {
    await api.post('abandon', { requestId: record.requestId, secret: record.secret });
    await store.put('starts', { ...latest, status: 'abandoned', abandonedAt: Date.now(), abandonSent: true });
  } catch {
    /* 届かなくても回数・記録には影響しない */
  }
}

/**
 * 実際に本編を始めた時の開始通知。端末へ保存してから送る（送れなくても次回起動・通信回復で再送）。
 */
export async function recordLaunch(store, { launchId, ranked, playId = null, secret = null, gameVersion }) {
  await store.put('launches', { launchId, ranked, playId, secret, gameVersion, startedAt: Date.now(), sent: false });
}

export async function flushLaunches(api, store) {
  if (!api.configured) return { sent: 0, failed: 0 };
  const pending = (await store.getAll('launches')).filter((l) => !l.sent);
  let sent = 0;
  let failed = 0;
  for (const l of pending) {
    try {
      await api.post('launch', { launchId: l.launchId, ranked: l.ranked, playId: l.playId, secret: l.secret, gameVersion: l.gameVersion });
      // 送れた通知は秘密を外して残す（重複防止の記録）
      await store.put('launches', { ...l, secret: null, sent: true, sentAt: Date.now() });
      sent += 1;
    } catch (err) {
      failed += 1;
      if (err instanceof ApiError && !err.retryable) {
        await store.put('launches', { ...l, secret: null, sent: true, rejected: err.code, sentAt: Date.now() });
      }
    }
  }
  return { sent, failed };
}
