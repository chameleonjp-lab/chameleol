// ボーナスは正の評価時間だけを積算し、棟の出口で確定する。
// 入力・描画・停止の実時間は判定に使わない。
export function createBonusAccumulator() {
  return { steadyMs: 0, maxSteadyMs: 0, quickStartMs: null, quickMs: 0, quickAchieved: false };
}

export function accumulateBonus(acc, { matchUnits, fromEvalMs, dtMs }, rules) {
  if (!rules.bonus || dtMs <= 0) return;
  const { steady, quick } = rules.bonus;
  acc.steadyMs = matchUnits >= steady.minUnits ? acc.steadyMs + dtMs : 0;
  acc.maxSteadyMs = Math.max(acc.maxSteadyMs, acc.steadyMs);
  if (matchUnits >= quick.minUnits) {
    if (acc.quickStartMs === null) acc.quickStartMs = fromEvalMs;
    acc.quickMs += dtMs;
    if (acc.quickStartMs <= quick.startWithinMs && acc.quickMs >= quick.holdMs) acc.quickAchieved = true;
  } else {
    acc.quickStartMs = null;
    acc.quickMs = 0;
  }
}

function award(building, kind, points, rules, tier = null) {
  return { id: `${rules.rulesVersion}:${building}:${kind}`, building, kind, tier, points, earnedAtT: building * rules.buildingMs };
}

export function settleBuildingBonus({ building, matchSum, evalMs, acc }, rules) {
  if (!rules.bonus || evalMs <= 0) return [];
  const { precision, steady, milestone, quick } = rules.bonus;
  const awards = [];
  if (matchSum >= precision.highMinUnits * evalMs) awards.push(award(building, 'precision', precision.highPoints, rules, 10));
  else if (matchSum >= precision.minUnits * evalMs) awards.push(award(building, 'precision', precision.points, rules, 5));
  if (acc.maxSteadyMs >= steady.holdMs) awards.push(award(building, 'steady', steady.points, rules));
  if (building % milestone.every === 0) awards.push(award(building, 'milestone', milestone.points, rules));
  if (acc.quickAchieved) awards.push(award(building, 'quick', quick.points, rules));
  return awards;
}

// 呼出し元がクリアを確定したときだけ呼ぶ。未通過の評価状態を渡さない。
export function settleClearBonus(buildings, rules) {
  if (!rules.bonus) return [];
  const { allSuccess } = rules.bonus;
  if (buildings.length !== allSuccess.buildings || !buildings.every((b, i) => b.index === i + 1 && b.evalMs > 0 && b.matchSum >= allSuccess.minUnits * b.evalMs)) return [];
  return [award(allSuccess.buildings, 'allSuccess', allSuccess.points, rules)];
}

export function createBonusSummary(rules) {
  return {
    format: rules.bonus.format,
    points: 0,
    totals: Object.fromEntries(['precision5', 'precision10', 'steady', 'milestone', 'quick', 'allSuccess'].map((kind) => [kind, { count: 0, points: 0 }])),
    awards: [],
  };
}

export function cloneBonusSummary(bonus) {
  return { ...bonus, totals: Object.fromEntries(Object.entries(bonus.totals).map(([kind, total]) => [kind, { ...total }])), awards: bonus.awards.map((a) => ({ ...a })) };
}

export function addBonusAwards(bonus, awards) {
  let points = 0;
  for (const a of awards) {
    const total = bonus.totals[a.kind === 'precision' ? `precision${a.tier}` : a.kind];
    total.count += 1;
    total.points += a.points;
    points += a.points;
    bonus.awards.push({ ...a });
  }
  bonus.points += points;
  return points;
}
