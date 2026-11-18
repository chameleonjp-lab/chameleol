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

test('standalone results show the unavailable message without querying rankings', async () => {
  let requests = 0;
  const api = { configured: false, get: () => { requests++; }, post: () => { requests++; } };
  const view = createRankingView({ api, result: true });
  await view.load();
  assert.equal(requests, 0);
  assert.equal(view.el.querySelector('.rank-status').textContent, t('ranking.notConfigured'));
});

test('repeatedly retired rank pages stop for a manual retry and never mix versions',async()=>{
  let calls=0;
  const view=createRankingView({result:true,api:{get:async()=>{
    calls++;
    if(calls===7) throw Error('test circuit breaker');
    return page([{...rows(1)[0],name:'版'+calls}],1,calls,calls>1);
  }}});
  await view.load();
  assert.ok(calls < 7,'pagination must stop when its replacement is retired too');
  assert.ok(view.el.querySelector('.rank-status button'));
  assert.equal(view.el.querySelectorAll('.rank-row').length,1);
});

test('an earlier personal best cannot append a second or obsolete value after refresh',async()=>{
  const old=Promise.withResolvers();
  let n=0;
  const view=createRankingView({name:'A',api:{get:async()=>page([]),post:()=>++n===1?old.promise:Promise.resolve({rank:1,buildings:50,average:9900})}});
  await view.load();await view.load();
  old.resolve({rank:8,buildings:7,average:8000});await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotMatch(view.el.querySelector('.rank-mine').textContent,/80\.00%/);
});
