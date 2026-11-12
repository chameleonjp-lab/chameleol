// 音の合成・10棟区切りBGM・予約/同時発音制御・停止と後片付けの検証（SOUND-01〜）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMixer,
  buildingTier,
  SOUND_EVENTS,
  MUSIC_THEMES,
  sanitizeAudioSettings,
  DEFAULT_AUDIO,
  MAX_CONCURRENT_VOICES,
  MAX_SCHEDULED_VOICES,
} from '../../src/audio/mixer.js';

// 要件から独立に定義した全35種の音イベント一覧（既存24種＋初期提案追加11種）
const EXPECTED_SOUND_EVENTS = Object.freeze([
  // 既存24種
  'footstep',
  'heartbeat',
  'warning',
  'whistle',
  'relief',
  'switchOk',
  'success',
  'combo',
  'comboBreak',
  'milestone',
  'unlock',
  'locked',
  'alarm',
  'jump',
  'jewel',
  'detected',
  'clear',
  'result',
  'best',
  'select',
  'confirm',
  'back',
  'countdown',
  'go',
  // 追加11種
  'glassBurst',
  'land',
  'touchPalette',
  'touchBar',
  'colorStep',
  'colorRelease',
  'guideClear',
  'passBuilding',
  'policeSearch',
  'tierUp',
  'lastFive',
]);

function enableIntervalMock(t) {
  try {
    t.mock.timers.enable({ apis: ['setInterval'] });
  } catch {
    t.mock.timers.enable(['setInterval']);
  }
}

/**
 * 音の開始時刻・予定終了時刻・途中強制停止・自然終了・disconnect を区別して記録する AudioContext モック。
 * 未来の終了予約 stop(when) を途中停止と誤認しない。
 */
function recordingContext() {
  const made = {
    osc: 0,
    noise: 0,
    gains: [],
    filters: [],
    oscNodes: [],
    noiseNodes: [],
  };
  const param = () => ({
    value: 0,
    setValuePairs: [],
    setValueAtTime(v, t) {
      this.value = v;
      this.setValuePairs.push([v, t]);
    },
    exponentialRampToValueAtTime(v, t) {
      this.value = v;
    },
    setTargetAtTime(v, t) {
      this.value = v;
    },
    cancelScheduledValues() {},
  });

  class Ctx {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = { connect() {}, disconnect() {} };
      Ctx.last = this;
    }
    async resume() {
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {
      this.state = 'closed';
    }
    createDynamicsCompressor() {
      return {
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
        connect() {},
        disconnect() {},
      };
    }
    createGain() {
      const g = {
        gain: param(),
        connectedTo: [],
        disconnected: 0,
        connect(dest) {
          this.connectedTo.push(dest);
        },
        disconnect() {
          this.disconnected += 1;
        },
      };
      made.gains.push(g);
      return g;
    }
    createBiquadFilter() {
      const f = {
        frequency: param(),
        Q: param(),
        type: 'lowpass',
        disconnected: 0,
        connect() {},
        disconnect() {
          this.disconnected += 1;
        },
      };
      made.filters.push(f);
      return f;
    }
    createBuffer(_c, len) {
      return { getChannelData: () => new Float32Array(len) };
    }
    createOscillator() {
      made.osc += 1;
      const ctx = this;
      const listeners = new Map();
      const o = {
        kind: 'osc',
        frequency: param(),
        type: 'sine',
        startTime: null,
        scheduledStop: null,
        forcedStopAt: null,
        endedNaturally: false,
        disconnected: 0,
        connect() {},
        disconnect() {
          this.disconnected += 1;
        },
        start(when = ctx.currentTime) {
          this.startTime = when;
        },
        stop(when) {
          if (when !== undefined && this.scheduledStop === null) {
            this.scheduledStop = when;
          } else {
            const stopAt = when === undefined ? ctx.currentTime : when;
            if (this.scheduledStop === null || stopAt < this.scheduledStop - 1e-6) {
              this.forcedStopAt = stopAt;
            }
          }
        },
        addEventListener(ev, fn) {
          listeners.set(ev, fn);
        },
        triggerEnded() {
          this.endedNaturally = true;
          const fn = listeners.get('ended');
          if (fn) {
            listeners.delete('ended');
            fn();
          }
        },
      };
      made.oscNodes.push(o);
      return o;
    }
    createBufferSource() {
      made.noise += 1;
      const ctx = this;
      const listeners = new Map();
      const s = {
        kind: 'noise',
        buffer: null,
        loop: false,
        startTime: null,
        scheduledStop: null,
        forcedStopAt: null,
        endedNaturally: false,
        disconnected: 0,
        connect() {},
        disconnect() {
          this.disconnected += 1;
        },
        start(when = ctx.currentTime) {
          this.startTime = when;
        },
        stop(when) {
          if (when !== undefined && this.scheduledStop === null) {
            this.scheduledStop = when;
          } else {
            const stopAt = when === undefined ? ctx.currentTime : when;
            if (this.scheduledStop === null || stopAt < this.scheduledStop - 1e-6) {
              this.forcedStopAt = stopAt;
            }
          }
        },
        addEventListener(ev, fn) {
          listeners.set(ev, fn);
        },
        triggerEnded() {
          this.endedNaturally = true;
          const fn = listeners.get('ended');
          if (fn) {
            listeners.delete('ended');
            fn();
          }
        },
      };
      made.noiseNodes.push(s);
      return s;
    }
  }
  return { Ctx, made };
}

test('すべての出来事（独立定義した全35種）に音があり、すべて実際に鳴らして検証できる', async () => {
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  assert.equal(mixer.running, false);
  assert.equal(mixer.play('select'), false, '準備の前は鳴らさない');
  assert.equal(await mixer.prepare(), true);
  assert.equal(mixer.running, true);

  const actualKeys = Object.keys(SOUND_EVENTS);
  assert.deepEqual(
    [...actualKeys].sort(),
    [...EXPECTED_SOUND_EVENTS].sort(),
    'SOUND_EVENTS の定義一覧が要件の35種と完全一致する',
  );
  assert.equal(actualKeys.length, 35);

  const ctx = Ctx.last;
  for (const name of EXPECTED_SOUND_EVENTS) {
    const before = made.osc + made.noise;
    assert.equal(mixer.play(name, { level: 2, combo: 4, tier: 3, building: 48, v: 6000 }), true, `${name} が再生できる`);
    assert.ok(made.osc + made.noise > before, `${name} は発音ノードを生成する`);
    ctx.currentTime += 0.5;
  }
  assert.equal(mixer.play('no-such-sound'), false);
  await mixer.suspend();
  mixer.dispose();
});

test('同じ音は最短間隔より早くは鳴らさない。消音中・音量0中は鳴らさず不要なノードも作らない', async () => {
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  assert.equal(mixer.play('warning'), true);
  assert.equal(mixer.play('warning'), false, 'minGapMs 未満の連打は抑止');

  mixer.setSettings({ muted: true });
  const beforeMuted = made.osc + made.noise;
  assert.equal(mixer.play('clear'), false);
  assert.equal(made.osc + made.noise, beforeMuted, '消音中はノードを作らない');

  mixer.setSettings({ muted: false, sfx: 0 });
  assert.equal(mixer.play('clear'), false, 'sfx=0 の間は鳴らさない');
  assert.equal(made.osc + made.noise, beforeMuted, 'sfx=0 の間もノードを作らない');

  mixer.setSettings({ sfx: 0.7 });
  assert.equal(mixer.play('clear'), true, '音量復帰後は正常に鳴る');
  await mixer.suspend();
  mixer.dispose();
});

test('曲は切り替えられ、止めると鳴らない。本編の曲は停止・画面離脱で止まる', async (t) => {
  enableIntervalMock(t);
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  const ctx = Ctx.last;
  const run = (seconds) => {
    for (let i = 0; i < seconds * 10; i += 1) {
      ctx.currentTime += 0.1;
      t.mock.timers.tick(100);
    }
  };
  for (const theme of Object.keys(MUSIC_THEMES)) {
    mixer.setMusic(theme);
    assert.equal(mixer.music, theme);
    const before = made.osc;
    run(40);
    assert.ok(made.osc - before > 100, `${theme} が刻まれる`);
  }
  mixer.setMusic(null);
  let before = made.osc + made.noise;
  run(2);
  assert.equal(made.osc + made.noise, before, '曲がない間は何も作らない');

  mixer.startGameAudio({ reset: true });
  assert.equal(mixer.music, 'game');
  before = made.osc + made.noise;
  run(4);
  const calm = made.osc + made.noise - before;
  mixer.setPoliceStage(2);
  mixer.setDanger(true);
  mixer.setFinale(true);
  mixer.setArea('night');
  before = made.osc + made.noise;
  run(4);
  assert.ok(made.osc + made.noise - before > calm, '警察が近いと音が増える');
  await mixer.suspend();
  assert.equal(mixer.music, null);
  ctx.state = 'running';
  before = made.osc + made.noise;
  run(2);
  assert.equal(made.osc + made.noise, before, '停止の後は、再開するまで鳴らさない');
  mixer.dispose();
});

test('10棟区切り（1〜10, 11〜20, 21〜30, 31〜40, 41〜50棟）の境界と5段階BGMの段階的豪華化', async (t) => {
  enableIntervalMock(t);
  assert.equal(buildingTier(1), 0);
  assert.equal(buildingTier(10), 0);
  assert.equal(buildingTier(11), 1);
  assert.equal(buildingTier(20), 1);
  assert.equal(buildingTier(21), 2);
  assert.equal(buildingTier(30), 2);
  assert.equal(buildingTier(31), 3);
  assert.equal(buildingTier(40), 3);
  assert.equal(buildingTier(41), 4);
  assert.equal(buildingTier(50), 4);

  const countForBuilding = async (b) => {
    const { Ctx, made } = recordingContext();
    const mixer = createMixer({ AudioContextImpl: Ctx });
    await mixer.prepare();
    const ctx = Ctx.last;
    mixer.setBuilding(b);
    mixer.setFinale(b >= 41);
    mixer.setMusic('game');
    for (let i = 0; i < 80; i += 1) {
      ctx.currentTime += 0.1;
      t.mock.timers.tick(100);
    }
    const total = made.osc + made.noise;
    mixer.dispose();
    return total;
  };

  const c0 = await countForBuilding(5);   // Tier 0 (1〜10棟)
  const c1 = await countForBuilding(15);  // Tier 1 (11〜20棟)
  const c2 = await countForBuilding(25);  // Tier 2 (21〜30棟)
  const c3 = await countForBuilding(35);  // Tier 3 (31〜40棟)
  const c4 = await countForBuilding(45);  // Tier 4 (41〜50棟)

  assert.ok(c1 > c0, `Tier 1 (${c1}) > Tier 0 (${c0})`);
  assert.ok(c2 > c1, `Tier 2 (${c2}) > Tier 1 (${c1})`);
  assert.ok(c3 > c2, `Tier 3 (${c3}) > Tier 2 (${c2})`);
  assert.ok(c4 > c3, `Tier 4 (${c4}) > Tier 3 (${c3})`);
});

test('40棟目と41棟目の転調境界・持続和音・16分音符アルペジオ・対旋律の検証', async (t) => {
  enableIntervalMock(t);
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  const ctx = Ctx.last;

  // 40棟目（Tier 3, finale=false）：転調なし（主旋律初音 C5=72 -> 523.25Hz）、対旋律(sawtooth)あり
  mixer.setBuilding(40);
  mixer.setFinale(false);
  mixer.setMusic('game');
  ctx.currentTime += 0.1;
  t.mock.timers.tick(100);

  const b40Lead = made.oscNodes.find((o) => o.type === 'square');
  assert.ok(b40Lead, '40棟目で主旋律が鳴る');
  const freq72 = 440 * 2 ** ((72 - 69) / 12);
  assert.ok(Math.abs(b40Lead.frequency.value - freq72) < 0.05, '40棟目はまだ転調しない');

  // 41棟目（Tier 4, finale=true）：+2半音転調（D5=74 -> 587.33Hz）
  made.oscNodes.length = 0;
  mixer.setMusic(null);
  mixer.setBuilding(41);
  mixer.setFinale(true);
  mixer.setMusic('game');
  ctx.currentTime += 0.1;
  t.mock.timers.tick(100);

  const b41Lead = made.oscNodes.find((o) => o.type === 'square');
  assert.ok(b41Lead, '41棟目で主旋律が鳴る');
  const freq74 = 440 * 2 ** ((74 - 69) / 12);
  assert.ok(Math.abs(b41Lead.frequency.value - freq74) < 0.05, '41棟目で+2半音転調する');
  mixer.dispose();
});

test('45棟・警官2人・心拍あり・乱数0.5固定・8秒間の高負荷環境で、長尺伴奏パッドが早期強制停止されず、重要音が保護される', async (t) => {
  enableIntervalMock(t);
  const origRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const { Ctx, made } = recordingContext();
    const mixer = createMixer({ AudioContextImpl: Ctx });
    await mixer.prepare();
    const ctx = Ctx.last;

    mixer.setBuilding(45);
    mixer.setFinale(true);
    mixer.setPoliceStage(2);
    mixer.setDanger(true);
    mixer.setArea('night');
    mixer.startGameAudio({ reset: true });

    for (let i = 0; i < 80; i += 1) {
      ctx.currentTime += 0.1;
      t.mock.timers.tick(100);
      if (i % 10 === 0) mixer.play('passBuilding', { combo: 2 });
      if (i === 40) mixer.play('tierUp', { tier: 4 });
    }

    // 長尺伴奏パッド（予定再生時間 >= 1.5秒）を抽出し、予定終了時刻より前に強制停止されたものが0件であることを検証
    const longPads = made.oscNodes.filter(
      (o) => o.startTime !== null && o.scheduledStop !== null && o.scheduledStop - o.startTime >= 1.5,
    );
    assert.ok(longPads.length >= 9, `長尺パッドが十分に生成されている (生成数=${longPads.length})`);
    const earlyStoppedPads = longPads.filter((o) => o.forcedStopAt !== null);
    assert.equal(earlyStoppedPads.length, 0, '優先度2の長尺伴奏パッドは1件も早期強制停止されない');
    assert.ok(mixer.activeVoiceCount <= MAX_SCHEDULED_VOICES, `予約保持数が上限内 (${mixer.activeVoiceCount} <= ${MAX_SCHEDULED_VOICES})`);
    mixer.dispose();
  } finally {
    Math.random = origRandom;
  }
});

test('同時発音上限超過時に低優先度の装飾音を間引き・新規拒否し、重要音（priority=3）を保護する', async () => {
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();

  // 同一時刻に priority=2/3 の長尺SE（unlock, clear, detected, milestone, guideClear, tierUp）を連続発火させて枠を埋める
  for (const ev of ['unlock', 'clear', 'detected', 'milestone', 'guideClear', 'tierUp', 'warning', 'whistle']) {
    assert.equal(mixer.play(ev), true);
  }
  const activeBeforeLow = mixer.activeVoiceCount;
  assert.ok(activeBeforeLow >= MAX_CONCURRENT_VOICES, `重要音で ${activeBeforeLow} ボイスが予約されている`);

  // この状態で priority=0 の select / touchPalette を鳴らそうとしても、重要音は1件も強制停止されず、低優先度音は新規生成を見送る
  const forcedImportantBefore = made.oscNodes.filter((o) => o.forcedStopAt !== null).length;
  const oscBeforeLow = made.osc;
  mixer.play('touchPalette');
  assert.equal(made.osc, oscBeforeLow, '保護音で枠が埋まっている時は priority=0 の装飾音を新規生成しない');
  const forcedImportantAfter = made.oscNodes.filter((o) => o.forcedStopAt !== null).length;
  assert.equal(forcedImportantAfter, forcedImportantBefore, '重要音は一切間引かれない');
  mixer.dispose();
});

test('stopGameAudio は本編BGM・足音・心拍・環境音を取り消して単発SEを保護し、停止と再開を繰り返してもBGM位置が狂わない', async (t) => {
  enableIntervalMock(t);
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  const ctx = Ctx.last;

  mixer.setBuilding(25);
  mixer.setPoliceStage(2);
  mixer.setDanger(true);
  mixer.startGameAudio({ reset: true });

  ctx.currentTime += 0.1;
  t.mock.timers.tick(100);

  // 単発の重要SE（unlock）を鳴らす
  const oscBeforeUnlock = made.oscNodes.length;
  assert.equal(mixer.play('unlock'), true);
  const unlockNodes = made.oscNodes.slice(oscBeforeUnlock);
  assert.ok(unlockNodes.length > 0);

  // stopGameAudio を呼ぶと、本編BGM・足音・心拍は停止されるが、単発の unlock ノードは強制停止されない
  mixer.stopGameAudio();
  const forcedUnlock = unlockNodes.filter((o) => o.forcedStopAt !== null);
  assert.equal(forcedUnlock.length, 0, '単発の unlock SE は stopGameAudio で消されない');

  // 停止と再開（reset: false）を複数回繰り返しても、ステップが過去へ巻き戻りすぎたり二重予約されたりしない
  for (let cycle = 0; cycle < 3; cycle += 1) {
    mixer.startGameAudio({ reset: false });
    ctx.currentTime += 0.12;
    t.mock.timers.tick(100);
    mixer.stopGameAudio();
    // 停止中にさらに stopGameAudio を重ねても壊れない
    mixer.stopGameAudio();
  }
  mixer.startGameAudio({ reset: false });
  const beforeResumeTick = made.osc;
  ctx.currentTime += 0.12;
  t.mock.timers.tick(100);
  assert.ok(made.osc > beforeResumeTick, '停止・再開を繰り返した後も続きから正常にBGMが刻まれる');
  mixer.dispose();
});

test('自然終了・強制停止・破棄のすべてで、本体・Gain・LFO・Filter・連続環境音が disconnect される', async () => {
  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  const ctx = Ctx.last;

  // 1. 自然終了（ended イベント発火）での disconnect
  const oscBefore = made.oscNodes.length;
  const gainBefore = made.gains.length;
  mixer.play('select');
  const selectOsc = made.oscNodes[oscBefore];
  const selectGain = made.gains[gainBefore];
  selectOsc.triggerEnded();
  assert.ok(selectOsc.disconnected >= 1, '自然終了時に Oscillator 本体が disconnect される');
  assert.ok(selectGain.disconnected >= 1, '自然終了時に Gain が disconnect される');

  // 2. vibrato LFO と Filter を使う whistle の強制停止（stopSfx）での disconnect
  const oscBeforeWhistle = made.oscNodes.length;
  const filterBeforeWhistle = made.filters.length;
  mixer.play('whistle');
  const whistleOscs = made.oscNodes.slice(oscBeforeWhistle);
  const whistleFilters = made.filters.slice(filterBeforeWhistle);
  assert.ok(whistleOscs.length >= 4, '本体＋LFOのOscillatorが生成される');
  assert.ok(whistleFilters.length >= 2, 'BiquadFilterが生成される');
  mixer.stopSfx();
  for (const o of whistleOscs) {
    assert.ok(o.disconnected >= 1, '強制停止時に本体および揺れ用LFOが disconnect される');
  }
  for (const f of whistleFilters) {
    assert.ok(f.disconnected >= 1, '強制停止時にフィルターが disconnect される');
  }

  // 3. 連続環境音（startAmbient -> stopGameAudio / dispose）の disconnect
  const noiseBeforeAmb = made.noiseNodes.length;
  mixer.startGameAudio({ reset: true });
  const ambNoise = made.noiseNodes[noiseBeforeAmb];
  assert.ok(ambNoise?.loop === true, '連続環境音のループノードが開始される');
  mixer.stopGameAudio();
  assert.ok(ambNoise.disconnected >= 1, 'stopGameAudio で連続環境音ノードが disconnect される');

  mixer.dispose();
  assert.equal(ctx.state, 'closed');
});

test('音が使えない端末でも、呼び出しは失敗せずに続く', async () => {
  const mixer = createMixer({ AudioContextImpl: null });
  assert.equal(await mixer.prepare(), false);
  assert.equal(mixer.available, false);
  assert.equal(mixer.running, false);
  assert.equal(mixer.play('clear'), false);
  mixer.startGameAudio();
  mixer.setMusic('menu');
  mixer.stopGameAudio();
  await mixer.suspend();
  mixer.dispose();
});

test('保存した 0 と消音は有効な設定として残し、音量0中は予約ノードを生成せず復帰時に再開する', async (t) => {
  enableIntervalMock(t);
  assert.deepEqual(sanitizeAudioSettings({ music: 0, sfx: 0, ambient: 0, muted: true }), {
    music: 0,
    sfx: 0,
    ambient: 0,
    muted: true,
  });
  assert.deepEqual(sanitizeAudioSettings({ music: 5, sfx: 'x' }), { ...DEFAULT_AUDIO });

  const { Ctx, made } = recordingContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  const ctx = Ctx.last;

  mixer.setSettings({ music: 0, sfx: 0, ambient: 0 });
  mixer.startGameAudio({ reset: true });
  const beforeZero = made.osc + made.noise;
  ctx.currentTime += 0.3;
  t.mock.timers.tick(300);
  assert.equal(made.osc + made.noise, beforeZero, '各音量0の間はBGM・足音・環境音のノードを生成しない');

  mixer.setSettings({ music: 0.45, sfx: 0.7, ambient: 0.35 });
  ctx.currentTime += 0.3;
  t.mock.timers.tick(300);
  assert.ok(made.osc + made.noise > beforeZero, '音量を0から戻すとBGM・環境音の生成が再開する');
  mixer.dispose();
});

test('本編開始は前の曲と本編の再開始前の予約を取り消し、単発SEは残す', async (t) => {
  enableIntervalMock(t);
  for (const previousTheme of ['menu', 'practice', 'game']) {
    const { Ctx, made } = recordingContext();
    const mixer = createMixer({ AudioContextImpl: Ctx });
    await mixer.prepare();
    const ctx = Ctx.last;
    mixer.setMusic(previousTheme);
    ctx.currentTime += 0.1;
    t.mock.timers.tick(100);
    const previousVoices = [...made.oscNodes];
    assert.ok(previousVoices.length > 0, `${previousTheme} の予約がある`);
    const seStart = made.oscNodes.length;
    mixer.play('unlock');
    const singleShot = made.oscNodes.slice(seStart);
    assert.ok(singleShot.length > 0, '保護する単発SEがある');
    mixer.startGameAudio({ reset: true });
    assert.equal(mixer.music, 'game');
    assert.ok(previousVoices.every((voice) => voice.forcedStopAt !== null), `${previousTheme} の予約を残さない`);
    assert.ok(singleShot.every((voice) => voice.forcedStopAt === null), '単発SEは打ち切らない');
    mixer.dispose();
  }
});
