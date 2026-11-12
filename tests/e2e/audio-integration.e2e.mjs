// Chromium integration evidence. Fixtures are labelled; this does not claim physical iPhone/audio listening verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch, openHome, startAnonymous } from './helpers.mjs';

const id = value => `[data-testid="${value}"]`;
async function photo(page, name) {
  if (!process.env.AUDIO_SCREENSHOTS) return;
  await mkdir(process.env.AUDIO_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: `${process.env.AUDIO_SCREENSHOTS}/${name}.png` });
}
async function fits(page, selectors, width, height, scroll = false) {
  for (const selector of selectors) {
    if (scroll) await page.locator(selector).scrollIntoViewIfNeeded();
    const r = await page.locator(selector).boundingBox();
    assert.ok(r && r.width > 0 && r.height > 0, `${selector} visible`);
    assert.ok(r.x >= -1 && r.y >= -1 && r.x+r.width <= width+1 && r.y+r.height <= height+1, `${selector} fits: ${JSON.stringify(r)}`);
  }
}
for (const [width,height] of [[402,874],[402,700],[874,402]]) {
  test(`audio integration: playable screens and four guides ${width}x${height}`, { timeout: 150000 }, async () => {
    const env = await launch({width,height}); const {page}=env; const prefix=`${width}x${height}`;
    try {
      await openHome(page,env.url); await photo(page,`${prefix}-home`);
      await fits(page,[id('home-start'),id('home-practice')],width,height,true);
      // Fixture: unlock brightness practice without replaying the first 20 buildings in every viewport.
      await page.evaluate(()=>{__kamereoru.flags.brightnessPractice=true;});
      for (const kind of ['basic','brightness']) {
        await page.click(id('home-practice')); await page.click(id(`practice-${kind}`));
        await page.waitForFunction(()=>!!__kamereoru.practice && !!__kamereoru.stage);
        await fits(page,['.palette','.bar',id('practice-exit'),id('practice-skip')],width,height);
        await photo(page,`${prefix}-practice-${kind}`);
        for(let n=0;n<3;n++) {
          await page.click(id('practice-skip')); await page.waitForSelector('.practice-review:not([hidden])');
          await page.click(id('practice-next'));
        }
        await page.waitForSelector('.practice-table');
        assert.equal(await page.locator('.practice-table tbody tr').count(),3);
        await photo(page,`${prefix}-practice-${kind}-result`);
        await page.getByRole('button',{name:'ホームへ',exact:true}).click();
      }
      await page.click(id('home-practice')); await page.click(id('practice-guides'));
      for(const step of [1,2,3,4]) {
        await page.click(id(`guide-practice-${step}`));
        await page.waitForFunction(step=>__kamereoru.guidePractice?.view().step===step,step);
        await fits(page,['.palette','.bar',id('guide-practice-pause')],width,height);
        assert.equal(await page.locator(`${id('guide-go')},${id('guide-skip')}`).count(),0);
        await page.click(id('guide-practice-pause'));
        assert.equal(await page.locator('.controls.disabled').count(),1);
        await page.click(id('guide-practice-pause'));
        await photo(page,`${prefix}-guide${step}`);
        if(step%2) {
          if(step===3) {const r=await page.locator('.bar-guide-target').boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);}
          const r=await page.locator('.palette-guide-target').boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
        }
        await page.waitForSelector(id('guide-practice-choose'),{state:'visible',timeout:10000});
        await fits(page,[id('guide-practice-choose'),id('guide-practice-back')],width,height);
        await page.click(id('guide-practice-choose'));
      }
      await page.getByRole('button',{name:'練習に戻る',exact:true}).click();
      await page.locator('.btn-back').click();
      await startAnonymous(page); await photo(page,`${prefix}-game`);
      await fits(page,['.palette','.bar',id('pause')],width,height);
      await page.click(id('pause'));await photo(page,`${prefix}-pause`);
      await fits(page,[id('pause-resume'),id('pause-home')],width,height);
      const before=await page.evaluate(()=>__kamereoru.session.state.t);
      await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__kamereoru.session.state.t),before);
      await page.click(id('pause-resume'));await page.waitForFunction(()=>__kamereoru.session.running);
      // Fixture: jump near the goal; actual resume, ending, result and home controls still run.
      await page.evaluate(()=>__kamereoru.debugStart({atMs:248600}));
      await page.click(id('pause-resume'));await page.waitForSelector(id('skip-ending'),{timeout:10000});
      await page.click(id('skip-ending'));await page.waitForSelector(id('result-score'));
      await photo(page,`${prefix}-result`);
      await fits(page,[id('result-score'),id('result-home')],width,height,true);
      await page.click(id('result-home'));await page.waitForSelector(id('home-start'));
      assert.deepEqual(env.errors,[]);
    } finally {await env.close();}
  });
}

test('audio integration: tap, same color, drag, two fingers, cancel, lock and zero-volume recovery', {timeout:45000}, async()=>{
  const env=await launch();const {page}=env;
  try {
    await openHome(page,env.url);await page.click(id('home-practice'));await page.click(id('practice-basic'));
    await page.waitForFunction(()=>!!__kamereoru.practice&&!!__kamereoru.stage);
    await page.evaluate(()=>{const a=__kamereoru;globalThis.__audioCalls=[];const play=a.audio.play.bind(a.audio);a.audio.play=(name,...rest)=>{__audioCalls.push(name);return play(name,...rest);};});
    const g=await page.evaluate(()=>__kamereoru.controls.router.geometry);
    const p={x:Math.round(g.palette.cx+g.palette.r*.6),y:Math.round(g.palette.cy)};
    const q={x:Math.round(g.palette.cx),y:Math.round(g.palette.cy+g.palette.r*.6)};
    const b={x:Math.round(g.bar.x+g.bar.w/2),y:Math.round(g.bar.y+g.bar.h*.5)};
    const take=()=>page.evaluate(()=>__audioCalls.splice(0));
    await page.mouse.click(p.x,p.y);let calls=await take();
    assert.ok(calls.includes('touchPalette'));assert.ok(!calls.includes('colorStep'));
    await page.mouse.click(p.x,p.y);calls=await take();assert.deepEqual(calls,['touchPalette']);
    await page.mouse.click(b.x,b.y);calls=await take();assert.deepEqual(calls,['locked']);
    assert.equal(await page.evaluate(()=>__kamereoru.controls.values.v),10000);
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:5});await page.mouse.up();calls=await take();
    assert.ok(calls.includes('colorStep'));assert.ok(calls.includes('colorRelease'));
    const cdp=await page.context().newCDPSession(page);
    const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    await send('touchStart',[{...p,id:1}]);await send('touchMove',[{...q,id:1}]);await take();
    await send('touchCancel',[]);assert.ok(!(await take()).includes('colorRelease'));
    // Brightness practice is a fixture-unlocked real screen; both pointers travel through DOM routing.
    await page.evaluate(async()=>{__kamereoru.flags.brightnessPractice=true;await __kamereoru.startPractice('brightness');});
    await take();const geo=await page.evaluate(()=>__kamereoru.controls.router.geometry);
    const tp={x:Math.round(geo.palette.cx+geo.palette.r*.5),y:Math.round(geo.palette.cy),id:1};
    const tb={x:Math.round(geo.bar.x+geo.bar.w/2),y:Math.round(geo.bar.y+geo.bar.h*.5),id:2};
    await send('touchStart',[tp]);await send('touchStart',[tp,tb]);
    assert.ok(Math.abs(await page.evaluate(()=>__kamereoru.controls.values.v)-5000)<100);
    await send('touchMove',[{...tp,x:Math.round(geo.palette.cx),y:Math.round(geo.palette.cy+geo.palette.r*.5)}, {...tb,y:Math.round(geo.bar.y+geo.bar.h*.25)}]);
    assert.ok(Math.abs(await page.evaluate(()=>__kamereoru.controls.values.v)-7500)<100);
    await send('touchEnd',[]);calls=await take();assert.ok(calls.includes('touchPalette'));assert.ok(calls.includes('touchBar'));assert.ok(calls.includes('colorRelease'));
    const audio=await page.evaluate(()=>{const a=__kamereoru.audio;a.setSettings({music:0,sfx:0,ambient:0});const silent=a.play('touchPalette');a.setSettings({music:.45,sfx:.7,ambient:.35});return{silent,restored:a.play('touchPalette')};});
    assert.deepEqual(audio,{silent:false,restored:true});assert.deepEqual(env.errors,[]);
  } finally {await env.close();}
});

test('audio integration: delayed audio/render and rejected audio cannot resurrect abandoned practice', {timeout:45000},async()=>{
  const env=await launch();const {page}=env;
  try {
    await openHome(page,env.url);
    await page.evaluate(()=>{const a=__kamereoru;globalThis.__prepareOriginal=a.audio.prepare;globalThis.__gates=[];a.audio.prepare=()=>new Promise(resolve=>__gates.push(resolve));globalThis.__first=a.startPractice('basic');globalThis.__second=a.startGuidePractice(2);});
    await page.evaluate(async()=>{__gates[0](true);await __first;});
    assert.equal(await page.locator(id('home-start')).count(),1);
    await page.evaluate(async()=>{__gates[1](true);await __second;__kamereoru.audio.prepare=__prepareOriginal;});
    assert.equal(await page.evaluate(()=>__kamereoru.guidePractice?.view().step),2);
    assert.equal(await page.locator('.practice').count(),0);
    await page.evaluate(()=>__kamereoru.showHome());
    for(const guide of [false,true]) {
      await page.evaluate(guide=>{const a=__kamereoru;globalThis.__oldPrepare=a.audio.prepare;a.audio.prepare=()=>new Promise(resolve=>{globalThis.__releaseAudio=resolve;});globalThis.__pending=guide?a.startGuidePractice(1):a.startPractice('basic');},guide);
      await page.evaluate(()=>__kamereoru.showHome());await page.evaluate(async()=>{__releaseAudio(true);await __pending;__kamereoru.audio.prepare=__oldPrepare;});
      assert.equal(await page.locator(id('home-start')).count(),1);assert.equal(await page.locator('.stage-canvas').count(),0);
      await page.evaluate(guide=>{const a=__kamereoru;globalThis.__oldFactory=a.stageFactory;a.stageFactory=async(...args)=>{const stage=await __oldFactory(...args);await new Promise(resolve=>{globalThis.__releaseStage=resolve;});return stage;};globalThis.__pending=guide?a.startGuidePractice(1):a.startPractice('basic');},guide);
      await page.waitForFunction(()=>typeof __releaseStage==='function');await page.evaluate(()=>__kamereoru.showHome());
      await page.evaluate(async()=>{__releaseStage();await __pending;delete globalThis.__releaseStage;__kamereoru.stageFactory=__oldFactory;});
      assert.equal(await page.locator(id('home-start')).count(),1);assert.equal(await page.locator('.stage-canvas').count(),0);
      await page.evaluate(async guide=>{const a=__kamereoru;const original=a.audio.prepare;a.audio.prepare=()=>Promise.reject(new Error('test unavailable audio'));try{await(guide?a.startGuidePractice(1):a.startPractice('basic'));}finally{a.audio.prepare=original;}},guide);
      assert.equal(await page.locator(guide?'.guide-practice':'.practice').count(),1);assert.equal(await page.locator('.stage-canvas').count(),1);
      await page.evaluate(()=>__kamereoru.showHome());
    }
    assert.deepEqual(env.errors,[]);
  } finally {await env.close();}
});
