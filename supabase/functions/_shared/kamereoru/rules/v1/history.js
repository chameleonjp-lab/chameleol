// 操作履歴の記録・圧縮・再計算。
// 指の座標は記録しない。判定に使った色（整数のHSV）と、ゲーム内時刻・停止・再開・終了だけを残す。
// 形式（kamereoru-history-v1）：配列の配列。dt は直前の記録からのミリ秒（0以上の整数）。
//   [0, dt, h, s, v]  色の変更
//   [1, dt]           一時停止
//   [2, dt]           再開
//   [3, dt]           自分で途中終了
// 同じ時刻の記録は配列の順番が処理の順番になる。
import { RULES_V1 } from './config.js';
import { advance, initialState, summarize, totalMs } from './engine.js';

export const KIND = Object.freeze({ color: 0, pause: 1, resume: 2, quit: 3 });
const KIND_NAMES = ['color', 'pause', 'resume', 'quit'];

export function createRecorder(rules = RULES_V1) {
  const entries = [];
  let lastT = 0;
  let lastColor = { ...rules.initialColor };
  return {
    entries,
    /** 記録する。同じ色の連続は記録しない（同値圧縮）。 */
    push(event) {
      if (!Number.isInteger(event.t) || event.t < lastT) throw new Error('history time must not go backwards');
      if (event.type === 'color') {
        if (event.h === lastColor.h && event.s === lastColor.s && event.v === lastColor.v) return false;
        entries.push([KIND.color, event.t - lastT, event.h, event.s, event.v]);
        lastColor = { h: event.h, s: event.s, v: event.v };
      } else if (event.type in KIND && event.type !== 'color') {
        entries.push([KIND[event.type], event.t - lastT]);
      } else {
        throw new Error(`unknown history event: ${event.type}`);
      }
      lastT = event.t;
      return true;
    },
    get lastT() {
      return lastT;
    },
    get lastColor() {
      return { ...lastColor };
    },
    restore(savedEntries) {
      entries.length = 0;
      lastT = 0;
      lastColor = { ...rules.initialColor };
      for (const e of savedEntries) {
        entries.push(e.slice());
        lastT += e[1];
        if (e[0] === KIND.color) lastColor = { h: e[2], s: e[3], v: e[4] };
      }
    },
  };
}

/** 形式を検査して、絶対時刻の出来事の列へ戻す。不正なら { error } を返す。 */
export function decodeHistory(entries, { maxEntries = 200000, rules = RULES_V1 } = {}) {
  if (!Array.isArray(entries)) return { error: 'history_not_array' };
  if (entries.length > maxEntries) return { error: 'history_too_long' };
  const events = [];
  let t = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (!Array.isArray(e) || e.length < 2) return { error: 'history_entry_shape', index: i };
    const [kind, dt] = e;
    if (!Number.isInteger(kind) || kind < 0 || kind > 3) return { error: 'history_entry_kind', index: i };
    if (!Number.isInteger(dt) || dt < 0) return { error: 'history_time_backwards', index: i };
    t += dt;
    if (t > totalMs(rules) + 60000) return { error: 'history_time_range', index: i };
    if (kind === KIND.color) {
      if (e.length !== 5 || !e.slice(2).every(Number.isInteger)) return { error: 'history_entry_shape', index: i };
      events.push({ type: 'color', t, h: e[2], s: e[3], v: e[4] });
    } else {
      if (e.length !== 2) return { error: 'history_entry_shape', index: i };
      events.push({ type: KIND_NAMES[kind], t });
    }
  }
  return { events };
}

/**
 * 結果を変えない範囲で履歴を小さくする。
 * - 同じ色の連続を除く
 * - 同じ時刻に続く色の変更は最後の1件だけ残す（長さ0の色は積算にも発見にも影響しない）
 */
export function compactHistory(entries) {
  const decoded = decodeHistory(entries);
  if (decoded.error) throw new Error(decoded.error);
  const kept = [];
  for (const ev of decoded.events) {
    const last = kept[kept.length - 1];
    if (ev.type === 'color' && last && last.type === 'color' && last.t === ev.t) {
      kept[kept.length - 1] = ev;
      continue;
    }
    kept.push(ev);
  }
  const rec = createRecorder();
  for (const ev of kept) rec.push(ev);
  return rec.entries;
}

/**
 * 初期状態から履歴を再生して最終状態を求める。
 * 途中終了の記録がなければ、最後の色のまま発見またはクリアまで進める。
 */
export function replayHistory(game, entries, { collectEvents = false } = {}) {
  const decoded = decodeHistory(entries, { rules: game.rules });
  if (decoded.error) return { error: decoded.error, index: decoded.index };
  let state = initialState(game);
  const emitted = [];
  for (const ev of decoded.events) {
    const r = advance(state, ev, game);
    state = r.state;
    if (collectEvents) emitted.push(...r.events);
    if (state.status !== 'playing') break;
  }
  if (state.status === 'playing') {
    const r = advance(state, { type: 'tick', t: totalMs(game.rules) }, game);
    state = r.state;
    if (collectEvents) emitted.push(...r.events);
  }
  return { state, summary: summarize(state, game.rules), events: emitted };
}

/** 端末で進行中の状態を、履歴から作り直す（保存の検算用）。 */
export function stateFromHistory(game, entries, untilT) {
  const decoded = decodeHistory(entries, { rules: game.rules });
  if (decoded.error) return { error: decoded.error };
  let state = initialState(game);
  for (const ev of decoded.events) {
    state = advance(state, ev, game).state;
    if (state.status !== 'playing') break;
  }
  if (state.status === 'playing' && untilT != null && untilT > state.t) {
    state = advance(state, { type: 'tick', t: untilT }, game).state;
  }
  return { state };
}
