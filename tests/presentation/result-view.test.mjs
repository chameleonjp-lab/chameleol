import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildResultData } from '../../src/presentation/result-data.js';
import { mountResultPresentation } from '../../src/presentation/result-view.js';
import { createPresentationScope } from '../../src/presentation/scope.js';
import { setLanguage, t } from '../../src/i18n/i18n.js';

process.env.TZ = 'UTC';
const at = Date.parse('2026-11-13T12:00:00.000Z');
function mount({ firstClearNow = true, firstClearAt = at, language = 'ja' } = {}) {
  const { document } = parseHTML('<html><body><main id="result"></main></body></html>');
  const host = document.getElementById('result');
  const scope = createPresentationScope({ id: 'ticket', kind: 'result' });
  setLanguage(language);
  const data = buildResultData({ summary: { buildings: 50, endReason: 'cleared', maxCombo: 0, perBuilding: [], score: { total: 200, pass: 0, accuracy: 0, combo: 0, clear: 200 } }, firstClearNow, firstClearAt });
  mountResultPresentation({ host, data, scope, t });
  return { host, scope };
}

test('first escape renders a dated ticket, not only an announcement', () => {
  const { host, scope } = mount();
  try {
    const ticket = host.querySelector('.result-ticket');
    assert.ok(ticket, 'first clear must have a dedicated ticket');
    assert.ok(ticket.textContent.includes('この端末で初めての脱出！'));
    assert.equal(ticket.querySelector('time').getAttribute('datetime'), '2026-11-13T12:00:00.000Z');
    assert.equal(ticket.querySelector('time').textContent, '2026年11月13日');
    assert.equal(ticket.querySelector('.result-ticket-stamp').getAttribute('aria-hidden'), 'true');
  } finally { scope.dispose(); }
  assert.equal(host.querySelector('.result-ticket'), null);
});

test('a later clear has no first-clear ticket', () => {
  const { host, scope } = mount({ firstClearNow: false });
  assert.equal(host.querySelector('.result-ticket'), null);
  scope.dispose();
});

test('language redraw preserves the recorded date and localizes the ticket', () => {
  const ja = mount();
  const en = mount({ language: 'en' });
  try {
    assert.ok(en.host.querySelector('.result-ticket'));
    assert.ok(en.host.querySelector('.result-ticket').textContent.includes('First escape on this device!'));
    assert.equal(en.host.querySelector('time').getAttribute('datetime'), ja.host.querySelector('time').getAttribute('datetime'));
    assert.equal(en.host.querySelector('time').textContent, 'Nov 13, 2026');
  } finally { ja.scope.dispose(); en.scope.dispose(); }
});

test('unknown first-clear date never becomes today', () => {
  const { host, scope } = mount({ firstClearAt: NaN });
  try {
    assert.ok(host.querySelector('.result-ticket'));
    assert.equal(host.querySelector('.result-ticket time'), null);
  } finally { scope.dispose(); }
});
