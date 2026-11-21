// 同系色タイムアタックを実画面で確認する。iPhone Safari実機の代用ではない。
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,openHome} from './helpers.mjs';

test('TA entry, first 500ms hold, two-second travel, pause and return to normal home',async()=>{
 const env=await launch({width:402,height:700});
 try{
  const {page,url}=env;
  await openHome(page,url);
  assert.equal(await page.locator('[data-testid=home-time-attack]').count(),1);
  const buttons=await page.locator('.home-actions .btn').allTextContents();
  assert.ok(buttons.findIndex(x=>x.includes('はじめる'))<buttons.findIndex(x=>x.includes('同系色')));
  await page.click('[data-testid=home-time-attack]');
  await page.waitForFunction(()=>window.__kamereoru?.debugTimeAttack?.state.phase==='active',
    null,{timeout:15000});
  assert.equal(await page.locator('.ta-game').count(),1);
  const target=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.course.targets[0]);
  await page.evaluate(c=>window.__kamereoru.debugTimeAttack.input(c),target);
  try {
   await page.waitForFunction(()=>window.__kamereoru.debugTimeAttack.state.phase==='travel',null,{timeout:6000});
  }catch(error){
   const info=await page.evaluate(()=>({
     state:window.__kamereoru?.debugTimeAttack?.state??null,
     controlClass:document.querySelector('.controls')?.className,
     canvasCount:document.querySelectorAll('canvas').length,
     errorPanel:document.querySelector('.notices')?.textContent?.slice(0,150)
   }));
   console.error('TA first-building debug state',JSON.stringify(info),'browserErrors',env.errors);
   throw error;
  }
  const state=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state);
  assert.equal(state.clearedCount,1);
  assert.equal(state.elapsedMs>=500,true);
  assert.equal(await page.locator('.controls.disabled').count(),1);
  await page.waitForFunction(()=>window.__kamereoru.debugTimeAttack.state.building===2,null,{timeout:5500});
  const next=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state);
  assert.equal(next.building,2);
  assert.equal(next.moveCount,1);
  await page.locator('.ta-pause').click();
  await page.locator('.ta-overlay').waitFor({state:'visible'});
  const paused=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state.t);
  await page.waitForTimeout(400);
  const during=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state);
  assert.equal(during.t,paused,'pause should not change the timer');
  await page.locator('.ta-overlay .btn').first().click();
  await page.waitForFunction(()=>window.__kamereoru.debugTimeAttack.state.phase==='active');
  await page.locator('.ta-pause').click();
  await page.locator('.ta-overlay .btn').last().click();
  await page.waitForSelector('.ta-result-card');
  assert.equal(await page.getByText('未クリア',{exact:true}).count(),1);
  await page.locator('.ta-result > .btn').last().click();
  await page.waitForSelector('[data-testid=home-start]');
  assert.equal(await page.locator('.ta-game').count(),0);
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});
