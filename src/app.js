// カメレオる：画面の流れと、本編・練習・保存・通信をつなぐ。
// 本編の状態：ホーム→開始準備→初回演出（初回のみ）→進行中↔一時停止→再開カウントダウン→進行中→終了確定→終了演出→結果
// 送信・審査の状態は画面とは別に管理し、送信待ちで次のプレイを止めない。
import {
  RULES_V1,
  makeDecorations,
  rankAverage,
  formatRankAverage,
  hsvToHex,
  classifyMatch,
  isEvalTime,
} from './rules/v1/index.js';
import { areaOf } from './rules/v1/course.js';
import { GameSession } from './game/session.js';
import { alertWordKey, createAlertStageTracker, createInstantSuccessTracker, matchWordKey } from './game/feedback.js';
import { createControls } from './ui/controls.js';
import { h, clear, isolatedText } from './ui/dom.js';
import { audioSettings, backButton, button, dialog, languageSelect, nameField, section, toast } from './ui/screens.js';
import { createRankingView } from './ui/ranking.js';
import { createRecordsView } from './ui/record-status.js';
import { buildHomeShareText, buildResultShareText, shareToX } from './ui/share.js';
import { t, setLanguage, getLanguage, formatNumber, formatPercent2, formatMatch, formatSeconds, onLanguageChange } from './i18n/i18n.js';
import { resolveLanguage } from './i18n/languages.js';
import { openStore, TAB_ID, StaleWriterError } from './storage/store.js';
import { MemoryStore } from './storage/memory-store.js';
import { createMixer } from './audio/mixer.js';
import { createStage } from './scene/stage.js';
import { createPractice } from './practice/session.js';
import { normalizeName } from './shared/name.js';
import { loadRuntimeConfig } from './config/runtime.js';
import { createApi, uuid } from './net/api.js';
import { abandonStart, createStartRequest, flushLaunches, recordLaunch, sendStartRequest } from './net/start.js';
import { flushOutbox, makeOutboxItem, refreshRecords, requestReview, sendOne } from './net/outbox.js';

const SAVE_INTERVAL_MS = 5000; // 試作値：通過時に加えて、ゲーム内5秒ごとに保存

function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

const better = (a, b) => !b || a.buildings > b.buildings || (a.buildings === b.buildings && (a.rankAverage ?? -1) > (b.rankAverage ?? -1));

class App {
  constructor(root) {
    this.root = root;
    this.runtime = loadRuntimeConfig();
    this.api = createApi({ base: this.runtime.apiBase });
    this.audio = createMixer();
    this.store = null;
    this.flags = {};
    this.nameRaw = '';
    this.session = null;
    this.generation = 0;
    this.memoryOnly = false;
    this.startToken = null;
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
    const langs = globalThis.navigator?.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
    setLanguage(resolveLanguage(savedLang, langs));
    this.audio.setSettings((await this.safeGet('audio')) ?? {});
    this.flags = (await this.safeGet('flags')) ?? {};
    this.nameRaw = (await this.safeGet('nameRaw')) ?? '';
    await this.checkSavedRun();
    onLanguageChange(() => this.rerender?.());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    globalThis.addEventListener('pagehide', () => this.saveNow('pagehide'));
    globalThis.addEventListener('online', () => this.flushNetwork());
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
    if (this.session || !this.menuTheme) return;
    if (await this.audio.prepare()) this.audio.setMusic(this.menuTheme);
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
      this.foreignRun = { reason: r.error, assetVersion: run.snapshot?.meta?.assetVersion ?? null, rulesVersion: run.snapshot?.meta?.rulesVersion ?? null };
      return;
    }
    if (r.error) {
      await this.store.quarantineRun(r.error).catch(() => {});
      this.notices.push('notice.savedRunBroken');
      return;
    }
    this.savedRun = run;
  }

  /** 別の版のプレイの案内（保存した版のページ）。 */
  foreignRunLink() {
    const v = this.foreignRun?.assetVersion;
    if (!v || v === this.runtime.assetVersion || !/^[0-9A-Za-z._-]{1,64}$/.test(v)) return null;
    return new URL(`v/${v}/`, document.baseURI.replace(/v\/[^/]+\/$/, '')).href;
  }

  /** 別の版のプレイを、確認してから保管庫へ移す（削除しない）。 */
  async shelveForeignRun() {
    await this.store.quarantineRun(this.foreignRun?.reason ?? 'unknown_rules_version').catch(() => {});
    this.foreignRun = null;
  }

  async flushNetwork() {
    if (!this.api.configured || this.memoryOnly) return;
    try {
      await flushLaunches(this.api, this.store);
      const s = await flushOutbox({ api: this.api, store: this.store, onUpdate: (u) => this.onOutboxUpdate(u) });
      if (s.accepted) await this.refreshStatuses();
    } catch {
      /* 次の機会に再送 */
    }
  }

  async refreshStatuses() {
    try {
      const updated = await refreshRecords({ api: this.api, store: this.store });
      if (updated.some((r) => r.unseenChange)) this.flags.recordsChanged = true;
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
    this.disposeStage();
    const field = nameField({
      value: this.nameRaw,
      onChange: (raw) => {
        this.nameRaw = raw;
        this.safeSet('nameRaw', raw);
      },
    });
    const continueBtn = button('home.continue', () => this.resumeSaved(), { testid: 'home-continue' });
    continueBtn.hidden = !this.savedRun;
    const practiceBtn = button('home.practice', () => this.showPracticeMenu(), { testid: 'home-practice' });
    const pendingBadge = h('span', { class: 'badge', hidden: true });
    const recordsBtn = button('home.records', () => this.showRecords(), { testid: 'home-records' });
    recordsBtn.append(pendingBadge);
    const homeArt = h('div', { class: 'home-art', 'aria-hidden': 'true' }, [h('div', { class: 'home-chameleon' }), h('div', { class: 'home-jewel' })]);
    const notices = h('div', { class: 'notices' });
    for (const key of this.notices.splice(0)) notices.append(h('p', { class: 'notice' }, t(key)));
    if (this.flags.recordsChanged) notices.append(h('p', { class: 'notice notice-update' }, [t('notice.recordsUpdated'), ' ', button('home.records', () => this.showRecords(), { className: 'btn-small' })]));
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
          button('home.ranking', () => this.showRanking(), { testid: 'home-ranking' }),
          button('home.howto', () => this.showHowTo(), { testid: 'home-howto' }),
          button('home.settings', () => this.showSettings(), { testid: 'home-settings' }),
          recordsBtn,
          button('share.button', () => this.shareHome(), { className: 'btn-x', testid: 'home-share' }),
        ]),
      ]),
      this.runtime.isVerification ? this.verificationMenu() : null,
      h('footer', { class: 'footer' }, [t('app.version', { v: this.runtime.gameVersion, rules: RULES_V1.rulesVersion })]),
    ]);
    this.mount(el, () => this.showHome());
    this.mountShowcase(homeArt);
    this.store
      .getAll('outbox')
      .then((items) => {
        pendingBadge.hidden = !items.length;
        pendingBadge.textContent = String(items.length);
      })
      .catch(() => {});
  }

  async shareHome() {
    this.audio.play('select');
    const r = await shareToX({ text: buildHomeShareText({ lang: getLanguage() }), url: this.runtime.publicUrl });
    if (r !== 'opened') this.showShareFallback(buildHomeShareText({ lang: getLanguage() }), r);
  }

  showShareFallback(text, mode) {
    const area = h('textarea', { class: 'share-manual', readonly: true, rows: '5' });
    area.value = this.runtime.publicUrl ? `${text}\n${this.runtime.publicUrl}` : text;
    dialog(this.layer, { titleKey: mode === 'copied' ? 'share.copied' : 'share.manual', body: area, actions: [{ key: 'common.close', primary: true }] });
    area.select();
  }

  // ---------- 開始 ----------
  async startFlow(rawName) {
    await this.audio.prepare();
    this.audio.play('confirm');
    const name = normalizeName(rawName);
    if (!name.ok) {
      toast(this.layer, t('name.fixBeforeStart'), { kind: 'warn' });
      return;
    }
    if (this.foreignRun) {
      const link = this.foreignRunLink();
      dialog(this.layer, {
        titleKey: 'start.foreignRun.title',
        bodyKey: 'start.foreignRun.body',
        actions: [
          ...(link ? [{ key: 'notice.openSavedVersion', primary: true, onClick: () => globalThis.location.assign(link) }] : []),
          { key: 'start.foreignRun.shelve', danger: true, testid: 'foreign-shelve', onClick: async () => {
            await this.shelveForeignRun();
            this.startFlow(rawName);
          } },
          { key: 'common.cancel' },
        ],
      });
      return;
    }
    if (this.savedRun) {
      dialog(this.layer, {
        titleKey: 'start.savedRun.title',
        bodyKey: 'start.savedRun.body',
        actions: [
          { key: 'start.savedRun.continue', primary: true, onClick: () => this.resumeSaved() },
          { key: 'start.savedRun.newGame', danger: true, onClick: async () => {
            await this.settleSavedRun();
            this.startFlow(rawName);
          } },
          { key: 'common.cancel' },
        ],
      });
      return;
    }
    const launchId = uuid();
    if (name.empty) {
      this.beginPlay({ ranked: false, launchId });
      return;
    }
    if (!this.api.configured || this.store.memory) {
      dialog(this.layer, {
        titleKey: 'start.unranked.title',
        bodyKey: this.store.memory ? 'start.unranked.noStorage' : 'start.unranked.notConfigured',
        actions: [
          { key: 'start.playUnranked', primary: true, onClick: () => this.beginPlay({ ranked: false, launchId }) },
          { key: 'common.home', onClick: () => this.showHome() },
        ],
      });
      return;
    }
    // 保存できるかを先に確かめる（新しいランキング対象プレイの前）
    try {
      await this.store.probeWrite();
    } catch {
      this.storageShortDialog(rawName, launchId);
      return;
    }
    this.rankedStart(name.name, launchId);
  }

  storageShortDialog(rawName, launchId) {
    dialog(this.layer, {
      titleKey: 'storage.short.title',
      bodyKey: 'storage.short.body',
      actions: [
        { key: 'storage.short.resend', onClick: async () => {
          await this.flushNetwork();
          this.startFlow(rawName);
        } },
        { key: 'storage.short.cleanup', onClick: async () => {
          await this.store.cleanupSafe().catch(() => 0);
          this.startFlow(rawName);
        } },
        { key: 'start.playUnranked', primary: true, onClick: () => this.beginPlay({ ranked: false, launchId }) },
      ],
    });
  }

  async rankedStart(name, launchId, existing = null) {
    const token = {};
    this.startToken = token;
    const record = existing ?? (await createStartRequest(this.store, { name, launchId, gameVersion: this.runtime.gameVersion }));
    const progress = h('p', { class: 'dialog-body', 'aria-live': 'polite' }, t('start.contacting', { n: 1, total: 3 }));
    const close = dialog(this.layer, {
      titleKey: 'start.ranked.title',
      body: progress,
      actions: [
        { key: 'start.playUnranked', onClick: () => this.switchToUnranked(record, launchId) },
        { key: 'common.cancel', onClick: () => this.cancelStart(record) },
      ],
    });
    const r = await sendStartRequest(this.api, this.store, record, {
      isCurrent: () => this.startToken === token,
      onAttempt: (n, total) => (progress.textContent = t('start.contacting', { n, total })),
    });
    if (this.startToken !== token) return; // 利用者が別の操作へ進んだ（古い応答は取り付けない）
    close();
    if (r.ok) {
      this.startToken = null;
      this.beginPlay({ ranked: true, launchId, name, playId: r.data.playId, seed: r.data.seed, secret: record.secret, requestId: record.requestId });
      return;
    }
    dialog(this.layer, {
      titleKey: 'start.failed.title',
      bodyKey: r.error?.retryable === false ? 'start.failed.rejected' : 'start.failed.body',
      params: { code: r.error?.code ?? '' },
      actions: [
        { key: 'common.retry', primary: true, onClick: () => this.rankedStart(name, launchId, { ...record, status: 'requesting' }) },
        { key: 'start.playUnranked', onClick: () => this.switchToUnranked(record, launchId) },
        { key: 'common.home', onClick: () => this.cancelStart(record) },
      ],
    });
  }

  switchToUnranked(record, launchId) {
    this.startToken = null;
    if (record) abandonStart(this.api, this.store, record).catch(() => {});
    this.beginPlay({ ranked: false, launchId });
  }

  cancelStart(record) {
    this.startToken = null;
    if (record) abandonStart(this.api, this.store, record).catch(() => {});
    this.showHome();
  }

  /** 前のプレイを、保存できている確定棟までで終了・保全する。 */
  async settleSavedRun() {
    const claimed = await this.store.claimRun(TAB_ID).catch(() => null);
    this.savedRun = null;
    if (!claimed) return;
    const r = GameSession.fromSnapshot(claimed.snapshot);
    if (r.error) {
      await this.store.quarantineRun(r.error).catch(() => {});
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
  async debugStart({ atMs = 93000 } = {}) {
    if (!this.runtime.isVerification) throw new Error('debugStart is only for verification builds');
    const session = new GameSession({ playId: uuid(), launchId: uuid(), ranked: false, name: '', seed: randomSeed(), gameVersion: this.runtime.gameVersion, assetVersion: this.runtime.assetVersion, startedAt: Date.now(), debug: true });
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
    this.playSecret = null;
    this.generation = 0;
    this.memoryOnly = true; // 端末の本編欄・送信待ちには書かない
    this.takenOver = false;
    await this.showGame(session, { fresh: false });
    return session;
  }

  // ---------- 本編 ----------
  async beginPlay({ ranked, launchId, name = '', playId = null, seed = null, secret = null, requestId = null }) {
    const meta = {
      playId: ranked ? playId : uuid(),
      launchId,
      ranked,
      name: ranked ? name : '',
      requestId,
      seed: ranked ? seed : randomSeed(),
      gameVersion: this.runtime.gameVersion,
      assetVersion: this.runtime.assetVersion,
      startedAt: Date.now(),
    };
    const session = new GameSession(meta);
    this.playSecret = secret;
    this.memoryOnly = false;
    this.takenOver = false;
    this.saveWarned = false;
    try {
      this.generation = await this.store.beginRun(TAB_ID, session.snapshot());
    } catch (err) {
      if (err?.code === 'active_run_exists') {
        await this.settleSavedRun();
        this.generation = await this.store.beginRun(TAB_ID, session.snapshot()).catch(() => 0);
      }
      if (!this.generation) {
        this.memoryOnly = true;
        this.notices.push('notice.saveFailed');
      }
    }
    // 実際に本編を始めた：開始通知を端末へ保存してから送る（名前ありの開始予約だけでは数えない）
    try {
      await recordLaunch(this.store, { launchId, ranked, playId: ranked ? playId : null, secret: ranked ? secret : null, gameVersion: this.runtime.gameVersion });
    } catch {
      if (!ranked) this.notices.push('notice.launchNotSaved');
    }
    flushLaunches(this.api, this.store).catch(() => {});
    await this.showGame(session, { fresh: true });
  }

  async resumeSaved() {
    await this.audio.prepare();
    const claimed = await this.store.claimRun(TAB_ID).catch(() => null);
    if (!claimed) {
      this.savedRun = null;
      this.showHome();
      return;
    }
    const r = GameSession.fromSnapshot(claimed.snapshot);
    if (r.error) {
      await this.store.quarantineRun(r.error).catch(() => {});
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
    if (r.session.meta.ranked && r.session.meta.requestId) {
      const start = await this.store.getOne('starts', r.session.meta.requestId).catch(() => null);
      this.playSecret = start?.secret ?? null;
    }
    await this.showGame(r.session, { fresh: false });
  }

  async showGame(session, { fresh }) {
    this.session = session;
    this.setMenuMusic(null); // 本編の曲は、時計が動き始めた時に流す
    const rules = RULES_V1;
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
    const controls = createControls({
      onChange: (c) => session.input(c, performance.now()),
      onLockedTap: () => {
        this.audio.play('locked');
        toast(banner, t('controls.lockedHint'), { duration: 1400 });
      },
    });
    const el = h('main', { class: 'screen game' }, [h('div', { class: 'stage-wrap' }, [stageBox, hud, switchOk, matchWord, banner, cover]), controls.el]);
    this.mount(el, null);
    this.controls = controls;
    controls.layout();
    controls.setValues(session.state.color);
    controls.setLocked(!session.state.brightnessUnlocked);
    controls.setEnabled(false); // 時計が動くまで操作しない（表示と判定の色をずらさない）
    this.stage = await createStage(stageBox, { course: session.game.course, decorations, rules, showOpeningShop: fresh && !this.flags.openingSeen });
    requestAnimationFrame(() => {
      controls.layout();
      this.stage.resize();
    });

    const alertStage = createAlertStageTracker(rules);
    const instant = createInstantSuccessTracker({ rules });
    let lastSaveT = session.state.t;
    let lastStage = 0;
    let lastCombo = session.state.combo ?? 0;
    {
      const b0 = Math.min(rules.buildingCount, Math.floor(session.state.t / rules.buildingMs) + 1);
      this.audio.setArea(areaOf(b0).time);
      this.audio.setFinale(b0 >= 40);
    }
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

    session.on((events) => {
      for (const ev of events) {
        switch (ev.type) {
          case 'evalEnd':
            if (ev.building < rules.buildingCount) this.audio.play('switchOk');
            break;
          case 'unlockBrightness':
            controls.setLocked(false);
            this.audio.play('unlock');
            this.stage?.fx('unlock');
            toast(banner, t('game.unlocked'), { duration: 2600, kind: 'big' });
            break;
          case 'reachUnlockBuilding':
            this.setFlag('brightnessPractice', true);
            break;
          case 'enterBuilding':
            if (ev.building === rules.brightnessUnlockBuilding - 1) toast(banner, t('game.unlockSoon'), { duration: 2200 });
            this.audio.setArea(areaOf(Math.min(rules.buildingCount, ev.building)).time);
            this.audio.setFinale(ev.building >= 40);
            if (ev.building === 40) {
              toast(banner, t('game.milestone.final'), { duration: 1600 });
              this.audio.play('milestone');
              this.stage?.fx('milestone');
            }
            break;
          case 'pass':
            if (ev.building === 25) {
              // 25棟目の通過＝中間地点（仕様 FX-03）
              toast(banner, t('game.milestone.half'), { duration: 1600 });
              this.audio.play('milestone');
              this.stage?.fx('milestone');
            }
            if (ev.success && [3, 5, 10].includes(ev.combo)) {
              this.audio.play('combo', { level: [3, 5, 10].indexOf(ev.combo) });
              this.stage?.fx('combo');
              toast(banner, t('game.comboMilestone', { n: ev.combo }), { duration: 1400, kind: 'combo' });
            } else if (ev.success && ev.combo > 1) {
              this.stage?.fx('pass');
              toast(banner, t('game.combo', { n: ev.combo }), { duration: 900 });
            } else if (ev.success) {
              this.stage?.fx('pass');
            } else if (lastCombo >= 2) {
              this.audio.play('comboBreak'); // 連続成功が途切れた
            }
            lastCombo = ev.success ? ev.combo : 0;
            if (ev.points > 0) {
              hudGain.textContent = `+${formatNumber(ev.points)}`;
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
            if (ev.reason === 'stall') this.showPause('stall');
            break;
          default:
        }
      }
    });

    const loop = () => {
      if (this.session !== session) return;
      const now = performance.now();
      if (session.running) {
        session.frame(now);
        if (session.state.t - lastSaveT >= SAVE_INTERVAL_MS) {
          lastSaveT = session.state.t;
          this.saveNow('interval');
        }
      }
      const s = session.state;
      const stage = alertStage.update(s.alert);
      if (stage > lastStage) {
        // 1人目は警告音、2人目は笛
        this.audio.play(stage >= 2 ? 'whistle' : 'warning');
        pulse(gaugeIcon, 'ring');
        if (!this.flags.alertGuideSeen) {
          this.setFlag('alertGuideSeen', true);
          toast(banner, t('guide.alert'), { duration: 3000 });
        }
      }
      if (s.alert > 0 && !this.flags.alertGuideSeen) {
        this.setFlag('alertGuideSeen', true);
        toast(banner, t('guide.alert'), { duration: 3000 });
      }
      if (stage < lastStage && session.running) this.audio.play('relief'); // 警察が離れた
      lastStage = stage;
      this.audio.setPoliceStage(session.running ? stage : 0);
      this.audio.setDanger(session.running && s.alert >= rules.alert.maxUnits * 0.7);
      if (instant.update(s)) {
        this.audio.play('success');
        this.stage?.fx('success');
      }
      refreshHud();
      const matchState = s.matchUnits == null ? null : classifyMatch(s.matchUnits);
      this.stage?.update({ t: s.t, color: s.color, policeStage: stage, searching: matchState === 'success' && stage > 0, nervous: stage / 2, walking: session.running, matchState });
      this.raf = requestAnimationFrame(loop);
    };

    pauseBtn.addEventListener('click', () => {
      this.audio.play('select');
      if (session.pause('user')) {
        this.saveNow('pause');
        this.showPause('user');
      }
    });
    this.coverEl = cover;
    refreshHud();
    this.raf = requestAnimationFrame(loop);

    if (fresh) {
      if (!this.flags.openingSeen) {
        await this.playOpening();
        await this.setFlag('openingSeen', true);
      }
      if (!this.flags.guideSeen) {
        await this.showGuideCard();
        await this.setFlag('guideSeen', true);
      }
      if (this.session !== session) return;
      controls.setValues(session.state.color);
      controls.setEnabled(true);
      this.audio.startGameAudio();
      session.startClock(performance.now());
    } else {
      this.showPause('restored');
    }
  }

  async playOpening() {
    const ctrl = new AbortController();
    const skip = button('common.skip', () => ctrl.abort(), { className: 'btn-skip', testid: 'skip-opening' });
    this.layer.append(skip);
    await this.stage.playOpening({ signal: ctrl.signal, onCue: (name) => this.audio.play(name) });
    skip.remove();
  }

  showGuideCard() {
    return new Promise((resolve) => {
      dialog(this.layer, {
        titleKey: 'guide.title',
        body: h('ul', { class: 'guide-list' }, ['guide.goal', 'guide.palette', 'guide.grace', 'guide.alertShort', 'guide.bar'].map((k) => h('li', {}, t(k)))),
        actions: [{ key: 'guide.go', primary: true, testid: 'guide-go', onClick: resolve }],
        className: 'guide',
      });
    });
  }

  /** 停止画面。壁を覆い、音・入力・時計を止める。 */
  showPause(reason) {
    const session = this.session;
    if (!session) return;
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
      button('pause.sound', () => this.showPauseSettings(panel), { testid: 'pause-sound' }),
      button('pause.restart', () => this.confirmQuit('restart'), { testid: 'pause-restart' }),
      button('pause.home', () => this.confirmQuit('home'), { testid: 'pause-home' }),
    ]);
    this.layer.append(h('div', { class: 'pause-overlay' }, [panel]));
  }

  showPauseSettings(panel) {
    const box = h('div', { class: 'pause-settings' }, [
      audioSettings({ mixer: this.audio, onChange: (c) => this.safeSet('audio', this.audio.setSettings(c)) }),
      languageSelect({ onChange: (id) => this.changeLanguage(id, () => this.showPause('user')) }),
    ]);
    panel.append(box);
  }

  confirmQuit(next) {
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
    await this.audio.prepare();
    clear(this.layer);
    const num = h('div', { class: 'countdown', 'data-testid': 'countdown' });
    this.layer.append(h('div', { class: 'pause-overlay countdown-overlay' }, [num]));
    const total = RULES_V1.resumeCountdownMs;
    const started = performance.now();
    this.countdownActive = true;
    await new Promise((resolve) => {
      let lastShown = -1;
      const tick = () => {
        if (this.session !== session || !this.countdownActive) return resolve();
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
    if (this.session !== session || !this.countdownActive) return;
    this.countdownActive = false;
    if (document.visibilityState === 'hidden') {
      this.showPause('user');
      return;
    }
    clear(this.layer);
    if (this.coverEl) this.coverEl.hidden = true;
    this.controls.releaseAll(); // 持ち越しのタッチを捨てる
    this.controls.setEnabled(true);
    this.audio.startGameAudio();
    this.audio.play('go');
    session.startClock(performance.now());
  }

  onVisibility() {
    if (document.visibilityState !== 'hidden') return;
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
    clear(this.layer);
    dialog(this.layer, { titleKey: 'notice.takenOverTitle', bodyKey: 'notice.takenOver', actions: [{ key: 'common.home', primary: true, onClick: () => this.leaveGame() }] });
  }

  leaveGame() {
    this.session = null;
    this.showHome();
  }

  /** 終了の確定：結果と履歴を端末へ先に保存してから、演出と送信を行う。 */
  async persistEnd(session, generation, { takenOver = false } = {}) {
    const summary = session.summary();
    const snap = session.snapshot();
    let result;
    let secret = this.playSecret;
    if (session.meta.ranked && !secret && session.meta.requestId) {
      secret = (await this.store.getOne('starts', session.meta.requestId).catch(() => null))?.secret ?? null;
    }
    if (session.meta.ranked && secret) {
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
      await this.store.endRun(TAB_ID, generation, result, { localBest });
      return { result, saved: true, newBest: !!localBest };
    } catch (err) {
      return { result, saved: false, stale: err instanceof StaleWriterError };
    }
  }

  async finishPlay(reason) {
    const session = this.session;
    if (!session || this.finishing === session) return;
    this.finishing = session;
    this.controls?.setEnabled(false);
    this.audio.stopGameAudio();
    const { result, saved, stale, newBest = false } = await this.persistEnd(session, this.generation, { takenOver: this.takenOver });
    const summary = session.summary();
    this.lastResult = { playId: session.meta.playId, ranked: session.meta.ranked, name: session.meta.name, summary, saved, stale, newBest, netState: session.meta.ranked ? 'pending' : null };
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
    this.audio.play(reason === 'detected' ? 'detected' : reason === 'cleared' ? 'clear' : 'back');
    const ctrl = new AbortController();
    clear(this.layer);
    const skip = button('common.skip', () => ctrl.abort(), { className: 'btn-skip', testid: 'skip-ending' });
    this.layer.append(skip);
    await this.stage?.playEnding(reason, { signal: ctrl.signal });
    skip.remove();
    this.session = null;
    this.showResult();
    this.flushNetwork().then(() => this.pollResult());
  }

  async sendUnsaved(item) {
    if (!this.api.configured) return;
    try {
      const receipt = await sendOne(this.api, item);
      if (this.lastResult?.playId === item.playId) {
        this.lastResult.netState = receipt.status;
        this.renderResultStatus?.();
      }
    } catch {
      if (this.lastResult?.playId === item.playId) {
        this.lastResult.netState = 'retryable_failed';
        this.renderResultStatus?.();
      }
    }
  }

  async pollResult() {
    const r = this.lastResult;
    if (!r?.ranked || !this.api.configured) return;
    for (let i = 0; i < 6; i += 1) {
      const rec = await this.store.getOne('records', r.playId).catch(() => null);
      if (rec) {
        r.netState = rec.status;
        r.official = rec.official;
        this.renderResultStatus?.();
        if (rec.status !== 'verifying') break;
      }
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
      await this.refreshStatuses();
    }
    if (r.netState === 'official') {
      try {
        const mine = await this.api.post('rank', { name: r.name });
        r.officialRank = mine.rank;
      } catch {
        r.rankError = true;
      }
      this.renderResultStatus?.();
    }
  }

  // ---------- 結果 ----------
  showResult() {
    this.disposeStage();
    const r = this.lastResult;
    const s = r.summary;
    const reasonKey = { detected: 'result.detected', cleared: 'result.cleared', quit: 'result.quit' }[s.endReason];
    const statusBox = h('div', { class: 'result-status', 'aria-live': 'polite' });
    const rankingHost = h('div', { class: 'result-ranking' });
    this.renderResultStatus = () => {
      clear(statusBox);
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
      if (r.netState === 'official' && r.officialRank != null) statusBox.append(h('p', { class: 'result-rank' }, t('result.rank', { rank: formatNumber(r.officialRank) })));
      if (r.rankError) statusBox.append(h('p', {}, [t('result.rankError'), ' ', button('common.retry', () => this.pollResult(), { className: 'btn-small' })]));
    };
    this.renderResultStatus();
    const localBests = h('p', { class: r.newBest ? 'result-best result-best-new' : 'result-best' });
    this.safeGet('localBest').then((all) => {
      const b = all?.[r.name || ''];
      if (b) localBests.textContent = t('result.localBest', { buildings: formatNumber(b.buildings), average: formatPercent2(b.rankAverage) });
    });
    const breakdown = h('dl', { class: 'breakdown' }, [
      h('dt', {}, t('result.score.pass')),
      h('dd', {}, formatNumber(s.score.pass)),
      h('dt', {}, t('result.score.accuracy')),
      h('dd', {}, formatNumber(s.score.accuracy)),
      h('dt', {}, t('result.score.combo')),
      h('dd', {}, formatNumber(s.score.combo)),
      h('dt', {}, t('result.score.clear')),
      h('dd', {}, formatNumber(s.score.clear)),
    ]);
    const el = h('main', { class: `screen result result-screen-${s.endReason}` }, [
      h('div', { class: 'result-burst', 'aria-hidden': 'true' }),
      h('h1', { class: `result-title result-${s.endReason}` }, t(reasonKey)),
      h('div', { class: 'result-main' }, [
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.buildings')), h('span', { class: 'stat-value', 'data-testid': 'result-buildings' }, `${formatNumber(s.buildings)} / ${RULES_V1.buildingCount}`)]),
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.average')), h('span', { class: 'stat-value', 'data-testid': 'result-average' }, s.rankAverage == null ? '—' : formatPercent2(s.rankAverage))]),
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.total')), h('span', { class: 'stat-value', 'data-testid': 'result-score' }, formatNumber(s.score.total))]),
        h('div', { class: 'stat' }, [h('span', { class: 'stat-label' }, t('result.maxCombo')), h('span', { class: 'stat-value' }, formatNumber(s.maxCombo))]),
      ]),
      breakdown,
      h('p', { class: 'note' }, t('result.roundingNote')),
      r.name ? h('p', { class: 'result-name' }, [t('result.nameLabel'), ' ', isolatedText(r.name)]) : null,
      localBests,
      statusBox,
      h('div', { class: 'result-actions' }, [
        button('result.again', () => this.startFlow(this.nameRaw), { primary: true, testid: 'result-again' }),
        button('common.home', () => this.showHome(), { testid: 'result-home' }),
        button('home.ranking', () => this.showRanking(), {}),
        button('share.button', () => this.shareResult(), { className: 'btn-x', testid: 'result-share' }),
      ]),
      rankingHost,
    ]);
    this.mount(el, () => this.showResult());
    this.audio.play('result');
    if (r.newBest && !r.bestPlayed) {
      r.bestPlayed = true; // 言語を切り替えて描き直しても、もう一度は鳴らさない
      setTimeout(() => this.audio.play('best'), 700);
    }
    if (this.api.configured) {
      const view = createRankingView({ api: this.api, name: null });
      rankingHost.append(h('h2', { class: 'panel-title' }, t('ranking.top')), view.el);
      view.load();
    }
  }

  async shareResult() {
    const r = this.lastResult;
    const text = buildResultShareText({ result: { buildings: r.summary.buildings, rankAverage: r.summary.rankAverage, endReason: r.summary.endReason }, officialRank: r.netState === 'official' ? r.officialRank : null, lang: getLanguage() });
    const mode = await shareToX({ text, url: this.runtime.publicUrl });
    if (mode !== 'opened') this.showShareFallback(text, mode);
  }

  // ---------- 練習 ----------
  async showPracticeMenu() {
    this.disposeStage();
    const unlocked = !!this.flags.brightnessPractice;
    const history = await this.store.listPractice().catch(() => []);
    const historyList = h(
      'ul',
      { class: 'practice-history' },
      history.map((p) =>
        h('li', {}, [
          h('strong', {}, t(`practice.kind.${p.kind}`)),
          ' ',
          new Date(p.completedAt).toLocaleString(),
          ' ',
          p.questions.map((q) => (q.status === 'succeeded' ? '○' : '—')).join(' '),
        ]),
      ),
    );
    const el = h('main', { class: 'screen practice-menu' }, [
      h('h1', {}, t('practice.title')),
      h('p', { class: 'note' }, t('practice.intro')),
      button('practice.kind.basic', () => this.startPractice('basic'), { primary: true, testid: 'practice-basic' }),
      button(unlocked ? 'practice.kind.brightness' : 'practice.brightnessLocked', () => this.startPractice('brightness'), { disabled: !unlocked, testid: 'practice-brightness' }),
      section('practice.history', [history.length ? historyList : h('p', { class: 'note' }, t('practice.noHistory'))]),
      backButton(() => this.showHome()),
    ]);
    this.mount(el, () => this.showPracticeMenu());
  }

  async startPractice(kind) {
    await this.audio.prepare();
    this.audio.play('confirm');
    const practice = createPractice({ kind, seed: randomSeed() });
    this.setMenuMusic('practice');
    let showValue = false;
    let paused = false;
    let reviewing = false;
    const stageBox = h('div', { class: 'stage', 'data-testid': 'stage' });
    const counter = h('span', { class: 'practice-counter', 'data-testid': 'practice-counter' });
    const difficulty = h('span', { class: 'practice-difficulty' });
    const valueEl = h('span', { class: 'practice-value', hidden: true, 'data-testid': 'practice-value' });
    const state = h('div', { class: 'match-word practice-state', 'aria-live': 'polite' });
    const toggle = button('practice.showValue', () => {
      showValue = !showValue;
      valueEl.hidden = !showValue;
      toggle.textContent = t(showValue ? 'practice.hideValue' : 'practice.showValue');
    }, { className: 'btn-small', testid: 'practice-toggle' });
    const exit = button('practice.exit', () => {
      if (!practice.touched) return this.showPracticeMenu();
      paused = true;
      dialog(this.layer, {
        titleKey: 'practice.exitTitle',
        bodyKey: 'practice.exitBody',
        actions: [
          { key: 'practice.keepGoing', primary: true, onClick: () => (paused = false) },
          { key: 'practice.exitConfirm', danger: true, onClick: () => this.showPracticeMenu() },
        ],
      });
    }, { className: 'btn-small', testid: 'practice-exit' });
    const skipBtn = button('practice.skip', () => onSkip(), { testid: 'practice-skip' });
    const nextBtn = button('practice.next', () => onNext(), { primary: true, testid: 'practice-next' });
    const review = h('div', { class: 'practice-review', hidden: true });
    const controls = createControls({ onChange: (c) => practice.setColor(c), onLockedTap: () => this.audio.play('locked') });
    const el = h('main', { class: 'screen game practice' }, [
      h('div', { class: 'stage-wrap' }, [
        stageBox,
        h('div', { class: 'hud' }, [h('div', { class: 'hud-left' }, [counter, difficulty]), valueEl, h('div', { class: 'hud-right' }, [toggle, exit])]),
        state,
        review,
      ]),
      h('div', { class: 'practice-actions' }, [skipBtn, nextBtn]),
      controls.el,
    ]);
    this.mount(el, null);
    controls.layout();
    controls.setValues(practice.color);
    controls.setLocked(kind === 'basic');
    this.stage = await createStage(stageBox, { course: { targets: [practice.question.target] }, decorations: [{ heightScale: 100, kind: 'house', windows: 2, trimTone: 0, sign: -1 }] });
    this.stage.showPractice(practice.question.target);
    requestAnimationFrame(() => {
      controls.layout();
      this.stage.resize();
    });

    const refresh = () => {
      const q = practice.question;
      counter.textContent = t('practice.counter', { n: q.number, total: 3 });
      difficulty.textContent = t(`practice.difficulty.${q.difficulty}`);
      const m = practice.currentMatch();
      valueEl.textContent = t('practice.value', { value: formatMatch(m), best: formatMatch(q.bestMatch) });
      state.textContent = q.status === 'succeeded' ? t('practice.success') : t(matchWordKey(m));
      state.dataset.state = q.status === 'succeeded' ? 'success' : classifyMatch(m);
      skipBtn.disabled = q.status !== 'active' || reviewing;
      nextBtn.disabled = q.status === 'active' && !reviewing;
      nextBtn.textContent = t(q.number === 3 ? 'practice.seeResult' : 'practice.next');
    };
    const onSkip = () => {
      if (!practice.skip()) return;
      this.audio.play('back');
      reviewing = true;
      const q = practice.question;
      clear(review);
      review.append(
        h('h3', {}, t('practice.reviewTitle')),
        h('div', { class: 'swatches' }, [
          h('div', { class: 'swatch-box' }, [h('div', { class: 'swatch', style: { background: hsvToHex(q.target) } }), h('span', {}, t('practice.target'))]),
          h('div', { class: 'swatch-box' }, [h('div', { class: 'swatch', style: { background: hsvToHex(q.lastColor) } }), h('span', {}, t('practice.lastColor'))]),
        ]),
        h('p', {}, t('practice.lastMatch', { value: formatMatch(q.lastMatch) })),
      );
      review.hidden = false;
      controls.setEnabled(false);
      refresh();
    };
    const onNext = () => {
      if (!practice.next()) return;
      this.audio.play('confirm');
      reviewing = false;
      review.hidden = true;
      controls.setEnabled(true);
      if (practice.finished) {
        this.finishPractice(practice);
        return;
      }
      this.stage.showPractice(practice.question.target);
      refresh();
    };
    let last = performance.now();
    let wasSucceeded = false;
    const loop = () => {
      if (!el.isConnected) return;
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (!paused && !reviewing && document.visibilityState === 'visible') practice.tick(Math.min(dt, 250));
      if (practice.question.status === 'succeeded' && !wasSucceeded) {
        this.audio.play('success');
        this.stage.fx('success');
      }
      wasSucceeded = practice.question.status === 'succeeded';
      refresh();
      this.stage.renderPractice(practice.color, practice.question.target);
      this.raf = requestAnimationFrame(loop);
    };
    refresh();
    this.raf = requestAnimationFrame(loop);
  }

  async finishPractice(practice) {
    const result = practice.result();
    await this.store.addPractice(result).catch(() => {});
    this.disposeStage();
    const rows = result.questions.map((q) =>
      h('tr', {}, [
        h('td', {}, String(q.number)),
        h('td', {}, t(q.status === 'succeeded' ? 'practice.result.success' : 'practice.result.skipped')),
        h('td', {}, formatMatch(q.bestMatch)),
        h('td', {}, q.firstSuccessMs == null ? '—' : formatSeconds(q.firstSuccessMs)),
      ]),
    );
    const el = h('main', { class: 'screen practice-result' }, [
      h('h1', {}, t('practice.resultTitle')),
      h('table', { class: 'practice-table' }, [
        h('thead', {}, [h('tr', {}, ['#', t('practice.result.status'), t('practice.result.best'), t('practice.result.time')].map((x) => h('th', {}, x)))]),
        h('tbody', {}, rows),
      ]),
      h('div', { class: 'result-actions' }, [
        button('practice.again', () => this.startPractice(practice.kind), { primary: true }),
        button('practice.toMain', () => this.startFlow(this.nameRaw)),
        button('common.home', () => this.showHome()),
      ]),
    ]);
    this.mount(el, null);
    this.audio.play('result');
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
    const view = createRecordsView({
      store: this.store,
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
      h('h1', {}, t('records.title')),
      h('p', { class: 'note' }, t('records.intro')),
      button('records.refresh', async () => {
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
      section('settings.languageTitle', [languageSelect({ onChange: (id) => this.changeLanguage(id, () => this.showSettings()) })]),
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
    setLanguage(id);
    const ok = await this.safeSet('lang', id);
    if (!ok) toast(this.layer, t('settings.langNotSaved'));
    after?.();
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
    this.stage = await createStage(stageBox, { course: { targets: Array.from({ length: 50 }, () => ({ h: 3000, s: 5000, v: 10000 })) }, decorations: makeDecorations(1), showOpeningShop: true });
    this.stage.resize();
    await this.playOpening();
    this.showHowTo();
  }

  /** ホームの立体のカメレオン（WebGL が使えない時は CSS の絵のまま）。 */
  async mountShowcase(host) {
    const token = (this.showcaseToken = {});
    try {
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
      const { createShowcase } = await import('./scene/showcase.js');
      if (this.showcaseToken !== token || !host.isConnected) return;
      clear(host);
      host.classList.add('home-art-3d');
      this.showcase = createShowcase(host);
    } catch {
      /* 絵のまま */
    }
  }

  disposeStage() {
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
  const app = new App(root);
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
