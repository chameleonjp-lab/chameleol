/** Animation deltas follow the authoritative game clock, including paused samples. */
export function createGamePresentationClock() {
  let previous = null;
  return (t, running = true) => {
    const dt = previous == null || !running ? 0 : Math.max(0, t - previous) / 1000;
    previous = t;
    return dt;
  };
}

/** A separate zero-based clock for cutscenes; hidden intervals never catch up. */
export function createVisiblePresentationClock({ visibilityTarget = null, now = () => performance.now() } = {}) {
  let previous = null;
  let wasHidden = true;
  let elapsed = 0;
  const tick = (now, hidden = false) => {
    const delta = previous == null || hidden || wasHidden ? 0 : Math.max(0, now - previous);
    previous = now;
    wasHidden = hidden;
    elapsed += delta;
    return { elapsed, dt: delta / 1000 };
  };
  const visibilityChanged = () => tick(now(), visibilityTarget.hidden);
  visibilityTarget?.addEventListener('visibilitychange', visibilityChanged);
  tick.dispose = () => visibilityTarget?.removeEventListener('visibilitychange', visibilityChanged);
  return tick;
}

