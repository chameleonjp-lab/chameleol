// Run with: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node docs/acceptance/audio-integration/release-smoke.mjs /absolute/dist
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { launch, openHome } from '../../../tests/e2e/helpers.mjs';
const root=resolve(process.argv[2]);
const env=await launch({root});const {page}=env;
try {
  const requests=[];page.on('request',r=>requests.push(r.url()));
  await openHome(page,env.url);
  const release=await (await page.request.get(`${env.url}release.json`)).json();
  const observed=await page.evaluate(()=>({runtime:__kamereoru.runtime,commit:document.querySelector('meta[name="kamereoru-commit"]').content,asset:document.querySelector('meta[name="kamereoru-asset-version"]').content}));
  assert.equal(observed.runtime.env,'production');assert.equal(observed.runtime.apiBase,null);assert.equal(observed.runtime.isVerification,false);
  assert.equal(observed.asset,release.assetVersion);assert.equal(observed.runtime.assetVersion,release.assetVersion);
  assert.equal(await page.locator('[data-testid=home-ranking]').count(),0);
  await page.screenshot({path:'docs/acceptance/audio-integration/release-home.png',animations:'disabled'});
  await page.click('[data-testid=home-settings]');await page.waitForSelector('.settings');
  await page.screenshot({path:'docs/acceptance/audio-integration/release-settings.png',animations:'disabled'});
  await page.locator('.btn-back').click();await page.click('[data-testid=home-practice]');await page.click('[data-testid=practice-basic]');
  await page.waitForFunction(()=>!!__kamereoru.practice&&!!__kamereoru.stage);
  await page.screenshot({path:'docs/acceptance/audio-integration/release-practice.png',animations:'disabled'});
  assert.deepEqual(env.errors,[]);
  const external=requests.filter(url=>!url.startsWith(env.url)&&!url.startsWith('data:')&&!url.startsWith('blob:'));
  assert.deepEqual(external,[]);
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),root,release,observed,rankingHidden:true,practiceStarted:true,externalRequests:external,browserErrors:env.errors,physicalIPhone:false,listenedToAudio:false},null,2));
} finally {await env.close();}
