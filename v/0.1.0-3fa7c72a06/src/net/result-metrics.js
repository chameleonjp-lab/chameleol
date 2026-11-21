/** Validate one private status snapshot, including previously saved responses. */
export function readMetrics({status, metrics}) {
  const total = metrics?.totalPlays;
  const totalPlays = Number.isSafeInteger(total) && total >= 0 ? total : null;
  const fits = value => Number.isSafeInteger(value) && value >= 1 && value <= totalPlays;
  const runRank = status === 'official' && fits(metrics?.runRank) ? metrics.runRank : null;
  const clearOrdinal = runRank !== null && fits(metrics?.clearOrdinal) ? metrics.clearOrdinal : null;
  return {runRank, totalPlays, clearOrdinal};
}
