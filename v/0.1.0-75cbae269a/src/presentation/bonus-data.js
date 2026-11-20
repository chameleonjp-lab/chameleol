/** Display projections of already awarded points. No thresholds or score writes live here. */
const ORDER = ['precision', 'steady', 'quick', 'milestone'];
export function bonusNameKey(award) {
  return `bonus.${award.kind === 'precision' && award.tier === 10 ? 'precisionHigh' : award.kind}`;
}
export function buildBonusBatch({playId, passEvent:event, summary}) {
  if (!event || !Array.isArray(event.bonusAwards) || !event.bonusAwards.length) return null;
  const awards = event.bonusAwards.map(a => ({ ...a }));
  const kinds = new Set();
  for (const a of awards) {
    if (!ORDER.includes(a.kind) || kinds.has(a.kind) || a.building !== event.building || !Number.isSafeInteger(a.points) || a.points <= 0 || !Number.isSafeInteger(a.earnedAtT)) return null;
    kinds.add(a.kind);
  }
  if (awards.some(a => a.earnedAtT !== awards[0].earnedAtT) || awards.reduce((n,a)=>n+a.points,0) !== event.bonusPoints || event.basePoints + event.bonusPoints !== event.points) return null;
  awards.sort((a,b)=>ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind));
  const rulesVersion=summary?.rulesVersion??awards[0].id.slice(0,awards[0].id.indexOf(':'));
  return { id: `${playId}:${rulesVersion}:${event.building}`, playId, building: event.building, earnedAtT: awards[0].earnedAtT, expiresAtT: awards[0].earnedAtT + 1400, basePoints: event.basePoints, bonusPoints: event.bonusPoints, totalPoints: event.points, awards };
}
export function buildBonusResult(summary) {
  const b = summary?.bonus;
  if (!b || b.format !== 'kamereoru-bonus-v1') return { available: false };
  const totals = b.totals;
  const rows = ['precision','steady','milestone','quick','allSuccess'].map(kind => {
    const low = totals.precision5, high = totals.precision10;
    return kind === 'precision' ? { kind, count: low.count + high.count, points: low.points + high.points, low: low.count, high: high.count } : { kind, count: totals[kind].count, points: totals[kind].points };
  });
  return { available: true, points: b.points, rows };
}
export function buildEndingBonus(summary) {
  if (summary?.endReason !== 'cleared' || !summary.bonus) return null;
  const awards = summary.bonus.awards.filter(a => a.building === 50 && a.kind !== 'allSuccess').map(a=>({...a})).sort((a,b)=>ORDER.indexOf(a.kind)-ORDER.indexOf(b.kind));
  const bonusPoints = awards.reduce((n,a)=>n+a.points,0);
  const allSuccessPoints = summary.bonus.awards.filter(a=>a.kind==='allSuccess').reduce((n,a)=>n+a.points,0);
  const buildingPoints = summary.perBuilding[49]?.[2] ?? 0;
  return { building:50, awards, bonusPoints, basePoints:buildingPoints-bonusPoints, clearPoints:summary.score.clear, allSuccessPoints, points:buildingPoints+summary.score.clear+allSuccessPoints };
}
