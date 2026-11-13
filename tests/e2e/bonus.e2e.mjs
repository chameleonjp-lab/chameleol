// Chromium touch/viewport checks. Physical iPhone/Safari acceptance is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch, openHome } from './helpers.mjs';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages.js';
import { MESSAGES } from '../../src/i18n/messages/index.js';
const id=name=>`[data-testid="${name}"]`;
async function clock(page){await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));}
async function capture(page,name){if(!process.env.BONUS_SCREENSHOTS)return;await mkdir(process.env.BONUS_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.BONUS_SCREENSHOTS}/${name}.png`,fullPage:true,animations:'disabled'});}

for(const [width,height] of [[402,700],[402,874],[874,402]])test(`bonus: all awards and results in 15 locales at ${width}x${height}`,async(t)=>{
 const env=await launch({width,height});const {page}=env;
 try{
  await openHome(page,env.url);await clock(page);await page.evaluate(()=>__kamereoru.debugStart({atMs:50000,seed:17}));
  const failures=await page.evaluate(async languages=>{
   const {mountBonusPresentation}=await import('/src/presentation/bonus-view.js');const {buildBonusBatch}=await import('/src/presentation/bonus-data.js');const {createPresentationScope}=await import('/src/presentation/scope.js');const {t}=await import('/src/i18n/i18n.js');
   __kamereoru.bonusPresentation.dispose();document.querySelector('.pause-overlay')?.remove();__kamereoru.coverEl.hidden=true;
   const errors=[],host=document.querySelector('.stage-wrap');
   const award=(kind,points,tier=null)=>({id:`kamereoru-rules-v4:10:${kind}`,building:10,kind,tier,points,earnedAtT:50000});
   const variants=[[award('precision',5,5)],[award('precision',10,10)],[award('steady',5)],[award('quick',5)],[award('milestone',20)],[award('precision',10,10),award('steady',5),award('quick',5),award('milestone',20)]];
   for(const lang of languages){document.documentElement.lang=lang;
    for(let v=0;v<variants.length;v++){
     const scope=createPresentationScope({id:`${lang}-${v}`,kind:'game'});const view=mountBonusPresentation({host,scope,t:(k,p)=>t(k,p,lang)});
     const awards=variants[v],points=awards.reduce((n,a)=>n+a.points,0);const batch=buildBonusBatch({playId:`${lang}-${v}`,summary:{rulesVersion:'kamereoru-rules-v4'},passEvent:{building:10,t:50000,basePoints:118,bonusPoints:points,points:118+points,bonusAwards:awards}});
     if(awards.length===4)batch.notices=[t('game.comboMilestone',{n:10},lang)];
     view.show(batch,50200);view.tick({activeMs:50200,phase:'grace',running:true});
     const card=view.element,r=card.getBoundingClientRect(),label=`${lang}/${v}`;
     if(card.hidden||r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)errors.push({label,reason:'card viewport',rect:r.toJSON()});
     if(card.querySelectorAll('.bonus-award').length!==awards.length||!card.textContent.includes(`+${points}`))errors.push({label,reason:'missing award/points'});
     for(const text of card.querySelectorAll('.bonus-name,.bonus-points,.bonus-card-detail,.bonus-card-title,.bonus-card-notices')){
      const style=getComputedStyle(text),b=text.getBoundingClientRect();
      if(parseFloat(style.fontSize)<14||text.scrollWidth>text.clientWidth+1||style.textOverflow==='ellipsis'||b.right>innerWidth+1)errors.push({label,reason:'text clipping/font',text:text.textContent,font:style.fontSize,width:[text.scrollWidth,text.clientWidth]});
     }
     for(const selector of ['.palette','.bar','.hud']){const el=document.querySelector(selector);if(!el)continue;const b=el.getBoundingClientRect();if(r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top)errors.push({label,reason:`overlap ${selector}`,card:r.toJSON(),protected:b.toJSON()});}
     if(card.style.pointerEvents==='auto'||getComputedStyle(card).pointerEvents!=='none')errors.push({label,reason:'blocks controls'});
     scope.dispose();if(view.show(batch,50200)!==false)errors.push({label,reason:'disposed accepted'});
    }
   }
   return errors;
  },SUPPORTED_LANGUAGES.map(l=>l.id));
  assert.deepEqual(failures,[]);
  await page.evaluate(()=>__kamereoru.debugPresentation({effectId:78}));
  for(const lang of SUPPORTED_LANGUAGES){
   await page.evaluate(id=>__kamereoru.changeLanguage(id),lang.id);
   await page.evaluate(()=>__kamereoru.resultPresentation.finishNow());
   assert.equal(await page.locator('.result-bonus-row').count(),5,lang.id);
   assert.match(await page.locator('.result-bonus-total').textContent(),/1200/);
   assert.equal((await page.locator('.result-bonus-quick .result-bonus-name').textContent()).trim(),MESSAGES[lang.id]['bonus.quick']);
   const invalid=await page.evaluate(()=>[...document.querySelectorAll('.result-bonus-name,.result-bonus-count,.result-bonus-help,.result-bonus-tiers')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.right>innerWidth+1||r.left<0||el.scrollWidth>el.clientWidth+1||parseFloat(s.fontSize)<14||s.textOverflow==='ellipsis';}).map(el=>el.textContent));
   assert.deepEqual(invalid,[],`${lang.id} result overflow/font`);
  }
  await capture(page,`${width}x${height}-bonus-result-th`);
  t.diagnostic(`${15*6} card states and15 result layouts validated`);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

test('bonus: active-time deadline, hidden pause, guide/warning and reduced motion preserve text',async()=>{
 const env=await launch();const {page}=env;try{
  await openHome(page,env.url);await clock(page);await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>__kamereoru.debugStart({atMs:49999,seed:17}));
  await page.evaluate(()=>{document.querySelector('.pause-overlay')?.remove();__kamereoru.coverEl.hidden=true;__kamereoru.session.apply({type:'tick',t:50000});});await page.clock.runFor(16);
  const result=await page.evaluate(()=>{
   const view=__kamereoru.bonusPresentation,card=view.element;const initial=card.textContent;
   view.tick({activeMs:50500,phase:'grace',guideActive:true,running:false});const guide=card.classList.contains('is-quiet');
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));
   const hiddenText=card.textContent;view.tick({activeMs:50500,phase:'grace',warningActive:true,running:false});const warning=card.classList.contains('is-quiet');
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));
   view.tick({activeMs:51399,phase:'grace',running:true});const before=!card.hidden;view.tick({activeMs:51400,phase:'grace',running:true});const after=card.hidden;
   return {guide,warning,before,after,sameText:initial===hiddenText,reduced:card.classList.contains('is-reduced'),animation:getComputedStyle(card).animationName,transform:getComputedStyle(card).transform,points:initial.includes('+40')};
  });
  assert.deepEqual(result,{guide:true,warning:true,before:true,after:true,sameText:true,reduced:true,animation:'none',transform:'none',points:true});assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

for(const fail of [false,true])test(`bonus: final save ${fail?'failure':'delay'}, immediate ending skip and language redisplay retain7280`,async()=>{
 const env=await launch();const {page}=env;try{
  await openHome(page,env.url);await clock(page);await page.evaluate(()=>__kamereoru.debugStart({atMs:249999,seed:17}));
  await page.evaluate(async fail=>{
   const a=__kamereoru,{TAB_ID}=await import('/src/storage/store.js');a.generation=await a.store.beginRun(TAB_ID,a.session.snapshot());a.memoryOnly=false;
   const end=a.store.endRun.bind(a.store),play=a.audio.play.bind(a.audio);globalThis.__bonusFinal={sounds:[],pending:false};a.audio.play=(name,...args)=>{__bonusFinal.sounds.push(name);return play(name,...args);};
   let release;const gate=new Promise(resolve=>release=resolve);__bonusFinal.release=release;
   a.store.endRun=async(...args)=>{__bonusFinal.pending=true;await gate;if(fail)throw new Error('quota fixture');return end(...args);};
   a.session.apply({type:'tick',t:250000});
  },fail);
  await page.waitForFunction(()=>__bonusFinal.pending);
  assert.equal(await page.locator(id('skip-ending')).count(),0,'ending waits for final save attempt');
  assert.equal(await page.evaluate(()=>__kamereoru.session.summary().score.total),7280);
  await page.evaluate(()=>__bonusFinal.release());await page.waitForSelector(id('skip-ending'));
  assert.match(await page.locator('.ending-total').textContent(),/460/);assert.match(await page.locator('.ending-medal').textContent(),/100/);
  await page.locator(id('skip-ending')).dispatchEvent('click');await page.waitForSelector(id('result-again'));
  await page.evaluate(()=>__kamereoru.resultPresentation.finishNow());
  assert.equal(await page.locator(id('result-score')).textContent(),'7280');assert.equal(await page.locator('.result-bonus-row').count(),5);
  assert.equal(await page.locator('.result-save-warning').count(),fail?1:0);
  const record=await page.evaluate(async()=>({saved:__kamereoru.lastResult.saved,records:await __kamereoru.store.getAll('localResults'),summary:__kamereoru.lastResult.summary,sounds:__bonusFinal.sounds}));
  assert.equal(record.saved,!fail);assert.equal(record.records.length,fail?0:1);assert.equal(record.summary.bonus.awards.length,156);
  assert.equal(record.sounds.filter(s=>s==='bonusAllSuccess').length,1);assert.equal(record.sounds.filter(s=>s==='clear'||s==='bonusMulti').length,0);
  const before=record.sounds.length;await page.evaluate(()=>__kamereoru.changeLanguage('en'));assert.equal(await page.evaluate(()=>__bonusFinal.sounds.length),before);assert.equal(await page.evaluate(()=>__kamereoru.lastResult.summary.score.total),7280);
  if(!fail)assert.deepEqual(record.records[0].summary,record.summary);
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

test('bonus: warning determined after pass suppresses reward; mute and zero volume keep card',async()=>{
 const env=await launch();const {page}=env;try{
  await openHome(page,env.url);await clock(page);
  for(const mode of ['warning','muted','zero']){
   await page.evaluate(()=>__kamereoru.debugStart({atMs:9999,seed:17}));
   await page.evaluate(mode=>{
    const a=__kamereoru;document.querySelector('.pause-overlay')?.remove();a.coverEl.hidden=true;
    globalThis.__bonusSounds=[];const play=a.audio.play.bind(a.audio);a.audio.play=(name,...args)=>{__bonusSounds.push(name);return play(name,...args);};
    a.audio.setSettings({muted:mode==='muted',sfx:mode==='zero'?0:0.7});
    a.session.apply({type:'tick',t:10000});if(mode==='warning')a.session.state.alert=a.session.rules.alert.maxUnits*.75;
   },mode);await page.clock.runFor(16);
   assert.equal(await page.locator('.bonus-card:visible').count(),1,mode);assert.match(await page.locator('.bonus-card').textContent(),/20/);
   if(mode==='warning'){
    const sounds=await page.evaluate(()=>__bonusSounds);assert.ok(sounds.includes('whistle'));assert.equal(sounds.some(s=>s==='bonusMulti'||s==='passBuilding'||s==='combo'),false);assert.equal(await page.locator('.bonus-card.is-quiet').count(),1);
    const collisions=await page.evaluate(()=>{const r=document.querySelector('.bonus-card').getBoundingClientRect();return [...document.querySelectorAll('.banner-host .toast,.guidance-panel')].filter(el=>{const b=el.getBoundingClientRect();return !el.hidden&&b.width&&b.height&&r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;}).map(el=>el.textContent);});
    assert.deepEqual(collisions,[],'warning or guide message must remain clear of the quiet card');
   }
  }
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

test('bonus: twenty round replacements dispose cards, listeners and callbacks without scene growth',async(t)=>{
 const env=await launch();const {page}=env;try{
  await openHome(page,env.url);await clock(page);const counts=[];
  for(let round=0;round<20;round++){
   const result=await page.evaluate(async()=>{
    const a=__kamereoru,old=a.session?{session:a.session,scope:a.presentationScope,view:a.bonusPresentation,frameProbe:globalThis.__bonusRoundFrames}:null;let stale=0;old?.scope.schedule('bonus-stale',1000000,()=>stale++);
    await a.debugStart({atMs:9999,seed:17});old?.scope.tick(1000001);
    const oldFrames=old?.frameProbe?.calls??0;globalThis.__bonusRoundFrames={calls:0,old:old?.frameProbe,oldFrames};
    const probe=globalThis.__bonusRoundFrames,update=a.stage.update.bind(a.stage);a.stage.update=(...args)=>{probe.calls++;return update(...args);};
    a.session.apply({type:'tick',t:10000});
    return {oldListeners:old?.session.listeners.size??0,stale,oldCards:old?.view?.stats().cards??0,cards:document.querySelectorAll('.bonus-card').length,objects:a.stage.stats().objects};
   });
   assert.equal(result.oldListeners,0);assert.equal(result.stale,0);assert.equal(result.oldCards,0);assert.equal(result.cards,1);counts.push(result.objects);
   await page.clock.runFor(16);
   const frames=await page.evaluate(()=>({current:__bonusRoundFrames.calls,stale:(__bonusRoundFrames.old?.calls??0)-__bonusRoundFrames.oldFrames,visible:__kamereoru.bonusPresentation.stats().visible}));
   assert.ok(frames.current>=1&&frames.current<=2,`one active frame loop: ${JSON.stringify(frames)}`);assert.equal(frames.stale,0);assert.equal(frames.visible,true);
  }
  assert.equal(new Set(counts.slice(1)).size,1,JSON.stringify(counts));await page.evaluate(()=>__kamereoru.leaveGame());assert.equal(await page.locator('.bonus-card').count(),0);assert.equal(await page.locator('canvas.stage-canvas').count(),0);
  t.diagnostic(`scene objects across20 rounds: ${counts.join(',')}`);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

test('bonus: zero buildings, unearned all-success and legacy results remain distinct with one total',async()=>{
 const env=await launch();const {page}=env;try{
  await openHome(page,env.url);await clock(page);
  for(const [version,passed] of [[4,0],[4,1],[1,1],[2,1]]){
   const summary=await page.evaluate(async({version,passed})=>{
    const {GameSession}=await import('/src/game/session.js');const a=__kamereoru,s=new GameSession({playId:`result-${version}-${passed}`,seed:17,rulesVersion:`kamereoru-rules-v${version}`});
    if(passed)s.apply({type:'color',t:0,...s.game.course.targets[0]});s.apply({type:'quit',t:passed*5000});const summary=s.summary();
    a.lastResult={playId:s.meta.playId,ranked:false,name:'',summary,newBest:false,targets:s.game.course.targets};a.session=null;a.showResult();a.resultPresentation.finishNow();return summary;
   },{version,passed});
   assert.equal(await page.locator(id('result-score')).count(),1);assert.equal(await page.locator(id('result-score')).textContent(),String(summary.score.total));
   if(version<3){
    assert.equal('bonus' in summary,false);assert.equal('bonus' in summary.score,false);assert.equal(await page.locator('.result-bonus-row').count(),0);assert.equal(await page.locator('.result-bonus-legacy').textContent(),MESSAGES.ja['bonus.legacy']);
   }else{
    assert.equal(await page.locator('.result-bonus-row').count(),5);assert.equal(await page.locator('.result-bonus-allSuccess .result-bonus-count').textContent(),MESSAGES.ja['bonus.notEarned']);assert.equal(await page.locator('.result-bonus-legacy').count(),0);
    if(passed===0){assert.equal(summary.bonus.points,0);assert.deepEqual(summary.bonus.awards,[]);}
   }
  }
  assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

for(const [width,height] of [[402,700],[402,874],[874,402]])test(`bonus: all15 ending translations fit and leave skip clear at ${width}x${height}`,async()=>{
 const env=await launch({width,height});const {page}=env;try{
  await openHome(page,env.url);await clock(page);await page.evaluate(()=>__kamereoru.debugStart({atMs:249999,seed:17}));
  await page.evaluate(()=>__kamereoru.session.apply({type:'tick',t:250000}));await page.waitForSelector(id('skip-ending'));
  const errors=await page.evaluate(async languages=>{
   const {mountEndingBonus}=await import('/src/presentation/bonus-view.js');const {buildEndingBonus}=await import('/src/presentation/bonus-data.js');const {createPresentationScope}=await import('/src/presentation/scope.js');const {t}=await import('/src/i18n/i18n.js');
   const a=__kamereoru,data=buildEndingBonus(a.lastResult.summary),errors=[];document.querySelector('.ending-bonus').remove();
   for(const lang of languages){
    const scope=createPresentationScope({id:lang,kind:'ending'}),view=mountEndingBonus({host:a.layer,data,scope,t:(k,p)=>t(k,p,lang)}),root=view.element,r=root.getBoundingClientRect(),skip=document.querySelector('[data-testid=skip-ending]').getBoundingClientRect();
    if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)errors.push({lang,reason:'viewport',rect:r.toJSON()});
    if(r.left<skip.right&&r.right>skip.left&&r.top<skip.bottom&&r.bottom>skip.top)errors.push({lang,reason:'skip overlap',card:r.toJSON(),skip:skip.toJSON()});
    for(const el of root.querySelectorAll('strong,span,p,b')){const b=el.getBoundingClientRect(),s=getComputedStyle(el);if(b.right>innerWidth+1||el.scrollWidth>el.clientWidth+1||parseFloat(s.fontSize)<14||s.textOverflow==='ellipsis')errors.push({lang,reason:'text clipping/font',text:el.textContent});}
    if(!root.querySelector('.ending-medal').textContent.includes('100')||!root.querySelector('.ending-total').textContent.includes('460'))errors.push({lang,reason:'missing final points'});
    scope.dispose();
   }
   return errors;
  },SUPPORTED_LANGUAGES.map(l=>l.id));
  assert.deepEqual(errors,[]);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});

test('bonus: real milestone card clears combo and grace notifications at all3 viewports',async()=>{
 const env=await launch();const {page}=env;try{
  await openHome(page,env.url);await clock(page);const conflicts=[];
  for(const [width,height] of [[402,700],[402,874],[874,402]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>__kamereoru.debugStart({atMs:49999,seed:17}));
   await page.evaluate(()=>{document.querySelector('.pause-overlay')?.remove();__kamereoru.coverEl.hidden=true;__kamereoru.session.apply({type:'tick',t:50200});});await page.clock.runFor(32);
   const state=await page.evaluate(async()=>{
    const {t}=await import('/src/i18n/i18n.js'),card=document.querySelector('.bonus-card'),r=card.getBoundingClientRect();
    const collisions=[...document.querySelectorAll('.switch-ok,.banner-host .toast')].filter(el=>{const b=el.getBoundingClientRect();return !el.hidden&&b.width&&b.height&&r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;}).map(el=>({class:el.className,text:el.textContent}));
    return {collisions,comboTextRetained:document.body.innerText.includes(t('game.comboMilestone',{n:10})),opacity:getComputedStyle(card).opacity};
   });
   assert.equal(state.comboTextRetained,true,`${width}x${height}: milestone combo text retained`);assert.equal(Number(state.opacity),1);
   conflicts.push(...state.collisions.map(c=>({viewport:`${width}x${height}`,...c})));
  }
  assert.deepEqual(conflicts,[]);assert.deepEqual(env.errors,[]);
 }finally{await env.close();}
});
