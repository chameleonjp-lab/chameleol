// 結果の描画口（IF03）。App の resultCardPorts へ渡す：
//   new App(root, { resultCardPorts: ({ result, host, scope }) => createResultCardPorts({ result, host, scope }) })
// 呼ばれる順番：factory → onChange（初回。mount より先）→ mount（controller.snapshot() を読む）→ パネルの初回登録。
// factory の中では描画器を借りない・DOM を作らない。購読は factory が所有し、scope で解除する。
// 製品の ports に navigator・shareImpl・urlApi・waitForPresentation・focusTarget・visibilityTarget・createCanvas・encodePng は定義しない
// （定義すると controller の本物の既定を上書きする。試験の代用品だけが使う）。
import { drawResultCard, CARD_LAYOUT_KEY } from './result-card-draw.js';
import { mountResultCardView } from './result-card-view.js';
import { createResultPortrait, createResultRenderer, destroyResultRenderer } from './result-portrait.js';
import { createMiniaturePanel } from './result-miniature-view.js';
import { createTurnPanel } from './result-turn-view.js';

/**
 * @param {{result: object, host?: Element, scope?: {own(fn: () => void): void}}} args
 */
export function createResultCardPorts({ result, scope = null } = {}) {
  const state = { latest: null, controller: null, view: null, instances: new Set(), disposed: false };
  const getSnapshot = () => (state.controller?.snapshot?.() ?? state.latest);
  const register = (instance) => {
    state.instances.add(instance);
    return () => state.instances.delete(instance);
  };
  const getOwner = () => result?.resultRendererOwner ?? null;

  function onChange(snapshot) {
    if (state.disposed) return;
    // 初回は mount より先に来る。最新を保持し、mount 済みなら画面と開いたパネルへ流す。
    state.latest = snapshot;
    try { state.view?.update(snapshot); } catch { /* 画面の更新の失敗で処理を止めない */ }
    for (const instance of [...state.instances]) {
      try { instance.update(snapshot); } catch { /* 開いたパネルの失敗で処理を止めない */ }
    }
  }

  function mount({ host, controller, scope: mountScope, onTextShare } = {}) {
    if (state.disposed) return { dispose() {} };
    state.controller = controller ?? null;
    const view = mountResultCardView({ host, controller, scope: null, onTextShare, initial: state.latest });
    state.view = view;
    mountScope?.own?.(() => view.dispose());
    return {
      view,
      dispose() {
        if (state.view === view) state.view = null;
        view.dispose();
      },
    };
  }

  function describeResources() {
    const view = state.view?.stats?.();
    const turn = [...state.instances].map((i) => i.stats?.()).filter(Boolean);
    return {
      cardCanvasBytes: view?.canvasBytes ?? 0,
      viewerImageBytes: view?.viewerImageBytes ?? 0,
      panelCanvasBytes: turn.reduce((sum, s) => sum + (s.canvasBytes ?? 0), 0),
      openPanels: state.instances.size,
    };
  }

  scope?.own?.(() => {
    state.disposed = true;
    state.instances.clear();
    state.view = null;
    state.controller = null;
    state.latest = null;
  });

  return {
    createRenderer: createResultRenderer,
    destroyRenderer: destroyResultRenderer,
    createResultPortrait,
    drawResultCard,
    getLayoutKey: () => CARD_LAYOUT_KEY,
    onChange,
    mount,
    panels: [
      createMiniaturePanel({ getSnapshot, register }),
      createTurnPanel({ getSnapshot, register, getOwner }),
    ],
    describeResources,
  };
}
