// Read-only presentation projections. Never writes scores, snapshots or outbox items.
import { readMetrics } from '../net/result-metrics.js';
import { applyVerifiedScore } from '../net/verified-score.js';
import { rulesForVersion } from '../rules/v1/config.js';
import { isValidHsv } from '../rules/v1/color.js';
import { buildBonusResult } from './bonus-data.js';
import { isSupportedLanguage } from '../i18n/languages.js';
import { RESULT_TITLES } from './result-titles.js';

export function freezeProjection(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeProjection(child);
    Object.freeze(value);
  }
  return value;
}
export const copyVisualColor = color => isValidHsv(color) ? {h:color.h,s:color.s,v:color.v} : null;

export function rankForPassed(passed) {
  if (!Number.isInteger(passed) || passed < 0 || passed > 50) return null;
  const row = RESULT_TITLES.find(x => x.from <= passed && passed <= x.to);
  return row ? Object.freeze({rankKey:row.key,from:row.from,to:row.to}) : null;
}

export function resolveCardRules(summary, supplied = null) {
  if (typeof summary?.rulesVersion !== 'string') return null;
  const rules = rulesForVersion(summary.rulesVersion);
  if (!rules || (supplied && supplied.rulesVersion !== rules.rulesVersion)) return null;
  const n = summary.buildings;
  if (!Number.isInteger(n) || n < 0 || n > rules.buildingCount) return null;
  if (!['cleared','quit','detected'].includes(summary.endReason)) return null;
  if ((n === rules.buildingCount) !== (summary.endReason === 'cleared')) return null;
  return rules;
}

export function selectBestVisual({summary,rules,visualSamples} = {}) {
  const canonical = resolveCardRules(summary,rules);
  if (!canonical || !Array.isArray(summary.perBuilding) || !Array.isArray(visualSamples)) return null;
  let best = null;
  for (let i=0;i<summary.buildings;i++) {
    const row=summary.perBuilding[i];
    if (!Array.isArray(row) || row.length!==3) continue;
    const [sum,ms]=row;
    if (!Number.isSafeInteger(ms) || ms<=0 || ms>canonical.evalEndMs-canonical.evalStartMs ||
        !Number.isSafeInteger(sum) || sum<0 || sum>ms*canonical.match.unitsPerPercent*100) continue;
    if (!best || BigInt(sum)*BigInt(best.ms)>BigInt(best.sum)*BigInt(ms)) best={building:i+1,sum,ms};
  }
  if (!best) return null;
  const sample=visualSamples.find(x=>x.building===best.building);
  const hsv=copyVisualColor(sample?.hsv);
  if (!hsv || !Number.isSafeInteger(sample.matchUnits) || sample.matchUnits<0 ||
      sample.matchUnits>100*canonical.match.unitsPerPercent || !Number.isFinite(sample.from) ||
      !Number.isFinite(sample.to) || sample.to<=sample.from) return null;
  return {building:best.building,hsv,average:best.sum/best.ms/canonical.match.unitsPerPercent,instantMatch:sample.matchUnits/canonical.match.unitsPerPercent};
}

function countBonus(summary,rules) {
  const b=summary?.bonus;
  if (!rules?.bonus || !b || b.format!==rules.bonus.format || !b.totals || !Array.isArray(b.awards)) return null;
  const totals=Object.fromEntries(['precision5','precision10','steady','milestone','quick','allSuccess'].map(k=>[k,{count:0,points:0}]));
  const ids=new Set();let points=0;
  for (const a of b.awards) {
    if (!a || !Number.isInteger(a.building) || a.building<1 || a.building>summary.buildings ||
        !Object.hasOwn(totals,a.kind==='precision'?`precision${a.tier}`:a.kind)) return null;
    const id=`${rules.rulesVersion}:${a.building}:${a.kind}`;
    if (a.id!==id || ids.has(id) || a.earnedAtT!==a.building*rules.buildingMs) return null;
    let expected;
    if (a.kind==='precision') expected=a.tier===5?rules.bonus.precision.points:a.tier===10?rules.bonus.precision.highPoints:null;
    else {
      if (a.tier!==null) return null;
      expected=rules.bonus[a.kind]?.points;
    }
    if (!Number.isSafeInteger(expected) || a.points!==expected) return null;
    if (a.kind==='milestone' && a.building%rules.bonus.milestone.every!==0) return null;
    if (a.kind==='allSuccess' && (summary.endReason!=='cleared' || a.building!==rules.buildingCount)) return null;
    const key=a.kind==='precision'?`precision${a.tier}`:a.kind;
    totals[key].count++;totals[key].points+=a.points;points+=a.points;ids.add(id);
  }
  for (const [key,value] of Object.entries(totals)) {
    if (b.totals[key]?.count!==value.count || b.totals[key]?.points!==value.points) return null;
  }
  if (b.points!==points || summary.score?.bonus!==points) return null;
  const result=buildBonusResult(summary);
  const count=result.rows.reduce((n,row)=>n+row.count,0);
  return count===ids.size?count:null;
}

const inRange = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function projectRunResult(context, locale, displaySummary = applyVerifiedScore(context.summary, context.verifiedScore)) {
  const official = context.ranked && context.netState === 'official';
  const corrected = official && inRange(context.official?.buildings, 1, 50) &&
    inRange(context.official.rankAverage, 0, 10000);
  // A rank status alone cannot amend the run's score or cleared buildings.
  const zero = context.ranked && context.netState === 'no_rank' && (
    context.official?.buildings === 0 ||
    (Array.isArray(context.corrections) &&
      context.corrections.some(change => change?.action === 'correct' && change.after?.buildings === 0))
  );
  const buildings = zero ? 0 : corrected ? context.official.buildings : displaySummary.buildings;
  const rankAverage = zero ? null : corrected ? context.official.rankAverage : displaySummary.rankAverage;
  const { endReason } = displaySummary;
  const clear = buildings === 50 && endReason === 'cleared';
  const building = context.arrivedBuilding;
  const wall = inRange(building, 1, 50) ? copyVisualColor(context.targets?.[building - 1]) : null;
  const appearance = clear ? { kind: 'rainbow', building: 50, hsv: null } :
    wall ? { kind: 'wall', building, hsv: wall } : { kind: 'unknown', building: null, hsv: null };
  const eligible = official && inRange(buildings, 1, 50) && (context.official == null || corrected);
  const metrics = readMetrics({status: eligible ? 'official' : null, metrics: context.metrics});
  const ranked = metrics.runRank !== null;
  let rankState = 'unranked';
  if (context.ranked) {
    const terminal = ['no_rank', 'rejected', 'permanent_failed'];
    rankState = terminal.includes(context.netState) ? context.netState : ranked ? 'official' : 'pending';
  }
  return freezeProjection({
    playId: context.playId, locale: isSupportedLanguage(locale) ? locale : 'ja', endReason,
    buildings: inRange(buildings, 0, 50) ? buildings : null,
    rankAverage: inRange(rankAverage, 0, 10000) ? rankAverage : null,
    score: inRange(displaySummary.score?.total, 0, Number.MAX_SAFE_INTEGER) ? displaySummary.score.total : null,
    rankState, runRank: ranked ? metrics.runRank : null, totalPlays: ranked ? metrics.totalPlays : null,
    clearOrdinal: clear ? metrics.clearOrdinal : null,
    appearance,
  });
}

export function buildResultCardModel({displaySummary,rules,run = projectRunResult({summary: displaySummary}, 'ja', displaySummary),locale='en',revision=0,verificationState=null} = {}) {
  const canonical=resolveCardRules(displaySummary,rules);
  const passed=canonical?run.buildings:null;
  const rank=rankForPassed(passed);
  const count=canonical?countBonus(displaySummary,canonical):null;
  const { appearance, endReason, runRank, totalPlays, clearOrdinal, rankState } = run;
  const hero={status:appearance.kind, building:appearance.building, hsv:appearance.hsv, outlineBuilding:appearance.building ?? 1};
  const states=['pending','sending','accepted','retryable_failed','permanent_failed','verifying','official','no_rank','pending_review','rejected','under_review'];
  return freezeProjection({revision:Number.isSafeInteger(revision)&&revision>=0?revision:0,locale:isSupportedLanguage(locale)?locale:'en',passed,
    appearance, endReason, runRank, totalPlays, clearOrdinal, rankState,
    rankKey:rank?.rankKey??null,totalScore:run.score,
    bonusCount:count,countState:count===null?'missing':'known',hero,verificationState:canonical?(states.includes(verificationState)?verificationState:null):'pending_review'});
}
