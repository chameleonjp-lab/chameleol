// Normal entry only: every adopted ID must reach a real painter or a panel fed by real history.
// Forced previews prove rendering/data reachability, not gameplay selection or iPhone acceptance.
import { MESSAGES } from '../../src/i18n/messages/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launch,openHome} from './helpers.mjs';

const STREETS=[20,34,39,44,56,67,68,69];
const RESULTS=new Map([[72,['frames','.evidence-frame',3]],[75,['model','.result-miniature-svg [data-building]',50]],[76,['colors','.evidence-swatch',2]],[84,['alert','.evidence-graph',1]],[86,['recovery','.evidence-recovery .evidence-frame',2]],[87,['streak','.evidence-film',1]],[90,['turn','.result-turn-canvas',1]],[94,[null,'.result-card-canvas',1]]]);

test('normal verification: all 16 adopted IDs paint real artwork, badge or history-derived panels; four withdrawn IDs are rejected',async(t)=>{
 const env=await launch({width:402,height:700});const facts=[];
 try{
  if(process.env.CL03_SCREENSHOTS)await mkdir(process.env.CL03_SCREENSHOTS,{recursive:true});
  await openHome(env.page,env.url);
  for(const effectId of STREETS)await t.test(`adopted E${String(effectId).padStart(3,'0')} actual drawing`,async()=>{
   const proof=await env.page.evaluate(async id=>{
    const p=await __kamereoru.debugPresentation({effectId:id});
    const canvas=__kamereoru.stage.renderer.domElement,gl=__kamereoru.stage.renderer.getContext();
    const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let birdPixels=null;
    if(id===69&&p.storySprites===3){
     const stage=__kamereoru.stage,renderer=stage.renderer,render=renderer.render;let scene,camera;
     try{renderer.render=function(s,c){scene=s;camera=c;return render.call(this,s,c);};stage.checkComparisonSurfaces();}
     finally{renderer.render=render;}
     const {captureAtlasCell}=await import('/tests/presentation/atlas-capture.mjs');
     const atlas=await(await fetch('/src/presentation/assets/atlas.json')).json();
     const read=()=>{const data=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return {data};};
     birdPixels=[];
     for(const name of [p.visibleArtwork.includes('birdCarryA')?'birdCarryA':'birdCarryB','parcel','rope']){
      const sampled=captureAtlasCell({scene,camera,renderer,cellIndex:atlas.street[name].index,columns:atlas.columns,rows:atlas.rows,viewport:{width:canvas.width,height:canvas.height},read});
      let changed=0;for(let i=0;i<sampled.shown.data.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(sampled.shown.data[i+k]-sampled.hidden.data[i+k])))>24)changed++;
      birdPixels.push({name,pixels:changed,projected:sampled.projected});
     }
    }
    const colors=new Set();for(let i=0;i<pixels.length;i+=16)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return {...p,birdPixels,renderedColors:colors.size,policeVisible:__kamereoru.stage.presentationGeometry().police[0]!==null,badgeText:document.querySelector('.bonus-card-badge')?.textContent??''};
   },effectId);
   facts.push({effectId,proof});
   if(effectId===44){assert.equal(proof.badge,true);assert.equal(proof.badgeText,`◎ ${MESSAGES.ja['presentation.nearPerfect']}`);}
   else{
    assert.equal(proof.mode,'extended96');assert.ok(proof.renderedColors>30,'actual frame pixels were rendered');
    if([34,39].includes(effectId)){
     assert.equal(proof.policeExtra?.id,effectId);assert.equal(proof.policeVisible,true);assert.ok(Math.abs(proof.policeExtra.dx)>0);
     if(effectId===39)assert.ok(proof.footprints>=1&&proof.footprints<=3);
    }else{
     assert.ok(proof.storySprites>=1&&proof.storySprites<=3,`E${effectId}: actual atlas instances ${proof.storySprites}`);
     if(effectId===69){assert.equal(proof.storySprites,3);assert.equal(proof.birdPixels.length,3);for(const cell of proof.birdPixels)assert.ok(cell.pixels>0,`E069 preview actually paints ${cell.name}: ${cell.pixels} pixels`);}
     const required={20:['tram'],56:['drone','flag'],67:['water','swirl'],68:['robot'],69:['birdcarry','parcel','rope']}[effectId];
     for(const name of required)assert.ok(proof.visibleArtwork.some(art=>art.toLowerCase().includes(name)),`E${effectId} visible ${name}: ${proof.visibleArtwork}`);
    }
   }
   // The frozen preview survives a display frame, with no progress in its debug run.
   const before=await env.page.evaluate(()=>JSON.stringify({state:__kamereoru.session.state,history:__kamereoru.session.recorder.entries,extras:__kamereoru.extrasMemory}));
   await env.page.waitForTimeout(50);
   assert.equal(await env.page.evaluate(()=>JSON.stringify({state:__kamereoru.session.state,history:__kamereoru.session.recorder.entries,extras:__kamereoru.extrasMemory})),before);
   if(process.env.CL03_SCREENSHOTS)await env.page.screenshot({path:`${process.env.CL03_SCREENSHOTS}/normal-verification-${effectId}.png`});
  });
  for(const [effectId,[panel,selector,count]] of RESULTS)await t.test(`adopted E${effectId} real result data`,async()=>{
   await env.page.evaluate(effectId=>__kamereoru.debugPresentation({effectId}),effectId);
   await env.page.waitForFunction(()=>__kamereoru.lastResult.evidence?.status==='ready');
   await env.page.waitForFunction(()=>__kamereoru.resultCardController?.snapshot().state==='ready');
   await env.page.waitForSelector(selector);
   assert.equal(await env.page.locator(selector).count(),count,`E${effectId} actual panel elements`);
   const proof=await env.page.evaluate(({effectId,panel})=>{
    const a=__kamereoru,r=a.lastResult,s=a.resultCardController.snapshot();
    return {effectId,panel:a.resultPanels.openId,history:r.evidenceInput.history.length,sourceSummary:r.evidenceInput.originalSummary,summary:r.summary,model:s.model,prepared:s.prepared?{width:s.prepared.width,height:s.prepared.height,type:s.prepared.blob.type}:null,panelCount:a.resultPanels.stats().openCount};
   },{effectId,panel});
   facts.push({effectId,proof});
   assert.ok(proof.history>10);assert.deepEqual(proof.sourceSummary,proof.summary);
   assert.equal(proof.model.passed,proof.summary.buildings);
   if(panel){assert.equal(proof.panel,panel);assert.equal(proof.panelCount,1);}
   assert.equal(proof.prepared.type,'image/png');
   if(process.env.CL03_SCREENSHOTS)await env.page.screenshot({path:`${process.env.CL03_SCREENSHOTS}/normal-verification-${effectId}.png`,fullPage:true});
  });
  for(const effectId of [45,51,88,97])assert.equal(await env.page.evaluate(async effectId=>{try{await __kamereoru.debugPresentation({effectId});return false;}catch{return true;}},effectId),true);
  assert.equal(facts.length,16);assert.deepEqual(env.errors,[]);
 }finally{
  if(process.env.CL03_SCREENSHOTS){await mkdir(process.env.CL03_SCREENSHOTS,{recursive:true});await writeFile(`${process.env.CL03_SCREENSHOTS}/normal-verification-adopted16.json`,JSON.stringify(facts,null,2));}
  await env.close();
 }
});
