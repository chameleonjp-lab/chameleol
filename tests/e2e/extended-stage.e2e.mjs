// CL03 ④：街5案・警察2案・舌を、舞台自身の extended96 の経路（実 stage → 実 controller の step → 実 accents/reactions）で
// 3寸法に描く（自動 Chromium。iPhone 実機の見え方・性能の確認とは別のもの）。
// 試験専用の入口 tests/e2e/fixtures/extended96.html（index.html・app.js は変えない）を使う。
// controller は本物。小芝居・警察の追加動作を指定の時点に出すため、step の戻り値の cameo / policeExtra だけを
// controller が返す形式の枠（id, startedAt, elapsedMs, durationMs, building, phase）へ置き換えられる。
// These forced snapshots test drawing only; real availability is measured separately at first grace.
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

async function open(env, { effects = true, cameoSeed = null, holdClaim = false } = {}) {
  await env.page.goto(`${env.url}tests/e2e/fixtures/extended96.html`);
  await env.page.waitForFunction(() => globalThis.__fixtureReady === true);
  await env.page.evaluate(async ({ effects, cameoSeed, holdClaim }) => {
    const a = __kamereoru;
    const claims=[];
    const createPort=a.createExtrasPort.bind(a);
    a.createExtrasPort=(session,options)=>{
      const port=createPort(session,cameoSeed===null?options:{...options,seed:cameoSeed});
      const claim=port.claimCameoStart.bind(port);
      port.claimCameoStart=state=>{
        const pending=holdClaim?new Promise(resolve=>{globalThis.__releaseCameoClaim=async()=>resolve(await claim(state));}):claim(state);
        claims.push(pending);return pending;
      };
      return port;
    };
    await a.debugStart({ atMs: 1000, seed: 1, effects });
    cancelAnimationFrame(a.raf);
    const { readPlayView } = await import('/src/presentation/events.js');
    const base = readPlayView(a.session, 0, { lastEvalSuccess: false });
    const tp = {
      a, base, claims, stage: a.stage, ctrl: a.gameExtrasController, override: null, inputs: [], extras: [],
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
  }, { effects, cameoSeed, holdClaim });
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
  test(`render-only forced street snapshots at ${width}x${height}: comparison surfaces stay protected (not a play-availability measurement)`, async (t) => {
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
      t.diagnostic(`${width}x${height} render-only settled-frame placements (not first-grace availability): ${JSON.stringify(facts)}`);
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
    const r = await env.page.evaluate(async (CAMEO_NAMES) => {
      const tp = __tp;
      const seenOffered = new Set();
      let shownWithoutOffer = 0; let shownWithOffer = 0; let frames = 0;
      let actualArtworkFrames=0;
      for (let t = 1000; t <= 80000; t += 16) {
        const phase = (t % 5000) < 1400 ? 'grace' : 'eval';
        tp.upd(t, { phase, policeStage: 0 });
        const offered = tp.extras.at(-1).cameo;
        const pools = tp.stats();
        const drawn = (pools.backgroundGroups ?? 0) > 0 || (pools.backgroundBirds ?? 0) > 0;
        frames += 1;
        if (offered) seenOffered.add(offered.id);
        if (drawn && !offered) shownWithoutOffer += 1;
        if (drawn && offered) shownWithOffer += 1;
        if(offered&&(pools.visibleArtwork??[]).some(name=>CAMEO_NAMES.includes(name)||name==='residentFace'))actualArtworkFrames++;
        // Await the real persistence claims, without a wall-clock sleep or a replacement output.
        if(frames%4===0)await Promise.all(tp.claims);
      }
      return { frames, shownWithoutOffer, shownWithOffer, actualArtworkFrames, offered: [...seenOffered], steps: tp.inputs.length };
    }, CAMEO_NAMES);
    assert.equal(r.steps, r.frames, 'one step per frame (the old director is not stepping a second time)');
    assert.equal(r.shownWithoutOffer, 0, 'no background cameo group without a controller cameo');
    assert.ok(r.offered.length>=2,`at least two actual cameos must occur: ${JSON.stringify(r)}`);
    assert.ok(r.shownWithOffer>0&&r.actualArtworkFrames>0,'the test observes actual added artwork as well as offered slots');
    assert.deepEqual(env.errors, []);
  } finally { await env.close(); }
});

// Real acceptance path: no replacement snapshot, real placements, real persisted start claims.
test('real E020 claim: the actual stage offers a placement, draws nothing before persistence, then draws the claimed story',async()=>{
  const env=await launch({width:402,height:700});
  try{
    await open(env,{cameoSeed:1100,holdClaim:true});
    const before=await env.page.evaluate(()=>{
      __tp.upd(1000,{phase:'eval'});__tp.upd(2000,{phase:'grace'});
      return {placement:__tp.inputs.at(-1).placements.railway,cameo:__tp.ctrl.snapshot().cameo,stats:__tp.stats(),hasClaim:typeof __releaseCameoClaim==='function'};
    });
    assert.equal(before.placement,true);assert.equal(before.hasClaim,true);
    assert.equal(before.cameo,null);assert.equal(before.stats.storySprites,0);
    const after=await env.page.evaluate(async()=>{
      await __releaseCameoClaim();await Promise.all(__tp.claims);
      __tp.upd(2016,{phase:'grace'});
      return {cameo:__tp.ctrl.snapshot().cameo,stats:__tp.stats()};
    });
    assert.equal(after.cameo?.id,20);
    assert.ok(after.stats.storySprites>=1&&after.stats.storySprites<=3);
    assert.ok(after.stats.visibleArtwork.some(name=>name.startsWith('crossing')));
    assert.deepEqual(env.errors,[]);
  }finally{await env.close();}
});

for(const [width,height] of LAYOUTS){
  test(`real first-grace placements at ${width}x${height}: scan all 49 opportunities instead of settled synthetic poses`,async(t)=>{
    const env=await launch({width,height});
    try{
      await open(env);
      const rows=await env.page.evaluate(async()=>{
        const rows=[];
        for(let building=2;building<=50;building++){
          const start=(building-1)*5000;
          for(let time=start-800;time<start;time+=16)__tp.upd(time,{phase:'eval',policeStage:0});
          __tp.upd(start,{phase:'grace',policeStage:0});
          rows.push({building,t:start,...__tp.inputs.at(-1)});
          await Promise.all(__tp.claims);
        }
        return rows;
      });
      assert.equal(rows.length,49);
      assert.equal(new Set(rows.map(row=>row.building)).size,49);
      for(const row of rows){assert.equal(row.phase,'grace');assert.equal(row.t,(row.building-1)*5000);}
      const counts=Object.fromEntries(['railway','water','robot','bird'].map(key=>[key,rows.filter(row=>row.placements[key]).length]));
      assert.ok(counts.railway>0&&counts.robot>0&&counts.bird>0,'the first-grace sweep must observe usable railway, robot and bird placements in every canvas');
      // F04/Q07 permits conditional non-display: the tall canvas has no naturally visible gutter gap at +500ms.
      if(SHOTS){await mkdir(SHOTS,{recursive:true});await writeFile(`${SHOTS}/${width}x${height}-first-grace.json`,JSON.stringify({width,height,counts,rows},null,2));}
      t.diagnostic(`first-grace placement counts out of 49: ${JSON.stringify({width,height,...counts})}`);
      assert.deepEqual(env.errors,[]);
    }finally{await env.close();}
  });

  test(`real bird at ${width}x${height}: persisted selection draws bird, parcel and rope through the whole route`, async(t)=>{
    const env=await launch({width,height});
    try{
      // First three opportunities are the unchanged 10% none draw; fourth selects E069.
      await open(env,{cameoSeed:22509});
      const report=await env.page.evaluate(async()=>{
        const tp=__tp;
        for(let building=2;building<=5;building++){
          const start=(building-1)*5000;
          for(let time=start-800;time<start;time+=16)tp.upd(time,{phase:'eval',policeStage:0});
          tp.upd(start,{phase:'grace',policeStage:0});
          await Promise.all(tp.claims);
        }
        const {captureAtlasCell}=await import('/tests/presentation/atlas-capture.mjs');
        const atlas=await(await fetch('/src/presentation/assets/atlas.json')).json();
        const renderer=tp.stage.renderer,original=renderer.render;
        let scene,camera;
        renderer.render=function(s,c){scene=s;camera=c;return original.call(this,s,c);};
        const read=()=>{const canvas=renderer.domElement,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const c=copy.getContext('2d');c.drawImage(canvas,0,0);return c.getImageData(0,0,copy.width,copy.height);};
        const samples=[];
        try{
          for(const elapsed of [250,500,1000,1500,1900]){
            tp.upd(20000+elapsed,{phase:'grace',policeStage:0});
            const frame=tp.ctrl.snapshot().cameo,stats=tp.stats(),cells=[];
            for(const name of [stats.visibleArtwork.includes('birdCarryA')?'birdCarryA':'birdCarryB','parcel','rope']){
              const captured=captureAtlasCell({scene,camera,renderer,cellIndex:atlas.street[name].index,columns:atlas.columns,rows:atlas.rows,viewport:{width:renderer.domElement.width,height:renderer.domElement.height},read});
              let pixels=0;
              for(let i=0;i<captured.shown.data.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(captured.shown.data[i+k]-captured.hidden.data[i+k])))>24)pixels++;
              cells.push({name,pixels,projected:captured.projected});
            }
            const shown=tp.stage.checkComparisonSurfaces();
            samples.push({elapsed,frame,stats,cells,shown,canvas:{width:renderer.domElement.width,height:renderer.domElement.height},image:elapsed===1000?tp.image():null});
          }
        }finally{renderer.render=original;}
        return samples;
      });
      for(const row of report){
        assert.equal(row.frame?.id,69,'the real controller and persistent claim start E069 without an override');
        assert.equal(row.stats.storySprites,3);
        assert.equal(row.shown.wallMismatches,0);assert.equal(row.shown.bodyMismatches,0);
        for(const cell of row.cells)assert.ok(cell.pixels>=(row.elapsed===1000?3:1),`${cell.name}@${row.elapsed}: visible pixels ${cell.pixels}`);
        if(row.elapsed===1000)for(const cell of row.cells){const b=cell.projected;assert.ok(b.l>=8&&b.t>=8&&b.r<=row.canvas.width-8&&b.b<=row.canvas.height-8, `whole ${cell.name} inset: ${JSON.stringify(b)}`);}
      }
      await save(`${width}x${height}-real-bird`,report.find(r=>r.elapsed===1000)?.image);
      if(SHOTS){await mkdir(SHOTS,{recursive:true});await writeFile(`${SHOTS}/${width}x${height}-real-bird.json`,JSON.stringify(report.map(({image,...row})=>row),null,2));}
      t.diagnostic(JSON.stringify(report.map(({elapsed,cells})=>({elapsed,cells}))));
      assert.deepEqual(env.errors,[]);
    }finally{await env.close();}
  });

  test(`real midpoint at ${width}x${height}: delivery after the entry reaction and a fully visible static flag, with best 25`,async(t)=>{
    const env=await launch({width,height});
    try{
      await open(env);
      await env.page.evaluate(()=>__tp.stage.setBestDistance(25));
      const trace=await env.page.evaluate(async()=>{
        const tp=__tp,delivery=[],staticFrames=[];
        const {captureAtlasCell}=await import('/tests/presentation/atlas-capture.mjs');
        const atlas=await (await fetch('/src/presentation/assets/atlas.json')).json();
        let renderScene,renderCamera;
        const renderer=tp.stage.renderer,originalRender=renderer.render;
        renderer.render=function(scene,camera){renderScene=scene;renderCamera=camera;return originalRender.call(this,scene,camera);};
        let passed=false,deliveryImage=null,staticCapture=null;
        const pixels=()=>{
          const canvas=tp.stage.renderer.domElement,copy=document.createElement('canvas');
          copy.width=canvas.width;copy.height=canvas.height;
          const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0);
          const data=ctx.getImageData(0,0,copy.width,copy.height).data;
          const result={data,width:copy.width,height:copy.height};copy.width=copy.height=0;return result;
        };
        for(let time=118000;time<=128000;time+=16){
          if(!passed&&time>=124990){tp.ctrl.event({type:'pass',building:25,t:124990});passed=true;}
          const phase=time%5000<1400?'grace':'eval';
          tp.upd(time,{phase,policeStage:0});
          const frame=tp.ctrl.snapshot().cameo,stats=tp.stats();
          if(frame?.id===56&&frame.phase==='delivery'){
            delivery.push({t:time,elapsed:frame.elapsedMs,sprites:stats.storySprites,busy:tp.inputs.at(-1).actorBusy.hero});
            if(!deliveryImage&&frame.elapsedMs>=900&&stats.storySprites>0)deliveryImage=tp.image();
          }
          if(frame?.id===56&&frame.phase==='static'){
            staticFrames.push({t:time,shown:stats.staticFlag});
            if(!staticCapture&&stats.staticFlag){
              const canvas=renderer.domElement;
              const captured=captureAtlasCell({scene:renderScene,camera:renderCamera,renderer,cellIndex:atlas.street.midFlag.index,columns:atlas.columns,rows:atlas.rows,viewport:{width:canvas.width,height:canvas.height},read:()=>({pixels:pixels(),comparison:tp.stage.checkComparisonSurfaces()})});
              const image=tp.image(),shownPixels=captured.shown.pixels,hiddenPixels=captured.hidden.pixels;
              const shown=captured.shown.comparison,hidden=captured.hidden.comparison;
              let count=0,l=Infinity,r=-Infinity,top=Infinity,bottom=-Infinity;
              for(let i=0;i<shownPixels.data.length;i+=4){
                if(Math.max(...[0,1,2].map(k=>Math.abs(shownPixels.data[i+k]-hiddenPixels.data[i+k])))<=24)continue;
                const x=(i/4)%shownPixels.width,y=Math.floor((i/4)/shownPixels.width);
                count++;l=Math.min(l,x);r=Math.max(r,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
              }
              staticCapture={t:time,image,count,bounds:{l,r,t:top,b:bottom},projected:captured.projected,width:shownPixels.width,height:shownPixels.height,shown,hidden};
            }
          }
          if((time-118000)%64===0)await Promise.all(tp.claims);
        }
        renderer.render=originalRender;
        return {delivery,staticFrames,deliveryImage,staticCapture};
      });
      assert.ok(trace.delivery.length>0,'a real persisted delivery must start');
      assert.ok(trace.delivery[0].t>=125600&&trace.delivery[0].t<126500,`delivery starts inside the reserved window after reaction: ${trace.delivery[0].t}`);
      assert.equal(trace.delivery[0].busy,false);
      assert.ok(trace.delivery.some(row=>row.sprites>0),'delivery must actually draw');
      const capture=trace.staticCapture;
      assert.ok(capture,'the real delivery must become a drawn static flag');
      assert.ok(capture.count>=10,`nonempty visible flag pixels: ${capture.count}`);
      assert.ok(capture.projected.l>=8&&capture.projected.t>=8&&capture.projected.r<=capture.width-8&&capture.projected.b<=capture.height-8,`actual flag instance projects wholly inside the canvas: ${JSON.stringify(capture.projected)}`);
      assert.ok(capture.bounds.l>=8&&capture.bounds.t>=8&&capture.bounds.r<capture.width-8&&capture.bounds.b<capture.height-8,`whole visible flag stays 8px inside canvas: ${JSON.stringify(capture.bounds)}`);
      assert.equal(capture.shown.wallMismatches,0);assert.equal(capture.shown.bodyMismatches,0);
      assert.ok((capture.hidden.wallPixels-capture.shown.wallPixels)/capture.hidden.wallPixels<=.015);
      await save(`${width}x${height}-real-midpoint-delivery`,trace.deliveryImage);
      await save(`${width}x${height}-real-midpoint-static`,capture.image);
      const facts={...trace,deliveryImage:undefined,staticCapture:{...capture,image:undefined}};
      if(SHOTS){await mkdir(SHOTS,{recursive:true});await writeFile(`${SHOTS}/${width}x${height}-real-midpoint.json`,JSON.stringify(facts,null,2));}
      t.diagnostic(`real midpoint: ${JSON.stringify({width,height,start:trace.delivery[0].t,deliveryFrames:trace.delivery.length,drawnFrames:trace.delivery.filter(row=>row.sprites>0).length,staticAt:capture.t,flagPixels:capture.count,bounds:capture.bounds})}`);
      assert.deepEqual(env.errors,[]);
    }finally{await env.close();}
  });
}
