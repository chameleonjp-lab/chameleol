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

test('badge_uses_the_translated_phrase_when_the_key_exists', () => {
  const {view, card} = mount(key => key === 'presentation.nearPerfect' ? 'Nearly perfect!' : key);
  view.tick({...base, activeMs: 2500, precisionBadge: badge(300)});
  assert.equal(card.querySelector('.bonus-card-badge').textContent, '◎ Nearly perfect!');
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
