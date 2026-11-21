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
  // Browser CPU/GPU timing is not a trustworthy metronome on a shared CI runner:
  // heavy 3D frames correctly trigger the game's >1000ms auto-pause.
  // Instead, exercise exactly the same controller with a verification-only clock.
  await page.evaluate(()=>window.__kamereoru.debugTimeAttack.useManualClock());
  const target=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.course.targets[0]);
  await page.evaluate(c=>window.__kamereoru.debugTimeAttack.setColor(c),target);
  await page.evaluate(()=>window.__kamereoru.debugTimeAttack.step(499));
  assert.equal((await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state)).phase,'active');
  await page.evaluate(()=>window.__kamereoru.debugTimeAttack.step(1));
  const passed=await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state);
  assert.equal(passed.phase,'travel');
  assert.equal(passed.clearedCount,1);
  assert.equal(passed.elapsedMs,500);
  await page.evaluate(()=>window.__kamereoru.debugTimeAttack.step(1999));
  assert.equal((await page.evaluate(()=>window.__kamereoru.debugTimeAttack.state)).phase,'travel');
  await page.evaluate(()=>window.__kamereoru.debugTimeAttack.step(1));
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
