// 音。素材ファイルは使わず、Web Audio でその場で合成する（有償素材・外部素材なし）。
// - 音楽／効果音／環境音の3音量と全体消音。消音を解除すると設定済みの音量へ戻す（0は「未設定」と扱わない）。
// - 開始・再開などの明示的な操作で音声を準備する。使えない端末でもゲームは続く。
// - 一時停止・画面離脱で止め、復帰時に過去の足音や警告をまとめて鳴らさない。
// - 重要な通知の間は音楽・環境音を下げる。同じ成功音の連発を抑える。

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
  warning: { bus: 'sfx', minGapMs: 1500, important: true },
  switchOk: { bus: 'sfx', minGapMs: 800, important: false },
  success: { bus: 'sfx', minGapMs: 600, important: false },
  combo: { bus: 'sfx', minGapMs: 400, important: true },
  milestone: { bus: 'sfx', minGapMs: 1000, important: true },
  unlock: { bus: 'sfx', minGapMs: 1000, important: true },
  detected: { bus: 'sfx', minGapMs: 2000, important: true },
  clear: { bus: 'sfx', minGapMs: 2000, important: true },
  result: { bus: 'sfx', minGapMs: 1000, important: false },
  select: { bus: 'sfx', minGapMs: 60, important: false },
  confirm: { bus: 'sfx', minGapMs: 60, important: false },
  back: { bus: 'sfx', minGapMs: 60, important: false },
  countdown: { bus: 'sfx', minGapMs: 300, important: false },
});

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
// 軽快でコミカルな繰り返し（C長調のペンタトニック、8小節）
const MELODY = [72, 0, 76, 79, 76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 72, 0, 74, 0, 76, 79, 81, 0, 79, 76, 74, 0, 72, 74, 72, 0, 0, 0];
const BASS = [48, 0, 55, 0, 52, 0, 55, 0, 53, 0, 57, 0, 55, 0, 52, 0];

export function createMixer({ AudioContextImpl = globalThis.AudioContext ?? globalThis.webkitAudioContext } = {}) {
  let ctx = null;
  let master;
  const bus = {};
  const duck = {};
  let settings = { ...DEFAULT_AUDIO };
  let musicOn = false;
  let ambientNode = null;
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let policeStage = 0;
  let nextStepTime = 0;
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

  function tone(dest, { freq, type = 'square', t0, dur = 0.12, peak = 0.2, slideTo = null }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, 0.005, dur * 0.4, dur * 0.6, peak);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  let noiseBuffer = null;
  function noise(dest, { t0, dur = 0.08, peak = 0.2, filter = 900, q = 0.8 }) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < d.length; i += 1) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x7fffffff) * 2 - 1;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
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

  const SFX = {
    footstep: (t0) => noise(bus.sfx, { t0, dur: 0.06, peak: 0.12 + 0.1 * policeStage, filter: 300 + 120 * policeStage, q: 1.2 }),
    warning: (t0) => {
      tone(bus.sfx, { freq: 880, t0, dur: 0.14, peak: 0.18 });
      tone(bus.sfx, { freq: 660, t0: t0 + 0.18, dur: 0.14, peak: 0.18 });
    },
    switchOk: (t0) => {
      tone(bus.sfx, { freq: 1046, type: 'sine', t0, dur: 0.09, peak: 0.16 });
      tone(bus.sfx, { freq: 1318, type: 'sine', t0: t0 + 0.07, dur: 0.12, peak: 0.14 });
    },
    success: (t0) => tone(bus.sfx, { freq: 660, type: 'triangle', t0, dur: 0.16, peak: 0.2, slideTo: 990 }),
    combo: (t0) => [0, 4, 7, 12].forEach((n, i) => tone(bus.sfx, { freq: NOTE(72 + n), type: 'triangle', t0: t0 + i * 0.06, dur: 0.12, peak: 0.18 })),
    milestone: (t0) => [0, 7, 12].forEach((n, i) => tone(bus.sfx, { freq: NOTE(67 + n), type: 'square', t0: t0 + i * 0.1, dur: 0.16, peak: 0.12 })),
    unlock: (t0) => [0, 5, 9, 12, 17].forEach((n, i) => tone(bus.sfx, { freq: NOTE(76 + n), type: 'sine', t0: t0 + i * 0.05, dur: 0.1, peak: 0.14 })),
    detected: (t0) => {
      tone(bus.sfx, { freq: 700, type: 'sawtooth', t0, dur: 0.5, peak: 0.16, slideTo: 180 });
      noise(bus.sfx, { t0, dur: 0.5, peak: 0.08, filter: 1500 });
    },
    clear: (t0) => [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(bus.sfx, { freq: NOTE(67 + n), type: 'triangle', t0: t0 + i * 0.08, dur: 0.22, peak: 0.16 })),
    result: (t0) => [60, 64, 67].forEach((n) => tone(bus.sfx, { freq: NOTE(n), type: 'sine', t0, dur: 0.6, peak: 0.08 })),
    select: (t0) => tone(bus.sfx, { freq: 1200, type: 'sine', t0, dur: 0.04, peak: 0.08 }),
    confirm: (t0) => tone(bus.sfx, { freq: 880, type: 'sine', t0, dur: 0.08, peak: 0.12, slideTo: 1320 }),
    back: (t0) => tone(bus.sfx, { freq: 660, type: 'sine', t0, dur: 0.08, peak: 0.1, slideTo: 440 }),
    countdown: (t0) => tone(bus.sfx, { freq: 784, type: 'sine', t0, dur: 0.1, peak: 0.12 }),
  };

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.25;
    if (musicOn) {
      const beat = 60 / 132 / 2; // 8分音符
      if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.05;
      while (nextNoteTime < ahead) {
        const m = MELODY[step % MELODY.length];
        if (m) tone(bus.music, { freq: NOTE(m), type: 'square', t0: nextNoteTime, dur: beat * 0.9, peak: 0.07 });
        if (step % 2 === 0) {
          const b = BASS[(step / 2) % BASS.length];
          if (b) tone(bus.music, { freq: NOTE(b), type: 'triangle', t0: nextNoteTime, dur: beat * 1.6, peak: 0.12 });
        }
        nextNoteTime += beat;
        step += 1;
      }
    }
    if (musicOn && policeStage > 0) {
      const gap = policeStage >= 2 ? 0.3 : 0.48;
      if (nextStepTime < ctx.currentTime) nextStepTime = ctx.currentTime + 0.05;
      while (nextStepTime < ahead) {
        SFX.footstep(nextStepTime);
        nextStepTime += gap;
      }
    }
  }

  function startAmbient() {
    if (!ctx || ambientNode) return;
    const src = ctx.createBufferSource();
    if (!noiseBuffer) noise(ctx.createGain(), { t0: ctx.currentTime, dur: 0.01, peak: 0.0002 });
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = area === 'night' ? 320 : 520;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(f);
    f.connect(g);
    g.connect(bus.ambient);
    src.start();
    ambientNode = { src, f };
  }

  function stopAmbient() {
    if (!ambientNode) return;
    try {
      ambientNode.src.stop();
    } catch {
      /* already stopped */
    }
    ambientNode = null;
  }

  return {
    get available() {
      return !failed;
    },
    get settings() {
      return { ...settings };
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
      if (!schedulerTimer) schedulerTimer = setInterval(schedule, 100);
      return c.state === 'running';
    },
    /** 本編の音楽と環境音を始める（開始・再開の時だけ）。 */
    startGameAudio() {
      if (!ctx) return;
      musicOn = true;
      step = 0;
      nextNoteTime = ctx.currentTime + 0.1;
      startAmbient();
    },
    stopGameAudio() {
      musicOn = false;
      policeStage = 0;
      stopAmbient();
    },
    /** 一時停止・画面離脱。予定済みの音を捨て、復帰時にまとめて鳴らさない。 */
    async suspend() {
      musicOn = false;
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
    setArea(next) {
      area = next;
      if (ambientNode) ambientNode.f.frequency.setTargetAtTime(next === 'night' ? 320 : 520, ctx.currentTime, 0.5);
    },
    play(name) {
      const def = SOUND_EVENTS[name];
      if (!def || !ctx || ctx.state !== 'running' || settings.muted) return false;
      const now = performance.now();
      if (now - (lastPlayed.get(name) ?? -Infinity) < def.minGapMs) return false;
      lastPlayed.set(name, now);
      if (def.important) duckBackground();
      try {
        SFX[name](ctx.currentTime + 0.01);
      } catch {
        return false;
      }
      return true;
    },
  };
}
