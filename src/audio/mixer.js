// 音。素材ファイルは使わず、Web Audio でその場で合成する（有償素材・外部素材なし）。
// - 音楽／効果音／環境音の3音量と全体消音。消音を解除すると設定済みの音量へ戻す（0は「未設定」と扱わない）。
// - 開始・再開などの明示的な操作で音声を準備する。使えない端末でもゲームは続く。
// - 一時停止・画面離脱で止め、復帰時に過去の足音や警告をまとめて鳴らさない。
// - 重要な通知の間は音楽・環境音を下げる。同じ成功音の連発を抑える。
// - 本編の音楽は10棟区切り（Tier 0〜4：1〜10, 11〜20, 21〜30, 31〜40, 41〜50棟）で伴奏・対旋律・アルペジオが段階的に豪華になり、
//   警察の人数でドラムが増え、41棟目〜で調が+2半音上がる。
//   曲そのものは別曲へ全面切り替えず一貫性を保つ（AUDIO-01）。判定・得点には一切関わらない。

export const DEFAULT_AUDIO = Object.freeze({ music: 0.45, sfx: 0.7, ambient: 0.35, muted: false });

/** 棟番号（1〜50）から、10棟区切りのBGM豪華さ段階（Tier 0〜4）を求める。 */
export function buildingTier(b) {
  const n = Math.max(1, Math.min(50, Math.floor(Number(b) || 1)));
  return Math.min(4, Math.floor((n - 1) / 10));
}

/** 保存値を検査し、欠けた値だけ初期値で補う（0や消音は有効な設定として残す）。 */
export function sanitizeAudioSettings(saved) {
  const out = { ...DEFAULT_AUDIO };
  if (saved && typeof saved === 'object') {
    for (const k of ['music', 'sfx', 'ambient']) {
      if (typeof saved[k] === 'number' && saved[k] >= 0 && saved[k] <= 1) out[k] = saved[k];
    }
    if (typeof saved.muted === 'boolean') out.muted = saved.muted;
  }
  return out;
}

// 出来事 → 音の役割・最短間隔・重要度・優先度（0: 装飾・軽微な操作音, 1: 通常伴奏・補助SE, 2: 主旋律・ベース・進行通知, 3: 重要警告・達成・終了）
export const SOUND_EVENTS = Object.freeze({
  footstep: { bus: 'sfx', minGapMs: 120, important: false, priority: 2, category: 'game-loop-sfx' },
  heartbeat: { bus: 'sfx', minGapMs: 300, important: false, priority: 2, category: 'game-loop-sfx' },
  warning: { bus: 'sfx', minGapMs: 1500, important: true, priority: 3, category: 'sfx' },
  whistle: { bus: 'sfx', minGapMs: 1500, important: true, priority: 3, category: 'sfx' },
  relief: { bus: 'sfx', minGapMs: 1500, important: false, priority: 2, category: 'sfx' },
  switchOk: { bus: 'sfx', minGapMs: 800, important: false, priority: 1, category: 'sfx' },
  success: { bus: 'sfx', minGapMs: 600, important: false, priority: 2, category: 'sfx' },
  combo: { bus: 'sfx', minGapMs: 400, important: true, priority: 3, category: 'sfx' },
  comboBreak: { bus: 'sfx', minGapMs: 1000, important: false, priority: 1, category: 'sfx' },
  milestone: { bus: 'sfx', minGapMs: 1000, important: true, priority: 3, category: 'sfx' },
  unlock: { bus: 'sfx', minGapMs: 1000, important: true, priority: 3, category: 'sfx' },
  locked: { bus: 'sfx', minGapMs: 400, important: false, priority: 0, category: 'sfx' },
  alarm: { bus: 'sfx', minGapMs: 2000, important: false, priority: 2, category: 'sfx' },
  jump: { bus: 'sfx', minGapMs: 200, important: false, priority: 1, category: 'sfx' },
  jewel: { bus: 'sfx', minGapMs: 400, important: false, priority: 2, category: 'sfx' },
  detected: { bus: 'sfx', minGapMs: 2000, important: true, priority: 3, category: 'sfx' },
  clear: { bus: 'sfx', minGapMs: 2000, important: true, priority: 3, category: 'sfx' },
  result: { bus: 'sfx', minGapMs: 1000, important: false, priority: 1, category: 'sfx' },
  best: { bus: 'sfx', minGapMs: 2000, important: false, priority: 2, category: 'sfx' },
  select: { bus: 'sfx', minGapMs: 60, important: false, priority: 0, category: 'sfx' },
  confirm: { bus: 'sfx', minGapMs: 60, important: false, priority: 0, category: 'sfx' },
  back: { bus: 'sfx', minGapMs: 60, important: false, priority: 0, category: 'sfx' },
  countdown: { bus: 'sfx', minGapMs: 300, important: false, priority: 1, category: 'sfx' },
  go: { bus: 'sfx', minGapMs: 300, important: false, priority: 2, category: 'sfx' },
  // --- 追加SE（11種：既存24種と合わせて全35種） ---
  glassBurst: { bus: 'sfx', minGapMs: 1000, important: false, priority: 2, category: 'sfx' },
  land: { bus: 'sfx', minGapMs: 250, important: false, priority: 2, category: 'sfx' },
  touchPalette: { bus: 'sfx', minGapMs: 70, important: false, priority: 0, category: 'sfx' },
  touchBar: { bus: 'sfx', minGapMs: 70, important: false, priority: 0, category: 'sfx' },
  colorStep: { bus: 'sfx', minGapMs: 65, important: false, priority: 0, category: 'sfx' },
  colorRelease: { bus: 'sfx', minGapMs: 90, important: false, priority: 1, category: 'sfx' },
  guideClear: { bus: 'sfx', minGapMs: 800, important: true, priority: 3, category: 'sfx' },
  passBuilding: { bus: 'sfx', minGapMs: 400, important: false, priority: 1, category: 'sfx' },
  policeSearch: { bus: 'sfx', minGapMs: 1800, important: false, priority: 2, category: 'sfx' },
  tierUp: { bus: 'sfx', minGapMs: 1000, important: true, priority: 3, category: 'sfx' },
  lastFive: { bus: 'sfx', minGapMs: 800, important: false, priority: 1, category: 'sfx' },
});

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

// ---------- 曲 ----------
// 1小節＝8分音符8個。0 は休み。chords は小節ごとの [根音, 'm'|'M'|'7']。
// counter は Tier 3（31〜40棟）以降で重なる対旋律。
const bar = (...n) => n;

const SONG_GAME_A = {
  chords: [[36, 'm'], [36, 'm'], [41, 'm'], [36, 'm'], [44, 'M'], [43, '7'], [36, 'm'], [43, '7']],
  melody: [
    bar(72, 0, 75, 0, 79, 0, 78, 79),
    bar(0, 0, 75, 72, 0, 0, 0, 0),
    bar(77, 0, 80, 0, 84, 0, 82, 80),
    bar(79, 0, 75, 72, 0, 0, 67, 0),
    bar(72, 0, 75, 0, 80, 0, 79, 80),
    bar(0, 0, 79, 77, 74, 0, 71, 0),
    bar(72, 75, 79, 84, 0, 82, 79, 0),
    bar(77, 0, 74, 0, 71, 0, 67, 0),
  ],
  counter: [
    bar(0, 60, 0, 63, 0, 67, 0, 0),
    bar(67, 65, 63, 0, 60, 0, 63, 67),
    bar(0, 65, 0, 68, 0, 72, 0, 0),
    bar(0, 67, 63, 60, 63, 67, 0, 0),
    bar(0, 68, 0, 72, 0, 75, 0, 0),
    bar(74, 0, 71, 0, 67, 0, 65, 0),
    bar(60, 0, 63, 0, 67, 0, 72, 0),
    bar(0, 67, 0, 65, 0, 62, 67, 71),
  ],
};

const SONG_GAME_B = {
  chords: [[39, 'M'], [34, 'M'], [36, 'm'], [44, 'M'], [39, 'M'], [34, 'M'], [44, 'M'], [43, '7']],
  melody: [
    bar(79, 0, 82, 0, 87, 0, 84, 82),
    bar(77, 0, 82, 0, 86, 0, 0, 0),
    bar(75, 0, 79, 0, 84, 0, 82, 79),
    bar(80, 0, 75, 0, 72, 0, 0, 0),
    bar(79, 82, 87, 0, 84, 0, 82, 0),
    bar(77, 0, 74, 0, 70, 0, 74, 77),
    bar(75, 0, 72, 0, 68, 0, 72, 0),
    bar(74, 0, 71, 0, 67, 0, 71, 74),
  ],
  counter: [
    bar(0, 67, 0, 70, 0, 75, 0, 70),
    bar(0, 65, 0, 70, 0, 74, 70, 65),
    bar(0, 63, 0, 67, 0, 72, 0, 67),
    bar(0, 68, 0, 63, 0, 60, 63, 68),
    bar(0, 67, 70, 75, 0, 72, 0, 70),
    bar(0, 65, 0, 62, 0, 58, 62, 65),
    bar(0, 63, 0, 60, 0, 56, 60, 63),
    bar(0, 62, 0, 59, 0, 55, 59, 62),
  ],
};

// Tier 2（21〜30棟）以降で加わる展開セクション C
const SONG_GAME_C = {
  chords: [[41, 'm'], [43, '7'], [36, 'm'], [44, 'M'], [41, 'm'], [43, '7'], [36, 'm'], [43, '7']],
  melody: [
    bar(80, 0, 84, 80, 77, 0, 80, 84),
    bar(83, 0, 79, 74, 77, 79, 83, 0),
    bar(84, 0, 79, 75, 72, 75, 79, 82),
    bar(80, 0, 84, 87, 84, 80, 75, 0),
    bar(77, 80, 84, 0, 89, 0, 86, 84),
    bar(83, 79, 74, 79, 83, 86, 84, 83),
    bar(84, 0, 79, 0, 75, 72, 75, 79),
    bar(77, 74, 71, 67, 71, 74, 79, 0),
  ],
  counter: [
    bar(65, 0, 68, 0, 72, 68, 65, 0),
    bar(67, 0, 71, 0, 74, 71, 67, 0),
    bar(60, 63, 67, 0, 72, 0, 67, 63),
    bar(68, 0, 72, 0, 75, 72, 68, 0),
    bar(65, 0, 68, 72, 0, 77, 72, 68),
    bar(67, 0, 71, 74, 0, 79, 74, 71),
    bar(60, 0, 67, 0, 72, 0, 67, 0),
    bar(67, 0, 65, 0, 62, 0, 67, 71),
  ],
};

const SONG_MENU = {
  chords: [[36, 'M'], [33, 'm'], [41, 'M'], [43, 'M'], [36, 'M'], [33, 'm'], [41, 'M'], [43, '7']],
  melody: [
    bar(76, 0, 79, 0, 84, 0, 83, 79),
    bar(81, 0, 76, 0, 72, 0, 0, 0),
    bar(77, 0, 81, 0, 84, 0, 81, 77),
    bar(79, 0, 74, 0, 71, 0, 74, 0),
    bar(76, 79, 84, 0, 88, 0, 86, 84),
    bar(81, 0, 84, 0, 81, 0, 76, 0),
    bar(77, 0, 76, 0, 74, 0, 72, 0),
    bar(74, 0, 71, 0, 67, 0, 0, 0),
  ],
};

const SONG_PRACTICE = {
  chords: [[36, 'M'], [41, 'M'], [33, 'm'], [43, 'M'], [36, 'M'], [41, 'M'], [38, 'm'], [43, '7']],
  melody: [
    bar(72, 0, 76, 79, 0, 76, 72, 0),
    bar(77, 0, 81, 84, 0, 81, 77, 0),
    bar(76, 0, 79, 81, 0, 79, 76, 72),
    bar(74, 0, 79, 0, 74, 0, 0, 0),
    bar(76, 0, 79, 84, 0, 83, 79, 76),
    bar(77, 0, 81, 84, 0, 81, 77, 74),
    bar(74, 77, 81, 0, 79, 76, 72, 0),
    bar(71, 0, 74, 79, 0, 0, 0, 0),
  ],
};

// 10棟区切り（Tier 0〜4）ごとのセクション配列
const GAME_TIER_SECTIONS = Object.freeze([
  [SONG_GAME_A, SONG_GAME_A, SONG_GAME_B, SONG_GAME_A], // Tier 0: 1〜10棟
  [SONG_GAME_A, SONG_GAME_A, SONG_GAME_B, SONG_GAME_A], // Tier 1: 11〜20棟
  [SONG_GAME_A, SONG_GAME_B, SONG_GAME_C, SONG_GAME_A], // Tier 2: 21〜30棟
  [SONG_GAME_A, SONG_GAME_B, SONG_GAME_C, SONG_GAME_B], // Tier 3: 31〜40棟
  [SONG_GAME_A, SONG_GAME_B, SONG_GAME_C, SONG_GAME_C], // Tier 4: 41〜50棟
]);

export const MUSIC_THEMES = Object.freeze({
  game: { bpm: 126, sections: [SONG_GAME_A, SONG_GAME_A, SONG_GAME_B, SONG_GAME_A], lead: 'square', level: 1, drums: true, reactive: true },
  menu: { bpm: 92, sections: [SONG_MENU], lead: 'triangle', level: 0.8, drums: false, reactive: false },
  practice: { bpm: 86, sections: [SONG_PRACTICE], lead: 'sine', level: 0.65, drums: false, reactive: false },
});

const THIRD = { m: 3, M: 4, 7: 4 };
const SEVENTH = { m: 10, M: 11, 7: 10 };

// 同一時刻の同時発音数の目安上限（24）とハード上限（32）、予約保持数の目安上限（64）とハード上限（80）
export const MAX_CONCURRENT_VOICES = 24;
export const HARD_CONCURRENT_VOICES = 32;
export const MAX_SCHEDULED_VOICES = 64;
export const HARD_SCHEDULED_VOICES = 80;

export function createMixer({ AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  let ctx = null;
  let master;
  const bus = {};
  const duck = {};
  let settings = { ...DEFAULT_AUDIO };
  let theme = null; // 流している曲の名前（null は無音）
  let gameOn = false; // 本編の音（足音・心拍・環境音）を流す間
  let ambientNode = null;
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let activeStepIndex = null;
  let policeStage = 0;
  let danger = false;
  let finale = false;
  let currentBuilding = 1;
  let musicTier = 0; // 0: 1〜10棟, 1: 11〜20棟, 2: 21〜30棟, 3: 31〜40棟, 4: 41〜50棟
  let nextStepTime = 0;
  let nextBeatTime = 0;
  let nextBirdTime = 0;
  let area = 'day';
  const lastPlayed = new Map();
  const activeVoices = new Set();
  let failed = false;

  function ensure() {
    if (ctx || failed) return ctx;
    if (!AudioContextImpl) {
      failed = true;
      return null;
    }
    try {
      ctx = new AudioContextImpl();
      master = ctx.createGain();
      if (typeof ctx.createDynamicsCompressor === 'function') {
        try {
          const comp = ctx.createDynamicsCompressor();
          comp.threshold?.setValueAtTime?.(-6, ctx.currentTime);
          comp.knee?.setValueAtTime?.(12, ctx.currentTime);
          comp.ratio?.setValueAtTime?.(4, ctx.currentTime);
          comp.attack?.setValueAtTime?.(0.005, ctx.currentTime);
          comp.release?.setValueAtTime?.(0.15, ctx.currentTime);
          master.connect(comp);
          comp.connect(ctx.destination);
        } catch {
          master.connect(ctx.destination);
        }
      } else {
        master.connect(ctx.destination);
      }
      for (const name of ['music', 'sfx', 'ambient']) {
        duck[name] = ctx.createGain();
        bus[name] = ctx.createGain();
        bus[name].connect(duck[name]);
        duck[name].connect(master);
      }
      applyGains();
    } catch {
      failed = true;
      ctx = null;
    }
    return ctx;
  }

  function applyGains() {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(settings.muted ? 0 : 1, now, 0.02);
    for (const name of ['music', 'sfx', 'ambient']) bus[name].gain.setTargetAtTime(settings[name], now, 0.02);
  }

  function disconnectVoiceNodes(v) {
    if (v.cleanedUp) return;
    v.cleanedUp = true;
    for (const ex of v.extraNodes || []) {
      try {
        ex.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    try {
      v.node?.disconnect?.();
    } catch {
      /* ignore */
    }
    try {
      v.gain?.disconnect?.();
    } catch {
      /* ignore */
    }
  }

  function forceStopVoice(v) {
    activeVoices.delete(v);
    try {
      v.node?.stop?.();
    } catch {
      /* already stopped */
    }
    for (const ex of v.extraNodes || []) {
      try {
        ex.stop?.();
      } catch {
        /* ignore */
      }
    }
    disconnectVoiceNodes(v);
  }

  function pruneExpiredVoices(now = ctx ? ctx.currentTime : 0) {
    for (const v of [...activeVoices]) {
      if (v.stopTime <= now) {
        activeVoices.delete(v);
        disconnectVoiceNodes(v);
      }
    }
  }

  /**
   * 新しい音を受け付ける前に、自然終了分を掃除し、同時発音数と予約保持数の上限を検査・間引きする。
   * - priority <= 1 の装飾音・補助伴奏は MAX_CONCURRENT_VOICES (24) / MAX_SCHEDULED_VOICES (64) を厳守し、
   *   低優先度音を間引いても空きがなければ新規生成を見送る（false を返す）。
   * - priority >= 2 の重要音・主旋律・ベースは priority <= 1 を優先的に間引き、
   *   保護音だけで HARD 上限（32 / 80）に達した場合のみ最も終了が近い priority 2 のBGM音を譲歩させて priority 3 の重要通知音を必ず保護する。
   */
  function acquireVoiceSlot(t0, incomingPriority = 0, incomingCategory = 'sfx') {
    if (!ctx) return false;
    pruneExpiredVoices(ctx.currentTime);

    // 1. 同一時刻 (t0) に重なる音の検査
    const concurrent = [...activeVoices].filter((v) => v.startTime <= t0 + 0.001 && v.stopTime > t0);
    if (concurrent.length >= MAX_CONCURRENT_VOICES) {
      const evictable = concurrent.filter((v) => v.priority <= 1 && v.priority <= incomingPriority);
      evictable.sort((a, b) => a.priority - b.priority || a.stopTime - b.stopTime);
      while (concurrent.length >= MAX_CONCURRENT_VOICES && evictable.length > 0) {
        const target = evictable.shift();
        const idx = concurrent.indexOf(target);
        if (idx !== -1) concurrent.splice(idx, 1);
        forceStopVoice(target);
      }
      if (concurrent.length >= MAX_CONCURRENT_VOICES) {
        if (incomingPriority <= 1) return false;
        if (concurrent.length >= HARD_CONCURRENT_VOICES) {
          const fallback = concurrent
            .filter((v) => v.priority === 2 && v.category === 'bgm' && v.stopTime - v.startTime < 0.5)
            .sort((a, b) => a.stopTime - b.stopTime);
          if (fallback.length > 0) {
            forceStopVoice(fallback[0]);
          } else if (incomingPriority < 3) {
            return false;
          }
        }
      }
    }

    // 2. 予約保持全体の検査
    if (activeVoices.size >= MAX_SCHEDULED_VOICES) {
      const evictable = [...activeVoices].filter((v) => v.priority <= 1 && v.priority <= incomingPriority);
      evictable.sort((a, b) => a.priority - b.priority || a.stopTime - b.stopTime);
      while (activeVoices.size >= MAX_SCHEDULED_VOICES && evictable.length > 0) {
        forceStopVoice(evictable.shift());
      }
      // 同一時刻に多数のワンショット効果音が連続発火して予約枠を埋めた場合は、古い効果音（category==='sfx'）を譲歩させる（BGMの長尺パッドは保護）
      if (activeVoices.size >= MAX_SCHEDULED_VOICES && incomingCategory === 'sfx') {
        const oldSfx = [...activeVoices].filter((v) => v.category === 'sfx' && v.priority <= Math.max(2, incomingPriority));
        while (activeVoices.size >= MAX_SCHEDULED_VOICES && oldSfx.length > 0) {
          forceStopVoice(oldSfx.shift());
        }
      }
      if (activeVoices.size >= MAX_SCHEDULED_VOICES) {
        if (incomingPriority <= 1) return false;
        if (activeVoices.size >= HARD_SCHEDULED_VOICES) {
          const fallback = [...activeVoices]
            .filter((v) => v.priority === 2 && v.category === 'bgm' && v.stopTime - v.startTime < 0.5)
            .sort((a, b) => a.stopTime - b.stopTime);
          if (fallback.length > 0) {
            forceStopVoice(fallback[0]);
          } else if (incomingPriority < 3) {
            return false;
          }
        }
      }
    }

    return true;
  }

  function registerVoice(node, gain, t0, stopTime, extraNodes = [], meta = {}) {
    if (!ctx) return;
    const entry = {
      node,
      gain,
      startTime: t0,
      stopTime,
      extraNodes,
      priority: meta.priority ?? 0,
      category: meta.category ?? 'sfx',
      dest: meta.dest,
      stepIndex: meta.stepIndex ?? null,
      cleanedUp: false,
    };
    activeVoices.add(entry);
    if (typeof node.addEventListener === 'function') {
      node.addEventListener(
        'ended',
        () => {
          activeVoices.delete(entry);
          disconnectVoiceNodes(entry);
        },
        { once: true },
      );
    }
  }

  function stopVoicesByCategory(categories = []) {
    const catSet = new Set(categories);
    for (const v of [...activeVoices]) {
      if (catSet.has(v.category)) forceStopVoice(v);
    }
  }

  function stopAllVoices({ sfxOnly = false } = {}) {
    for (const v of [...activeVoices]) {
      if (sfxOnly && v.dest !== bus.sfx) continue;
      forceStopVoice(v);
    }
  }

  /**
   * 停止時に未再生の先読みBGMステップがあれば、最も早い未再生ステップ番号へ step を巻き戻す。
   * 1ステップ内の和音・ドラム等の複数ボイス数ではなく stepIndex 単位で戻すため、
   * 停止と再開を繰り返しても音が抜けたり過去へ巻き戻りすぎたりしない。
   */
  function rewindUnplayedBgmStep() {
    if (!ctx) return;
    let earliestUnplayedStep = Infinity;
    for (const v of activeVoices) {
      if (v.category === 'bgm' && v.stepIndex != null && v.startTime > ctx.currentTime) {
        if (v.stepIndex < earliestUnplayedStep) earliestUnplayedStep = v.stepIndex;
      }
    }
    if (earliestUnplayedStep !== Infinity) {
      step = Math.max(0, earliestUnplayedStep);
    }
  }

  function isBusAudible(dest) {
    if (!ctx || settings.muted) return false;
    if (dest === bus.music) return settings.music > 0;
    if (dest === bus.sfx) return settings.sfx > 0;
    if (dest === bus.ambient) return settings.ambient > 0;
    return true;
  }

  function env(gainNode, t0, attack, hold, release, peak) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone(dest, { freq, type = 'square', t0, dur = 0.12, peak = 0.2, slideTo = null, attack = 0.005, vibrato = 0, filter = 0, priority = 0, category = 'sfx' }) {
    if (!isBusAudible(dest)) return;
    if (!acquireVoiceSlot(t0, priority, category)) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const extras = [];
    const stopTime = t0 + dur + 0.05;
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    if (vibrato) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = vibrato;
      lg.gain.value = freq * 0.06;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t0);
      l.stop(stopTime);
      extras.push(l, lg);
    }
    env(g, t0, attack, dur * 0.4, dur * 0.6, peak);
    if (filter > 0 && typeof ctx.createBiquadFilter === 'function') {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      f.connect(g);
      extras.push(f);
    } else {
      o.connect(g);
    }
    g.connect(dest);
    o.start(t0);
    o.stop(stopTime);
    registerVoice(o, g, t0, stopTime, extras, { priority, category, dest, stepIndex: category === 'bgm' ? activeStepIndex : null });
  }

  let noiseBuffer = null;
  function ensureNoise() {
    if (noiseBuffer) return;
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  function noise(dest, { t0, dur = 0.08, peak = 0.2, filter = 900, q = 0.8, type = 'bandpass', priority = 0, category = 'sfx' }) {
    if (!isBusAudible(dest)) return;
    if (!acquireVoiceSlot(t0, priority, category)) return;
    ensureNoise();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t0, 0.003, dur * 0.3, dur * 0.7, peak);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    const stopTime = t0 + dur + 0.05;
    src.start(t0, Math.random() * 0.5);
    src.stop(stopTime);
    registerVoice(src, g, t0, stopTime, [f], { priority, category, dest, stepIndex: category === 'bgm' ? activeStepIndex : null });
  }

  function duckBackground(seconds = 0.7) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const name of ['music', 'ambient']) {
      const g = duck[name].gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.3, now, 0.03);
      g.setTargetAtTime(1, now + seconds, 0.2);
    }
  }

  const seq = (dest, notes, { t0, gap, type = 'triangle', dur = 0.14, peak = 0.16, filter = 0, priority = 0, category = 'sfx' }) =>
    notes.forEach((n, i) => n && tone(dest, { freq: NOTE(n), type, t0: t0 + i * gap, dur, peak, filter, priority, category }));
  const chord = (dest, notes, { t0, type = 'sine', dur = 0.6, peak = 0.07, attack = 0.02, filter = 0, priority = 0, category = 'sfx' }) =>
    notes.forEach((n) => tone(dest, { freq: NOTE(n), type, t0, dur, peak, attack, filter, priority, category }));

  const SFX = {
    // 警察の足音：低い「ドッ」と靴の擦れ
    footstep: (t0) => {
      tone(bus.sfx, { freq: 150, type: 'sine', t0, dur: 0.07, peak: 0.1 + 0.07 * policeStage, slideTo: 70, priority: 2, category: 'game-loop-sfx' });
      noise(bus.sfx, { t0, dur: 0.05, peak: 0.06 + 0.05 * policeStage, filter: 500 + 150 * policeStage, q: 1.2, priority: 2, category: 'game-loop-sfx' });
    },
    // 心拍：警戒が高い間だけ。低い2連打
    heartbeat: (t0) => {
      tone(bus.sfx, { freq: 62, type: 'sine', t0, dur: 0.12, peak: 0.26, slideTo: 40, priority: 2, category: 'game-loop-sfx' });
      tone(bus.sfx, { freq: 56, type: 'sine', t0: t0 + 0.17, dur: 0.14, peak: 0.18, slideTo: 38, priority: 2, category: 'game-loop-sfx' });
    },
    // 警察1人目登場：警告パルス＋ブラスヒット
    warning: (t0) => {
      tone(bus.sfx, { freq: 233, type: 'triangle', t0, dur: 0.24, peak: 0.12, slideTo: 196, priority: 3, category: 'sfx' });
      tone(bus.sfx, { freq: 932, t0, dur: 0.1, peak: 0.15, priority: 3, category: 'sfx' });
      tone(bus.sfx, { freq: 932, t0: t0 + 0.13, dur: 0.1, peak: 0.15, priority: 3, category: 'sfx' });
      tone(bus.sfx, { freq: 1245, t0: t0 + 0.26, dur: 0.2, peak: 0.16, priority: 3, category: 'sfx' });
    },
    // 警察の笛：2人目が来た時
    whistle: (t0) => {
      for (const [dt, dur] of [[0, 0.16], [0.2, 0.42]]) {
        tone(bus.sfx, { freq: 2350, type: 'square', t0: t0 + dt, dur, peak: 0.07, vibrato: 34, priority: 3, category: 'sfx' });
        noise(bus.sfx, { t0: t0 + dt, dur, peak: 0.05, filter: 2600, q: 6, priority: 3, category: 'sfx' });
      }
    },
    // 警察が離れた：ほっとする下がる2音＋温かいメジャー7th余韻
    relief: (t0) => {
      tone(bus.sfx, { freq: 784, type: 'sine', t0, dur: 0.16, peak: 0.11, attack: 0.02, priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: 523, type: 'sine', t0: t0 + 0.14, dur: 0.3, peak: 0.11, attack: 0.02, priority: 2, category: 'sfx' });
      chord(bus.sfx, [65, 69, 72, 76], { t0: t0 + 0.18, type: 'sine', dur: 0.38, peak: 0.04, priority: 2, category: 'sfx' });
    },
    // 評価終了→色切替猶予の合図
    switchOk: (t0) => {
      tone(bus.sfx, { freq: 1046, type: 'sine', t0, dur: 0.09, peak: 0.15, priority: 1, category: 'sfx' });
      tone(bus.sfx, { freq: 1318, type: 'sine', t0: t0 + 0.07, dur: 0.12, peak: 0.14, priority: 1, category: 'sfx' });
      tone(bus.sfx, { freq: 1568, type: 'triangle', t0: t0 + 0.07, dur: 0.11, peak: 0.06, priority: 1, category: 'sfx' });
    },
    // 瞬間成功（200ms維持）または通常練習の成功
    success: (t0) => {
      tone(bus.sfx, { freq: 660, type: 'triangle', t0, dur: 0.16, peak: 0.2, slideTo: 990, priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: 1976, type: 'sine', t0: t0 + 0.09, dur: 0.18, peak: 0.075, priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: 2637, type: 'sine', t0: t0 + 0.15, dur: 0.22, peak: 0.06, priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: 3322, type: 'sine', t0: t0 + 0.2, dur: 0.2, peak: 0.04, priority: 2, category: 'sfx' });
    },
    // 連続成功の節目：3→5→10 で音が高くなりジャズコードが重なる（level は 0〜2）
    combo: (t0, { level = 0 } = {}) => {
      const base = 72 + level * 2;
      seq(bus.sfx, [base, base + 4, base + 7, base + 11, base + 12], { t0, gap: 0.055, dur: 0.12, peak: 0.18, priority: 3, category: 'sfx' });
      if (level >= 1) tone(bus.sfx, { freq: NOTE(base + 16), type: 'triangle', t0: t0 + 0.27, dur: 0.22, peak: 0.16, priority: 3, category: 'sfx' });
      if (level >= 2) chord(bus.sfx, [base + 12, base + 16, base + 19, base + 23], { t0: t0 + 0.34, dur: 0.55, peak: 0.08, priority: 3, category: 'sfx' });
    },
    // 連続成功が途切れた：小さく下がる音
    comboBreak: (t0) => tone(bus.sfx, { freq: 330, type: 'triangle', t0, dur: 0.2, peak: 0.1, slideTo: 196, priority: 1, category: 'sfx' }),
    // 25棟通過（中間）・40棟突入（夜の街への到達）
    milestone: (t0) => {
      seq(bus.sfx, [67, 74, 79, 86], { t0, gap: 0.085, type: 'square', dur: 0.15, peak: 0.11, filter: 2800, priority: 3, category: 'sfx' });
      chord(bus.sfx, [67, 71, 74, 79], { t0: t0 + 0.32, type: 'triangle', dur: 0.5, peak: 0.065, priority: 3, category: 'sfx' });
    },
    // 19棟目の判定終了で明るさバーを開放する時
    unlock: (t0) => {
      seq(bus.sfx, [76, 81, 85, 88, 93], { t0, gap: 0.05, type: 'sine', dur: 0.1, peak: 0.14, priority: 3, category: 'sfx' });
      chord(bus.sfx, [88, 93, 97, 100], { t0: t0 + 0.28, type: 'sine', dur: 0.52, peak: 0.06, priority: 3, category: 'sfx' });
    },
    // 未開放のバーに触れた
    locked: (t0) => {
      tone(bus.sfx, { freq: 196, type: 'square', t0, dur: 0.07, peak: 0.08, priority: 0, category: 'sfx' });
      tone(bus.sfx, { freq: 185, type: 'square', t0: t0 + 0.09, dur: 0.09, peak: 0.08, priority: 0, category: 'sfx' });
    },
    // 宝石店の警報ベル（開始演出）
    alarm: (t0) => {
      for (let i = 0; i < 14; i += 1) {
        tone(bus.sfx, { freq: i % 2 ? 1568 : 1319, type: 'square', t0: t0 + i * 0.085, dur: 0.07, peak: 0.07, priority: 2, category: 'sfx' });
        noise(bus.sfx, { t0: t0 + i * 0.085, dur: 0.03, peak: 0.03, filter: 5200, q: 4, priority: 2, category: 'sfx' });
      }
    },
    jump: (t0) => tone(bus.sfx, { freq: 260, type: 'triangle', t0, dur: 0.2, peak: 0.16, slideTo: 720, priority: 1, category: 'sfx' }),
    jewel: (t0) => {
      seq(bus.sfx, [88, 93, 96, 100], { t0, gap: 0.045, type: 'sine', dur: 0.14, peak: 0.1, priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: NOTE(105), type: 'sine', t0: t0 + 0.2, dur: 0.5, peak: 0.05, priority: 2, category: 'sfx' });
    },
    // 発見：笛 → 下がるサイレン → 短いおしまいの節
    detected: (t0) => {
      tone(bus.sfx, { freq: 2350, type: 'square', t0, dur: 0.3, peak: 0.07, vibrato: 34, priority: 3, category: 'sfx' });
      noise(bus.sfx, { t0, dur: 0.3, peak: 0.05, filter: 2600, q: 6, priority: 3, category: 'sfx' });
      tone(bus.sfx, { freq: 700, type: 'sawtooth', t0: t0 + 0.32, dur: 0.6, peak: 0.14, slideTo: 170, priority: 3, category: 'sfx' });
      noise(bus.sfx, { t0: t0 + 0.32, dur: 0.5, peak: 0.06, filter: 1500, priority: 3, category: 'sfx' });
      seq(bus.sfx, [67, 63, 60, 55], { t0: t0 + 1.0, gap: 0.2, type: 'triangle', dur: 0.26, peak: 0.14, priority: 3, category: 'sfx' });
      chord(bus.sfx, [48, 51, 55], { t0: t0 + 1.8, type: 'triangle', dur: 0.7, peak: 0.07, priority: 3, category: 'sfx' });
    },
    // クリア：ファンファーレと締めの和音
    clear: (t0) => {
      seq(bus.sfx, [67, 67, 67, 72, 0, 70, 72], { t0, gap: 0.11, type: 'square', dur: 0.14, peak: 0.11, priority: 3, category: 'sfx' });
      seq(bus.sfx, [55, 55, 55, 60, 0, 58, 60], { t0, gap: 0.11, type: 'triangle', dur: 0.14, peak: 0.12, priority: 3, category: 'sfx' });
      chord(bus.sfx, [72, 76, 79, 84], { t0: t0 + 0.77, type: 'triangle', dur: 1.1, peak: 0.09, priority: 3, category: 'sfx' });
      seq(bus.sfx, [91, 96, 100, 103, 108], { t0: t0 + 0.9, gap: 0.065, type: 'sine', dur: 0.22, peak: 0.065, priority: 3, category: 'sfx' });
    },
    result: (t0) => {
      chord(bus.sfx, [60, 64, 67, 71], { t0, dur: 0.6, peak: 0.08, priority: 1, category: 'sfx' });
      tone(bus.sfx, { freq: NOTE(72), type: 'sine', t0: t0 + 0.12, dur: 0.5, peak: 0.06, priority: 1, category: 'sfx' });
    },
    // 端末内の自己ベストを更新した
    best: (t0) => {
      seq(bus.sfx, [72, 76, 79, 84, 88, 91], { t0, gap: 0.065, dur: 0.16, peak: 0.14, priority: 2, category: 'sfx' });
      chord(bus.sfx, [84, 88, 91, 96], { t0: t0 + 0.42, dur: 0.65, peak: 0.06, priority: 2, category: 'sfx' });
    },
    select: (t0) => tone(bus.sfx, { freq: 1200, type: 'sine', t0, dur: 0.04, peak: 0.08, priority: 0, category: 'sfx' }),
    confirm: (t0) => tone(bus.sfx, { freq: 880, type: 'sine', t0, dur: 0.08, peak: 0.12, slideTo: 1320, priority: 0, category: 'sfx' }),
    back: (t0) => tone(bus.sfx, { freq: 660, type: 'sine', t0, dur: 0.08, peak: 0.1, slideTo: 440, priority: 0, category: 'sfx' }),
    countdown: (t0) => tone(bus.sfx, { freq: 784, type: 'sine', t0, dur: 0.1, peak: 0.12, priority: 1, category: 'sfx' }),
    go: (t0) => {
      tone(bus.sfx, { freq: 1568, type: 'sine', t0, dur: 0.3, peak: 0.13, priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: 1175, type: 'triangle', t0, dur: 0.3, peak: 0.07, priority: 2, category: 'sfx' });
    },

    // ---------- 新規追加SE（11種） ----------
    // 開始演出の窓ガラス破砕音
    glassBurst: (t0) => {
      noise(bus.sfx, { t0, dur: 0.18, peak: 0.14, filter: 4200, q: 1.5, type: 'highpass', priority: 2, category: 'sfx' });
      seq(bus.sfx, [96, 101, 93, 103, 98], { t0: t0 + 0.02, gap: 0.035, type: 'sine', dur: 0.09, peak: 0.08, priority: 2, category: 'sfx' });
    },
    // 開始演出の歩道着地音
    land: (t0) => {
      tone(bus.sfx, { freq: 180, type: 'sine', t0, dur: 0.06, peak: 0.11, slideTo: 65, priority: 2, category: 'sfx' });
      noise(bus.sfx, { t0, dur: 0.04, peak: 0.06, filter: 650, q: 1.1, priority: 2, category: 'sfx' });
    },
    // パレット操作開始（柔らかいウッドタップ）
    touchPalette: (t0) => {
      tone(bus.sfx, { freq: 520, type: 'triangle', t0, dur: 0.035, peak: 0.055, slideTo: 680, attack: 0.002, priority: 0, category: 'sfx' });
    },
    // 明るさバー操作開始（澄んだガラス風タップ）
    touchBar: (t0) => {
      tone(bus.sfx, { freq: 740, type: 'sine', t0, dur: 0.04, peak: 0.06, slideTo: 920, attack: 0.002, priority: 0, category: 'sfx' });
    },
    // ドラッグ移動で色・明度を大きく動かした時の控えめな刻み音（押し始めタップ単体では鳴らさない）
    colorStep: (t0, { v = 10000 } = {}) => {
      const freq = 580 + Math.round((v / 10000) * 520);
      tone(bus.sfx, { freq, type: 'sine', t0, dur: 0.024, peak: 0.038, attack: 0.002, priority: 0, category: 'sfx' });
    },
    // 通常の指離しで色を確定した時の軽い2音ロック音（取消・強制解放では鳴らさない）
    colorRelease: (t0) => {
      tone(bus.sfx, { freq: 880, type: 'sine', t0, dur: 0.035, peak: 0.048, attack: 0.002, priority: 1, category: 'sfx' });
      tone(bus.sfx, { freq: 1175, type: 'sine', t0: t0 + 0.028, dur: 0.045, peak: 0.042, attack: 0.002, priority: 1, category: 'sfx' });
    },
    // 初回静止ガイド（1棟目・20棟目）およびガイド練習95%超達成音
    guideClear: (t0) => {
      seq(bus.sfx, [72, 76, 79, 83, 84], { t0, gap: 0.055, type: 'triangle', dur: 0.14, peak: 0.14, priority: 3, category: 'sfx' });
      chord(bus.sfx, [72, 76, 79, 84], { t0: t0 + 0.26, type: 'sine', dur: 0.35, peak: 0.06, priority: 3, category: 'sfx' });
    },
    // 棟の通常成功通過（コンボ数に応じて少しずつピッチが上がる）
    passBuilding: (t0, { combo = 1 } = {}) => {
      const shift = Math.min(8, Math.max(0, combo - 1));
      const n1 = 72 + shift;
      const n2 = 79 + shift;
      tone(bus.sfx, { freq: NOTE(n1), type: 'triangle', t0, dur: 0.075, peak: 0.095, priority: 1, category: 'sfx' });
      tone(bus.sfx, { freq: NOTE(n2), type: 'sine', t0: t0 + 0.06, dur: 0.11, peak: 0.09, priority: 1, category: 'sfx' });
    },
    // 警察が「？」を出して見失い始めた瞬間（怪盗らしい粋なピチカート2音）
    policeSearch: (t0) => {
      tone(bus.sfx, { freq: NOTE(67), type: 'triangle', t0, dur: 0.08, peak: 0.11, slideTo: NOTE(69), priority: 2, category: 'sfx' });
      tone(bus.sfx, { freq: NOTE(74), type: 'sine', t0: t0 + 0.09, dur: 0.14, peak: 0.1, priority: 2, category: 'sfx' });
    },
    // 10棟区切り（11・21・31・41棟目）到達でBGMが1段階豪華になる合図
    tierUp: (t0, { tier = 1 } = {}) => {
      const base = 67 + Math.min(4, Math.max(1, tier)) * 2;
      seq(bus.sfx, [base, base + 4, base + 7, base + 12], { t0, gap: 0.065, type: 'triangle', dur: 0.14, peak: 0.13, priority: 3, category: 'sfx' });
      chord(bus.sfx, [base + 4, base + 7, base + 12], { t0: t0 + 0.25, type: 'sine', dur: 0.38, peak: 0.055, priority: 3, category: 'sfx' });
    },
    // 残り5棟（46〜50棟）ラストスパートのカウントアップベル
    lastFive: (t0, { building = 46 } = {}) => {
      const stepUp = Math.min(4, Math.max(0, building - 46));
      const note = 84 + stepUp * 2;
      tone(bus.sfx, { freq: NOTE(note), type: 'sine', t0, dur: 0.18, peak: 0.1, priority: 1, category: 'sfx' });
      tone(bus.sfx, { freq: NOTE(note + 12), type: 'sine', t0: t0 + 0.04, dur: 0.2, peak: 0.05, priority: 1, category: 'sfx' });
    },
  };

  // ---------- 音楽：16分音符の刻みで少し先まで予定する ----------
  function kick(t0, peak) {
    tone(bus.music, { freq: 130, type: 'sine', t0, dur: 0.14, peak, slideTo: 44, attack: 0.002, priority: 1, category: 'bgm' });
  }
  function snare(t0, peak) {
    noise(bus.music, { t0, dur: 0.11, peak, filter: 1900, q: 0.7, priority: 1, category: 'bgm' });
    tone(bus.music, { freq: 210, type: 'triangle', t0, dur: 0.06, peak: peak * 0.6, priority: 1, category: 'bgm' });
  }
  function rim(t0, peak) {
    tone(bus.music, { freq: 820, type: 'triangle', t0, dur: 0.03, peak, slideTo: 420, attack: 0.001, priority: 1, category: 'bgm' });
    noise(bus.music, { t0, dur: 0.025, peak: peak * 0.7, filter: 3200, q: 2.0, priority: 1, category: 'bgm' });
  }
  function hat(t0, peak, dur = 0.03) {
    noise(bus.music, { t0, dur, peak, filter: 7000, q: 0.9, type: 'highpass', priority: 0, category: 'bgm' });
  }

  function musicStep(th, n, t0, sixteenth) {
    activeStepIndex = n;
    try {
      const perSection = 8 * 16;
      const tier = th.reactive ? musicTier : 0;
      const sections = th.reactive ? GAME_TIER_SECTIONS[tier] : th.sections;
      const section = sections[Math.floor(n / perSection) % sections.length];
      const barIndex = Math.floor((n % perSection) / 16);
      const s16 = n % 16;
      const [root, quality] = section.chords[barIndex];
      const up = th.reactive && (finale || tier >= 4) ? 2 : 0;
      const stage = th.reactive ? policeStage : 0;
      const lv = th.level;
      const eighth = sixteenth * 2;
      const thirdIv = THIRD[quality];
      const seventhIv = SEVENTH[quality];

      // Tier 2（21〜30棟）以降：小節頭に持続する和音パッドを重ねる（Tier 4はさらに厚いボイシング＋4小節周期のシンバル）
      if (th.reactive && tier >= 2 && s16 === 0) {
        const padNotes = tier >= 4
          ? [root + 24 + up, root + 24 + thirdIv + up, root + 31 + up]
          : [root + 24 + up, root + 24 + thirdIv + up];
        chord(bus.music, padNotes, {
          t0,
          type: 'sine',
          dur: sixteenth * 14,
          peak: (tier >= 4 ? 0.018 : 0.013) * lv,
          attack: 0.08,
          priority: 2,
          category: 'bgm',
        });
        if (tier >= 4 && barIndex % 4 === 0) {
          noise(bus.music, { t0, dur: 0.35, peak: 0.035 * lv, filter: 5500, q: 0.6, type: 'highpass', priority: 1, category: 'bgm' });
        }
      }

      // Tier 2（21〜30棟）以降：16分音符のアルペジオ
      if (th.reactive && tier >= 2) {
        const arpOffsets = [0, thirdIv, 7, 12, 7, thirdIv, 12, 12 + thirdIv];
        const arpNote = root + 36 + arpOffsets[s16 % arpOffsets.length] + up;
        tone(bus.music, {
          freq: NOTE(arpNote),
          type: 'sine',
          t0,
          dur: sixteenth * 0.75,
          peak: (tier >= 3 ? 0.022 : 0.018) * lv,
          attack: 0.003,
          priority: 1,
          category: 'bgm',
        });
      }

      if (s16 % 2 === 0) {
        const e = s16 / 2;
        // 主旋律
        const m = section.melody[barIndex][e];
        if (m) {
          tone(bus.music, { freq: NOTE(m + up), type: th.lead, t0, dur: eighth * 0.8, peak: 0.062 * lv, priority: 2, category: 'bgm' });
          // Tier 3（31〜40棟）以降：オクターブ下のダブリング
          if (th.reactive && tier >= 3) {
            tone(bus.music, { freq: NOTE(m - 12 + up), type: 'triangle', t0, dur: eighth * 0.75, peak: 0.034 * lv, priority: 2, category: 'bgm' });
          }
          // Tier 4（41〜50棟）：3度上のブラス・ハーモニー
          if (th.reactive && tier >= 4) {
            const harm = m + (quality === 'm' ? 3 : 4) + up;
            tone(bus.music, { freq: NOTE(harm), type: 'sawtooth', t0, dur: eighth * 0.7, peak: 0.025 * lv, filter: 2600, priority: 2, category: 'bgm' });
          }
        }

        // Tier 3（31〜40棟）以降：対旋律
        if (th.reactive && tier >= 3 && section.counter) {
          const cNote = section.counter[barIndex]?.[e];
          if (cNote) {
            tone(bus.music, {
              freq: NOTE(cNote + up),
              type: 'sawtooth',
              t0,
              dur: eighth * 0.75,
              peak: 0.032 * lv,
              filter: 2100,
              priority: 2,
              category: 'bgm',
            });
          }
        }

        // ベース：Tier 0は2拍刻み、Tier 1（11〜20棟）以降または警察2人時は8分ウォーキングベース
        const walk = [root, root + thirdIv, root + 7, root + 10, root + 12, root + 10, root + 7, root + thirdIv];
        const sparseWalk = [root, 0, root + 7, 0, root + 12, 0, root + 7, root + thirdIv];
        const fullWalking = tier >= 1 || stage >= 2;
        const b = fullWalking ? walk[e] : sparseWalk[e];
        if (b) {
          tone(bus.music, {
            freq: NOTE(b + up),
            type: 'triangle',
            t0,
            dur: eighth * (fullWalking ? 0.82 : 1.5),
            peak: 0.13 * lv,
            priority: 2,
            category: 'bgm',
          });
        }

        // 和音の刻み（裏拍）：Tier 1以降は7thを含むボイシング
        if (e % 2 === 1) {
          const chordIvs = tier >= 1 || quality === '7'
            ? [0, thirdIv, 7, seventhIv]
            : [0, thirdIv, 7, 12];
          for (const iv of chordIvs) {
            tone(bus.music, {
              freq: NOTE(root + 24 + iv + up),
              type: tier >= 2 ? 'sine' : 'triangle',
              t0,
              dur: eighth * 0.5,
              peak: 0.022 * lv,
              priority: 1,
              category: 'bgm',
            });
          }
        }
      }

      // ドラム・パーカッション（Tierと警察段階の連動）
      if (th.drums) {
        const extraKick = (stage >= 2 && s16 === 10) || (tier >= 2 && s16 === 14) || (tier >= 4 && s16 === 6);
        if (s16 === 0 || s16 === 8 || extraKick) kick(t0, 0.2);

        if (stage >= 1 && (s16 === 4 || s16 === 12)) {
          snare(t0, 0.07 + 0.02 * stage);
        } else if (tier >= 2 && (s16 === 4 || s16 === 12)) {
          snare(t0, 0.055 + 0.008 * tier);
        } else if (tier === 1 && (s16 === 4 || s16 === 12)) {
          rim(t0, 0.045);
        }

        if (tier >= 3 && barIndex % 4 === 3 && (s16 === 13 || s16 === 15)) {
          snare(t0, 0.05);
        }

        if (s16 % 4 === 2) {
          hat(t0, 0.04, tier >= 3 && s16 === 10 ? 0.06 : 0.03);
        } else if ((stage >= 2 || tier >= 3) && s16 % 2 === 1) {
          hat(t0, 0.022);
        } else if ((stage >= 1 || tier >= 1) && s16 % 4 === 0) {
          hat(t0, 0.02);
        }
      } else if (s16 % 4 === 2) {
        hat(t0, 0.012);
      }
    } finally {
      activeStepIndex = null;
    }
  }

  // ---------- 環境音の小さな飾り：昼は鳥、夜は虫 ----------
  function ambientDetail(t0) {
    if (area === 'night' || area === 'dusk') {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i += 1) tone(bus.ambient, { freq: 4300 + Math.random() * 120, type: 'sine', t0: t0 + i * 0.075, dur: 0.045, peak: 0.035, priority: 0, category: 'ambient-detail' });
    } else {
      const base = 2400 + Math.random() * 1400;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i += 1) tone(bus.ambient, { freq: base * (1 + i * 0.04), type: 'sine', t0: t0 + i * 0.11, dur: 0.08, peak: 0.05, slideTo: base * 1.35, priority: 0, category: 'ambient-detail' });
    }
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    pruneExpiredVoices(ctx.currentTime);
    if (settings.muted) return; // 全体消音中は不要な予約ノードを作らない
    const ahead = ctx.currentTime + 0.25;
    const th = theme ? MUSIC_THEMES[theme] : null;
    if (th && settings.music > 0) {
      const sixteenth = 60 / th.bpm / 4;
      if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.05;
      while (nextNoteTime < ahead) {
        musicStep(th, step, nextNoteTime, sixteenth);
        nextNoteTime += sixteenth;
        step += 1;
      }
    }
    if (gameOn && policeStage > 0 && settings.sfx > 0) {
      const gap = policeStage >= 2 ? 0.3 : 0.48;
      if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
      while (nextStepTime < ahead) {
        SFX.footstep(nextStepTime);
        nextStepTime += gap;
      }
    }
    if (gameOn && danger && settings.sfx > 0) {
      if (nextBeatTime < ctx.currentTime) nextBeatTime = ctx.currentTime + 0.05;
      while (nextBeatTime < ahead) {
        SFX.heartbeat(nextBeatTime);
        nextBeatTime += 0.82;
      }
    }
    if (gameOn && ambientNode && settings.ambient > 0) {
      if (nextBirdTime < ctx.currentTime - 1) nextBirdTime = ctx.currentTime + 1 + Math.random() * 2;
      while (nextBirdTime < ahead) {
        ambientDetail(nextBirdTime);
        nextBirdTime += area === 'night' || area === 'dusk' ? 1.1 + Math.random() * 2.2 : 2.2 + Math.random() * 4.5;
      }
    }
  }

  const ambientCutoff = (a) => ({ day: 520, evening: 460, dusk: 380, night: 320 })[a] ?? 520;

  function startAmbient() {
    if (!ctx || ambientNode || settings.muted || settings.ambient <= 0) return;
    ensureNoise();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = ambientCutoff(area);
    const g = ctx.createGain();
    g.gain.value = 0.25;
    // 風のうねり：ゆっくり音量を揺らす
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 0.08;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(bus.ambient);
    src.start();
    lfo.start();
    ambientNode = { src, f, g, lfo, lg };
  }

  function stopAmbient() {
    if (!ambientNode) return;
    const { src, f, g, lfo, lg } = ambientNode;
    ambientNode = null;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      lfo.stop();
    } catch {
      /* already stopped */
    }
    for (const n of [src, f, g, lfo, lg]) {
      try {
        n?.disconnect?.();
      } catch {
        /* ignore */
      }
    }
  }

  function setTheme(next, { resetStep = true } = {}) {
    if (next && !MUSIC_THEMES[next]) return;
    if (next === theme) return;
    // 曲を切り替える際は、前の曲の未再生予約分を止めて重なりを防ぐ
    if (theme && next !== theme) {
      stopVoicesByCategory(['bgm']);
    }
    theme = next;
    if (resetStep) step = 0;
    if (ctx) nextNoteTime = ctx.currentTime + 0.08;
  }

  return {
    get available() {
      return !failed;
    },
    /** AudioContext が running 状態かどうか（未準備と消音・連打抑止を区別するため）。 */
    get running() {
      return Boolean(ctx && ctx.state === 'running');
    },
    get settings() {
      return { ...settings };
    },
    /** 流している曲の名前（なければ null）。 */
    get music() {
      return theme;
    },
    /** 現在の10棟区切りBGM段階（0〜4）。 */
    get tier() {
      return musicTier;
    },
    /** 現在の予約・再生中ボイス数（検証・診断用）。 */
    get activeVoiceCount() {
      if (ctx) pruneExpiredVoices(ctx.currentTime);
      return activeVoices.size;
    },
    setSettings(next) {
      const prev = settings;
      settings = sanitizeAudioSettings({ ...settings, ...next });
      applyGains();
      if (ctx) {
        if (settings.muted || settings.music <= 0) {
          rewindUnplayedBgmStep();
          stopVoicesByCategory(['bgm']);
          nextNoteTime = 0;
        }
        if (settings.muted || settings.sfx <= 0) {
          stopVoicesByCategory(['game-loop-sfx', 'sfx']);
          nextStepTime = 0;
          nextBeatTime = 0;
        }
        if (settings.muted || settings.ambient <= 0) {
          stopAmbient();
          stopVoicesByCategory(['ambient-detail']);
          nextBirdTime = 0;
        } else if (gameOn && !ambientNode && (prev.muted || prev.ambient <= 0)) {
          startAmbient();
        }
      }
      return { ...settings };
    },
    /** 明示的な操作（開始・再開・ボタン）の中で呼ぶ。 */
    async prepare() {
      const c = ensure();
      if (!c) return false;
      try {
        if (c.state !== 'running') await c.resume();
      } catch {
        return false;
      }
      if (!schedulerTimer) {
        schedulerTimer = setInterval(schedule, 100);
        schedulerTimer.unref?.(); // Node の試験で、このタイマーだけのために終了を待たせない
      }
      return c.state === 'running';
    },
    /** 曲を切り替える（'game'・'menu'・'practice'、null で止める）。同じ曲なら何もしない。 */
    setMusic(next) {
      setTheme(next, { resetStep: true });
    },
    /** 本編の音楽と環境音を始める（reset=true なら曲頭から、false なら一時停止位置から再開）。 */
    startGameAudio({ reset = false } = {}) {
      if (!ctx) return;
      gameOn = true;
      // 前の曲や重複した開始要求の先読み予約を残さない。
      // 本編を続ける場合は、未再生のステップから再予約する。
      if (!reset && theme === 'game') rewindUnplayedBgmStep();
      stopVoicesByCategory(['bgm']);
      if (reset) step = 0;
      theme = null;
      setTheme('game', { resetStep: reset });
      startAmbient();
    },
    stopGameAudio() {
      rewindUnplayedBgmStep();
      gameOn = false;
      theme = null;
      policeStage = 0;
      danger = false;
      nextNoteTime = 0;
      nextStepTime = 0;
      nextBeatTime = 0;
      nextBirdTime = 0;
      stopAmbient();
      stopVoicesByCategory(['bgm', 'game-loop-sfx', 'ambient-detail']);
    },
    /** 予約済みの効果音ノードを即座に止める（開始・終了演出のスキップ時など）。 */
    stopSfx() {
      stopAllVoices({ sfxOnly: true });
    },
    /** 一時停止・画面離脱。予定済みの音を捨て、復帰時にまとめて鳴らさない。 */
    async suspend() {
      rewindUnplayedBgmStep();
      gameOn = false;
      theme = null;
      danger = false;
      nextNoteTime = 0;
      nextStepTime = 0;
      nextBeatTime = 0;
      nextBirdTime = 0;
      stopAmbient();
      stopAllVoices();
      if (ctx && ctx.state === 'running') {
        try {
          await ctx.suspend();
        } catch {
          /* ignore */
        }
      }
    },
    setPoliceStage(stage) {
      policeStage = stage;
    },
    /** 警戒が高い間の心拍。 */
    setDanger(on) {
      danger = !!on;
    },
    /** 終盤（41棟目から）は曲の調を上げる。 */
    setFinale(on) {
      finale = !!on;
    },
    /** 現在の棟番号（1〜50）から、10棟区切りBGM豪華さ段階（Tier 0〜4）を更新する。 */
    setBuilding(building) {
      const b = Math.max(1, Math.min(50, Math.floor(Number(building) || 1)));
      currentBuilding = b;
      musicTier = buildingTier(b);
    },
    setArea(next) {
      if (next === area) return;
      area = next;
      if (ambientNode && ctx) ambientNode.f.frequency.setTargetAtTime(ambientCutoff(next), ctx.currentTime, 0.5);
    },
    play(name, opts) {
      const def = SOUND_EVENTS[name];
      if (!def || !ctx || ctx.state !== 'running' || settings.muted || settings.sfx <= 0) return false;
      const now = performance.now();
      if (now - (lastPlayed.get(name) ?? -Infinity) < def.minGapMs) return false;
      lastPlayed.set(name, now);
      if (def.important) duckBackground();
      try {
        SFX[name](ctx.currentTime + 0.01, opts);
      } catch {
        return false;
      }
      return true;
    },
    dispose() {
      if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
      }
      stopAmbient();
      stopAllVoices();
      if (ctx && typeof ctx.close === 'function') {
        ctx.close().catch(() => {});
      }
      ctx = null;
    },
  };
}
