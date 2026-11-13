// Home presentation only: no game clocks, DOM state, or Three.js dependencies.
export const HOME_PALETTE_HEX = Object.freeze([
  '#58c43c', '#7ac43c', '#9cc43c', '#bec43c', '#c4a83c', '#c4863c',
  '#c4643c', '#c4423c', '#c43c58', '#c43c7a', '#c43c9c', '#c43cbe',
  '#a83cc4', '#863cc4', '#643cc4', '#423cc4', '#3c58c4', '#3c7ac4',
  '#3c9cc4', '#3cbec4', '#3cc4a8', '#3cc486', '#3cc464', '#3cc442',
]);
const PALETTE_RGB = HOME_PALETTE_HEX.map((hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
});

/** Writes interpolated RGB values into the caller's reusable buffer. */
export function sampleHomeColor(activeMs, outRgb) {
  const position = (activeMs % 12000) / 500;
  const index = Math.floor(position);
  const fraction = position - index;
  const from = PALETTE_RGB[index];
  const to = PALETTE_RGB[(index + 1) % PALETTE_RGB.length];
  for (let channel = 0; channel < 3; channel++) {
    outRgb[channel] = (from[channel] + (to[channel] - from[channel]) * fraction) / 255;
  }
}

const smooth = (amount) => amount * amount * (3 - 2 * amount);

/** Samples a single reusable frame from accumulated visible time in milliseconds. */
export function createHomeIdleMotion({ random = Math.random, reducedMotion = false } = {}) {
  let reduced = Boolean(reducedMotion);
  let disposed = false;
  let previous = 0;
  let started = null;
  const randomUnit = () => {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0.5;
  };
  let due = reduced ? null : 2000 + 1000 * randomUnit();
  const validTime = (activeMs) => {
    if (Number.isFinite(activeMs) && activeMs >= previous) previous = activeMs;
    return previous;
  };

  return {
    sample(activeMs, outFrame) {
      const time = validTime(activeMs);
      sampleHomeColor(time, outFrame.colorRgb);
      outFrame.yaw = reduced || disposed ? -0.85 : -0.85 + Math.sin(time / 2400) * 0.35;
      outFrame.tonguePhase = 'idle';
      outFrame.tonguePhaseMs = 0;
      outFrame.extension = 0;
      outFrame.unroll = 0;
      outFrame.mouthOpen = 0;
      outFrame.gazeWeight = 0;
      outFrame.headTilt = 0;
      if (reduced || disposed) return;

      if (started !== null && time - started >= 900) {
        due = started + 900 + 6000 + 4000 * randomUnit();
        started = null;
        // Complete this action once; don't replay overdue actions in a loop.
        return;
      }
      if (started === null && time >= due) started = time;
      if (started === null) return;

      const elapsed = time - started;
      let openness = 1;
      let extension = 0;
      if (elapsed < 150) {
        outFrame.tonguePhase = 'anticipate';
        outFrame.tonguePhaseMs = elapsed;
        openness = smooth(elapsed / 150);
      } else if (elapsed < 300) {
        outFrame.tonguePhase = 'extend';
        outFrame.tonguePhaseMs = elapsed - 150;
        extension = smooth((elapsed - 150) / 150);
      } else if (elapsed < 380) {
        outFrame.tonguePhase = 'hold';
        outFrame.tonguePhaseMs = elapsed - 300;
        extension = 1;
      } else if (elapsed < 750) {
        outFrame.tonguePhase = 'retract';
        outFrame.tonguePhaseMs = elapsed - 380;
        extension = 1 - smooth((elapsed - 380) / 370);
      } else {
        outFrame.tonguePhase = 'settle';
        outFrame.tonguePhaseMs = elapsed - 750;
        openness = 1 - smooth((elapsed - 750) / 150);
      }
      outFrame.extension = extension;
      outFrame.unroll = extension;
      outFrame.mouthOpen = openness;
      outFrame.gazeWeight = openness;
      outFrame.headTilt = 0.04 * openness;
    },
    setReducedMotion(value, activeMs) {
      if (disposed) return;
      const time = validTime(activeMs);
      const nextReduced = Boolean(value);
      if (reduced === nextReduced) return;
      reduced = nextReduced;
      started = null;
      due = reduced ? null : time + 6000 + 4000 * randomUnit();
    },
    dispose() {
      disposed = true;
      started = null;
      due = null;
    },
  };
}
