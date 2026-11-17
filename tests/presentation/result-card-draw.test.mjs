import test from 'node:test';
import assert from 'node:assert/strict';
import { drawResultCard, describeResultCard, fitTitle, fitRow, wrapLines, heroCaption, CARD_LAYOUT_KEY } from '../../src/presentation/result-card-draw.js';
import { rankForPassed } from '../../src/presentation/result-card-data.js';
import { RESULT_TITLES } from '../../src/presentation/result-titles.js';
import { setLanguage, t } from '../../src/i18n/i18n.js';
import { LANGUAGE_IDS } from '../../src/i18n/languages.js';
import { createFakeContext } from './helpers/fake-canvas.mjs';

const matched = { status: 'matched', building: 12, hsv: { h: 1, s: 1, v: 1 }, outlineBuilding: 12, average: 90, instantMatch: 99 };
const model = (over = {}) => ({ revision: 1, locale: 'ja', passed: 20, rankKey: 'expert', totalScore: 7280, bonusCount: 23, countState: 'known', hero: matched, verificationState: null, ...over });
const fakeCanvas = (w = 1200, h = 630) => { const c = { width: w, height: h }; c.ctx = createFakeContext(c); c.getContext = () => c.ctx; return c; };
const widthAt = (ctx) => (s, size) => { ctx.font = `900 ${size}px sans-serif`; return ctx.measureText(s).width; };
const LANG_IDS = LANGUAGE_IDS;

test('the layout key is the drawing version only', () => {
  assert.equal(CARD_LAYOUT_KEY, 'card-1200x630-v1');
});

test('texts follow the locale argument, not the current UI language', () => {
  setLanguage('ja');
  const en = describeResultCard(model({ locale: 'en' }), 'en');
  const de = describeResultCard(model({ locale: 'de' }), 'de');
  assert.equal(en.title, t('card.rank.expert', undefined, 'en'));
  assert.equal(de.title, t('card.rank.expert', undefined, 'de'));
  assert.notEqual(en.title, de.title);
  assert.equal(en.countPre + en.bonusNumber + en.countPost, t('card.bonusCount', { count: '23' }, 'en'));
  assert.equal(en.scorePre + en.total + en.scorePost, t('card.score', { score: '7,280' }, 'en'));
  assert.equal(setLanguage('ja'), true);
});

test('pending, missing, failed, confirming and old-version records have their own wording', () => {
  setLanguage('ja');
  const pending = describeResultCard(model({ hero: { status: 'pending', building: null, hsv: null, outlineBuilding: 1 } }), 'ja');
  assert.equal(pending.caption, t('evidence.pending'));
  const missing = describeResultCard(model({ hero: { status: 'missing', building: null, hsv: { h: 1, s: 1, v: 1 }, outlineBuilding: 1 } }), 'ja');
  assert.equal(missing.caption, t('card.noRecord'));
  assert.equal(heroCaption(model(), 'ja', { failed: true, portrait: null }), t('card.failed'));
  assert.equal(heroCaption(model(), 'ja', { failed: true, portrait: {} }), heroCaption(model(), 'ja'), 'a failed share with a prepared portrait keeps the normal caption');
  assert.match(heroCaption(model(), 'ja'), new RegExp(t('resultBestBuilding')));
  assert.ok(!/\d+(\.\d+)?%/.test(heroCaption(model(), 'ja')), 'averages and instant matches are not printed');
  const confirming = describeResultCard(model({ verificationState: 'pending_review' }), 'ja');
  assert.equal(confirming.showConfirming, true);
  assert.equal(describeResultCard(model({ verificationState: 'official' }), 'ja').showConfirming, false, 'an official state prints no rank and no badge');
  assert.equal(describeResultCard(model({ verificationState: 'pending_review', rankKey: null }), 'ja').showConfirming, false, 'the badge needs a rank');
  assert.equal(describeResultCard(model({ rankKey: null }), 'ja').title, t('card.confirming'), 'an unknown rank prints the confirming wording');
  const old = describeResultCard(model({ bonusCount: null, countState: 'missing' }), 'ja');
  assert.equal(old.bonusKnown, false);
  assert.equal(old.bonusText, t('card.bonusMissing'), 'a missing bonus record has its own translated wording');
  const zero = describeResultCard(model({ bonusCount: 0 }), 'ja');
  assert.equal(zero.bonusNumber, '0');
  assert.equal(zero.bonusKnown, true);
  assert.equal(describeResultCard(model({ totalScore: null, passed: null }), 'ja').total, '—');
});

test('the card prints no names, ids, seeds, inquiry data or provisional ranks', () => {
  const canvas = fakeCanvas();
  const hostile = model({ verificationState: 'official', name: 'SECRET-NAME', playId: 'PLAY-123', seed: 987654, rank: 3, official: { rank: 1 }, inquiry: 'INQUIRY-CODE' });
  drawResultCard(canvas, { model: hostile, portrait: null, locale: 'en' });
  const printed = canvas.ctx.texts.map((x) => x.text).join('|');
  for (const secret of ['SECRET-NAME', 'PLAY-123', '987654', 'INQUIRY', 'rank']) assert.ok(!printed.includes(secret), `${secret} is not printed`);
  const label = describeResultCard(hostile, 'en').label;
  for (const secret of ['SECRET-NAME', 'PLAY-123', '987654', 'INQUIRY']) assert.ok(!label.includes(secret));
});

test('a smaller canvas (the preparing card) is drawn in the same 1200x630 coordinates', () => {
  const half = fakeCanvas(600, 315);
  drawResultCard(half, { model: model(), portrait: null, locale: 'ja' });
  const scale = half.ctx.ops.find((op) => op[0] === 'scale');
  assert.deepEqual(scale, ['scale', 0.5, 0.5]);
  const full = fakeCanvas();
  drawResultCard(full, { model: model(), portrait: null, locale: 'ja' });
  assert.deepEqual(half.ctx.texts.map((x) => x.text), full.ctx.texts.map((x) => x.text), 'same words at both sizes');
});

test('the portrait is drawn from its bottom-left margin and a missing portrait falls back to a silhouette', () => {
  const portrait = { width: 248, height: 436 };
  const canvas = fakeCanvas();
  drawResultCard(canvas, { model: model(), portrait, locale: 'ja' });
  const image = canvas.ctx.ops.find((op) => op[0] === 'drawImage' && op[1] === portrait);
  assert.ok(image, 'the borrowed image is drawn');
  const [, , x, y, w, h] = image;
  const s = 430 / (436 - 8);
  assert.ok(Math.abs(h - 436 * s) < 1e-6);
  assert.ok(Math.abs(w - 248 * s) < 1e-6);
  assert.ok(Math.abs(x + w / 2 - 294) < 1e-6, 'centered at x=294');
  assert.ok(Math.abs(y + (436 - 4) * s - 516) < 1e-6, 'feet at y=516');
  const none = fakeCanvas();
  drawResultCard(none, { model: model(), portrait: null, locale: 'ja' });
  assert.equal(none.ctx.ops.filter((op) => op[0] === 'drawImage').length, 0, 'no image: silhouette only');
  assert.ok(none.ctx.ops.some((op) => op[0] === 'quadraticCurveTo'));
});

test('long titles shrink and wrap in the documented order and never use an ellipsis', () => {
  const ctx = createFakeContext();
  const m = widthAt(ctx);
  const short = fitTitle(m, '街の擬態名人', 'ja');
  assert.deepEqual([short.stage, short.size, short.lines.length], [1, 72, 1]);
  const long = fitTitle(m, 'Fluchtkünstler mit tausend Gesichtern', 'de');
  assert.ok(long.stage >= 2 && long.lines.length >= 2);
  for (const lines of [long.lines]) assert.ok(lines.every((l) => !l.includes('…')));
  const box = { w: 548, h: 152 };
  const worst = fitTitle(m, 'Wirklichkeitsverschleierungsmeisterschaftsmannschaftsführer der ganzen Welt und mehr', 'de');
  assert.ok(worst.lines.length <= 3);
  assert.ok(worst.lines.length * worst.size * 1.15 <= box.h + 1e-6);
  assert.ok(worst.lines.every((l) => m(l, worst.size) * worst.scaleX <= box.w + 1e-6), 'nothing leaves the text area');
});

test('a long word is never cut in the middle while a smaller size can hold it', () => {
  const ctx = createFakeContext();
  const m = widthAt(ctx);
  const text = 'aaa bbbbbbbbbbbbbbbbbbbbbbb';
  const fit = fitTitle(m, text, 'en');
  assert.deepEqual(fit.lines, ['aaa', 'bbbbbbbbbbbbbbbbbbbbbbb']);
  assert.ok(fit.lines.every((l) => m(l, fit.size) * fit.scaleX <= 548 + 1e-6));
});

test('a hyphen stays at the end of the previous line, never at the start of the next', () => {
  const ctx = createFakeContext();
  const m = (s) => widthAt(ctx)(s, 40);
  const lines = wrapLines(m, 'Neuer Verfolgungs-Ausweicher', m('Neuer Verfolgungs') + 1, 'de');
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((l) => !l.startsWith('-')), JSON.stringify(lines));
});

test('wrapping keeps closing marks off the start of a line', () => {
  const ctx = createFakeContext();
  const m = (s) => widthAt(ctx)(s, 40);
  const lines = wrapLines(m, 'あいうえお。かきくけこ。', m('あいうえお') + 1, 'ja');
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((l) => !l.startsWith('。')));
});

test('number rows shrink the number first, then the whole row, then squeeze horizontally', () => {
  const ctx = createFakeContext();
  const measure = (p, size) => { ctx.font = `${p.weight} ${size}px sans-serif`; return ctx.measureText(p.text).width; };
  const parts = (n) => [{ text: 'Score:', weight: 700, size: 40 }, { text: n, weight: 900, size: 132, number: true, minSize: 88 }, { text: ' pts', weight: 700, size: 40 }];
  const small = fitRow(measure, parts('7'), 572);
  assert.equal(small.stage, 0);
  const mid = fitRow(measure, parts('123,456'), 572);
  assert.equal(mid.stage, 1);
  assert.ok(mid.sizes[1] < 132 && mid.sizes[1] >= 88 && mid.width <= 572);
  const big = fitRow(measure, parts('1,234,567,890,123'), 572);
  assert.ok(big.width <= 572 + 1e-6, 'it always ends inside the column');
  assert.ok(big.stage >= 2);
});

test('every one of the 27 titles in all 15 languages is a real string and fits in 4 stages', () => {
  const ctx = createFakeContext();
  const m = widthAt(ctx);
  let count = 0;
  for (const lang of LANG_IDS) {
    for (const row of RESULT_TITLES) {
      const text = t(`card.rank.${row.key}`, undefined, lang);
      assert.notEqual(text, `card.rank.${row.key}`, `${lang}/${row.key} exists`);
      const fit = fitTitle(m, text, lang);
      assert.ok(fit.lines.length <= 3, `${lang}/${row.key}`);
      assert.ok(fit.lines.every((l) => !l.includes('…')));
      count += 1;
    }
  }
  assert.equal(count, 405);
  assert.equal(rankForPassed(50).rankKey, 'legend');
});
