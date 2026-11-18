// 練習モード。1回3問、時間制限なし。本編と同じ一致度の判定を使い、練習だけ甘くしない。
// - 基本練習：パレットだけ（明るさ100%）。明るさ練習：バーも使う（本編20棟到達で解放）。
// - 1問目は緑・明るさ100%から。次の問題は直前の色と部品の位置を引き継ぐ。
// - 出題時点の体色がすでに成功域にある候補は選ばない（何もしなくても成功しない）。
// - 成功を約0.5秒保つと成功を確定。最初の成功時間は固定し、最高一致度は問題が終わるまで更新する。
import { RULES_V1, classifyMatch, deltaEHsv, matchUnits } from '../rules/v1/index.js';
import { createRng } from '../rules/v1/course.js';

export const PRACTICE_KINDS = Object.freeze(['basic', 'brightness']);
export const DIFFICULTIES = Object.freeze(['easy', 'standard', 'hard']);
export const QUESTIONS = 3;

// 試作値。難しさは「直前の色からの色差」と「明るさの移動量」で分ける。
export const PRACTICE_CONFIG = Object.freeze({
  holdMs: 500,
  maxAttempts: 64,
  basic: {
    easy: { sat: [6000, 10000], dE: [25, 70], dv: [0, 0] },
    standard: { sat: [4000, 10000], dE: [15, 40], dv: [0, 0] },
    hard: { sat: [3000, 9000], dE: [10, 22], dv: [0, 0] },
  },
  brightness: {
    easy: { sat: [5000, 10000], dE: [15, 70], val: [6000, 9500], dv: [1000, 3000] },
    standard: { sat: [4000, 10000], dE: [12, 70], val: [3500, 9500], dv: [2000, 5000] },
    hard: { sat: [3000, 10000], dE: [10, 80], val: [2500, 10000], dv: [4000, 7500] },
  },
});

const within = (x, [lo, hi]) => x >= lo && x <= hi;

function fits(kind, cond, from, cand, rules) {
  if (!within(cand.s, cond.sat)) return false;
  if (kind === 'basic' && cand.v !== rules.valMax) return false;
  if (kind === 'brightness' && !within(cand.v, cond.val)) return false;
  if (!within(Math.abs(cand.v - from.v), cond.dv)) return false;
  if (!within(deltaEHsv(from, cand), cond.dE)) return false;
  // 何もしなくても成功になる出題を避ける
  return classifyMatch(matchUnits(from, cand, rules), rules) !== 'success';
}

/** 現在の体色 from から、その難しさの条件に合う目標色を選ぶ。 */
export function pickTarget(kind, difficulty, from, rng, { rules = RULES_V1, config = PRACTICE_CONFIG, rejectAllRandom = false } = {}) {
  const cond = config[kind][difficulty];
  for (let i = 0; i < config.maxAttempts; i += 1) {
    const cand = {
      h: rng.int(0, rules.hueSteps - 1),
      s: rng.int(cond.sat[0], cond.sat[1]),
      v: kind === 'basic' ? rules.valMax : rng.int(cond.val[0], cond.val[1]),
    };
    if (!rejectAllRandom && fits(kind, cond, from, cand, rules)) return { target: cand, fallback: false };
  }
  // 代替：同じ難しさの条件を満たす色を決まった順番で探す
  const mid = ([lo, hi]) => Math.round((lo + hi) / 2);
  const vals =
    kind === 'basic'
      ? [rules.valMax]
      : [from.v - mid(cond.dv), from.v + mid(cond.dv), from.v - cond.dv[0], from.v + cond.dv[0], from.v - cond.dv[1], from.v + cond.dv[1]].filter((v) => within(v, cond.val));
  for (const dh of [18000, 12000, 24000, 9000, 27000, 6000, 30000, 3000, 33000, 1500, 34500]) {
    for (const s of [mid(cond.sat), cond.sat[1], cond.sat[0]]) {
      for (const v of vals) {
        const cand = { h: (from.h + dh) % rules.hueSteps, s, v };
        if (fits(kind, cond, from, cand, rules)) return { target: cand, fallback: true };
      }
    }
  }
  throw new Error('no practice target');
}

/**
 * 練習1回分。時間は呼び出し側が tick(dtMs) で渡す（停止中・答え合わせ中は渡さない）。
 */
export function createPractice({ kind, seed, rules = RULES_V1, config = PRACTICE_CONFIG, startColor = null, rejectAllRandom = false }) {
  if (!PRACTICE_KINDS.includes(kind)) throw new Error('unknown practice kind');
  const rng = createRng(seed >>> 0, 0x9a7c);
  let color = { ...(startColor ?? rules.initialColor) };
  if (kind === 'basic') color.v = rules.valMax;
  const questions = [];
  let index = 0;
  let touched = false;
  let finished = false;

  function makeQuestion(i) {
    const { target, fallback } = pickTarget(kind, DIFFICULTIES[i], color, rng, { rules, config, rejectAllRandom });
    return {
      number: i + 1,
      difficulty: DIFFICULTIES[i],
      target,
      fallback,
      status: 'active', // active → succeeded／skipped（review）
      elapsedMs: 0,
      successSince: null,
      firstSuccessMs: null,
      bestMatch: matchUnits(color, target, rules),
      lastColor: null,
      lastMatch: null,
      ended: false,
    };
  }

  questions.push(makeQuestion(0));

  const api = {
    kind,
    get index() {
      return index;
    },
    get question() {
      return questions[index];
    },
    get questions() {
      return questions;
    },
    get color() {
      return { ...color };
    },
    get touched() {
      return touched;
    },
    get finished() {
      return finished;
    },
    currentMatch() {
      return matchUnits(color, questions[index].target, rules);
    },
    /** 色の入力（指で操作した時）。 */
    setColor(next) {
      const q = questions[index];
      if (finished || q.ended) return;
      const c = { ...next };
      if (kind === 'basic') c.v = rules.valMax;
      if (c.h !== color.h || c.s !== color.s || c.v !== color.v) touched = true;
      color = c;
      api.evaluate();
    },
    /** 一致度を評価し、最高値と成功の維持時間を更新する。 */
    evaluate() {
      const q = questions[index];
      if (q.ended) return;
      const m = matchUnits(color, q.target, rules);
      if (m > q.bestMatch) q.bestMatch = m;
      if (classifyMatch(m, rules) === 'success') {
        if (q.successSince == null) q.successSince = q.elapsedMs;
      } else {
        q.successSince = null;
      }
    },
    /** 経過時間を進める（答え合わせ中・停止中は呼ばない）。 */
    tick(dtMs) {
      const q = questions[index];
      if (finished || q.ended || !(dtMs > 0)) return;
      q.elapsedMs += dtMs;
      api.evaluate();
      if (q.firstSuccessMs == null && q.successSince != null && q.elapsedMs - q.successSince >= config.holdMs) {
        q.firstSuccessMs = q.elapsedMs;
        q.status = 'succeeded';
      }
    },
    /** スキップ：最後の色と目標色を並べる答え合わせへ。正解色へ自動で変えない。 */
    skip() {
      const q = questions[index];
      if (finished || q.ended || q.status === 'succeeded') return false;
      q.status = 'skipped';
      q.ended = true;
      q.lastColor = { ...color };
      q.lastMatch = matchUnits(color, q.target, rules);
      return true;
    },
    /** 次の問題（成功後、または答え合わせ後）。3問目の後は終了。 */
    next() {
      const q = questions[index];
      if (finished) return false;
      if (q.status === 'active') return false;
      if (!q.ended) {
        q.ended = true;
        q.lastColor = { ...color };
        q.lastMatch = matchUnits(color, q.target, rules);
      }
      if (index === QUESTIONS - 1) {
        finished = true;
        return true;
      }
      index += 1;
      questions.push(makeQuestion(index));
      return true;
    },
    /** 3問を処理した回の結果（保存用）。 */
    result(completedAt = Date.now()) {
      if (!finished) return null;
      return {
        id: `p-${completedAt}-${seed >>> 0}`,
        kind,
        completedAt,
        questions: questions.map((q) => ({
          number: q.number,
          difficulty: q.difficulty,
          status: q.status,
          bestMatch: q.bestMatch,
          firstSuccessMs: q.firstSuccessMs,
        })),
      };
    },
  };
  return api;
}
