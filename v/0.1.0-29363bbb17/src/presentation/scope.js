/**
 * @typedef {object} PresentationScope
 * @property {(cleanup:()=>void)=>void} own
 * @property {(key:string, delayMs:number, callback:()=>void)=>void} schedule
 * @property {(activeMs:number)=>void} tick
 * @property {(id:string)=>boolean} isCurrent
 * @property {()=>void} dispose
 */

/**
 * A screen-local clock driven only by the caller's active elapsed time.
 * @param {{id:string, kind:'game'|'result'|'ending'}} options
 * @returns {PresentationScope}
 */
export function createPresentationScope({ id, kind }) {
  let active = true;
  let elapsed = 0;
  const cleanups = new Set();
  const reservations = new Map();
  return {
    own(cleanup) {
      if (!active) { cleanup(); return; }
      cleanups.add(cleanup);
    },
    schedule(key, delayMs, callback) {
      if (!active) return;
      reservations.set(key, { due: elapsed + Math.max(0, delayMs), callback });
    },
    tick(activeMs) {
      if (!active || !Number.isFinite(activeMs) || activeMs < elapsed) return;
      elapsed = activeMs;
      // Snapshot prevents callbacks from recursively running newly scheduled work.
      for (const [key, reservation] of [...reservations]) {
        if (!active) break;
        if (reservations.get(key) !== reservation || reservation.due > elapsed) continue;
        reservations.delete(key);
        reservation.callback();
      }
    },
    isCurrent(candidate) { return active && candidate === id; },
    dispose() {
      if (!active) return;
      active = false;
      reservations.clear();
      // Release every resource even when one cleanup throws.
      let failure;
      for (const cleanup of cleanups) {
        try { cleanup(); } catch (error) { failure ??= error; }
      }
      cleanups.clear();
      if (failure) throw failure;
    },
  };
}
