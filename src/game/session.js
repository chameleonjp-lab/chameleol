// 本編1プレイの進行役。実時間（performance.now）からゲーム内時刻を求め、判定エンジンへ渡す。
// - 画面の更新回数ではなく、時刻で進める。入力はその瞬間のゲーム内時刻で処理する。
// - 長い処理停止（rules.longStallMs 超）は時間を進めず、自動停止にする。
// - 停止中・再開カウントダウン中は時計が止まり、入力も受け付けない。
import {
  RULES_V1,
  advance,
  createGame,
  createRecorder,
  initialState,
  summarize,
  stateFromHistory,
} from '../rules/v1/index.js';

export const SNAPSHOT_FORMAT = 'kamereoru-run-v1';

export class GameSession {
  /**
   * @param {object} meta { playId, launchId, ranked, name, seed, rulesVersion, generatorVersion, gameVersion, startedAt }
   */
  constructor(meta, { rules = RULES_V1, restore = null } = {}) {
    if (meta.rulesVersion && meta.rulesVersion !== rules.rulesVersion) throw new Error('rules version mismatch');
    this.meta = Object.freeze({ ...meta, rulesVersion: rules.rulesVersion, generatorVersion: rules.generatorVersion });
    this.rules = rules;
    this.game = createGame({ seed: meta.seed, rules });
    this.recorder = createRecorder(rules);
    this.state = initialState(this.game);
    if (restore) {
      this.recorder.restore(restore.history);
      this.state = restore.state;
    }
    this.running = false;
    this.pausedReason = 'notStarted';
    this.baseT = this.state.t;
    this.basePerf = 0;
    this.lastFramePerf = 0;
    this.listeners = new Set();
    this.saveSeq = 0;
    this.guideStopAt = null;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(events) {
    if (!events.length) return;
    for (const fn of this.listeners) fn(events, this.state);
  }

  get ended() {
    return this.state.status !== 'playing';
  }

  /** 時計を動かす（開始・再開カウントダウン後）。 */
  startClock(perfNow) {
    if (this.ended) return;
    const wasStarted = this.pausedReason !== 'notStarted';
    this.running = true;
    this.pausedReason = null;
    this.baseT = this.state.t;
    this.basePerf = perfNow;
    this.lastFramePerf = perfNow;
    if (wasStarted) this.record({ type: 'resume', t: this.state.t });
  }

  /** 停止。理由：'user'（停止ボタン）／'hidden'（画面離脱）／'stall'（長い処理停止）／'storage' など。 */
  pause(reason = 'user') {
    if (!this.running || this.ended) return false;
    this.running = false;
    this.pausedReason = reason;
    this.record({ type: 'pause', t: this.state.t });
    this.emit([{ type: 'paused', t: this.state.t, reason }]);
    return true;
  }

  isStalled(perfNow) {
    return perfNow - this.lastFramePerf > this.rules.longStallMs;
  }

  gameNow(perfNow) {
    if (!this.running) return this.state.t;
    return Math.max(this.state.t, this.baseT + Math.floor(perfNow - this.basePerf));
  }

  apply(event) {
    const r = advance(this.state, event, this.game);
    this.state = r.state;
    if (event.type !== 'tick') this.record(event);
    this.emit(r.events);
    return r.events;
  }

  record(event) {
    this.recorder.push(event);
  }

  setGuideStopAt(t) {
    this.guideStopAt = t === null ? null : Math.max(0, Math.floor(t));
  }

  stopAtGuide(perfNow) {
    if (this.guideStopAt === null || this.gameNow(perfNow) < this.guideStopAt) return false;
    this.apply({ type: 'tick', t: Math.max(this.state.t, this.guideStopAt) });
    this.pause('guide');
    return true;
  }

  /** 毎フレーム呼ぶ。 */
  frame(perfNow) {
    if (!this.running || this.ended) return [];
    if (this.isStalled(perfNow)) {
      this.pause('stall');
      return [];
    }
    this.lastFramePerf = perfNow;
    if (this.stopAtGuide(perfNow)) return [];
    return this.apply({ type: 'tick', t: this.gameNow(perfNow) });
  }

  /** 色の入力。猶予中も反映する（警戒と平均には入らない）。 */
  input(color, perfNow) {
    if (!this.running || this.ended) return false;
    if (this.isStalled(perfNow)) {
      this.pause('stall');
      return false;
    }
    if (this.stopAtGuide(perfNow)) return false;
    const c = this.state.brightnessUnlocked ? color : { ...color, v: this.rules.valMax };
    if (c.h === this.state.color.h && c.s === this.state.color.s && c.v === this.state.color.v) return true;
    this.apply({ type: 'color', t: this.gameNow(perfNow), h: c.h, s: c.s, v: c.v });
    return true;
  }

  /** 自分で途中終了する。停止中なら停止した時刻で終える。 */
  quit(perfNow = 0) {
    if (this.ended) return;
    if (this.running) {
      if (this.isStalled(perfNow)) this.pause('stall');
      else this.stopAtGuide(perfNow);
    }
    const t = this.running ? this.gameNow(perfNow) : this.state.t;
    this.running = false;
    this.apply({ type: 'quit', t });
  }

  summary() {
    return summarize(this.state, this.rules);
  }

  /** 保存単位。同じ時点の状態と履歴を1つにまとめる。 */
  snapshot() {
    this.saveSeq += 1;
    return {
      format: SNAPSHOT_FORMAT,
      meta: { ...this.meta },
      state: structuredClone(this.state),
      history: this.recorder.entries.map((e) => e.slice()),
      historyEndT: this.recorder.lastT,
      saveSeq: this.saveSeq,
    };
  }

  /** 保存単位から作り直す。状態と履歴が食い違えば null（保存を壊さず隔離する）。 */
  static fromSnapshot(snap, { rules = RULES_V1 } = {}) {
    if (!snap || snap.format !== SNAPSHOT_FORMAT) return { error: 'unknown_format' };
    if (snap.meta?.rulesVersion !== rules.rulesVersion) return { error: 'unknown_rules_version' };
    try {
      const game = createGame({ seed: snap.meta.seed, rules });
      const rebuilt = stateFromHistory(game, snap.history, snap.state.t);
      if (rebuilt.error) return { error: rebuilt.error };
      const a = summarize(rebuilt.state, rules);
      const b = summarize(snap.state, rules);
      if (JSON.stringify(a) !== JSON.stringify(b) || rebuilt.state.alert !== snap.state.alert) {
        return { error: 'inconsistent_snapshot' };
      }
      const session = new GameSession(snap.meta, { rules, restore: { state: rebuilt.state, history: snap.history } });
      session.pausedReason = 'restored';
      session.saveSeq = snap.saveSeq ?? 0;
      return { session };
    } catch (err) {
      return { error: 'corrupt_snapshot', detail: String(err?.message ?? err) };
    }
  }
}
