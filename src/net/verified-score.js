// Private status responses may correct auxiliary scores, never the stored result
// or the ranking fields. Keep every corrected field together as one value.
const RANKED_BONUS_VERSION = 'kamereoru-rules-v3';
const BONUS_FORMAT = 'kamereoru-bonus-v1';
const TOTAL_KEYS = ['precision5', 'precision10', 'steady', 'milestone', 'quick', 'allSuccess'];
const SCORE_LIMITS = { pass: 1000, accuracy: 4000, combo: 880, clear: 200, bonus: 1200, total: 7280 };
const AWARD_POINTS = { steady: 5, milestone: 20, quick: 5, allSuccess: 100 };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, max, min = 0) => Number.isSafeInteger(value) && value >= min && value <= max;
const copy = (value) => structuredClone(value);

function validDetails(value, summary) {
  if (!object(value) || !object(summary) || value.rulesVersion !== RANKED_BONUS_VERSION || summary.rulesVersion !== value.rulesVersion) return false;
  const buildings = summary.buildings;
  if (!integer(buildings, 50) || !['cleared', 'quit', 'detected'].includes(summary.endReason)) return false;
  const { score, bonus, perBuilding, maxCombo } = value;
  if (!object(score) || Object.keys(score).length !== Object.keys(SCORE_LIMITS).length) return false;
  for (const [key, max] of Object.entries(SCORE_LIMITS)) if (!integer(score[key], max)) return false;
  if (score.pass !== buildings * 20 || score.accuracy > buildings * 80 || score.combo > buildings * 20) return false;
  if (score.clear !== (summary.endReason === 'cleared' ? 200 : 0) || (summary.endReason === 'cleared' && buildings !== 50)) return false;
  if (score.total !== score.pass + score.accuracy + score.combo + score.clear + score.bonus) return false;
  if (!integer(maxCombo, buildings) || !Array.isArray(perBuilding) || perBuilding.length !== buildings) return false;
  for (const row of perBuilding) {
    if (!Array.isArray(row) || row.length !== 3 || !integer(row[1], 3000, 1) || !integer(row[0], row[1] * 100000000) || !integer(row[2], 160, 20)) return false;
  }
  if (!object(bonus) || bonus.format !== BONUS_FORMAT || !integer(bonus.points, 1200) || bonus.points !== score.bonus) return false;
  if (!object(bonus.totals) || Object.keys(bonus.totals).length !== TOTAL_KEYS.length || !Array.isArray(bonus.awards) || bonus.awards.length > 156) return false;
  const counts = Object.fromEntries(TOTAL_KEYS.map((key) => [key, { count: 0, points: 0 }]));
  const perBuildingBonus = Array(buildings).fill(0);
  const seen = new Set();
  for (const award of bonus.awards) {
    if (!object(award) || !integer(award.building, buildings, 1) || award.earnedAtT !== award.building * 5000) return false;
    if (!['precision', 'steady', 'milestone', 'quick', 'allSuccess'].includes(award.kind)) return false;
    const id = `${value.rulesVersion}:${award.building}:${award.kind}`;
    if (award.id !== id || seen.has(id)) return false;
    seen.add(id);
    let key = award.kind;
    if (award.kind === 'precision') {
      if (![5, 10].includes(award.tier) || award.points !== award.tier) return false;
      key = `precision${award.tier}`;
    } else if (award.tier !== null || award.points !== AWARD_POINTS[award.kind]) return false;
    if (award.kind === 'milestone' && award.building % 10 !== 0) return false;
    if (award.kind === 'allSuccess' && (summary.endReason !== 'cleared' || award.building !== 50)) return false;
    counts[key].count += 1;
    counts[key].points += award.points;
    if (award.kind !== 'allSuccess') perBuildingBonus[award.building - 1] += award.points;
  }
  for (const key of TOTAL_KEYS) {
    const total = bonus.totals[key];
    const maxCount = key === 'allSuccess' ? 1 : key === 'milestone' ? Math.floor(buildings / 10) : buildings;
    if (!object(total) || !integer(total.count, maxCount) || !integer(total.points, 1200) || total.count !== counts[key].count || total.points !== counts[key].points) return false;
  }
  if (bonus.points !== TOTAL_KEYS.reduce((sum, key) => sum + counts[key].points, 0)) return false;
  let basePoints = 0;
  for (let i = 0; i < buildings; i += 1) {
    const base = perBuilding[i][2] - perBuildingBonus[i];
    if (!integer(base, 120, 20)) return false;
    basePoints += base;
  }
  if (basePoints !== score.pass + score.accuracy + score.combo) return false;
  return perBuilding.reduce((sum, row) => sum + row[2], 0) + score.clear + counts.allSuccess.points === score.total;
}

/** Accept only the matching authenticated status item's finalized v3 score. */
export function validateVerifiedScore(value, { playId, responsePlayId, rulesVersion, summary, status } = {}) {
  if (typeof playId !== 'string' || !playId || responsePlayId !== playId || rulesVersion !== summary?.rulesVersion) return null;
  if (!['official', 'no_rank'].includes(status) || (status === 'no_rank' ? summary?.buildings !== 0 : summary?.buildings === 0)) return null;
  if (!validDetails(value, summary)) return null;
  return copy({ rulesVersion: value.rulesVersion, score: value.score, bonus: value.bonus, perBuilding: value.perBuilding, maxCombo: value.maxCombo });
}

/** Return a detached display summary, replacing all auxiliary fields together. */
export function applyVerifiedScore(summary, verifiedScore) {
  const result = copy(summary ?? {});
  if (!validDetails(verifiedScore, summary)) return result;
  const { score, bonus, perBuilding, maxCombo } = copy(verifiedScore);
  return { ...result, score, bonus, perBuilding, maxCombo };
}
