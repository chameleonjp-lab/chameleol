// 色の換算。操作値（整数のHSV）→ 画面の8ビットsRGB → CIELAB → 色差（CIEDE2000）→ 一致度。
// 採点は画面に出す8ビットの色で行う。見た目が同じ2色は必ず色差0・一致度100%になる。
import { atan2Deg, cbrt, cosDeg, exp, pow24, pow7, sinDeg } from './detmath.js';
import { RULES_V1 } from './config.js';

/** 整数の割り算を四捨五入（0.5は切り上げ）で行う。a >= 0, b > 0 の安全な整数。 */
export function divRoundHalfUp(a, b) {
  let q = Math.floor(a / b);
  let r = a - q * b;
  while (r < 0) {
    q -= 1;
    r += b;
  }
  while (r >= b) {
    q += 1;
    r -= b;
  }
  return r * 2 >= b ? q + 1 : q;
}

export function isValidHsv(c, rules = RULES_V1) {
  return (
    c != null &&
    Number.isInteger(c.h) &&
    Number.isInteger(c.s) &&
    Number.isInteger(c.v) &&
    c.h >= 0 &&
    c.h < rules.hueSteps &&
    c.s >= 0 &&
    c.s <= rules.satMax &&
    c.v >= 0 &&
    c.v <= rules.valMax
  );
}

/**
 * HSV（h: 0〜35,999 の0.01度、s・v: 0〜10,000）→ 8ビットsRGB（0〜255の整数）。
 * 整数だけで計算するため、どの実行環境でも同じ結果になる。
 */
export function hsvToRgb8(h, s, v) {
  // 各チャンネルを 1e-8 × 6000 単位の整数で表す。
  const C = v * s; // 0〜1e8（1e-8単位）
  const m = v * 10000 - C; // 1e-8単位
  const sector = Math.floor(h / 6000);
  const rem = h - sector * 6000; // 0〜5999
  const X = sector % 2 === 0 ? C * rem : C * (6000 - rem); // ×6000
  const M = m * 6000;
  const C6 = C * 6000;
  let r;
  let g;
  let b;
  switch (sector) {
    case 0:
      [r, g, b] = [C6, X, 0];
      break;
    case 1:
      [r, g, b] = [X, C6, 0];
      break;
    case 2:
      [r, g, b] = [0, C6, X];
      break;
    case 3:
      [r, g, b] = [0, X, C6];
      break;
    case 4:
      [r, g, b] = [X, 0, C6];
      break;
    default:
      [r, g, b] = [C6, 0, X];
      break;
  }
  const D = 100000000 * 6000; // 1.0 に相当
  return [divRoundHalfUp(255 * (r + M), D), divRoundHalfUp(255 * (g + M), D), divRoundHalfUp(255 * (b + M), D)];
}

export function rgb8ToHex([r, g, b]) {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function hsvToHex(c) {
  return rgb8ToHex(hsvToRgb8(c.h, c.s, c.v));
}

// 8ビット値 → 線形のsRGB（IEC 61966-2-1）。決定的な関数で一度だけ表を作る。
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : pow24((c + 0.055) / 1.055);
}
export const SRGB_LINEAR_TABLE = LINEAR;

// sRGB（D65）→ XYZ の係数と白色点。採用する式・係数は試作で確定する（仕様 COLOR-01）。
const M = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const WHITE = [0.95047, 1.0, 1.08883];
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function labF(t) {
  return t > EPS ? cbrt(t) : (KAPPA * t + 16) / 116;
}

export function rgb8ToLab([r8, g8, b8]) {
  const r = LINEAR[r8];
  const g = LINEAR[g8];
  const b = LINEAR[b8];
  const X = M[0][0] * r + M[0][1] * g + M[0][2] * b;
  const Y = M[1][0] * r + M[1][1] * g + M[1][2] * b;
  const Z = M[2][0] * r + M[2][1] * g + M[2][2] * b;
  const fx = labF(X / WHITE[0]);
  const fy = labF(Y / WHITE[1]);
  const fz = labF(Z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const POW25_7 = pow7(25);

/** CIEDE2000（kL = kC = kH = 1）。Sharmaらの実装ノートの手順に従う。 */
export function ciede2000([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = pow7(Cbar);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.sqrt(ap1 * ap1 + b1 * b1);
  const Cp2 = Math.sqrt(ap2 * ap2 + b2 * b2);
  const hp1 = ap1 === 0 && b1 === 0 ? 0 : atan2Deg(b1, ap1);
  const hp2 = ap2 === 0 && b2 === 0 ? 0 : atan2Deg(b2, ap2);

  const dL = L2 - L1;
  const dC = Cp2 - Cp1;
  let dh = 0;
  const CC = Cp1 * Cp2;
  if (CC !== 0) {
    dh = hp2 - hp1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(CC) * sinDeg(dh / 2);

  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  let hbar;
  if (CC === 0) hbar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hbar = (hp1 + hp2) / 2;
  else if (hp1 + hp2 < 360) hbar = (hp1 + hp2 + 360) / 2;
  else hbar = (hp1 + hp2 - 360) / 2;

  const T =
    1 -
    0.17 * cosDeg(hbar - 30) +
    0.24 * cosDeg(2 * hbar) +
    0.32 * cosDeg(3 * hbar + 6) -
    0.2 * cosDeg(4 * hbar - 63);
  const z = (hbar - 275) / 25;
  const dTheta = 30 * exp(-(z * z));
  const Cpbar7 = pow7(Cpbar);
  const RC = 2 * Math.sqrt(Cpbar7 / (Cpbar7 + POW25_7));
  const l50 = (Lbar - 50) * (Lbar - 50);
  const SL = 1 + (0.015 * l50) / Math.sqrt(20 + l50);
  const SC = 1 + 0.045 * Cpbar;
  const SH = 1 + 0.015 * Cpbar * T;
  const RT = -sinDeg(2 * dTheta) * RC;
  const tL = dL / SL;
  const tC = dC / SC;
  const tH = dH / SH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

/** 色差 → 一致度（1%の100万分の1単位の整数）。折れ線で換算し、非増加。 */
export function deltaEToMatchUnits(dE, rules = RULES_V1) {
  const { knots, unitsPerPercent } = rules.match;
  if (!(dE > 0)) return 100 * unitsPerPercent;
  for (let i = 1; i < knots.length; i += 1) {
    const [x0, y0] = knots[i - 1];
    const [x1, y1] = knots[i];
    if (dE <= x1) {
      const pct = y0 + ((y1 - y0) * (dE - x0)) / (x1 - x0);
      return Math.round(pct * unitsPerPercent);
    }
  }
  return Math.round(knots[knots.length - 1][1] * unitsPerPercent);
}

export function hsvToLab(c) {
  return rgb8ToLab(hsvToRgb8(c.h, c.s, c.v));
}

export function deltaEHsv(a, b) {
  return ciede2000(hsvToLab(a), hsvToLab(b));
}

/** 体色と壁色（どちらもHSV整数）の瞬間一致度。 */
export function matchUnits(body, wall, rules = RULES_V1) {
  return deltaEToMatchUnits(deltaEHsv(body, wall), rules);
}

/** 瞬間状態：'success'（擬態成功）／'slight'（少し目立つ）／'danger'（危険）。 */
export function classifyMatch(units, rules = RULES_V1) {
  if (units >= rules.match.successMinUnits) return 'success';
  if (units >= rules.match.slightMinUnits) return 'slight';
  return 'danger';
}

// ---- 円形パレットと縦バーの座標 ----
// 円：角度で色合い、中心からの距離で鮮やかさ。0度は真上、時計回りに増える。
// バー：上端が明るさ100%、下端が0%。

/** 円の中心からの位置（dx: 右が正、dy: 下が正）と半径から、色合い・鮮やかさを得る。円外は外周へ制限。 */
export function hsFromPoint(dx, dy, radius, rules = RULES_V1) {
  const dist = Math.sqrt(dx * dx + dy * dy);
  const s = Math.min(rules.satMax, Math.round((dist / radius) * rules.satMax));
  // 真上を0度、時計回り：atan2(dx, -dy)
  let deg = atan2Deg(dx, -dy);
  let h = Math.round(deg * (rules.hueSteps / 360));
  if (h >= rules.hueSteps) h -= rules.hueSteps;
  return { h, s };
}

export function pointFromHs(h, s, radius, rules = RULES_V1) {
  const deg = (h * 360) / rules.hueSteps;
  const r = (s / rules.satMax) * radius;
  return { dx: r * sinDeg(deg), dy: -r * cosDeg(deg) };
}

/** バーの上端からの距離 y と高さから明るさを得る。端の外は端の値。 */
export function vFromBar(y, height, rules = RULES_V1) {
  const t = Math.min(1, Math.max(0, y / height));
  return Math.round((1 - t) * rules.valMax);
}

export function barFromV(v, height, rules = RULES_V1) {
  return (1 - v / rules.valMax) * height;
}

/** マーカーの移動距離（半径1の円で）。 */
export function paletteDistance(a, b, rules = RULES_V1) {
  const pa = pointFromHs(a.h, a.s, 1, rules);
  const pb = pointFromHs(b.h, b.s, 1, rules);
  const dx = pa.dx - pb.dx;
  const dy = pa.dy - pb.dy;
  return Math.sqrt(dx * dx + dy * dy);
}
