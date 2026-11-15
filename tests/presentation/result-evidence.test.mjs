// 結果の静止解析（result-evidence.js）の試験：規則 v1〜v4、同時刻入力、棟境界、公式訂正、不正な入力、分割・中断・上限。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  advance,
  createGame,
  createRecorder,
  decodeHistory,
  initialState,
  matchUnits,
  replayHistory,
  rulesForVersion,
} from '../../src/rules/v1/index.js';
import { createRng } from '../../src/rules/v1/course.js';
import { createAlertStageTracker } from '../../src/game/feedback.js';
import {
  EVIDENCE_LIMITS,
  analyzeResultHistory,
  policeStageStep,
  prepareResultEvidence,
  reconcileResultEvidence,
  releaseResultEvidence,
  resolveResultEvidence,
  sameJson,
  startResultEvidence,
} from '../../src/presentation/result-evidence.js';

const { loadReplayFixtures } = await import('../../scripts/replay-fixtures.mjs');
const fixtures = loadReplayFixtures();
const VERSIONS = [1, 2, 3, 4].map((n) => `kamereoru-rules-v${n}`);
const noYield = async () => {};

function inputFor({ rulesVersion, seed, history, summary, endedAtT = summary.endT, displaySummary = summary }) {
  const rules = rulesForVersion(rulesVersion);
  const game = createGame({ seed, rules });
  return {
    rulesVersion,
    generatorVersion: rules.generatorVersion,
    seed,
    history,
    endedAtT,
    targets: game.course.targets.map((c) => ({ ...c })),
    originalSummary: summary,
    displaySummary,
  };
}
const fixtureInput = (f) => inputFor({ rulesVersion: f.rulesVersion, seed: f.seed, history: f.history, summary: f.expected });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** 履歴を作って、元の成績まで求める（規則の再生と同じ手順）。 */
function build(rulesVersion, seed, events) {
  const rules = rulesForVersion(rulesVersion);
  const game = createGame({ seed, rules });
  const rec = createRecorder(rules);
  for (const ev of events) rec.push(ev);
  const replay = replayHistory(game, rec.entries);
  assert.equal(replay.error, undefined);
  return { rules, game, history: rec.entries, summary: replay.summary, input: inputFor({ rulesVersion, seed, history: rec.entries, summary: replay.summary }) };
}

/** 1ミリ秒ずつ進める独立した基準：時刻 m の状態＝m 以下の入力をすべて適用した後（同時刻は履歴の順）。 */
function oracle(game, history, T) {
  const events = decodeHistory(history, { rules: game.rules }).events;
  const out = [];
  let state = initialState(game);
  const tracker = createAlertStageTracker(game.rules);
  let next = 0;
  for (let m = 0; m <= T; m += 1) {
    if (state.status === 'playing') state = advance(state, { type: 'tick', t: m }, game).state;
    while (next < events.length && events[next].t <= m) {
      if (state.status === 'playing') state = advance(state, events[next], game).state;
      next += 1;
    }
    tracker.update(state.alert);
    out.push({ state, stage: tracker.stage });
  }
  return out;
}

function oracleDerived(game, history, T) {
  const states = oracle(game, history, T);
  const rules = game.rules;
  const max = rules.alert.maxUnits;
  const hi = (max * 70) / 100;
  const lo = (max * 35) / 100;
  // 実色：評価中の各ミリ秒の状態で、棟ごとに最も一致度が高い最初のミリ秒
  const best = new Map();
  for (let m = 0; m < T; m += 1) {
    const { state } = states[m];
    if (state.status !== 'playing' || state.evalBuilding === 0) continue;
    const cur = best.get(state.evalBuilding);
    if (!cur || state.matchUnits > cur.matchUnits) best.set(state.evalBuilding, { building: state.evalBuilding, hsv: { ...state.color }, matchUnits: state.matchUnits, from: m });
  }
  let seenHi = false;
  let lastHi = null;
  let recovery = null;
  let police1 = null;
  let police2 = null;
  let peak = { alertUnits: 0, t: 0 };
  states.forEach(({ state, stage }, m) => {
    if (stage >= 1 && police1 === null) police1 = m;
    if (stage >= 2 && police2 === null) police2 = m;
    if (state.alert > peak.alertUnits) peak = { alertUnits: state.alert, t: m };
    if (recovery) return;
    if (seenHi && state.alert <= lo) recovery = { before: lastHi, after: m };
    else if (state.alert >= hi) {
      seenHi = true;
      lastHi = m;
    }
  });
  return { states, best, recovery, police1, police2, peak };
}

/** 各棟の猶予中に、その棟の壁色へ合わせる入力（途中で見つからずに進む履歴）。 */
function perfectEvents(rulesVersion, seed, untilT) {
  const rules = rulesForVersion(rulesVersion);
  const game = createGame({ seed, rules });
  const events = [];
  for (let b = 1; b <= 50 && (b - 1) * rules.buildingMs + 100 < untilT; b += 1) {
    const target = game.course.targets[b - 1];
    events.push({ type: 'color', t: (b - 1) * rules.buildingMs + 100, h: target.h, s: target.s, v: b >= rules.brightnessUnlockBuilding ? target.v : 10000 });
  }
  return events;
}

/** 壁から少し外した、評価中でも発見されにくい色（一致度が「少し目立つ」帯）。 */
function slightColor(wall, rules) {
  for (let dh = 500; dh < 18000; dh += 100) {
    const c = { h: (wall.h + dh) % 36000, s: wall.s, v: wall.v };
    const u = matchUnits(c, wall, rules);
    if (u >= rules.match.slightMinUnits && u < rules.match.successMinUnits) return c;
  }
  throw new Error('no slight color');
}

function randomEvents(rulesVersion, seed, quitAt) {
  const rules = rulesForVersion(rulesVersion);
  const game = createGame({ seed, rules });
  const rng = createRng(seed, 0x7e57);
  const events = [];
  let t = 0;
  let badUntil = -1;
  while (t < quitAt) {
    t += rng.int(1, 60);
    if (t >= quitAt) break;
    const building = Math.min(50, Math.floor(t / rules.buildingMs) + 1);
    const target = game.course.targets[building - 1];
    if (t > badUntil && rng.int(0, 40) === 0) badUntil = t + rng.int(800, 2600);
    const bad = t <= badUntil;
    const color = bad
      ? { h: (target.h + 18000) % 36000, s: target.s, v: 10000 }
      : { h: (target.h + rng.int(0, 600)) % 36000, s: Math.min(10000, target.s + rng.int(0, 300)), v: 10000 };
    events.push({ type: 'color', t, ...color });
    if (rng.int(0, 6) === 0) events.push({ type: 'color', t, h: (color.h + 1000) % 36000, s: color.s, v: 10000 }); // 同時刻の入力
    if (rng.int(0, 200) === 0) {
      events.push({ type: 'pause', t });
      events.push({ type: 'resume', t });
    }
  }
  events.push({ type: 'quit', t: quitAt });
  return events;
}

// ---------------------------------------------------------------------------

test('全照合例（v1〜v4・旧版）：内部の走査が元の成績と一致し、資料がそろう', async () => {
  assert.deepEqual([...new Set(fixtures.map((f) => f.rulesVersion))].sort(), VERSIONS);
  for (const f of fixtures) {
    const result = await prepareResultEvidence(fixtureInput(f), { onYield: noYield, revision: 7 });
    assert.equal(result.available, true, `${f.name}: ${result.reason}`);
    assert.equal(result.revision, 7);
    const d = result.data;
    const T = f.expected.endT;
    assert.deepEqual(d.frames3.frames.map((x) => x.t), [Math.max(0, T - 2000), Math.max(0, T - 1000), T], f.name);
    assert.equal(d.frames3.frames[2].phase, 'ended');
    assert.equal(d.alertPoints.points.at(-1).t, T);
    assert.ok(d.alertPoints.points.length <= 50);
    assert.deepEqual(d.alertPoints.points.map((p) => p.t), [...new Set(d.alertPoints.points.map((p) => p.t))].sort((a, b) => a - b), '時刻は増え、同時刻は統合');
    assert.ok(d.visualSamples.length <= f.expected.buildings, f.name);
    assert.equal(d.visualSamples.length, f.expected.buildings, `${f.name}: 通過棟ごとに1件`);
    for (const s of d.visualSamples) assert.ok(s.to > s.from, '正の時間');
    assert.ok(d.alertMarks.marks.length <= 3);
  }
});

test('規則の版ごとの値で走査する（警戒の最大・段階・評価区間が版で違っても元の成績に一致する）', async () => {
  for (const version of VERSIONS) {
    const f = fixtures.find((x) => x.rulesVersion === version);
    const analysis = await analyzeResultHistory(fixtureInput(f), { onYield: noYield });
    assert.equal(analysis.available, true, version);
    assert.equal(analysis.raw.alertMaxUnits, rulesForVersion(version).alert.maxUnits);
  }
});

test('独立した1ミリ秒刻みの基準と比べる：3コマ・警戒の点・警察の登場・最大・実色が一致する（4版×乱数の履歴）', async () => {
  for (const version of VERSIONS) {
    for (const seed of [5, 1234]) {
      const quitAt = 55000 + seed;
      const { game, history, summary, input, rules } = build(version, seed, randomEvents(version, seed, quitAt));
      const T = summary.endT;
      const result = await prepareResultEvidence(input, { onYield: noYield });
      assert.equal(result.available, true, `${version}/${seed}: ${result.reason}`);
      const d = result.data;
      const o = oracleDerived(game, history, T);
      const label = `${version}/${seed}`;
      const frameCheck = (frame) => {
        const ref = o.states[frame.t];
        assert.equal(frame.alertUnits, ref.state.alert, `${label} alert@${frame.t}`);
        assert.deepEqual(frame.bodyHsv, ref.state.color, `${label} color@${frame.t}`);
        assert.equal(frame.matchUnits, ref.state.matchUnits ?? null, `${label} match@${frame.t}`);
        assert.equal(frame.policeStage, ref.stage, `${label} stage@${frame.t}`);
        assert.equal(frame.phase, ref.state.status !== 'playing' ? 'ended' : ref.state.evalBuilding > 0 ? 'eval' : 'grace');
        assert.equal(frame.building, Math.min(50, Math.floor(frame.t / rules.buildingMs) + 1));
        assert.deepEqual(frame.wallHsv, game.course.targets[frame.building - 1]);
        assert.equal(frame.maxAlertUnits, rules.alert.maxUnits);
      };
      d.frames3.frames.forEach(frameCheck);
      for (const p of d.alertPoints.points) {
        assert.equal(p.alertUnits, o.states[p.t].state.alert, `${label} point@${p.t}`);
        assert.equal(p.policeStage, o.states[p.t].stage);
      }
      assert.equal(d.alertPoints.peakAlertUnits, o.peak.alertUnits, `${label} peak`);
      assert.equal(d.alertPoints.peakT, o.peak.t);
      const marks = Object.fromEntries(d.alertMarks.marks.map((m) => [m.kind, m.t]));
      assert.equal(marks.police1 ?? null, o.police1, `${label} police1`);
      assert.equal(marks.police2 ?? null, o.police2, `${label} police2`);
      // 実色
      assert.equal(d.visualSamples.length, summary.buildings);
      for (const s of d.visualSamples) {
        const ref = o.best.get(s.building);
        assert.deepEqual({ hsv: s.hsv, matchUnits: s.matchUnits, from: s.from }, { hsv: ref.hsv, matchUnits: ref.matchUnits, from: ref.from }, `${label} sample b${s.building}`);
        assert.ok(s.to > s.from);
      }
    }
  }
});

/** 70%以上まで警戒を上げてから、35%以下へ戻し、もう一度上げる履歴（建物1）。 */
function recoveryEvents(version) {
  const rules = rulesForVersion(version);
  const target = createGame({ seed: 17, rules }).course.targets[0];
  const bad = { h: (target.h + 18000) % 36000, s: target.s, v: 10000 };
  const good = { h: target.h, s: target.s, v: 10000 };
  return [
    { type: 'color', t: 1500, ...bad },
    { type: 'color', t: 3100, ...good }, // 70%以上 → 35%以下
    { type: 'color', t: 4300, ...bad }, // 2回目の上げ下げ（最初の1組だけを採る）
    { type: 'quit', t: 6000 },
  ];
}

test('E086 立て直し：最大警戒の70%以上から35%以下へ戻った最初の1組（整数ミリ秒）。E084 の印は最大3つ', async () => {
  for (const version of VERSIONS) {
    const { game, history, summary, input } = build(version, 17, recoveryEvents(version));
    const T = summary.endT;
    const result = await prepareResultEvidence(input, { onYield: noYield });
    const o = oracleDerived(game, history, T);
    assert.ok(o.recovery, `${version}: 基準で立て直しがある`);
    const d = result.data;
    assert.equal(d.recovery.available, true);
    assert.equal(d.recovery.before.t, o.recovery.before, `${version} before`);
    assert.equal(d.recovery.after.t, o.recovery.after, `${version} after`);
    const max = rulesForVersion(version).alert.maxUnits;
    assert.ok(d.recovery.before.alertUnits >= (max * 70) / 100);
    assert.ok(d.recovery.after.alertUnits <= (max * 35) / 100);
    assert.equal(d.recovery.before.policeStage, o.states[o.recovery.before].stage);
    assert.equal(d.recovery.after.policeStage, o.states[o.recovery.after].stage);
    assert.deepEqual(d.alertMarks.marks.map((m) => m.kind), ['police1', 'police2', 'recovery'], version);
    assert.equal(d.alertMarks.marks[2].t, d.recovery.after.t, '回復の印は E086 の after と同じ');
    assert.ok(d.alertMarks.marks.length <= EVIDENCE_LIMITS.maxMarks);
    // 2人目が出た時刻は、基準の最初の段階2
    assert.equal(d.alertMarks.marks[1].t, o.police2);
  }
});

test('E086：該当する場面が無ければ reason none。警戒が上がらない履歴では印は出ない', async () => {
  const f = fixtures.find((x) => x.name === 'clear-steady');
  const result = await prepareResultEvidence(fixtureInput(f), { onYield: noYield });
  assert.equal(result.data.recovery.available, false);
  assert.equal(result.data.recovery.reason, 'none');
  assert.deepEqual(result.data.alertMarks.marks, []);
});

test('visualSamples：正の時間・同時刻は最後の入力・同率は早い区間・目標色や猶予中の色を使わない', async () => {
  const version = 'kamereoru-rules-v4';
  const rules = rulesForVersion(version);
  const game = createGame({ seed: 17, rules });
  const wall = game.course.targets[0];
  const units = (c) => matchUnits(c, wall, rules);
  const perfect = { h: wall.h, s: wall.s, v: 10000 };
  const w0 = { h: (wall.h + 700) % 36000, s: wall.s, v: 10000 };
  const w1 = { h: (wall.h + 400) % 36000, s: wall.s, v: 10000 }; // w0 より近い
  const tie = { ...w1 };
  assert.ok(units(perfect) > units(w1) && units(w1) > units(w0));
  // 猶予中だけ完全一致 → 評価の前に w0。評価の途中で「長さ0の完全一致」→同時刻の最後は w1
  const events = [
    { type: 'color', t: 100, ...perfect },
    { type: 'color', t: 1400, ...w0 },
    { type: 'color', t: 2500, ...perfect },
    { type: 'color', t: 2500, ...w1 },
    { type: 'color', t: 3000, ...w0 },
    { type: 'color', t: 3500, ...tie }, // w1 と同率（早い区間 2500 を採る）
    { type: 'quit', t: 5000 },
  ];
  const { input, summary } = build(version, 17, events);
  assert.equal(summary.buildings, 1);
  const result = await prepareResultEvidence(input, { onYield: noYield });
  const [sample] = result.data.visualSamples;
  assert.deepEqual(result.data.visualSamples.length, 1);
  assert.deepEqual(sample.hsv, w1, '長さ0の完全一致ではなく、同時刻の最後の有効入力');
  assert.equal(sample.matchUnits, units(w1));
  assert.equal(sample.from, 2500, '同率は早い区間');
  assert.equal(sample.to, 3000);
  assert.notDeepEqual(sample.hsv, wall, '目標の壁色を使わない');
});

test('棟境界：評価開始（1500）の入力は新しい色で評価し、評価終了（4500）の入力は猶予側。棟の出口の入力は次の棟', async () => {
  const version = 'kamereoru-rules-v4';
  const rules = rulesForVersion(version);
  const game = createGame({ seed: 17, rules });
  const [w1, w2] = game.course.targets;
  const exact1 = { h: w1.h, s: w1.s, v: 10000 };
  const far1 = { h: (w1.h + 18000) % 36000, s: w1.s, v: 10000 };
  const exact2 = { h: w2.h, s: w2.s, v: 10000 };
  const slight2 = { ...slightColor(w2, rules), v: 10000 };
  const events = [
    { type: 'color', t: 1500, ...exact1 }, // 評価開始の同時刻：新しい色で評価
    { type: 'color', t: 4500, ...far1 }, // 評価終了の同時刻：猶予側。1棟目の実色にならない
    { type: 'color', t: 5000, ...exact2 }, // 出口の同時刻：2棟目の猶予
    { type: 'color', t: 6500, ...slight2 }, // 2棟目の評価開始。2棟目は少し外れた色だけ
    { type: 'quit', t: 10000 },
  ];
  const { input, summary } = build(version, 17, events);
  assert.equal(summary.buildings, 2);
  const result = await prepareResultEvidence(input, { onYield: noYield });
  const [s1, s2] = result.data.visualSamples;
  assert.deepEqual(s1.hsv, exact1);
  assert.equal(s1.from, 1500);
  assert.equal(s1.to, 4500);
  assert.equal(s2.building, 2);
  assert.deepEqual(s2.hsv, slight2, '2棟目の実色は評価中の色だけ（猶予中の完全一致は選ばない）');
  assert.equal(s2.from, 6500);
});

test('0棟：T=0 の終了でも終点1個、3コマは同じ時刻、実色なし', async () => {
  const { input, summary } = build('kamereoru-rules-v4', 17, [{ type: 'quit', t: 0 }]);
  assert.equal(summary.buildings, 0);
  const result = await prepareResultEvidence(input, { onYield: noYield });
  const d = result.data;
  assert.deepEqual(d.frames3.frames.map((f) => f.t), [0, 0, 0]);
  assert.equal(d.alertPoints.points.length, 1);
  assert.equal(d.alertPoints.points[0].t, 0);
  assert.deepEqual(d.visualSamples, []);
  assert.equal(d.longestStreak.reason, 'none');
  assert.equal(d.finalColors.available, true);
  assert.equal(d.finalColors.building, 1);
});

test('0棟（評価中に途中終了）：実色は通過棟だけなので無い。3コマは max(0,T-2000) などで下限0', async () => {
  const { input, summary } = build('kamereoru-rules-v2', 5, [{ type: 'color', t: 1600, h: 100, s: 5000, v: 10000 }, { type: 'quit', t: 2500 }]);
  assert.equal(summary.buildings, 0);
  const result = await prepareResultEvidence(input, { onYield: noYield });
  assert.deepEqual(result.data.frames3.frames.map((f) => f.t), [500, 1500, 2500]);
  assert.deepEqual(result.data.visualSamples, []);
  assert.equal(result.data.alertPoints.points.length, 1);
  assert.equal(result.data.frames3.frames[1].phase, 'eval');
  assert.equal(result.data.frames3.frames[0].phase, 'grace');
});

test('全50棟：点は50個（棟末×50）、終了時に51棟目を参照しない', async () => {
  for (const f of fixtures.filter((x) => x.expected.endReason === 'cleared')) {
    const result = await prepareResultEvidence(fixtureInput(f), { onYield: noYield });
    const d = result.data;
    assert.equal(d.alertPoints.points.length, 50, f.name);
    assert.deepEqual(d.alertPoints.points.map((p) => p.t), Array.from({ length: 50 }, (_, i) => (i + 1) * 5000));
    const end = d.frames3.frames[2];
    assert.equal(end.building, 50);
    assert.equal(end.wallHsv.h, createGame({ seed: f.seed, rules: rulesForVersion(f.rulesVersion) }).course.targets[49].h);
    assert.equal(d.finalColors.building, 50);
    assert.equal(d.visualSamples.length, 50);
    assert.equal(d.alertPoints.points.at(-1).building, 50);
  }
});

test('E084：棟末の点と終点を統合する（終了が棟末ちょうどなら1点）', async () => {
  const exact = build('kamereoru-rules-v4', 17, [...perfectEvents('kamereoru-rules-v4', 17, 15000), { type: 'quit', t: 15000 }]);
  const a = await prepareResultEvidence(exact.input, { onYield: noYield });
  assert.deepEqual(a.data.alertPoints.points.map((p) => p.t), [5000, 10000, 15000]);
  const mid = build('kamereoru-rules-v4', 17, [...perfectEvents('kamereoru-rules-v4', 17, 15001), { type: 'quit', t: 15001 }]);
  const b = await prepareResultEvidence(mid.input, { onYield: noYield });
  assert.deepEqual(b.data.alertPoints.points.map((p) => p.t), [5000, 10000, 15000, 15001]);
});

test('E087 最長成功：棟の平均実値85%以上の連続。同率は早い区間。表示成績（公式訂正後）から数える', async () => {
  const f = fixtures.find((x) => x.name === 'clear-steady');
  const input = fixtureInput(f);
  const rules = rulesForVersion(f.rulesVersion);
  const min = rules.score.comboMinUnits;
  const analysis = await analyzeResultHistory(input, { onYield: noYield });
  const display = structuredClone(f.expected);
  const rows = display.perBuilding;
  const fail = (i) => { rows[i][0] = min * rows[i][1] - 1; }; // ちょうど85%に1足りない
  const ok = (i) => { rows[i][0] = min * rows[i][1]; }; // ちょうど85%
  for (let i = 0; i < rows.length; i += 1) ok(i);
  [9, 19].forEach(fail); // 1〜9、11〜19、21〜50 → 最長は21〜50
  let r = reconcileResultEvidence(analysis.raw, { displaySummary: display });
  assert.deepEqual([r.data.longestStreak.from, r.data.longestStreak.to, r.data.longestStreak.length], [21, 50, 30]);
  [29, 39, 49].forEach(fail);
  [44, 45, 46, 47, 48].forEach(ok);
  // 1〜9（9）、11〜19（9）、21〜29（9）、31〜39（9）、41〜49（9）、50（1）：同率は早い区間
  fail(49);
  r = reconcileResultEvidence(analysis.raw, { displaySummary: display });
  assert.deepEqual([r.data.longestStreak.from, r.data.longestStreak.to, r.data.longestStreak.length], [1, 9, 9]);
  assert.equal(r.data.longestStreak.buildings.length, 9);
  assert.deepEqual(r.data.longestStreak.buildings[0].wallHsv, analysis.raw.targets[0]);
  // 成功が1つも無い
  for (let i = 0; i < rows.length; i += 1) fail(i);
  r = reconcileResultEvidence(analysis.raw, { displaySummary: display });
  assert.equal(r.data.longestStreak.available, false);
  assert.equal(r.data.longestStreak.reason, 'none');
});

test('E076 壁と体の色：終了時の壁（その棟）と体の色が対応し、発見・途中終了・クリアで棟が51にならない', async () => {
  for (const f of fixtures) {
    const result = await prepareResultEvidence(fixtureInput(f), { onYield: noYield });
    const c = result.data.finalColors;
    const T = f.expected.endT;
    assert.equal(c.t, T);
    assert.equal(c.building, Math.min(50, Math.floor(T / 5000) + 1), f.name);
    assert.ok(c.building <= 50);
    assert.deepEqual(c.wallHsv, createGame({ seed: f.seed, rules: rulesForVersion(f.rulesVersion) }).course.targets[c.building - 1]);
    assert.equal(typeof c.bodyHsv.h, 'number');
  }
});

test('公式訂正：表示成績の棟別の合計が違う棟の実色だけを落とし、骨格が違えば3コマ・グラフを利用不可にする（公式成績の表示は別）', async () => {
  const f = fixtures.find((x) => x.name === 'bonus-v3-clear');
  const input = fixtureInput(f);
  const analysis = await analyzeResultHistory(input, { onYield: noYield });
  // 棟3の matchSum が違う（公式訂正）
  const corrected = structuredClone(f.expected);
  corrected.perBuilding[2][0] -= 1;
  const a = reconcileResultEvidence(analysis.raw, { displaySummary: corrected, revision: 3 });
  assert.equal(a.available, true);
  assert.equal(a.revision, 3);
  assert.equal(a.data.visualSamples.length, 49);
  assert.deepEqual(a.data.sampleIssues, [{ building: 3, reason: 'display_mismatch' }]);
  assert.equal(a.data.frames3.available, true);
  assert.equal(a.data.longestStreak.available, true);
  assert.equal(a.data.longestStreak.buildings.find((b) => b.building === 3)?.bodyHsv ?? null, null, '体色は照合済みの実色だけ（無ければ null）');
  // 棟数・終わり方が違う
  const skeleton = structuredClone(f.expected);
  skeleton.endReason = 'quit';
  const b = reconcileResultEvidence(analysis.raw, { displaySummary: skeleton });
  for (const key of ['frames3', 'finalColors', 'alertPoints', 'alertMarks', 'recovery']) {
    assert.deepEqual([b.data[key].available, b.data[key].reason], [false, 'display_mismatch'], key);
  }
  assert.equal(b.data.visualSamples.length, 50, '棟ごとの合計が同じなら実色は残る');
  // 表示成績の行が壊れている
  const broken = structuredClone(f.expected);
  broken.perBuilding[4] = null;
  const c = reconcileResultEvidence(analysis.raw, { displaySummary: broken });
  assert.equal(c.data.longestStreak.available, false);
  assert.equal(c.data.visualSamples.length, 49);
  // 元の成績（表示成績なし）と同じなら全部使える
  const d = reconcileResultEvidence(analysis.raw, {});
  assert.equal(d.data.visualSamples.length, 50);
});

test('元の成績と再計算が違えば、すべて利用不可（summary_mismatch）。公式成績の表示には関与しない', async () => {
  const f = fixtures.find((x) => x.name === 'quit-mid');
  const bad = structuredClone(f.expected);
  bad.score.total += 1;
  for (const input of [
    { ...fixtureInput(f), originalSummary: bad },
    { ...fixtureInput(f), endedAtT: f.expected.endT - 1 },
    { ...fixtureInput(f), history: f.history.slice(0, -1) },
  ]) {
    const r = await prepareResultEvidence(input, { onYield: noYield });
    assert.deepEqual([r.available, r.reason, r.data], [false, 'summary_mismatch', null]);
  }
});

test('未知の版・不正な履歴・不正な入力は、例外にせず利用不可にして理由を返す（decodeHistory と同じ名前）', async () => {
  const f = fixtures.find((x) => x.name === 'same-time-bursts');
  const base = fixtureInput(f);
  const reason = async (patch) => (await analyzeResultHistory({ ...base, ...patch }, { onYield: noYield })).reason;
  assert.equal(await reason({ rulesVersion: 'kamereoru-rules-v9' }), 'unknown_rules');
  assert.equal(await reason({ rulesVersion: undefined }), 'unknown_rules', '版が無い入力を v4 として扱わない');
  assert.equal(await reason({ rulesVersion: null }), 'unknown_rules');
  assert.equal(await reason({ rulesVersion: 4 }), 'unknown_rules');
  assert.equal(await reason({ generatorVersion: 'kamereoru-course-v9' }), 'unknown_generator');
  assert.equal(await reason({ seed: -1 }), 'invalid_seed');
  assert.equal(await reason({ seed: 1.5 }), 'invalid_seed');
  assert.equal(await reason({ endedAtT: -1 }), 'invalid_end');
  assert.equal(await reason({ endedAtT: 250001 }), 'invalid_end');
  assert.equal(await reason({ endedAtT: 'x' }), 'invalid_end');
  assert.equal(await reason({ originalSummary: undefined }), 'no_summary');
  assert.equal(await reason({ history: null }), 'history_not_array');
  assert.equal(await reason({ history: undefined }), 'history_not_array');
  assert.equal(await reason({ targets: base.targets.slice(0, 10) }), 'course_mismatch');
  assert.equal(await reason({ targets: base.targets.map((c, i) => (i === 7 ? { ...c, h: (c.h + 1) % 36000 } : c)) }), 'course_mismatch');
  assert.equal((await analyzeResultHistory(null, { onYield: noYield })).reason, 'no_input');
  const bads = [
    [...f.history.slice(0, 5), 'x', ...f.history.slice(6)],
    [...f.history.slice(0, 5), [9, 5], ...f.history.slice(6)],
    [...f.history.slice(0, 5), [0, -1, 1, 1, 1], ...f.history.slice(6)],
    [...f.history.slice(0, 5), [0, 1.5, 1, 1, 1], ...f.history.slice(6)],
    [...f.history.slice(0, 5), [0, 0, 1, 1], ...f.history.slice(6)],
    [...f.history.slice(0, 5), [1, 0, 1], ...f.history.slice(6)],
    [...f.history.slice(0, 5), [0, 400000, 1, 1, 1], ...f.history.slice(6)],
    [...f.history, [0, 0, 1, 1]], // 終了より後の不正も、デコードと同じく不正
    [...f.history, [7, 0]],
  ];
  for (const history of bads) {
    const expected = decodeHistory(history, { rules: rulesForVersion(f.rulesVersion) });
    assert.ok(expected.error, '基準は不正と判断する');
    assert.equal(await reason({ history }), expected.error);
  }
  const over = new Array(EVIDENCE_LIMITS.maxHistory + 1).fill([1, 0]);
  assert.equal(await reason({ history: over }), 'history_too_long');
});

test('規則違反が多い履歴は読まない（history_violations）。復号の不正があればそちらを優先する', async () => {
  const rules = rulesForVersion('kamereoru-rules-v4');
  const game = createGame({ seed: 17, rules });
  const lots = Array.from({ length: 40 }, () => [0, 0, 100, 100, 5000]); // 明るさが固定中なので違反になる
  const summary = replayHistory(game, lots).summary;
  const base = inputFor({ rulesVersion: rules.rulesVersion, seed: 17, history: lots, summary });
  assert.equal((await analyzeResultHistory(base, { onYield: noYield })).reason, 'history_violations');
  const withBad = { ...base, history: [...lots, [9, 0]] };
  assert.equal((await analyzeResultHistory(withBad, { onYield: noYield })).reason, 'history_entry_kind');
});

test('入力を凍結しても動き、元の成績・履歴・出題は変わらない（書き換えない）', async () => {
  for (const f of fixtures) {
    const input = fixtureInput(f);
    const before = structuredClone(input);
    deepFreeze(input);
    const result = await prepareResultEvidence(input, { onYield: noYield });
    assert.equal(result.available, true, f.name);
    assert.deepEqual(input, before, f.name);
    // 返したデータを書き換えても元に影響しない
    result.data.frames3.frames[0].bodyHsv.h = -1;
    result.data.visualSamples[0]?.hsv && (result.data.visualSamples[0].hsv.h = -1);
    assert.deepEqual(input, before);
    const again = await prepareResultEvidence(input, { onYield: noYield });
    assert.notEqual(again.data.frames3.frames[0].bodyHsv.h, -1);
  }
});

function longHistory(version, count) {
  const rules = rulesForVersion(version);
  const game = createGame({ seed: 17, rules });
  const history = [];
  let t = 0;
  for (let i = 0; i < count; i += 1) {
    const dt = i === 0 ? 0 : i % 4 === 0 ? 2 : 1;
    t += dt;
    const b = Math.min(50, Math.floor(t / 5000) + 1);
    const tg = game.course.targets[b - 1];
    history.push([0, dt, (tg.h + (i % 2)) % 36000, tg.s, b >= 20 ? tg.v : 10000]);
  }
  const replay = replayHistory(game, history);
  return { game, history, summary: replay.summary };
}

test('1000件または4msで分割する：注入した now と onYield で、1回の仕事が上限以内。件数が多いと譲る回数が増える', async () => {
  const { history, summary } = longHistory('kamereoru-rules-v4', 6000);
  const input = inputFor({ rulesVersion: 'kamereoru-rules-v4', seed: 17, history, summary });
  // 時間が進まない時計：件数の上限 1000 だけで区切る
  const byItems = [];
  const a = await analyzeResultHistory(input, { now: () => 0, onYield: async (info) => { byItems.push(info.items); } });
  assert.equal(a.available, true);
  assert.ok(byItems.length >= Math.floor(a.raw.stats.items / 1000), '1000件ごとに譲る');
  assert.ok(byItems.every((n) => n <= EVIDENCE_LIMITS.sliceItems), JSON.stringify(byItems.slice(0, 5)));
  assert.ok(byItems.some((n) => n === 1000));
  assert.ok(a.raw.stats.maxSliceItems <= 1000);
  // 1回の呼出ごとに 1ms 進む時計：4ms で区切る
  let clock = 0;
  const byTime = [];
  const b = await analyzeResultHistory(input, { now: () => (clock += 1), onYield: async (info) => { byTime.push(info.items); } });
  assert.equal(b.available, true);
  assert.ok(byTime.every((n) => n <= 5), JSON.stringify(byTime.slice(0, 8)));
  assert.ok(byTime.length > byItems.length * 100);
  assert.ok(b.raw.stats.maxSliceMs <= 5, `maxSliceMs=${b.raw.stats.maxSliceMs}`);
  // 実時計の既定（setTimeout）でも終わる
  const c = await analyzeResultHistory(input);
  assert.equal(c.available, true);
});

test('中断：途中で abort すると reason aborted で解決し、それ以上進めない。開始前の abort も同じ', async () => {
  const { history, summary } = longHistory('kamereoru-rules-v4', 5000);
  const input = inputFor({ rulesVersion: 'kamereoru-rules-v4', seed: 17, history, summary });
  const controller = new AbortController();
  let yields = 0;
  const r = await analyzeResultHistory(input, { signal: controller.signal, now: () => 0, onYield: async () => { yields += 1; if (yields === 2) controller.abort(); } });
  assert.deepEqual([r.available, r.reason, r.raw], [false, 'aborted', null]);
  assert.equal(yields, 2, '中断の後は譲らない');
  const pre = new AbortController();
  pre.abort();
  const r2 = await analyzeResultHistory(input, { signal: pre.signal, onYield: noYield });
  assert.equal(r2.reason, 'aborted');
  const r3 = await prepareResultEvidence(input, { signal: pre.signal, onYield: noYield });
  assert.deepEqual([r3.available, r3.reason, r3.data], [false, 'aborted', null]);
});

test('上限：入力20万件・完全な状態の保持は320個以内。20万件の合成履歴（v4・v1）が最後まで終わる', async (t) => {
  assert.equal(EVIDENCE_LIMITS.maxHistory, 200000);
  assert.equal(EVIDENCE_LIMITS.maxCheckpoints, 320);
  for (const version of ['kamereoru-rules-v4', 'kamereoru-rules-v1']) {
    const { history, summary } = longHistory(version, EVIDENCE_LIMITS.maxHistory);
    assert.equal(history.length, 200000);
    assert.equal(summary.endReason, 'cleared');
    const input = inputFor({ rulesVersion: version, seed: 17, history, summary });
    const started = performance.now();
    const r = await prepareResultEvidence(input);
    const ms = performance.now() - started;
    assert.equal(r.available, true, `${version}: ${r.reason}`);
    assert.equal(r.data.visualSamples.length, 50);
    assert.equal(r.data.alertPoints.points.length, 50);
    t.diagnostic(`${version}: 200000 entries analysed in ${ms.toFixed(0)} ms`);
    const stats = (await analyzeResultHistory(input, { onYield: noYield })).raw.stats;
    assert.ok(stats.maxHeldStates <= EVIDENCE_LIMITS.maxCheckpoints);
    assert.equal(stats.entries, 200000);
  }
});

test('警察の人数の規則は game/feedback の createAlertStageTracker と同じ', () => {
  for (const version of VERSIONS) {
    const rules = rulesForVersion(version);
    const rng = createRng(99, 0x11);
    const tracker = createAlertStageTracker(rules);
    let stage = 0;
    let alert = 0;
    for (let i = 0; i < 5000; i += 1) {
      alert = Math.max(0, Math.min(rules.alert.maxUnits, alert + rng.int(0, 2 * rules.alert.maxUnits / 10) - rules.alert.maxUnits / 10));
      stage = policeStageStep(stage, alert, rules);
      assert.equal(stage, tracker.update(alert), `${version} @${i} ${alert}`);
    }
  }
});

test('sameJson は鍵の順を問わず、内容が違えば偽', () => {
  assert.equal(sameJson({ a: 1, b: [1, { c: null }] }, { b: [1, { c: null }], a: 1 }), true);
  assert.equal(sameJson({ a: 1 }, { a: 2 }), false);
  assert.equal(sameJson({ a: 1 }, { a: 1, b: 1 }), false);
  assert.equal(sameJson([1, 2], [1, 2, 3]), false);
  assert.equal(sameJson([], {}), false);
  assert.equal(sameJson(null, {}), false);
});

test('結果ごとの持ち物：解析は1回だけ始め、言語の描き直しでは始め直さない。解放で中断し、遅い結果は捨てる', async () => {
  const f = fixtures.find((x) => x.name === 'bonus-v3-clear'); // 公式訂正（verifiedScore）を受けられる版
  const input = deepFreeze(fixtureInput(f));
  const result = { playId: 'p', summary: f.expected, evidenceInput: input };
  let scans = 0;
  const evidence = startResultEvidence(result, { onYield: async () => { scans += 1; } });
  assert.equal(evidence.status, 'pending');
  assert.equal(startResultEvidence(result), evidence, '2回目（言語変更・再表示）は同じ持ち物');
  assert.equal(startResultEvidence(result), evidence);
  assert.equal(resolveResultEvidence(result).status, 'pending');
  let notified = 0;
  evidence.subscribe(() => { notified += 1; });
  await new Promise((resolve) => { evidence.subscribe(resolve); });
  assert.equal(notified, 1);
  assert.equal(evidence.status, 'ready');
  const raw = evidence.raw;
  const first = resolveResultEvidence(result);
  assert.equal(first.status, 'ready');
  assert.equal(first.revision, 0);
  assert.equal(resolveResultEvidence(result), first, '同じ表示成績ならキャッシュを返す');
  // 公式訂正（verifiedScore が付く）：revision を増やし、照合だけをやり直す（raw は同じ）
  const corrected = structuredClone(f.expected);
  corrected.perBuilding[0][0] -= 1;
  result.verifiedScore = { rulesVersion: f.expected.rulesVersion, score: corrected.score, bonus: corrected.bonus, perBuilding: corrected.perBuilding, maxCombo: corrected.maxCombo };
  const second = resolveResultEvidence(result);
  assert.equal(second.revision, 1);
  assert.equal(evidence.raw, raw);
  assert.equal(second.data.visualSamples.length, 49);
  const scansAfterCorrection = scans;
  resolveResultEvidence(result);
  assert.equal(scans, scansAfterCorrection, '照合のやり直しでは走査しない');
  releaseResultEvidence(result);
  assert.equal(result.evidence, null);
  assert.equal(result.evidenceInput, null);
  assert.equal(resolveResultEvidence(result).status, 'missing');
});

test('解放した後に終わった解析の結果は捨てる。履歴が無い結果（過去結果・中断）は missing で、summary から履歴を作らない', async () => {
  const f = fixtures.find((x) => x.name === 'quit-mid');
  const result = { summary: f.expected, evidenceInput: fixtureInput(f) };
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const evidence = startResultEvidence(result, { onYield: () => gate });
  let notified = 0;
  evidence.subscribe(() => { notified += 1; });
  releaseResultEvidence(result);
  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(notified, 0);
  assert.equal(evidence.status, 'pending');
  assert.equal(evidence.controller.signal.aborted, true);
  // 履歴なし
  const old = { summary: f.expected };
  assert.equal(startResultEvidence(old), null);
  assert.deepEqual(resolveResultEvidence(old), { status: 'missing', reason: 'no_history', data: null, revision: 0 });
  assert.equal(resolveResultEvidence(null).status, 'missing');
  // 解析が失敗した結果（元の成績と合わない）
  const mismatch = { summary: f.expected, evidenceInput: { ...fixtureInput(f), originalSummary: { ...f.expected, buildings: 1 } } };
  const ev = startResultEvidence(mismatch, { onYield: noYield });
  await new Promise((resolve) => ev.subscribe(resolve));
  assert.deepEqual(resolveResultEvidence(mismatch), { status: 'failed', reason: 'summary_mismatch', data: null, revision: 0 });
});

test('保存・送信・実績・ゲーム開始・音・時計・再生の部品を、解析とパネルのコードに持たない', () => {
  const sources = ['result-evidence.js', 'result-evidence-view.js'].map((name) => [name, readFileSync(new URL(`../../src/presentation/${name}`, import.meta.url), 'utf8')]);
  const allowedImports = new Set(['../rules/v1/index.js', '../rules/v1/color.js', '../net/verified-score.js']);
  for (const [name, text] of sources) {
    const imports = [...text.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
    for (const spec of imports) assert.ok(allowedImports.has(spec), `${name} imports ${spec}`);
    assert.equal(/requestAnimationFrame|setInterval|AudioContext|new Audio|\bfetch\(|indexedDB|localStorage|sessionStorage|XMLHttpRequest|sendBeacon|\.play\(|createElement\('(?:audio|video|canvas)'\)|type="range"|performance\.now\(\)\s*-\s*start/.test(text.replace(/\/\/.*$/gm, '')), false, name);
    assert.equal(/\b(seek|autoplay|playbackRate)\b/i.test(text.replace(/\/\/.*$/gm, '')), false, name);
  }
});
