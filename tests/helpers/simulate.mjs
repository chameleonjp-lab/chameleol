// 試験用：本物の色差で遊ぶ「人に似た」操作を作る。目標色へ少しずつ近づき、ときどき外す。
import { RULES_V1, createGame, initialState, advance, createRecorder } from '../../src/rules/v1/index.js';
import { createRng } from '../../src/rules/v1/course.js';

export function simulatePlay(seed, { quitAt = null, twoFinger = true, jitter = 3 } = {}) {
  const game = createGame({ seed });
  const rng = createRng(seed, 0x51ab);
  const rec = createRecorder();
  let state = initialState(game);
  let t = 0;
  const color = { ...RULES_V1.initialColor };
  const step = (ev) => {
    const r = advance(state, ev, game);
    state = r.state;
    if (ev.type !== 'tick') rec.push(ev);
  };
  while (state.status === 'playing') {
    t += 4 + rng.int(0, 30);
    if (quitAt != null && t >= quitAt) {
      step({ type: 'quit', t: quitAt });
      break;
    }
    const building = Math.min(50, Math.floor(t / RULES_V1.buildingMs) + 1);
    const target = game.course.targets[building - 1];
    // 色合い・鮮やかさを近づける（2本指なら明るさも同時に）
    const dh = ((target.h - color.h + 54000) % 36000) - 18000;
    color.h = (color.h + Math.sign(dh) * Math.min(Math.abs(dh), 900 + rng.int(0, 400)) + 36000) % 36000;
    color.s += Math.sign(target.s - color.s) * Math.min(Math.abs(target.s - color.s), 400);
    if (state.brightnessUnlocked && (twoFinger || rng.int(0, 1))) {
      color.v += Math.sign(target.v - color.v) * Math.min(Math.abs(target.v - color.v), 500);
    }
    if (rng.int(0, 100) < jitter) color.h = (color.h + 2000) % 36000;
    step({ type: 'color', t, h: color.h, s: color.s, v: color.v });
    // 同じ値を続けて送る（同値圧縮の対象）
    if (rng.int(0, 10) === 0) step({ type: 'color', t, h: color.h, s: color.s, v: color.v });
    if (rng.int(0, 1000) === 0) {
      step({ type: 'pause', t });
      step({ type: 'resume', t });
    }
    if (t > 300000) break;
  }
  return { game, state, entries: rec.entries };
}

