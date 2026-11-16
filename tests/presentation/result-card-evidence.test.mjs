import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { mountResultPanels } from '../../src/presentation/result-evidence-view.js';

const t = (key) => key;
function alertState(marks) {
  const points = [{ t: 5000, alertUnits: 20 }, { t: 10000, alertUnits: 80 }, { t: 15000, alertUnits: 30 }, { t: 20000, alertUnits: 10 }];
  return { status: 'ready', data: {
    alertPoints: { available: true, points, maxAlertUnits: 100, peakT: 10000, peakAlertUnits: 80, peakBuilding: 2 },
    alertMarks: { available: true, marks },
  } };
}
function open(marks) {
  const { document } = parseHTML('<html><body><div id="h"></div></body></html>');
  const host = document.getElementById('h');
  const panels = mountResultPanels({ host, t, state: alertState(marks) });
  panels.open('alert');
  return { host, panels, graph: host.querySelector('svg.evidence-graph') };
}
const num = (node, name) => Number(node.getAttribute(name));

test('graph marks: the true point stays at the real value and the number disc is 14px away with a link', () => {
  const marks = [{ t: 10000, alertUnits: 80, kind: 'police1', building: 3 }];
  const { graph, panels } = open(marks);
  const point = graph.querySelector('[data-role=true-point]');
  const disc = graph.querySelector('[data-role=mark-number]');
  assert.equal(num(point, 'rx'), 3);
  assert.equal(point.getAttribute('fill'), '#fff');
  assert.equal(point.getAttribute('stroke'), '#14183a');
  assert.equal(point.getAttribute('stroke-width'), '1');
  assert.equal(num(disc, 'r'), 7);
  assert.equal(disc.getAttribute('stroke-width'), '1.5');
  assert.equal(num(disc, 'cx'), num(point, 'cx'));
  assert.equal(Math.abs(num(disc, 'cy') - num(point, 'cy')), 14);
  assert.ok(graph.querySelector('[data-role=mark-link]'), 'a link joins them');
  const digit = [...graph.querySelectorAll('text')].find((x) => x.textContent === '1' && x.getAttribute('font-size') === '10');
  assert.ok(digit, 'the number is 10px');
  panels.dispose();
});

test('graph marks: close marks never overlap, true points do not move, and the draw order is area, line, links, points, discs', () => {
  const marks = [
    { t: 10000, alertUnits: 80, kind: 'police1', building: 2 },
    { t: 10400, alertUnits: 80, kind: 'police2', building: 2 },
    { t: 10800, alertUnits: 79, kind: 'recovery', building: 2 },
  ];
  const { graph, panels } = open(marks);
  const discs = [...graph.querySelectorAll('[data-role=mark-number]')].map((n) => [num(n, 'cx'), num(n, 'cy')]);
  const points = [...graph.querySelectorAll('[data-role=true-point]')].map((n) => [num(n, 'cx'), num(n, 'cy')]);
  assert.equal(discs.length, 3);
  for (let i = 0; i < discs.length; i += 1) {
    for (let j = i + 1; j < discs.length; j += 1) assert.ok(Math.hypot(discs[i][0] - discs[j][0], discs[i][1] - discs[j][1]) >= 16 - 1e-9, `discs ${i} and ${j}`);
  }
  // 真値の点は値から決まる位置のまま（同じ高さなら同じ y）
  assert.equal(points[0][1], points[1][1]);
  const order = [...graph.querySelectorAll('path,line,ellipse,circle')].map((n) => n.getAttribute('data-role') ?? n.tagName);
  const first = (role) => order.indexOf(role);
  const last = (role) => order.lastIndexOf(role);
  assert.ok(last('path') < first('mark-link') && last('mark-link') < first('true-point') && last('true-point') < first('mark-number'));
  panels.dispose();
});

test('a mark near the top of the graph puts its disc below the point', () => {
  const marks = [{ t: 10000, alertUnits: 100, kind: 'police2', building: 2 }];
  const { graph, panels } = open(marks);
  const point = graph.querySelector('[data-role=true-point]');
  const disc = graph.querySelector('[data-role=mark-number]');
  assert.ok(num(disc, 'cy') > num(point, 'cy'));
  panels.dispose();
});

test('the longest-success film frame is 38px wide', async () => {
  const css = await readFile(new URL('../../src/ui/presentation.css', import.meta.url), 'utf8');
  assert.match(css, /\.evidence-film-frame\{[^}]*width:38px/);
  assert.doesNotMatch(css, /\.evidence-film-frame\{[^}]*width:44px/);
});
