// カメレオる：画面の流れと、本編・練習・保存・通信をつなぐ。
// 本編の状態：ホーム→開始準備→初回演出（初回のみ）→進行中↔一時停止→再開カウントダウン→進行中→終了確定→終了演出→結果
// 送信・審査の状態は画面とは別に管理し、送信待ちで次のプレイを止めない。
import {
  RULES_V4 as RULES_V1,
  makeDecorations,
  createGame,
  rankAverage,
  formatRankAverage,
  classifyMatch,
  isEvalTime,
} from './rules/v1/index.js';
import { areaOf } from './rules/v1/course.js';
import { GameSession } from './game/session.js';
import { alertWordKey, createAlertStageTracker, createInstantSuccessTracker, matchWordKey } from './game/feedback.js';
import { createControls } from './ui/controls.js';
import { h, clear, isolatedText } from './ui/dom.js';
import { audioSettings, backButton, button, dialog, languageSelect, nameField, section, toast } from './ui/screens.js';
import { createRankingView, rankingLink } from './ui/ranking.js';
import { createRecordsView } from './ui/record-status.js';
import { projectRunResult } from './presentation/result-card-data.js';
import { GAME_URL, formatRunMetrics, buildHomeShareText, buildResultShareText, xShareForm } from './ui/share.js';
import { t, setLanguage, getLanguage, formatNumber, formatPercent2, onLanguageChange } from './i18n/i18n.js';
import { isSupportedLanguage, resolveLanguage } from './i18n/languages.js';
import { openStore, TAB_ID, StaleWriterError } from './storage/store.js';
import { normalizeExtras, readDirector, applyBadgeClaim, applyCameoClaim } from './storage/presentation-extras.js';
import { MemoryStore } from './storage/memory-store.js';
import { createMixer } from './audio/mixer.js';
import { createStage, createVisiblePresentationClock } from './scene/stage.js';
import { createPresentationScope } from './presentation/scope.js';
import { readPlayView } from './presentation/events.js';
import { buildBonusBatch, buildEndingBonus } from './presentation/bonus-data.js';
import { mountBonusPresentation, mountEndingBonus } from './presentation/bonus-view.js';
import { choosePassCue } from './presentation/bonus-audio.js';
import { buildResultData } from './presentation/result-data.js';
import { mountResultPresentation } from './presentation/result-view.js';
import { captureEvidenceBase, releaseResultEvidence, resolveResultEvidence, startResultEvidence } from './presentation/result-evidence.js';
import { createResultCardController, releaseResultCardResources } from './presentation/result-card-controller.js';
import { createResultRendererOwner } from './presentation/result-renderer-owner.js';
import { createResultCardPorts } from './presentation/result-card-ports.js';
import { EXCLUDED_EFFECT_IDS, CAMEOS } from './presentation/catalog.js';
import { createPrecisionBadge } from './presentation/precision-badge.js';
import { createGameExtrasController } from './presentation/game-extras-controller.js';
import { createEvaluationSegmentCollector } from './presentation/evaluation-segments.js';
import { mountResultPanels } from './presentation/result-evidence-view.js';
import { sanitizeStats } from './presentation/stats.js';
import { mountPresentationHud } from './presentation/hud-view.js';
import { normalizeGuideProgress, claimGroup, GUIDE_PROGRESS_KEY } from './guidance/progress.js';
import { createGuidance } from './guidance/session.js';
import { mountGuidance } from './guidance/view.js';
import { PRACTICE_STEPS, createGuidePractice } from './guidance/practice.js';
import { normalizeName } from './shared/name.js';
import { loadRuntimeConfig } from './config/runtime.js';
import { createApi, uuid } from './net/api.js';
import { savedOwnerSecret, abandonStart, createLaunch, createStartRequest, flushLaunches, recordLaunch, sendStartRequest } from './net/start.js';
import { flushOutbox, makeOutboxItem, refreshRecords, requestReview } from './net/outbox.js';

const SAVE_INTERVAL_MS = 5000; // 試作値：通過時に加えて、ゲーム内5秒ごとに保存

function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

const better = (a, b) => !b || a.buildings > b.buildings || (a.buildings === b.buildings && (a.rankAverage ?? -1) > (b.rankAverage ?? -1));

export class App {
  constructor(root, { audio = null, stageFactory = null, resultCardPorts = null } = {}) {
    this.root = root;
    this.runtime = loadRuntimeConfig();
    this.api = createApi({ base: this.runtime.apiBase, destination: this.runtime.destination });
    this.audio = audio ?? createMixer();
    this.stageFactory = stageFactory ?? createStage;
    this.resultCardPorts = resultCardPorts;
    this.store = null;
    this.volatileNetwork = new MemoryStore();
    this.flags = {};
    this.nameRaw = '';
    this.session = null;
    this.playSecrets = new WeakMap();
    this.generation = 0;
    this.memoryOnly = false;
    this.extrasMemory = { version: 1, plays: [] };
    this.startToken = null;
    this.startAttempt = null;
    this.practiceToken = null;
    this.screenGeneration = 0;
    this.presentationScope = null;
    this.raf = 0;
    this.notices = [];
    this.lastResult = null;
  }

  // ---------- 起動 ----------
  async boot() {
    try {
      this.store = await openStore();
    } catch {
      this.store = new MemoryStore();
      this.notices.push('notice.storageUnavailable');
    }
    let savedLang = null;
    try {
      savedLang = await this.store.get('lang');
    } catch {
      /* 読めなくても既定で続ける */
    }
    const device = globalThis.navigator;
    const langs = [...(device?.languages ?? []), device?.language];
    const preferred = resolveLanguage(savedLang, langs, null);
    this.languageUndetermined = preferred === null;
    setLanguage(preferred ?? 'ja');
    this.audio.setSettings((await this.safeGet('audio')) ?? {});
    this.flags = (await this.safeGet('flags')) ?? {};
    this.nameRaw = (await this.safeGet('nameRaw')) ?? '';
    await this.checkSavedRun();
    onLanguageChange(() => this.rerender?.());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    globalThis.addEventListener('pagehide', () => this.saveNow('pagehide'));
    globalThis.addEventListener('online', async () => {
      await this.flushNetwork();
      if (this.renderResultStatus) await this.pollResult();
    });
    // 画面に触れた時に音を準備する（本編の外だけ。停止中は「再開」を押すまで音を出さない）
    document.addEventListener('pointerdown', () => this.wakeMenuAudio(), { passive: true });
    // ボタンの音：決定・戻る・そのほか。個別に鳴らしている所とは同じ音なので重ならない
    document.addEventListener('click', (e) => {
      const b = e.target?.closest?.('.btn, .btn-pause');
      if (!b || b.disabled) return;
      this.audio.play(b.classList.contains('btn-primary') ? 'confirm' : b.classList.contains('btn-back') ? 'back' : 'select');
    });
    this.showHome();
    this.flushNetwork();
  }

  /** 本編の外（ホーム・結果・練習など）で流す曲を決めて、音を準備する。 */
  async wakeMenuAudio() {
    if (this.session || !this.menuTheme) return false;
    const gen = this.screenGeneration;
    let ready = false;
    try {
      ready = await this.audio.prepare();
    } catch {
      return false;
    }
    if (!ready || this.session || !this.menuTheme) return false;
    if (this.screenGeneration === gen) {
      this.audio.setMusic(this.menuTheme);
    }
    return ready;
  }

  /**
   * パレット・明るさバーの操作開始／ドラッグ刻み／通常の指離し音を結線する。
   * - 指を動かさない単発タップでは touchPalette / touchBar のみ鳴り、colorStep は一切鳴らない（controls 側で phase === 'move' のみ発火）。
   * - play() が false を返した場合でも、AudioContext が既に running なら（消音・音量0・最短間隔抑止のため）wakeMenuAudio() を呼ばない。
   * - 未準備状態で wakeMenuAudio() を待った場合は、完了時に画面世代・セッション・操作部品の有効性を再確認し、古い操作音は破棄する。
   */
  controlAudioCallbacks() {
    const triggerPlay = (name, opts) => {
      if (this.audio.play(name, opts)) return;
      if (this.audio.running) return;
      if (!this.session && this.menuTheme) {
        const gen = this.screenGeneration;
        const ctrl = this.controls;
        this.wakeMenuAudio().then((ready) => {
          if (!ready) return;
          if (this.screenGeneration !== gen || this.session) return;
          if (ctrl && (this.controls !== ctrl || ctrl.el.classList.contains('disabled'))) return;
          this.audio.play(name, opts);
        });
      }
    };
    return {
      onPartDown: (part) => {
        triggerPlay(part === 'bar' ? 'touchBar' : 'touchPalette');
      },
      onPartUp: (_part, changed) => {
        if (changed) triggerPlay('colorRelease');
      },
      onColorStep: (c) => {
        triggerPlay('colorStep', { v: c.v });
      },
    };
  }

  setMenuMusic(theme) {
    this.menuTheme = theme;
    this.audio.setMusic(theme);
  }

  async safeGet(key) {
    try {
      return await this.store.get(key);
    } catch {
      return undefined;
    }
  }

  async safeSet(key, value) {
    try {
      await this.store.set(key, value);
      return true;
    } catch {
      return false;
    }
  }

  async setFlag(name, value = true) {
    this.flags = { ...this.flags, [name]: value };
    await this.safeSet('flags', this.flags);
  }

  /** 進行中の保存を検査する。読めない・未対応の版は消さずに隔離し、理由を知らせる。 */
  async checkSavedRun() {
    this.savedRun = null;
    this.foreignRun = null;
    if (this.homeContinue?.isConnected) this.homeContinue.hidden = true;
    let run;
    try {
      run = await this.store.loadRun();
    } catch {
      return;
    }
    if (!run || run.status !== 'active') return;
    const r = GameSession.fromSnapshot(run.snapshot);
    if (r.error === 'unknown_rules_version' || r.error === 'unknown_format') {
      // 別の版で保存したプレイ：消さずに残し、保存した版の資源で続けられるよう案内する（切り戻し・更新の両方向）
      this.foreignRun = { playId: run.playId, reason: r.error, assetVersion: run.snapshot?.meta?.assetVersion ?? null, rulesVersion: run.snapshot?.meta?.rulesVersion ?? null };
      return;
    }
    if (r.error) {
      await this.store.quarantineRun(r.error, run.playId).catch(() => {});
      this.notices.push('notice.savedRunBroken');
      return;
    }
    this.savedRun = run;
    if (this.homeContinue?.isConnected) this.homeContinue.hidden = false;
  }

  /** 別の版のプレイの案内（保存した版のページ）。 */
  foreignRunLink() {
    const v = this.foreignRun?.assetVersion;
    if (!v || v === this.runtime.assetVersion || !/^[0-9A-Za-z._-]{1,64}$/.test(v)) return null;
    return new URL(`v/${v}/`, document.baseURI.replace(/v\/[^/]+\/$/, '')).href;
  }

  flushNetwork() {
    // Give each trigger a pass after earlier sends: a finish can be queued
    // while the boot-time flush is already reading its batch.
    this.networkQueue = (this.networkQueue ?? Promise.resolve()).then(() => this.sendPending());
    return this.networkQueue;
  }

  async sendPending() {
    if (!this.api.configured) return;
    let accepted = 0;
    for (const store of [this.store, this.volatileNetwork]) {
      try {
        await flushLaunches(this.api, store);
        const sent = await flushOutbox({ api: this.api, store, ownerStore: this.store, onUpdate: u => this.onOutboxUpdate(u) });
        accepted += sent.accepted;
      } catch {
        // Retry when connectivity or storage recovers.
      }
    }
    for (const record of await this.volatileNetwork.getAll('records')) {
      try {
        if (!await this.store.getOne('records', record.playId)) await this.store.put('records', record);
        await this.volatileNetwork.delete('records', record.playId);
      } catch {
        // Keep the private receipt available for status polling in this tab.
      }
    }
    if (accepted) await this.refreshStatuses();
  }

  applyResultRecord(record) {
    const r = this.lastResult;
    if (record.playId !== r?.playId) return;
    r.netState = record.status;
    r.official = record.official;
    r.corrections = record.corrections;
    r.metrics = record.metrics;
    if (record.verifiedScore) r.verifiedScore = record.verifiedScore;
    this.renderResultScore?.();
    this.renderResultStatus?.();
  }

  async refreshStatuses() {
    const screen = this.screenGeneration, result = this.lastResult;
    const isCurrent = () => this.screenGeneration === screen && this.lastResult === result;
    try {
      const updated = await refreshRecords({ api: this.api, store: this.store, isCurrent });
      if (updated.some(r => r.unseenChange)) this.flags.recordsChanged = true;
      const record = updated.find(r => r.playId === result?.playId);
      if (record && isCurrent()) this.applyResultRecord(record);
      return updated;
    } catch {
      return [];
    }
  }

  onOutboxUpdate(u) {
    if (this.lastResult && this.lastResult.playId === u.playId) {
      this.lastResult.netState = u.state;
      this.renderResultStatus?.();
    }
  }

  // ---------- 画面の切り替え ----------
  mount(el, rerender = null) {
    if (!el.classList.contains('game')) this.cancelStartAttempt();
    this.disposeStage();
    this.screenGeneration += 1;
    cancelAnimationFrame(this.raf);
    clear(this.root);
    this.root.append(el);
    this.rerender = rerender;
    this.layer = h('div', { class: 'layer' });
    this.root.append(this.layer);
    // 本編・練習の画面は、それぞれの始まりで曲を決める。ほかの画面はホームの曲
    if (!el.classList.contains('game')) this.setMenuMusic('menu');
  }

  showHome() {
    this.session = null;
    releaseResultCardResources(this.lastResult);
    releaseResultEvidence(this.lastResult); // 結果を離れる：解析を止めて、表示専用の入力を手放す
    this.disposeStage();
    const showOnline = this.runtime.isVerification || this.api.configured;
    const field = nameField({
      value: this.nameRaw,
      rankingEnabled: this.api.configured,
      onChange: (raw) => {
        if (raw === this.nameRaw) return;
        this.nameRaw = raw;
        this.safeSet('nameRaw', raw);
      },
    });
    const continueBtn = button('home.continue', () => this.resumeSaved(), { testid: 'home-continue' });
    continueBtn.hidden = !this.savedRun;
    this.homeContinue = continueBtn;
    const practiceBtn = button('home.practice', () => this.showPracticeMenu(), { testid: 'home-practice' });
    const pendingBadge = h('span', { class: 'badge', hidden: true });
    const recordsBtn = button(showOnline ? 'home.records' : 'records.localTitle', () => this.showRecords(), { testid: 'home-records' });
    if (showOnline) recordsBtn.append(pendingBadge);
    // 読み込み中も現行モデルの領域を確保し、旧CSSキャラクターを一瞬表示しない。
    const homeArt = h('div', { class: 'home-art home-art-3d', 'aria-hidden': 'true' });
    const notices = h('div', { class: 'notices' });
    for (const key of this.notices.splice(0)) notices.append(h('p', { class: 'notice' }, t(key)));
    if (showOnline && this.flags.recordsChanged) notices.append(h('p', { class: 'notice notice-update' }, [t('notice.recordsUpdated'), ' ', button('home.records', () => this.showRecords(), { className: 'btn-small' })]));
    if (this.foreignRun) {
      const link = this.foreignRunLink();
      notices.append(
        h('p', { class: 'notice notice-update', 'data-testid': 'foreign-run' }, [
          t('notice.savedRunOtherVersion'),
          link ? ' ' : '',
          link ? h('a', { href: link, class: 'btn btn-small', 'data-testid': 'foreign-run-open' }, t('notice.openSavedVersion')) : '',
        ]),
      );
    }
    if (this.runtime.isVerification) notices.append(h('p', { class: 'notice notice-dev' }, t(this.api.configured ? 'notice.verification' : 'notice.notConnected')));
    const el = h('main', { class: 'screen home' }, [
      h('div', { class: 'home-sky', 'aria-hidden': 'true' }),
      h('header', { class: 'home-header' }, [
        languageSelect({ home: true, undetermined: this.languageUndetermined, onChange: (id) => this.changeLanguage(id) }),
        homeArt,
        h('h1', { class: 'title' }, t('app.title')),
        h('p', { class: 'subtitle' }, t('app.tagline')),
      ]),
      notices,
      field.el,
      h('div', { class: 'home-actions' }, [
        button('home.start', () => this.startFlow(field.value), { primary: true, className: 'btn-start', testid: 'home-start' }),
        continueBtn,
        h('div', { class: 'home-grid' }, [
          practiceBtn,
          rankingLink('home-ranking'),
          button('home.howto', () => this.showHowTo(), { testid: 'home-howto' }),
          button('home.settings', () => this.showSettings(), { testid: 'home-settings' }),
          recordsBtn,
          xShareForm(buildHomeShareText({ lang: getLanguage() }), 'home-share').el,
        ]),
      ]),
      this.runtime.isVerification ? this.verificationMenu() : null,
      h('footer', { class: 'footer' }, [t('app.version', { v: this.runtime.gameVersion, rules: RULES_V1.rulesVersion })]),
    ]);
    this.mount(el, () => this.showHome());
    this.mountShowcase(homeArt);
    if (!showOnline) return;
    this.store
      .getAll('outbox')
      .then((items) => {
        pendingBadge.hidden = !items.length;
        pendingBadge.textContent = String(items.length);
      })
      .catch(() => {});
  }

  showShareFallback(text, mode) {
    const area = h('textarea', { class: 'share-manual', readonly: true, rows: '5' });
    area.value = `${text}\n${GAME_URL}`;
    dialog(this.layer, { titleKey: mode === 'copied' ? 'share.copied' : 'share.manual', body: area, actions: [{ key: 'common.close', primary: true }] });
    area.select?.();
  }

  // ---------- 開始 ----------
  isStartCurrent(attempt) {
    return this.startAttempt === attempt;
  }

  finishStartAttempt(attempt, state) {
    if (!this.isStartCurrent(attempt)) return;
    attempt.state = state;
    this.startToken = null;
    this.startAttempt = null;
    attempt.resolve({ state, launchId: attempt.launchId });
  }

  cancelStartAttempt() {
    const attempt = this.startAttempt;
    if (!attempt) return;
    attempt.cancelChoice?.();
    if (attempt.record) abandonStart(this.api, this.store, attempt.record).catch(() => {});
    this.finishStartAttempt(attempt, 'cancelled');
  }

  /** A choice belongs to the whole start operation, not to an individual request. */
  startChoice(attempt, options) {
    attempt.state = 'choice';
    let settle;
    const completion = new Promise((resolve) => { settle = resolve; });
    let decided = false;
    const finish = (value) => {
      if (decided) return;
      decided = true;
      close();
      attempt.cancelChoice = null;
      settle(value);
    };
    const close = dialog(this.layer, {
      ...options,
      actions: options.actions.map((action) => ({ ...action, onClick: () => {
        if (this.isStartCurrent(attempt)) finish(action.key);
      } })),
    });
    attempt.cancelChoice = () => finish(null);
    return { completion, close: () => finish(null) };
  }

  async chooseSavedRun(attempt) {
    if (!this.isStartCurrent(attempt)) return false;
    const foreign = this.foreignRun;
    const saved = this.savedRun;
    if (!foreign && !saved) return true;
    const link = foreign ? this.foreignRunLink() : null;
    const choice = await this.startChoice(attempt, foreign ? {
      titleKey: 'start.foreignRun.title', bodyKey: 'start.foreignRun.body', actions: [
        ...(link ? [{ key: 'notice.openSavedVersion', primary: true }] : []),
        { key: 'start.foreignRun.shelve', danger: true, testid: 'foreign-shelve' },
        { key: 'common.cancel' },
      ],
    } : {
      titleKey: 'start.savedRun.title', bodyKey: 'start.savedRun.body', actions: [
        { key: 'start.savedRun.continue', primary: true },
        { key: 'start.savedRun.newGame', danger: true },
        { key: 'common.cancel' },
      ],
    }).completion;
    if (!this.isStartCurrent(attempt)) return false;
    attempt.state = 'pending';
    if (choice === 'start.foreignRun.shelve') {
      await this.store.quarantineRun(foreign.reason, foreign.playId).catch(() => {});
    } else if (choice === 'start.savedRun.newGame') {
      await this.settleSavedRun(saved.playId);
    } else if (choice === 'start.savedRun.continue') {
      attempt.state = 'starting';
      await this.restoreRun(saved.playId, attempt);
      return false;
    } else {
      this.finishStartAttempt(attempt, 'cancelled');
      if (choice === 'notice.openSavedVersion') globalThis.location.assign(link);
      return false;
    }
    return this.isStartCurrent(attempt);
  }

  // Install the guard before the first await. Every external burst gets the same promise.
  startFlow(rawName) {
    if (this.startAttempt) return this.startAttempt.completion;
    const attempt = this.createStartAttempt();
    this.prepareStart(attempt, rawName).catch(() => this.failStartAttempt(attempt));
    return attempt.completion;
  }

  createStartAttempt() {
    let resolve;
    const completion = new Promise((done) => { resolve = done; });
    const attempt = { id: uuid(), launchId: uuid(), state: 'pending', completion, resolve };
    this.startAttempt = attempt;
    this.resultPresentation?.replayAccepted();
    return attempt;
  }

  failStartAttempt(attempt) {
    if (!this.isStartCurrent(attempt)) return;
    attempt.cancelChoice?.();
    this.finishStartAttempt(attempt, 'failed');
    toast(this.layer, t('notice.storageUnavailable'), { kind: 'warn' });
  }

  async prepareStart(attempt, rawName) {
    try {
      await this.audio.prepare();
    } catch {
      /* 音の準備に失敗しても開始処理は止めない */
    }
    if (!this.isStartCurrent(attempt)) return;
    this.audio.play('confirm');
    const name = normalizeName(rawName);
    if (!name.ok) {
      toast(this.layer, t('name.fixBeforeStart'), { kind: 'warn' });
      this.finishStartAttempt(attempt, 'failed');
      return;
    }
    await this.checkSavedRun();
    if (!await this.chooseSavedRun(attempt)) return;
    if (name.empty || !this.api.configured) {
      return this.beginPlay({ ranked: false, name: name.name, launchId: attempt.launchId }, attempt);
    }
    if (this.store.memory) {
      const choice = await this.startChoice(attempt, {
        titleKey: 'start.unranked.title',
        bodyKey: 'start.unranked.noStorage',
        actions: [{ key: 'start.playUnranked', primary: true }, { key: 'common.home' }],
      }).completion;
      if (!this.isStartCurrent(attempt)) return;
      if (choice === 'start.playUnranked') return this.beginPlay({ ranked: false, launchId: attempt.launchId }, attempt);
      return this.cancelStart(null, attempt);
    }
    while (this.isStartCurrent(attempt)) {
      try {
        await this.store.probeWrite();
        if (!this.isStartCurrent(attempt)) return;
        return this.rankedStart(name.name, attempt);
      } catch {
        if (!this.isStartCurrent(attempt)) return;
        const choice = await this.startChoice(attempt, {
          titleKey: 'storage.short.title', bodyKey: 'storage.short.body', actions: [
            { key: 'storage.short.resend' }, { key: 'storage.short.cleanup' },
            { key: 'start.playUnranked', primary: true },
          ],
        }).completion;
        if (!this.isStartCurrent(attempt)) return;
        attempt.state = 'pending';
        if (choice === 'start.playUnranked') return this.beginPlay({ ranked: false, launchId: attempt.launchId }, attempt);
        if (choice === 'storage.short.resend') await this.flushNetwork();
        if (choice === 'storage.short.cleanup') await this.store.cleanupSafe().catch(() => 0);
      }
    }
  }

  async rankedStart(name, attempt) {
    const record = await createStartRequest(this.store, { destination: this.api.destination, name, launchId: attempt.launchId, gameVersion: this.runtime.gameVersion });
    if (!this.isStartCurrent(attempt)) {
      abandonStart(this.api, this.store, record).catch(() => {});
      return;
    }
    attempt.record = record;
    while (this.isStartCurrent(attempt)) {
      const token = {};
      this.startToken = token;
      const progress = h('p', { class: 'dialog-body', 'aria-live': 'polite' }, t('start.contacting', { n: 1, total: 3 }));
      const choice = this.startChoice(attempt, {
        titleKey: 'start.ranked.title', body: progress,
        actions: [{ key: 'start.playUnranked' }, { key: 'common.cancel' }],
      });
      attempt.state = 'starting';
      const current = () => this.isStartCurrent(attempt) && this.startToken === token;
      const outcome = await Promise.race([
        sendStartRequest(this.api, this.store, record, {
          isCurrent: current,
          onAttempt: (n, total) => { if (current()) progress.textContent = t('start.contacting', { n, total }); },
        }).then((result) => ({ result })),
        choice.completion.then((action) => ({ action })),
      ]);
      if (!current()) return;
      this.startToken = null; // Invalidate before switching to anonymous or returning home.
      choice.close();
      if (outcome.action != null) {
        if (outcome.action === 'start.playUnranked') return this.switchToUnranked(record, attempt);
        return this.cancelStart(record, attempt);
      }
      if (outcome.result?.ok) {
        return this.beginPlay({ ranked: true, launchId: attempt.launchId, name, startRecord: outcome.result.record }, attempt);
      }
      const action = await this.startChoice(attempt, {
        titleKey: 'start.failed.title',
        bodyKey: outcome.result?.error?.retryable === false ? 'start.failed.rejected' : 'start.failed.body',
        params: { code: outcome.result?.error?.code ?? '' },
        actions: [{ key: 'common.retry', primary: true }, { key: 'start.playUnranked' }, { key: 'common.home' }],
      }).completion;
      if (!this.isStartCurrent(attempt)) return;
      if (action === 'start.playUnranked') return this.switchToUnranked(record, attempt);
      if (action !== 'common.retry') return this.cancelStart(record, attempt);
      attempt.state = 'pending';
    }
  }

  switchToUnranked(record, attempt) {
    if (!this.isStartCurrent(attempt)) return;
    this.startToken = null;
    if (record) abandonStart(this.api, this.store, record).catch(() => {});
    return this.beginPlay({ ranked: false, launchId: attempt.launchId }, attempt);
  }

  cancelStart(record, attempt) {
    if (!this.isStartCurrent(attempt)) return;
    this.startToken = null;
    if (record) abandonStart(this.api, this.store, record).catch(() => {});
    this.finishStartAttempt(attempt, 'cancelled');
    this.showHome();
  }

  /** 前のプレイを、保存できている確定棟までで終了・保全する。 */
  async settleSavedRun(playId) {
    const claimed = await this.store.claimRun(TAB_ID, playId).catch(() => null);
    if (!claimed) return;
    const r = GameSession.fromSnapshot(claimed.snapshot);
    if (r.error) {
      await this.store.quarantineRun(r.error, playId).catch(() => {});
      return;
    }
    r.session.quit();
    await this.persistEnd(r.session, claimed.generation);
  }

  /** 検証版だけに出すメニュー（実機担当が境界を短時間で試す）。正式版では出さない。 */
  verificationMenu() {
    const go = (atMs) => () => this.debugStart({ atMs }).catch((e) => toast(this.layer, String(e.message), { kind: 'warn' }));
    return h('details', { class: 'panel verify-menu' }, [
      h('summary', {}, t('verify.title')),
      h('p', { class: 'note' }, t('verify.note')),
      button('verify.before20', go(92500), { className: 'btn-small', testid: 'verify-before20' }),
      button('verify.beforeExit', go(246000), { className: 'btn-small', testid: 'verify-before-exit' }),
      button('verify.night', go(200000), { className: 'btn-small', testid: 'verify-night' }),
    ]);
  }

  // ---------- 検証用：境界を短時間で試す ----------
  /**
   * 検証版（localhost）だけで使える。目標色どおりに atMs まで自動で進めてから時計を渡す。
   * 必ずランキング対象外として始め、開始受付・順位登録・送信待ちへは入れない。
   */
  async debugStart({atMs=93000,seed=randomSeed(),effects=true}={}) {
    if (!this.runtime.isVerification) throw new Error('debugStart is only for verification builds');
    const session = new GameSession({ playId: uuid(), launchId: uuid(), ranked:false,name:'',seed,effects,gameVersion:this.runtime.gameVersion,assetVersion:this.runtime.assetVersion,startedAt:Date.now(),debug:true });
    const rules = RULES_V1;
    for (let i = 1; i <= rules.buildingCount; i += 1) {
      const tEval = (i - 1) * rules.buildingMs + rules.evalStartMs - 100;
      if (tEval >= atMs) break;
      const target = session.game.course.targets[i - 1];
      session.apply({ type: 'color', t: Math.max(session.state.t, tEval), h: target.h, s: target.s, v: i >= rules.brightnessUnlockBuilding ? target.v : rules.valMax });
    }
    session.apply({ type: 'tick', t: atMs });
    if (session.ended) throw new Error('debugStart ended before atMs');
    session.pausedReason = 'restored';
    this.flags = { ...this.flags, openingSeen: true, guideSeen: true };
    this.generation = 0;
    this.memoryOnly = true; // 端末の本編欄・送信待ちには書かない
    this.takenOver = false;
    await this.showGame(session, { fresh: false });
    return session;
  }

  async debugGuide({step=1}={}) {
    if(!this.runtime.isVerification)throw new Error('verification_only');
    return this.startGuidePractice(step);
  }

  async debugPresentation({effectId}={}) {
    if(!this.runtime.isVerification)throw new Error('verification_only');
    const resultIds=[71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,89,90,91,92,93,94,95,96,98,99,100];
    const hudIds=[11,42,43,46,48,49,50,52,54,55,58];
    if(!Number.isInteger(effectId)||effectId<1||effectId>100||EXCLUDED_EFFECT_IDS.includes(effectId))throw new Error('excluded_effect');
    if(resultIds.includes(effectId)){
      const session=new GameSession({playId:uuid(),seed:effectId===86?17:1,debug:true,name:'',ranked:false});
      const recovery=effectId===86;
      for(let b=1;b<=(recovery?16:50);b++){
        const target=session.game.course.targets[b-1];
        if(recovery&&b===13)session.apply({type:'color',t:61500,h:(target.h+18000)%36000,s:target.s,v:10000});
        session.apply({type:'color',t:recovery&&b===13?63100:(b-1)*5000+1400,...target});
      }
      session.apply({type:'tick',t:recovery?80000:250000});
      if(recovery)session.quit();
      releaseResultCardResources(this.lastResult);
      releaseResultEvidence(this.lastResult);
      this.lastResult={playId:session.meta.playId,name:'',summary:session.summary(),newBest:true,firstClearNow:!recovery,firstClearAt:recovery?null:Date.now(),previous:{playId:'previous',buildings:40,rankAverage:9500,maxCombo:10,endedAt:1},targets:session.game.course.targets.map(c=>({...c})),arrivedBuilding:Math.min(50,Math.floor(session.state.t/session.rules.buildingMs)+1),ranked:false};
      this.lastResult.evidenceInput=Object.freeze({...captureEvidenceBase(session,this.lastResult.targets),originalSummary:this.lastResult.summary});
      this.session=null;this.showResult();
      const panel={72:'frames',75:'model',76:'colors',84:'alert',86:'recovery',87:'streak',90:'turn'}[effectId];
      if(panel)this.resultPanels.open(panel);
      if(effectId===96)this.resultPresentation.updateRank({state:'official',rank:1,label:'current'});
      if(effectId===99)this.resultPresentation.replayAccepted();
      if(effectId===100)this.root.querySelector('.result-portrait').click();
      return {...this.resultPresentation.stats(),effectId,panel:panel??null};
    }
    const actorIds=[21,22,23,24,25,26,27,28,29,30,31,32,33,35,37,38,40];
    const fixtureTimes={4:95000,5:95000,6:55000,7:95000,20:21500,34:41500,39:41500,44:2000,56:125500,58:225000,59:246000,63:195000,65:30000,67:26500,68:31500,69:21000};
    const fixtureTime=fixtureTimes[effectId];
    if(!this.session||!this.session.meta.debug||this.session.running||this.session.meta.effects===false||this.session.ended||!this.stage?.forcePresentationEffect||(fixtureTime!==undefined&&this.session.state.t!==fixtureTime))await this.debugStart({atMs:fixtureTime??(effectId>=57&&effectId!==65?200000:30000),seed:1});
    if(effectId===65&&this.session.state.t>=195000)await this.debugStart({atMs:30000,seed:1});
    this.bonusPresentation?.dispose();
    this.bonusPresentation = null;
    clear(this.layer);if(this.coverEl)this.coverEl.hidden=true;
    this.verificationPreviewScope=this.presentationScope;
    this.stage.resetEnding?.();
    const view=readPlayView(this.session,1,{lastEvalSuccess:true});
    if(effectId===44){
      // Exercise the real 98%/500ms observer on this debug run, with an isolated display claim.
      // A forced preview never writes the current play's extras, random stream or history.
      const collector=createEvaluationSegmentCollector({session:this.session,restore:true});
      const badge=createPrecisionBadge({claim:async()=>true});
      for(const segment of collector.drain())await badge.consume(segment);
      collector.dispose();
      // Paint the frozen street without stepping the live extras controller.
      // Sample the real badge after its fade-in, without advancing the paused session.
      const previewTime=view.t+700;
      this.stage.update({t:previewTime,color:view.color,matchState:view.matchState,walking:false,running:false});
      const preview = mountBonusPresentation({host:this.root.querySelector('.stage-wrap'),scope:this.presentationScope,t});
      this.bonusPresentation = preview;
      this.presentationScope.own(() => { if (this.bonusPresentation === preview) this.bonusPresentation = null; });
      preview.tick({activeMs:previewTime,phase:view.phase,running:true,precisionBadge:badge.snapshot(previewTime)});
      badge.dispose();
      return {...preview.stats(),effectId};
    }
    const legacyCameo=CAMEOS.find(row=>row.id===effectId);
    if(legacyCameo||[20,34,39,56,67,68,69].includes(effectId)){
      const police=[34,39].includes(effectId);
      const previewView={...view,running:true,phase:'grace',policeStage:police?1:0,matchState:null,lastEvalSuccess:false};
      // Warm the actual actor arrival with ordinary display intervals, without stepping the session.
      for(let i=0;i<=Math.ceil(3000/16);i++){
        const t=view.t-3000+Math.min(i*16,3000);
        // Placement caches must see the building/phase that actually belongs to this warmup t.
        // E069 plans at building5's real first grace, then draws elapsed1000 at the matching t=21000.
        const building=Math.min(this.session.rules.buildingCount,Math.floor(t/this.session.rules.buildingMs)+1);
        const phase=isEvalTime(t,this.session.rules)?'eval':'grace';
        this.stage.update({t,color:view.color,policeStage:previewView.policeStage,walking:false,presentation:{...previewView,t,building,passed:building-1,phase,guideActive:true,guidanceActive:true,evaluationSegments:[]}});
      }
      const durationMs=legacyCameo?.ms??(effectId===56?1500:2000),elapsedMs=police?600:effectId===56?700:1000;
      const extra={id:effectId,kind:effectId===34?'inquiry':'footprints',building:effectId===56?25:view.building,startedAt:view.t-elapsedMs,elapsedMs,durationMs,phase:effectId===56?'delivery':'story'};
      this.stage.forcePresentationEffect(effectId,{cameo:police?null:extra,policeExtra:police?extra:null});
      return {...this.stage.presentationStats(),effectId};
    }
    if(actorIds.includes(effectId)){
      const police=[23,24,31,38].includes(effectId)?2:[25,32,33,35,37,40].includes(effectId)?1:0;
      // Use normal display intervals: 30 consecutive 100ms frames permanently disable cameos.
      // Clamp the last sample to the original end time, without advancing the game session.
      for(let i=0;i<=Math.ceil(3000/16);i++){const t=view.t-3000+Math.min(i*16,3000);this.stage.update({t,color:view.color,policeStage:police,walking:true,matchState:null,presentation:{...view,t,running:true,policeStage:police}});}
    }else this.stage.update({t:view.t,color:view.color,policeStage:1,walking:false,presentation:view});
    if(hudIds.includes(effectId)){this.presentationHud.forceEffect(effectId,{...view,running:true});if([11,58].includes(effectId))this.stage.forcePresentationEffect(effectId);return this.presentationHud.stats();}
    if(effectId===60){
      const layer=h('div',{class:'ending-comic','aria-hidden':'true'},'!');this.layer.append(layer);this.presentationScope.own(()=>layer.remove());return {activeIds:[60]};
    }
    if(effectId===59){await this.stage.playEnding('cleared',{onFrame:()=>{},signal:AbortSignal.abort()});this.stage.forcePresentationEffect(59);return this.stage.presentationStats();}
    this.stage.forcePresentationEffect(effectId);
    return this.stage.presentationStats();
  }

  // ---------- 本編 ----------
  async beginPlay(options, attempt) {
    if (!this.isStartCurrent(attempt)) return;
    attempt.state = 'starting';
    const { ranked, launchId, name = '', startRecord = null } = options;
    const playId = ranked ? startRecord.response.playId : uuid();
    const secret = ranked ? startRecord.secret : null;
    const meta = {
      playId,
      launchId,
      ranked,
      name,
      destination: this.api.destination,
      requiresLaunch: startRecord?.requiresLaunch === true,
      requestId: startRecord?.requestId ?? null,
      seed: ranked ? startRecord.response.seed : randomSeed(),
      rulesVersion: ranked ? startRecord.response.rulesVersion : undefined,
      gameVersion: this.runtime.gameVersion,
      assetVersion: this.runtime.assetVersion,
      startedAt: Date.now(),
    };
    const launch = createLaunch({ ...meta, playId: ranked ? playId : null, secret });
    const session = new GameSession(meta);
    let generation = 0, playing, resolveStorage;
    const storageReady = new Promise(resolve => { resolveStorage = resolve; });
    // The store owns the run slot. Admit the actual screen in the same turn as
    // its writes, after checking competing runs, before another tab can flush.
    const enter = () => {
      if (playing) return true;
      if (!this.isStartCurrent(attempt)) return false;
      attempt.record = null;
      if (secret) this.playSecrets.set(session, secret);
      this.savedRun = null;
      this.foreignRun = null;
      this.generation = 0;
      this.memoryOnly = true;
      this.takenOver = false;
      this.saveWarned = false;
      playing = this.showGame(session, { fresh: true, storageReady });
      return true;
    };
    for (let saveAttempt = 0; saveAttempt < 2; saveAttempt += 1) {
      try {
        generation = await this.store.beginRun(TAB_ID, session.snapshot(), launch, enter);
        break;
      } catch (err) {
        if (err?.code !== 'active_run_exists') break;
        // 受付待ちなどで別のタブが先に始めた。予約は保ち、本人が選ぶまで前のプレイを終えない。
        const abandon = () => { if (startRecord) abandonStart(this.api, this.store, startRecord).catch(() => {}); };
        await this.checkSavedRun();
        if (!await this.chooseSavedRun(attempt)) { abandon(); return; }
        attempt.state = 'starting';
        // 読み直す間に前のプレイが終了した場合だけを見込んで、再度保存を試す。
        if (saveAttempt === 1) {
          abandon();
          this.finishStartAttempt(attempt, 'failed');
          this.notices.push('notice.storageUnavailable');
          this.showHome();
          return;
        }
      }
    }
    if (!playing && !this.isStartCurrent(attempt)) return;
    if (!generation) {
      // The fallback write can wait too. Keep the home controls available
      // until it admits this run, using the same boundary as beginRun.
      try {
        await recordLaunch(this.store, launch, enter);
      } catch {
        await recordLaunch(this.volatileNetwork, launch, enter);
        if (playing) this.notices.push('notice.launchNotSaved');
      }
      if (!playing) return;
      this.notices.push('notice.saveFailed');
    } else if (!playing && !enter()) return;
    if (this.session === session) {
      this.generation = generation;
      this.memoryOnly = !generation;
    }
    resolveStorage();
    this.flushNetwork();
    await playing;
    this.finishStartAttempt(attempt, 'started');
  }

  resumeSaved(playId = this.savedRun?.playId) {
    if (this.startAttempt) return this.startAttempt.completion;
    if (playId == null) return;
    const attempt = this.createStartAttempt();
    this.restoreRun(playId, attempt).catch(() => this.failStartAttempt(attempt));
    return attempt.completion;
  }

  async restoreRun(playId, attempt) {
    attempt.state = 'starting';
    try {
      await this.audio.prepare();
    } catch {
      /* 音の準備に失敗しても再開処理は止めない */
    }
    if (!this.isStartCurrent(attempt)) return;
    const claimed = await this.store.claimRun(TAB_ID, playId).catch(() => null);
    if (!this.isStartCurrent(attempt)) return;
    if (!claimed) {
      await this.checkSavedRun();
      if (!this.isStartCurrent(attempt)) return;
      this.finishStartAttempt(attempt, 'failed');
      this.showHome();
      return;
    }
    const r = GameSession.fromSnapshot(claimed.snapshot);
    if (r.error) {
      await this.store.quarantineRun(r.error, playId).catch(() => {});
      if (!this.isStartCurrent(attempt)) return;
      this.finishStartAttempt(attempt, 'failed');
      this.notices.push('notice.savedRunBroken');
      this.savedRun = null;
      this.showHome();
      return;
    }
    this.generation = claimed.generation;
    this.savedRun = null;
    this.memoryOnly = false;
    this.takenOver = false;
    this.saveWarned = false;
    const secret = await this.secretForSession(r.session);
    if (!this.isStartCurrent(attempt)) return;
    if (secret) this.playSecrets.set(r.session, secret);
    await this.showGame(r.session, { fresh: false });
    this.finishStartAttempt(attempt, 'started');
  }

  /**
   * 表示用の保存（presentation.extras.v1）の入口。showGame で世代が決まった後に1画面につき1回だけ作る。
   * 保存先（端末の Store か、このアプリのメモリ）は作る時に決め、途中で切り替えない。
   * 取得の失敗（false）は成績の保存の状態・警告に影響しない。結果を待って時計・入力・終了の保存を止めない。
   * 新しい小芝居を止める印は port.disabled（再開で保存値が無い時、または開始枠の取得が false の後）。
   */
  createExtrasPort(session, { fresh, generation, current, seed = 1 }) {
    const app = this;
    const playId = session.meta.playId;
    const store = this.store;
    const memory = !generation || this.memoryOnly || !store;
    const isFresh = Boolean(fresh || session.meta.debug); // 検証用の開始（debugStart）は新しい時計の開始として扱う
    const initialState = { count: 0, lastStartedAt: null, rngState: (Number(seed) || 1) >>> 0, reservedMidpoint: true, midpointUsed: false };
    const memoryClaim = (apply) => {
      if (!current()) return false;
      try {
        const r = apply(normalizeExtras(this.extrasMemory));
        if (!r.claimed) return false;
        this.extrasMemory = r.extras;
        return true;
      } catch { return false; }
    };
    const settle = async (run) => {
      try { return current() && (await run()) === true && current(); } catch { return false; }
    };
    const rawStart = (state) => (memory
      ? Promise.resolve(memoryClaim((x) => applyCameoClaim(x, playId, state)))
      : settle(() => store.claimCameoStart({ playId, tabId: TAB_ID, generation, state })));
    const port = {
      playId, fresh: isFresh, memory, disabled: false, restored: null, initialState, ready: Promise.resolve(true),
      async loadDirector() {
        try {
          const state = memory ? readDirector(normalizeExtras(app.extrasMemory), playId) : await store.loadDirector(playId);
          return current() ? state : null;
        } catch { return null; }
      },
      async restore() {
        port.restored = await port.loadDirector();
        port.disabled = !port.restored;
        return port.restored;
      },
      async claimCameoStart(state) {
        const ok = await rawStart(state);
        if (!ok) port.disabled = true;
        return ok;
      },
      claimPrecisionBadge() {
        return memory
          ? Promise.resolve(memoryClaim((x) => applyBadgeClaim(x, playId)))
          : settle(() => store.claimPrecisionBadge({ playId, tabId: TAB_ID, generation }));
      },
    };
    // 新しいプレイの直後に count:0 を保存する。待たずに進む。失敗しても最初の小芝居は出せる（保存側は count 0/1 を通す）。
    if (isFresh) port.ready = rawStart(initialState);
    return port;
  }

  async initializeGuides(session, fresh) {
    const options = { playId: session.meta.playId, legacyFlags: this.flags, legacyRun:fresh?null:session.snapshot(),fallbackProgress:this.guideMemory };
    if (session.meta.debug) return normalizeGuideProgress({version:1,basic:{consumed:true},brightness:{consumed:true}});
    let progress;
    try {
      if (!this.generation || this.memoryOnly) throw new Error('memory_only');
      progress = await this.store.initializeGuideProgress(TAB_ID, this.generation, options);
      progress = (await this.store.claimGuideGroup(TAB_ID, this.generation, {playId:session.meta.playId,group:'basic'})).progress;
    } catch (error) {
      if(error instanceof StaleWriterError)throw error;
      if(!this.saveWarned){this.saveWarned=true;this.notices.push('notice.saveFailedNow');}
      progress = normalizeGuideProgress(this.guideMemory ?? await this.safeGet(GUIDE_PROGRESS_KEY), this.flags, options.legacyRun);
      progress = claimGroup(progress,'basic',session.meta.playId).progress;
    }
    this.guideMemory = progress;
    return progress;
  }

  async showGame(session, { fresh, storageReady }) {
    this.verificationPreviewScope=null;
    this.session = session;
    releaseResultCardResources(this.lastResult);
    releaseResultEvidence(this.lastResult);
    this.setMenuMusic(null); // 本編の曲は、時計が動き始めた時に流す
    const rules = session.rules;
    const decorations = makeDecorations(session.meta.seed);
    const stageBox = h('div', { class: 'stage', 'data-testid': 'stage' });
    const cover = h('div', { class: 'cover', hidden: true });
    const hudBuildings = h('span', { class: 'hud-buildings', 'data-testid': 'hud-buildings' });
    const hudScore = h('span', { class: 'hud-score', 'data-testid': 'hud-score' });
    const hudProgress = h('div', { class: 'hud-progress-fill' });
    const hudGain = h('span', { class: 'hud-gain', 'aria-hidden': 'true' });
    const gaugeFill = h('div', { class: 'gauge-fill' });
    const gaugeWord = h('span', { class: 'gauge-word' });
    const gaugeIcon = h('span', { class: 'gauge-icon', 'aria-hidden': 'true' });
    const pauseBtn = h('button', { type: 'button', class: 'btn-pause', 'aria-label': t('game.pause'), 'data-testid': 'pause' }, 'Ⅱ');
    const switchOk = h('div', { class: 'switch-ok', hidden: true }, t('game.switchOk'));
    const matchWord = h('div', { class: 'match-word', 'aria-live': 'polite' });
    const banner = h('div', { class: 'banner-host' });
    const hud = h('div', { class: 'hud' }, [
      h('div', { class: 'hud-left' }, [hudBuildings, h('div', { class: 'hud-progress', 'aria-hidden': 'true' }, [hudProgress]), h('div', { class: 'hud-score-row' }, [hudScore, hudGain])]),
      h('div', { class: 'gauge', role: 'meter', 'aria-label': t('game.alertLabel') }, [
        gaugeIcon,
        h('div', { class: 'gauge-body' }, [h('div', { class: 'gauge-track' }, [gaugeFill, h('i', { class: 'gauge-mark gauge-mark-1' }), h('i', { class: 'gauge-mark gauge-mark-2' })]), gaugeWord]),
      ]),
      pauseBtn,
    ]);
    /** 短い見た目の動きをもう一度始める（クラスを付け直す）。 */
    const pulse = (node, cls) => {
      node.classList.remove(cls);
      void node.offsetWidth;
      node.classList.add(cls);
    };
    let observedEvalSuccess = false;
    let lastEvalSuccess = false;
    const observeEvaluation = () => {
      if (isEvalTime(session.state.t, rules) && session.state.matchUnits != null) {
        observedEvalSuccess = classifyMatch(session.state.matchUnits, rules) === 'success';
      }
    };
    let guidance=null,guideUI=null,ready=false,guideAudioRunning=false,firstAudioStart=fresh;
    const ctrlAudio = this.controlAudioCallbacks();
    const controls = createControls({
      onChange: (c) => {
        if (guidance?.view().stationary) guidance.setDraft(c);
        else { observeEvaluation(); session.input(c, performance.now()); }
      },
      onLockedTap: () => {
        this.audio.play('locked');
        showNotice(t('controls.lockedHint'), { duration: 1400, kind:'warn' });
      },
      ...ctrlAudio,
    });
    const el = h('main', { class: 'screen game' }, [h('div', { class: 'stage-wrap' }, [stageBox, hud, switchOk, matchWord, banner, cover]), controls.el]);
    this.mount(el, null);
    const scopeId = `${this.screenGeneration}:game`;
    const scope = createPresentationScope({ id: scopeId, kind: 'game' });
    this.presentationScope = scope;
    scope.tick(session.state.t);
    const current = () => this.presentationScope === scope && scope.isCurrent(scopeId);
    const showNotice = (text, options = {}) => toast(banner, text, { ...options, scope });
    scope.own(() => cancelAnimationFrame(this.raf));
    this.controls = controls;
    controls.layout();
    controls.setValues(session.state.color);
    controls.setLocked(!session.state.brightnessUnlocked);
    controls.setEnabled(false); // 時計が動くまで操作しない（表示と判定の色をずらさない）
    if (storageReady) {
      await storageReady;
      if (!current()) return;
    }
    const initialProgress = await this.initializeGuides(session, fresh);
    if (!current()) return;
    const generation = this.generation;
    const extrasPort = this.createExtrasPort(session, { fresh, generation, current, seed: decorations?.[0]?.sign ?? 1 });
    if (!extrasPort.fresh) {
      await extrasPort.restore();
      if (!current()) return;
    }
    const gameExtrasController=createGameExtrasController({playId:session.meta.playId,rules,extrasPort,seed:decorations?.[0]?.sign??1});
    this.gameExtrasController=gameExtrasController;
    scope.own(()=>{gameExtrasController.dispose();if(this.gameExtrasController===gameExtrasController)this.gameExtrasController=null;});
    const local = (await this.safeGet('localBest'))?.[session.meta.name || ''] ?? null;
    const statistics = sanitizeStats(await this.safeGet('presentation.stats.v1'));
    if (!current()) return;
    const presentationHud = mountPresentationHud({verification:this.runtime.isVerification,host:el.querySelector('.stage-wrap'),scope,bestDistance:local?.buildings??null,bestCombo:statistics.bestCombo});
    this.presentationHud = presentationHud;
    let cueCandidates=[],pendingBonus=null;
    const cue=(name,opts)=>cueCandidates.push({name,opts});
    scope.own(()=>{cueCandidates=[];pendingBonus=null;});
    const guideHost = h('div', {class:'guidance-host'});
    el.querySelector('.stage-wrap').append(guideHost);
    const renderGuide = () => {
      if (!current() || !guidance || !ready) return;
      const v=guidance.view();
      const audioRunning=session.running&&!document.hidden&&!this.takenOver&&(this.coverEl?.hidden??true);
      if(audioRunning!==guideAudioRunning){guideAudioRunning=audioRunning;if(audioRunning){this.audio.startGameAudio({reset:firstAudioStart});firstAudioStart=false;}else this.audio.stopGameAudio();}
      guideUI?.render(v);
      presentationHud.setGuideActive(Boolean(v.step));
      controls.setLocked(!v.brightnessUnlocked);
      if (v.stationary) controls.setValues(v.color);
      controls.setEnabled(!this.takenOver && !document.hidden && (this.coverEl?.hidden ?? true) && (session.running || v.stationary));
    };
    guideUI = mountGuidance({host:guideHost,controls});
    scope.own(()=>guideUI.dispose());
    guidance = createGuidance({session,progress:initialProgress,canResume:()=>ready&&current()&&!document.hidden&&!this.takenOver&&(this.coverEl?.hidden??true),
      onComplete:()=>{cue('guideClear');this.saveNow('guide');},
      onChange:renderGuide,
      onProgress:async (update, progress) => {
        this.guideMemory = progress;
        if (!current() || this.memoryOnly || !generation) return;
        try { await this.store.updateGuideProgress(TAB_ID,generation,update); }
        catch(error) { if(error instanceof StaleWriterError){this.takenOver=true;session.pause('takenOver');this.showTakenOver();} else if(!this.saveWarned){this.saveWarned=true;showNotice(t('notice.saveFailedNow'),{kind:'warn'});} }
      },
      claimBrightness:async()=> {
        if (!current()) throw new StaleWriterError();
        if (!generation || this.memoryOnly) { const result=claimGroup(this.guideMemory,'brightness',session.meta.playId);this.guideMemory=result.progress;return result; }
        try { return await this.store.claimGuideGroup(TAB_ID,generation,{playId:session.meta.playId,group:'brightness'}); }
        catch(error) { if(error instanceof StaleWriterError){this.takenOver=true;session.pause('takenOver');this.showTakenOver();throw error;} const result=claimGroup(this.guideMemory,'brightness',session.meta.playId);this.guideMemory=result.progress;showNotice(t('notice.saveFailedNow'),{kind:'warn'});return result; }
      },
    });
    this.guidance = guidance;
    this.renderGuidance = renderGuide;
    scope.own(()=>{guidance.dispose();if(this.guidance===guidance){this.guidance=null;this.renderGuidance=null;}});
    const firstOpening = fresh && !this.flags.openingSeen;
    if (firstOpening) await this.setFlag('openingSeen', true);
    if (!current()) return;
    const stageView = await this.stageFactory(stageBox, { course: session.game.course, decorations, rules, showOpeningShop: firstOpening, presentationEnabled:session.meta.effects!==false,presentationSet:'extended96',verification:this.runtime.isVerification,extrasPort,gameExtrasController});
    if (!current()) { stageView.dispose(); return; }
    this.stage = stageView;
    stageView.setBestDistance?.(local?.buildings??null);
    const layoutFrame = requestAnimationFrame(() => {
      if (!current()) return;
      controls.layout();
      stageView.resize();
    });
    scope.own(() => cancelAnimationFrame(layoutFrame));

    const alertStage = createAlertStageTracker(rules);
    const instant = createInstantSuccessTracker({ rules });
    let lastSaveT = session.state.t;
    let lastStage = 0;
    let lastCombo = session.state.combo ?? 0;
    const announcedPasses=new Set(Array.from({length:session.state.passed},(_,i)=>i+1));
    const b0 = Math.min(rules.buildingCount, Math.floor(session.state.t / rules.buildingMs) + 1);
    const announcedTierUp = new Set([11, 21, 31, 41].filter((n) => n <= b0));
    this.audio.setBuilding(b0);
    this.audio.setArea(areaOf(b0).time);
    this.audio.setFinale(b0 >= 41);
    const refreshHud = () => {
      const s = session.state;
      hudBuildings.textContent = t('game.buildings', { n: s.passed, total: rules.buildingCount });
      hudScore.textContent = t('game.score', { n: formatNumber(s.score.total) });
      hudProgress.style.transform = `scaleX(${s.passed / rules.buildingCount})`;
      const pct = s.alert / rules.alert.maxUnits;
      gaugeFill.style.transform = `scaleX(${pct})`;
      const level = pct >= 0.7 ? 'danger' : pct >= 0.3 ? 'caution' : 'calm';
      gaugeFill.dataset.level = level;
      hud.dataset.level = level;
      gaugeWord.textContent = t(alertWordKey(s.alert, rules));
      const grace = s.status === 'playing' && !isEvalTime(s.t, rules);
      switchOk.hidden = !grace || s.t < rules.evalStartMs - 1;
      const wordKey = matchWordKey(s.matchUnits, rules);
      matchWord.textContent = wordKey ? t(wordKey) : '';
      const mState = s.matchUnits == null ? '' : classifyMatch(s.matchUnits, rules);
      if (mState !== matchWord.dataset.state && mState) pulse(matchWord, 'pop');
      matchWord.dataset.state = mState;
    };

    scope.own(session.on((events) => {
      for (const ev of events) {
        if (!current()) break;
        gameExtrasController.event(ev);
        stageView.presentationEvent({ ...ev });
        presentationHud.event(ev);
        if (ev.type === 'evalEnd') lastEvalSuccess = observedEvalSuccess;
        if (['evalStart', 'enterBuilding', 'detected', 'cleared', 'quit'].includes(ev.type)) {
          lastEvalSuccess = false;
          observedEvalSuccess = false;
        }
        switch (ev.type) {
          case 'evalEnd':
            if (ev.building < rules.buildingCount) cue('switchOk');
            break;
          case 'unlockBrightness':
            controls.setLocked(false);
            cue('unlock');
            this.stage?.fx('unlock');

            break;
          case 'reachUnlockBuilding':
            this.setFlag('brightnessPractice', true);
            break;
          case 'enterBuilding': {
            const b = Math.min(rules.buildingCount, ev.building);
            if (ev.building === rules.brightnessUnlockBuilding - 1) showNotice(t('game.unlockSoon'), { duration: 2200 });
            this.audio.setBuilding(b);
            this.audio.setArea(areaOf(b).time);
            this.audio.setFinale(b >= 41);
            if (b === 40) {
              cue('milestone');
              this.stage?.fx('milestone');
            }
            if ([11, 21, 31, 41].includes(b) && !announcedTierUp.has(b)) {
              announcedTierUp.add(b);
              cue('tierUp', { tier: Math.floor((b - 1) / 10) });
            } else if (b >= 46 && b <= 50) {
              cue('lastFive', { building: b });
            }
            break;
          }
          case 'pass':
            if(announcedPasses.has(ev.building))break;
            announcedPasses.add(ev.building);
            pendingBonus=buildBonusBatch({playId:session.meta.playId,passEvent:ev,summary:{rulesVersion:session.meta.rulesVersion}});
            if (ev.building === 25) {
              // 25棟目の通過＝中間地点（仕様 FX-03）
              cue('milestone');
              this.stage?.fx('milestone');
            }
            if (ev.success && [3, 5, 10].includes(ev.combo)) {
              cue('combo', { level: [3, 5, 10].indexOf(ev.combo) });
              this.stage?.fx('combo');
            } else if (ev.success && ev.combo > 1) {
              cue('passBuilding', { combo: ev.combo });
              this.stage?.fx('pass');
            } else if (ev.success) {
              cue('passBuilding', { combo: 1 });
              this.stage?.fx('pass');
            } else if (lastCombo >= 2) {
              cue('comboBreak'); // 連続成功が途切れた
            }
            lastCombo = ev.success ? ev.combo : 0;
            if (ev.points > 0) {
              hudGain.textContent = pendingBonus?'':`+${formatNumber(ev.points)}`;
              pulse(hudGain, 'show');
              pulse(hudScore, 'bump');
            }
            pulse(hudBuildings, 'bump');
            this.saveNow('pass');
            lastSaveT = session.state.t;
            break;
          case 'detected':
          case 'cleared':
          case 'quit':
            this.finishPlay(ev.type);
            break;
          case 'paused':
            if(ev.reason!=='guide'){cueCandidates=[];pendingBonus=null;}
            if(ev.reason==='guide'){guideAudioRunning=false;this.audio.stopGameAudio();}
            if (ev.reason === 'stall') this.showPause('stall');
            break;
          default:
        }
      }
    }));

    let wasSearching = false;
    const loop = () => {
      if (this.session !== session || !current()) return;
      // A verification preview is a frozen drawing while the debug run is paused.
      // Resuming uses the ordinary loop again; no preview value enters the controller.
      if(this.runtime.isVerification&&this.verificationPreviewScope===scope&&!session.running){
        this.raf=requestAnimationFrame(loop);return;
      }
      const now = performance.now();
      guidance.tick(now);
      if (session.running) {
        observeEvaluation();
        session.frame(now);
        if (!current()) return;
        if (session.state.t - lastSaveT >= SAVE_INTERVAL_MS) {
          lastSaveT = session.state.t;
          this.saveNow('interval');
        }
      }
      const s = session.state;
      scope.tick(s.t);
      const stage = alertStage.update(s.alert);
      if (stage > lastStage) {
        // 1人目は警告音、2人目は笛
        cue(stage >= 2 ? 'whistle' : 'warning');
        pulse(gaugeIcon, 'ring');
        if (!this.flags.alertGuideSeen) {
          this.setFlag('alertGuideSeen', true);
          showNotice(t('guide.alert'), { duration: 3000, kind:'warn' });
        }
      }
      if (s.alert > 0 && !this.flags.alertGuideSeen) {
        this.setFlag('alertGuideSeen', true);
        showNotice(t('guide.alert'), { duration: 3000, kind:'warn' });
      }
      if (stage < lastStage && session.running) cue('relief'); // 警察が離れた
      if (stage !== lastStage) { const event={type:stage>lastStage?'policeUp':'policeDown',t:s.t};stageView.presentationEvent(event);presentationHud.event(event); }
      lastStage = stage;
      this.audio.setPoliceStage(session.running ? stage : 0);
      this.audio.setDanger(session.running && s.alert >= rules.alert.maxUnits * 0.7);
      if (instant.update(s)) {
        cue('success');
        this.stage?.fx('success');
        const event={ type:'instantSuccess',t:s.t,building:s.evalBuilding };stageView.presentationEvent(event);presentationHud.event(event);gameExtrasController.event(event);
      }
      refreshHud();
      const matchState = s.matchUnits == null ? null : classifyMatch(s.matchUnits);
      const searching = matchState === 'success' && stage > 0;
      if (searching && !wasSearching) {
        cue('policeSearch');
        stageView.presentationEvent({ type: 'searchStart', t: s.t });
      }
      wasSearching = searching;
      const playView = readPlayView(session, stage, {lastEvalSuccess});
      const guideView = guidance.view();
      presentationHud.setGuideActive(Boolean(guideView.step));
      presentationHud.tick(playView);
      renderGuide();
      const activeNotice=[...banner.querySelectorAll('.toast-warn')].some(node=>!node.hidden);
      const quiet=Boolean(guideView.step)||stage>0||activeNotice;
      stageView.update({t:guideView.sceneT,color:guideView.stationary?guideView.color:s.color,policeStage:stage,searching,nervous:stage/2,walking:session.running,matchState,presentation:{...playView,guidanceActive:Boolean(guideView.step),guideActive:Boolean(guideView.step),moving:session.running&&!guideView.stationary,warningActive:activeNotice,hidden:!!document.hidden}});
      const batch=pendingBonus;
      const timely=!batch||s.t<batch.expiresAtT;
      const suppressed=quiet||!timely;
      const candidates=suppressed?cueCandidates.filter(c=>['guideClear','unlock','whistle','warning','detected','clear'].includes(c.name)):cueCandidates;
      const selected=choosePassCue({batch:suppressed?null:batch,cues:candidates});
      cueCandidates=[];pendingBonus=null;
      if(selected&&!document.hidden)this.audio.play(selected.name,selected.opts);
      this.raf = requestAnimationFrame(loop);
    };

    const pause = () => {
      if (!current()) return;
      this.audio.play('select');
      if(session.pause('user')||guidance.view().stationary||session.pausedReason==='guide'){
        this.saveNow('pause');
        this.showPause('user');
      }
    };
    pauseBtn.addEventListener('click', pause);
    scope.own(() => pauseBtn.removeEventListener('click', pause));
    this.coverEl = cover;
    refreshHud();
    this.raf = requestAnimationFrame(loop);

    if (fresh) {
      if (firstOpening) {
        await this.playOpening({ ...guidance.view(), playbackRate: 0.7 });
        if (!current()) return;
      }
      if (this.session !== session || !current()) return;
      ready=true;
      if(document.hidden){this.showPause('user');return;}
      controls.setValues(session.state.color);
      if(!guidance.view().stationary)session.startClock(performance.now());
      renderGuide();
    } else {
      ready=true;
      this.showPause('restored');
    }
  }

  async playOpening({ sceneT, color, playbackRate = 1 } = {}) {
    const ctrl = new AbortController();
    this.presentationScope?.own(() => ctrl.abort());
    const skip = button('common.skip', () => {
      this.audio.stopSfx?.();
      ctrl.abort();
    }, { className: 'btn-skip', testid: 'skip-opening' });
    this.layer.append(skip);
    await this.stage.playOpening({ sceneT, color, playbackRate, signal: ctrl.signal, onCue: (name) => this.audio.play(name) });
    skip.remove();
  }

  showGuideCard() {
    return new Promise((resolve) => {
      this.presentationScope?.own(resolve);
      dialog(this.layer, {
        titleKey: 'guide.title',
        body: h('ul', { class: 'guide-list' }, ['guide.goal', 'guide.palette', 'guide.grace', 'guide.alertShort', 'guide.bar'].map((k) => h('li', {}, t(k)))),
        actions: [{ key: 'guide.go', primary: true, testid: 'guide-go', onClick: resolve }],
        className: 'guide',
      });
    });
  }

  /** 停止画面。壁を覆い、音・入力・時計を止める。 */
  showPause(reason, { settingsOpen = false } = {}) {
    const session = this.session;
    if (!session) return;
    this.countdownActive = false;
    this.countdownToken = null;
    this.controls?.releaseAll();
    this.controls?.setEnabled(false);
    this.controls?.setValues(session.state.color);
    if (this.coverEl) this.coverEl.hidden = false;
    this.audio.suspend();
    clear(this.layer);
    const titleKey = reason === 'restored' ? 'pause.restoredTitle' : reason === 'stall' ? 'pause.stallTitle' : 'pause.title';
    const panel = h('div', { class: 'pause-panel', role: 'dialog', 'aria-modal': 'true' }, [
      h('h2', {}, t(titleKey)),
      reason === 'restored' ? h('p', { class: 'note' }, t('pause.restoredBody', { n: session.state.passed })) : null,
      button('pause.resume', () => this.beginCountdown(), { primary: true, testid: 'pause-resume' }),
      button('pause.sound', () => this.showPauseSettings(panel, reason), { testid: 'pause-sound' }),
      button('pause.restart', () => this.confirmQuit('restart'), { testid: 'pause-restart' }),
      button('pause.home', () => this.confirmQuit('home'), { testid: 'pause-home' }),
    ]);
    panel.querySelector('[data-testid="pause-sound"]').setAttribute('aria-expanded', 'false');
    panel.querySelector('[data-testid="pause-sound"]').setAttribute('aria-controls', 'pause-settings');
    this.layer.append(h('div', { class: 'pause-overlay' }, [panel]));
    if (settingsOpen) this.showPauseSettings(panel, reason);
  }

  showPauseSettings(panel, reason = 'user') {
    const toggle = panel.querySelector('[data-testid="pause-sound"]');
    const existing = panel.querySelector('.pause-settings');
    if (existing) {
      existing.remove();
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }
    const box = h('div', { class: 'pause-settings', id: 'pause-settings' }, [
      audioSettings({ mixer: this.audio, onChange: (c) => this.safeSet('audio', this.audio.setSettings(c)) }),
      languageSelect({ undetermined: this.languageUndetermined, onChange: (id) => this.changeLanguage(id, () => this.showPause(reason, { settingsOpen: true })) }),
    ]);
    panel.append(box);
    toggle.setAttribute('aria-expanded', 'true');
  }

  confirmQuit(next) {
    this.countdownActive = false;
    this.countdownToken = null;
    dialog(this.layer, {
      titleKey: 'pause.quitTitle',
      bodyKey: 'pause.quitBody',
      params: { n: this.session.state.passed },
      actions: [
        { key: 'pause.quitConfirm', danger: true, testid: 'quit-confirm', onClick: () => {
          this.afterFinish = next;
          this.session.quit();
        } },
        { key: 'common.cancel' },
      ],
    });
  }

  /** 再開カウントダウン（仮3秒）。覆いは外さず、入力・計測は止めたまま。 */
  async beginCountdown() {
    const session = this.session;
    if (!session || session.ended || session.running || this.takenOver || this.countdownActive) return;
    const token = (this.countdownToken = {});
    this.countdownActive = true;
    const isCurrent = () => this.session === session && !session.ended && !this.takenOver && this.countdownToken === token && this.countdownActive;
    try {
      await this.audio.prepare();
    } catch {
      /* 音の準備に失敗してもカウントダウンは続ける */
    }
    if (!isCurrent()) return;
    if (document.visibilityState === 'hidden') {
      this.showPause('user');
      return;
    }
    clear(this.layer);
    const num = h('div', { class: 'countdown', 'data-testid': 'countdown' });
    this.layer.append(h('div', { class: 'pause-overlay countdown-overlay' }, [num]));
    const total = RULES_V1.resumeCountdownMs;
    const started = performance.now();
    await new Promise((resolve) => {
      let lastShown = -1;
      const tick = () => {
        if (!isCurrent()) return resolve();
        const left = total - (performance.now() - started);
        const n = Math.ceil(left / 1000);
        if (n !== lastShown && n > 0) {
          lastShown = n;
          num.textContent = String(n);
          num.classList.remove('tick');
          void num.offsetWidth;
          num.classList.add('tick');
          this.audio.play('countdown');
        }
        if (left <= 0) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    if (!isCurrent()) return;
    this.countdownActive = false;
    this.countdownToken = null;
    if (document.visibilityState === 'hidden') {
      this.showPause('user');
      return;
    }
    clear(this.layer);
    if (this.coverEl) this.coverEl.hidden = true;
    this.controls.releaseAll(); // 持ち越しのタッチを捨てる
    this.controls.setEnabled(true);
    if(!this.guidance?.view().stationary){this.audio.play('go');session.startClock(performance.now());}
    this.renderGuidance?.();
  }

  onVisibility() {
    if (document.visibilityState !== 'hidden') {
      if (this.renderResultStatus) this.pollResult();
      return;
    }
    this.countdownActive = false;
    const session = this.session;
    if (!session || session.ended) {
      this.audio.suspend();
      return;
    }
    if (session.running) session.pause('hidden');
    this.saveNow('hidden');
    this.showPause('user');
  }

  async saveNow(reason) {
    const session = this.session;
    if (!session || session.ended || this.memoryOnly || !this.generation) return;
    try {
      await this.store.saveRun(TAB_ID, this.generation, session.snapshot());
    } catch (err) {
      if (err instanceof StaleWriterError) {
        // 別のタブが引き継いだ：このタブからは書かない・送らない
        this.memoryOnly = true;
        this.takenOver = true;
        if (this.session === session && !session.ended) {
          session.pause('takenOver');
          this.showTakenOver();
        }
        return;
      }
      if (!this.saveWarned) {
        this.saveWarned = true;
        this.memoryOnly = true;
        toast(this.layer, t('notice.saveFailedNow'), { duration: 4000, kind: 'warn' });
      }
    }
  }

  showTakenOver() {
    this.countdownActive = false;
    this.countdownToken = null;
    clear(this.layer);
    dialog(this.layer, { titleKey: 'notice.takenOverTitle', bodyKey: 'notice.takenOver', actions: [{ key: 'common.home', primary: true, onClick: () => this.leaveGame() }] });
  }

  leaveGame() {
    this.session = null;
    this.showHome();
  }

  async secretForSession(session) {
    if (!session.meta.ranked) return null;
    return this.playSecrets.get(session) ?? await savedOwnerSecret(this.store, session.meta).catch(() => null);
  }

  /** 終了の確定：結果と履歴を端末へ先に保存してから、演出と送信を行う。 */
  async persistEnd(session, generation, { takenOver = false } = {}) {
    const summary = session.summary();
    const snap = session.snapshot();
    const endedAt=Date.now();
    const presentation={playId:session.meta.playId,buildings:summary.buildings,rankAverage:summary.rankAverage,maxCombo:summary.maxCombo,endedAt,cleared:summary.endReason==='cleared'};
    let result;
    const secret = await this.secretForSession(session);
    if (session.meta.ranked) {
      result = await makeOutboxItem({ snapshot: snap, summary, secret, gameVersion: session.meta.gameVersion });
    } else {
      result = { playId: session.meta.playId, ranked: false, name: session.meta.name, summary, endedAt: Date.now() };
    }
    // 端末内ベスト（名前ごと。名前なしは空文字の枠）
    let localBest = null;
    if (summary.buildings > 0) {
      const all = (await this.safeGet('localBest')) ?? {};
      const key = session.meta.name || '';
      const cand = { buildings: summary.buildings, rankAverage: summary.rankAverage, playId: session.meta.playId, at: Date.now() };
      if (better(cand, all[key])) localBest = { ...all, [key]: cand };
    }
    if (takenOver) return { result, saved: false, stale: true };
    if (!generation) return { result, saved: false, stale: false };
    try {
      const savedPresentation=await this.store.endRun(TAB_ID,generation,result,{localBest,presentation});
      const firstClearNow=savedPresentation?.firstClearNow??savedPresentation?.presentation?.firstClearNow??false;
      return {result,saved:true,newBest:!!localBest,previous:savedPresentation?.previous??savedPresentation?.presentation?.previous??null,firstClearNow,firstClearAt:firstClearNow?presentation.endedAt:null};
    } catch (err) {
      return { result, saved: false, stale: err instanceof StaleWriterError };
    }
  }

  async finishPlay(reason) {
    const session = this.session;
    if (!session || this.finishing === session) return;
    this.countdownActive = false;
    this.countdownToken = null;
    this.finishing = session;
    const generation = this.screenGeneration;
    this.presentationScope?.dispose();
    const scope = createPresentationScope({ id: `${generation}:ending`, kind: 'ending' });
    this.presentationScope = scope;
    const current = () => this.screenGeneration === generation && this.presentationScope === scope;
    this.controls?.setEnabled(false);
    this.audio.stopGameAudio();
    const targets=session.game.course.targets.slice(0,50).map(c=>({...c}));
    // 結果の静止資料用の入力を、session を手放す前（await の前）に確保する。履歴は参照だけで、大量のコピーは作らない。
    const evidenceBase=captureEvidenceBase(session,targets);
    const { result, saved, stale, newBest = false, previous=null, firstClearNow=false, firstClearAt=null } = await this.persistEnd(session, this.generation, { takenOver: this.takenOver });
    if (!current()) return;
    const summary = result?.summary??session.summary();
    const endingBonus=buildEndingBonus(summary);
    releaseResultCardResources(this.lastResult);
    releaseResultEvidence(this.lastResult);
    this.lastResult = { playId: session.meta.playId, ranked: session.meta.ranked, name: session.meta.name, summary,saved,stale,newBest,previous,firstClearNow,firstClearAt,targets,arrivedBuilding:Math.min(50,Math.floor(session.state.t/session.rules.buildingMs)+1),netState: session.meta.ranked ? 'pending' : null };
    if (!saved && !stale && result?.ranked) {
      // 端末へ保存できなかった：メモリ上の結果を可能なら直接送る（再読込で失われ得ることは画面で伝える）
      this.notices.push('notice.resultNotSaved');
      this.sendUnsaved(result);
    }
    const next = this.afterFinish;
    this.afterFinish = null;
    if (next === 'home') {
      this.session = null;
      this.showHome();
      this.flushNetwork();
      return;
    }
    if (next === 'restart') {
      this.session = null;
      this.flushNetwork();
      this.startFlow(this.nameRaw);
      return;
    }
    // 結果を見せる時だけ、表示専用の入力を結果へ渡す（解析は showResult で始める。中断では付けない）
    if (evidenceBase) this.lastResult.evidenceInput = Object.freeze({ ...evidenceBase, originalSummary: summary });
    this.audio.play(reason === 'detected' ? 'detected' : reason === 'cleared' ? (endingBonus?.allSuccessPoints?'bonusAllSuccess':'clear') : 'back');
    const ctrl = new AbortController();
    scope.own(() => ctrl.abort());
    clear(this.layer);
    const skip = button('common.skip', () => {
      this.audio.stopSfx?.();
      ctrl.abort();
    }, { className: 'btn-skip', testid: 'skip-ending' });
    this.layer.append(skip);
    const endingBonusView=mountEndingBonus({host:this.layer,data:endingBonus,scope,t});
    await this.stage?.playEnding(reason, {signal:ctrl.signal,onFrame:(elapsed)=>{scope.tick(elapsed);endingBonusView?.tick(elapsed);}});
    skip.remove();
    if (!current()) return;
    this.session = null;
    this.showResult();
    this.flushNetwork().then(() => this.pollResult());
  }

  async sendUnsaved(item) {
    await this.volatileNetwork.put('outbox', { ...item, state: 'pending', liveUnsaved: true });
    return this.flushNetwork();
  }

  pollResult(){
    const result=this.lastResult,screen=this.screenGeneration;
    if(this.resultPoll?.result===result&&this.resultPoll.screen===screen)return this.resultPoll.completion;
    const token={result,screen};
    token.completion=this.pollResultFor(result,screen).finally(()=>{if(this.resultPoll===token)this.resultPoll=null;});
    this.resultPoll=token;return token.completion;
  }

  async pollResultFor(r, screen) {
    if (!r?.ranked || !this.api.configured) return;
    const isCurrent = () => this.lastResult === r && this.screenGeneration === screen;
    const fallback = await this.volatileNetwork.getOne('records', r.playId);
    const store = fallback ? this.volatileNetwork : this.store;
    const cached = fallback ?? await store.getOne('records', r.playId).catch(() => null);
    if (!isCurrent() || !cached || cached.playId !== r.playId) return;
    if (cached.destination !== undefined && cached.destination !== this.api.destination) return;
    this.applyResultRecord(cached);
    for (let attempt = 0; attempt < 6 && isCurrent(); attempt += 1) {
      try {
        const [record] = await refreshRecords({ api: this.api, store, playId: r.playId, isCurrent });
        if (!isCurrent()) return;
        if (!record) throw new Error('status_unavailable');
        r.rankError = false;
        this.applyResultRecord(record);
        if (record.status !== 'verifying' || attempt === 5) return;
      } catch {
        if (isCurrent()) {
          r.rankError = true;
          this.renderResultStatus?.();
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }

  // ---------- 結果 ----------
  showResult() {
    this.disposeStage();
    const r = this.lastResult;
    const displayData=buildResultData(r);
    const s=displayData.summary;
    const resultScreen=this.screenGeneration+1;
    let resultPresentation=null,cardController=null;
    const resultCurrent=()=>this.lastResult===r&&this.screenGeneration===resultScreen;
    const reasonKey = variant => variant === 'corrected' ? 'releaseCorrectedResult' : 'result.' + variant;
    let variant = displayData.variant;
    const statusBox = h('div', { class: 'result-status', 'aria-live': 'polite' });
    const share = xShareForm(this.resultShareText(), 'result-share');
    let rankingView, displayedOfficial;
    const rankingHost = h('div', { class: 'result-ranking' });
    const renderResultStatus = () => {
      if(!resultCurrent())return;
      cardController?.refresh({locale:getLanguage()});
      share.setText(this.resultShareText());
      clear(statusBox);
      if (resultPresentation) statusBox.append(resultPresentation.rankElement);
      if (!r.ranked) {
        statusBox.append(h('p', { class: 'note' }, t(r.name ? 'result.status.unranked' : 'result.status.anonymous')));
        return;
      }
      const key = {
        pending: 'result.status.pending',
        sending: 'result.status.sending',
        accepted: 'result.status.verifying',
        retryable_failed: 'result.status.retryable',
        permanent_failed: 'result.status.permanent',
        verifying: 'result.status.verifying',
        official: 'result.status.official',
        no_rank: 'result.status.noRank',
        pending_review: 'result.status.pendingReview',
        rejected: 'result.status.rejected',
        under_review: 'result.status.underReview',
      }[r.netState] ?? 'result.status.pending';
      statusBox.append(h('p', {}, t(key)));
      if (r.netState === 'retryable_failed') statusBox.append(button('records.resend', () => this.flushNetwork().then(() => this.pollResult()), { className: 'btn-small' }));
      const run = projectRunResult(r, getLanguage());
      const officialKey = r.netState === 'official' ? JSON.stringify([run.buildings, run.rankAverage]) : null;
      if (rankingView && officialKey !== displayedOfficial) rankingView.load();
      displayedOfficial = officialKey;
      const { rank, ordinal } = formatRunMetrics(run);
      resultPresentation?.updateRank({ state: run.rankState, rank: run.runRank, label: 'current', text: rank });
      if (ordinal) statusBox.append(h('p', { class: 'result-clear-ordinal' }, ordinal));
      if (run.rankState === 'pending') statusBox.append(h('p', {}, t('releasePending')));
      if (r.rankError) statusBox.append(h('p', {}, [t('result.rankError'), ' ', button('common.retry', () => this.pollResult(), { className: 'btn-small' })]));
    };
    const localBests = h('p', { class: r.newBest ? 'result-best result-best-new' : 'result-best' });
    this.safeGet('localBest').then((all) => {
      if(!resultCurrent())return;
      const b = all?.[r.name || ''];
      if (b) localBests.textContent = t('result.localBest', { buildings: formatNumber(b.buildings), average: formatPercent2(b.rankAverage) });
    });
    const el = h('main', { class: `screen result result-screen-${variant}` }, [
      h('div', { class: 'result-burst', 'aria-hidden': 'true' }),
      h('h1', { class: `result-title result-${variant}` }, t(reasonKey(variant))),
      h('div', { class: 'result-main' }, [
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.buildings')), h('span', { class: 'stat-value', 'data-testid': 'result-buildings' }, `${formatNumber(s.buildings)} / ${RULES_V1.buildingCount}`)]),
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.average')), h('span', { class: 'stat-value', 'data-testid': 'result-average' }, s.rankAverage == null ? '—' : formatPercent2(s.rankAverage))]),
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.maxCombo')), h('span', { class: 'stat-value', 'data-testid':'result-max-combo' }, formatNumber(s.maxCombo))]),
      ]),
      h('p', { class: 'note' }, t('result.roundingNote')),
      r.saved===false&&!r.stale?h('p',{class:'note result-save-warning',role:'status'},t('notice.resultNotSaved')):null,
      r.name ? h('p', { class: 'result-name' }, [t('result.nameLabel'), ' ', isolatedText(r.name)]) : null,
      localBests,
      statusBox,
      h('div', { class: 'result-actions' }, [
        button('result.again', () => this.startFlow(this.nameRaw), { primary: true, testid: 'result-again' }),
        rankingLink('result-ranking'),
        share.el,
      ]),
      button('common.home', () => this.showHome(), { testid: 'result-home' }),
      rankingHost,
    ]);
    this.mount(el, () => this.showResult());
    const scopeId = `${this.screenGeneration}:result`;
    const scope = createPresentationScope({ id: scopeId, kind: 'result' });
    this.presentationScope = scope;
    const resultHost=h('div',{class:'result-supplement'});rankingHost.after(resultHost);
    // 任意のふり返りパネル。解析は lastResult の持ち物で、言語の描き直しでは始め直さない。
    const evidence=startResultEvidence(r);
    // Normal start supplies real drawing ports; injected lightweight Apps may omit the canvas ports.
    const cardPorts=(typeof this.resultCardPorts==='function'?this.resultCardPorts({result:r,host:el,scope}):this.resultCardPorts)??{};
    // Optional E090 can open during the portrait's initial presentation delay.
    // Its lease and the later card capture must share the same owner from first render.
    r.resultRendererOwner??=createResultRendererOwner({createRenderer:cardPorts.createRenderer,destroyRenderer:cardPorts.destroyRenderer});
    // A fixed PNG drawing layout must not mask viewport changes and keep an old File shareable.
    const resultLayoutKey=()=>JSON.stringify([cardPorts.getLayoutKey?.()??null,globalThis.innerWidth??this.root.clientWidth??0,globalThis.innerHeight??this.root.clientHeight??0]);
    cardController=createResultCardController({result:r,locale:getLanguage(),layoutKey:resultLayoutKey(),ports:{...cardPorts,
      getPublicUrl:()=>GAME_URL,
      onChange:snapshot=>{if(resultCurrent()){this.resultCardSnapshot=snapshot;cardPorts.onChange?.(snapshot);}},
    }});
    this.resultCardController=cardController;
    const refreshCardLayout=()=>cardController.refresh({locale:getLanguage(),layoutKey:resultLayoutKey()});
    globalThis.addEventListener?.('resize',refreshCardLayout);
    const cardView=cardPorts.mount?.({host:el,controller:cardController,scope,onCopyText:()=>this.copyResultText()});
    scope.own(()=>{globalThis.removeEventListener?.('resize',refreshCardLayout);cardView?.dispose?.();cardController.dispose();if(this.resultCardController===cardController){this.resultCardController=null;this.resultCardSnapshot=null;}});
    const evidenceHost=h('div',{class:'result-evidence-host'});resultHost.before(evidenceHost);
    const panels=mountResultPanels({host:evidenceHost,t,state:resolveResultEvidence(r),panels:cardPorts.panels??[]});
    if(r.evidencePanelId)panels.open(r.evidencePanelId);
    const refreshEvidence=()=>{if(!resultCurrent())return;panels.update(resolveResultEvidence(r));r.evidencePanelId=panels.openId;};
    const evidenceUnsubscribe=evidence?.subscribe(refreshEvidence);
    panels.element.addEventListener('click',()=>{r.evidencePanelId=panels.openId;});
    this.resultPanels=panels;this.refreshResultEvidence=refreshEvidence;
    scope.own(()=>{evidenceUnsubscribe?.();panels.dispose();if(this.resultPanels===panels)this.resultPanels=null;if(this.refreshResultEvidence===refreshEvidence)this.refreshResultEvidence=null;});
    resultPresentation=mountResultPresentation({host:resultHost,data:displayData,scope,t});
    el.querySelector('.result-main').before(resultPresentation.sceneElement);
    this.resultPresentation=resultPresentation;
    el.querySelector('.result-main').append(resultPresentation.scoreElement);
    if(r.presentationPlayed)resultPresentation.finishNow();
    r.presentationPlayed=true;
    let scoreSignature = JSON.stringify([r.verifiedScore, s.buildings, s.rankAverage]);
    const renderResultScore = () => {
      if (!resultCurrent()) return;
      cardController.refresh({ locale: getLanguage() });
      const run = projectRunResult(r, getLanguage());
      el.querySelector('[data-testid="result-buildings"]').textContent = `${formatNumber(run.buildings)} / ${RULES_V1.buildingCount}`;
      el.querySelector('[data-testid="result-average"]').textContent = formatPercent2(run.rankAverage);
      const signature = JSON.stringify([r.verifiedScore, run.buildings, run.rankAverage]);
      if (scoreSignature === signature) return;
      scoreSignature = signature;
      const data = buildResultData(r);
      if (data.variant !== variant) {
        el.classList.replace('result-screen-' + variant, 'result-screen-' + data.variant);
        const title = el.querySelector('.result-title');
        title.classList.replace('result-' + variant, 'result-' + data.variant);
        title.textContent = t(reasonKey(data.variant));
        variant = data.variant;
      }
      resultPresentation.updateData(data);
      el.querySelector('[data-testid="result-max-combo"]').textContent = formatNumber(data.maxCombo);
      refreshEvidence();
    };
    this.renderResultScore = renderResultScore;
    scope.own(() => { if (this.renderResultScore === renderResultScore) this.renderResultScore = null; });
    renderResultScore();
    this.renderResultStatus = renderResultStatus;
    renderResultStatus();
    scope.own(() => { if (this.renderResultStatus === renderResultStatus) this.renderResultStatus = null; });
    const tick = createVisiblePresentationClock({ visibilityTarget: document });
    scope.own(tick.dispose);
    scope.own(() => cancelAnimationFrame(this.raf));
    const animate = (now) => {
      if (!scope.isCurrent(scopeId)) return;
      const elapsed=tick(now,document.hidden).elapsed;
      scope.tick(elapsed);resultPresentation.tick(elapsed);
      this.raf = requestAnimationFrame(animate);
    };
    this.raf = requestAnimationFrame(animate);
    if(!r.resultSoundPlayed){r.resultSoundPlayed=true;this.audio.play('result');}
    if (r.newBest && !r.bestPlayed) {
      r.bestPlayed = true; // 言語を切り替えて描き直しても、もう一度は鳴らさない
      scope.schedule('best-sound', 700, () => this.audio.play('best'));
    }
    rankingView = createRankingView({ api: this.api, result: true, onRefresh: () => this.pollResult() });
    rankingHost.append(h('h2', { class: 'panel-title' }, t('ranking.top')), rankingView.el);
    scope.own(rankingView.dispose);
    rankingView.load();
    if (this.api.configured) this.pollResult();
  }

  resultShareText() {
    return buildResultShareText({run:projectRunResult(this.lastResult, getLanguage())});
  }

  async copyResultText() {
    const text = this.resultShareText();
    let mode = 'copied';
    try { await globalThis.navigator.clipboard.writeText(`${text}\n${GAME_URL}`); }
    catch { mode = 'manual'; }
    this.showShareFallback(text, mode);
  }

  // ---------- 練習 ----------
  showPracticeMenu() {
    const el = h('main', { class: 'screen practice-menu' }, [
      h('h1', {}, t('practice.title')),
      h('ul', { class: 'practice-overview' }, PRACTICE_STEPS.map(step => h('li', {}, t(`practice.step${step}`)))),
      button('home.start', () => this.startGuidePractice(), { primary: true, testid: 'guide-practice-start' }),
      backButton(() => this.showHome()),
    ]);
    this.mount(el, () => this.showPracticeMenu());
  }

  async startGuidePractice(step = PRACTICE_STEPS[0]) {
    const token = (this.practiceToken = {});
    const generation = this.screenGeneration;
    try {
      await this.audio.prepare();
    } catch {
      // 音が使えない端末でも練習を始められる。
    }
    if (this.practiceToken !== token || this.screenGeneration !== generation) return null;

    const seed = 1;
    const rules = RULES_V1;
    const practice = createGuidePractice({ step, seed, rules });
    const initial = practice.view();
    const total = PRACTICE_STEPS.length;
    const nextStep = PRACTICE_STEPS[PRACTICE_STEPS.indexOf(step) + 1];
    const stageBox = h('div', { class: 'stage', 'data-testid': 'stage' });
    const guideHost = initial.stationary ? h('div', { class: 'guidance-host' }) : null;
    let paused = false;
    let guide;
    const controls = createControls({
      onChange: color => { practice.setColor(color); render(practice.view()); },
      onLockedTap: () => this.audio.play('locked'),
      ...this.controlAudioCallbacks(),
    });
    const pause = button('game.pause', () => {
      paused = !paused;
      clock(performance.now(), true);
      controls.setEnabled(!paused);
    }, { testid: 'guide-practice-pause' });
    const tools = h('div', { class: 'guide-practice-tools' }, [
      pause, button('guidance.back', () => this.showPracticeMenu(), { testid: 'guide-practice-exit' }),
      h('span', { class: 'guide-practice-progress', role: 'status', 'data-testid': 'guide-practice-progress' }, t('practice.counter', { n: step, total })),
    ]);
    const actions = h('div', { class: 'guide-practice-actions', hidden: true }, [
      h('h2', { class: 'guide-practice-progress' }, t('practice.stepDone', { n: step, total })),
      button(nextStep ? 'practice.nextStep' : 'practice.again', () => {
        if (current()) this.startGuidePractice(nextStep);
      }, { primary: true, testid: nextStep ? 'guide-practice-next' : 'guide-practice-again' }),
      button('guidance.back', () => this.showPracticeMenu(), { testid: 'guide-practice-choose' }),
    ]);
    const render = view => {
      guide?.render(view);
      if (view.complete && actions.hidden) {
        tools.hidden = true;
        actions.hidden = false;
        controls.setEnabled(false);
        this.audio.play('guideClear');
      }
    };
    const el = h('main', { class: 'screen game guide-practice' }, [
      h('div', { class: 'stage-wrap' }, [stageBox, tools, guideHost, actions]), controls.el,
    ]);
    this.mount(el);
    this.practiceToken = token;
    this.setMenuMusic('practice');
    const id = `${this.screenGeneration}:practice`;
    const scope = createPresentationScope({ id, kind: 'game' });
    this.presentationScope = scope;
    const current = () => this.practiceToken === token && this.presentationScope === scope && scope.isCurrent(id);
    this.controls = controls;
    scope.own(() => { practice.dispose(); cancelAnimationFrame(this.raf); });
    const clock = createVisiblePresentationClock({ visibilityTarget: document });
    scope.own(clock.dispose);
    controls.setValues(initial.color);
    controls.setLocked(!initial.brightnessUnlocked);
    controls.setEnabled(false);
    if (guideHost) {
      guide = mountGuidance({ host: guideHost, controls });
      scope.own(guide.dispose);
    }
    const stage = await this.stageFactory(stageBox, { course: practice.course, decorations: makeDecorations(seed) });
    if (!current()) { stage.dispose(); return null; }
    this.stage = stage;
    this.guidePractice = practice;
    scope.own(() => { if (this.guidePractice === practice) this.guidePractice = null; });
    controls.layout();
    controls.setEnabled(!paused);
    if (initial.stationary) stage.showPractice(initial.target);

    const loop = now => {
      if (!current()) return;
      const frame = clock(now, document.hidden || paused);
      const view = practice.tick(frame.dt * 1000);
      scope.tick(view.elapsed);
      if (!document.hidden) {
        if (view.stationary) {
          stage.renderPractice(view.color, view.target, { building: view.building });
        } else {
          const walking = !paused && !view.complete;
          const t = (view.building - 1) * rules.buildingMs + Math.min(view.elapsed, rules.buildingMs - 1);
          stage.update({ t, color: view.color, walking, presentation: {
            ...view, t, phase: 'grace', running: walking, guidanceActive: false,
            policeStage: 0, passed: 0, combo: 0, matchState: null,
          } });
        }
      }
      render(view);
      if (!view.complete) this.raf = requestAnimationFrame(loop);
    };
    render(initial);
    this.raf = requestAnimationFrame(loop);
    return practice;
  }

  // ---------- そのほかの画面 ----------
  showRanking() {
    this.disposeStage();
    const name = normalizeName(this.nameRaw);
    const view = createRankingView({ api: this.api, name: name.ok && !name.empty ? name.name : null });
    const el = h('main', { class: 'screen ranking-screen' }, [h('h1', {}, t('ranking.title')), view.el, backButton(() => this.showHome())]);
    this.mount(el, () => this.showRanking());
    view.load();
  }

  async showRecords() {
    this.disposeStage();
    this.flags.recordsChanged = false;
    const localOnly = !this.runtime.isVerification && !this.api.configured;
    const view = createRecordsView({
      store: this.store,
      localOnly,
      onResend: async () => {
        await this.flushNetwork();
        await this.refreshStatuses();
        view.load();
      },
      onReview: async (item) => {
        try {
          await requestReview({ api: this.api, store: this.store, playId: item.playId });
          toast(this.layer, t('records.reviewRequested'));
        } catch {
          toast(this.layer, t('records.reviewFailed'), { kind: 'warn' });
        }
        view.load();
      },
    });
    const el = h('main', { class: 'screen records-screen' }, [
      h('h1', {}, t(localOnly ? 'records.localTitle' : 'records.title')),
      h('p', { class: 'note' }, t('records.intro')),
      !localOnly && button('records.refresh', async () => {
        await this.flushNetwork();
        await this.refreshStatuses();
        view.load();
      }, { className: 'btn-small' }),
      view.el,
      backButton(() => this.showHome()),
    ]);
    this.mount(el, () => this.showRecords());
    await view.load();
    if (this.api.configured) {
      await this.refreshStatuses();
      view.load();
    }
  }

  showSettings() {
    this.disposeStage();
    const el = h('main', { class: 'screen settings' }, [
      h('h1', {}, t('settings.title')),
      section('settings.languageTitle', [languageSelect({ undetermined: this.languageUndetermined, onChange: (id) => this.changeLanguage(id, () => this.showSettings()) })]),
      section('settings.soundTitle', [audioSettings({ mixer: this.audio, onChange: (c) => this.safeSet('audio', this.audio.setSettings(c)) })]),
      section('settings.dataTitle', [
        h('p', { class: 'note' }, t('settings.dataNote')),
        button('settings.clearPractice', () =>
          dialog(this.layer, {
            titleKey: 'settings.clearPracticeTitle',
            bodyKey: 'settings.clearPracticeBody',
            actions: [
              { key: 'settings.clearPracticeConfirm', danger: true, onClick: () => this.store.clearPractice().then(() => toast(this.layer, t('settings.cleared'))) },
              { key: 'common.cancel' },
            ],
          }), { className: 'btn-small' }),
      ]),
      backButton(() => this.showHome()),
    ]);
    this.mount(el, () => this.showSettings());
  }

  async changeLanguage(id, after) {
    if (!isSupportedLanguage(id)) return;
    const previousLayer = this.layer;
    this.languageUndetermined = false;
    setLanguage(id);
    // 通常画面は言語変更通知で再描画済み。停止画面だけ、ここで直ちに更新する。
    if (this.layer === previousLayer) after?.();
    const layer = this.layer;
    const ok = await this.safeSet('lang', id);
    // 保存完了を待って画面を戻さない。失敗の通知も、その操作をした画面に限る。
    if (!ok && this.layer === layer && getLanguage() === id) toast(layer, t('settings.langNotSaved'));
  }

  showHowTo() {
    this.disposeStage();
    const steps = ['howto.goal', 'howto.palette', 'howto.bar', 'howto.grace', 'howto.alert', 'howto.buildings', 'howto.score', 'howto.ranking'];
    const el = h('main', { class: 'screen howto' }, [
      h('h1', {}, t('howto.title')),
      h('ol', { class: 'howto-list' }, steps.map((k) => h('li', {}, t(k)))),
      button('howto.replayOpening', () => this.replayOpening(), { className: 'btn-small' }),
      backButton(() => this.showHome()),
    ]);
    this.mount(el, () => this.showHowTo());
  }

  async replayOpening() {
    const stageBox = h('div', { class: 'stage stage-full' });
    const el = h('main', { class: 'screen game' }, [h('div', { class: 'stage-wrap' }, [stageBox])]);
    this.mount(el, null);
    this.setMenuMusic(null);
    this.stage = await this.stageFactory(stageBox, { course: { targets: Array.from({ length: 50 }, () => ({ h: 3000, s: 5000, v: 10000 })) }, decorations: makeDecorations(1), showOpeningShop: true });
    this.stage.resize();
    await this.playOpening();
    this.showHowTo();
  }

  /** ホームは現行の立体モデルだけを表示する。利用不可でも旧キャラクターに戻さない。 */
  async mountShowcase(host) {
    const token = (this.showcaseToken = {});
    try {
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
      const { createShowcase } = await import('./scene/showcase.js');
      if (this.showcaseToken !== token || !host.isConnected) return;
      clear(host);
      this.showcase = createShowcase(host);
    } catch {
      /* モデルを表示できなくても、ホームの操作はそのまま使える。 */
    }
  }

  disposeStage() {
    this.presentationScope?.dispose();
    this.presentationScope = null;
    this.countdownActive = false;
    this.countdownToken = null;
    this.practiceToken = null;
    this.showcaseToken = null;
    this.showcase?.dispose();
    this.showcase = null;
    cancelAnimationFrame(this.raf);
    this.stage?.dispose();
    this.stage = null;
    this.controls?.destroy();
    this.controls = null;
    this.renderResultStatus = null;
  }
}

export async function start(root = document.getElementById('app')) {
  const app = new App(root, { resultCardPorts: createResultCardPorts });
  globalThis.__kamereoru = app; // 検証用（自動ブラウザ試験から状態を読む）
  await app.boot();
  return app;
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  start().catch((err) => {
    console.error(err);
    document.getElementById('app').textContent = 'Error: ' + (err?.message ?? err);
  });
}
