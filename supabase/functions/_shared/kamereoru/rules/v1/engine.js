// 本編の判定エンジン。ゲーム内時刻（1ミリ秒の整数）と色の入力だけから、
// 警戒・建物平均・通過・得点・発見・クリアを決める。描画速度・音・端末の現在時刻は使わない。
//
// 同じ時刻に複数の処理が重なるときの順番（端末と検証処理で共通）：
//   1. 直前までの積算（一致度×時間、警戒の増減）
//   2. 発見の確定（警戒100）
//   3. 評価区間の終了 → 通過の確定 → 評価区間の開始
//   4. 受信順の入力（色の変更・途中終了）
import { RULES_V1 } from './config.js';
import { classifyMatch, divRoundHalfUp, isValidHsv, matchUnits as defaultMatchUnits } from './color.js';
import { makeCourse } from './course.js';

/**
 * 1プレイ分の判定の前提（ルール・出題・一致度の関数）。
 * matchFn は試験で一致度を直接与えるために差し替えられる。
 */
export function createGame({ seed, rules = RULES_V1, course = null, matchFn = null } = {}) {
  const courseData = course ?? makeCourse(seed, rules.generatorVersion, { rules });
  return Object.freeze({
    rules,
    course: courseData,
    matchFn: matchFn ?? ((body, wall) => defaultMatchUnits(body, wall, rules)),
  });
}

export function totalMs(rules = RULES_V1) {
  return rules.buildingCount * rules.buildingMs;
}

export function initialState(game) {
  const { rules } = game;
  return {
    rulesVersion: rules.rulesVersion,
    seed: game.course.seed,
    t: 0,
    status: 'playing',
    endReason: null,
    endT: null,
    color: { ...rules.initialColor },
    alert: 0,
    evalBuilding: 0, // 評価中の棟（0は猶予中）
    matchUnits: null, // 評価中の瞬間一致度
    acc: null, // 評価中の積算 { matchSum, evalMs }
    closed: null, // 評価を締めて通過待ちの棟
    passed: 0,
    buildings: [],
    combo: 0,
    maxCombo: 0,
    score: { pass: 0, accuracy: 0, combo: 0, clear: 0, total: 0 },
    brightnessUnlocked: false,
    reached20: false,
    inputs: 0,
    violations: [],
  };
}

export function cloneState(s) {
  return {
    ...s,
    color: { ...s.color },
    acc: s.acc && { ...s.acc },
    closed: s.closed && { ...s.closed },
    buildings: s.buildings.slice(),
    score: { ...s.score },
    violations: s.violations.slice(),
  };
}

/** 時刻 t がどの棟の何ミリ秒目か。 */
export function positionAt(t, rules = RULES_V1) {
  const index = Math.floor(t / rules.buildingMs) + 1;
  const offset = t - (index - 1) * rules.buildingMs;
  return { index, offset };
}

/** 時刻 t が評価区間内か（開始を含み、終了を含まない）。 */
export function isEvalTime(t, rules = RULES_V1) {
  if (t < 0 || t >= totalMs(rules)) return false;
  const { offset } = positionAt(t, rules);
  return offset >= rules.evalStartMs && offset < rules.evalEndMs;
}

function nextBoundaryAfter(t, rules) {
  const { index, offset } = positionAt(t, rules);
  const base = (index - 1) * rules.buildingMs;
  if (offset < rules.evalStartMs) return base + rules.evalStartMs;
  if (offset < rules.evalEndMs) return base + rules.evalEndMs;
  return base + rules.buildingMs;
}

function rateFor(units, rules) {
  return rules.alert.ratePerMs[classifyMatch(units, rules)];
}

function comboBonusFor(combo, rules) {
  for (const [min, points] of rules.score.comboTiers) {
    if (combo >= min) return points;
  }
  return 0;
}

function end(s, reason, out) {
  s.status = reason;
  s.endReason = reason;
  s.endT = s.t;
  s.evalBuilding = 0;
  s.matchUnits = null;
  s.acc = null;
  out.push({ type: reason, t: s.t, passed: s.passed });
}

function passBuilding(s, index, game, out) {
  const { rules } = game;
  const closed = s.closed;
  if (!closed || closed.building !== index) {
    s.violations.push({ t: s.t, code: 'pass_without_eval', building: index });
    return;
  }
  const S = closed.matchSum;
  const E = closed.evalMs;
  const success = S >= rules.score.comboMinUnits * E;
  const combo = success ? s.combo + 1 : 0;
  const accuracy = divRoundHalfUp(rules.score.accuracyMax * S, E * 100 * rules.match.unitsPerPercent);
  const comboBonus = success ? comboBonusFor(combo, rules) : 0;
  const points = rules.score.pass + accuracy + comboBonus;
  s.closed = null;
  s.combo = combo;
  s.maxCombo = Math.max(s.maxCombo, combo);
  s.passed = index;
  s.buildings.push({ index, matchSum: S, evalMs: E, success, accuracy, comboBonus, combo, points });
  s.score.pass += rules.score.pass;
  s.score.accuracy += accuracy;
  s.score.combo += comboBonus;
  s.score.total += points;
  out.push({ type: 'pass', t: s.t, building: index, success, accuracy, comboBonus, combo, points });
  if (index === rules.buildingCount) {
    s.score.clear = rules.score.clearBonus;
    s.score.total += rules.score.clearBonus;
    end(s, 'cleared', out);
  }
}

function processPoint(s, game, out) {
  const { rules } = game;
  // 2. 発見
  if (s.evalBuilding > 0 && s.alert >= rules.alert.maxUnits) {
    end(s, 'detected', out);
    return;
  }
  const { index, offset } = positionAt(s.t, rules);
  // 3a. 評価区間の終了
  if (offset === rules.evalEndMs && s.evalBuilding === index) {
    s.closed = { building: index, matchSum: s.acc.matchSum, evalMs: s.acc.evalMs };
    s.evalBuilding = 0;
    s.matchUnits = null;
    s.acc = null;
    out.push({ type: 'evalEnd', t: s.t, building: index });
    if (index === rules.brightnessUnlockBuilding - 1 && !s.brightnessUnlocked) {
      s.brightnessUnlocked = true;
      out.push({ type: 'unlockBrightness', t: s.t });
    }
  }
  // 3b. 出口の通過（index は次の棟。出口を越えたのは index-1）
  if (offset === 0 && s.t > 0) {
    const leaving = index - 1;
    passBuilding(s, leaving, game, out);
    if (s.status !== 'playing') return;
    if (index === rules.brightnessUnlockBuilding && !s.reached20) {
      s.reached20 = true;
      out.push({ type: 'reachUnlockBuilding', t: s.t, building: index });
    }
    out.push({ type: 'enterBuilding', t: s.t, building: index });
  }
  // 3c. 評価区間の開始
  if (offset === rules.evalStartMs) {
    s.evalBuilding = index;
    s.acc = { matchSum: 0, evalMs: 0 };
    s.matchUnits = game.matchFn(s.color, game.course.targets[index - 1]);
    out.push({ type: 'evalStart', t: s.t, building: index });
  }
}

/** 時刻 T まで進める（入力なし）。 */
function advanceTo(s, T, game, out) {
  const { rules } = game;
  const maxUnits = rules.alert.maxUnits;
  while (s.status === 'playing' && s.t < T) {
    let next = Math.min(T, nextBoundaryAfter(s.t, rules));
    if (s.evalBuilding > 0) {
      const rate = rateFor(s.matchUnits, rules);
      if (rate > 0) next = Math.min(next, s.t + Math.ceil((maxUnits - s.alert) / rate));
      const dt = next - s.t;
      s.acc.matchSum += s.matchUnits * dt;
      s.acc.evalMs += dt;
      s.alert = Math.min(maxUnits, Math.max(0, s.alert + rate * dt));
    }
    s.t = next;
    processPoint(s, game, out);
  }
}

/**
 * 1つの出来事を処理し、次の状態と確定した出来事を返す（元の状態は変更しない）。
 * event: { type: 'tick' | 'color' | 'quit' | 'pause' | 'resume', t, h?, s?, v? }
 */
export function advance(state, event, game) {
  const s = cloneState(state);
  const out = [];
  if (s.status !== 'playing') return { state: s, events: out };
  if (!Number.isInteger(event.t) || event.t < s.t) {
    s.violations.push({ t: s.t, code: 'time_backwards', at: event.t });
    return { state: s, events: out };
  }
  advanceTo(s, event.t, game, out);
  if (s.status !== 'playing') return { state: s, events: out };
  switch (event.type) {
    case 'tick':
    case 'pause':
    case 'resume':
      break;
    case 'color': {
      const c = { h: event.h, s: event.s, v: event.v };
      if (!isValidHsv(c, game.rules)) {
        s.violations.push({ t: s.t, code: 'color_range' });
        break;
      }
      if (!s.brightnessUnlocked && c.v !== game.rules.valMax) {
        s.violations.push({ t: s.t, code: 'locked_brightness' });
        c.v = game.rules.valMax;
      }
      s.color = c;
      s.inputs += 1;
      if (s.evalBuilding > 0) s.matchUnits = game.matchFn(s.color, game.course.targets[s.evalBuilding - 1]);
      break;
    }
    case 'quit':
      end(s, 'quit', out);
      break;
    default:
      s.violations.push({ t: s.t, code: 'unknown_event' });
  }
  return { state: s, events: out };
}

/** 判定エンジンの外から見た、現在の段階。 */
export function phaseOf(state, rules = RULES_V1) {
  if (state.status !== 'playing') return 'ended';
  return state.evalBuilding > 0 ? 'eval' : 'grace';
}

/** 現在の棟（1〜50）。 */
export function currentBuilding(state, rules = RULES_V1) {
  return Math.min(rules.buildingCount, positionAt(state.t, rules).index);
}

// ---- 平均と順位用の値 ----
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x;
}

/**
 * 通過棟の建物平均（丸め前）の平均を分数で返す。単位は一致度の整数単位（1%の100万分の1）。
 * 0棟なら null。
 */
export function meanFraction(buildings) {
  if (!buildings.length) return null;
  let num = 0n;
  let den = 1n;
  for (const b of buildings) {
    const n = BigInt(b.matchSum);
    const d = BigInt(b.evalMs);
    // num/den + n/d
    num = num * d + n * den;
    den *= d;
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  den *= BigInt(buildings.length);
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** 順位用の平均一致度（0.01%単位の整数）。全体平均を最後に1回だけ四捨五入する。 */
export function rankAverage(buildings, rules = RULES_V1) {
  const f = meanFraction(buildings);
  if (!f) return null;
  const scale = BigInt(rules.match.unitsPerPercent / rules.rankUnitsPerPercent); // 10,000
  const d = f.den * scale;
  return Number((2n * f.num + d) / (2n * d));
}

/** 建物平均（丸め前）を % の小数で返す（表示・調査用）。 */
export function buildingAveragePercent(b, rules = RULES_V1) {
  return b.matchSum / b.evalMs / rules.match.unitsPerPercent;
}

/** 0.01%単位の整数を「86.67」のような文字列にする。 */
export function formatRankAverage(value) {
  if (value == null) return '—';
  const whole = Math.floor(value / 100);
  const frac = String(value % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

/** 結果の要約。端末とサーバーで同じ項目を比べる。 */
export function summarize(state, rules = RULES_V1) {
  const mean = meanFraction(state.buildings);
  return {
    rulesVersion: state.rulesVersion,
    buildings: state.passed,
    rankAverage: rankAverage(state.buildings, rules),
    meanNum: mean ? mean.num.toString() : null,
    meanDen: mean ? mean.den.toString() : null,
    score: { ...state.score },
    maxCombo: state.maxCombo,
    endReason: state.endReason,
    endT: state.endT,
    perBuilding: state.buildings.map((b) => [b.matchSum, b.evalMs, b.points]),
  };
}
