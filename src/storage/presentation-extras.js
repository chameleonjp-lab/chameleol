// 表示用の保存（kv の `presentation.extras.v1`）。
// 持つのは「E044 の通知済み印」と「小芝居の状態（回数・前回開始・抽選状態・中間配達の予約と実施済み印）」だけ。
// 本編 snapshot・署名 summary・未送信結果・成績には触れない。発見集合・初発見印・図鑑用の項目は持たない。
// ここは純関数だけ。取引（所有者・世代の確認、書込）は store.js / memory-store.js が行う。

export const EXTRAS_KEY = 'presentation.extras.v1';
export const MAX_PLAYS = 32;
export const MAX_BYTES = 32768;
export const MAX_CAMEO_COUNT = 6;
const MAX_PLAY_ID = 128;
const MAX_START_MS = 10_000_000;
const MAX_RNG = 4294967295;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export const isPlayId = (v) => typeof v === 'string' && v.length >= 1 && v.length <= MAX_PLAY_ID;

/** 小芝居の状態を5項目へ正規化する。形が不正なら null。 */
export function normalizeDirectorState(s) {
  if (!isObject(s)) return null;
  const { count, lastStartedAt, rngState, reservedMidpoint, midpointUsed } = s;
  if (!isInt(count, 0, MAX_CAMEO_COUNT)) return null;
  if (lastStartedAt !== null && !(typeof lastStartedAt === 'number' && Number.isFinite(lastStartedAt) && lastStartedAt >= 0 && lastStartedAt <= MAX_START_MS)) return null;
  if (!isInt(rngState, 0, MAX_RNG)) return null;
  if (typeof reservedMidpoint !== 'boolean' || typeof midpointUsed !== 'boolean') return null;
  if (reservedMidpoint && midpointUsed) return null;
  if ((count === 0) !== (lastStartedAt === null)) return null;
  return { count, lastStartedAt, rngState, reservedMidpoint, midpointUsed };
}

function normalizePlay(p) {
  if (!isObject(p) || !isPlayId(p.playId)) return null;
  if (typeof p.at !== 'number' || !Number.isFinite(p.at) || typeof p.badge !== 'boolean') return null;
  let director = null;
  if (p.director !== null && p.director !== undefined) {
    director = normalizeDirectorState(p.director);
    if (!director) return null;
  }
  return { playId: p.playId, at: p.at, badge: p.badge, director };
}

const emptyExtras = () => ({ version: 1, plays: [] });
const byteLength = (v) => new TextEncoder().encode(JSON.stringify(v)).length;

/** 件数と容量の上限。新しい順に並べ、古いものから落とす。 */
export function boundExtras(extras, { maxPlays = MAX_PLAYS, maxBytes = MAX_BYTES } = {}) {
  const plays = extras.plays.slice(0, maxPlays);
  const out = { version: 1, plays };
  while (plays.length > 1 && byteLength(out) > maxBytes) plays.pop();
  return out;
}

/** 保存値を読む。版違い・形の不正は空、項目単位の不正はその play を捨てる。 */
export function normalizeExtras(raw) {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.plays)) return emptyExtras();
  const seen = new Set();
  const plays = [];
  for (const item of raw.plays) {
    const p = normalizePlay(item);
    if (!p || seen.has(p.playId)) continue;
    seen.add(p.playId);
    plays.push(p);
  }
  plays.sort((a, b) => b.at - a.at);
  return boundExtras({ version: 1, plays });
}

/** 保存済みの小芝居状態（無い・壊れている場合は null）。 */
export function readDirector(extras, playId) {
  if (!isPlayId(playId)) return null;
  const play = extras.plays.find((p) => p.playId === playId);
  return play?.director ? { ...play.director } : null;
}

function withPlay(extras, playId, now, patch) {
  const found = extras.plays.find((p) => p.playId === playId);
  const base = found ?? { playId, at: now, badge: false, director: null };
  const at = Math.max(now, extras.plays[0]?.at ?? 0);
  const next = { ...base, ...patch, at };
  return boundExtras({ version: 1, plays: [next, ...extras.plays.filter((p) => p.playId !== playId)] });
}

/** 札の取得。まだ取っていない時だけ取る。 */
export function applyBadgeClaim(extras, playId, now = Date.now()) {
  if (!isPlayId(playId)) return { extras, claimed: false };
  const found = extras.plays.find((p) => p.playId === playId);
  if (found?.badge) return { extras, claimed: false };
  return { extras: withPlay(extras, playId, now, { badge: true }), claimed: true };
}

/** 小芝居の開始枠の取得（比較交換）。 */
export function applyCameoClaim(extras, playId, state, now = Date.now()) {
  const next = normalizeDirectorState(state);
  if (!isPlayId(playId) || !next) return { extras, claimed: false };
  const stored = extras.plays.find((p) => p.playId === playId)?.director ?? null;
  if (!stored) {
    if (next.count > 1) return { extras, claimed: false };
  } else {
    if (next.count !== stored.count + 1) return { extras, claimed: false };
    if (stored.lastStartedAt !== null && next.lastStartedAt < stored.lastStartedAt) return { extras, claimed: false };
    // 予約は戻せない。実施済み印は、予約を使う時にだけ立つ。
    if (next.reservedMidpoint && !stored.reservedMidpoint) return { extras, claimed: false };
    if (stored.midpointUsed && !next.midpointUsed) return { extras, claimed: false };
    if (next.midpointUsed && !stored.midpointUsed && !stored.reservedMidpoint) return { extras, claimed: false };
    // 予約を残したままの通常の開始は、中間配達の1回分を空けて5回まで。
    if (stored.reservedMidpoint && next.reservedMidpoint && next.count > MAX_CAMEO_COUNT - 1) return { extras, claimed: false };
  }
  return { extras: withPlay(extras, playId, now, { director: next }), claimed: true };
}
