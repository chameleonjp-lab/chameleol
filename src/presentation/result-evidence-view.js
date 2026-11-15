// 結果画面の任意パネル（ふり返り）。一度に1つだけ開く静止表示で、動く再生部品は持たない。
// 最後の3コマ・壁と体の色・警戒の移り変わり・立て直した場面・最長成功フィルムを、解析済みの静止データから描く。
// 再生ボタン・時間のつまみ・速度切替・自動送り・時計・音・描画ループは作らない。
// 描くのは DOM と SVG だけ（canvas・WebGL は使わない）。解析中・利用不可は文で伝え、推測で絵を埋めない。
import { hsvToHex } from '../rules/v1/color.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CIRCLED = ['①', '②', '③'];
const SILHOUETTE = 'M20 86Q5 30 57 28Q110 20 108 67Q108 100 80 93Q55 85 79 70Q95 62 92 78Z';
let mountCounter = 0;

const percentOf = (units, max) => (max > 0 ? Math.round((units / max) * 100) : 0);
const safeHex = (hsv) => {
  try {
    return hsv ? hsvToHex(hsv) : null;
  } catch {
    return null;
  }
};
const barColor = (percent) => (percent <= 35 ? '#6aff4d' : percent <= 70 ? '#ffcc4d' : '#ff5a5f');

/** 結果の任意パネルの器を作る。T7 は addPanel で、街の模型・回して見る を同じ器へ足す。 */
export function mountResultPanels({ host, t = (key) => key, state = { status: 'missing' }, panels = [] }) {
  const doc = host.ownerDocument;
  const id = `evidence-${(mountCounter += 1)}`;
  const tr = (key, params) => String(t(key, params));
  const el = (tag, cls, text, parent) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    if (parent) parent.append(node);
    return node;
  };
  const svg = (tag, attrs, parent) => {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, String(value));
    if (parent) parent.append(node);
    return node;
  };

  let current = state;
  let openId = null;
  let disposed = false;
  let cleanup = null;
  const defs = [];

  const root = el('section', 'result-evidence');
  root.setAttribute('aria-labelledby', `${id}-heading`);
  const heading = el('h2', 'evidence-heading', tr('evidence.heading'), root);
  heading.id = `${id}-heading`;
  const chipRow = el('div', 'evidence-chips', null, root);
  chipRow.setAttribute('role', 'group');
  chipRow.setAttribute('aria-labelledby', heading.id);
  const body = el('div', 'evidence-body', null, root);
  body.id = `${id}-body`;
  body.setAttribute('role', 'region');
  body.hidden = true;
  host.append(root);

  // ---- 各パネルの絵 ----
  const note = (parent, text, cls = 'evidence-empty') => el('p', cls, text, parent);
  const unavailableText = (parent, part) => (part?.reason === 'none' ? null : note(parent, tr('evidence.unavailable')));

  /** 3コマ・立て直しで使う1コマ：警戒のバー、壁の色、体の影絵、警察の数、見出し。 */
  function frameCell(parent, frame, label) {
    const percent = percentOf(frame.alertUnits, frame.maxAlertUnits);
    const cell = el('figure', 'evidence-frame', null, parent);
    cell.setAttribute('role', 'img');
    cell.setAttribute('aria-label', tr('evidence.frames.alt', { label, building: frame.building, alert: percent, police: frame.policeStage }));
    const bar = el('div', 'evidence-alert-bar', null, cell);
    const fill = el('i', null, null, bar);
    fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    fill.style.background = barColor(percent);
    const stage = el('div', 'evidence-wall', null, cell);
    stage.style.background = safeHex(frame.wallHsv) ?? 'transparent';
    const bodyColor = safeHex(frame.bodyHsv);
    const art = svg('svg', { viewBox: '0 0 128 128', width: 54, height: 54, class: `evidence-silhouette${bodyColor ? '' : ' is-missing'}`, 'aria-hidden': 'true', focusable: 'false' }, stage);
    svg('path', { d: SILHOUETTE, fill: bodyColor ?? 'none', stroke: '#24394b', 'stroke-width': 3, 'stroke-linejoin': 'round', ...(bodyColor ? {} : { 'stroke-dasharray': '6 5' }) }, art);
    el('span', 'evidence-police', frame.policeStage, stage);
    const caption = el('figcaption', 'evidence-frame-caption', null, cell);
    el('strong', null, label, caption);
    el('span', null, tr('evidence.building', { building: frame.building }), caption);
    return cell;
  }

  function renderFrames(container, data) {
    const part = data.frames3;
    if (!part.available) return unavailableText(container, part);
    const row = el('div', 'evidence-frames', null, container);
    const labels = [tr('evidence.frames.minus2'), tr('evidence.frames.minus1'), tr('evidence.frames.end')];
    part.frames.forEach((frame, i) => frameCell(row, frame, labels[i]));
    return null;
  }

  function swatch(parent, label, hsv) {
    const wrap = el('figure', 'evidence-swatch', null, parent);
    const color = safeHex(hsv);
    const box = el('div', `evidence-swatch-box${color ? '' : ' is-missing'}`, null, wrap);
    if (color) box.style.background = color;
    else el('span', null, tr('evidence.colors.missing'), box);
    el('figcaption', null, label, wrap);
    return wrap;
  }

  function renderColors(container, data) {
    const part = data.finalColors;
    if (!part.available) return unavailableText(container, part);
    const group = el('div', 'evidence-colors', null, container);
    group.setAttribute('role', 'img');
    group.setAttribute('aria-label', tr('evidence.colors.alt', { building: part.building }));
    swatch(group, tr('evidence.colors.wall'), part.wallHsv);
    swatch(group, tr('evidence.colors.body'), part.bodyHsv);
    el('p', 'evidence-caption', tr('evidence.colors.caption', { building: part.building }), container);
    return null;
  }

  function renderAlert(container, data) {
    const part = data.alertPoints;
    if (!part.available) return unavailableText(container, part);
    const W = 340;
    const H = 150;
    const [x0, x1, y0, y1] = [34, 330, 12, 112];
    const last = part.points[part.points.length - 1];
    const span = Math.max(1, last.t);
    const xOf = (time) => (last.t > 0 ? x0 + (time / span) * (x1 - x0) : x0);
    const yOf = (units) => y1 - Math.max(0, Math.min(1, units / part.maxAlertUnits)) * (y1 - y0);
    const graph = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'evidence-graph', role: 'img', 'aria-label': tr('evidence.alert.alt', { alert: percentOf(part.peakAlertUnits, part.maxAlertUnits), building: part.peakBuilding }) }, null);
    container.append(graph);
    for (const level of [35, 70]) {
      const y = yOf((part.maxAlertUnits * level) / 100);
      svg('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: '#ffffff21', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, graph);
    }
    for (const [label, level] of [['0%', 0], ['100%', 100]]) {
      const text = svg('text', { x: x0 - 4, y: yOf((part.maxAlertUnits * level) / 100) + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#b9bee6' }, graph);
      text.textContent = label;
    }
    svg('line', { x1: x0, x2: x1, y1: y1, y2: y1, stroke: '#ffffff40', 'stroke-width': 1 }, graph);
    for (const building of [10, 20, 30, 40, 50]) {
      const time = (building - 1) * 5000;
      if (time > last.t) break;
      const text = svg('text', { x: xOf(time), y: 130, 'text-anchor': 'middle', 'font-size': 12, fill: '#b9bee6' }, graph);
      text.textContent = String(building);
    }
    // 線と下の面。始まり（時刻0・警戒0）は規則の初期状態で、点の一覧には含めない。
    const coords = [[xOf(0), yOf(0)], ...part.points.map((p) => [xOf(p.t), yOf(p.alertUnits)])];
    const lineD = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    svg('path', { d: `${lineD}L${coords[coords.length - 1][0].toFixed(1)} ${y1}L${coords[0][0].toFixed(1)} ${y1}Z`, fill: '#ffcc4d', 'fill-opacity': 0.12 }, graph);
    svg('path', { d: lineD, fill: 'none', stroke: '#ffcc4d', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, graph);
    const marks = data.alertMarks?.available ? data.alertMarks.marks : [];
    marks.forEach((mark, i) => {
      const [cx, cy] = [xOf(mark.t), yOf(mark.alertUnits)];
      svg('circle', { cx, cy, r: 5, fill: '#fff', stroke: '#14183a', 'stroke-width': 2 }, graph);
      const digit = svg('text', { x: cx, y: cy + 3, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 700, fill: '#14183a' }, graph);
      digit.textContent = String(i + 1);
    });
    if (marks.length) {
      const list = el('ol', 'evidence-marks', null, container);
      const labelKey = { police1: 'evidence.alert.markPolice', police2: 'evidence.alert.markTwo', recovery: 'evidence.alert.markRecover' };
      marks.forEach((mark, i) => el('li', null, `${CIRCLED[i]} ${tr(labelKey[mark.kind])} · ${tr('evidence.building', { building: mark.building })}`, list));
    }
    return null;
  }

  function renderRecovery(container, data) {
    const part = data.recovery;
    if (!part.available) {
      if (part.reason === 'none') note(container, tr('evidence.recovery.none'));
      else note(container, tr('evidence.unavailable'));
      return null;
    }
    const row = el('div', 'evidence-recovery', null, container);
    frameCell(row, part.before, tr('evidence.recovery.before'));
    const arrow = svg('svg', { viewBox: '0 0 24 24', width: 24, height: 24, class: 'evidence-arrow', 'aria-hidden': 'true', focusable: 'false' }, row);
    svg('path', { d: 'M3 12H18M13 6L19 12L13 18', fill: 'none', stroke: '#fff0a0', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, arrow);
    frameCell(row, part.after, tr('evidence.recovery.after'));
    el('p', 'evidence-caption', tr('evidence.recovery.caption', { from: percentOf(part.before.alertUnits, part.before.maxAlertUnits), to: percentOf(part.after.alertUnits, part.after.maxAlertUnits) }), container);
    return null;
  }

  function renderStreak(container, data) {
    const part = data.longestStreak;
    if (!part.available) {
      if (part.reason === 'none') note(container, tr('evidence.streak.none'));
      else note(container, tr('evidence.unavailable'));
      return null;
    }
    const film = el('div', 'evidence-film', null, container);
    film.tabIndex = 0;
    film.setAttribute('role', 'group');
    film.setAttribute('aria-label', tr('evidence.streak.title'));
    const track = el('div', 'evidence-film-track', null, film);
    for (const item of part.buildings) {
      const frame = el('figure', 'evidence-film-frame', null, track);
      const wall = el('span', 'evidence-film-wall', null, frame);
      wall.style.background = safeHex(item.wallHsv) ?? 'transparent';
      const bodyColor = safeHex(item.bodyHsv);
      const bodyBox = el('span', `evidence-film-body${bodyColor ? '' : ' is-missing'}`, null, frame);
      if (bodyColor) bodyBox.style.background = bodyColor;
      el('figcaption', null, item.building, frame);
    }
    el('p', 'evidence-caption', tr('evidence.streak.caption', { from: part.from, to: part.to, count: part.length }), container);
    return null;
  }

  const BUILTIN = [
    { id: 'frames', order: 10, labelKey: 'evidence.frames.title', render: renderFrames },
    { id: 'colors', order: 20, labelKey: 'evidence.colors.title', render: renderColors },
    { id: 'alert', order: 30, labelKey: 'evidence.alert.title', render: renderAlert },
    { id: 'recovery', order: 40, labelKey: 'evidence.recovery.title', render: renderRecovery },
    { id: 'streak', order: 50, labelKey: 'evidence.streak.title', render: renderStreak },
  ];

  // ---- 開閉 ----
  function disposeOpen() {
    const fn = cleanup;
    cleanup = null;
    try { fn?.(); } catch { /* 片付けの失敗で画面を止めない */ }
    while (body.firstChild) body.removeChild(body.firstChild);
  }

  function paintBody() {
    disposeOpen();
    const def = defs.find((d) => d.id === openId);
    if (!def) return;
    body.setAttribute('aria-labelledby', `${id}-chip-${def.id}`);
    const needsData = def.needsData !== false;
    if (needsData && current.status === 'pending') {
      el('p', 'evidence-empty evidence-pending', tr('evidence.pending'), body);
      return;
    }
    if (needsData && current.status !== 'ready') {
      el('p', 'evidence-empty', tr('evidence.unavailable'), body);
      return;
    }
    try {
      const result = def.render(body, current.data, { t: tr, state: current, doc, el, svg });
      if (typeof result === 'function') cleanup = result;
      else if (result && typeof result.dispose === 'function') cleanup = () => result.dispose();
    } catch {
      while (body.firstChild) body.removeChild(body.firstChild);
      el('p', 'evidence-empty', tr('evidence.unavailable'), body);
    }
  }

  function syncChips() {
    for (const chip of chipRow.children) {
      const panelId = chip.getAttribute('data-panel');
      const def = defs.find((d) => d.id === panelId);
      const isOpen = panelId === openId;
      chip.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      chip.setAttribute('aria-controls', body.id);
      chip.classList.toggle('is-open', isOpen);
      const pending = def && def.needsData !== false && current.status === 'pending';
      chip.textContent = tr(def.labelKey) + (pending ? ' …' : '');
    }
    body.hidden = openId === null;
  }

  function buildChips() {
    while (chipRow.firstChild) chipRow.removeChild(chipRow.firstChild);
    for (const def of defs) {
      const chip = el('button', 'evidence-chip', null, chipRow);
      chip.type = 'button';
      chip.id = `${id}-chip-${def.id}`;
      chip.setAttribute('data-panel', def.id);
      chip.addEventListener('click', () => toggle(def.id));
    }
    syncChips();
  }

  function toggle(panelId) {
    if (disposed) return false;
    return openId === panelId ? close() : open(panelId);
  }

  function open(panelId) {
    if (disposed || !defs.some((d) => d.id === panelId)) return false;
    openId = panelId;
    paintBody();
    syncChips();
    return true;
  }

  function close() {
    if (disposed) return false;
    openId = null;
    disposeOpen();
    syncChips();
    return true;
  }

  function addPanel(def) {
    if (disposed || !def || typeof def.id !== 'string' || typeof def.render !== 'function' || defs.some((d) => d.id === def.id)) return false;
    defs.push({ order: 100, ...def });
    defs.sort((a, b) => a.order - b.order);
    buildChips();
    return true;
  }

  /** 解析の状態が変わった時（解析の完了・公式訂正）。開いているパネルだけを描き直す。 */
  function update(next) {
    if (disposed) return;
    current = next ?? { status: 'missing' };
    if (openId !== null) paintBody();
    syncChips();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposeOpen();
    openId = null;
    root.remove();
  }

  function stats() {
    return {
      openId,
      openCount: openId === null ? 0 : 1,
      chips: chipRow.children.length,
      expanded: [...chipRow.children].filter((c) => c.getAttribute('aria-expanded') === 'true').length,
      status: current.status,
      disposed,
      // 再生の部品・時計・描画ループは持たない
      playControls: 0,
      rafCount: 0,
      timerCount: 0,
      canvasCount: root.querySelectorAll ? root.querySelectorAll('canvas').length : 0,
    };
  }

  for (const def of [...BUILTIN, ...panels]) defs.push({ order: 100, ...def });
  defs.sort((a, b) => a.order - b.order);
  buildChips();

  return {
    element: root,
    bodyElement: body,
    get openId() { return openId; },
    open,
    close,
    toggle,
    update,
    addPanel,
    stats,
    dispose,
  };
}
