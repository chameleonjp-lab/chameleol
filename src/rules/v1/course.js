// 出題の生成。同じ出題番号（seed）と生成規則の版から、必ず同じ50色を作る。
// 色の乱数と装飾（建物の見た目）の乱数は別の流れに分け、装飾を変えても色順は変わらない。
import { COURSE_V1, RULES_V1 } from './config.js';
import { deltaEHsv, paletteDistance } from './color.js';

const COLOR_STREAM = 0x0c0102;
const DECO_STREAM = 0x0dec0;

function mix32(input) {
  let a = (input + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

/** sfc32：整数演算だけの擬似乱数。どの実行環境でも同じ列になる。 */
export function createRng(seed, stream) {
  const base = (seed >>> 0) ^ stream;
  let a = mix32(base);
  let b = mix32(base + 1);
  let c = mix32(base + 2);
  let d = mix32(base + 3) | 1;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i += 1) next();
  return {
    next,
    int(lo, hi) {
      return lo + (next() % (hi - lo + 1));
    },
  };
}

export function isValidSeed(seed) {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

export function bandOf(index, course = COURSE_V1) {
  return course.bands.find((band) => index >= band.from && index <= band.to);
}

const within = (x, [lo, hi]) => x >= lo && x <= hi;

/** 1棟分の候補が帯の条件を満たすか。prev は直前の棟の目標色（1棟目は初期体色）。 */
export function checkCandidate(index, cand, prev, level, { rules = RULES_V1, course = COURSE_V1 } = {}) {
  const band = bandOf(index, course);
  const reasons = [];
  if (!within(cand.s, band.sat)) reasons.push('sat');
  if (band.alternate) {
    if (!within(cand.v, level === 'dark' ? band.dark : band.bright)) reasons.push('level');
  } else if (!within(cand.v, band.val)) reasons.push('val');
  const dE = deltaEHsv(prev, cand);
  if (index === 1) {
    if (dE < course.firstMinDeltaEFromInitial) reasons.push('deltaE');
    if (cand.v !== rules.valMax) reasons.push('val');
  } else {
    if (!within(dE, band.deltaE)) reasons.push('deltaE');
    if (!within(paletteDistance(prev, cand, rules), band.paletteMove)) reasons.push('paletteMove');
    if (!within(Math.abs(cand.v - prev.v), band.barMove)) reasons.push('barMove');
  }
  if (index < rules.brightnessUnlockBuilding && cand.v !== rules.valMax) reasons.push('locked');
  return { ok: reasons.length === 0, reasons, deltaE: dE };
}

function levelFor(index, prev, prevLevel, band) {
  if (!band.alternate) return null;
  if (index === band.from) return prev.v >= 6000 ? 'dark' : 'bright';
  return prevLevel === 'dark' ? 'bright' : 'dark';
}

function fallbackCandidates(index, prev, level, band, rules) {
  const mid = ([lo, hi]) => Math.round((lo + hi) / 2);
  const hueShifts = [18000, 12000, 24000, 9000, 27000, 15000, 21000, 6000, 30000];
  const sats = [mid(band.sat), band.sat[1], band.sat[0]];
  let vals;
  if (index < rules.brightnessUnlockBuilding) vals = [rules.valMax];
  else if (band.alternate) {
    const range = level === 'dark' ? band.dark : band.bright;
    vals = [mid(range), range[0], range[1]];
  } else {
    const opts = [];
    const steps = [mid(band.barMove), band.barMove[0], band.barMove[1]];
    for (const step of steps) {
      opts.push(prev.v - step, prev.v + step);
    }
    opts.push(mid(band.val), band.val[0], band.val[1]);
    vals = opts.filter((v) => within(v, band.val));
  }
  const out = [];
  for (const dh of hueShifts) {
    for (const s of sats) {
      for (const v of vals) {
        out.push({ h: (prev.h + dh) % rules.hueSteps, s, v });
      }
    }
  }
  return out;
}

/**
 * 50棟の目標色を作る。
 * options.rejectAllRandom を true にすると乱数の候補をすべて却下し、代替列だけで作る（試験用）。
 */
export function makeCourse(seed, generatorVersion = RULES_V1.generatorVersion, options = {}) {
  const rules = options.rules ?? RULES_V1;
  const course = options.course ?? COURSE_V1;
  if (generatorVersion !== rules.generatorVersion) {
    throw new Error(`unsupported generator version: ${generatorVersion}`);
  }
  if (!isValidSeed(seed)) throw new Error('seed must be a uint32 integer');
  const rng = createRng(seed, COLOR_STREAM);
  const targets = [];
  const meta = [];
  let prev = rules.initialColor;
  let prevLevel = null;
  for (let index = 1; index <= rules.buildingCount; index += 1) {
    const band = bandOf(index, course);
    const level = levelFor(index, prev, prevLevel, band);
    let chosen = null;
    let attempts = 0;
    let fallback = false;
    for (; attempts < course.maxAttempts; attempts += 1) {
      const h = rng.int(0, rules.hueSteps - 1);
      const s = rng.int(band.sat[0], band.sat[1]);
      let v;
      if (index < rules.brightnessUnlockBuilding) v = rules.valMax;
      else if (band.alternate) {
        const range = level === 'dark' ? band.dark : band.bright;
        v = rng.int(range[0], range[1]);
      } else v = rng.int(band.val[0], band.val[1]);
      if (options.rejectAllRandom) continue;
      const cand = { h, s, v };
      if (checkCandidate(index, cand, prev, level, { rules, course }).ok) {
        chosen = cand;
        break;
      }
    }
    if (!chosen) {
      fallback = true;
      chosen = fallbackCandidates(index, prev, level, band, rules).find(
        (cand) => checkCandidate(index, cand, prev, level, { rules, course }).ok,
      );
      if (!chosen) throw new Error(`no fallback color for building ${index}`);
    }
    targets.push(Object.freeze(chosen));
    meta.push(Object.freeze({ band: band.id, level, attempts: attempts + (fallback ? 0 : 1), fallback }));
    prev = chosen;
    prevLevel = level;
  }
  return Object.freeze({ seed, generatorVersion, targets: Object.freeze(targets), meta: Object.freeze(meta) });
}

/** 生成済みの出題が、帯の条件をすべて満たしているか検査する。 */
export function validateCourse(courseData, { rules = RULES_V1, course = COURSE_V1 } = {}) {
  const problems = [];
  let prev = rules.initialColor;
  let prevLevel = null;
  courseData.targets.forEach((target, i) => {
    const index = i + 1;
    const band = bandOf(index, course);
    const level = levelFor(index, prev, prevLevel, band);
    const result = checkCandidate(index, target, prev, level, { rules, course });
    if (!result.ok) problems.push({ index, reasons: result.reasons });
    prev = target;
    prevLevel = level;
  });
  if (courseData.targets.length !== rules.buildingCount) problems.push({ index: 0, reasons: ['count'] });
  return problems;
}

// ---- 装飾（見た目だけ。判定には使わない） ----
const AREAS = [
  { from: 1, to: 19, main: 'house', time: 'day' },
  { from: 20, to: 22, main: 'shop', time: 'day' },
  { from: 23, to: 29, main: 'shop', time: 'evening' },
  { from: 30, to: 39, main: 'office', time: 'dusk' },
  { from: 40, to: 50, main: 'tower', time: 'night' },
];
const KINDS = ['house', 'shop', 'office', 'tower'];

export function areaOf(index) {
  return AREAS.find((a) => index >= a.from && index <= a.to);
}

export function makeDecorations(seed, decorationVersion = RULES_V1.decorationVersion, count = RULES_V1.buildingCount) {
  if (decorationVersion !== RULES_V1.decorationVersion) throw new Error('unsupported decoration version');
  const rng = createRng(seed, DECO_STREAM);
  const out = [];
  for (let index = 1; index <= count; index += 1) {
    const area = areaOf(index);
    // 主役の建物を約70%、ほかを約30%（初期候補）
    const roll = rng.int(0, 99);
    const kind = roll < 70 ? area.main : KINDS[rng.int(0, KINDS.length - 1)];
    out.push(
      Object.freeze({
        index,
        kind,
        time: area.time,
        heightScale: 80 + rng.int(0, 40), // %
        windows: rng.int(1, 4),
        roof: rng.int(0, 2),
        sign: kind === 'shop' ? rng.int(0, 5) : -1,
        trimTone: rng.int(0, 3),
      }),
    );
  }
  return Object.freeze(out);
}
