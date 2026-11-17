// CL03 ④：街5案・警察2案・舌を、舞台自身の extended96 の経路（実 stage → 実 controller の step → 実 accents/reactions）で
// 3寸法に描く（自動 Chromium。iPhone 実機の見え方・性能の確認とは別のもの）。
// 試験専用の入口 tests/e2e/fixtures/extended96.html（index.html・app.js は変えない）を使う。
// controller は本物。小芝居・警察の追加動作を指定の時点に出すため、step の戻り値の cameo / policeExtra だけを
// controller が返す形式の枠（id, startedAt, elapsedMs, durationMs, building, phase）へ置き換えられる。
// 置けない寸法（placements が false）の案は、controller が始めない案として「条件付き非表示」を記録する。
// CL03_SCREENSHOTS に保存先を渡すと画像（倍率1の舞台全体）を書く。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch } from './helpers.mjs';

const LAYOUTS = [[402, 700], [402, 874], [874, 402]];
const SHOTS = process.env.CL03_SCREENSHOTS || '';

async function save(name, dataUrl) {
  if (!SHOTS || !dataUrl) return;
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function open(env, { effects = true } = {}) {
  await env.page.goto(`${env.url}tests/e2e/fixtures/extended96.html`);
  await env.page.waitForFunction(() => globalThis.__fixtureReady === true);
  await env.page.evaluate(async ({ effects }) => {
    const a = __kamereoru;
    await a.debugStart({ atMs: 1000, seed: 1, effects });
    cancelAnimationFrame(a.raf);
    const { readPlayView } = await import('/src/presentation/events.js');
    const base = readPlayView(a.session, 0, { lastEvalSuccess: false });
    const tp = {
      a, base, stage: a.stage, ctrl: a.gameExtrasController, override: null, inputs: [], extras: [],
      upd(t, over = {}) {
        const policeStage = over.policeStage ?? 0;
        const view = { ...base, t, running: true, phase: 'grace', building: 1 + Math.floor(t / 5000), passed: Math.floor(t / 5000), policeStage, ...over };
        tp.stage.update({ t, color: view.color, policeStage, walking: view.running, nervous: policeStage / 2, matchState: null, presentation: { ...view, moving: true, hidden: false, guideActive: false, guidanceActive: false, warningActive: false, evaluationSegments: [] } });
      },
      geo: () => tp.stage.presentationGeometry(),
      stats: () => tp.stage.presentationStats(),
      image: () => tp.stage.renderer.domElement.toDataURL('image/png'),
    };
    const step = tp.ctrl.step.bind(tp.ctrl);
    tp.ctrl.step = (input) => {
      tp.inputs.push({ placements: input.placements, actorBusy: input.actorBusy, drawable: input.drawable, building: input.building, phase: input.phase });
      const out = step(input);
      const merged = tp.override ? { ...out, ...tp.override } : out;
      tp.extras.push({ cameo: merged.cameo, policeExtra: merged.policeExtra });
      return merged;
    };
    globalThis.__tp = tp;
  }, { effects });
}

/** 建物 b の始まりから、警察1人が立ち位置へ着くまで進める（grace、50msごと）。返す値は次に使える t。 */
const settle = (page, building) => page.evaluate((building) => {
  const tp = __tp;
  const t0 = (building - 1) * 5000;
  for (let t = t0; t <= t0 + 1500; t += 50) tp.upd(t, { policeStage: 1 });
  return t0 + 1500;
}, building);

const story = (id, ms, building, t) => ({ cameo: { id, startedAt: t - ms, elapsedMs: ms, durationMs: id === 56 ? 1500 : 2000, building, phase: id === 56 ? 'delivery' : 'story' } });

/** 同じ時刻で、小芝居あり／なしの比較面（壁遮蔽・不一致）を測る。 */
const measure = (page, { t, override }) => page.evaluate(({ t, override }) => {
  const tp = __tp;
  tp.override = null;
  tp.upd(t, { policeStage: 1 });
  const before = tp.geo();
  tp.override = override;
  tp.upd(t, { policeStage: 1 });
  const shownStats = tp.stats();
  const placements = tp.inputs.at(-1).placements;
  const image = tp.image();
  const geo = tp.geo();
  const shown = tp.stage.checkComparisonSurfaces();
  tp.override = null;
  tp.upd(t, { policeStage: 1 });
  const after = tp.geo();
  const hidden = tp.stage.checkComparisonSurfaces();
  return { shownStats, placements, image, geo, before, after, shown, hidden, canvas: geo.canvas };
}, { t, override });

const CAMEO_NAMES = ['resident', 'cat', 'bird', 'bicycle', 'bus', 'policeCar', 'ufo', 'rainbow', 'chameleon'];

for (const [width, height] of LAYOUTS) {
  test(`street stories at ${width}x${height}: drawn only from the controller's cameo, placed ones leave wall and body pixels untouched`, async (t) => {
    const env = await launch({ width, height });
    try {
      await open(env);
      const facts = {};
      const stories = [[20, 'E020', 'railway', 5], [67, 'E067', 'water', 6], [68, 'E068', 'robot', 7], [69, 'E069', 'bird', 8]];
      for (const [id, name, flag, building] of stories) {
        const t0 = await settle(env.page, building);
        const where = await env.page.evaluate(() => __tp.inputs.at(-1).placements);
        facts[name] = where[flag];
        if (!where[flag]) continue; // 置けない寸法：controller は始めない（条件付き非表示）
        for (const ms of [0, 500, 1000, 1500, 1900]) {
          const r = await measure(env.page, { t: t0 + ms, override: story(id, ms, building, t0 + ms) });
          assert.ok(r.shownStats.storySprites >= 1 && r.shownStats.storySprites <= 3, `${name}@${ms}: ${r.shownStats.storySprites} story sprites`);
          assert.equal(r.shown.wallMismatches, 0, `${name}@${ms} wall mismatches`);
          assert.equal(r.shown.bodyMismatches, 0, `${name}@${ms} body mismatches`);
          const occluded = (r.hidden.wallPixels - r.shown.wallPixels) / r.hidden.wallPixels;
          assert.ok(occluded <= 0.015, `${name}@${ms} wall occlusion ${(occluded * 100).toFixed(3)}%`);
          if (ms === 1000) await save(`${width}x${height}-${name}`, r.image);
        }
      }
      // E056：機体と、置けない／期限切れの静止旗
      await env.page.evaluate(() => { for (let t = 124000; t <= 125000; t += 50) __tp.upd(t, { policeStage: 1 }); });
      const mid = await env.page.evaluate(() => { __tp.upd(125500, { policeStage: 1 }); return __tp.inputs.at(-1).placements.midpoint; });
      facts.E056 = mid;
      if (mid) {
        for (const ms of [0, 500, 1100, 1400]) {
          const tt = 125500 + ms;
          const r = await measure(env.page, { t: tt, override: story(56, ms + 500, 25, tt) });
          assert.ok(r.shownStats.storySprites >= 1 && r.shownStats.storySprites <= 3, `E056@${ms}`);
          assert.equal(r.shown.wallMismatches, 0); assert.equal(r.shown.bodyMismatches, 0);
          assert.ok((r.hidden.wallPixels - r.shown.wallPixels) / r.hidden.wallPixels <= 0.015);
          if (ms === 500) await save(`${width}x${height}-E056-flag`, r.image);
        }
      }
      const staticFlag = { cameo: { id: 56, startedAt: 125000, elapsedMs: 0, durationMs: 0, building: 25, phase: 'static' } };
      const s = await measure(env.page, { t: 127000, override: staticFlag });
      assert.equal(s.shownStats.storySprites, 0, 'the static flag is a decoration, not a story sprite');
      assert.ok(s.shownStats.staticDecorations <= 24);
      assert.equal(s.shown.wallMismatches, 0); assert.equal(s.shown.bodyMismatches, 0);
      assert.ok((s.hidden.wallPixels - s.shown.wallPixels) / s.hidden.wallPixels <= 0.015);
      await save(`${width}x${height}-E056-static`, s.image);
      t.diagnostic(`${width}x${height} placements (true=placed, false=conditionally hidden): ${JSON.stringify(facts)}`);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });

  test(`police extras at ${width}x${height}: the inquiry and footprints move the first officer, and cancelling returns it to the base position`, async (t) => {
    const env = await launch({ width, height });
    try {
      await open(env);
      const building = 9;
      const t0 = await settle(env.page, building);
      const settled = await env.page.evaluate(() => __tp.inputs.at(-1).placements.policeSettled);
      assert.equal(settled, true, 'the officer stands in place, so the extra may start');
      const out = {};
      for (const [kind, id, duration, mids] of [['inquiry', 34, 1200, [700, 900]], ['footprints', 39, 1500, [600, 900]]]) {
        const moved = [];
        for (const ms of [0, ...mids, duration - 50]) {
          const tt = t0 + (kind === 'inquiry' ? 0 : 2000) + ms;
          const policeExtra = { policeExtra: { id, kind, startedAt: tt - ms, elapsedMs: ms, durationMs: duration, building, phase: 'investigate' } };
          const r = await measure(env.page, { t: tt, override: policeExtra });
          moved.push(r.geo.policeRoot[0] - r.before.policeRoot[0]);
          assert.equal(r.shown.wallMismatches, 0, `${kind}@${ms}`); assert.equal(r.shown.bodyMismatches, 0, `${kind}@${ms}`);
          assert.ok((r.hidden.wallPixels - r.shown.wallPixels) / r.hidden.wallPixels <= 0.015);
          if (ms === mids[0]) await save(`${width}x${height}-${kind}`, r.image);
          if (kind === 'footprints' && ms === mids[1]) out.footprintDecorations = r.shownStats.footprints;
          // 取消（同じ時刻で policeExtra が null）：補正は0へ戻る（姿勢も位置も、追加動作の前と同じ）
          const back = r.after.policeRoot[0] - r.before.policeRoot[0];
          assert.ok(Math.abs(back) < 0.01, `${kind}@${ms}: cancelled extra leaves no offset (${back.toFixed(3)}px)`);
        }
        out[kind] = moved.map((v) => +v.toFixed(1));
        if (kind === 'footprints') assert.ok(out.footprintDecorations >= 1 && out.footprintDecorations <= 3, `footprint marks drawn (${out.footprintDecorations})`);
        assert.ok(Math.min(...moved) < -4, `${kind} slides the officer (${moved})`);
      }
      t.diagnostic(`${width}x${height} officer x shift px per sample: ${JSON.stringify(out)}`);
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('worst case: tongue, a street story and a police prop together stay within 12 draw calls, 16 shapes, 4 images; 24 decorations, 8 particles, 3 sprites', async (t) => {
  const env = await launch({ width: 402, height: 700 });
  try {
    const run = async (effects) => {
      await open(env, { effects });
      return env.page.evaluate(({ effects }) => {
        const tp = __tp;
        // 舌：実 controller。1,000〜11,000 を 500 ごと、その後の保持の中央。
        for (let t = 1000; t <= 11000; t += 500) tp.upd(t, { policeStage: 1 });
        // 警察1人を立ち位置へ（同じ流れを演出なしでも通す）
        const base = 11575;
        tp.override = effects ? { cameo: { id: 20, startedAt: base - 600, elapsedMs: 600, durationMs: 2000, building: 3, phase: 'story' }, policeExtra: { id: 34, kind: 'inquiry', startedAt: base - 600, elapsedMs: 600, durationMs: 1200, building: 3, phase: 'investigate' } } : null;
        tp.upd(base, { policeStage: 1 });
        return { stats: tp.stage.stats(), pools: tp.stats(), tongue: tp.stats().tongue, tongueFrame: tp.ctrl.snapshot().travelTongue?.phase ?? null, placements: tp.inputs.at(-1).placements };
      }, { effects });
    };
    const baseline = await run(false);
    await env.page.evaluate(() => __kamereoru.leaveGame());
    const peak = await run(true);
    assert.equal(peak.tongueFrame, 'hold');
    assert.equal(peak.tongue.diamondVisible, true);
    for (const [field, limit] of [['calls', 12], ['geometries', 16], ['textures', 4]]) {
      const added = peak.stats[field] - baseline.stats[field];
      assert.ok(added <= limit, `${field}: +${added}, limit ${limit} (${JSON.stringify({ baseline: baseline.stats, peak: peak.stats })})`);
    }
    assert.ok(peak.pools.staticDecorations <= 24, `static decorations ${peak.pools.staticDecorations}`);
    assert.ok(peak.pools.ambientParticles <= 8, `ambient particles ${peak.pools.ambientParticles}`);
    assert.ok((peak.pools.storySprites ?? 0) <= 3, `story sprites ${peak.pools.storySprites}`);
    assert.ok((peak.pools.backgroundGroups ?? 0) <= 1);
    t.diagnostic(`worst case baseline/peak: ${JSON.stringify({ baseline: baseline.stats, peak: peak.stats, story: peak.pools.storySprites, decorations: peak.pools.staticDecorations, particles: peak.pools.ambientParticles, placements: peak.placements })}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('a null cameo draws nothing and never falls back to the old director: a background group is drawn only while the controller offers a cameo', async () => {
  const env = await launch({ width: 402, height: 874 });
  try {
    await open(env);
    const r = await env.page.evaluate((CAMEO_NAMES) => {
      const tp = __tp;
      const seenOffered = new Set();
      let shownWithoutOffer = 0; let shownWithOffer = 0; let frames = 0;
      for (let t = 1000; t <= 80000; t += 100) {
        const phase = (t % 5000) < 1400 ? 'grace' : 'eval';
        tp.upd(t, { phase, policeStage: 0 });
        const offered = tp.extras.at(-1).cameo;
        const pools = tp.stats();
        const drawn = (pools.backgroundGroups ?? 0) > 0 || (pools.backgroundBirds ?? 0) > 0;
        frames += 1;
        if (offered) seenOffered.add(offered.id);
        if (drawn && !offered) shownWithoutOffer += 1;
        if (drawn && offered) shownWithOffer += 1;
      }
      return { frames, shownWithoutOffer, shownWithOffer, offered: [...seenOffered], steps: tp.inputs.length };
    }, CAMEO_NAMES);
    assert.equal(r.steps, r.frames, 'one step per frame (the old director is not stepping a second time)');
    assert.equal(r.shownWithoutOffer, 0, 'no background cameo group without a controller cameo');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
