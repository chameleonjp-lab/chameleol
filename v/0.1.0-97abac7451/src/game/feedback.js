// 判定結果を「見せ方」に変える補助。採点には影響しない。
import { RULES_V1, classifyMatch } from '../rules/v1/index.js';

/**
 * 警察の人数（0〜2）を、登場と退場に幅を持たせて決める。境目付近で点滅させない。
 */
export function createAlertStageTracker(rules = RULES_V1) {
  let stage = 0;
  return {
    update(alertUnits) {
      const stages = rules.alert.stages;
      // 上がる方向
      while (stage < stages.length && alertUnits >= stages[stage].enterAt) stage += 1;
      // 下がる方向
      while (stage > 0 && alertUnits < stages[stage - 1].exitBelow) stage -= 1;
      return stage;
    },
    get stage() {
      return stage;
    },
    reset() {
      stage = 0;
    },
  };
}

/** 警戒ゲージの言葉（数値は見せない）。 */
export function alertWordKey(alertUnits, rules = RULES_V1) {
  const pct = alertUnits / rules.alert.unitsPerPoint;
  if (pct >= 70) return 'game.alert.danger';
  if (pct >= 30) return 'game.alert.caution';
  if (pct > 0) return 'game.alert.notice';
  return 'game.alert.calm';
}

/** 本編の瞬間状態の言葉。 */
export function matchWordKey(units, rules = RULES_V1) {
  if (units == null) return null;
  return {
    success: 'game.match.success',
    slight: 'game.match.slight',
    danger: 'game.match.danger',
  }[classifyMatch(units, rules)];
}

/**
 * 瞬間の擬態成功を、猶予外で一定時間続いた後に同じ棟で1回だけ知らせる。
 * 棟の成功（建物平均85%）とは別物で、連続成功の加点を保証しない。
 */
export function createInstantSuccessTracker({ holdMs = 200, rules = RULES_V1 } = {}) {
  let since = null;
  let notifiedBuilding = 0;
  return {
    update(state) {
      if (state.evalBuilding === 0 || state.matchUnits == null) {
        since = null;
        return false;
      }
      if (classifyMatch(state.matchUnits, rules) !== 'success') {
        since = null;
        return false;
      }
      if (since == null) since = state.t;
      if (state.t - since >= holdMs && notifiedBuilding !== state.evalBuilding) {
        notifiedBuilding = state.evalBuilding;
        return true;
      }
      return false;
    },
    reset() {
      since = null;
      notifiedBuilding = 0;
    },
  };
}
