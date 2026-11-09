// 音の合成（SOUND-01 の判定部分）。実際の聞こえ方は確かめられないので、
// 「すべての出来事に音があり、鳴らしても例外が出ない」「曲が予定どおり刻まれる」「止めたら鳴らない」だけを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMixer, SOUND_EVENTS, MUSIC_THEMES, sanitizeAudioSettings, DEFAULT_AUDIO } from '../../src/audio/mixer.js';

/** 呼び出しを数えるだけの、にせの AudioContext。 */
function fakeContext() {
  const made = { osc: 0, noise: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = (extra = {}) => ({ connect() {}, start() {}, stop() {}, ...extra });
  class Ctx {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = node();
      Ctx.last = this;
    }
    async resume() {
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    createGain() {
      return node({ gain: param() });
    }
    createOscillator() {
      made.osc += 1;
      return node({ frequency: param(), type: 'sine' });
    }
    createBiquadFilter() {
      return node({ frequency: param(), Q: param(), type: 'lowpass' });
    }
    createBuffer(_c, len) {
      return { getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      made.noise += 1;
      return node({ buffer: null, loop: false });
    }
  }
  return { Ctx, made };
}

test('すべての出来事に音があり、鳴らしても例外が出ない', async () => {
  const { Ctx, made } = fakeContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  assert.equal(mixer.play('select'), false, '準備の前は鳴らさない');
  assert.equal(await mixer.prepare(), true);
  for (const name of Object.keys(SOUND_EVENTS)) {
    const before = made.osc + made.noise;
    assert.equal(mixer.play(name, { level: 2 }), true, name);
    assert.ok(made.osc + made.noise > before, `${name} は音を作る`);
  }
  assert.equal(mixer.play('no-such-sound'), false);
  await mixer.suspend();
});

test('同じ音は最短間隔より早くは鳴らさない。消音中は鳴らさない', async () => {
  const { Ctx } = fakeContext();
  const mixer = createMixer({ AudioContextImpl: Ctx });
  await mixer.prepare();
  assert.equal(mixer.play('warning'), true);
  assert.equal(mixer.play('warning'), false);
  mixer.setSettings({ muted: true });
  assert.equal(mixer.play('clear'), false);
  mixer.setSettings({ muted: false });
  assert.equal(mixer.play('clear'), true);
  await mixer.suspend();
});

test('曲は切り替えられ、止めると鳴らない。本編の曲は停止・画面離脱で止まる', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { Ctx, made } = fakeContext();
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
    run(40); // 全部の小節を1周以上
    assert.ok(made.osc - before > 100, `${theme} が刻まれる`);
  }
  mixer.setMusic(null);
  let before = made.osc + made.noise;
  run(2);
  assert.equal(made.osc + made.noise, before, '曲がない間は何も作らない');

  // 本編：警察の人数と心拍で音が増える
  mixer.startGameAudio();
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
});

test('音が使えない端末でも、呼び出しは失敗せずに続く', async () => {
  const mixer = createMixer({ AudioContextImpl: null });
  assert.equal(await mixer.prepare(), false);
  assert.equal(mixer.available, false);
  assert.equal(mixer.play('clear'), false);
  mixer.startGameAudio();
  mixer.setMusic('menu');
  mixer.stopGameAudio();
  await mixer.suspend();
});

test('保存した 0 と消音は有効な設定として残す', () => {
  assert.deepEqual(sanitizeAudioSettings({ music: 0, sfx: 0, ambient: 0, muted: true }), { music: 0, sfx: 0, ambient: 0, muted: true });
  assert.deepEqual(sanitizeAudioSettings({ music: 5, sfx: 'x' }), { ...DEFAULT_AUDIO });
});
