// Render-only load fixture. Synthetic holds/cameos exercise allocation peaks; this is not
// evidence of gameplay timing or controller selection (extended-stage tests cover those).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launch} from './helpers.mjs';

test('legacy peak props, ring, particles, shop and three-bird cameo together with held tongue stay inside combined renderer budgets',async(t)=>{
  const env=await launch({width:402,height:700});
  try{
    const evidence=[];
    for(const atMs of [95000,100000]){
      const pair=[];
      for(const effects of [false,true]){
        await env.page.goto(`${env.url}tests/e2e/fixtures/extended96.html`);
        await env.page.waitForFunction(()=>globalThis.__fixtureReady===true);
        pair.push(await env.page.evaluate(async({atMs,effects})=>{
          const a=__kamereoru;
          await a.debugStart({atMs,seed:1,effects});cancelAnimationFrame(a.raf);
          const {readPlayView}=await import('/src/presentation/events.js');
          const v={...readPlayView(a.session,2,{lastEvalSuccess:true}),running:true,phase:'eval',matchState:'success'};
          const step=a.gameExtrasController.step.bind(a.gameExtrasController);
          a.gameExtrasController.step=input=>({...step(input),travelTongue:effects?{phase:'hold',phaseProgress:.5,jewelVisible:true}:null,cameo:effects?{id:14,startedAt:atMs-350,elapsedMs:700,durationMs:1500,building:v.building,phase:'story'}:null});
          const update=time=>a.stage.update({t:time,color:v.color,policeStage:2,walking:true,presentation:{...v,t:time}});
          const samples=[];
          const capture=(effectId,time)=>{update(time);samples.push({effectId,t:time,renderer:a.stage.stats(),pools:a.stage.presentationStats()});};
          update(atMs);capture(null,atMs+350);
          if(effects){
            // Same allocation sequence as the pre-existing peak test, then restore the real
            // rendering of the controlled three-bird cameo and held tongue in each sample.
            for(const effectId of [32,33,37,40,26,4,41,19]){
              a.stage.forcePresentationEffect(effectId);capture(effectId,atMs+350);
            }
          }
          capture(19,atMs+700);return samples;
        },{atMs,effects}));
      }
      const baseline=pair[0],samples=pair[1];
      for(const sample of samples){
        const base=baseline.find(row=>row.t===sample.t).renderer;
        assert.equal(sample.pools.tongue.visible,true);assert.equal(sample.pools.tongue.diamondVisible,true);
        for(const [key,max] of [['calls',12],['geometries',16],['textures',4]])assert.ok(sample.renderer[key]-base[key]<=max,`${atMs}/No.${sample.effectId}/${key}: ${JSON.stringify({base,sample})}`);
        assert.ok(sample.pools.staticDecorations<=24);assert.ok(sample.pools.ambientParticles<=8);
        assert.ok(sample.pools.backgroundGroups<=1&&sample.pools.backgroundBirds<=3);
      }
      assert.ok(samples.some(row=>row.pools.shopInteriors>0),'real shop interior batch appears');
      assert.ok(samples.some(row=>row.pools.backgroundBirds===3),'three actual bird sprites appear');
      assert.ok(samples.some(row=>row.pools.successRings===1),'success ring appears with tongue');
      assert.ok(samples.some(row=>row.pools.ambientParticles>0),'ambient particles appear with tongue');
      assert.ok(samples.some(row=>row.pools.actors.activeIds.includes(37)),'binocular prop appears with tongue');
      evidence.push({atMs,baseline,samples});
    }
    if(process.env.CL03_SCREENSHOTS){await mkdir(process.env.CL03_SCREENSHOTS,{recursive:true});await writeFile(`${process.env.CL03_SCREENSHOTS}/combined-renderer-peak.json`,JSON.stringify(evidence,null,2));}
    t.diagnostic(`combined peak: ${JSON.stringify(evidence.map(({atMs,baseline,samples})=>({atMs,baseline:baseline.map(row=>row.renderer),peak:Object.fromEntries(['calls','geometries','textures'].map(key=>[key,Math.max(...samples.map(row=>row.renderer[key]-baseline.find(base=>base.t===row.t).renderer[key]))]))})))}`);
    assert.deepEqual(env.errors,[]);
  }finally{await env.close();}
});
