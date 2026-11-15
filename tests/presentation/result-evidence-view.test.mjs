// 結果の任意パネル（result-evidence-view.js）の試験：一度に1つだけ開く、状態ごとの文、再生部品が無い、15言語で文言が出る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createGame, rulesForVersion } from '../../src/rules/v1/index.js';
import { prepareResultEvidence } from '../../src/presentation/result-evidence.js';
import { mountResultPanels } from '../../src/presentation/result-evidence-view.js';
import { t } from '../../src/i18n/i18n.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages.js';

const { loadReplayFixtures } = await import('../../scripts/replay-fixtures.mjs');
const fixtures = loadReplayFixtures();
const noYield = async () => {};

function setup() {
  const { window, document } = parseHTML('<html><body><main id="root"></main></body></html>');
  Object.assign(globalThis, { document, Node: window.Node });
  return document.querySelector('#root');
}

async function readyState(name) {
  const f = fixtures.find((x) => x.name === name);
  const rules = rulesForVersion(f.rulesVersion);
  const input = {
    rulesVersion: f.rulesVersion,
    generatorVersion: rules.generatorVersion,
    seed: f.seed,
    history: f.history,
    endedAtT: f.expected.endT,
    targets: createGame({ seed: f.seed, rules }).course.targets.map((c) => ({ ...c })),
    originalSummary: f.expected,
    displaySummary: f.expected,
  };
  const r = await prepareResultEvidence(input, { onYield: noYield });
  assert.equal(r.available, true, r.reason);
  return { status: 'ready', reason: null, data: r.data, revision: 0 };
}

const chips = (host) => [...host.querySelectorAll('.evidence-chip')];
const body = (host) => host.querySelector('.evidence-body');

test('最初はすべて閉じていて、チップは aria-expanded / aria-controls を持つ。一度に開くのは1つだけ', async () => {
  const host = setup();
  const state = await readyState('detected-sloppy');
  const panels = mountResultPanels({ host, t, state });
  assert.equal(chips(host).length, 5);
  assert.deepEqual(chips(host).map((c) => c.getAttribute('data-panel')), ['frames', 'colors', 'alert', 'recovery', 'streak']);
  assert.ok(chips(host).every((c) => c.getAttribute('aria-expanded') === 'false' && c.getAttribute('aria-controls') === body(host).id));
  assert.equal(body(host).hidden, true);
  assert.equal(panels.stats().openCount, 0);
  for (const chip of chips(host)) {
    chip.click();
    assert.equal(panels.stats().expanded, 1, `${chip.textContent} を開いた後も、開いているのは1つ`);
    assert.equal(panels.openId, chip.getAttribute('data-panel'));
    assert.equal(body(host).hidden, false);
    assert.ok(body(host).textContent.trim().length > 0 || body(host).querySelector('svg'), chip.textContent);
  }
  chips(host)[4].click(); // 同じチップをもう一度：閉じる
  assert.equal(panels.openId, null);
  assert.equal(panels.stats().expanded, 0);
  assert.equal(body(host).hidden, true);
  assert.equal(body(host).childNodes.length, 0, '閉じた時に中身を片付ける');
  panels.dispose();
  assert.equal(host.querySelector('.result-evidence'), null);
});

test('各パネルの絵：3コマ・2色・警戒グラフ（点は最大50、印は最大3）・立て直し・最長成功フィルム', async () => {
  const host = setup();
  const state = await readyState('detected-sloppy');
  const panels = mountResultPanels({ host, t, state });
  panels.open('frames');
  assert.equal(host.querySelectorAll('.evidence-frame').length, 3);
  assert.equal(host.querySelectorAll('.evidence-frame [role], .evidence-frame').length >= 3, true);
  assert.deepEqual([...host.querySelectorAll('.evidence-frame-caption strong')].map((n) => n.textContent), [t('evidence.frames.minus2'), t('evidence.frames.minus1'), t('evidence.frames.end')]);
  assert.ok([...host.querySelectorAll('.evidence-frame')].every((f) => f.getAttribute('role') === 'img' && f.getAttribute('aria-label')));
  panels.open('colors');
  assert.equal(host.querySelectorAll('.evidence-swatch').length, 2);
  panels.open('alert');
  const graph = host.querySelector('svg.evidence-graph');
  assert.equal(graph.getAttribute('role'), 'img');
  assert.match(graph.getAttribute('aria-label'), /%/);
  assert.equal(host.querySelectorAll('.evidence-marks li').length, 3);
  assert.equal(host.querySelectorAll('svg.evidence-graph circle').length, 3);
  panels.open('recovery');
  assert.equal(host.querySelectorAll('.evidence-recovery .evidence-frame').length, 2);
  panels.open('streak');
  assert.ok(host.querySelectorAll('.evidence-film-frame').length >= 1);
  assert.equal(host.querySelector('.evidence-caption').textContent.includes('{'), false);
  panels.dispose();
});

test('データが無い場面の文：立て直し・最長成功は「なし」、解析中・失敗・記録なしは専用の文（推測で絵を埋めない）', async () => {
  const ready = await readyState('quit-mid'); // 立て直しなし
  let host = setup();
  let panels = mountResultPanels({ host, t, state: ready });
  panels.open('recovery');
  assert.equal(body(host).textContent, t('evidence.recovery.none'));
  panels.dispose();

  host = setup();
  panels = mountResultPanels({ host, t, state: { status: 'pending' } });
  assert.ok(chips(host).every((c) => c.textContent.endsWith('…')), '解析中はチップに … を付ける');
  panels.open('frames');
  assert.equal(body(host).textContent, t('evidence.pending'));
  assert.equal(body(host).querySelector('svg'), null);
  panels.update(ready);
  assert.ok(chips(host).every((c) => !c.textContent.endsWith('…')));
  assert.equal(panels.openId, 'frames', '開いたまま、完了で描き直す');
  assert.equal(host.querySelectorAll('.evidence-frame').length, 3);
  panels.update({ status: 'failed', reason: 'summary_mismatch' });
  assert.equal(body(host).textContent, t('evidence.unavailable'));
  panels.update({ status: 'missing' });
  assert.equal(body(host).textContent, t('evidence.unavailable'));
  panels.dispose();

  // 一部だけ利用不可（公式訂正で骨格が違う）
  host = setup();
  const partial = structuredClone(ready);
  partial.data.frames3 = { available: false, reason: 'display_mismatch' };
  partial.data.longestStreak = { available: false, reason: 'none' };
  panels = mountResultPanels({ host, t, state: partial });
  panels.open('frames');
  assert.equal(body(host).textContent, t('evidence.unavailable'));
  panels.open('streak');
  assert.equal(body(host).textContent, t('evidence.streak.none'));
  panels.dispose();
});

test('再生の部品が無い：ボタンはチップだけ。つまみ・進行バー・audio/video/canvas・動く時計を持たない', async () => {
  const host = setup();
  const state = await readyState('clear-steady');
  const panels = mountResultPanels({ host, t, state });
  for (const id of ['frames', 'colors', 'alert', 'recovery', 'streak']) {
    panels.open(id);
    assert.equal(host.querySelectorAll('button').length, 5, `${id}: ボタンはチップ5つだけ`);
    assert.equal(host.querySelectorAll('input, audio, video, canvas, progress, [role=slider], [role=progressbar], [role=timer]').length, 0, id);
    assert.equal(host.querySelectorAll('[class*=play], [class*=seek], [class*=speed], [data-testid*=play]').length, 0, id);
  }
  const stats = panels.stats();
  assert.deepEqual([stats.playControls, stats.rafCount, stats.timerCount, stats.canvasCount], [0, 0, 0, 0]);
  panels.dispose();
});

test('addPanel：T7 が街の模型・回して見る を同じ器へ足せる。開く時だけ描き、閉じる・切替・破棄で片付ける。1つだけ開く', async () => {
  const host = setup();
  const state = await readyState('clear-steady');
  const panels = mountResultPanels({ host, t, state });
  const log = [];
  assert.equal(panels.addPanel({ id: 'model', order: 60, labelKey: 'evidence.colors.title', render: (container) => { log.push('open-model'); container.append(document.createElement('i')); return () => log.push('close-model'); } }), true);
  assert.equal(panels.addPanel({ id: 'turn', order: 70, needsData: false, labelKey: 'evidence.alert.title', render: () => ({ dispose: () => log.push('close-turn') }) }), true);
  assert.equal(panels.addPanel({ id: 'model', order: 1, labelKey: 'x', render() {} }), false, '同じ id は足せない');
  assert.deepEqual(chips(host).map((c) => c.getAttribute('data-panel')), ['frames', 'colors', 'alert', 'recovery', 'streak', 'model', 'turn']);
  panels.open('model');
  assert.deepEqual(log, ['open-model']);
  panels.open('turn');
  assert.deepEqual(log, ['open-model', 'close-model'], '別のパネルを開く前に、前のパネルを片付ける');
  assert.equal(panels.stats().expanded, 1);
  panels.update({ status: 'pending' });
  assert.equal(body(host).textContent, '', '解析待ちでも needsData:false のパネルは自分で扱う');
  assert.deepEqual(log, ['open-model', 'close-model', 'close-turn'], '状態が変わると、開いているパネルを片付けて描き直す');
  panels.open('frames');
  assert.deepEqual(log, ['open-model', 'close-model', 'close-turn', 'close-turn']);
  panels.update(state);
  panels.open('model');
  panels.dispose();
  assert.equal(log.at(-1), 'close-model', '破棄で開いているパネルを片付ける');
  assert.equal(panels.open('frames'), false, '破棄後は開かない');
  panels.update(state); // 例外にならない
});

test('15言語：全パネルで文言のキーがそのまま出ず、棟・警戒・警察の数が差し込まれる', async () => {
  const state = await readyState('detected-sloppy');
  for (const lang of SUPPORTED_LANGUAGES.map((l) => l.id)) {
    const host = setup();
    const tr = (key, params) => t(key, params, lang);
    const panels = mountResultPanels({ host, t: tr, state });
    assert.equal(host.querySelector('.evidence-heading').textContent, MESSAGES[lang]['evidence.heading']);
    for (const id of ['frames', 'colors', 'alert', 'recovery', 'streak']) {
      panels.open(id);
      const text = host.textContent + [...host.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label')).join(' ');
      assert.equal(/evidence\.|\{[a-z]+\}/.test(text), false, `${lang}/${id}: ${text.slice(0, 120)}`);
    }
    panels.open('frames');
    const label = host.querySelector('.evidence-frame').getAttribute('aria-label');
    assert.match(label, /\d+/);
    panels.dispose();
  }
});

test('ソースの evidence.* の文言キーが、15辞書すべてにそろっている', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/presentation/result-evidence-view.js', import.meta.url), 'utf8');
  const used = new Set([...source.matchAll(/'(evidence\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]));
  assert.ok(used.size >= 25, `used ${used.size}`);
  for (const lang of SUPPORTED_LANGUAGES.map((l) => l.id)) {
    for (const key of used) assert.equal(typeof MESSAGES[lang][key], 'string', `${lang}.${key}`);
  }
});
