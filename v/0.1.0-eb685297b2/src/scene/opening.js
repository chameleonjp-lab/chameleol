// 画面上の移動だけを進める。1棟目の判定時計はガイドが終わるまで進めない。
import { createVisiblePresentationClock } from './presentation-clock.js';

const DURATION = 2800;
const TAKE = 0.16;
const LAND = 0.48;
const STOW = 0.82;
const cues = [[TAKE, 'glassBurst'], [TAKE, 'alarm'], [TAKE, 'jump'], [LAND, 'land'], [STOW, 'jewel']];
const fraction = (k, start, end) => Math.max(0, Math.min(1, (k - start) / (end - start)));
function smooth(t) { return t * t * (3 - 2 * t); }

export function openingPose(elapsed, destination, reducedMotion) {
  const k = Math.min(1, elapsed / DURATION);
  const travel = smooth(fraction(k, TAKE, 0.97));
  const taken = fraction(k, TAKE, 0.34);
  const stowed = smooth(fraction(k, 0.68, STOW));
  const alarmTime = Math.max(0, k - TAKE) * DURATION;
  const pulse = reducedMotion ? 0.8 : 0.68 + 0.32 * Math.cos(alarmTime * 2 * Math.PI / 660);
  return {
    block: -0.6 * (1 - travel) + destination * travel,
    jump: reducedMotion ? 0 : Math.sin(Math.PI * fraction(k, TAKE, LAND)) * 0.85,
    walking: k > TAKE && k < 0.94,
    pickup: smooth(taken), stowed,
    alarm: smooth(fraction(k, TAKE, TAKE + 0.045)) * pulse * (1 - smooth(fraction(k, 0.77, 0.97))),
  };
}

export function startShopEscape({ destination, reducedMotion, signal, draw, onCue }) {
  const clock = createVisiblePresentationClock({ visibilityTarget: document });
  let frame, cue = 0, stopped = false, resolve;
  const finished = new Promise(done => { resolve = done; });
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    signal?.removeEventListener('abort', skip);
    clock.dispose();
    resolve();
  }
  function skip() {
    if (!stopped) draw(openingPose(DURATION, destination, reducedMotion), 0);
    stop();
  }
  function step(time) {
    const { elapsed, dt } = clock(time, document.hidden);
    if (!document.hidden) {
      draw(openingPose(elapsed, destination, reducedMotion), dt);
      while (!stopped && cue < cues.length && elapsed >= cues[cue][0] * DURATION) onCue(cues[cue++][1]);
      if (elapsed >= DURATION) { stop(); return; }
    }
    if (!stopped) frame = requestAnimationFrame(step);
  }
  if (signal?.aborted) skip();
  else {
    signal?.addEventListener('abort', skip, { once: true });
    step(performance.now());
  }
  return { finished, stop };
}
