// 音。素材ファイルは使わず、Web Audio でその場で合成する（有償素材・外部素材なし）。
// - 音楽／効果音／環境音の3音量と全体消音。消音を解除すると設定済みの音量へ戻す（0は「未設定」と扱わない）。
// - 開始・再開などの明示的な操作で音声を準備する。使えない端末でもゲームは続く。
// - 一時停止・画面離脱で止め、復帰時に過去の足音や警告をまとめて鳴らさない。
// - 重要な通知の間は音楽・環境音を下げる。同じ成功音の連発を抑える。
// - 音楽は曲（テーマ）を切り替えられる。本編の曲は、警察の人数でドラムが増え、終盤で調が上がる。
//   曲そのものは切り替えない（AUDIO-01）。判定・得点には一切関わらない。

export const DEFAULT_AUDIO = Object.freeze({ music: 0.45, sfx: 0.7, ambient: 0.35, muted: false });

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

// 出来事 → 音の役割・最短間隔・重要度（重要なら背景を下げる）
export const SOUND_EVENTS = Object.freeze({
  footstep: { bus: 'sfx', minGapMs: 120, important: false },
  heartbeat: { bus: 'sfx', minGapMs: 300, important: false },
  warning: { bus: 'sfx', minGapMs: 1500, important: true },
  whistle: { bus: 'sfx', minGapMs: 1500, important: true },
  relief: { bus: 'sfx', minGapMs: 1500, important: false },
  switchOk: { bus: 'sfx', minGapMs: 800, important: false },
  success: { bus: 'sfx', minGapMs: 600, important: false },
  combo: { bus: 'sfx', minGapMs: 400, important: true },
  comboBreak: { bus: 'sfx', minGapMs: 1000, important: false },
  milestone: { bus: 'sfx', minGapMs: 1000, important: true },
  unlock: { bus: 'sfx', minGapMs: 1000, important: true },
  locked: { bus: 'sfx', minGapMs: 400, important: false },
  alarm: { bus: 'sfx', minGapMs: 2000, important: false },
  jump: { bus: 'sfx', minGapMs: 200, important: false },
  jewel: { bus: 'sfx', minGapMs: 400, important: false },
  detected: { bus: 'sfx', minGapMs: 2000, important: true },
  clear: { bus: 'sfx', minGapMs: 2000, important: true },
  result: { bus: 'sfx', minGapMs: 1000, important: false },
  best: { bus: 'sfx', minGapMs: 2000, important: false },
  select: { bus: 'sfx', minGapMs: 60, important: false },
  confirm: { bus: 'sfx', minGapMs: 60, important: false },
  back: { bus: 'sfx', minGapMs: 60, important: false },
  countdown: { bus: 'sfx', minGapMs: 300, important: false },
  go: { bus: 'sfx', minGapMs: 300, important: false },
});

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

// ---------- 曲 ----------
// 1小節＝8分音符8個。0 は休み。chords は小節ごとの [根音, 'm'|'M'|'7']。
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
// テーマ：テンポ・曲の並び・音色・音量。本編だけが警察の人数と終盤で変わる。
export const MUSIC_THEMES = Object.freeze({
  game: { bpm: 126, sections: [SONG_GAME_A, SONG_GAME_A, SONG_GAME_B, SONG_GAME_A], lead: 'square', level: 1, drums: true, reactive: true },
  menu: { bpm: 92, sections: [SONG_MENU], lead: 'triangle', level: 0.8, drums: false, reactive: false },
  practice: { bpm: 84, sections: [SONG_MENU], lead: 'sine', level: 0.65, drums: false, reactive: false },
});

const THIRD = { m: 3, M: 4, 7: 4 };
const SEVENTH = { m: 10, M: 7, 7: 10 };

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
  let policeStage = 0;
  let danger = false;
  let finale = false;
  let nextStepTime = 0;
  let nextBeatTime = 0;
  let nextBirdTime = 0;
  let area = 'day';
  const lastPlayed = new Map();
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
      master.connect(ctx.destination);
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

  function env(gainNode, t0, attack, hold, release, peak) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone(dest, { freq, type = 'square', t0, dur = 0.12, peak = 0.2, slideTo = null, attack = 0.005, vibrato = 0 }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    if (vibrato) {
      // 細かく震わせる（笛・警報）
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = vibrato;
      lg.gain.value = freq * 0.06;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t0);
      l.stop(t0 + dur + 0.05);
    }
    env(g, t0, attack, dur * 0.4, dur * 0.6, peak);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
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
  function noise(dest, { t0, dur = 0.08, peak = 0.2, filter = 900, q = 0.8, type = 'bandpass' }) {
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
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  function duckBackground(seconds = 0.7) {
    const now = ctx.currentTime;
    for (const name of ['music', 'ambient']) {
      const g = duck[name].gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.3, now, 0.03);
      g.setTargetAtTime(1, now + seconds, 0.2);
    }
  }

  const seq = (dest, notes, { t0, gap, type = 'triangle', dur = 0.14, peak = 0.16 }) =>
    notes.forEach((n, i) => n && tone(dest, { freq: NOTE(n), type, t0: t0 + i * gap, dur, peak }));
  const chord = (dest, notes, { t0, type = 'sine', dur = 0.6, peak = 0.07 }) => notes.forEach((n) => tone(dest, { freq: NOTE(n), type, t0, dur, peak, attack: 0.02 }));

  const SFX = {
    // 警察の足音：低い「ドッ」と靴の擦れ
    footstep: (t0) => {
      tone(bus.sfx, { freq: 150, type: 'sine', t0, dur: 0.07, peak: 0.1 + 0.07 * policeStage, slideTo: 70 });
      noise(bus.sfx, { t0, dur: 0.05, peak: 0.06 + 0.05 * policeStage, filter: 500 + 150 * policeStage, q: 1.2 });
    },
    // 心拍：警戒が高い間だけ。低い2連打
    heartbeat: (t0) => {
      tone(bus.sfx, { freq: 62, type: 'sine', t0, dur: 0.12, peak: 0.26, slideTo: 40 });
      tone(bus.sfx, { freq: 56, type: 'sine', t0: t0 + 0.17, dur: 0.14, peak: 0.18, slideTo: 38 });
    },
    warning: (t0) => {
      tone(bus.sfx, { freq: 932, t0, dur: 0.1, peak: 0.15 });
      tone(bus.sfx, { freq: 932, t0: t0 + 0.13, dur: 0.1, peak: 0.15 });
      tone(bus.sfx, { freq: 1245, t0: t0 + 0.26, dur: 0.2, peak: 0.16 });
    },
    // 警察の笛：2人目が来た時
    whistle: (t0) => {
      for (const [dt, dur] of [[0, 0.16], [0.2, 0.42]]) {
        tone(bus.sfx, { freq: 2350, type: 'square', t0: t0 + dt, dur, peak: 0.07, vibrato: 34 });
        noise(bus.sfx, { t0: t0 + dt, dur, peak: 0.05, filter: 2600, q: 6 });
      }
    },
    // 警察が離れた：ほっとする下がる2音
    relief: (t0) => {
      tone(bus.sfx, { freq: 784, type: 'sine', t0, dur: 0.16, peak: 0.1, attack: 0.02 });
      tone(bus.sfx, { freq: 523, type: 'sine', t0: t0 + 0.14, dur: 0.3, peak: 0.1, attack: 0.02 });
    },
    switchOk: (t0) => {
      tone(bus.sfx, { freq: 1046, type: 'sine', t0, dur: 0.09, peak: 0.16 });
      tone(bus.sfx, { freq: 1318, type: 'sine', t0: t0 + 0.07, dur: 0.12, peak: 0.14 });
    },
    success: (t0) => {
      tone(bus.sfx, { freq: 660, type: 'triangle', t0, dur: 0.16, peak: 0.2, slideTo: 990 });
      tone(bus.sfx, { freq: 1976, type: 'sine', t0: t0 + 0.1, dur: 0.18, peak: 0.07 });
      tone(bus.sfx, { freq: 2637, type: 'sine', t0: t0 + 0.16, dur: 0.22, peak: 0.05 });
    },
    // 連続成功の節目：3→5→10 で音が高くなる（level は 0〜2）
    combo: (t0, { level = 0 } = {}) => {
      const base = 72 + level * 2;
      seq(bus.sfx, [base, base + 4, base + 7, base + 12], { t0, gap: 0.06, dur: 0.12, peak: 0.18 });
      if (level >= 1) tone(bus.sfx, { freq: NOTE(base + 16), type: 'triangle', t0: t0 + 0.24, dur: 0.2, peak: 0.16 });
      if (level >= 2) chord(bus.sfx, [base + 12, base + 16, base + 19], { t0: t0 + 0.32, dur: 0.5, peak: 0.08 });
    },
    // 連続成功が途切れた：小さく下がる音
    comboBreak: (t0) => tone(bus.sfx, { freq: 330, type: 'triangle', t0, dur: 0.2, peak: 0.1, slideTo: 196 }),
    milestone: (t0) => {
      seq(bus.sfx, [67, 74, 79], { t0, gap: 0.1, type: 'square', dur: 0.16, peak: 0.12 });
      chord(bus.sfx, [67, 71, 74], { t0: t0 + 0.3, dur: 0.45, peak: 0.06 });
    },
    unlock: (t0) => {
      seq(bus.sfx, [76, 81, 85, 88, 93], { t0, gap: 0.05, type: 'sine', dur: 0.1, peak: 0.14 });
      tone(bus.sfx, { freq: NOTE(100), type: 'sine', t0: t0 + 0.28, dur: 0.5, peak: 0.07 });
    },
    // 未開放のバーに触れた
    locked: (t0) => {
      tone(bus.sfx, { freq: 196, type: 'square', t0, dur: 0.07, peak: 0.08 });
      tone(bus.sfx, { freq: 185, type: 'square', t0: t0 + 0.09, dur: 0.09, peak: 0.08 });
    },
    // 宝石店の警報ベル（開始演出）
    alarm: (t0) => {
      for (let i = 0; i < 14; i += 1) {
        tone(bus.sfx, { freq: i % 2 ? 1568 : 1319, type: 'square', t0: t0 + i * 0.085, dur: 0.07, peak: 0.07 });
        noise(bus.sfx, { t0: t0 + i * 0.085, dur: 0.03, peak: 0.03, filter: 5200, q: 4 });
      }
    },
    jump: (t0) => tone(bus.sfx, { freq: 260, type: 'triangle', t0, dur: 0.2, peak: 0.16, slideTo: 720 }),
    jewel: (t0) => {
      seq(bus.sfx, [88, 93, 96, 100], { t0, gap: 0.045, type: 'sine', dur: 0.14, peak: 0.1 });
      tone(bus.sfx, { freq: NOTE(105), type: 'sine', t0: t0 + 0.2, dur: 0.5, peak: 0.05 });
    },
    // 発見：笛 → 下がるサイレン → 短いおしまいの節
    detected: (t0) => {
      tone(bus.sfx, { freq: 2350, type: 'square', t0, dur: 0.3, peak: 0.07, vibrato: 34 });
      noise(bus.sfx, { t0, dur: 0.3, peak: 0.05, filter: 2600, q: 6 });
      tone(bus.sfx, { freq: 700, type: 'sawtooth', t0: t0 + 0.32, dur: 0.6, peak: 0.14, slideTo: 170 });
      noise(bus.sfx, { t0: t0 + 0.32, dur: 0.5, peak: 0.06, filter: 1500 });
      seq(bus.sfx, [67, 63, 60, 55], { t0: t0 + 1.0, gap: 0.2, type: 'triangle', dur: 0.26, peak: 0.14 });
      chord(bus.sfx, [48, 51, 55], { t0: t0 + 1.8, type: 'triangle', dur: 0.7, peak: 0.07 });
    },
    // クリア：ファンファーレと締めの和音
    clear: (t0) => {
      seq(bus.sfx, [67, 67, 67, 72, 0, 70, 72], { t0, gap: 0.11, type: 'square', dur: 0.14, peak: 0.11 });
      seq(bus.sfx, [55, 55, 55, 60, 0, 58, 60], { t0, gap: 0.11, type: 'triangle', dur: 0.14, peak: 0.12 });
      chord(bus.sfx, [72, 76, 79, 84], { t0: t0 + 0.77, type: 'triangle', dur: 1.1, peak: 0.09 });
      seq(bus.sfx, [91, 96, 100, 103], { t0: t0 + 0.9, gap: 0.07, type: 'sine', dur: 0.2, peak: 0.06 });
    },
    result: (t0) => {
      chord(bus.sfx, [60, 64, 67], { t0, dur: 0.6, peak: 0.08 });
      tone(bus.sfx, { freq: NOTE(72), type: 'sine', t0: t0 + 0.12, dur: 0.5, peak: 0.06 });
    },
    // 端末内の自己ベストを更新した
    best: (t0) => {
      seq(bus.sfx, [72, 76, 79, 84, 88], { t0, gap: 0.07, dur: 0.16, peak: 0.14 });
      chord(bus.sfx, [84, 88, 91], { t0: t0 + 0.4, dur: 0.6, peak: 0.06 });
    },
    select: (t0) => tone(bus.sfx, { freq: 1200, type: 'sine', t0, dur: 0.04, peak: 0.08 }),
    confirm: (t0) => tone(bus.sfx, { freq: 880, type: 'sine', t0, dur: 0.08, peak: 0.12, slideTo: 1320 }),
    back: (t0) => tone(bus.sfx, { freq: 660, type: 'sine', t0, dur: 0.08, peak: 0.1, slideTo: 440 }),
    countdown: (t0) => tone(bus.sfx, { freq: 784, type: 'sine', t0, dur: 0.1, peak: 0.12 }),
    go: (t0) => {
      tone(bus.sfx, { freq: 1568, type: 'sine', t0, dur: 0.3, peak: 0.13 });
      tone(bus.sfx, { freq: 1175, type: 'triangle', t0, dur: 0.3, peak: 0.07 });
    },
  };

  // ---------- 音楽：16分音符の刻みで少し先まで予定する ----------
  function kick(t0, peak) {
    tone(bus.music, { freq: 130, type: 'sine', t0, dur: 0.14, peak, slideTo: 44, attack: 0.002 });
  }
  function snare(t0, peak) {
    noise(bus.music, { t0, dur: 0.11, peak, filter: 1900, q: 0.7 });
    tone(bus.music, { freq: 210, type: 'triangle', t0, dur: 0.06, peak: peak * 0.6 });
  }
  function hat(t0, peak) {
    noise(bus.music, { t0, dur: 0.03, peak, filter: 7000, q: 0.9, type: 'highpass' });
  }

  function musicStep(th, n, t0, sixteenth) {
    const perSection = 8 * 16;
    const section = th.sections[Math.floor(n / perSection) % th.sections.length];
    const barIndex = Math.floor((n % perSection) / 16);
    const s16 = n % 16;
    const [root, quality] = section.chords[barIndex];
    const up = th.reactive && finale ? 2 : 0; // 終盤は全体を1音上げる
    const stage = th.reactive ? policeStage : 0;
    const lv = th.level;
    const eighth = sixteenth * 2;
    if (s16 % 2 === 0) {
      const e = s16 / 2;
      // 旋律
      const m = section.melody[barIndex][e];
      if (m) tone(bus.music, { freq: NOTE(m + up), type: th.lead, t0, dur: eighth * 0.8, peak: 0.062 * lv });
      // ベース：根音・5度・オクターブ・3度。警察が2人の時は8分で刻む
      const walk = [root, 0, root + 7, 0, root + 12, 0, root + 7, root + THIRD[quality]];
      const b = stage >= 2 ? walk[e] || root : walk[e];
      if (b) tone(bus.music, { freq: NOTE(b + up), type: 'triangle', t0, dur: eighth * (stage >= 2 ? 0.8 : 1.5), peak: 0.13 * lv });
      // 和音の刻み（裏拍）
      if (e % 2 === 1) {
        for (const iv of [0, THIRD[quality], 7, quality === '7' ? SEVENTH[quality] : 12]) {
          tone(bus.music, { freq: NOTE(root + 24 + iv + up), type: 'triangle', t0, dur: eighth * 0.5, peak: 0.022 * lv });
        }
      }
    }
    if (th.drums) {
      if (s16 === 0 || s16 === 8 || (stage >= 2 && s16 === 10)) kick(t0, 0.2);
      if (stage >= 1 && (s16 === 4 || s16 === 12)) snare(t0, 0.07 + 0.02 * stage);
      if (s16 % 4 === 2) hat(t0, 0.04);
      else if (stage >= 2 && s16 % 2 === 1) hat(t0, 0.022);
      else if (stage >= 1 && s16 % 4 === 0) hat(t0, 0.02);
    } else if (s16 % 4 === 2) {
      hat(t0, 0.012);
    }
  }

  // ---------- 環境音の小さな飾り：昼は鳥、夜は虫 ----------
  function ambientDetail(t0) {
    if (area === 'night' || area === 'dusk') {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i += 1) tone(bus.ambient, { freq: 4300 + Math.random() * 120, type: 'sine', t0: t0 + i * 0.075, dur: 0.045, peak: 0.035 });
    } else {
      const base = 2400 + Math.random() * 1400;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i += 1) tone(bus.ambient, { freq: base * (1 + i * 0.04), type: 'sine', t0: t0 + i * 0.11, dur: 0.08, peak: 0.05, slideTo: base * 1.35 });
    }
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.25;
    const th = theme ? MUSIC_THEMES[theme] : null;
    if (th) {
      const sixteenth = 60 / th.bpm / 4;
      if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.05;
      while (nextNoteTime < ahead) {
        musicStep(th, step, nextNoteTime, sixteenth);
        nextNoteTime += sixteenth;
        step += 1;
      }
    }
    if (gameOn && policeStage > 0) {
      const gap = policeStage >= 2 ? 0.3 : 0.48;
      if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
      while (nextStepTime < ahead) {
        SFX.footstep(nextStepTime);
        nextStepTime += gap;
      }
    }
    if (gameOn && danger) {
      if (nextBeatTime < ctx.currentTime) nextBeatTime = ctx.currentTime + 0.05;
      while (nextBeatTime < ahead) {
        SFX.heartbeat(nextBeatTime);
        nextBeatTime += 0.82;
      }
    }
    if (gameOn && ambientNode) {
      if (nextBirdTime < ctx.currentTime - 1) nextBirdTime = ctx.currentTime + 1 + Math.random() * 2;
      while (nextBirdTime < ahead) {
        ambientDetail(nextBirdTime);
        nextBirdTime += area === 'night' || area === 'dusk' ? 1.1 + Math.random() * 2.2 : 2.2 + Math.random() * 4.5;
      }
    }
  }

  const ambientCutoff = (a) => ({ day: 520, evening: 460, dusk: 380, night: 320 })[a] ?? 520;

  function startAmbient() {
    if (!ctx || ambientNode) return;
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
    ambientNode = { src, f, lfo };
  }

  function stopAmbient() {
    if (!ambientNode) return;
    try {
      ambientNode.src.stop();
      ambientNode.lfo.stop();
    } catch {
      /* already stopped */
    }
    ambientNode = null;
  }

  function setTheme(next) {
    if (next && !MUSIC_THEMES[next]) return;
    if (next === theme) return;
    theme = next;
    step = 0;
    if (ctx) nextNoteTime = ctx.currentTime + 0.1;
  }

  return {
    get available() {
      return !failed;
    },
    get settings() {
      return { ...settings };
    },
    /** 流している曲の名前（なければ null）。 */
    get music() {
      return theme;
    },
    setSettings(next) {
      settings = sanitizeAudioSettings({ ...settings, ...next });
      applyGains();
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
      setTheme(next);
    },
    /** 本編の音楽と環境音を始める（開始・再開の時だけ）。 */
    startGameAudio() {
      if (!ctx) return;
      gameOn = true;
      theme = null;
      setTheme('game');
      startAmbient();
    },
    stopGameAudio() {
      gameOn = false;
      theme = null;
      policeStage = 0;
      danger = false;
      stopAmbient();
    },
    /** 一時停止・画面離脱。予定済みの音を捨て、復帰時にまとめて鳴らさない。 */
    async suspend() {
      gameOn = false;
      theme = null;
      danger = false;
      stopAmbient();
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
    /** 終盤（40棟目から）は曲の調を上げる。 */
    setFinale(on) {
      finale = !!on;
    },
    setArea(next) {
      if (next === area) return;
      area = next;
      if (ambientNode) ambientNode.f.frequency.setTargetAtTime(ambientCutoff(next), ctx.currentTime, 0.5);
    },
    play(name, opts) {
      const def = SOUND_EVENTS[name];
      if (!def || !ctx || ctx.state !== 'running' || settings.muted) return false;
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
  };
}
