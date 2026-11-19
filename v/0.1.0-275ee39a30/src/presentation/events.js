import { classifyMatch, currentBuilding, phaseOf } from '../rules/v1/index.js';

/**
 * @typedef {object} PresentationEvent
 * @property {string} type Existing event names, instantSuccess, policeUp, policeDown, or searchStart.
 * @property {number} t
 * @property {number} [building]
 * @property {number} [combo]
 */

/**
 * @typedef {object} PlayView
 * @property {string} playId
 * @property {number} t
 * @property {number} passed
 * @property {number} building
 * @property {'eval'|'grace'|'ended'} phase
 * @property {{h:number,s:number,v:number}} color
 * @property {null|'success'|'slight'|'danger'} matchState
 * @property {0|1|2} policeStage
 * @property {number} combo
 * @property {number} maxCombo
 * @property {boolean} brightnessUnlocked
 * @property {boolean} running
 * @property {boolean} lastEvalSuccess
 */

/**
 * Read existing rule outcomes without adding state or recomputing thresholds.
 * @param {import('../game/session.js').GameSession} session
 * @param {0|1|2} policeStage
 * @param {{lastEvalSuccess:boolean}} observation
 * @returns {PlayView}
 */
export function readPlayView(session, policeStage, { lastEvalSuccess }) {
  const { state, rules } = session;
  const phase = phaseOf(state, rules);
  return {
    playId: session.meta.playId,
    t: state.t,
    passed: state.passed,
    building: currentBuilding(state, rules),
    phase,
    color: { ...state.color },
    matchState: phase === 'eval' && state.matchUnits != null ? classifyMatch(state.matchUnits, rules) : null,
    policeStage,
    combo: state.combo,
    maxCombo: state.maxCombo,
    brightnessUnlocked: state.brightnessUnlocked,
    running: session.running && phase !== 'ended',
    lastEvalSuccess,
  };
}
