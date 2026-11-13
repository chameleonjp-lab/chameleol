// 照合例（操作履歴と期待する再計算結果）を作る。判定規則を変えた時だけ作り直す（rulesVersion を上げる）。
// 使い方: node scripts/make-replay-fixtures.mjs
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { RULES_V1, rulesForVersion, createGame, createRecorder, compactHistory, replayHistory, initialState, advance } from '../src/rules/v1/index.js';
import { createRng } from '../src/rules/v1/course.js';

const OUT = new URL('../tests/replay/fixtures/', import.meta.url);
mkdirSync(OUT, { recursive: true });

/** 操作の間隔 stepMs ごとに目標へ近づく人に似た操作。 */
function play(seed, { stepMs = 90, quitAt = null, missRate = 4, sameTimeBursts = false, graceNoise = false } = {}) {
  const game = createGame({ seed });
  const rng = createRng(seed, 0xf1c5);
  const rec = createRecorder();
  let state = initialState(game);
  const color = { ...RULES_V1.initialColor };
  const push = (ev) => {
    state = advance(state, ev, game).state;
    rec.push(ev);
  };
  let t = 0;
  while (state.status === 'playing' && t < 260000) {
    t += stepMs + rng.int(0, stepMs);
    if (quitAt != null && t >= quitAt) {
      push({ type: 'quit', t: quitAt });
      break;
    }
    const i = Math.min(49, Math.floor(t / 5000));
    const target = game.course.targets[i];
    const dh = ((target.h - color.h + 54000) % 36000) - 18000;
    color.h = (color.h + Math.sign(dh) * Math.min(Math.abs(dh), 2500) + 36000) % 36000;
    color.s += Math.sign(target.s - color.s) * Math.min(Math.abs(target.s - color.s), 900);
    if (state.brightnessUnlocked) color.v += Math.sign(target.v - color.v) * Math.min(Math.abs(target.v - color.v), 1200);
    if (rng.int(0, 99) < missRate) color.h = (color.h + 4000) % 36000;
    push({ type: 'color', t, h: color.h, s: color.s, v: color.v });
    if (sameTimeBursts && rng.int(0, 9) === 0) {
      push({ type: 'color', t, h: (color.h + 300) % 36000, s: color.s, v: color.v });
      push({ type: 'color', t, h: color.h, s: color.s, v: color.v });
    }
    if (graceNoise && (t % 5000) > 4500) push({ type: 'color', t, h: (color.h + 18000) % 36000, s: 10000, v: color.v });
    if (rng.int(0, 400) === 0) {
      push({ type: 'pause', t });
      push({ type: 'resume', t });
    }
  }
  return { game, entries: rec.entries };
}

const cases = [
  { name: 'clear-steady', seed: 20261107, opts: { stepMs: 60, missRate: 2 } },
  { name: 'quit-mid', seed: 42, opts: { stepMs: 70, quitAt: 123457 } },
  { name: 'detected-sloppy', seed: 7, opts: { stepMs: 120, missRate: 35 } },
  { name: 'same-time-bursts', seed: 99, opts: { stepMs: 80, sameTimeBursts: true, quitAt: 70000 } },
  { name: 'grace-noise', seed: 31337, opts: { stepMs: 80, graceNoise: true, quitAt: 101000 } },
  { name: 'unlock-edge', seed: 4294967295, opts: { stepMs: 50, quitAt: 96600 } },
];

for (const c of cases) {
  // Historical baselines are evidence, never regenerate them during upgrades.
  if (existsSync(new URL(`${c.name}.json`, OUT))) continue;
  const { game, entries } = play(c.seed, c.opts);
  const compact = compactHistory(entries);
  const expected = replayHistory(game, entries).summary;
  const fromCompact = replayHistory(game, compact).summary;
  if (JSON.stringify(expected) !== JSON.stringify(fromCompact)) throw new Error(`compaction changed ${c.name}`);
  const fixture = { name: c.name, rulesVersion: RULES_V1.rulesVersion, seed: c.seed, history: compact, expected };
  writeFileSync(new URL(`${c.name}.json`, OUT), `${JSON.stringify(fixture)}\n`);
  console.log(c.name, entries.length, '→', compact.length, 'entries', expected.endReason, expected.buildings, expected.rankAverage);
}

// New cases use actual course HSV colors, never a substituted match function.
for (const c of [
  {name:'bonus-v3-clear', version:3},
  {name:'bonus-v3-thresholds', version:3, thresholds:true},
  {name:'bonus-v4-pause', version:4, pause:true},
]) {
  const rules = rulesForVersion(`kamereoru-rules-v${c.version}`);
  const seed = 17;
  const game = createGame({seed,rules});
  const recorder = createRecorder(rules);
  const push = ev => recorder.push(ev);
  for (let i=0;i<rules.buildingCount;i++) {
    const start=i*rules.buildingMs, target=game.course.targets[i];
    if(c.thresholds && i<2) {
      push({type:'color', t:start, h:(target.h+18000)%36000,s:target.s,v:target.v});
      push({type:'color', t:start+rules.evalStartMs+500+i,...target});
    } else {
      push({type:'color',t:start,...target});
    }
    if(c.pause && i===20) {
      push({type:'pause',t:start+2499}); push({type:'resume',t:start+2499});
    }
  }
  const history = compactHistory(recorder.entries);
  const expected = replayHistory(game,history).summary;
  if(expected.endReason!=='cleared') throw new Error(`${c.name} did not clear`);
  const fixture={name:c.name,rulesVersion:rules.rulesVersion,seed,history,expected};
  const path=new URL(`${c.name}.json`,OUT);
  if(!existsSync(path)) writeFileSync(path,`${JSON.stringify(fixture)}\n`);
  console.log(c.name,expected.score.total,expected.bonus.points);
}
