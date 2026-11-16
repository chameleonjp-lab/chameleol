// 結果カード 1200×630。画面の canvas と共有用 PNG の canvas が、同じ関数でこの絵を描く。
// 文言は引数の locale で引く（言語の切り替え中でも画面と PNG が同じになる）。画像は読まず、地区の空は手続きで描く。
// 名前・内部ID・seed・照会情報・未確定の順位は描かない（F11）。称号・件数・ベスト棟・実色は model（処理側）の値をそのまま使う。
import { t, formatNumber } from '../i18n/i18n.js';
import { drawDistrictSky, districtIndexForBuilding } from './result-sky.js';
import { rtext } from './result-card-text.js';

export const CARD_W = 1200;
export const CARD_H = 630;
export const CARD_LAYOUT_KEY = 'card-1200x630-v1';

const FAMILY = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans", "Noto Sans JP", "Noto Sans Thai", "Noto Sans Arabic", sans-serif';
const fontOf = (weight, size) => `${weight} ${size}px ${FAMILY}`;
const CONFIRMING_STATES = ['accepted', 'verifying', 'pending_review', 'under_review'];
const NO_LINE_START = new Set([...'ー。、！？）」』，．…!?)]},.:;']);
const COLON_LOCALES = new Set(['ja', 'zh-Hans', 'zh-Hant']);

// ---------- 文言 ----------
/** 「{key}」を含む定型文を、前・後の文字列に分ける。無ければ [全体, '']。 */
function splitTemplate(key, name, locale) {
  const template = t(key, { [name]: `{${name}}` }, locale);
  const at = template.indexOf(`{${name}}`);
  return at < 0 ? [template, ''] : [template.slice(0, at), template.slice(at + name.length + 2)];
}

function bonusMissingText(locale) {
  const own = rtext('card.bonusMissing', undefined, locale);
  return own ?? `${t('bonus.card.title', undefined, locale)} ${t('evidence.colors.missing', undefined, locale)}`;
}

/** 主人公の下の帯の文。棟平均・瞬間一致度の数値は載せない（F08 の分離）。 */
export function heroCaption(model, locale, { failed = false, portrait = null } = {}) {
  const hero = model?.hero;
  if (!hero || hero.status === 'pending') return t('evidence.pending', undefined, locale);
  if (failed && !portrait) return t('card.failed', undefined, locale);
  if (hero.status === 'matched') {
    const colon = COLON_LOCALES.has(locale) ? '：' : ': ';
    return `${t('resultBestBuilding', undefined, locale)}${colon}${t('evidence.building', { building: hero.building }, locale)}`;
  }
  return t('card.noRecord', undefined, locale);
}

/** カードに載る文字を言語ごとに組む。読み上げ（aria-label）・画面の1行・試験が同じ文を使う。 */
export function describeResultCard(model, locale, options = {}) {
  const lang = locale ?? model?.locale ?? 'en';
  const title = model?.rankKey ? t(`card.rank.${model.rankKey}`, undefined, lang) : t('card.confirming', undefined, lang);
  const [scorePre, scorePost] = splitTemplate('card.score', 'score', lang);
  const [countPre, countPost] = splitTemplate('card.bonusCount', 'count', lang);
  const [passedPre, passedPost] = splitTemplate('card.passed', 'count', lang);
  const total = Number.isSafeInteger(model?.totalScore) ? formatNumber(model.totalScore, {}, lang) : '—';
  const bonusKnown = model?.countState === 'known' && Number.isSafeInteger(model?.bonusCount);
  const bonusNumber = bonusKnown ? formatNumber(model.bonusCount, {}, lang) : null;
  const passedNumber = Number.isSafeInteger(model?.passed) ? formatNumber(model.passed, {}, lang) : '—';
  const showConfirming = Boolean(model?.rankKey) && CONFIRMING_STATES.includes(model?.verificationState);
  const caption = heroCaption(model, lang, options);
  const bonusText = bonusKnown ? `${countPre}${bonusNumber}${countPost}` : bonusMissingText(lang);
  const summary = `${title} · ${bonusText}`;
  const label = [
    `${t('app.title', undefined, lang)}: ${title}.`,
    `${t('result.total', undefined, lang)} ${scorePre}${total}${scorePost}.`,
    `${bonusText}.`,
    `${passedPre}${passedNumber}${passedPost}.`,
    `${caption}.`,
    showConfirming ? `${t('card.confirming', undefined, lang)}.` : '',
  ].filter(Boolean).join(' ');
  return { title, scorePre, scorePost, countPre, countPost, passedPre, passedPost, total, bonusNumber, bonusKnown, bonusText, passedNumber, showConfirming, caption, summary, label };
}

// ---------- 文字の収め方 ----------
function tokensOf(text, locale) {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      return [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)].map((s) => s.segment);
    }
  } catch { /* 古い環境では下の分け方 */ }
  return /[　-鿿＀-￯฀-๿]/.test(text) ? [...text] : text.split(/(\s+)/).filter(Boolean);
}

/** 幅 maxW に収まるよう貪欲に折り返す。行頭に禁則の文字を置かない。長すぎる語は1文字ずつ。 */
export function wrapLines(measure, text, maxW, locale) {
  const toks = [];
  for (const tok of tokensOf(text, locale)) {
    if (measure(tok) > maxW) toks.push(...[...tok]);
    else toks.push(tok);
  }
  const lines = [];
  let line = '';
  for (const tok of toks) {
    const candidate = line + tok;
    if (line === '' || measure(candidate.trimEnd()) <= maxW || NO_LINE_START.has([...tok][0])) line = line === '' ? tok.trimStart() || tok : candidate;
    else { lines.push(line.trimEnd()); line = tok.trimStart(); }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [''];
}

/**
 * 称号などの長い文字の収め方（設計票 §3.3.1）。
 * 1 行（72→48px）→ 2 行（60→40px）→ 40px・2 行・横を最大 12% 縮める → 3 行。省略記号は使わない。
 * 戻り値の stage は 1〜4。3 以上へ進んだ件数を試験で数える。
 */
export function fitTitle(measureAt, text, locale, box = { w: 548, h: 152 }) {
  // measureAt(text, size) は太さ 900 での幅を返す。
  for (let size = 72; size >= 48; size -= 4) {
    if (measureAt(text, size) <= box.w) return { lines: [text], size, scaleX: 1, stage: 1 };
  }
  for (let size = 60; size >= 40; size -= 4) {
    const lines = wrapLines((s) => measureAt(s, size), text, box.w, locale);
    if (lines.length <= 2 && lines.length * size * 1.15 <= box.h) return { lines, size, scaleX: 1, stage: 2 };
  }
  {
    const lines = wrapLines((s) => measureAt(s, 40), text, box.w / 0.88, locale);
    if (lines.length <= 2) {
      const widest = Math.max(...lines.map((l) => measureAt(l, 40)));
      return { lines, size: 40, scaleX: Math.min(1, Math.max(0.88, box.w / widest)), stage: 3 };
    }
  }
  for (let size = 40; size >= 28; size -= 2) {
    const lines = wrapLines((s) => measureAt(s, size), text, box.w, locale);
    if (lines.length <= 3 && lines.length * size * 1.15 <= box.h) return { lines, size, scaleX: 1, stage: 4 };
  }
  const lines = wrapLines((s) => measureAt(s, 28), text, box.w, locale).slice(0, 3);
  const widest = Math.max(...lines.map((l) => measureAt(l, 28)));
  return { lines, size: 28, scaleX: Math.min(1, box.w / widest), stage: 4 };
}

/** 数字つきの1行（前の文字・数字・後ろの文字）を幅に収める。縮める順は数字→全体→横。 */
export function fitRow(measurePart, parts, maxW, { minNumber = 0.7, minX = 0.85 } = {}) {
  const sizes = parts.map((p) => p.size);
  const total = (k = 1) => parts.reduce((sum, p, i) => sum + (p.text ? measurePart(p, sizes[i] * k) : 0), 0);
  let stage = 0;
  const numberIndex = parts.findIndex((p) => p.number);
  if (numberIndex >= 0) {
    const floor = parts[numberIndex].minSize ?? parts[numberIndex].size * minNumber;
    while (total() > maxW && sizes[numberIndex] - 4 >= floor) { sizes[numberIndex] -= 4; stage = 1; }
  }
  let k = 1;
  while (total(k) > maxW && k > minNumber) { k = Math.max(minNumber, +(k - 0.05).toFixed(2)); stage = 2; }
  let scaleX = 1;
  const width = total(k);
  if (width > maxW) { scaleX = Math.max(minX, maxW / width); stage = 3; }
  const finalWidth = total(k) * scaleX;
  const squeeze = finalWidth > maxW ? maxW / finalWidth : 1;
  if (squeeze < 1) { scaleX *= squeeze; stage = 4; }
  return { sizes: sizes.map((s) => s * k), scaleX, width: total(k) * scaleX, stage };
}

// ---------- 描画の部品 ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

function drawBackground(ctx, model) {
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, '#1d2a5a');
  g.addColorStop(1, '#14183a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (model?.passed === 50) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,224,102,0.10)';
    for (let a = 0; a < 360; a += 20) {
      const r0 = (a * Math.PI) / 180, r1 = ((a + 10) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(880, -40);
      ctx.lineTo(880 + Math.cos(r0) * 1400, -40 + Math.sin(r0) * 1400);
      ctx.lineTo(880 + Math.cos(r1) * 1400, -40 + Math.sin(r1) * 1400);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 18; i += 1) {
    ctx.beginPath();
    ctx.arc(620 + ((i * 137) % 560), 24 + ((i * 89) % 150), 1.5 + (i % 3) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 影絵（主人公が撮れていない時）。結果パネルの SILHOUETTE と同じ形で、中心を (57,60) に置く。
function traceSilhouette(ctx) {
  ctx.beginPath();
  ctx.moveTo(20, 86);
  ctx.quadraticCurveTo(5, 30, 57, 28);
  ctx.quadraticCurveTo(110, 20, 108, 67);
  ctx.quadraticCurveTo(108, 100, 80, 93);
  ctx.quadraticCurveTo(55, 85, 79, 70);
  ctx.quadraticCurveTo(95, 62, 92, 78);
  ctx.closePath();
}

function drawPhoto(ctx, model, portrait, caption, lang) {
  ctx.save();
  ctx.shadowColor = '#0006';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#eee8d4';
  roundRect(ctx, 36, 36, 516, 558, 8);
  ctx.fill();
  ctx.restore();
  const hero = model?.hero;
  const building = hero?.status === 'matched' ? hero.building : Math.min(50, (Number.isInteger(model?.passed) ? model.passed : 0) + 1);
  drawDistrictSky(ctx, districtIndexForBuilding(building), [48, 48, 492, 486]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(48, 48, 492, 486);
  ctx.clip();
  const glow = ctx.createRadialGradient(294, 320, 0, 294, 320, 260);
  glow.addColorStop(0, 'rgba(255,255,255,0.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(48, 48, 492, 486);
  // 台
  ctx.fillStyle = 'rgba(36,57,75,0.35)';
  ellipse(ctx, 294, 518, 96, 12);
  ctx.fill();
  ctx.fillStyle = '#a8957f';
  ellipse(ctx, 294, 530, 75, 12);
  ctx.fill();
  ctx.fillRect(219, 520, 150, 10);
  ctx.fillStyle = '#cbb9a4';
  ellipse(ctx, 294, 520, 75, 12);
  ctx.fill();
  ctx.strokeStyle = '#24394b';
  ctx.lineWidth = 3;
  ellipse(ctx, 294, 520, 75, 12);
  ctx.stroke();
  ctx.fillStyle = 'rgba(36,57,75,0.35)';
  ellipse(ctx, 294, 518, 48, 6);
  ctx.fill();
  // 主人公
  const w = portrait?.width ?? portrait?.naturalWidth, h = portrait?.height ?? portrait?.naturalHeight;
  if (portrait && w > 8 && h > 8) {
    let s = 430 / (h - 8);
    s = Math.min(s, 470 / w);
    const dw = w * s, dh = h * s;
    ctx.drawImage(portrait, 294 - dw / 2, 516 - (h - 4) * s, dw, dh);
  } else {
    ctx.save();
    ctx.translate(294, 330);
    ctx.scale(3.6, 3.6);
    ctx.translate(-57, -60);
    traceSilhouette(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3 / 3.6;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // 帯
  fitCaption(ctx, caption, lang);
}

function fitCaption(ctx, text, lang) {
  const box = { x: 48, w: 492, y: 534, h: 48 };
  const m = (s, size) => { ctx.font = fontOf(700, size); return ctx.measureText(s).width; };
  let size = 28, lines = [text], scaleX = 1;
  while (size > 22 && m(text, size) > box.w) size -= 2;
  if (m(text, size) > box.w) {
    if (m(text, 22) * 0.85 <= box.w) { size = 22; scaleX = Math.max(0.85, box.w / m(text, 22)); }
    else { size = 22; lines = wrapLines((s) => m(s, 22), text, box.w, lang).slice(0, 2); }
  }
  ctx.save();
  ctx.fillStyle = '#342811';
  ctx.font = fontOf(700, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lineH = size * 1.1;
  const top = box.y + (box.h - lines.length * lineH) / 2 + size * 0.85;
  ctx.translate(box.x + box.w / 2, 0);
  ctx.scale(scaleX, 1);
  lines.forEach((line, i) => ctx.fillText(line, 0, top + i * lineH));
  ctx.restore();
}

function drawDiamond(ctx, x, y) {
  const cx = x + 12, top = y, mid = y + 16, bottom = y + 32;
  const facets = [
    [[cx, top], [x, mid], [cx, mid], '#c9fbff'],
    [[cx, top], [x + 24, mid], [cx, mid], '#ffffff'],
    [[x, mid], [cx, bottom], [cx, mid], '#5fd8ee'],
    [[x + 24, mid], [cx, bottom], [cx, mid], '#5fd8ee'],
  ];
  for (const [a, b, c, color] of facets) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.lineTo(...c);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#24394b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(x + 24, mid);
  ctx.lineTo(cx, bottom);
  ctx.lineTo(x, mid);
  ctx.closePath();
  ctx.stroke();
}

function drawGameName(ctx, lang) {
  drawDiamond(ctx, 592, 60);
  const text = t('app.title', undefined, lang);
  const maxW = 1164 - 624;
  let size = 40;
  const m = (s, z) => { ctx.font = fontOf(900, z); return ctx.measureText(s).width; };
  while (size > 28 && m(text, size) > maxW) size -= 2;
  const scaleX = m(text, size) > maxW ? maxW / m(text, size) : 1;
  ctx.save();
  ctx.font = fontOf(900, size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0a0c1e';
  ctx.translate(624, 92);
  ctx.scale(scaleX, 1);
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#8dff6a';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawTitlePlate(ctx, info, model, lang) {
  const full = model?.passed === 50;
  ctx.save();
  ctx.fillStyle = '#232a5e';
  roundRect(ctx, 592, 112, 572, 176, 18);
  ctx.fill();
  ctx.strokeStyle = full ? '#ffd43b' : '#ffe694';
  ctx.lineWidth = full ? 6 : 4;
  roundRect(ctx, 592, 112, 572, 176, 18);
  ctx.stroke();
  ctx.restore();
  const measureAt = (s, size) => { ctx.font = fontOf(900, size); return ctx.measureText(s).width; };
  const fit = fitTitle(measureAt, info.title, lang);
  ctx.save();
  ctx.fillStyle = '#fff6d6';
  ctx.font = fontOf(900, fit.size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lineH = fit.size * 1.15;
  const first = 124 + (152 - fit.lines.length * lineH) / 2 + fit.size * 0.88;
  ctx.translate(878, 0);
  ctx.scale(fit.scaleX, 1);
  fit.lines.forEach((line, i) => ctx.fillText(line, 0, first + i * lineH));
  ctx.restore();
  return fit;
}

function drawRowParts(ctx, fit, parts, x, baseline) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.translate(x, 0);
  ctx.scale(fit.scaleX, 1);
  let cursor = 0;
  parts.forEach((part, i) => {
    if (!part.text) return;
    const size = fit.sizes[i];
    ctx.font = fontOf(part.weight, size);
    if (part.shadow) { ctx.fillStyle = part.shadow; ctx.fillText(part.text, cursor, baseline + 6); }
    if (part.gradient) {
      const g = ctx.createLinearGradient(0, baseline - size, 0, baseline);
      part.gradient.forEach(([stop, color]) => g.addColorStop(stop, color));
      ctx.fillStyle = g;
    } else ctx.fillStyle = part.fill;
    ctx.fillText(part.text, cursor, baseline);
    cursor += ctx.measureText(part.text).width;
  });
  ctx.restore();
}

/**
 * 主カードを canvas へ描く。canvas の大きさが 1200×630 でなくても（準備中の 600×315 など）同じ座標系で描く。
 * options: { model, portrait: 切り抜き画像|null, locale, failed?: 準備失敗の画面用 }
 * 戻り値は文字の収め方の記録（試験用）。
 */
export function drawResultCard(canvas, { model, portrait = null, locale, failed = false } = {}) {
  const ctx = canvas.getContext('2d');
  const lang = locale ?? model?.locale ?? 'en';
  const info = describeResultCard(model, lang, { failed, portrait });
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / CARD_W, canvas.height / CARD_H);
  drawBackground(ctx, model);
  drawPhoto(ctx, model, portrait, info.caption, lang);
  drawGameName(ctx, lang);
  const titleFit = drawTitlePlate(ctx, info, model, lang);
  const measurePart = (p, size) => { ctx.font = fontOf(p.weight, size); return ctx.measureText(p.text).width; };

  // 総得点の見出しと確認中の札
  const confirmingText = t('card.confirming', undefined, lang);
  let headingSize = 30;
  const mHead = (z) => { ctx.font = fontOf(700, z); return ctx.measureText(t('result.total', undefined, lang)).width; };
  let badgeSize = 26;
  const mBadge = (z) => { ctx.font = fontOf(800, z); return ctx.measureText(confirmingText).width + 32; };
  if (info.showConfirming) {
    const room = () => 1164 - mBadge(badgeSize) - 12 - 592;
    while (headingSize > 22 && mHead(headingSize) > room()) headingSize -= 2;
    while (badgeSize > 20 && mHead(headingSize) > room()) badgeSize -= 2;
  } else {
    while (headingSize > 22 && mHead(headingSize) > 572) headingSize -= 2;
  }
  ctx.font = fontOf(700, headingSize);
  ctx.fillStyle = '#fff0a0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t('result.total', undefined, lang), 592, 336);
  if (info.showConfirming) {
    const bw = mBadge(badgeSize);
    ctx.fillStyle = '#ffcc4d';
    roundRect(ctx, 1164 - bw, 306, bw, 40, 20);
    ctx.fill();
    ctx.font = fontOf(800, badgeSize);
    ctx.fillStyle = '#3b2a00';
    ctx.fillText(confirmingText, 1164 - bw + 16, 334);
  }

  // 総得点
  const scoreParts = [
    { text: info.scorePre, weight: 700, size: 40, fill: '#fff0a0' },
    { text: info.total, weight: 900, size: 132, number: true, minSize: 88, gradient: [[0, '#fff6b0'], [0.5, '#ffd43b'], [1, '#ff922b']], shadow: '#5c3a00' },
    { text: info.scorePost, weight: 700, size: 40, fill: '#fff0a0' },
  ];
  const scoreFit = fitRow(measurePart, scoreParts, 572);
  drawRowParts(ctx, scoreFit, scoreParts, 592, 470);

  // ボーナス件数（旧版・破損は「記録なし」、0 件は 0）
  let bonusFit;
  if (info.bonusKnown) {
    const parts = [
      { text: info.countPre, weight: 800, size: 34, fill: '#fff6d6' },
      { text: info.bonusNumber, weight: 900, size: 60, number: true, fill: '#ffffff' },
      { text: info.countPost, weight: 800, size: 34, fill: '#fff6d6' },
    ];
    bonusFit = fitRow(measurePart, parts, 572);
    drawRowParts(ctx, bonusFit, parts, 592, 540);
  } else {
    const parts = [{ text: info.bonusText, weight: 800, size: 34, fill: '#b9bee6' }];
    bonusFit = fitRow(measurePart, parts, 572);
    drawRowParts(ctx, bonusFit, parts, 592, 540);
  }

  // 通過数
  const passedParts = [
    { text: info.passedPre, weight: 700, size: 28, fill: '#b9bee6' },
    { text: info.passedNumber, weight: 900, size: 34, number: true, fill: '#ffffff' },
    { text: info.passedPost, weight: 700, size: 28, fill: '#b9bee6' },
  ];
  const passedFit = fitRow(measurePart, passedParts, 572);
  drawRowParts(ctx, passedFit, passedParts, 592, 592);
  ctx.restore();
  return { title: titleFit, score: scoreFit, bonus: bonusFit, passed: passedFit, headingSize, badgeSize };
}
