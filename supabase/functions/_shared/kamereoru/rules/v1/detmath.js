// 決定的な数学関数。
// 端末（iPhoneのSafari）とサーバー（Deno）は別のJavaScriptエンジンで動く。
// Math.sin・Math.atan2・Math.pow・Math.exp などは、エンジンによって最後の桁が違ってよいと
// 仕様で決められている。ここでは四則演算・Math.sqrt・Math.floor・Math.abs・比較だけを使い、
// 同じ入力なら必ず同じビット列になる関数を用意する（IEEE 754の倍精度は四則演算と平方根を
// 正しく丸めることを要求している）。反復回数はすべて固定にしている。

export const PI = 3.141592653589793;
const HALF_PI = PI / 2;
const TWO_PI = PI * 2;
const DEG_PER_RAD = 180 / PI;
const RAD_PER_DEG = PI / 180;

/** 立方根（x >= 0）。2の累乗での拡大縮小は誤差を生まない。 */
export function cbrt(x) {
  if (!(x > 0)) return 0;
  let m = x;
  let e = 1;
  while (m > 1) {
    m /= 8;
    e *= 2;
  }
  while (m < 0.125) {
    m *= 8;
    e /= 2;
  }
  let y = 0.75;
  for (let i = 0; i < 12; i += 1) {
    y -= (y * y * y - m) / (3 * y * y);
  }
  return y * e;
}

/** 5乗根（a >= 0）。 */
export function root5(a) {
  if (!(a > 0)) return 0;
  let m = a;
  let e = 1;
  while (m > 1) {
    m /= 32;
    e *= 2;
  }
  while (m < 1 / 32) {
    m *= 32;
    e /= 2;
  }
  let y = 0.8;
  for (let i = 0; i < 14; i += 1) {
    const y2 = y * y;
    const y4 = y2 * y2;
    y -= (y4 * y - m) / (5 * y4);
  }
  return y * e;
}

/** x^2.4（x >= 0）。sRGBの線形化に使う。x^2.4 = x^2 × (x^2)^(1/5)。 */
export function pow24(x) {
  if (!(x > 0)) return 0;
  const x2 = x * x;
  return x2 * root5(x2);
}

/** 0 <= z <= 1 の逆正接（ラジアン）。半角公式で2回縮めてから級数で計算する。 */
function atanUnit(z) {
  const z1 = z / (1 + Math.sqrt(1 + z * z));
  const z2 = z1 / (1 + Math.sqrt(1 + z1 * z1));
  const q = z2 * z2;
  let term = z2;
  let sum = 0;
  for (let k = 0; k < 18; k += 1) {
    const value = term / (2 * k + 1);
    sum = k % 2 === 0 ? sum + value : sum - value;
    term *= q;
  }
  return 4 * sum;
}

/** atan2(y, x) を度で返す。範囲は [0, 360)。両方0なら0。 */
export function atan2Deg(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  let a = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  if (x < 0 && y >= 0) a = PI - a;
  else if (x < 0 && y < 0) a = PI + a;
  else if (x >= 0 && y < 0) a = TWO_PI - a;
  let deg = a * DEG_PER_RAD;
  if (deg >= 360) deg -= 360;
  if (deg < 0) deg += 360;
  return deg;
}

function sinSeries(x) {
  // |x| <= π/4
  const q = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 12; n += 1) {
    term *= -q / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

function cosSeries(x) {
  const q = x * x;
  let term = 1;
  let sum = 1;
  for (let n = 1; n < 12; n += 1) {
    term *= -q / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}

/** 度を [0, 360) へ寄せ、象限と0〜45度の角へ分解する。 */
function reduceDeg(deg) {
  let d = deg - 360 * Math.floor(deg / 360);
  if (d >= 360) d -= 360;
  const quadrant = Math.floor(d / 90);
  const r = d - 90 * quadrant; // [0, 90)
  return { quadrant, r };
}

function sinFirstQuadrant(r) {
  return r <= 45 ? sinSeries(r * RAD_PER_DEG) : cosSeries((90 - r) * RAD_PER_DEG);
}

function cosFirstQuadrant(r) {
  return r <= 45 ? cosSeries(r * RAD_PER_DEG) : sinSeries((90 - r) * RAD_PER_DEG);
}

export function sinDeg(deg) {
  const { quadrant, r } = reduceDeg(deg);
  switch (quadrant) {
    case 0:
      return sinFirstQuadrant(r);
    case 1:
      return cosFirstQuadrant(r);
    case 2:
      return -sinFirstQuadrant(r);
    default:
      return -cosFirstQuadrant(r);
  }
}

export function cosDeg(deg) {
  const { quadrant, r } = reduceDeg(deg);
  switch (quadrant) {
    case 0:
      return cosFirstQuadrant(r);
    case 1:
      return -sinFirstQuadrant(r);
    case 2:
      return -cosFirstQuadrant(r);
    default:
      return sinFirstQuadrant(r);
  }
}

// ln2 を上位・下位の2つに分けた定数（fdlibm と同じ値）。z − n·ln2 を誤差なく計算するため。
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e0;

/** 指数関数。exp(z) = 2^n × exp(r)、|r| <= ln2/2 に分けて級数で計算する。 */
export function exp(z) {
  if (z > 700) return Infinity;
  if (z < -745) return 0;
  const n = Math.round(z * INV_LN2);
  const r = z - n * LN2_HI - n * LN2_LO;
  let term = 1;
  let sum = 1;
  for (let i = 1; i < 22; i += 1) {
    term *= r / i;
    sum += term;
  }
  let scale = 1;
  const base = n >= 0 ? 2 : 0.5;
  for (let i = 0; i < Math.abs(n); i += 1) scale *= base;
  return sum * scale;
}

/** 7乗（掛け算だけ）。 */
export function pow7(x) {
  const x2 = x * x;
  const x3 = x2 * x;
  return x3 * x3 * x;
}
