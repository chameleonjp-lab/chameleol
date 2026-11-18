import { RULES_V4, createGame, matchUnits } from '../rules/v1/index.js';

export const PRACTICE_STEPS = Object.freeze([1, 2, 3]);

export function createGuidePractice({ step = 1, seed = 1, rules = RULES_V4 } = {}) {
  if (!PRACTICE_STEPS.includes(step)) throw new TypeError('invalid_guide_step');
  const stationary = step !== 2;
  const brightnessUnlocked = step === 3;
  const building = brightnessUnlocked ? rules.brightnessUnlockBuilding : step;
  const { course } = createGame({ seed, rules });
  const target = course.targets[building - 1];
  let color = { ...rules.initialColor };
  let elapsed = 0;
  let complete = false;
  let disposed = false;

  function view() {
    const units = matchUnits(color, target, rules);
    return {
      step, stationary, building, target, color: { ...color }, matchUnits: units,
      canContinue: stationary && units > 95 * rules.match.unitsPerPercent,
      brightnessUnlocked, elapsed, complete,
    };
  }

  function setColor(next) {
    if (disposed || complete) return;
    color = { ...next, v: brightnessUnlocked ? next.v : rules.valMax };
    if (view().canContinue) complete = true;
  }

  function tick(dt) {
    if (!disposed && !stationary && !complete && Number.isFinite(dt) && dt >= 0 && dt <= rules.buildingMs) {
      elapsed = Math.min(rules.buildingMs, elapsed + dt);
      complete = elapsed === rules.buildingMs;
    }
    return view();
  }

  return { course, view, setColor, tick, dispose() { disposed = true; } };
}
