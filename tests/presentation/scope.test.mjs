import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationScope } from '../../src/presentation/scope.js';
import { ACCEPTED_EFFECT_IDS, EXCLUDED_EFFECT_IDS, PRESENTATION_LIMITS } from '../../src/presentation/catalog.js';
const create = (kind = 'game') => createPresentationScope({ id: kind, kind });
test('dispose_twice_cleans_once', () => {
  const scope = create(); let calls = 0;
  const cleanup = () => calls++;
  scope.own(cleanup); scope.own(cleanup);
  assert.equal(scope.isCurrent('game'), true);
  assert.equal(scope.isCurrent('other'), false);
  scope.dispose(); scope.dispose();
  assert.equal(calls, 1); assert.equal(scope.isCurrent('game'), false);
  scope.own(() => calls++); assert.equal(calls, 2);
});
test('paused_tick_does_not_advance', () => {
  const scope = create(); let calls = 0;
  scope.tick(100); scope.schedule('sound', 50, () => calls++);
  scope.tick(100); scope.tick(100); scope.tick(149);
  assert.equal(calls, 0); scope.tick(150); scope.tick(200); assert.equal(calls, 1);
});
test('ending_scope_starts_at_zero_after_game_dispose', () => {
  const game = create(); game.tick(250000); game.dispose();
  const ending = create('ending'); let calls = 0;
  ending.schedule('end', 100, () => calls++); ending.tick(0); ending.tick(99);
  assert.equal(calls, 0); ending.tick(100); assert.equal(calls, 1);
});
test('disposed_callback_is_ignored', () => {
  const scope = create(); let calls = 0;
  scope.schedule('a', 5, () => calls++); scope.dispose();
  scope.tick(10); scope.schedule('b', 0, () => calls++); scope.tick(20);
  assert.equal(calls, 0);
});
test('keyed_replacement_and_monotonic_clock', () => {
  const scope = create(); const calls = [];
  scope.tick(100); scope.schedule('a', 5, () => calls.push('old'));
  scope.schedule('a', 10, () => calls.push('new'));
  scope.tick(105); scope.tick(0); scope.tick(NaN);
  scope.schedule('b', 5, () => calls.push('b')); scope.tick(110);
  assert.deepEqual(calls, ['new', 'b']);
});
test('callback_disposal_cancels_other_due_work', () => {
  const scope = create(); let calls = 0;
  scope.schedule('a', 0, () => scope.dispose());
  scope.schedule('b', 0, () => calls++); scope.tick(0);
  assert.equal(calls, 0);
});
test('catalog_keeps_exact_accepted_and_excluded_ids', () => {
  assert.equal(ACCEPTED_EFFECT_IDS.length, 80); assert.equal(EXCLUDED_EFFECT_IDS.length, 20);
  assert.deepEqual([...ACCEPTED_EFFECT_IDS, ...EXCLUDED_EFFECT_IDS].sort((a,b) => a-b), Array.from({length:100}, (_,i) => i+1));
  assert.equal(PRESENTATION_LIMITS.ambientParticles, 8);
});
