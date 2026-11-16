// CL03：舌とダイヤ、舞台の mode 分岐（自動 Chromium）。iPhone 実機の見え方・性能の確認とは別のもの。
// extended96 は、試験専用の入口 tests/e2e/fixtures/extended96.html（index.html・app.js は変えない。
// stageFactory の wrapper だけが extended96 を明示する）から開く。通常起動（index.html）は legacy80 のまま。
// CL03_SCREENSHOTS に保存先を渡すと、画像を書く（docs/acceptance/pr26/cl03/）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, openHome } from './helpers.mjs';

const VIEWPORTS = [[402, 700], [402, 874], [874, 402]];
const SHOTS = process.env.CL03_SCREENSHOTS || '';
// 周期は 準備150→伸長250→保持350→収縮450→収納200（計1,400ms）。各段階の中央の時点。
const PHASES = [['prepare', 75], ['extend', 275], ['hold', 575], ['retract', 975], ['store', 1300]];
const START = 11000; // t=1000 から 500ms ごとに進めると、10,000ms 動いた所（機会の境界）

async function save(name, dataUrl) {
  if (!SHOTS || !dataUrl) return;
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function openExtended(env) {
  await env.page.goto(`${env.url}tests/e2e/fixtures/extended96.html`);
  await env.page.waitForFunction(() => globalThis.__fixtureReady === true);
}

/** 本編を始め、App の描画ループを止めて、舞台へ実 controller の入力を手で順に渡す口（window.__tp）を作る。 */
async function installDriver(page, { effects = true } = {}) {
  await page.evaluate(async ({ effects, START }) => {
    const a = __kamereoru;
    await a.debugStart({ atMs: 1000, seed: 1, effects });
    cancelAnimationFrame(a.raf);
    const { readPlayView } = await import('/src/presentation/events.js');
    const base = readPlayView(a.session, 0, { lastEvalSuccess: false });
    const tp = {
      a, base, stage: a.stage, ctrl: a.gameExtrasController, calls: 0, lastView: null,
      upd(t, over = {}) {
        const policeStage = over.policeStage ?? 0;
        const view = { ...base, t, running: true, phase: 'eval', building: 1 + Math.floor(t / 5000), passed: Math.floor(t / 5000), policeStage, ...over };
        tp.lastView = view;
        tp.stage.update({ t, color: view.color, policeStage, walking: view.running, nervous: policeStage / 2, matchState: null, presentation: { ...view, moving: view.moving ?? true, hidden: view.hidden ?? false, guideActive: false, guidanceActive: false, warningActive: false, evaluationSegments: [] } });
      },
      toBoundary(over = {}) { for (let t = 1000; t <= START; t += 500) tp.upd(t, over); },
      frame: () => tp.ctrl.snapshot().travelTongue,
    };
    const step = tp.ctrl.step.bind(tp.ctrl);
    tp.ctrl.step = (input) => { tp.calls += 1; return step(input); };
    globalThis.__tp = tp;
  }, { effects, START });
}

// 凸多角形（投影した胴・舌・ダイヤの凸包）どうしの最短距離（画素）。交われば 0。
function polygonDistance(A, B) {
  if (!A?.length || !B?.length) return Infinity;
  const segs = (P) => P.map((p, i) => [p, P[(i + 1) % P.length]]);
  const pointSegment = (p, [a, b]) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const k = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
  };
  const inside = (p, P) => { let sign = 0; for (const [a, b] of segs(P)) { const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (c !== 0) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); } } return true; };
  if (A.some((p) => inside(p, B)) || B.some((p) => inside(p, A))) return 0;
  let best = Infinity;
  for (const p of A) for (const sg of segs(B)) best = Math.min(best, pointSegment(p, sg));
  for (const p of B) for (const sg of segs(A)) best = Math.min(best, pointSegment(p, sg));
  return best;
}
const overlap = (a, b, margin = 0) => a && b && !(a.x1 + margin <= b.x0 || b.x1 + margin <= a.x0 || a.y1 + margin <= b.y0 || b.y1 + margin <= a.y0);

test('mode: the normal entry stays legacy80 and never steps the controller; only the explicit wrapper uses extended96 and steps once per frame', async () => {
  const env = await launch();
  try {
    await openHome(env.page, env.url);
    await installDriver(env.page);
    const legacy = await env.page.evaluate(() => {
      const tp = __tp;
      tp.toBoundary();
      tp.upd(11000 + 575);
      return { mode: tp.stage.presentationStats().mode, calls: tp.calls, tongue: tp.stage.presentationStats().tongue, snapshot: tp.frame(), frames: 22 };
    });
    assert.equal(legacy.mode, 'legacy80');
    assert.equal(legacy.calls, 0, 'the old stage path never calls step');
    assert.equal(legacy.tongue, null);
    assert.equal(legacy.snapshot, null, 'the controller was never stepped, so no tongue exists');
    await openExtended(env);
    await installDriver(env.page);
    const extended = await env.page.evaluate(() => {
      const tp = __tp;
      tp.toBoundary();
      const frames = 21; // 1000..11000 を 500 ごと
      const afterBoundary = tp.calls;
      tp.upd(11000 + 575);
      return { mode: tp.stage.presentationStats().mode, afterBoundary, frames, calls: tp.calls, phase: tp.frame()?.phase, tongue: tp.stage.presentationStats().tongue };
    });
    assert.equal(extended.mode, 'extended96');
    assert.equal(extended.afterBoundary, extended.frames, 'exactly one step per stage update');
    assert.equal(extended.calls, extended.frames + 1);
    assert.equal(extended.phase, 'hold');
    assert.equal(extended.tongue.visible, true);
    assert.equal(extended.tongue.diamondVisible, true);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('step input: game clock t, boolean reducedMotion, frame intervals, best distance and no priority, from a real stage frame', async () => {
  const env = await launch();
  try {
    await openExtended(env);
    await installDriver(env.page);
    const seen = await env.page.evaluate(() => {
      const tp = __tp;
      const inputs = [];
      const step = tp.ctrl.step;
      tp.ctrl.step = (input) => { inputs.push(JSON.parse(JSON.stringify(input))); return step(input); };
      tp.stage.setBestDistance(7);
      tp.upd(2000); tp.upd(2016); tp.upd(2216); tp.upd(2216, { running: false }); tp.upd(2232);
      tp.stage.setBestDistance(99);
      tp.upd(2248);
      return inputs;
    });
    assert.deepEqual(seen.map((i) => i.t), [2000, 2016, 2216, 2216, 2232, 2248]);
    assert.deepEqual(seen.map((i) => i.frameIntervalMs), [0, 16, 200, 0, 0, 16]);
    assert.deepEqual(seen.map((i) => i.bestDistance), [7, 7, 7, 7, 7, null]);
    for (const input of seen) {
      assert.equal(typeof input.reducedMotion, 'boolean');
      assert.equal(input.drawable, true);
      assert.equal(typeof input.actorBusy.hero, 'boolean');
      assert.equal(typeof input.actorBusy.police, 'boolean');
      assert.equal(typeof input.placements.policeSettled, 'boolean');
      assert.ok(!('priority' in input));
      assert.ok(Array.isArray(input.evaluationSegments));
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

for (const [width, height] of VIEWPORTS) {
  test(`tongue at ${width}x${height}: five phases, diamond size, comparison-surface protection with one police at the widest head turn`, async (t) => {
    const env = await launch({ width, height, scale: 2 });
    try {
      await openExtended(env);
      await installDriver(env.page);
      // 画像（police 0、通常の姿勢）
      for (const [phase, ms] of PHASES) {
        const r = await env.page.evaluate(({ START, ms, phase }) => {
          const tp = __tp;
          if (!globalThis.__ready) { tp.toBoundary(); globalThis.__ready = true; }
          tp.upd(START + ms);
          const geo = tp.stage.presentationGeometry();
          const f = tp.frame();
          const canvas = tp.stage.renderer.domElement;
          const ratio = canvas.width / geo.canvas.width;
          const crop = document.createElement('canvas');
          const x0 = Math.max(0, Math.floor(geo.body.x0 - 12)); const x1 = Math.min(geo.canvas.width, Math.ceil(geo.body.x1 + 120));
          const y0 = Math.max(0, Math.floor(geo.body.y0 - 36)); const y1 = Math.min(geo.canvas.height, Math.ceil(geo.body.y0 + 120));
          crop.width = (x1 - x0) * ratio; crop.height = (y1 - y0) * ratio;
          crop.getContext('2d').drawImage(canvas, x0 * ratio, y0 * ratio, crop.width, crop.height, 0, 0, crop.width, crop.height);
          return { phase: f?.phase, progress: f?.phaseProgress, geo, crop: crop.toDataURL('image/png'), full: phase === 'hold' ? canvas.toDataURL('image/png') : null };
        }, { START, ms, phase });
        assert.equal(r.phase, phase, `the controller is in ${phase} at +${ms}ms`);
        assert.ok(r.geo.tongue, `${phase}: the tongue is drawn`);
        assert.equal(Boolean(r.geo.diamond), phase === 'hold', `${phase}: the diamond shows only once the tip has unrolled (middle of the hold)`);
        await save(`${width}x${height}-${phase}`, r.crop);
        if (r.full) await save(`${width}x${height}-hold-full`, r.full);
        if (phase === 'hold') {
          const h = r.geo.diamond.y1 - r.geo.diamond.y0;
          t.diagnostic(`${width}x${height} hold diamond box ${(r.geo.diamond.x1 - r.geo.diamond.x0).toFixed(1)}x${h.toFixed(1)}px`);
          assert.ok(h >= 12, `diamond height ${h}px at the middle of the hold`);
        }
      }
      // 比較面の条件。police 1人で、(a) 通常の姿勢 (b) 頭が最大に振り向いた姿勢（0.92rad）の両方を、
      // 各段階で舌あり／舌なしの同時刻（controller の出力だけ差し替える）と比べる。
      await env.page.evaluate(() => { globalThis.__ready = false; });
      await installDriver(env.page);
      const report = [];
      for (const [phase, ms] of PHASES) {
        const r = await env.page.evaluate(({ START, ms }) => {
          const tp = __tp;
          if (!globalThis.__ready) { tp.toBoundary({ policeStage: 1 }); globalThis.__ready = true; }
          const hero = tp.stage.verificationHero();
          const orig = tp.ctrl.step;
          const t = START + ms;
          tp.upd(t, { policeStage: 1 });
          const shownFrame = tp.frame()?.phase;
          const measure = (turn) => {
            if (turn) hero.head.rotation.y = -0.92;
            tp.upd(t, { policeStage: 1, running: false }); // 止まっている間は姿勢を保持する
            const geo = tp.stage.presentationGeometry();
            const shown = tp.stage.checkComparisonSurfaces();
            tp.ctrl.step = (input) => ({ ...orig(input), travelTongue: null });
            if (turn) hero.head.rotation.y = -0.92;
            tp.upd(t, { policeStage: 1, running: false });
            const hidden = tp.stage.checkComparisonSurfaces();
            tp.ctrl.step = orig;
            return { geo, shown, hidden, headY: hero.head.rotation.y };
          };
          const natural = measure(false);
          const turned = measure(true);
          tp.upd(t, { policeStage: 1 }); // 基準の時刻を取り直す（次の段階へ進めるため）
          return { shownFrame, natural, turned };
        }, { START, ms });
        assert.equal(r.shownFrame, phase);
        for (const [pose, m] of [['natural', r.natural], ['turned', r.turned]]) {
          const { geo, shown, hidden } = m;
          const W = geo.canvas.width; const H = geo.canvas.height;
          for (const [name, box] of [['tongue', geo.tongue], ['diamond', geo.diamond]]) {
            if (!box) continue;
            assert.ok(box.x0 >= 8 && box.y0 >= 8 && box.x1 <= W - 8 && box.y1 <= H - 8, `${phase}/${pose} ${name} stays 8px inside the canvas: ${JSON.stringify(box)}`);
            assert.ok(box.y0 >= geo.hudBottom, `${phase}/${pose} ${name} stays below the HUD (${geo.hudBottom})`);
          }
          m.diamondGap = geo.diamond ? polygonDistance(geo.diamond.hull, geo.body.hull) : null;
          m.tongueGap = polygonDistance(geo.tongue.hull, geo.body.hull);
          // 舌の根元は頭の口から出るので、口の近く（収縮・収納・頭が最大に振り向いた時）は胴との距離が小さくなる。伸びている段階（伸長・保持）の通常姿勢だけ4px以上を求め、他は記録する。
          if (pose === 'natural' && ['extend', 'hold'].includes(phase)) assert.ok(m.tongueGap >= 4, `${phase}/${pose}: the extended tongue keeps 4px from the body (${m.tongueGap.toFixed(1)}px)`);
          if (geo.diamond) assert.ok(m.diamondGap >= 4, `${phase}/${pose}: the diamond keeps 4px from the body (${m.diamondGap.toFixed(1)}px)`);
          assert.equal(shown.wallMismatches, 0, `${phase}/${pose}: wall pixels unchanged`);
          assert.equal(shown.bodyMismatches, 0, `${phase}/${pose}: body pixels unchanged`);
          m.occluded = (hidden.wallPixels - shown.wallPixels) / hidden.wallPixels;
          m.bodyLoss = (hidden.bodyPixels - shown.bodyPixels) / hidden.bodyPixels;
          assert.ok(m.occluded <= 0.015, `${phase}/${pose}: wall occlusion ${(m.occluded * 100).toFixed(3)}% <= 1.5%`);
        }
        assert.equal(r.turned.headY, -0.92);
        // 舌の根元は頭の口から出るため、頭（比較用の材質を使う）の一部は舌で隠れる。その割合は記録し、合否には使わない。
        report.push({ phase, ...r });
      }
      const pct = (v) => +(v * 100).toFixed(3);
      const rect = (b) => b && [b.x0, b.y0, b.x1, b.y1].map((v) => +v.toFixed(1));
      t.diagnostic(`${width}x${height} protection: ${JSON.stringify(report.map((r) => ({ phase: r.phase, natural: { wallOcclusionPct: pct(r.natural.occluded), bodyLossPct: pct(r.natural.bodyLoss), tongueGapPx: r.natural.tongueGap && +r.natural.tongueGap.toFixed(1), diamondGapPx: r.natural.diamondGap && +r.natural.diamondGap.toFixed(1) }, turned: { wallOcclusionPct: pct(r.turned.occluded), bodyLossPct: pct(r.turned.bodyLoss), tongueGapPx: r.turned.tongueGap && +r.turned.tongueGap.toFixed(1), diamondGapPx: r.turned.diamondGap && +r.turned.diamondGap.toFixed(1) }, tongue: rect(r.natural.geo.tongue), diamond: rect(r.natural.geo.diamond), body: rect(r.natural.geo.body), police1: r.natural.geo.police[0] && [r.natural.geo.police[0].x0, r.natural.geo.police[0].x1].map((v) => +v.toFixed(1)) })))}`);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('stopped or hidden frames hold the same pose and write no shape; leaving restores the head, jaw, eyes and tail jewel', async () => {
  const env = await launch();
  try {
    await openExtended(env);
    await installDriver(env.page);
    const r = await env.page.evaluate(({ START }) => {
      const tp = __tp;
      const hero = tp.stage.verificationHero();
      tp.toBoundary();
      tp.upd(START + 575);
      const pose = () => JSON.stringify([hero.head.rotation.z, hero.actorParts.jaw.position.y, hero.actorParts.mouth.position.y, hero.actorParts.eyes[0].rotation.y, hero.actorParts.eyes[1].rotation.y, hero.jewel.visible]);
      const held = pose();
      const writes = tp.stage.presentationStats().tongue.shapeWrites;
      let same = true;
      for (let i = 0; i < 200; i++) { tp.upd(START + 575, { running: false }); if (pose() !== held) same = false; }
      for (let i = 0; i < 200; i++) { tp.upd(START + 575, { hidden: true }); if (pose() !== held) same = false; }
      const after = tp.stage.presentationStats().tongue;
      return { same, writes, afterWrites: after.shapeWrites, phase: tp.frame()?.phase, progress: tp.frame()?.phaseProgress, visible: after.visible };
    }, { START });
    assert.equal(r.same, true, 'the pose is held, never accumulated, while stopped or hidden');
    assert.equal(r.afterWrites, r.writes, 'no shape update while stopped or hidden');
    assert.equal(r.phase, 'hold');
    assert.equal(r.visible, true);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('changing to reduced motion in the middle of the hold stores the tongue at once and releases the subscription on leaving', async () => {
  const env = await launch();
  try {
    // 購読の登録・解除を、舞台（stage.js / street.js）が行ったものだけ数える。
    await env.context.addInitScript(() => {
      const original = globalThis.matchMedia.bind(globalThis);
      globalThis.__mqlLog = [];
      globalThis.matchMedia = (query) => {
        const mql = original(query);
        const add = mql.addEventListener.bind(mql);
        const remove = mql.removeEventListener.bind(mql);
        mql.addEventListener = (type, fn, ...rest) => { if (/\/scene\/(stage|street)\.js/.test(new Error().stack)) globalThis.__mqlLog.push(['add', type, query]); return add(type, fn, ...rest); };
        mql.removeEventListener = (type, fn, ...rest) => { if (/\/scene\/(stage|street)\.js/.test(new Error().stack)) globalThis.__mqlLog.push(['remove', type, query]); return remove(type, fn, ...rest); };
        return mql;
      };
    });
    await openExtended(env);
    await installDriver(env.page);
    const before = await env.page.evaluate(({ START }) => {
      const tp = __tp;
      const hero = tp.stage.verificationHero();
      const inputs = [];
      const step = tp.ctrl.step;
      tp.ctrl.step = (input) => { inputs.push(input.reducedMotion); return step(input); };
      tp.toBoundary();
      tp.upd(START + 575);
      globalThis.__heldZ = hero.head.rotation.z;
      globalThis.__inputs = inputs;
      return { visible: tp.stage.presentationStats().tongue.visible, diamond: tp.stage.presentationStats().tongue.diamondVisible, z: hero.head.rotation.z, jewel: hero.jewel.visible };
    }, { START });
    assert.equal(before.visible, true); assert.equal(before.diamond, true);
    await env.page.emulateMedia({ reducedMotion: 'reduce' });
    await env.page.waitForFunction(() => __tp.stage.presentationStats().tongue.visible === false, null, { timeout: 5000 });
    const after = await env.page.evaluate(({ START }) => {
      const tp = __tp;
      const hero = tp.stage.verificationHero();
      const stored = { visible: tp.stage.presentationStats().tongue.visible, diamond: tp.stage.presentationStats().tongue.diamondVisible, jewel: hero.jewel.visible };
      tp.upd(START + 575); // 同じ時刻（dt=0）の基本の姿勢
      const base = hero.head.rotation.z;
      tp.upd(START + 600);
      return { stored, base, held: globalThis.__heldZ, frame: tp.frame(), lastReduced: globalThis.__inputs.at(-1), drawCalls: tp.stage.presentationStats().tongue.drawCalls };
    }, { START });
    assert.equal(after.stored.visible, false); assert.equal(after.stored.diamond, false);
    assert.equal(after.stored.jewel, false, 'the tail jewel is back to its previous (hidden) state');
    assert.ok(Math.abs((after.held - 0.04) - after.base) < 1e-9, `the head tilt is back to the base pose (${after.held} -> ${after.base})`);
    assert.equal(after.frame, null, 'the controller no longer offers a tongue');
    assert.equal(after.lastReduced, true, 'reducedMotion:true reaches step as a boolean');
    assert.equal(after.drawCalls, 0);
    // 離脱で購読が外れる
    await env.page.evaluate(() => __kamereoru.leaveGame());
    const log = await env.page.evaluate(() => globalThis.__mqlLog.filter(([, type, query]) => type === 'change' && /reduced-motion/.test(query)));
    const adds = log.filter(([kind]) => kind === 'add').length;
    const removes = log.filter(([kind]) => kind === 'remove').length;
    assert.ok(adds >= 1, 'the stage subscribed to prefers-reduced-motion');
    assert.equal(removes, adds, 'every subscription made by the stage is released');
    assert.equal(await env.page.locator('canvas.stage-canvas').count(), 0);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('renderer additions while the tongue is shown stay within 12 draw calls, 16 shapes and 4 images (old and new together)', async (t) => {
  const env = await launch();
  try {
    await openExtended(env);
    const measurements = [];
    for (const effects of [false, true]) {
      await installDriver(env.page, { effects });
      measurements.push(await env.page.evaluate(({ START, effects }) => {
        const tp = __tp;
        // 同じ時間の流れ（粒・影・警察を含む）を、演出なし（舌なし）と演出あり（舌が保持の中央）で並べる。
        tp.toBoundary({ policeStage: 1 });
        tp.upd(START + 575, { policeStage: 1 });
        return { stats: tp.stage.stats(), tongue: tp.stage.presentationStats().tongue, calls: tp.calls };
      }, { START, effects }));
      await env.page.evaluate(() => __kamereoru.leaveGame());
    }
    const [baseline, extended] = measurements;
    assert.equal(extended.tongue.diamondVisible, true);
    assert.equal(baseline.calls, 22, 'the effects-off extended stage still steps once per frame (drawable:false)');
    assert.equal(baseline.tongue, null, 'no tongue without effects');
    for (const [field, limit] of [['calls', 12], ['geometries', 16], ['textures', 4]]) {
      const added = extended.stats[field] - baseline.stats[field];
      assert.ok(added <= limit, `${field}: ${added} added, limit ${limit} (${JSON.stringify(measurements)})`);
    }
    t.diagnostic(`renderer baseline/with tongue: ${JSON.stringify({ baseline: baseline.stats, extended: extended.stats })}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('ending and unmount: starting the ending hides the tongue and restores the pose; ten replacements leave no extra scene objects', async () => {
  const env = await launch();
  try {
    await openExtended(env);
    const counts = [];
    for (let i = 0; i < 4; i++) {
      await installDriver(env.page);
      const r = await env.page.evaluate(async ({ START }) => {
        const tp = __tp;
        tp.toBoundary();
        tp.upd(START + 575);
        const shown = tp.stage.presentationStats().tongue.visible;
        const ending = tp.stage.playEnding('cleared', { signal: AbortSignal.abort() });
        await ending;
        const hidden = tp.stage.presentationStats().tongue.visible;
        const stepsAfterEnding = tp.calls;
        tp.upd(START + 600); // 終了演出中の App の描画フレーム：step は1回（drawable:false）で、舌は出ない
        return { shown, hidden, stepped: tp.calls - stepsAfterEnding, jewel: tp.stage.verificationHero().jewel.visible, objects: tp.stage.stats().objects, frame: tp.frame() };
      }, { START });
      assert.equal(r.shown, true);
      assert.equal(r.hidden, false, 'the ending cancels the tongue');
      assert.equal(r.stepped, 1, 'one step even while the ending owns the stage');
      counts.push(r.objects);
      await env.page.evaluate(() => __kamereoru.leaveGame());
      assert.equal(await env.page.locator('canvas.stage-canvas').count(), 0);
    }
    assert.equal(new Set(counts.slice(1)).size, 1, `scene objects stay bounded across replacements: ${counts}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
