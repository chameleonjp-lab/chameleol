// Actual App loop from index.html. No stage/controller replacement or forced extra snapshots.
// Browser-native sharing is instrumented; physical iPhone/X attachment remains a separate check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launch,openHome,openXShare} from './helpers.mjs';
import {INSTRUMENT,id,toReady,heldBytes,BUDGET} from './fixtures/result-card-helpers.mjs';

async function runTo(page,target){
 for(let i=0;i<100;i++){
  const t=await page.evaluate(()=>__kamereoru.session?.state.t??Infinity);
  if(t>=target)return;
  await page.clock.runFor(Math.min(500,target-t+16));
 }
 throw new Error(`actual loop did not reach ${target}`);
}
async function colorFor(page,building,{slight=false}={}){
 await page.evaluate(({building,slight})=>{
  const s=__kamereoru.session,target=s.game.course.targets[building-1];let color={...target};
  if(slight){
   color=null;
   for(let delta=50;delta<18000;delta+=50){
    const c={...target,h:(target.h+delta)%36000},m=s.game.matchFn(c,target);
    if(m>=75000000&&m<=80000000){color=c;break;}
   }
   if(!color)throw new Error('no actual slight-match input found');
  }
  if(!s.input(color,performance.now()))throw new Error('normal loop input was not accepted');
 },{building,slight});
}

test('normal loop: tongue, claimed street and police lead to a prepared result image, cancelled share, explicit save/text and replay', {timeout:120000},async(t)=>{
 const env=await launch({width:402,height:700});const {page}=env;let proof;
 try{
  await env.context.addInitScript(INSTRUMENT);await openHome(page,env.url);
  // Fanboy's Social Blocking List hides links to the X composer.
  await page.addStyleTag({content:'a[href^="https://x.com/intent/tweet?"] { display: none !important; }'});
  assert.equal(await page.getByTestId('home-share').isVisible(),true,'home sharing is visible with the link filter');
  const homeIntent=await openXShare(page,'home-share');
  assert.equal(homeIntent.origin+homeIntent.pathname,'https://x.com/intent/tweet');
  await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
  await page.evaluate(async()=>{
   const a=__kamereoru;a.flags.alertGuideSeen=true;
   a.runtime={...a.runtime,publicUrl:'https://example.invalid/normal'};
   await a.debugStart({atMs:0,seed:17});
   const log={updates:0,steps:0,tongue:false,street:false,police:false,policeExtra:false,drawables:[],frames:[]};
   const step=a.gameExtrasController.step.bind(a.gameExtrasController);
   a.gameExtrasController.step=input=>{log.steps++;log.drawables.push(input.drawable);if(log.drawables.length>4)log.drawables.shift();return step(input);};
   const update=a.stage.update.bind(a.stage);
   a.stage.update=args=>{
    log.updates++;const out=update(args),s=a.stage.presentationStats();
    log.tongue ||= s.tongue?.visible===true&&s.tongue?.diamondVisible===true;
    log.street ||= s.backgroundGroups===1&&s.backgroundBirds>0;
    log.police ||= args.policeStage===1;
    log.policeExtra ||= s.policeExtra?.id===34;
    if(s.tongue?.visible||s.policeExtra||s.backgroundGroups)log.frames.push({t:args.presentation.t,tongue:s.tongue?.visible??false,police:s.policeExtra?.id??null,street:s.backgroundBirds});
    return out;
   };
   globalThis.__normalLoop=log;
  });
  await page.locator(id('pause-resume')).dispatchEvent('click');await page.clock.runFor(3100);
  await colorFor(page,1);
  await runTo(page,2100);
  assert.equal(await page.locator('.bonus-card').count(),0,'high precision leaves the running screen clear of score popups');
  await runTo(page,5050);await colorFor(page,2,{slight:true});
  await runTo(page,10050);await colorFor(page,3);
  await runTo(page,15050);await colorFor(page,4);
  await runTo(page,20050);await colorFor(page,5);
  await runTo(page,20600);
  const trace=await page.evaluate(()=>structuredClone(__normalLoop));
  assert.equal(trace.steps,trace.updates,'the actual stage is the sole step caller');
  for(const key of ['tongue','street','police','policeExtra'])assert.equal(trace[key],true,`${key} appeared in the actual normal loop: ${JSON.stringify(trace.frames)}`);

  // Keep game time and the current pose while paused/hidden, then resume the same run.
  await page.locator(id('pause')).dispatchEvent('click');
  const paused=await page.evaluate(()=>({t:__kamereoru.session.state.t,tongue:__kamereoru.gameExtrasController.snapshot().travelTongue}));
  await page.clock.runFor(500);
  assert.equal(await page.evaluate(()=>__kamereoru.session.state.t),paused.t);
  assert.deepEqual(await page.evaluate(()=>__kamereoru.gameExtrasController.snapshot().travelTongue),paused.tongue);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(500);assert.equal(await page.evaluate(()=>__kamereoru.session.state.t),paused.t);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator(id('pause-resume')).dispatchEvent('click');await page.clock.runFor(3100);
  assert.equal(await page.evaluate(()=>__kamereoru.session.running),true);
  await page.evaluate(()=>__kamereoru.stage.renderer.domElement.dispatchEvent(new Event('webglcontextlost')));
  assert.equal(await page.evaluate(()=>__kamereoru.stage.presentationStats().tongue.visible),false);
  await page.clock.runFor(32);assert.equal(await page.evaluate(()=>__normalLoop.drawables.at(-1)),false);
  await page.evaluate(()=>__kamereoru.stage.renderer.domElement.dispatchEvent(new Event('webglcontextrestored')));
  await page.clock.runFor(32);assert.equal(await page.evaluate(()=>__normalLoop.drawables.at(-1)),true);

  // Finish via the same session's normal quit event, so finishPlay captures its real history.
  const original=await page.evaluate(()=>{
   const a=__kamereoru,s=a.session;globalThis.__retiredNormalStage=a.stage;
   const p={playId:s.meta.playId,summary:null,history:structuredClone(s.recorder.entries)};
   s.quit(performance.now());p.summary=s.summary();return p;
  });
  await page.waitForSelector(id('skip-ending'));await page.locator(id('skip-ending')).dispatchEvent('click');await page.waitForSelector(id('result-again'));
  await toReady(page);
  assert.equal(await page.locator('.result-card').count(),1,'normal start supplied the real result ports');
  assert.equal(await page.locator('.evidence-chip').count(),7);
  assert.equal(await page.locator('canvas.stage-canvas').count(),0);
  assert.deepEqual(await page.evaluate(()=>__kamereoru.lastResult.summary),original.summary);
  assert.equal(await page.evaluate(()=>__kamereoru.lastResult.evidence.status),'ready');
  await page.evaluate(()=>{__shareMode='cancel';});await page.locator(id('result-card-image-share')).click();
  await page.waitForFunction(()=>__shares.length===1&&__kamereoru.resultCardController.snapshot().state==='ready');
  const cancel=await page.evaluate(()=>({shares:__shares,opened:__opened.length,viewer:!!document.querySelector('.result-card-viewer'),manual:!!document.querySelector('.share-manual')}));
  assert.equal(cancel.shares[0].files.length,1);assert.equal(cancel.shares[0].files[0].type,'image/png');assert.equal(cancel.shares[0].url,'https://chameleonjp-lab.github.io/chameleol/');
  assert.equal(cancel.opened,0);assert.equal(cancel.viewer,false);assert.equal(cancel.manual,false);
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator(id('result-card-save')).click()]);
  assert.equal(download.suggestedFilename(),'chameleol-result.png');
  assert.equal(await page.locator('.result-card-viewer').count(),0,'saving skips the in-game preview');
  assert.ok((await heldBytes(page)).total<=BUDGET);
  await page.locator('.result-card-canvas').click();
  await page.waitForFunction(()=>document.querySelector('.result-card-viewer-image')?.naturalWidth===1200);
  await page.locator(id('result-card-viewer-close')).click();
  assert.equal(await page.getByTestId('result-share').isVisible(),true,'result sharing is visible with the link filter');
  const intent=await openXShare(page, 'result-share');
  assert.equal(intent.origin + intent.pathname, 'https://x.com/intent/tweet');
  await page.evaluate(()=>{globalThis.__retiredNormalResult=__kamereoru.lastResult;});
  await page.locator(id('result-again')).dispatchEvent('click');
  await page.waitForFunction(pid=>__kamereoru.session?.meta.playId&&__kamereoru.session.meta.playId!==pid&&__kamereoru.stage&&__kamereoru.stage!==__retiredNormalStage,original.playId);
  proof=await page.evaluate(()=>({trace:__normalLoop,oldEvidence:__retiredNormalResult.evidence,oldOwner:__retiredNormalResult.resultRendererOwner,oldCard:__retiredNormalResult.resultCardController,oldStage:__retiredNormalStage.presentationStats().tongue.visible,mode:__kamereoru.stage.presentationStats().mode}));
  assert.equal(proof.oldEvidence,null);assert.equal(proof.oldOwner,null);assert.equal(proof.oldCard,null);assert.equal(proof.oldStage,false);assert.equal(proof.mode,'extended96');
  assert.deepEqual(env.errors,[]);t.diagnostic(JSON.stringify({events:trace,share:cancel.shares[0],released:true}));
 }finally{
  if(process.env.CL03_SCREENSHOTS){await mkdir(process.env.CL03_SCREENSHOTS,{recursive:true});await writeFile(`${process.env.CL03_SCREENSHOTS}/normal-app-loop.json`,JSON.stringify(proof??{incomplete:true},null,2));}
  await env.close();
 }
});


for(const variant of ['effects-off','simple-dom'])test(`normal loop ${variant}: evaluation runs without decorative scoring popups`,async()=>{
 const env=await launch();const {page}=env;
 try{
  await openHome(page,env.url);
  await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
  await page.evaluate(async variant=>{
   const a=__kamereoru;
   if(variant==='simple-dom'){
    const {createStage}=await import('/src/scene/stage.js');
    a.stageFactory=(host,options)=>createStage(host,{...options,forceDom:true});
   }
   await a.debugStart({atMs:0,seed:17,effects:variant!=='effects-off'});
   const probe={updates:0,steps:0,drawable:[]};
   const step=a.gameExtrasController.step.bind(a.gameExtrasController),update=a.stage.update.bind(a.stage);
   a.gameExtrasController.step=input=>{probe.steps++;probe.drawable.push(input.drawable);return step(input);};
   a.stage.update=args=>{probe.updates++;return update(args);};globalThis.__normalFallback=probe;
  },variant);
  await page.locator(id('pause-resume')).dispatchEvent('click');await page.clock.runFor(3100);await colorFor(page,1);await runTo(page,2100);
  const facts=await page.evaluate(()=>({probe:__normalFallback,kind:__kamereoru.stage.kind,mode:__kamereoru.stage.presentationStats().mode,claimed:__kamereoru.gameExtrasController.snapshot().precisionBadge,match:__kamereoru.session.state.matchUnits}));
  assert.equal(facts.mode,'extended96');assert.equal(facts.probe.steps,facts.probe.updates);assert.ok(facts.match>=98000000);
  assert.equal(facts.claimed,null);assert.ok(facts.probe.drawable.every(v=>v===false));
  assert.equal(await page.locator('.bonus-card').count(),0);if(variant==='simple-dom')assert.equal(facts.kind,'dom');
  await page.evaluate(()=>__kamereoru.leaveGame());assert.equal(await page.locator('.bonus-card').count(),0);assert.equal(await page.locator('.stage-canvas').count(),0);
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});
