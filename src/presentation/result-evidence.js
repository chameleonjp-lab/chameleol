// 結果の静止資料（最後の3コマ・壁と体の色・警戒グラフ・立て直し・最長成功）と、ベスト棟の実色を作る。
// 動く再生画面ではない。履歴を1回だけ読み直し、結果画面に必要な静止データだけを取り出す。
// - 正規の規則（src/rules/v1）は変えない。公開された advance だけで進め、規則の版ごとの値（rules.*）を使う。
// - 入力（履歴・元の成績・表示用の成績）は読むだけで、書き換えない。
// - 重い走査（analyzeResultHistory）は 1000件または4ms ごとに譲り、AbortSignal で止められる。
// - 軽い照合（reconcileResultEvidence）は、元の成績と表示用の成績（公式訂正後）への一致を確かめるだけ。
//   一致しない派生データは、その単位だけを利用不可にする。主成績の表示には関わらない。
import {
  advance,
  createGame,
  initialState,
  isValidSeed,
  positionAt,
  rulesForVersion,
  summarize,
  totalMs,
} from '../rules/v1/index.js';
import { applyVerifiedScore } from '../net/verified-score.js';

export const EVIDENCE_LIMITS = Object.freeze({
  maxHistory: 200000, // 入力の最大件数（decodeHistory と同じ）
  sliceItems: 1000, // 1回に処理する最大件数
  sliceMs: 4, // 1回に処理する最大時間
  maxCheckpoints: 320, // 同時に保持する完全な状態の最大数
  maxViolations: 32, // 規則違反がこれを超える履歴は、複製が重くなるので読まない
  maxPoints: 50, // 警戒グラフの最大点数
  maxMarks: 3, // 警戒グラフの印の最大数
});

const KIND_NAMES = ['color', 'pause', 'resume', 'quit'];
const RECOVERY_FROM_PERCENT = 70; // 最大警戒の70%以上
const RECOVERY_TO_PERCENT = 35; // 35%以下へ戻る

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const copyHsv = (c) => ({ h: c.h, s: c.s, v: c.v });
const defaultNow = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());
const defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));
const unavailable = (reason) => ({ available: false, reason, raw: null });

/** 走査を途中でやめる（中断・上限超え・不正な履歴）。外へは { available:false, reason } で返す。 */
class Stop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// ---- 小さな純関数 ----

/** 評価区間・猶予・棟の終わりの次の境目（エンジンの境目と同じ）。 */
function nextBoundaryAfter(t, rules) {
  const { index, offset } = positionAt(t, rules);
  const base = (index - 1) * rules.buildingMs;
  if (offset < rules.evalStartMs) return base + rules.evalStartMs;
  if (offset < rules.evalEndMs) return base + rules.evalEndMs;
  return base + rules.buildingMs;
}

/** 警察の人数（0〜2）。登場と退場に幅を持たせる（game/feedback.js の createAlertStageTracker と同じ規則）。 */
export function policeStageStep(stage, alertUnits, rules) {
  const stages = rules.alert.stages;
  let s = stage;
  while (s < stages.length && alertUnits >= stages[s].enterAt) s += 1;
  while (s > 0 && alertUnits < stages[s - 1].exitBelow) s -= 1;
  return s;
}

/** 入力の並びを無視して、JSON として同じ内容か（キーの順は問わない）。 */
export function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!sameJson(a[i], b[i])) return false;
    return true;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(b, key) || !sameJson(a[key], b[key])) return false;
  }
  return true;
}

/** ある区間（prev→cur。途中に境目・入力がない）での、時刻 m の警戒。advance は元の状態を変えない。 */
const alertAt = (prev, m, game) => advance(prev, { type: 'tick', t: m }, game).state.alert;

/** pred が最初に真になる整数ミリ秒（prev.t では偽、cur.t では真。区間内で警戒は単調）。 */
function firstTimeWhere(prev, cur, pred, game) {
  let lo = prev.t;
  let hi = cur.t;
  while (hi - lo > 1) {
    const mid = lo + ((hi - lo) >> 1);
    if (pred(alertAt(prev, mid, game))) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** pred が最後に真だった整数ミリ秒（prev.t では真、cur.t では偽）。 */
function lastTimeWhere(prev, cur, pred, game) {
  let lo = prev.t;
  let hi = cur.t;
  while (hi - lo > 1) {
    const mid = lo + ((hi - lo) >> 1);
    if (pred(alertAt(prev, mid, game))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 区間（prev→cur）の中の時刻 m の状態。m が区間の始まりなら prev そのもの。 */
const stateInStep = (prev, m, game) => (m <= prev.t ? prev : advance(prev, { type: 'tick', t: m }, game).state);

// ---- 重い走査 ----

/**
 * 履歴を1回だけ読み直して、静止資料の素になるデータ（raw）を作る。表示用の成績は使わない。
 * input: { rulesVersion, generatorVersion, seed, history, endedAtT, targets, originalSummary }
 * 返り値: { available, reason, raw }。失敗は例外にせず available:false で返す。
 */
export async function analyzeResultHistory(input, { signal = null, onYield = defaultYield, now = defaultNow } = {}) {
  try {
    return await scanHistory(input, { signal, onYield, now });
  } catch (error) {
    if (error instanceof Stop) return unavailable(error.reason);
    return unavailable('analysis_error');
  }
}

function precheck(input) {
  if (!isObject(input)) return { reason: 'no_input' };
  const rules = typeof input.rulesVersion === 'string' ? rulesForVersion(input.rulesVersion) : null;
  if (!rules) return { reason: 'unknown_rules' };
  if (input.generatorVersion !== rules.generatorVersion) return { reason: 'unknown_generator' };
  if (!isValidSeed(input.seed)) return { reason: 'invalid_seed' };
  const total = totalMs(rules);
  if (!Number.isInteger(input.endedAtT) || input.endedAtT < 0 || input.endedAtT > total) return { reason: 'invalid_end' };
  if (!isObject(input.originalSummary)) return { reason: 'no_summary' };
  if (!Array.isArray(input.history)) return { reason: 'history_not_array' };
  if (input.history.length > EVIDENCE_LIMITS.maxHistory) return { reason: 'history_too_long' };
  if (!Array.isArray(input.targets) || input.targets.length < rules.buildingCount) return { reason: 'course_mismatch' };
  return { rules };
}

async function scanHistory(input, { signal, onYield, now }) {
  if (signal?.aborted) throw new Stop('aborted');
  const pre = precheck(input);
  if (pre.reason) throw new Stop(pre.reason);
  const { rules } = pre;
  const total = totalMs(rules);
  const endedAtT = input.endedAtT;
  const history = input.history;
  const stats = { items: 0, slices: 0, maxSliceItems: 0, maxSliceMs: 0, steps: 0, entries: history.length, maxHeldStates: 0 };

  // ---- 分割と中断 ----
  let sliceStart = now();
  let sliceItems = 0;
  const flushSlice = async () => {
    const ms = now() - sliceStart;
    stats.slices += 1;
    stats.maxSliceItems = Math.max(stats.maxSliceItems, sliceItems);
    stats.maxSliceMs = Math.max(stats.maxSliceMs, ms);
    await onYield({ items: sliceItems, ms });
    if (signal?.aborted) throw new Stop('aborted');
    sliceStart = now();
    sliceItems = 0;
  };
  /** 1件ぶんの仕事を数える。1000件または4msで、呼び出し側へ制御を返す。 */
  const work = async () => {
    stats.items += 1;
    sliceItems += 1;
    if (sliceItems >= EVIDENCE_LIMITS.sliceItems || now() - sliceStart >= EVIDENCE_LIMITS.sliceMs) await flushSlice();
  };

  // 出題の再生成は1回の重い処理（数ms）。前後で譲る。
  const game = createGame({ seed: input.seed, rules });
  await flushSlice();
  for (let i = 0; i < rules.buildingCount; i += 1) {
    const a = input.targets[i];
    const b = game.course.targets[i];
    if (!isObject(a) || a.h !== b.h || a.s !== b.s || a.v !== b.v) throw new Stop('course_mismatch');
  }
  const targets = game.course.targets.slice(0, rules.buildingCount).map(copyHsv);

  // ---- 問い合わせの時刻（E072 の3コマ・E084 の点）----
  const frameTimes = [Math.max(0, endedAtT - 2000), Math.max(0, endedAtT - 1000), endedAtT];
  const pointTimes = [];
  for (let b = 1; b <= rules.buildingCount; b += 1) {
    const t = b * rules.buildingMs;
    if (t > endedAtT) break;
    pointTimes.push(t);
  }
  pointTimes.push(endedAtT);
  const queries = [...new Set([...frameTimes, ...pointTimes])].sort((x, y) => x - y);
  const answers = new Map(); // 時刻 → Frame（その時刻までの入力をすべて適用した後の状態）
  let nextQuery = 0;

  // ---- 走査の状態 ----
  const alertMax = rules.alert.maxUnits;
  const hiUnits = Math.floor((alertMax * RECOVERY_FROM_PERCENT) / 100);
  const loUnits = Math.floor((alertMax * RECOVERY_TO_PERCENT) / 100);
  let state = initialState(game);
  let stage = 0; // 警察の人数
  const stageTimes = []; // 初めて stage k+1 になった時刻と棟
  let peak = { alertUnits: 0, t: 0 };
  const best = new Array(rules.buildingCount + 1).fill(null); // 棟ごとの最高瞬間一致度の区間
  let hiSeen = false;
  let lastHi = null; // 70%以上だった最後の時刻の手がかり
  let recovery = null;
  let endMatchUnits = null; // 終了の瞬間に評価中だった時の瞬間一致度（E076 に添える）
  /** 同時に保持する完全な状態：今の状態・直前の状態・70%以上だった最後の手がかり（最大2）。 */
  const noteHeld = () => {
    const held = 2 + (lastHi ? (lastHi.descendingTo ? 2 : 1) : 0);
    stats.maxHeldStates = Math.max(stats.maxHeldStates, held);
    if (held > EVIDENCE_LIMITS.maxCheckpoints) throw new Stop('checkpoint_limit');
  };

  const frameOf = (s, t, policeStage) => {
    const building = Math.min(rules.buildingCount, positionAt(t, rules).index);
    return {
      t,
      building,
      phase: s.status !== 'playing' ? 'ended' : s.evalBuilding > 0 ? 'eval' : 'grace',
      bodyHsv: copyHsv(s.color),
      wallHsv: copyHsv(targets[building - 1]),
      alertUnits: s.alert,
      maxAlertUnits: alertMax,
      policeStage,
      matchUnits: s.matchUnits ?? null,
    };
  };

  /** 区間（prev→cur）の集計。区間の中で色・一致度・評価棟は prev の値で一定。 */
  const afterStep = (prev, cur) => {
    stats.steps += 1;
    noteHeld();
    if (cur.status !== 'playing') endMatchUnits = prev.evalBuilding > 0 ? prev.matchUnits ?? null : null;
    // 実色（visualSamples の素）：評価中で、正の時間を持つ区間だけ。厳密に大きい時だけ置き換える（同率は早い区間）。
    if (prev.evalBuilding > 0 && cur.t > prev.t && prev.matchUnits != null) {
      const b = prev.evalBuilding;
      const current = best[b];
      if (!current || prev.matchUnits > current.matchUnits) {
        best[b] = { building: b, hsv: copyHsv(prev.color), matchUnits: prev.matchUnits, from: prev.t, to: cur.t };
      }
    }
    if (cur.t === prev.t) return;
    const stageBefore = stage;
    stage = policeStageStep(stageBefore, cur.alert, rules);
    // 警察の登場（初めて各段階に上がった時刻）。区間内で警戒は単調なので、境目は二分探索で求める。
    for (let k = stageBefore + 1; k <= stage; k += 1) {
      if (stageTimes[k - 1]) continue;
      const enterAt = rules.alert.stages[k - 1].enterAt;
      const t = firstTimeWhere(prev, cur, (a) => a >= enterAt, game);
      stageTimes[k - 1] = { kind: k === 1 ? 'police1' : 'police2', t, building: Math.min(rules.buildingCount, positionAt(t, rules).index), alertUnits: alertAt(prev, t, game) };
    }
    if (cur.alert > peak.alertUnits) peak = { alertUnits: cur.alert, t: cur.t };
    // 立て直し（最大警戒の70%以上から、35%以下へ戻った最初の1組）
    if (recovery) return;
    if (cur.alert >= hiUnits) {
      hiSeen = true;
      lastHi = { state: cur, t: cur.t, stage };
    } else if (prev.alert >= hiUnits) {
      hiSeen = true; // 区間の途中で70%を下回った。最後の時刻は、必要になった時に求める
      lastHi = { state: prev, descendingTo: cur, stage: stageBefore };
    }
    if (hiSeen && cur.alert <= loUnits && prev.alert > loUnits) {
      const afterT = firstTimeWhere(prev, cur, (a) => a <= loUnits, game);
      let beforeState;
      let beforeT;
      if (lastHi.descendingTo) {
        beforeT = lastTimeWhere(lastHi.state, lastHi.descendingTo, (a) => a >= hiUnits, game);
        beforeState = stateInStep(lastHi.state, beforeT, game);
      } else {
        beforeT = lastHi.t;
        beforeState = lastHi.state;
      }
      const afterState = stateInStep(prev, afterT, game);
      const afterStage = policeStageStep(stageBefore, afterState.alert, rules);
      recovery = { before: frameOf(beforeState, beforeT, lastHi.stage), after: frameOf(afterState, afterT, afterStage) };
    }
  };

  /** 問い合わせの時刻に、状態を記録する。 */
  const record = (q) => {
    answers.set(q, frameOf(state, q, stage));
  };

  /** 時刻 x まで（境目ごとに区切って）進める。 */
  const advanceTo = async (x) => {
    while (state.status === 'playing' && state.t < x) {
      const target = Math.min(x, nextBoundaryAfter(state.t, rules));
      const prev = state;
      const cur = advance(prev, { type: 'tick', t: target }, game).state;
      state = cur;
      afterStep(prev, cur);
      await work();
    }
  };
  /** 時刻が q 未満の問い合わせを、先に記録する。 */
  const answerBefore = async (limit) => {
    while (nextQuery < queries.length && queries[nextQuery] < limit) {
      await advanceTo(queries[nextQuery]);
      record(queries[nextQuery]);
      nextQuery += 1;
    }
  };

  // ---- 履歴を1件ずつ検証して進める（decodeHistory と同じ条件・同じ順・同じエラー名）----
  let t = 0;
  let stopAdvancing = false;
  let pendingFailure = null;
  const horizon = total + 60000;
  for (let i = 0; i < history.length; i += 1) {
    const entry = history[i];
    if (!Array.isArray(entry) || entry.length < 2) throw new Stop('history_entry_shape');
    const kind = entry[0];
    const dt = entry[1];
    if (!Number.isInteger(kind) || kind < 0 || kind > 3) throw new Stop('history_entry_kind');
    if (!Number.isInteger(dt) || dt < 0) throw new Stop('history_time_backwards');
    t += dt;
    if (t > horizon) throw new Stop('history_time_range');
    let event;
    if (kind === 0) {
      if (entry.length !== 5 || !Number.isInteger(entry[2]) || !Number.isInteger(entry[3]) || !Number.isInteger(entry[4])) throw new Stop('history_entry_shape');
      event = { type: 'color', t, h: entry[2], s: entry[3], v: entry[4] };
    } else {
      if (entry.length !== 2) throw new Stop('history_entry_shape');
      event = { type: KIND_NAMES[kind], t };
    }
    if (!stopAdvancing && state.status === 'playing') {
      await answerBefore(event.t);
      await advanceTo(event.t);
      if (state.status === 'playing') {
        const prev = state;
        state = advance(prev, event, game).state;
        if (state.status !== 'playing') endMatchUnits = prev.evalBuilding > 0 ? prev.matchUnits ?? null : null;
        if (state.violations.length > EVIDENCE_LIMITS.maxViolations) {
          stopAdvancing = true;
          pendingFailure = 'history_violations';
        }
      }
    }
    await work();
  }
  if (pendingFailure) throw new Stop(pendingFailure);

  // 残りの問い合わせ → 最後まで進める（終了の記録がなければ、最後の色のまま発見またはクリアまで）
  while (nextQuery < queries.length) {
    await advanceTo(queries[nextQuery]);
    record(queries[nextQuery]);
    nextQuery += 1;
  }
  await advanceTo(total);
  if (state.status === 'playing') throw new Stop('summary_mismatch');

  // ---- 段階A：元の成績と一致するか（一致しなければ、すべて利用不可）----
  const rebuilt = summarize(state, rules);
  if (!sameJson(rebuilt, input.originalSummary) || state.endT !== endedAtT) throw new Stop('summary_mismatch');

  const passed = state.buildings.length;
  const raw = {
    rulesVersion: rules.rulesVersion,
    generatorVersion: rules.generatorVersion,
    seed: input.seed,
    endedAtT,
    endReason: state.endReason,
    endT: state.endT,
    passed,
    alertMaxUnits: alertMax,
    targets,
    perBuilding: state.buildings.map((b) => [b.matchSum, b.evalMs]),
    queries: queries.map((q) => answers.get(q)),
    frameTimes,
    pointTimes: [...new Set(pointTimes)],
    endMatchUnits,
    stageMarks: stageTimes.filter(Boolean),
    peak: { alertUnits: peak.alertUnits, t: peak.t, building: Math.min(rules.buildingCount, positionAt(peak.t, rules).index) },
    recovery,
    samples: best.slice(1, passed + 1).filter(Boolean),
    stats,
  };
  return { available: true, reason: null, raw };
}

// ---- 軽い照合 ----

const part = (reason) => ({ available: false, reason });
const cloneFrame = (f) => ({ ...f, bodyHsv: copyHsv(f.bodyHsv), wallHsv: copyHsv(f.wallHsv) });

/**
 * 走査の結果（raw）を、表示用の成績（公式訂正後。省略時は元の成績と同じ）へ照合して、結果画面に出すデータにする。
 * 一致しない派生データは、その単位だけを利用不可にする。同期で終わる軽い処理。
 */
export function reconcileResultEvidence(raw, { displaySummary = null, revision = 0 } = {}) {
  if (!isObject(raw) || !Array.isArray(raw.queries)) return { available: false, reason: 'no_raw', data: null, revision };
  const ds = isObject(displaySummary) ? displaySummary : null;
  const rules = rulesForVersion(raw.rulesVersion);
  if (!rules) return { available: false, reason: 'unknown_rules', data: null, revision };

  // 段階B：表示成績の骨格（棟数・終わり方・終了時刻・版）が走査と同じか
  const skeletonOk = ds === null
    || (ds.rulesVersion === raw.rulesVersion && ds.buildings === raw.passed && ds.endReason === raw.endReason && ds.endT === raw.endT);
  const byTime = new Map(raw.queries.map((frame) => [frame.t, frame]));
  const frameAt = (t) => (byTime.has(t) ? cloneFrame(byTime.get(t)) : null);

  const data = {
    frames3: part('display_mismatch'),
    finalColors: part('display_mismatch'),
    alertPoints: part('display_mismatch'),
    alertMarks: part('display_mismatch'),
    recovery: part('display_mismatch'),
    longestStreak: null,
    visualSamples: [],
    sampleIssues: [],
  };

  if (skeletonOk) {
    const frames = raw.frameTimes.map(frameAt);
    data.frames3 = frames.every(Boolean) ? { available: true, reason: null, frames } : part('no_frame');
    const last = frames[2];
    data.finalColors = last
      ? { available: true, reason: null, t: last.t, building: last.building, bodyHsv: last.bodyHsv, wallHsv: last.wallHsv, matchUnits: raw.endMatchUnits ?? null }
      : part('no_frame');
    const points = raw.pointTimes.map(frameAt).filter(Boolean).map((f) => ({ t: f.t, building: f.building, alertUnits: f.alertUnits, policeStage: f.policeStage }));
    data.alertPoints = points.length
      ? { available: true, reason: null, maxAlertUnits: raw.alertMaxUnits, peakAlertUnits: raw.peak.alertUnits, peakT: raw.peak.t, peakBuilding: raw.peak.building, points }
      : part('no_frame');
    if (raw.recovery) {
      data.recovery = { available: true, reason: null, before: cloneFrame(raw.recovery.before), after: cloneFrame(raw.recovery.after) };
    } else {
      data.recovery = part('none');
    }
    const marks = raw.stageMarks.map((m) => ({ ...m }));
    if (raw.recovery) marks.push({ kind: 'recovery', t: raw.recovery.after.t, building: raw.recovery.after.building, alertUnits: raw.recovery.after.alertUnits });
    marks.sort((a, b) => a.t - b.t);
    data.alertMarks = { available: true, reason: null, marks: marks.slice(0, EVIDENCE_LIMITS.maxMarks) };
  }

  // 段階C：棟ごとに、表示成績の棟の合計（matchSum・evalMs）が走査と同じ棟の実色だけを残す
  const perBuilding = ds === null ? raw.perBuilding : ds.perBuilding;
  const rowOf = (building) => (Array.isArray(perBuilding) && Array.isArray(perBuilding[building - 1]) ? perBuilding[building - 1] : null);
  const sampleByBuilding = new Map();
  for (const sample of raw.samples) {
    const row = rowOf(sample.building);
    const scan = raw.perBuilding[sample.building - 1];
    if (row && scan && row[0] === scan[0] && row[1] === scan[1]) {
      sampleByBuilding.set(sample.building, sample);
      data.visualSamples.push({ building: sample.building, hsv: copyHsv(sample.hsv), matchUnits: sample.matchUnits, from: sample.from, to: sample.to });
    } else {
      data.sampleIssues.push({ building: sample.building, reason: 'display_mismatch' });
    }
  }

  data.longestStreak = longestStreakOf(raw, rules, perBuilding, sampleByBuilding);
  return { available: true, reason: null, data, revision };
}

/** E087：棟の平均実値（丸め前）が85%以上の棟が続く、最長の区間（同率は早い区間）。 */
function longestStreakOf(raw, rules, perBuilding, sampleByBuilding) {
  if (!Array.isArray(perBuilding) || perBuilding.length < raw.passed) return part('no_per_building');
  const min = rules.score.comboMinUnits;
  let bestRun = null;
  let from = 0;
  for (let b = 1; b <= raw.passed + 1; b += 1) {
    let ok = false;
    if (b <= raw.passed) {
      const row = perBuilding[b - 1];
      if (!Array.isArray(row) || !Number.isSafeInteger(row[0]) || !Number.isSafeInteger(row[1]) || row[1] <= 0) return part('display_invalid');
      ok = BigInt(row[0]) >= BigInt(min) * BigInt(row[1]);
    }
    if (ok) {
      if (!from) from = b;
    } else if (from) {
      const length = b - from;
      if (!bestRun || length > bestRun.length) bestRun = { from, to: b - 1, length };
      from = 0;
    }
  }
  if (!bestRun) return part('none');
  const buildings = [];
  for (let b = bestRun.from; b <= bestRun.to; b += 1) {
    const sample = sampleByBuilding.get(b);
    buildings.push({ building: b, wallHsv: copyHsv(raw.targets[b - 1]), bodyHsv: sample ? copyHsv(sample.hsv) : null, matchSum: perBuilding[b - 1][0], evalMs: perBuilding[b - 1][1] });
  }
  return { available: true, reason: null, from: bestRun.from, to: bestRun.to, length: bestRun.length, buildings };
}

/** 重い走査と軽い照合をまとめて行う。 */
export async function prepareResultEvidence(input, { signal = null, onYield, revision = 0, now } = {}) {
  const analysis = await analyzeResultHistory(input, { signal, onYield, now });
  if (!analysis.available) return { available: false, reason: analysis.reason, data: null, revision };
  return reconcileResultEvidence(analysis.raw, { displaySummary: input.displaySummary ?? null, revision });
}

// ---- 結果ごとの持ち物（lastResult.evidence）----

/**
 * 結果画面の解析を始める（最初の1回だけ。言語の描き直し・再表示では始め直さない）。
 * result.evidenceInput が無ければ（保存済みの過去結果・中断）、解析せず null を返す＝「記録なし」。
 */
export function startResultEvidence(result, { onYield, now } = {}) {
  if (!result || !result.evidenceInput) return null;
  if (result.evidence) return result.evidence;
  const controller = new AbortController();
  const listeners = new Set();
  const evidence = {
    status: 'pending',
    reason: null,
    raw: null,
    controller,
    revision: 0,
    signature: null,
    view: null,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  result.evidence = evidence;
  const notify = () => {
    for (const fn of [...listeners]) {
      try { fn(evidence); } catch { /* 表示側の失敗で解析の持ち主を壊さない */ }
    }
  };
  analyzeResultHistory(result.evidenceInput, { signal: controller.signal, onYield, now }).then((analysis) => {
    // 遅い結果は捨てる（結果が替わった・解放された・中断された）
    if (result.evidence !== evidence || controller.signal.aborted) return;
    if (analysis.available) {
      evidence.status = 'ready';
      evidence.raw = analysis.raw;
    } else {
      evidence.status = 'failed';
      evidence.reason = analysis.reason;
    }
    notify();
  }, () => {
    if (result.evidence !== evidence || controller.signal.aborted) return;
    evidence.status = 'failed';
    evidence.reason = 'analysis_error';
    notify();
  });
  return evidence;
}

/**
 * 今の表示成績（公式訂正を反映）に照合した、画面用の資料の状態。
 * { status:'missing'|'pending'|'failed'|'ready', reason, data, revision }
 * 表示成績が変わった時（公式訂正など）は revision を増やし、照合だけをやり直す（走査はやり直さない）。
 */
export function resolveResultEvidence(result) {
  const evidence = result?.evidence;
  if (!result || !result.evidenceInput || !evidence) return { status: 'missing', reason: 'no_history', data: null, revision: 0 };
  if (evidence.status === 'pending') return { status: 'pending', reason: null, data: null, revision: evidence.revision };
  if (evidence.status === 'failed') return { status: 'failed', reason: evidence.reason, data: null, revision: evidence.revision };
  let signature;
  try { signature = JSON.stringify(result.verifiedScore ?? null); } catch { signature = 'unserializable'; }
  if (evidence.view === null || evidence.signature !== signature) {
    if (evidence.view !== null) evidence.revision += 1;
    evidence.signature = signature;
    let displaySummary = null;
    try { displaySummary = applyVerifiedScore(result.summary, result.verifiedScore); } catch { displaySummary = null; }
    const reconciled = reconcileResultEvidence(evidence.raw, { displaySummary, revision: evidence.revision });
    evidence.view = reconciled.available
      ? { status: 'ready', reason: null, data: reconciled.data, revision: reconciled.revision }
      : { status: 'failed', reason: reconciled.reason, data: null, revision: reconciled.revision };
  }
  return evidence.view;
}

/** 結果を離れる時に、解析を止めて表示専用の入力を手放す。 */
export function releaseResultEvidence(result) {
  if (!result) return;
  try { result.evidence?.controller?.abort(); } catch { /* ignore */ }
  result.evidence = null;
  result.evidenceInput = null;
}

/**
 * finishPlay で、session を捨てる前に確保する表示専用の入力（履歴は参照だけ。大量のコピーは作らない）。
 * 秘密・snapshot 全体・名前は含めない。形が足りない session（試験用の代用品など）では null を返し、「記録なし」になる。
 */
export function captureEvidenceBase(session, targets) {
  try {
    const entries = session.recorder.entries;
    if (!Array.isArray(entries)) return null;
    return {
      rulesVersion: session.meta.rulesVersion,
      generatorVersion: session.meta.generatorVersion,
      seed: session.meta.seed,
      history: entries,
      endedAtT: session.state.endT ?? session.state.t,
      targets,
    };
  } catch {
    return null;
  }
}
