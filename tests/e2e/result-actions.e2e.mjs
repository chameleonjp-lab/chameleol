import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,openHome} from './helpers.mjs';

test('result actions: image lands on replay control and real eye-glance tile restores after active 400ms',async()=>{
 const env=await launch();try{
 await openHome(env.page,env.url);
 const proof=await env.page.evaluate(async()=>{
  const {PORTRAIT_BOUNDS}=await import('/src/presentation/assets/result-atlas-bounds.js');
  const {mountResultPresentation}=await import('/src/presentation/result-view.js');
  const {buildResultData}=await import('/src/presentation/result-data.js');
  const {createPresentationScope}=await import('/src/presentation/scope.js');
  const scope=createPresentationScope({id:'actions-proof',kind:'result'});
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:100;background:#222;overflow:visible';document.body.replaceChildren(host);
  const data=buildResultData({summary:{buildings:0,maxCombo:0,perBuilding:[],score:{total:0},endReason:'quit'}});
  const view=mountResultPresentation({host,data,scope});
  const replay=document.createElement('button');replay.dataset.testid='result-again';replay.textContent='Replay';replay.style.cssText='position:absolute;left:25px;top:350px;width:200px;height:45px';host.append(replay);
  const portrait=view.sceneElement.querySelector('button'),original=portrait.style.backgroundPosition;
  portrait.click();const reaction=portrait.style.backgroundPosition;
  scope.tick(399);const during=portrait.style.backgroundPosition;scope.tick(400);const restored=portrait.style.backgroundPosition;
  view.replayAccepted();const animation=portrait.getAnimations().find(a=>a.animationName==='result-replay-jump');
  if(animation){animation.pause();animation.currentTime=150;}
  const landed=portrait.getBoundingClientRect(),target=replay.getBoundingClientRect();
  const bounds=PORTRAIT_BOUNDS[data.portraitId];
  const landing={x:landed.left+landed.width*((bounds.minX+bounds.maxX+1)/2/bounds.width),y:landed.top+landed.height*((bounds.maxY+1)/bounds.height),targetX:target.left+target.width/2,targetY:target.top};
  window.__resultActionCleanup=()=>{scope.tick(550);const cleaned=!view.sceneElement.classList.contains('is-replaying');view.dispose();scope.dispose();return cleaned};
  return {original,reaction,during,restored,landing,animation:!!animation};
 });
 assert.notEqual(proof.reaction,proof.original,'reaction must select an actual different bitmap region');assert.equal(proof.during,proof.reaction);assert.equal(proof.restored,proof.original);
 assert.equal(proof.animation,true);assert.ok(Math.abs(proof.landing.x-proof.landing.targetX)<1,JSON.stringify(proof.landing));assert.ok(Math.abs(proof.landing.y-proof.landing.targetY)<1,JSON.stringify(proof.landing));await env.page.screenshot({path:process.env.RESULT_ACTION_PROOF||'/tmp/chameleol-result-painted-feet.png'});assert.equal(await env.page.evaluate(()=>window.__resultActionCleanup()),true);
 }finally{await env.close()}
});
