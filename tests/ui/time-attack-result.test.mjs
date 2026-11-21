import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createTimeAttackResult, TIME_ATTACK_RANKING_URL } from '../../src/ui/time-attack-result.js';
import { t } from '../../src/i18n/i18n.js';
import { CURRENT_RULES_VERSION } from '../../src/rules/time-attack/v1/index.js';

function resultView(options) {
  const { document, window } = parseHTML('<html><body></body></html>');
  const previous = { document: globalThis.document, Node: globalThis.Node };
  Object.assign(globalThis, { document, Node: window.Node });
  try {
    return createTimeAttackResult({ lang: 'ja', ...options });
  } finally {
    Object.assign(globalThis, previous);
  }
}

function finish(elapsedMs) {
  return { reason: 'cleared', clearedCount: 30, elapsedMs, elapsedCs: Math.ceil(elapsedMs / 10) };
}

const part = (el, name) => el.querySelector(`[data-testid="${name}"]`);

test('result uses this run for time, title, and share even with a faster device best', () => {
  const el = resultView({ result: { ...finish(35001), clearedCount: 20, rulesVersion: CURRENT_RULES_VERSION },
    bestElapsedCs: 3100, status: 'official' });
  assert.equal(part(el, 'ta-result-time').textContent, '00:35.01');
  assert.equal(part(el, 'ta-result-title').textContent, '閃光の怪盗');
  assert.match(el.textContent, /端末の自己ベスト 00:31\.00/);
  assert.equal(part(el, 'ta-result-status').textContent, t('ta.status.official'));
  assert.equal(el.querySelector('form input[name="text"]').value, 'タイムアタックモード (全色・20棟)\n記録：0分35秒01\n#カメレオる');
  assert.equal(part(el, 'ta-ranking').getAttribute('href'), TIME_ATTACK_RANKING_URL);
});

test('title thresholds, invalid sub-15-second records, and finishes over 10 minutes', () => {
  for (const [milliseconds, title] of [
    [14999, null],
    [15000, '神速のカメレオン'],
    [35000, '神速のカメレオン'],
    [35001, '閃光の怪盗'],
    [595000, '街角の散歩者'],
    [600000, '街めぐりカメレオン'],
    [600001, '30棟完走'],
  ]) {
    const el = resultView({ result: finish(milliseconds) });
    assert.equal(part(el, 'ta-result-title')?.textContent ?? null, title, String(milliseconds));
    assert.equal(Boolean(part(el, 'ta-share')), title !== null, String(milliseconds));
  }
});

test('a 10-second clear gets its fastest title, while archived results remain on the device', () => {
  const current = resultView({ result: { ...finish(10000), clearedCount: 20, rulesVersion: CURRENT_RULES_VERSION }, status: 'official' });
  assert.equal(part(current, 'ta-result-title').textContent, '神速のカメレオン');
  assert.ok(part(current, 'ta-share'));
  const retired = resultView({ result: finish(27000), status: 'official' });
  assert.equal(part(retired, 'ta-result-status').textContent, t('ta.status.archived'));
});

test('quit records offer ranking and retry but no clear title or share', () => {
  let retries = 0;
  let homes = 0;
  const el = resultView({
    result: { reason: 'quit', clearedCount: 12, elapsedCs: 2145 },
    status: 'no_rank',
    onRetry: () => { retries++; },
    onHome: () => { homes++; },
  });
  assert.match(el.textContent, /途中終了・12 \/ 30棟クリア/);
  assert.equal(part(el, 'ta-result-time').textContent, '00:21.45');
  assert.equal(part(el, 'ta-result-title'), null);
  assert.equal(part(el, 'ta-share'), null);
  assert.equal(part(el, 'ta-result-status').textContent, t('ta.status.noRank'));
  part(el, 'ta-again').click();
  part(el, 'ta-home').click();
  assert.equal(retries, 1);
  assert.equal(homes, 1);
});

test('share remains available in unpublished or rejected runs, and review is opt-in', () => {
  let requests = 0;
  for (const [status, label] of [
    ['local_only', 'result.status.unranked'],
    ['uploading', 'result.status.sending'],
    ['verifying', 'result.status.verifying'],
    ['too_large', 'ta.status.tooLarge'],
    ['storage_failed', 'ta.storageFailed'],
    ['rejected', 'ta.status.rejected'],
    ['under_review', 'result.status.underReview'],
  ]) {
    const el = resultView({ result: finish(83000), status, lang: 'es', onReview: () => { requests++; } });
    assert.equal(part(el, 'ta-result-status').textContent, t(label, null, 'es'));
    assert.equal(part(el, 'ta-share').textContent, t('share.button', null, 'es'));
    const review = part(el, 'ta-request-review');
    assert.equal(Boolean(review), status === 'rejected');
    review?.click();
  }
  assert.equal(requests, 1);
});

test('a rejected result with a review already requested cannot request it again', () => {
  const el = resultView({
    result: finish(50100),
    status: 'rejected',
    reviewRequested: true,
    onReview: () => assert.fail('duplicate review'),
  });
  assert.equal(part(el, 'ta-request-review'), null);
  assert.equal(part(el, 'ta-result-status').textContent, t('ta.status.rejected'));
});
