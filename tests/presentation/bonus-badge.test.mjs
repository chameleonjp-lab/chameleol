import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountBonusPresentation} from '../../src/presentation/bonus-view.js';
import {createPresentationScope} from '../../src/presentation/scope.js';
import {buildBonusBatch} from '../../src/presentation/bonus-data.js';

const event = {building: 10, t: 50000, basePoints: 118, bonusPoints: 40, points: 158, bonusAwards: [['precision', 10, 30], ['steady', null, 10]].map(([kind, tier, points]) => ({id: `v3:10:${kind}`, building: 10, kind, tier, points, earnedAtT: 50000}))};
const badge = (elapsedMs, over = {}) => ({id: 'precision:3:2500', kind: 'nearPerfect', building: 3, startedAt: 2500, phase: 'notice', elapsedMs, ...over});
function mount(t) {
  const {document} = parseHTML('<html><body><main></main></body></html>');
  const host = document.querySelector('main'), scope = createPresentationScope({id: 'bonus', kind: 'game'});
  const view = mountBonusPresentation({host, scope, t, reducedMotion: false});
  return {host, view, card: host.querySelector('.bonus-card'), scope};
}
const base = {phase: 'eval', guideActive: false, warningActive: false, running: true};

test('badge_is_shown_without_a_batch_during_evaluation_and_carries_no_points', () => {
  const {view, card} = mount();
  view.tick({...base, activeMs: 2500, precisionBadge: badge(0)});
  assert.equal(card.hidden, false);
  assert.ok(card.classList.contains('is-badge-only'));
  const el = card.querySelector('.bonus-card-notices .bonus-card-badge');
  assert.ok(el);
  assert.equal(el.textContent, '◎ 98%');
  assert.equal(card.querySelector('.bonus-card-points').textContent, '');
  assert.doesNotMatch(card.textContent, /\+\d/);
  assert.equal(view.stats().badge, true);
  assert.equal(view.stats().particles, 0);
});

test('badge_keeps_the_agreed_numeric_placeholder_without_requesting_a_missing_translation', () => {
  const keys=[];
  const {view, card} = mount(key => {keys.push(key);return key;});
  view.tick({...base, activeMs: 2500, precisionBadge: badge(300)});
  assert.equal(card.querySelector('.bonus-card-badge').textContent, '◎ 98%');
  assert.equal(keys.includes('presentation.nearPerfect'),false,'translations are deferred until both implementations are complete');
});

test('badge_enter_and_leave_follow_the_controller_elapsed_time', () => {
  const {view, card} = mount();
  view.tick({...base, activeMs: 2500, precisionBadge: badge(75)});
  assert.equal(card.style.getPropertyValue('--bonus-enter'), '0.5');
  assert.equal(card.style.getPropertyValue('--bonus-progress'), '0');
  view.tick({...base, activeMs: 3900, precisionBadge: badge(1325)});
  assert.equal(card.style.getPropertyValue('--bonus-enter'), '1');
  assert.equal(card.style.getPropertyValue('--bonus-progress'), '0.5');
  assert.ok(card.classList.contains('is-leaving'));
});

test('guide_and_warning_hide_the_badge_as_the_tick_values_say', () => {
  for (const block of [{guideActive: true}, {warningActive: true}]) {
    const {view, card} = mount();
    view.tick({...base, activeMs: 2500, precisionBadge: badge(100), ...block});
    assert.equal(card.hidden, true, JSON.stringify(block));
    assert.equal(view.stats().badge, false);
    // The same badge value comes back after the block ends: it is not re-claimed or extended here.
    view.tick({...base, activeMs: 2600, precisionBadge: badge(200)});
    assert.equal(card.hidden, false);
  }
});

test('null_removes_the_badge_and_the_card_is_hidden_again', () => {
  const {view, card} = mount();
  view.tick({...base, activeMs: 2500, precisionBadge: badge(100)});
  assert.equal(card.hidden, false);
  view.tick({...base, activeMs: 4000, precisionBadge: null});
  assert.equal(card.hidden, true);
  assert.equal(card.querySelector('.bonus-card-badge'), null);
  assert.equal(card.classList.contains('is-badge-only'), false);
});

test('show_batch_does_not_clear_the_badge_and_the_badge_joins_the_notice_line', () => {
  const {view, card} = mount();
  view.tick({...base, activeMs: 50000, precisionBadge: badge(200)});
  const batch = buildBonusBatch({playId: 'p', passEvent: {...event, notices: ['One']}});
  batch.notices = ['Notice A'];
  assert.equal(view.show(batch, 50010), true);
  // show() ticks internally without a precisionBadge entry: the earlier value must survive.
  assert.equal(view.stats().badge, true);
  const notices = card.querySelector('.bonus-card-notices');
  assert.match(notices.textContent, /Notice A · ◎ 98%/);
  assert.equal(card.classList.contains('is-badge-only'), false);
  assert.match(card.querySelector('.bonus-card-points').textContent, /\+40/);
  // The batch later hides in evaluation but the badge keeps going.
  view.tick({...base, activeMs: 50200, phase: 'eval', precisionBadge: badge(400)});
  assert.equal(card.hidden, false);
  assert.ok(card.classList.contains('is-badge-only'));
  assert.doesNotMatch(card.querySelector('.bonus-card-notices').textContent, /Notice A/);
});

test('a_normal_batch_keeps_its_own_clock_when_no_badge_is_given', () => {
  const {view, card} = mount();
  const batch = buildBonusBatch({playId: 'p', passEvent: event});
  view.show(batch, 50000);
  assert.equal(card.hidden, false);
  view.tick({...base, phase: 'grace', activeMs: 51400});
  assert.equal(card.hidden, true);
  assert.equal(card.querySelector('.bonus-card-badge'), null);
});

test('badge_does_not_award_points_or_start_sounds_and_is_removed_with_the_scope', () => {
  const {view, host, scope} = mount();
  view.tick({...base, activeMs: 2500, precisionBadge: badge(100)});
  assert.equal(host.querySelectorAll('.bonus-award').length, 0);
  scope.dispose();
  assert.equal(host.querySelector('.bonus-card'), null);
  view.tick({...base, activeMs: 2600, precisionBadge: badge(200)});
});

test('invalid_badge_values_are_ignored', () => {
  const {view, card} = mount();
  for (const bad of [undefined, {}, {elapsedMs: -5}, {elapsedMs: NaN}, 'x']) {
    view.tick({...base, activeMs: 2500, precisionBadge: bad});
    assert.equal(card.hidden, true, String(bad));
  }
});

// ---------------------------------------------------------------------------------------------
// Real controller -> bonus tick: a badge from t=2000 for 1400ms, with no batch, before any pass.
import {createGameExtrasController} from '../../src/presentation/game-extras-controller.js';

const flushTurn = () => new Promise(resolve => setImmediate(resolve));
function badgeRig() {
  const controller = createGameExtrasController({playId: 'badge', seed: 1, extrasPort: {fresh: true, claimCameoStart: async () => false, claimPrecisionBadge: async () => true}});
  const m = mount();
  const input = (t, over = {}) => ({t, playId: 'badge', building: 1, passed: 0, phase: 'eval', running: true, hidden: false, policeStage: 0, matchState: null, guideActive: false, guidanceActive: false, warningActive: false, drawable: true, frameIntervalMs: 16, bestDistance: null, actorBusy: {hero: false, police: false}, placements: {}, reducedMotion: false, evaluationSegments: [], ...over});
  return {controller, ...m, input};
}
const segment = {building: 1, from: 1500, to: 2000, evaluationEnd: 5000, matchUnits: 9900, unitsPerPercent: 100};

test('t=2000..3400: the controller badge shows in a batch-less evaluation before the first pass and ends on its own', async () => {
  const {controller, view, card, input} = badgeRig();
  try {
    controller.step(input(1990));
    controller.step(input(2000, {evaluationSegments: [segment]}));
    await flushTurn(); await flushTurn();
    const seen = [];
    for (let t = 2000; t <= 3500; t += 100) {
      const quietFrame = controller.step(input(t));
      view.tick({activeMs: t, phase: 'eval', guideActive: false, warningActive: false, running: true, precisionBadge: quietFrame.precisionBadge});
      seen.push([t, !card.hidden]);
    }
    assert.deepEqual(seen.filter(([t]) => t < 3400).map(x => x[1]), Array(14).fill(true), '2000..3399 visible');
    assert.deepEqual(seen.filter(([t]) => t >= 3400).map(x => x[1]), [false, false]);
  } finally { controller.dispose(); }
});

test('a warning in the middle hides the badge without extending or re-claiming it', async () => {
  const {controller, view, card, input} = badgeRig();
  try {
    controller.step(input(2000, {evaluationSegments: [segment]}));
    await flushTurn(); await flushTurn();
    const at = (t, over = {}) => { const f = controller.step(input(t, over)); view.tick({activeMs: t, phase: 'eval', guideActive: false, warningActive: !!over.warningActive, running: true, precisionBadge: f.precisionBadge}); return !card.hidden; };
    assert.equal(at(2100), true);
    assert.equal(at(2300, {warningActive: true}), false);
    assert.equal(at(3000), true, 'the original window is still running after the warning');
    assert.equal(at(3400), false, 'no extension of the 1400ms');
    assert.equal(at(3500), false);
  } finally { controller.dispose(); }
});

test('before the first pass and with no badge the card stays hidden', () => {
  const {view, card} = mount();
  for (let t = 0; t < 5000; t += 250) { view.tick({activeMs: t, phase: t % 2 ? 'eval' : 'grace', running: true, precisionBadge: null}); assert.equal(card.hidden, true); }
});
