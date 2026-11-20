import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { desktopSettings } from '../../src/ui/desktop-settings.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { LANGUAGE_IDS } from '../../src/i18n/languages.js';
import { setLanguage } from '../../src/i18n/i18n.js';

test('PC設定と見本バーの6文言を15言語すべてに用意する', () => {
  const keys = ['pcTitle', 'pcHelp', 'pcSpeed', 'pcPreview', 'pcPreviewHelp', 'pcPreviewValue'];
  for (const lang of LANGUAGE_IDS) {
    for (const key of keys) {
      assert.equal(typeof MESSAGES[lang]['settings.' + key], 'string', lang + ' settings.' + key);
      assert.ok(MESSAGES[lang]['settings.' + key].length > 0);
    }
  }
});

test('PC設定見本: 速度の変更を即時反映し、スクロールとキー操作を試せる', () => {
  const { document, window } = parseHTML('<html><body></body></html>');
  const before = { document: globalThis.document, Node: globalThis.Node };
  Object.assign(globalThis, { document, Node: window.Node });
  const previousLang = 'ja';
  setLanguage(previousLang);
  try {
    const speeds = [];
    const screen = desktopSettings({ scrollSpeed: 100, onChange: (speed) => speeds.push(speed) });
    document.body.append(screen);
    const range = screen.querySelector('[data-testid="pc-scroll-speed"]');
    const demo = screen.querySelector('[data-testid="pc-preview-bar"]');
    const result = screen.querySelector('[data-testid="pc-preview-value"]');
    assert.equal(range.value, '100');
    assert.equal(demo.getAttribute('aria-valuenow'), '50');
    assert.ok(result.textContent.includes('50%'));
    range.value = '200';
    range.dispatchEvent(new window.Event('input'));
    assert.deepEqual(speeds, [200]);
    assert.equal(screen.querySelector('.pc-speed-output').textContent, '200%');

    const wheel = new window.Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'deltaMode', { value: 0 });
    demo.dispatchEvent(wheel);
    assert.equal(demo.getAttribute('aria-valuenow'), '60');
    const key = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(key, 'key', { value: 'ArrowDown' });
    demo.dispatchEvent(key);
    assert.equal(demo.getAttribute('aria-valuenow'), '58');
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
