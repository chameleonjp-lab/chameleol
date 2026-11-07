// 試験用の補助。一致度を色合い h の値から直接決める差し替え関数を作る。
import { RULES_V1, createGame, advance, initialState, makeCourse } from '../../src/rules/v1/index.js';

export const U = RULES_V1.match.unitsPerPercent; // 1% = 1,000,000

/** h → 一致度（単位）の表を使う出題。目標色は本物の出題を使うが、一致度は表で決める。 */
export function stubGame(table, { rules = RULES_V1, seed = 1 } = {}) {
  const course = makeCourse(seed, rules.generatorVersion, { rules });
  return createGame({
    rules,
    course,
    matchFn: (body) => {
      if (!(body.h in table)) throw new Error(`no stub match for h=${body.h}`);
      return table[body.h];
    },
  });
}

export const color = (h, v = RULES_V1.valMax) => ({ h, s: 0, v });

/** 評価区間の開始時刻（棟 i）。 */
export const evalStart = (i, rules = RULES_V1) => (i - 1) * rules.buildingMs + rules.evalStartMs;
export const evalEnd = (i, rules = RULES_V1) => (i - 1) * rules.buildingMs + rules.evalEndMs;
export const exitAt = (i, rules = RULES_V1) => i * rules.buildingMs;

/** 出来事の列を順に処理して最終状態と出来事を返す。 */
export function run(game, events, { tickEvery = 0, until = null } = {}) {
  let state = initialState(game);
  const emitted = [];
  const sorted = events.slice();
  const apply = (ev) => {
    const r = advance(state, ev, game);
    state = r.state;
    emitted.push(...r.events);
  };
  let lastT = 0;
  for (const ev of sorted) {
    if (tickEvery > 0) {
      for (let t = lastT + tickEvery; t < ev.t; t += tickEvery) apply({ type: 'tick', t });
    }
    apply(ev);
    lastT = ev.t;
  }
  if (until != null) {
    if (tickEvery > 0) {
      for (let t = lastT + tickEvery; t < until; t += tickEvery) apply({ type: 'tick', t });
    }
    apply({ type: 'tick', t: until });
  }
  return { state, events: emitted };
}

export const setColor = (t, h, v = RULES_V1.valMax) => ({ type: 'color', t, h, s: 0, v });
