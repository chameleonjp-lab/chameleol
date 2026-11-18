// T1：主人公の外周線の8段階（自動Chromium）。iPhone実機の確認とは別のもの。
// T1_SCREENSHOTS に保存先を渡すと、撮った画像をそこへ書く（docs/acceptance/design-followups/t1/）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch, openHome, startAnonymous } from './helpers.mjs';

const VIEWPORTS = [[402, 700], [402, 874], [874, 402]];
const SHOTS = process.env.T1_SCREENSHOTS || '';
const STAGE_OF = (b) => (b <= 10 ? 0 : b <= 15 ? 1 : b <= 20 ? 2 : b <= 25 ? 3 : b <= 30 ? 4 : b <= 35 ? 5 : b <= 39 ? 6 : 7);
const THICK = [0.0255, 0.034, 0.0425, 0.051, 0.0595, 0.068, 0.0765, 0.085];
// 2026-11-18 本人指示：線の色は全段階で現行の濃い灰色（27）。段階は太さだけで変わる。
const GRAY = [27, 27, 27, 27, 27, 27, 27, 27];
const hex = ([r, g, b]) => `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;

async function save(name, dataUrl) {
  if (!SHOTS) return;
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

/** 本編の舞台へ、時刻 t・表示中の棟 building を渡して一度描き、輪郭の段階と画像を返す。 */
async function drawAs(page, { t, building, color = null, sceneT = null, shot = false }) {
  return page.evaluate(({ t, building, color, sceneT, shot }) => {
    const a = __kamereoru;
    const stage = a.stage;
    const c = color ?? a.session.state.color;
    const view = { t, building, passed: building - 1, phase: 'grace', color: c, policeStage: 0, running: false, matchState: null, combo: 0, maxCombo: 0 };
    // sceneT（ガイドの見せる位置）はゲーム時計 t と別。棟は presentation.building から決まる
    stage.update({ t: sceneT ?? t, color: c, policeStage: 0, walking: false, presentation: view });
    stage.update({ t: sceneT ?? t, color: c, policeStage: 0, walking: false, presentation: view });
    return { outline: stage.outlineStyle(), url: shot ? stage.renderer.domElement.toDataURL('image/png') : null };
  }, { t, building, color, sceneT, shot });
}

/**
 * 主人公まわりの画素の数え上げ。体色（目標色と離れた初期色）に完全一致する画素の外接枠を主人公の位置とし、
 * その周囲だけで、外周線の灰色（gray±4）と、内側の黒線（目の渦・瞳・口。45以下）の画素を数える。
 */
async function heroZone(page, { building, t, gray, shot = null }) {
  return page.evaluate(async ({ building, t, gray }) => {
    const { hsvToHex } = await import('/src/rules/v1/index.js');
    const a = __kamereoru;
    const color = a.session.state.color;
    const view = { t, building, passed: Math.max(0, building - 1), phase: 'grace', color, policeStage: 0, running: false, matchState: null, combo: 0, maxCombo: 0 };
    for (let i = 0; i < 2; i += 1) a.stage.update({ t, color, policeStage: 0, walking: false, presentation: view });
    const url = a.stage.renderer.domElement.toDataURL('image/png');
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const want = hsvToHex(color).slice(1).match(/../g).map((x) => parseInt(x, 16));
    let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1;
    for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
      const i = (y * c.width + x) * 4;
      if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const pad = 40; let line = 0; let dark = 0;
    for (let y = Math.max(0, y0 - pad); y <= Math.min(c.height - 1, y1 + pad); y += 1) for (let x = Math.max(0, x0 - pad); x <= Math.min(c.width - 1, x1 + pad); x += 1) {
      const i = (y * c.width + x) * 4;
      if (Math.abs(d[i] - gray) <= 4 && Math.abs(d[i + 1] - gray) <= 4 && Math.abs(d[i + 2] - gray) <= 4) line += 1;
      if (d[i] <= 45 && d[i + 1] <= 45 && d[i + 2] <= 45) dark += 1;
    }
    return { found: x1 >= 0, box: [x0, y0, x1, y1], line, dark, url, stage: a.stage.outlineStyle().stage };
  }, { building, t, gray });
}

test('段階の境目：10→11、15→16、20→21、25→26、30→31、35→36、39→40 と本編の全50棟', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    const seen = [];
    for (let b = 1; b <= 50; b += 1) {
      const r = await page.evaluate(async (b) => {
        const a = __kamereoru;
        await a.debugStart({ atMs: (b - 1) * 5000 + 300, seed: 1 });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const o = a.stage.outlineStyle();
        await a.leaveGame();
        return o;
      }, b);
      assert.equal(r.stage, STAGE_OF(b), `building ${b}`);
      assert.equal(r.thickness, THICK[STAGE_OF(b)], `building ${b}`);
      assert.equal(Math.round(r.rgb[0] * 255), GRAY[STAGE_OF(b)], `building ${b}`);
      seen.push(r.stage);
    }
    for (const [a, b] of [[10, 11], [15, 16], [20, 21], [25, 26], [30, 31], [35, 36], [39, 40]]) assert.equal(seen[b - 1], seen[a - 1] + 1, `${a}->${b}`);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('40棟以降は現行値（太さ0.085・色0.1059）。39→40 で前の値へ戻らず、同じ段階では書き直さない', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 36 * 5000, seed: 1 }));
    const log = await page.evaluate(() => {
      const a = __kamereoru; const out = [];
      for (let t = 36 * 5000 + 4900; t <= 40 * 5000 + 300; t += 100) {
        const b = Math.floor(t / 5000) + 1;
        const view = { t, building: b, passed: b - 1, phase: 'grace', color: a.session.state.color, policeStage: 0, running: false, matchState: null, combo: 0, maxCombo: 0 };
        a.stage.update({ t, color: a.session.state.color, policeStage: 0, walking: false, presentation: view });
        const o = a.stage.outlineStyle(); out.push({ b, stage: o.stage, thickness: o.thickness, r: o.rgb[0], writes: o.writes });
      }
      return out;
    });
    const last = log.at(-1);
    assert.equal(last.stage, 7);
    assert.equal(last.thickness, 0.085);
    assert.ok(Math.abs(last.r - 0.1059) < 1e-6);
    for (let i = 1; i < log.length; i += 1) assert.ok(log[i].stage >= log[i - 1].stage, '前の段階へ戻らない');
    assert.equal(log.find((e) => e.b === 39).stage, 6);
    assert.equal(log.find((e) => e.b === 40).stage, 7);
    // 同じ段階の間は書き込み回数が増えない。段階が変わった回数だけ増える
    const changes = log.filter((e, i) => i && e.stage !== log[i - 1].stage).length;
    assert.equal(last.writes - log[0].writes, changes);
    assert.equal(changes, 1);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('静止ガイド：sceneT（見せる位置）と棟番号が違っても、段階は表示中の棟で決まる', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 300, seed: 1 }));
    // 本編の静止ガイド step3（t=95000, sceneT=97000, 20棟目）と、位置が別の棟にずれた場合
    for (const [building, sceneT, want] of [[20, 97000, 2], [20, 130000, 2], [21, 52000, 3], [5, 160000, 0], [39, 10000, 6], [40, 10000, 7]]) {
      const r = await drawAs(page, { t: (building - 1) * 5000, building, sceneT });
      assert.equal(r.outline.stage, want, `building ${building} sceneT ${sceneT}`);
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('本編の静止ガイド step3 は20棟の段階（アプリ全体で）', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await startAnonymous(page);
    await page.evaluate(() => {
      const a = __kamereoru; const s = a.session; const rules = s.rules;
      for (let i = 1; i <= 19; i += 1) {
        const tEval = (i - 1) * rules.buildingMs + rules.evalStartMs - 100;
        const target = s.game.course.targets[i - 1];
        s.apply({ type: 'color', t: Math.max(s.state.t, tEval), h: target.h, s: target.s, v: i >= rules.brightnessUnlockBuilding ? target.v : rules.valMax });
      }
      s.apply({ type: 'tick', t: 95000 });
    });
    // 明るさガイドの取得が遅い環境でも、固定の待ち時間ではなく状態で待つ
    await page.waitForFunction(() => globalThis.__kamereoru.guidance.view().step === 3, null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
      const a = __kamereoru; const s = a.session;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const g = a.guidance.view();
      return { step: g.step, building: g.building, sceneT: g.sceneT, t: s.state.t, outline: a.stage.outlineStyle() };
    });
    assert.equal(r.step, 3);
    assert.equal(r.t, 95000);
    assert.equal(r.sceneT, 97000);
    assert.equal(r.outline.stage, 2);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('個別ガイド：静止の練習は対象棟の段階、通常の静止練習は最初の段階', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    for (const [step, want] of [[1, 0], [2, 0], [3, 2], [4, 3]]) {
      const r = await page.evaluate(async (step) => {
        await __kamereoru.debugGuide({ step });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const v = __kamereoru.guidePractice.view();
        return { building: v.building, outline: __kamereoru.stage.outlineStyle() };
      }, step);
      assert.equal(r.outline.stage, want, `guide step ${step} building ${r.building}`);
    }
    // 通常の静止練習の呼び出し（棟を渡さない）は、直前が40棟でも最初の段階へ戻る
    const o = await page.evaluate(() => {
      const st = __kamereoru.stage;
      st.renderPractice({ h: 100, s: 5000, v: 10000 }, { h: 12000, s: 6000, v: 10000 }, { building: 40 });
      const high = st.outlineStyle().stage;
      st.renderPractice({ h: 100, s: 5000, v: 10000 }, { h: 12000, s: 6000, v: 10000 });
      return { high, low: st.outlineStyle().stage };
    });
    assert.deepEqual(o, { high: 7, low: 0 });
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('保存からの再開：最初に描いた画面から当該棟の線（31棟→段階5）', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await page.addInitScript(() => {
      globalThis.__outlineAtDraw = [];
      for (const C of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext]) {
        if (!C) continue;
        for (const name of ['drawElements', 'drawArrays']) {
          const orig = C.prototype[name];
          C.prototype[name] = function (...args) {
            const st = globalThis.__kamereoru?.stage;
            if (st && st.kind === 'three' && st.renderer?.domElement === this.canvas && globalThis.__watchDraws) {
              const o = st.outlineStyle();
              if (!globalThis.__outlineAtDraw.length || globalThis.__outlineAtDraw.at(-1) !== o.stage) globalThis.__outlineAtDraw.push(o.stage);
            }
            return orig.apply(this, args);
          };
        }
      }
    });
    await openHome(page, env.url);
    await page.evaluate(async () => {
      globalThis.__watchDraws = true;
      await __kamereoru.debugStart({ atMs: 30 * 5000 + 1000, seed: 1 }); // 31棟目（保存から再開する経路）
    });
    await page.waitForFunction(() => globalThis.__outlineAtDraw.length > 0, null, { timeout: 20000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); // 続く描画も記録させる
    const seen = await page.evaluate(() => globalThis.__outlineAtDraw);
    assert.ok(seen.length > 0, '新しい舞台が描かれた');
    assert.equal(seen[0], 5, `最初に描いた画面から31棟の段階。実際の並び: ${JSON.stringify(seen)}`);
    assert.deepEqual(seen, [5]);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('外周線の画素：全段階が現行の濃い灰色で、段階が進むほど線が太く（線の画素が多く）なる（倍率2）', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 5000 * 3 + 2500, seed: 1 }));
    const t = 5000 * 3 + 2500;
    const thin = await heroZone(page, { building: 1, t, gray: GRAY[0] });
    const mid = await heroZone(page, { building: 26, t, gray: GRAY[4] });
    const thick = await heroZone(page, { building: 40, t, gray: GRAY[7] });
    const again = await heroZone(page, { building: 1, t, gray: GRAY[0] });
    for (const r of [thin, mid, thick]) assert.ok(r.found, '主人公の体色の画素が見つかる');
    assert.ok(thin.line > 100, `段階0でも濃い線が主人公のまわりに出る (${thin.line})`);
    assert.ok(mid.line > thin.line, `段階4は段階0より線が太い (${mid.line} / ${thin.line})`);
    assert.ok(thick.line > mid.line, `段階7は段階4より線が太い (${thick.line} / ${mid.line})`);
    assert.ok(thin.dark > 30, `内側の黒線（目の渦・瞳・口）は段階0でも残る (${thin.dark})`);
    assert.equal(again.url, thin.url, '同じ段階へ戻せば同じ画素（前の値を引きずらない）');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

const BRIGHT_WALLS = 3;
for (const [width, height] of VIEWPORTS) {
  test(`比較面：明るい壁3色・暗い壁3色で壁と胴の中央の画素が線の段階に関わらず同じ（${width}x${height}）`, async () => {
    // 全画素の検査（checkComparisonSurfaces）は既存の GAME-07b と同じ倍率1で行う（倍率2では基準版にも境界の1画素差がある）
    const env = await launch({ width, height });
    const { page } = env;
    try {
      await openHome(page, env.url);
      await page.evaluate(() => __kamereoru.debugStart({ atMs: 300, seed: 1 }));
      const picks = await page.evaluate((n) => {
        const targets = __kamereoru.session.game.course.targets;
        const idx = targets.map((t, i) => ({ i: i + 1, ...t }));
        // 色相が離れた3棟ずつ。明るい壁は解放前の棟（1〜19、v=最大）、暗い壁は解放後の棟（20〜50）で v の小さい方
        const pickSpread = (list) => {
          const out = [];
          for (const c of list) if (out.every((o) => Math.abs(((o.h - c.h + 54000) % 36000) - 18000) < 15000 || Math.abs(o.h - c.h) > 6000)) out.push(c);
          return out.slice(0, n);
        };
        const bright = pickSpread(idx.filter((c) => c.i < 20 && c.s >= 2000).sort((a, b) => b.s - a.s));
        const dark = pickSpread(idx.filter((c) => c.i >= 20 && c.i <= 50).sort((a, b) => a.v - b.v));
        return { bright: bright.map((c) => c.i), dark: dark.map((c) => c.i) };
      }, BRIGHT_WALLS);
      assert.equal(picks.bright.length, 3);
      assert.equal(picks.dark.length, 3);
      for (const group of ['bright', 'dark']) {
        for (const index of picks[group]) {
          const t = (index - 1) * 5000 + 2500;
          const read = (outlineBuilding) => page.evaluate(async ({ index, t, outlineBuilding }) => {
            const { hsvToHex } = await import('/src/rules/v1/index.js');
            const a = __kamereoru; const target = a.session.game.course.targets[index - 1];
            const color = { ...target };
            const view = { t, building: outlineBuilding, passed: index - 1, phase: 'grace', color, policeStage: 0, running: false, matchState: null, combo: 0, maxCombo: 0 };
            for (let i = 0; i < 2; i += 1) a.stage.update({ t, color, policeStage: 0, walking: false, presentation: view });
            const sample = a.stage.sampleComparison(index);
            const check = a.stage.checkComparisonSurfaces();
            return { sample, check: { wallPixels: check.wallPixels, wallMismatches: check.wallMismatches, bodyPixels: check.bodyPixels, bodyMismatches: check.bodyMismatches }, expect: hsvToHex(target), stage: a.stage.outlineStyle().stage };
          }, { index, t, outlineBuilding });
          const thin = await read(1);
          const thick = await read(40);
          assert.equal(thin.stage, 0);
          assert.equal(thick.stage, 7);
          assert.ok(thin.sample && thick.sample, `${group} ${index}: 比較面が見えている`);
          assert.equal(hex(thin.sample.wall), thin.expect, `${group} ${index} wall (stage0)`);
          assert.equal(hex(thick.sample.wall), thick.expect, `${group} ${index} wall (stage7)`);
          assert.equal(hex(thin.sample.hero), thin.expect, `${group} ${index} body (stage0)`);
          assert.deepEqual(thin.sample.wall, thick.sample.wall, `${group} ${index}: 壁の中央は段階で変わらない`);
          assert.deepEqual(thin.sample.hero, thick.sample.hero, `${group} ${index}: 胴の中央は段階で変わらない`);
          for (const r of [thin.check, thick.check]) {
            assert.ok(r.wallPixels > 500 && r.bodyPixels > 0, `${group} ${index}: 比較面の画素 ${JSON.stringify(r)}`);
            assert.equal(r.wallMismatches, 0, `${group} ${index}`);
            assert.equal(r.bodyMismatches, 0, `${group} ${index}`);
          }
        }
      }
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

for (const [width, height] of VIEWPORTS) {
  test(`画像：段階ごとの主人公（${width}x${height}、倍率2）。線が一周つながり、内側の黒線は1棟と40棟で同じ`, async () => {
    const env = await launch({ width, height, scale: 2 });
    const { page } = env;
    try {
      await openHome(page, env.url);
      await page.evaluate(() => __kamereoru.debugStart({ atMs: 300, seed: 1 }));
      const results = [];
      for (const b of [1, 10, 11, 20, 21, 30, 31, 39, 40, 45]) {
        const t = (b - 1) * 5000 + 2500;
        const r = await drawAs(page, { t, building: b, shot: true });
        assert.equal(r.outline.stage, STAGE_OF(b));
        await save(`t1-${width}x${height}-b${String(b).padStart(2, '0')}`, r.url);
        results.push({ b, stage: r.outline.stage });
      }
      assert.equal(results.length, 10);
      // 内側の黒線（目の渦・瞳・口）は、1棟でも40棟でも同じように残る。外周の線の太さだけが段階で変わる
      const t4 = 5000 * 3 + 2500;
      const lo = await heroZone(page, { building: 1, t: t4, gray: GRAY[0] });
      const hi = await heroZone(page, { building: 40, t: t4, gray: GRAY[7] });
      assert.ok(lo.found && hi.found);
      assert.ok(lo.dark > 30, `1棟でも内側の黒線が残る (${lo.dark})`);
      assert.ok(lo.line > 100, `1棟でも濃い線が出る (${lo.line})`);
      assert.ok(hi.line > lo.line, `40棟は1棟より線が太い (${hi.line} / ${lo.line})`);
      assert.ok(hi.dark >= lo.dark, '40棟は外周の分だけ暗い画素が多い');
      assert.deepEqual(env.errors, []);
    } finally { await env.close(); }
  });
}

test('画像（倍率3）：最も細い段階（1棟）と現行の段階（40棟）', async () => {
  const env = await launch({ scale: 3 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 300, seed: 1 }));
    await page.evaluate(() => __kamereoru.stage.update); // 本編のループが同じ棟を描き続ける状態で撮る
    await page.waitForFunction(() => globalThis.__kamereoru.stage?.outlineStyle?.().stage === 0, null, { timeout: 20000 });
    const r1 = await drawAs(page, { t: 2500, building: 1, shot: true });
    assert.equal(r1.outline.stage, 0);
    await save('t1-402x874-scale3-b01', r1.url);
    const r40 = await drawAs(page, { t: 39 * 5000 + 2500, building: 40, shot: true });
    assert.equal(r40.outline.stage, 7);
    await save('t1-402x874-scale3-b40', r40.url);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('簡易表示（WebGLなし）：同じ段階の色と相対的な太さ。段階8は従来と同じ画素', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    const stages = await page.evaluate(async () => {
      const { createStage } = await import('/src/scene/stage.js');
      const box = document.createElement('div');
      box.id = 'dom-box';
      box.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:300px;background:#fff;z-index:99999;overflow:hidden';
      document.body.append(box);
      const targets = Array.from({ length: 50 }, () => ({ h: 12000, s: 6000, v: 10000 }));
      const st = await createStage(box, { course: { targets }, forceDom: true });
      globalThis.__domStage = st;
      const out = [];
      for (const b of [1, 10, 11, 16, 21, 26, 31, 36, 40, 50]) {
        st.update({ t: (b - 1) * 5000, color: { h: 12000, s: 6000, v: 10000 }, policeStage: 0, presentation: { building: b } });
        const el = box.querySelector('.dom-hero'); const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        out.push({ b, kind: st.kind, dpr: devicePixelRatio, stage: st.outlineStyle().stage, border: parseFloat(cs.borderTopWidth), color: cs.borderTopColor, face: [el.clientWidth, el.clientHeight], faceLeft: r.left + el.clientLeft, faceBottom: r.bottom - el.clientLeft });
      }
      return out;
    });
    const rgbOfStage = (s) => `rgb(${GRAY[s]}, ${GRAY[s]}, ${GRAY[s]})`;
    for (const r of stages) {
      assert.equal(r.kind, 'dom');
      assert.equal(r.stage, STAGE_OF(r.b));
      assert.equal(r.color, rgbOfStage(r.stage), `building ${r.b}`);
      // 枠は整数px：floor(3 x 太さ/0.085)、最小1px
      assert.equal(r.border, Math.max(1, Math.floor(3 * (THICK[r.stage] / 0.085))), `border at building ${r.b}`);
      assert.ok(Math.abs(r.face[0] - 58) <= 1.5 && Math.abs(r.face[1] - 74) <= 1.5, `色の面は58x74のまま ${r.face}`);
      assert.ok(Math.abs(r.faceLeft - stages[0].faceLeft) <= 1 && Math.abs(r.faceBottom - stages[0].faceBottom) <= 1, '色の面の位置は動かない');
    }
    for (let i = 1; i < stages.length; i += 1) assert.ok(stages[i].border >= stages[i - 1].border, '段階が進んでも細くならない');
    assert.ok(stages.find((r) => r.b === 1).border < stages.find((r) => r.b === 36).border, '段階が進むほど太い');
    // 段階8（40棟）は従来の見た目（64x80・3px・#1b1b1b）と同じ画素
    const box = page.locator('#dom-box');
    await page.evaluate(() => globalThis.__domStage.update({ t: 39 * 5000, color: { h: 12000, s: 6000, v: 10000 }, policeStage: 0, presentation: { building: 40 } }));
    const now = await box.screenshot({ animations: 'disabled' });
    await page.addStyleTag({ content: '.dom-hero{width:64px!important;height:80px!important;margin-left:-32px!important;bottom:18%!important;border:3px solid #1b1b1b!important}' });
    const old = await box.screenshot({ animations: 'disabled' });
    assert.ok(now.equals(old), '段階8の簡易表示は従来と画素まで同じ');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('簡易表示の画像（3寸法）を残す', async () => {
  if (!SHOTS) return;
  for (const [width, height] of VIEWPORTS) {
    const env = await launch({ width, height, scale: 2 });
    const { page } = env;
    try {
      await openHome(page, env.url);
      for (const b of [1, 40]) {
        await page.evaluate(async (b) => {
          const { createStage } = await import('/src/scene/stage.js');
          document.querySelector('#dom-box')?.remove();
          const box = document.createElement('div');
          box.id = 'dom-box';
          box.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;background:#fff;z-index:99999';
          document.body.append(box);
          const st = await createStage(box, { course: { targets: Array.from({ length: 50 }, () => ({ h: 12000, s: 6000, v: 10000 })) }, forceDom: true });
          st.update({ t: (b - 1) * 5000 + 1000, color: { h: 22000, s: 6000, v: 10000 }, policeStage: 0, presentation: { building: b } });
        }, b);
        await mkdir(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/t1-${width}x${height}-dom-b${String(b).padStart(2, '0')}.png` });
      }
    } finally { await env.close(); }
  }
});

test('10→11棟の連続（t=49,900〜50,300）：前の段階へ戻らず、書き込みは1回だけ増える', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 9 * 5000, seed: 1 }));
    const log = await page.evaluate(() => {
      const a = __kamereoru; const out = [];
      for (let t = 49900; t <= 50300; t += 100) {
        const b = Math.floor(t / 5000) + 1;
        const view = { t, building: b, passed: b - 1, phase: 'grace', color: a.session.state.color, policeStage: 0, running: false, matchState: null, combo: 0, maxCombo: 0 };
        a.stage.update({ t, color: a.session.state.color, policeStage: 0, walking: false, presentation: view });
        const o = a.stage.outlineStyle(); out.push({ b, stage: o.stage, thickness: o.thickness, writes: o.writes });
      }
      return out;
    });
    assert.equal(log.find((e) => e.b === 10).stage, 0);
    assert.equal(log.find((e) => e.b === 11).stage, 1);
    assert.equal(log.at(-1).thickness, 0.034);
    for (let i = 1; i < log.length; i += 1) assert.ok(log[i].stage >= log[i - 1].stage, '前の段階へ戻らない');
    assert.equal(log.at(-1).writes - log[0].writes, 1, '段階が変わった1回だけ書く');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('終了演出：40棟で始めても線は現行の段階のまま、書き込みは増えない', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 39 * 5000 + 2500, seed: 1 }));
    await page.waitForFunction(() => __kamereoru.stage.outlineStyle().stage === 7, null, { timeout: 20000 });
    const r = await page.evaluate(async () => {
      const st = __kamereoru.stage;
      const before = st.outlineStyle();
      const during = [];
      await st.playEnding('detected', { onFrame: () => during.push(st.outlineStyle()) });
      const after = st.outlineStyle();
      return { before, during: during.map((o) => [o.stage, o.thickness, o.writes]), after };
    });
    assert.equal(r.before.stage, 7);
    assert.ok(r.during.length > 0, '終了演出の途中の描画がある');
    for (const [stage, thickness, writes] of r.during) {
      assert.equal(stage, 7);
      assert.equal(thickness, 0.085);
      assert.equal(writes, r.before.writes);
    }
    assert.equal(r.after.stage, 7);
    assert.equal(r.after.writes, r.before.writes);
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('比較面（倍率2・402x874）：明るい壁と暗い壁で、段階1の不一致は段階8の数を超えない', async () => {
  const env = await launch({ width: 402, height: 874, scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    await page.evaluate(() => __kamereoru.debugStart({ atMs: 300, seed: 1 }));
    const picks = await page.evaluate(() => {
      const idx = __kamereoru.session.game.course.targets.map((t, i) => ({ i: i + 1, ...t }));
      return { bright: idx.filter((c) => c.i < 20).sort((a, b) => b.s - a.s)[0].i, dark: idx.filter((c) => c.i >= 20).sort((a, b) => a.v - b.v)[0].i };
    });
    for (const index of [picks.bright, picks.dark]) {
      const t = (index - 1) * 5000 + 2500;
      const read = (outlineBuilding) => page.evaluate(({ index, t, outlineBuilding }) => {
        const a = __kamereoru; const color = { ...a.session.game.course.targets[index - 1] };
        const view = { t, building: outlineBuilding, passed: index - 1, phase: 'grace', color, policeStage: 0, running: false, matchState: null, combo: 0, maxCombo: 0 };
        for (let i = 0; i < 2; i += 1) a.stage.update({ t, color, policeStage: 0, walking: false, presentation: view });
        const c = a.stage.checkComparisonSurfaces();
        return { stage: a.stage.outlineStyle().stage, wm: c.wallMismatches, bm: c.bodyMismatches, wp: c.wallPixels, bp: c.bodyPixels };
      }, { index, t, outlineBuilding });
      const thin = await read(1);
      const thick = await read(40);
      assert.equal(thin.stage, 0);
      assert.equal(thick.stage, 7);
      assert.ok(thin.wp > 500 && thin.bp > 0, `比較面の画素 ${JSON.stringify(thin)}`);
      assert.ok(thin.wm <= thick.wm, `壁の不一致 ${thin.wm} > ${thick.wm} at ${index}`);
      assert.ok(thin.bm <= thick.bm, `胴の不一致 ${thin.bm} > ${thick.bm} at ${index}`);
    }
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

test('簡易表示：presentation が無く t が250,000以上でも、棟は50で止まり段階8のまま', async () => {
  const env = await launch({ scale: 2 });
  const { page } = env;
  try {
    await openHome(page, env.url);
    const r = await page.evaluate(async () => {
      const { createStage } = await import('/src/scene/stage.js');
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:300px';
      document.body.append(box);
      const targets = Array.from({ length: 50 }, () => ({ h: 12000, s: 6000, v: 10000 }));
      const st = await createStage(box, { course: { targets }, forceDom: true });
      const color = { h: 12000, s: 6000, v: 10000 };
      const out = {};
      for (const t of [245000, 249999, 250000, 260000]) {
        st.update({ t, color, policeStage: 0 });
        out[t] = st.outlineStyle().stage;
      }
      return { kind: st.kind, out };
    });
    assert.equal(r.kind, 'dom');
    assert.deepEqual(r.out, { 245000: 7, 249999: 7, 250000: 7, 260000: 7 });
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});
