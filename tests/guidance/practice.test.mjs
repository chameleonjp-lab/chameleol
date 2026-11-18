import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuidePractice, PRACTICE_STEPS } from '../../src/guidance/practice.js';

test('練習は指定の3つだけで、②だけ移動し、③だけバーを使う', () => {
  assert.deepEqual(PRACTICE_STEPS, [1, 2, 3]);
  assert.throws(() => createGuidePractice({ step: 4 }), /invalid_guide_step/);
  for (const step of PRACTICE_STEPS) {
    const practice = createGuidePractice({ step });
    const view = practice.view();
    assert.equal(view.stationary, step !== 2);
    assert.equal(view.brightnessUnlocked, step === 3);
    assert.deepEqual(practice.course.targets[view.building - 1], view.target);
    practice.setColor({ ...view.target, v: 0 });
    assert.equal(practice.view().color.v, step === 3 ? 0 : 10000);
    if (step === 2) {
      assert.equal(practice.tick(4999).complete, false);
      assert.equal(practice.tick(1).complete, true);
    } else {
      const retry = createGuidePractice({ step });
      assert.equal(retry.tick(5000).elapsed, 0);
      assert.equal(retry.view().complete, false);
      retry.setColor(view.target);
      assert.equal(retry.view().complete, true);
    }
  }
});
