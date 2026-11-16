// 結果画面の主カード・主操作の下の小ボタン・画像の保存画面（IF03/IF07）。
// App が作った .result-actions とその中のボタンは「同じノードのまま移動する」だけ。複製・置換・二重の click 登録はしない。
// 「Xでシェア」のタップは App の既存の処理が controller.share() を直接呼ぶ。ここは案内を出すだけで、共有を遅らせない。
import { t } from '../i18n/i18n.js';
import { drawResultCard, describeResultCard, CARD_W, CARD_H } from './result-card-draw.js';
import { rtext } from './result-card-text.js';

const FULL = [CARD_W, CARD_H];
const HALF = [CARD_W / 2, Math.round(CARD_H / 2)];

/** Keep the image's native gestures while the rest of the page is inactive. */
function isolateViewer(doc, root) {
  const win = doc.defaultView;
  const x = Number.isFinite(win?.scrollX) ? win.scrollX : 0;
  const y = Number.isFinite(win?.scrollY) ? win.scrollY : 0;
  const background = new Map();
  const styles = [];
  let released = false;
  const isolate = (node) => {
    if (released || node === root || node.nodeType !== 1 || background.has(node)) return;
    background.set(node, [node.getAttribute('inert'), node.getAttribute('aria-hidden')]);
    node.setAttribute('inert', '');node.setAttribute('aria-hidden', 'true');
  };
  const set = (node, property, value) => {
    styles.push([node.style, property, node.style.getPropertyValue(property) ?? '', node.style.getPropertyPriority?.(property) ?? '']);
    node.style.setProperty(property, value, 'important');
  };
  for (const node of doc.body.children) isolate(node);
  const observer = win?.MutationObserver ? new win.MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) isolate(node);
  }) : null;
  observer?.observe(doc.body, { childList: true });
  // The shorthand can serialize to '' for single-axis or mixed-priority values.
  for (const axis of ['overflow-x', 'overflow-y']) set(doc.documentElement, axis, 'hidden');
  for (const [property, value] of Object.entries({ 'overflow-x': 'hidden', 'overflow-y': 'hidden', position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%' })) set(doc.body, property, value);
  root.style.setProperty('overscroll-behavior', 'contain');
  return () => {
    if (released) return () => {};
    released = true;observer?.disconnect();
    for (const [node, previous] of background) {
      for (const [index, attribute] of ['inert', 'aria-hidden'].entries()) {
        if (previous[index] === null) node.removeAttribute(attribute);else node.setAttribute(attribute, previous[index]);
      }
    }
    background.clear();
    for (const [style, property, value, priority] of styles) {
      if (value) style.setProperty(property, value, priority);else style.removeProperty(property);
    }
    // Restore after the screen card has its pixels and height again.
    return () => win?.scrollTo?.(x, y);
  };
}

/** snapshot から画面の見せ方を決める（設計票 §3.3.2）。 */
export function cardViewState(snapshot) {
  const prepared = Boolean(snapshot?.prepared) && snapshot.prepared.revision === snapshot.revision;
  const state = snapshot?.state ?? 'pending';
  const failedWithout = state === 'failed' && !prepared;
  const full = state === 'sharing' || state === 'ready' || (prepared && (state === 'failed' || state === 'unavailable'));
  return {
    state,
    prepared,
    size: full ? FULL : HALF,
    shareDisabled: state === 'pending' || state === 'sharing',
    showRetry: failedWithout,
    shareFailed: state === 'failed' && prepared,
    failedWithout,
  };
}

export function mountResultCardView({ host, controller, scope, onTextShare, initial = null }) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  let disposed = false;
  let snapshot = controller?.snapshot?.() ?? initial;
  let lastState = snapshot?.state ?? 'pending';
  let viewer = null;
  let paintToken = 0;
  let statusKey = null;
  const cleanups = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); };

  const locale = () => snapshot?.model?.locale ?? 'en';
  const tx = (key, params) => t(key, params, locale());
  const el = (tag, cls, text, parent) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    parent?.append(node);
    return node;
  };

  // ---- DOM（既存ノードは移動だけ） ----
  host.classList.add('has-result-card');
  const card = el('section', 'result-card');
  card.setAttribute('data-testid', 'result-card');
  const canvas = el('canvas', 'result-card-canvas', null, card);
  canvas.width = HALF[0];
  canvas.height = HALF[1];
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('data-testid', 'result-card-canvas');
  const summary = el('p', 'result-card-summary', null, card);
  summary.setAttribute('aria-hidden', 'true');
  const title = host.querySelector('.result-title');
  if (title) title.after(card); else host.prepend(card);
  const actions = host.querySelector('.result-actions');
  const again = host.querySelector('[data-testid="result-again"]');
  const share = host.querySelector('[data-testid="result-share"]');
  if (actions) card.after(actions);
  if (share) {
    share.classList.add('result-card-share');
    if (again) again.after(share);
  }
  const secondary = el('div', 'result-card-secondary');
  secondary.setAttribute('data-testid', 'result-card-secondary');
  if (share) share.after(secondary); else actions?.prepend(secondary);
  const mk = (cls, testid, onClick) => {
    const b = el('button', `btn btn-small ${cls}`, null, secondary);
    b.type = 'button';
    b.setAttribute('data-testid', testid);
    listen(b, 'click', onClick);
    return b;
  };
  const saveBtn = mk('result-card-save', 'result-card-save', () => openViewer());
  const textBtn = mk('result-card-text', 'result-card-text', () => { try { onTextShare?.(); } catch { /* 本文共有の失敗で画面を止めない */ } });
  const retryBtn = mk('result-card-retry', 'result-card-retry', () => { controller?.retry?.(); });
  retryBtn.hidden = true;
  const status = el('p', 'result-card-status', null, secondary);
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('data-testid', 'result-card-status');

  // ---- 描画 ----
  function paint() {
    if (disposed || !snapshot?.model) return;
    const view = cardViewState(snapshot);
    if (viewer) { canvas.width = 0; canvas.height = 0; return; }
    if (canvas.width !== view.size[0] || canvas.height !== view.size[1]) { canvas.width = view.size[0]; canvas.height = view.size[1]; }
    const info = drawResultCard(canvas, { model: snapshot.model, portrait: snapshot.portraitImage ?? null, locale: locale(), failed: view.failedWithout });
    void info;
    const text = describeResultCard(snapshot.model, locale(), { failed: view.failedWithout, portrait: snapshot.portraitImage });
    canvas.setAttribute('aria-label', text.label);
    summary.textContent = text.summary;
  }

  function setStatus(key) {
    statusKey = key;
    const text = key ? tx(key) : '';
    status.textContent = text;
  }

  function syncControls() {
    const view = cardViewState(snapshot);
    saveBtn.textContent = tx('card.save');
    textBtn.textContent = tx('card.textShare');
    retryBtn.textContent = tx('card.retry');
    retryBtn.hidden = !view.showRetry;
    if (share) {
      if (view.shareDisabled) share.setAttribute('aria-disabled', 'true'); else share.removeAttribute('aria-disabled');
    }
    secondary.classList.toggle('is-share-failed', view.shareFailed && rtext('card.shareFailed', undefined, locale()) === null);
    // 状態の小文字
    let key = null;
    if (view.state === 'pending') key = 'card.preparing';
    else if (view.failedWithout) key = 'card.failed';
    else if (view.state === 'unavailable') key = 'card.shareUnavailable';
    else if (view.shareFailed) key = 'card.shareFailed';
    else if (view.state === 'ready' && lastState === 'sharing') key = 'card.shareClosed';
    if (key === 'card.shareFailed') {
      const own = rtext('card.shareFailed', undefined, locale());
      status.textContent = own ?? '';
      statusKey = key;
    } else setStatus(key);
  }

  function update(next) {
    if (disposed || !next) return;
    const previous = snapshot;
    snapshot = next;
    if (viewer && previous && previous.revision !== next.revision) closeViewer();
    syncControls();
    const view = cardViewState(next);
    if (view.state === 'unavailable') queueMicrotask(() => { if (!disposed && !viewer) saveBtn.focus?.(); });
    lastState = next.state;
    if (!viewer) {
      if (view.size[0] > canvas.width) {
        // controller は ready を通知した直後に自分の 1200×630 の canvas を捨てる。捨てた後（次のマイクロタスク）に大きい canvas を作る。
        const token = (paintToken += 1);
        queueMicrotask(() => { if (token === paintToken && !disposed && !viewer) paint(); });
      } else paint();
    }
  }

  // ---- 「Xでシェア」のタップ：タップ時の state を覚え、案内だけ出す（共有は App の既存の処理が直接呼ぶ） ----
  let tapState = null;
  if (actions) {
    listen(actions, 'click', (event) => {
      if (event.target?.closest?.('[data-testid="result-share"]')) tapState = cardViewState(snapshot);
    }, true);
    listen(actions, 'click', (event) => {
      if (!event.target?.closest?.('[data-testid="result-share"]') || !tapState) return;
      const was = tapState;
      tapState = null;
      if (was.state === 'pending') setStatus('card.preparing');
      else if (was.failedWithout) setStatus('card.failed');
    });
  }

  // ---- 画像の保存画面 ----
  function openViewer() {
    if (disposed || viewer) return;
    const url = controller?.getImageUrl?.() ?? null;
    if (!url) {
      const view = cardViewState(snapshot);
      setStatus(view.failedWithout ? 'card.failed' : 'card.preparing');
      return;
    }
    const root = el('div', 'result-card-viewer');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('data-testid', 'result-card-viewer');
    const heading = el('h2', 'result-card-viewer-title', rtext('card.viewerTitle', undefined, locale()) ?? tx('card.save'), root);
    heading.id = `result-card-viewer-title-${Math.random().toString(36).slice(2, 8)}`;
    root.setAttribute('aria-labelledby', heading.id);
    const closeBtn = el('button', 'btn btn-small result-card-viewer-close', tx('common.close'), root);
    closeBtn.type = 'button';
    closeBtn.setAttribute('data-testid', 'result-card-viewer-close');
    const img = el('img', 'result-card-viewer-image', null, root);
    img.src = url;
    img.alt = describeResultCard(snapshot.model, locale()).label;
    img.width = CARD_W;
    img.height = CARD_H;
    img.setAttribute('data-testid', 'result-card-viewer-image');
    el('p', 'result-card-viewer-hint', tx('card.saveHint'), root);
    const link = el('a', 'btn btn-primary result-card-viewer-download', tx('card.save'), root);
    link.href = url;
    link.setAttribute('download', 'chameleol-result.png');
    link.setAttribute('data-testid', 'result-card-viewer-download');
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeViewer(); return; }
      if (event.key !== 'Tab') return;
      const order = [closeBtn, link];
      const at = order.indexOf(doc.activeElement);
      const next = event.shiftKey ? (at <= 0 ? order.length - 1 : at - 1) : (at < 0 || at === order.length - 1 ? 0 : at + 1);
      event.preventDefault();
      order[next].focus();
    };
    closeBtn.addEventListener('click', () => closeViewer());
    doc.addEventListener('keydown', onKey);
    doc.body.append(root);
    viewer = { root, onKey, restoreBackground: isolateViewer(doc, root) };
    // 画面全体を覆うので、画面のカードの画素は一時的に手放す（同時保持の上限のため）。
    canvas.width = 0;
    canvas.height = 0;
    closeBtn.focus?.();
  }

  function closeViewer({ refocus = true } = {}) {
    if (!viewer) return;
    const { root, onKey, restoreBackground } = viewer;
    viewer = null;
    doc.removeEventListener('keydown', onKey);
    root.querySelector('img')?.removeAttribute('src');
    root.remove();
    const restoreScroll = restoreBackground();
    try { controller?.revokeImageUrl?.(); } catch { /* 解除の失敗で閉じられなくならない */ }
    if (disposed) return;
    const view = cardViewState(snapshot);
    canvas.width = view.size[0];
    canvas.height = view.size[1];
    paint();
    restoreScroll();
    if (refocus) saveBtn.focus?.({ preventScroll: true });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    closeViewer({ refocus: false });
    paintToken += 1;
    for (const off of cleanups.splice(0)) { try { off(); } catch { /* 続けて解放 */ } }
    canvas.width = 0;
    canvas.height = 0;
    card.remove();
    secondary.remove();
    host.classList.remove('has-result-card');
    share?.classList.remove('result-card-share');
    share?.removeAttribute('aria-disabled');
  }

  syncControls();
  paint();
  void win;
  scope?.own?.(dispose);
  return {
    update,
    dispose,
    openViewer,
    closeViewer,
    elements: { card, canvas, summary, secondary, saveBtn, textBtn, retryBtn, status },
    stats() {
      return {
        canvas: [canvas.width, canvas.height],
        canvasBytes: canvas.width * canvas.height * 4,
        viewerOpen: Boolean(viewer),
        viewerImageBytes: viewer ? CARD_W * CARD_H * 4 : 0,
        statusKey,
        disposed,
      };
    },
  };
}
