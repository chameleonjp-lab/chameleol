// E075 街の模型：50棟の通過・到達・未到達と壁色・体の色の欠損を、SVG の「すごろく」で見せる。
// 描画器も canvas も使わない（画素を持たない）。値は処理側の miniature（snapshot.miniature）をそのまま描き、画面側で数え直さない。
import { hsvToHex } from '../rules/v1/color.js';
import { t } from '../i18n/i18n.js';
import { rtext } from './result-card-text.js';
import { districtIndexForBuilding } from './result-sky.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHTS = [18, 22, 20, 26, 34];
const PER_ROW = 10;
const BOX_W = 26;
const DX = 8;
const DY = -6;
const SILHOUETTE = [[20, 86], [5, 30, 57, 28], [110, 20, 108, 67], [108, 100, 80, 93], [55, 85, 79, 70], [95, 62, 92, 78]];

const safeHex = (hsv) => { try { return hsv ? hsvToHex(hsv) : null; } catch { return null; } };
function mixHex(hex, toward, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (toward - v) * amount));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 棟 i（0 始まり）の足元の位置。偶数段は左→右、奇数段は右→左。 */
export function modelCellOrigin(index) {
  const row = Math.floor(index / PER_ROW);
  const col = index % PER_ROW;
  const c = row % 2 === 0 ? col : PER_ROW - 1 - col;
  return { x: 22 + c * 30, y: 52 + row * 44 };
}

export const MODEL_PANEL_ID = 'model';

/**
 * E075 のパネル定義を作る。getSnapshot は ports が持つ最新の snapshot、register は開いた回の update を ports へ登録する。
 */
export function createMiniaturePanel({ getSnapshot, register }) {
  return {
    id: MODEL_PANEL_ID,
    order: 60,
    labelKey: 'evidence.model.title',
    labelFallback: (locale) => rtext('evidence.model.title', undefined, locale),
    needsData: false,
    render(container, _data, ctx) {
      const doc = ctx.doc;
      const el = (tag, cls, text, parent) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; parent?.append(n); return n; };
      const svg = (tag, attrs, parent) => { const n = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs ?? {})) n.setAttribute(k, String(v)); parent?.append(n); return n; };
      const wrap = el('div', 'result-miniature', null, container);
      wrap.setAttribute('data-testid', 'result-miniature');
      let disposed = false;

      function build(snapshot) {
        wrap.textContent = '';
        const locale = snapshot?.model?.locale ?? 'en';
        const mini = snapshot?.miniature;
        if (!mini || mini.available === false || !Array.isArray(mini.cells) || mini.cells.length === 0) {
          el('p', 'evidence-empty', t('evidence.unavailable', undefined, locale), wrap);
          return;
        }
        const passed = mini.cells.filter((c) => c.state === 'passed').length;
        const arrivedCell = mini.cells.find((c) => c.state === 'arrived');
        const arrived = arrivedCell?.building ?? mini.cells.length;
        const cleared = passed === mini.cells.length;
        const graph = svg('svg', { viewBox: '0 0 340 260', class: 'result-miniature-svg', role: 'img', focusable: 'false' }, wrap);
        graph.setAttribute('aria-label', `${t('result.buildings', undefined, locale)}: ${passed}/${mini.cells.length}. ${rtext('evidence.model.alt', { passed, arrived }, locale)}`);
        // 道：箱の足元を結ぶ折れ線
        const roadD = mini.cells.map((_, i) => { const o = modelCellOrigin(i); return `${i ? 'L' : 'M'}${o.x + BOX_W / 2} ${o.y + 6}`; }).join('');
        svg('path', { d: roadD, fill: 'none', stroke: '#2a3263', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, graph);
        const heroTarget = cleared ? mini.cells[mini.cells.length - 1] : arrivedCell;
        mini.cells.forEach((cell, i) => {
          const { x, y } = modelCellOrigin(i);
          const h = HEIGHTS[districtIndexForBuilding(cell.building)];
          const wall = safeHex(cell.wallHsv);
          const body = safeHex(cell.bodyHsv);
          const g = svg('g', { 'data-building': cell.building, 'data-state': cell.state, 'data-wall': wall ? 'known' : 'missing' }, graph);
          const dashed = { 'stroke-dasharray': '3 2.5' };
          if (cell.state === 'unreached') {
            svg('rect', { x, y: y - h, width: BOX_W, height: h, fill: '#ffffff14', stroke: '#ffffff40', 'stroke-width': 1.5, ...dashed }, g);
          } else if (!wall) {
            svg('rect', { x, y: y - h, width: BOX_W, height: h, fill: 'none', stroke: '#ffffff66', 'stroke-width': 1.5, ...dashed }, g);
          } else {
            svg('path', { d: `M${x} ${y - h}L${x + DX} ${y - h + DY}L${x + BOX_W + DX} ${y - h + DY}L${x + BOX_W} ${y - h}Z`, fill: mixHex(wall, 255, 0.3), stroke: '#24394b', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
            svg('path', { d: `M${x + BOX_W} ${y}L${x + BOX_W + DX} ${y + DY}L${x + BOX_W + DX} ${y - h + DY}L${x + BOX_W} ${y - h}Z`, fill: mixHex(wall, 0, 0.25), stroke: '#24394b', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, g);
            svg('rect', { x, y: y - h, width: BOX_W, height: h, fill: wall, stroke: cell.state === 'arrived' ? '#ff8a8a' : '#24394b', 'stroke-width': cell.state === 'arrived' ? 2 : 1.5, ...(cell.state === 'arrived' ? dashed : {}) }, g);
          }
          if (cell.state !== 'unreached') {
            // 体の色の札（無ければ点線の空の札）
            if (body) svg('rect', { x: x + 3, y: y - 11, width: 8, height: 8, fill: body, stroke: '#24394b', 'stroke-width': 1 }, g);
            else svg('rect', { x: x + 3, y: y - 11, width: 8, height: 8, fill: 'none', stroke: '#ffffffaa', 'stroke-width': 1, 'stroke-dasharray': '2 1.5' }, g);
          }
          if (cell.state === 'arrived') {
            // 屋根の赤い三角旗
            svg('path', { d: `M${x + BOX_W - 6} ${y - h}L${x + BOX_W - 6} ${y - h - 12}L${x + BOX_W + 5} ${y - h - 8}Z`, fill: '#ff5a5f', stroke: '#24394b', 'stroke-width': 1, 'stroke-linejoin': 'round' }, g);
          }
          if (cleared && i === mini.cells.length - 1) {
            svg('rect', { x: x - 2, y: y - h - 2, width: BOX_W + 4, height: h + 4, fill: 'none', stroke: '#ffd43b', 'stroke-width': 2, rx: 2 }, g);
          }
        });
        if (heroTarget) {
          // 主人公の影絵（幅16）。体の色が無ければ白。
          const i = heroTarget.building - 1;
          const { x, y } = modelCellOrigin(i);
          const h = HEIGHTS[districtIndexForBuilding(heroTarget.building)];
          const s = 16 / 105;
          const d = `M${SILHOUETTE[0][0]} ${SILHOUETTE[0][1]}` + SILHOUETTE.slice(1).map((q) => `Q${q.join(' ')}`).join('') + 'Z';
          svg('path', { d, transform: `translate(${x + 1} ${y - h - 22}) scale(${s}) translate(-5 -20)`, fill: safeHex(heroTarget.bodyHsv) ?? '#ffffff', stroke: '#24394b', 'stroke-width': 3, 'stroke-linejoin': 'round', 'data-testid': 'result-miniature-hero' }, graph);
        }
        // 凡例（色だけでなく塗り・点線・旗の形でも区別する）
        const legend = el('ul', 'result-miniature-legend', null, wrap);
        const item = (cls, label) => { const li = el('li', null, null, legend); el('i', `result-miniature-chip ${cls}`, null, li).setAttribute('aria-hidden', 'true'); el('span', null, label, li); };
        item('is-passed', rtext('evidence.model.passed', undefined, locale));
        item('is-arrived', rtext('evidence.model.arrived', undefined, locale));
        item('is-unreached', rtext('evidence.model.unreached', undefined, locale));
        item('is-missing', rtext('evidence.model.missing', undefined, locale));
      }

      build(getSnapshot());
      const instance = {
        update(snapshot) { if (!disposed) build(snapshot); },
        dispose() { if (disposed) return; disposed = true; unregister?.(); wrap.remove(); },
      };
      const unregister = register?.(instance);
      return instance;
    },
  };
}
