import { h } from './dom.js';
import { backButton, button, toast } from './screens.js';
import { createControls } from './controls.js';
import { createTimeAttackResult } from './time-attack-result.js';
import { TimeAttackSession } from '../game/time-attack-session.js';
import { makeDecorations, RULES_V5 } from '../rules/v1/index.js';
import {
  MODE_ID, CURRENT_RULES_VERSION, COURSE_VERSION, generateTimeAttackCourse, publicView, centiseconds, formatTime,
} from '../rules/time-attack/v1/index.js';
import { normalizeName } from '../shared/name.js';
import { openTimeAttackStore } from '../storage/time-attack-store.js';
import { TimeAttackMemoryStore, StaleTimeAttackWriter } from '../storage/time-attack-memory-store.js';
import { createTimeAttackAttempt, reserveTimeAttack } from '../net/time-attack-start.js';
import { createTimeAttackOutbox, createTimeAttackUpload } from '../net/time-attack-outbox.js';
import { t } from '../i18n/i18n.js';

const TA_CLIENT_VERSION = '0.1.0-ta.2';
const NEUTRAL_WALL = Object.freeze({ h: 0, s: 0, v: 3000 });
const STAGE_RULES = Object.freeze({ ...RULES_V5, buildingCount: 30, buildingMs: 2000, brightnessUnlockBuilding: 15 });

export function installTimeAttack(app) {
  const memory = new TimeAttackMemoryStore();
  const taf = { memory, result: null, store: null };
  taf.ready = openTimeAttackStore().then(store => { taf.store = store; }).catch(() => {});
  taf.network = createTimeAttackOutbox(app.api, {
    stores: () => [taf.store, memory].filter(Boolean),
    onRecord: record => {
      if (taf.result?.id !== record.id) return;
      taf.result = record;
      taf.repaintResult?.();
    },
  });
  taf.ready.then(() => taf.network.flush());
  return taf;
}

function statistic(key, testid) {
  const value = h('strong', { 'data-testid': testid }, '—');
  return { value, el: h('div', { class: 'ta-stat' }, [h('span', { class: 'ta-stat-label' }, t(key)), value]) };
}

function requestRunLock() {
  const locks = globalThis.navigator?.locks;
  if (!locks) return Promise.resolve(() => {});
  return new Promise((resolve, reject) => {
    locks.request('kamereoru-time-attack-run', { ifAvailable: true }, lock => {
      if (!lock) return resolve(null);
      return new Promise(release => resolve(release));
    }).catch(reject);
  });
}

export function startTimeAttack(app, rawName) {
  if (!app.runtime.timeAttackEnabled || app.taPreparation || app.taController || app.startAttempt || app.session) return;
  const name = normalizeName(rawName);
  if (!name.ok) {
    app.layer?.append(h('p', { class: 'notice', role: 'alert' }, t('name.fixBeforeStart')));
    return;
  }
  const context = app.timeAttack;
  context.result = null;
  context.repaintResult = null;
  let active = null;
  let reservationAttempt = null;
  let reservedStore = null;
  let readyMessage = null;
  let cancelled = false;
  let audienceOnly = false;
  let allowMemory = false;

  function abandon() {
    const attempt = reservationAttempt;
    const store = reservedStore;
    reservationAttempt = null;
    reservedStore = null;
    if (attempt && store) {
      store.put('starts', { ...attempt, abandoned: true })
        .then(() => context.network.flush(true)).catch(() => {});
    }
  }

  const flow = {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      active?.abort();
      if (!active) abandon();
    },
    hidden() {
      if (active) active.abort();
    },
  };

  function intro(message = null) {
    readyMessage = message;
    const primary = button(message === 'ta.startFailed' ? 'ta.retry' : 'ta.start',
      () => begin(), { primary: true, testid: 'ta-start' });
    const actions = [primary];
    if (message === 'ta.startFailed') {
      actions.push(button('ta.localStart', () => { abandon(); audienceOnly = true; begin(); }, { testid: 'ta-local-start' }));
    }
    if (message === 'ta.storageFailed') {
      actions.push(button('ta.continueWithoutSaving', () => { allowMemory = true; begin(); }, { testid: 'ta-memory-start' }));
    }
    actions.push(button('home.records', () => showTimeAttackRecords(app), { testid: 'ta-start-records' }));
    actions.push(button('common.cancel', () => app.showHome(), { testid: 'ta-start-cancel' }));

    app.taPreparation = null;
    app.mount(h('main', { class: 'screen ta-intro', 'data-testid': 'ta-intro' }, [
      h('h1', {}, t('ta.mode')), h('p', {}, t('ta.instructions')),
      message ? h('p', { class: 'notice', role: 'status' }, t(message)) : null,
      h('div', { class: 'ta-start-actions' }, actions),
    ]), () => { if (!active) intro(readyMessage); });
    app.taPreparation = flow;
  }

  async function begin() {
    if (active || cancelled || document.hidden) return;
    const attemptAbort = new AbortController();
    const { signal } = attemptAbort;
    active = attemptAbort;

    app.root.querySelectorAll('.ta-start-actions button:not([data-testid="ta-start-cancel"])')
      .forEach(el => { el.disabled = true; });
    const status = h('p', { class: 'notice', role: 'status' }, t('ta.preparing'));
    app.root.querySelector('.ta-intro')?.append(status);

    let release, stageController, committed = false;
    let failedView = null;
    try {
      await context.ready;
      signal.throwIfAborted();
      const store = allowMemory ? context.memory : context.store;
      if (!store) { failedView = 'ta.storageFailed'; return; }
      release = await requestRunLock();
      if (!release) { failedView = 'ta.activeElsewhere'; return; }
      signal.throwIfAborted();

      const ranked = !audienceOnly && !name.empty;
      if (ranked && !app.api.configured) { failedView = 'ta.startFailed'; return; }
      const attempt = ranked && reservationAttempt ? reservationAttempt : createTimeAttackAttempt({
        destination: app.api.destination, name: ranked ? name.name : '', gameVersion: TA_CLIENT_VERSION,
      });
      attempt.ownerEpoch = performance.timeOrigin + performance.now();
      let course, playId = null;

      if (ranked) {
        reservationAttempt = attempt;
        reservedStore = store;
        try { await store.put('starts', attempt); }
        catch { failedView = 'ta.storageFailed'; return; }
        signal.throwIfAborted();
        try {
          const reservation = await reserveTimeAttack(app.api, attempt, signal);
          course = reservation.course;
          playId = reservation.playId;
        } catch {
          failedView = 'ta.startFailed';
          return;
        }
      } else {
        const [seed] = globalThis.crypto.getRandomValues(new Uint32Array(1));
        course = generateTimeAttackCourse(seed, CURRENT_RULES_VERSION);
      }

      const { requestId, launchId, secret, gameVersion } = attempt.request;
      const launch = { id: launchId, requestId, destination: attempt.destination, body: {
        launchId, playId, secret: ranked ? secret : null, ranked, modeId: MODE_ID,
        rulesVersion: course.rulesVersion, generatorVersion: COURSE_VERSION, gameVersion, family: course.family,
      } };
      signal.throwIfAborted();
      // Mount under an opaque cover so the canvas can size itself before the
      // launch transaction. The preparation flow still owns cancellation.
      app.taPreparation = null;
      stageController = prepareGame(app, store, attempt, launch, course, flow.cancel);
      app.taPreparation = flow;
      await stageController.ready;
      if (document.hidden) attemptAbort.abort();
      signal.throwIfAborted();
      try {
        await store.begin(launch, { attemptId: attempt.attemptId, ownerEpoch: attempt.ownerEpoch }, signal);
      } catch (error) {
        if (error instanceof StaleTimeAttackWriter) failedView = 'ta.activeElsewhere';
        else if (!signal.aborted) failedView = 'ta.storageFailed';
        return;
      }
      committed = true;
      reservationAttempt = null;
      reservedStore = null;
      context.network.flush(true);
      if (cancelled || app.taController !== stageController) return;
      app.taPreparation = null;
      stageController.start(release, allowMemory, signal.aborted);
      release = null;
    } catch {
      if (!signal.aborted) failedView = 'ta.startFailed';
    } finally {
      release?.();
      active = null;
      if (!committed && (signal.aborted || cancelled)) abandon();
      if (!committed && !cancelled && app.taPreparation === flow) intro(failedView);
    }
  }

  intro();
}

function prepareGame(app, store, attempt, launch, course, onCancel) {
  const context = app.timeAttack;
  const session = new TimeAttackSession(course);
  const visualCourse = { seed: course.seed, targets: Array(30).fill(NEUTRAL_WALL) };
  const stageBox = h('div', { class: 'stage ta-stage', 'data-testid': 'ta-stage' });
  const cover = h('div', { class: 'ta-overlay' }, [
    h('p', { role: 'status' }, t('ta.preparing')),
    button('common.cancel', () => { onCancel(); app.showHome(); }, { testid: 'ta-loading-cancel' }),
  ]);
  const building = statistic('ta.buildingLabel', 'ta-building');
  const time = statistic('ta.timeLabel', 'ta-time');
  const family = statistic('ta.familyLabel', 'ta-family');
  family.value.textContent = t(`ta.family.${course.family}`);
  const color = statistic('ta.colorLabel', 'ta-color');
  const light = statistic('ta.brightnessLabel', 'ta-brightness');
  const fill = h('div', { class: 'ta-hold-progress' });
  const hold = h('div', { class: 'ta-hold-track', role: 'progressbar', 'aria-label': t('ta.holdLabel'),
    'aria-valuemin': 0, 'aria-valuemax': 500, 'aria-valuenow': 0 }, fill);
  const pauseButton = h('button', { type: 'button', class: 'btn btn-pause ta-pause',
    'aria-label': t('ta.pause'), 'data-testid': 'ta-pause', onclick: () => pause() }, 'Ⅱ');
  const controls = createControls({ scrollSpeed: app.pcScrollSpeed, ...app.controlAudioCallbacks(), onChange(value) {
    if (document.hidden || !started || finishing) return;
    session.input(value, performance.now());
    draw();
  } });
  controls.setEnabled(false);
  controls.setLocked(true);
  const screen = h('main', { class: 'screen game ta-game', 'data-testid': 'ta-game' }, [
    h('div', { class: 'stage-wrap' }, [stageBox,
      h('div', { class: 'ta-hud' }, [building.el, time.el, family.el, pauseButton]),
      h('div', { class: 'ta-match-stats' }, [color.el, light.el]), hold, cover]),
    controls.el,
  ]);
  app.mount(screen);
  let stage, shownBuilding = null, phase, controlBuilding, raf = 0, disposed = false, finishing = false;
  let started = false, release = null, memoryOnly = false;
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const controller = {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      controls.destroy();
      stage?.dispose();
      release?.();
    },
    onVisibility() { if (document.hidden && started) pause(); },
    onPageHide() { if (started) pause(); },
    start(releaseLock, volatile, wasHidden) {
      release = releaseLock;
      memoryOnly = volatile;
      started = true;
      cover.replaceChildren();
      if (document.hidden || wasHidden) session.pauseAtCurrentTime();
      draw();
      if (memoryOnly) screen.append(h('p', { class: 'ta-volatile', role: 'status' }, t('ta.offlineQueue')));
      raf = requestAnimationFrame(loop);
    },
  };
  app.taController = controller;
  controller.ready = (async () => {
    const prepared = await app.stageFactory(stageBox, {
      course: visualCourse, rules: STAGE_RULES, decorations: makeDecorations(course.seed),
      presentationEnabled: false, centerOnBuilding: true,
    });
    if (disposed) { prepared.dispose(); return; }
    stage = prepared;
    controls.layout();
    stage.resize();
  })();

  function pause() {
    if (!started || finishing) return;
    session.pause(performance.now());
    draw();
  }

  function loop(now) {
    if (disposed || finishing) return;
    if (document.hidden) session.pause(now);
    else session.frame(now);
    if (session.state.phase === 'cleared') void finish();
    else {
      draw();
      raf = requestAnimationFrame(loop);
    }
  }

  function draw() {
    if (disposed || !stage || finishing) return;
    const view = publicView(session.state, course);
    const playable = view.phase === 'active' && !document.hidden;
    const paused = view.phase === 'paused' || session.hiddenBeforeReady;
    const visibleBuilding = playable ? view.building : null;
    if (shownBuilding !== visibleBuilding) {
      if (shownBuilding !== null) stage.setTimeAttackTarget?.(shownBuilding, NEUTRAL_WALL);
      if (visibleBuilding !== null) stage.setTimeAttackTarget?.(visibleBuilding, view.targetColor);
      shownBuilding = visibleBuilding;
    }
    if (phase !== view.phase || controlBuilding !== view.building) {
      controls.releaseAll();
      controls.setValues(view.currentColor);
      controls.setLocked(!view.brightnessEnabled);
      controls.setEnabled(playable);
      phase = view.phase;
      controlBuilding = view.building;
    } else if (!playable) {
      controls.setEnabled(false);
    }
    if (paused && !cover.querySelector('[data-testid="ta-resume"]')) {
      cover.replaceChildren(h('h2', {}, t('ta.paused')),
        button('ta.resume', () => {
          if (document.hidden) return;
          session.resume(performance.now());
          phase = null;
          draw();
        }, { primary: true, testid: 'ta-resume' }),
        button('ta.quit', () => void finish(), { testid: 'ta-quit' }));
    } else if (!paused) {
      const traveling = ['await_travel', 'travel', 'await_ready'].includes(view.phase);
      const label = traveling ? t('ta.travel') : '';
      if (cover.textContent !== label) cover.textContent = label;
    }
    cover.classList.toggle('ta-overlay-travel', !paused);
    cover.hidden = !paused && !cover.textContent;
    pauseButton.disabled = paused || view.phase === 'prepared';
    screen.dataset.phase = view.phase;
    building.value.textContent = `${view.building} / 30`;
    time.value.textContent = formatTime(centiseconds(view.elapsedMs));
    color.value.textContent = view.colorMatchUnits == null ? '—' : `${(view.colorMatchUnits / 1e6).toFixed(1)}%`;
    light.value.textContent = view.brightnessMatchUnits == null ? '—' : `${(view.brightnessMatchUnits / 1e6).toFixed(1)}%`;
    light.el.hidden = !view.brightnessEnabled;
    fill.style.width = `${view.holdMs / 5}%`;
    hold.setAttribute('aria-valuenow', String(view.holdMs));
    const position = reduceMotion?.matches ? Math.floor(view.scenePosition) : view.scenePosition;
    stage.update({ t: (position + 0.5) * STAGE_RULES.buildingMs, color: view.currentColor, policeStage: 0,
      walking: !reduceMotion?.matches && view.phase === 'travel', running: !paused,
      presentation: { t: session.state.t, building: view.building, running: !paused } });
  }

  async function finish() {
    if (disposed || finishing) return;
    finishing = true;
    cancelAnimationFrame(raf);
    controls.releaseAll();
    controls.setEnabled(false);
    cover.replaceChildren(h('p', { role: 'status' }, t('ta.preparing')));
    cover.classList.remove('ta-overlay-travel');
    cover.hidden = false;
    const { history, historyTooLarge, result } = session.finish();
    let outbox = null;
    if (history && launch.body.ranked) {
      try { outbox = await createTimeAttackUpload(history, launch); } catch { /* Keep the local record. */ }
    }
    const limited = historyTooLarge || (history && launch.body.ranked && !outbox);
    const record = { id: launch.id, destination: launch.destination, result,
      playId: launch.body.playId, secret: launch.body.secret, finishedAt: Date.now(), status: outbox ? 'uploading' : limited ? 'too_large' : 'local_only' };
    context.result = record;
    try {
      const best = await store.finish({ attemptId: attempt.attemptId, ownerEpoch: attempt.ownerEpoch }, record, outbox);
      Object.assign(context.result, best);
    } catch {
      context.result.status = 'storage_failed';
    }
    if (disposed) return;
    showResult(app, store);
    context.network.flush(true);
  }

  return controller;
}

function showResult(app, store) {
  const context = app.timeAttack;
  const render = () => {
    const record = context.result;
    if (!record) return;
    const { status, result, bestElapsedCs, newBest, reviewRequested } = record;
    return createTimeAttackResult({
      result, status, bestElapsedCs, newBest, reviewRequested,
      onResend: () => context.network.flush(true),
      onRetry: () => startTimeAttack(app, app.nameRaw),
      onHome: () => app.showHome(),
      onReview: status === 'rejected' && !reviewRequested && record.playId
        ? async () => {
          try { await context.network.review(store, record); }
          catch { toast(app.layer, t('records.reviewFailed'), { kind: 'warn' }); }
        } : undefined,
    });
  };
  const screen = render();
  const repaint = () => {
    if (screen.isConnected && context.result) screen.replaceChildren(...render().childNodes);
  };
  app.mount(screen, repaint);
  context.repaintResult = repaint;
}


export function showTimeAttackRecords(app) {
  const context = app.timeAttack;
  const entries = h('div', { class: 'ta-start-actions', 'aria-live': 'polite' });
  const screen = h('main', { class: 'screen records-screen' }, [
    h('h1', {}, t('ta.mode')), h('h2', {}, t('records.title')),
    button('records.refresh', async () => { await context.network.flush(true); await load(); }),
    entries, backButton(() => app.showRecords()),
  ]);
  app.mount(screen, () => showTimeAttackRecords(app));

  async function load() {
    await context.ready;
    const stores = [context.store, context.memory].filter(Boolean);
    const rows = (await Promise.all(stores.map(async store => {
      const records = await store.getAll('records').catch(() => []);
      return records.map(record => ({ store, record }));
    }))).flat().sort((a, b) => (b.record.finishedAt ?? 0) - (a.record.finishedAt ?? 0));
    if (!screen.isConnected) return;
    entries.replaceChildren(...rows.map(({ store, record }) => {
      const { elapsedCs, reason, clearedCount } = record.result;
      const title = reason === 'cleared' ? t('ta.clearTime') : t('ta.quitSummary', { count: clearedCount });
      return h('button', { type: 'button', class: 'btn', onclick: () => {
        context.result = record;
        showResult(app, store);
        context.network.flush(true);
      } }, [title, ' ', h('bdi', {}, formatTime(elapsedCs))]);
    }));
    if (!rows.length) entries.append(h('p', { class: 'note' }, t('records.empty')));
  }

  void load();
}
