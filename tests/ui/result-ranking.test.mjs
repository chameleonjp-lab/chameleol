import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createRankingView } from '../../src/ui/ranking.js';
import { t } from '../../src/i18n/i18n.js';

before(() => {
  const { document, Node } = parseHTML('<html><body></body></html>').window;
  Object.assign(globalThis, { document, Node });
});
const rows = (count) => Array.from({ length: count }, (_, i) => ({
  position: i + 1, rank: Math.min(30, i + 1), name: '名前' + i, buildings: 4, average: 8300,
}));
const page = (rows, nextAfter = null, version = 1, restarted = false) => ({
  rows, nextAfter, version, restarted, nameCount: rows.length,
});

for (const count of [0, 1, 10, 11, 30, 31, 32]) {
  test('result table reads all pages including boundary ties: ' + count, async () => {
    const all = rows(count);
    const api = { get: async (path, params) => {
      assert.equal(path, 'ranking');
      if (params.after) {
        assert.equal(params.version, 1);
        assert.equal(params.after, 30);
        return page(all.slice(30).concat({ ...all[0], rank: 33, position: 33 }));
      }
      return page(all.slice(0, 30), count > 30 ? 30 : null);
    } };
    const view = createRankingView({ api, result: true });
    await view.load();
    assert.equal(view.el.querySelectorAll('.rank-row').length, count);
    assert.ok(view.el.querySelector('.rank-list[tabindex="0"]'));
    if (!count) assert.equal(view.el.querySelector('.rank-status').textContent, t('ranking.empty'));
  });
}

test('result continuation retries a failed or non-advancing cursor without losing rows', async () => {
  const all = rows(32), calls = [];
  const view = createRankingView({ result: true, api: { get: async (_path, params) => {
    calls.push(params.after ?? 0);
    if (!params.after) return page(all.slice(0, 30), 30);
    if (calls.length === 2) throw new Error('offline');
    if (calls.length === 3) return page([all[29]], 30);
    return page(all.slice(29));
  } } });
  await view.load();
  assert.equal(view.state.rows.length, 30);
  for (const expected of [30, 32]) {
    view.el.querySelector('.rank-status button').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(view.state.rows.length, expected);
  }
  assert.deepEqual(calls, [0, 30, 30, 30]);
});

test('continuation replacing a retired version drops all previous rows', async () => {
  const all = rows(31);
  const view = createRankingView({ result: true, api: { get: async (_path, params) => {
    if (!params.after) return page(all.slice(0, 30), 30);
    return page([{...all[0], name:'更新'}], null, 2, true);
  } } });
  await view.load();
  assert.equal(view.el.querySelectorAll('.rank-row').length, 1);
  assert.equal(view.el.querySelector('.rank-name').textContent, '更新');
});
