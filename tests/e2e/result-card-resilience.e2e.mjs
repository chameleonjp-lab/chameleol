// ChatGPT follow-ups: real App/ports with only native capability, encoding and share boundaries controlled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openXShare } from './helpers.mjs';
import { id, BUDGET, openApp, playToResult, toReady, cardState, advanceUntil, heldBytes, liveWebgl } from './fixtures/result-card-helpers.mjs';

test('save dialog blocks background focus and scrolling, preserves native image interaction, and restores page state', async () => {
  const env=await launch();
  try {
    const {page}=env;await openApp(env);await playToResult(page);await toReady(page);
    await page.evaluate(()=>{
      const old=document.createElement('aside');old.id='existing-background';old.setAttribute('inert','already');old.setAttribute('aria-hidden','false');document.body.append(old);
      document.body.style.setProperty('overflow','auto','important');
      const save=document.querySelector('.result-card-save');
      scrollTo(0,Math.max(0,save.getBoundingClientRect().top+scrollY-100));
    });
    const before=await page.evaluate(()=>({y:scrollY,position:document.body.style.position}));
    await page.locator('.result-card-save').click();await page.waitForSelector('.result-card-viewer-image');
    const locked=await page.evaluate(()=>{
      document.querySelector('[data-testid="result-again"]').focus();
      const late=document.createElement('button');late.id='late-background';document.body.append(late);
      return {position:getComputedStyle(document.body).position,rootInert:document.querySelector('#test-root').inert,focusInside:!!document.activeElement.closest('.result-card-viewer'),overscroll:getComputedStyle(document.querySelector('.result-card-viewer')).overscrollBehaviorY,y:scrollY};
    });
    assert.equal(locked.position,'fixed');assert.equal(locked.rootInert,true);assert.equal(locked.focusInside,true);assert.equal(locked.overscroll,'contain');
    await page.waitForFunction(()=>document.querySelector('#late-background').inert);
    await page.mouse.move(200,300);await page.mouse.wheel(0,700);await page.clock.runFor(100);
    assert.equal(await page.evaluate(()=>scrollY),locked.y,'wheel input cannot scroll the page behind the image');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.result-card-viewer')),true);
    await page.locator(id('result-card-viewer-close')).click();
    const restored=await page.evaluate(()=>({y:scrollY,position:document.body.style.position,overflow:document.body.style.getPropertyValue('overflow'),priority:document.body.style.getPropertyPriority('overflow'),inert:document.querySelector('#test-root').inert,late:document.querySelector('#late-background').inert,old:document.querySelector('#existing-background').getAttribute('inert'),aria:document.querySelector('#existing-background').getAttribute('aria-hidden'),focus:document.activeElement.getAttribute('data-testid')}));
    assert.ok(Math.abs(restored.y-before.y)<=1,'closing restores the original scroll position');
    assert.deepEqual({...restored,y:0},{y:0,position:before.position,overflow:'auto',priority:'important',inert:false,late:false,old:'already',aria:'false',focus:'result-card-save'});
    const beforeAxes=await page.evaluate(()=>{
      document.body.style.removeProperty('overflow');
      document.body.style.setProperty('overflow-y','scroll','important');
      document.documentElement.style.setProperty('overflow-x','hidden','important');
      document.documentElement.style.setProperty('overflow-y','scroll');
      return [document.documentElement,document.body].map(node=>['overflow-x','overflow-y'].map(axis=>[node.style.getPropertyValue(axis),node.style.getPropertyPriority(axis)]));
    });
    await page.locator('.result-card-save').click();
    assert.deepEqual(await page.evaluate(()=>[document.documentElement,document.body].map(node=>['overflow-x','overflow-y'].map(axis=>getComputedStyle(node).getPropertyValue(axis)))),[['hidden','hidden'],['hidden','hidden']]);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(()=>[document.documentElement,document.body].map(node=>['overflow-x','overflow-y'].map(axis=>[node.style.getPropertyValue(axis),node.style.getPropertyPriority(axis)]))),beforeAxes,'axis-specific values and priorities survive closing');
    await page.locator('.result-card-save').click();
    const left=await page.evaluate(()=>{__kamereoru.showHome();return {position:document.body.style.position,inert:document.querySelector('#test-root').inert,viewer:!!document.querySelector('.result-card-viewer')};});
    assert.deepEqual(left,{position:before.position,inert:false,viewer:false});
    assert.deepEqual(env.errors,[]);
  } finally {await env.close();}
});

for(const mode of ['files','payload','missing','failure']) {
  test(`share recovery ${mode}: explicit save/text/retry remain usable without automatic fallbacks`,async()=>{
    const env=await launch();
    try {
      const {page}=env;await openApp(env);await playToResult(page);await toReady(page);
      await page.evaluate((mode)=>{
        globalThis.__fileBeforeFailure=__kamereoru.resultCardController.snapshot().prepared.file;
        if(mode==='files')globalThis.__canShareFiles=false;
        if(mode==='payload')globalThis.__canSharePayload=false;
        if(mode==='failure')globalThis.__shareMode='fail';
        if(mode==='missing'){globalThis.__savedShare=navigator.share;Object.defineProperty(navigator,'share',{value:undefined,configurable:true});}
      },mode);
      await page.locator(id('result-card-image-share')).click();
      const expected=mode==='failure'?'failed':'unavailable';
      assert.equal(await advanceUntil(page,async()=>await cardState(page)===expected),true);
      const failed=await page.evaluate(()=>({sameFile:__kamereoru.resultCardController.snapshot().prepared.file===__fileBeforeFailure,windows:__opened.length,shares:__shares.length}));
      assert.deepEqual(failed,{sameFile:true,windows:0,shares:mode==='failure'?1:0});
      await page.locator('.result-card-save').click();
      await page.waitForFunction(()=>document.querySelector('.result-card-viewer-image')?.complete);
      assert.equal(await page.evaluate(()=>document.querySelector('.result-card-viewer-image').naturalWidth),1200);
      await page.keyboard.press('Escape');
      await page.evaluate(()=>{
        globalThis.__canShareFiles=true;globalThis.__canSharePayload=true;globalThis.__shareMode='ok';
        if(globalThis.__savedShare)Object.defineProperty(navigator,'share',{value:__savedShare,configurable:true});
      });
      await page.locator(id('result-card-image-share')).click();await toReady(page);
      assert.equal(await page.evaluate(()=>__shares.length),mode==='failure'?2:1,'retry shares only on another explicit tap');
      assert.equal(await page.evaluate(()=>__opened.length),0);
      const intent=await openXShare(page, 'result-text-share');
      assert.equal(intent.searchParams.get('url'),'https://chameleonjp-lab.github.io/chameleol/');
      assert.deepEqual(env.errors,[]);
    } finally {await env.close();}
  });
}

test('failed PNG generation frees its buffer before notifying the open model, then an explicit retry recovers',async(t)=>{
  const env=await launch({scale:2});
  try {
    const {page}=env;await openApp(env);
    await page.evaluate(()=>{
      globalThis.__failureNotifications=[];
      const factory=__kamereoru.resultCardPorts;
      __kamereoru.resultCardPorts=(options)=>{
        const ports=factory(options),notify=ports.onChange;
        ports.onChange=(snapshot)=>{
          notify(snapshot);
          if(snapshot.state!=='failed')return;
          const bytes=c=>c?c.width*c.height*4:0,turn=document.querySelector('.result-turn-canvas');
          const generation=[...__encodingCanvases].reduce((sum,c)=>sum+bytes(c),0);
          __failureNotifications.push({generation,total:11_673_600+bytes(document.querySelector('.result-card-canvas'))+bytes(snapshot.portraitImage)+bytes(turn)+(turn?262_144:0)+generation});
        };
        return ports;
      };
    });
    await playToResult(page);await toReady(page);await page.locator('[data-panel="turn"]').click();await page.waitForSelector('.result-turn-canvas');
    await page.evaluate(()=>{globalThis.__encodeFailures=1;__kamereoru.resultCardController.retry();});
    assert.equal(await advanceUntil(page,async()=>await cardState(page)==='failed'),true);
    assert.equal(await page.evaluate(()=>__kamereoru.resultCardController.snapshot().prepared),null);
    assert.equal(await page.locator('.result-card-retry').isVisible(),true);
    const samples=await page.evaluate(()=>__failureNotifications);
    assert.equal(samples.length,1);assert.equal(samples[0].generation,0);assert.ok(samples[0].total<=BUDGET);
    t.diagnostic(`failure notification: ${JSON.stringify(samples)}`);
    await page.locator('.result-card-save').click();assert.equal(await page.locator('.result-card-viewer').count(),0);
    await page.locator('.result-card-retry').click();await toReady(page);
    assert.equal(await page.evaluate(()=>__shares.length+__opened.length),0);
    assert.ok(await page.evaluate(()=>__kamereoru.resultCardController.snapshot().prepared.file.size)>0);
    assert.deepEqual(env.errors,[]);
  } finally {await env.close();}
});

test('eight repeated save/model/regenerate/remount cycles release old URLs, controllers and rendering surfaces',async(t)=>{
  const env=await launch({scale:2});
  try {
    const {page}=env;await openApp(env);await playToResult(page);await toReady(page);
    await page.evaluate(()=>{__webgl.clear();globalThis.__retiredControllers=[];});
    for(let i=0;i<8;i++) {
      await page.locator('.result-card-save').click();await page.waitForFunction(()=>document.querySelector('.result-card-viewer-image')?.complete);
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>__createdUrls.filter(u=>!__revoked.includes(u)).length),0);
      await page.locator('[data-panel="turn"]').click();await page.waitForSelector('.result-turn-canvas');
      if(i%2===0) {
        await page.evaluate(()=>{globalThis.__previousResultSurfaces=[...__webgl];__retiredControllers.push(__kamereoru.resultCardController);__kamereoru.showResult();});
        await toReady(page);await page.waitForSelector('.result-turn-canvas');
        assert.equal(await page.evaluate(()=>__previousResultSurfaces.every(c=>c.width===0&&c.height===0)),true);
      }
      await page.locator('[data-panel="turn"]').click();
      assert.equal(await advanceUntil(page,async()=>await liveWebgl(page)===0),true);
      const regenerating=await page.evaluate((cycle)=>{
        __kamereoru.resultCardController.retry();
        const snapshot=__kamereoru.resultCardController.snapshot();
        return {cycle,state:snapshot.state,pendingEncodes:__pendingEncodes,portrait:[snapshot.portraitImage?.width,snapshot.portraitImage?.height]};
      },i+1);
      t.diagnostic(`native PNG regeneration: ${JSON.stringify(regenerating)}`);
      assert.equal(regenerating.state,'pending');assert.equal(regenerating.pendingEncodes,1,'a cached portrait starts one native PNG encode');
      // toBlob uses the browser's real task queue, not the paused presentation clock.
      await page.waitForFunction(()=>__pendingEncodes===0);
      await toReady(page);
      assert.ok((await heldBytes(page)).total<=BUDGET);
      assert.equal(await page.locator('.result-card').count(),1);
    }
    await page.locator(id('result-card-image-share')).click();await toReady(page);
    assert.equal(await page.evaluate(()=>__shares.length),1,'remounts do not accumulate share handlers');
    await page.evaluate(()=>{
      globalThis.__finalImage=__kamereoru.resultCardController.snapshot().portraitImage;
      globalThis.__previousResultSurfaces=[...__webgl];__retiredControllers.push(__kamereoru.resultCardController);
      __kamereoru.resultCardController.retry();__kamereoru.showHome();
    });
    assert.equal(await advanceUntil(page,async()=>page.evaluate(()=>__pendingEncodes===0)),true);
    const end=await page.evaluate(()=>({cycles:__createdUrls.length,liveUrls:__createdUrls.filter(u=>!__revoked.includes(u)).length,oldSurfaces:__previousResultSurfaces.filter(c=>c.width&&c.height).length,portrait:__finalImage.width*__finalImage.height,oldControllers:__retiredControllers.filter(c=>c.snapshot().state!=='unavailable'||c.snapshot().prepared!==null).length,locked:document.querySelector('#test-root').inert||document.body.style.position==='fixed',viewers:document.querySelectorAll('.result-card-viewer').length}));
    assert.deepEqual(end,{cycles:8,liveUrls:0,oldSurfaces:0,portrait:0,oldControllers:0,locked:false,viewers:0});
    t.diagnostic(`repeated result cleanup: ${JSON.stringify(end)}`);
    assert.deepEqual(env.errors,[]);
  } finally {await env.close();}
});
