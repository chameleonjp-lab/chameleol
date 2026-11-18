import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createResultCardController, releaseResultCardResources } from '../../src/presentation/result-card-controller.js';
const summary=JSON.parse(readFileSync(new URL('../replay/fixtures/bonus-v3-clear.json',import.meta.url))).expected;
const result=()=>({playId:'private-play-id',name:'private-name',summary:structuredClone(summary),netState:'pending',arrivedBuilding:50,ranked:true});
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
function ports(){
  const count={portraits:0,disposed:0,shares:[],urls:[],revoked:[]};
  return {count,waitForPresentation:async()=>{},createCanvas:()=>({width:1200,height:630}),createRenderer:()=>({}),destroyRenderer:()=>{},
    createResultPortrait:async()=>{count.portraits++;return {image:{width:320,height:480},dispose:()=>count.disposed++};},
    drawResultCard:(canvas,{model})=>{canvas.model=model;},encodePng:async c=>new Blob([JSON.stringify(c.model)],{type:'image/png'}),
    navigator:{canShare:()=>true},shareImpl:async payload=>{count.shares.push(payload);},getPublicUrl:()=>null,
    urlApi:{createObjectURL:()=>{const u=`blob:test-${count.urls.length}`;count.urls.push(u);return u;},revokeObjectURL:u=>count.revoked.push(u)}};
}
test('missing renderer and failing URL getter end as failures that can be retried',async()=>{
  const p=ports(),r=result();p.createRenderer=()=>null;
  const c=createResultCardController({result:r,ports:p});await settle();assert.equal(c.snapshot().state,'failed');releaseResultCardResources(r);
  const p2=ports(),r2=result();p2.getPublicUrl=()=>{throw Error('configuration unavailable');};
  const c2=createResultCardController({result:r2,ports:p2});await settle();assert.equal(await c2.share(),'failed');assert.equal(r2.cardShareRequest,null);releaseResultCardResources(r2);
});
test('same-score verification and locale changes invalidate prepared files immediately and preserve portrait cache',async()=>{
  const r=result(),p=ports();const c=createResultCardController({result:r,locale:'ja',layoutKey:'normal',ports:p});await settle();
  const first=c.snapshot();assert.equal(first.state,'ready');assert.equal(first.model.totalScore,7280);assert.equal(first.model.bonusCount,156);
  r.netState='official';c.refresh({locale:'ja',layoutKey:'normal'});assert.equal(c.snapshot().prepared,null);assert.ok(c.snapshot().revision>first.revision);await settle();
  assert.equal(c.snapshot().model.verificationState,'official');assert.notEqual(c.snapshot().prepared.file,first.prepared.file);
  c.refresh({locale:'fr',layoutKey:'normal'});await settle();assert.equal(c.snapshot().model.locale,'fr');assert.equal(p.count.portraits,1);
  const text=await c.snapshot().prepared.file.text();assert.equal(text.includes('private-play-id'),false);assert.equal(text.includes('private-name'),false);
  c.dispose();const again=createResultCardController({result:r,locale:'en',layoutKey:'normal',ports:p});await settle();assert.equal(p.count.portraits,1);
  releaseResultCardResources(r);assert.equal(p.count.disposed,1);again.dispose();
});
test('pending analysis and failed portraits never become share files; missing evidence can share an initial-color card',async()=>{
  const r=result(),p=ports();r.evidenceInput={};r.evidence={status:'pending',revision:0};
  const c=createResultCardController({result:r,locale:'ja',ports:p});await settle();assert.equal(c.snapshot().prepared,null);assert.equal(p.count.portraits,0);
  r.evidenceInput=null;r.evidence=null;c.refresh({locale:'ja'});await settle();assert.equal(c.snapshot().model.hero.status,'missing');assert.equal(c.snapshot().state,'ready');c.dispose();releaseResultCardResources(r);
  const broken=ports();broken.createResultPortrait=async()=>{throw Error('context unavailable');};const r2=result();const c2=createResultCardController({result:r2,ports:broken});await settle();assert.equal(c2.snapshot().state,'failed');assert.equal(c2.snapshot().prepared,null);assert.equal(await c2.share(),'unavailable');releaseResultCardResources(r2);
});
test('same-condition retry recovers failed encoding without automatically sharing or re-rendering the portrait',async()=>{
  const p=ports(),r=result();let attempts=0;const encode=p.encodePng;p.encodePng=async canvas=>{if(++attempts===1)throw Error('PNG');return encode(canvas);};
  const c=createResultCardController({result:r,ports:p});await settle();assert.equal(c.snapshot().state,'failed');const old=c.snapshot().revision;
  c.retry();await settle();assert.equal(c.snapshot().state,'ready');assert.ok(c.snapshot().revision>old);assert.equal(p.count.portraits,1);assert.equal(p.count.shares.length,0);releaseResultCardResources(r);
});
test('failed encoding releases its generation canvas before recovery views are notified',async()=>{
  const p=ports(),r=result(),failedSizes=[];let canvas;
  p.createCanvas=()=>canvas={};
  const encode=p.encodePng;p.encodePng=async()=>{throw Error('PNG encode failure');};
  p.onChange=snapshot=>{if(snapshot.state==='failed')failedSizes.push([canvas.width,canvas.height]);};
  const c=createResultCardController({result:r,ports:p});await settle();
  assert.equal(c.snapshot().state,'failed');assert.equal(c.snapshot().prepared,null);
  assert.deepEqual(failedSizes,[[0,0]],'failure subscribers may restore an open E090 immediately');
  p.encodePng=encode;c.retry();await settle();
  assert.equal(c.snapshot().state,'ready');assert.equal(p.count.shares.length,0);
  releaseResultCardResources(r);
});
test('ready subscribers never overlap their full-size views with the PNG generation canvas',async()=>{
  const p=ports(),r=result(),sizes=[];let canvas;
  p.createCanvas=()=>canvas={};
  p.onChange=snapshot=>{if(snapshot.state==='ready')sizes.push([canvas.width,canvas.height]);};
  const c=createResultCardController({result:r,ports:p});await settle();
  r.netState='official';c.refresh();await settle();
  assert.equal(c.snapshot().state,'ready');assert.ok(c.snapshot().prepared.file.size>0);
  assert.deepEqual(sizes,[[0,0],[0,0]],'clients may expand the screen and E090 during ready notification');
  releaseResultCardResources(r);
});
test('screen snapshots borrow the same portrait as the PNG without another image allocation',async()=>{
  const p=ports(),r=result();let pngPortrait;
  const draw=p.drawResultCard;p.drawResultCard=(canvas,args)=>{pngPortrait=args.portrait;draw(canvas,args);};
  const c=createResultCardController({result:r,ports:p});
  assert.equal(c.snapshot().portraitImage,null,'no image before capture');
  await settle();assert.equal(c.snapshot().state,'ready');
  assert.equal(c.snapshot().portraitImage,pngPortrait,'screen and PNG use the same borrowed image');
  c.refresh({locale:'de'});await settle();
  assert.equal(c.snapshot().portraitImage,pngPortrait);assert.equal(p.count.portraits,1);
  c.dispose();assert.equal(c.snapshot().portraitImage,null,'disposed views cannot obtain the cached image');
  releaseResultCardResources(r);assert.equal(p.count.disposed,1);
});
test('a pending replacement never exposes the previous hero image',async()=>{
  const p=ports(),r=result();const c=createResultCardController({result:r,ports:p});await settle();
  assert.ok(c.snapshot().portraitImage);
  r.evidenceInput={};r.evidence={status:'pending',revision:1};c.refresh();
  assert.equal(c.snapshot().model.hero.status,'pending');
  assert.equal(c.snapshot().portraitImage,null);assert.equal(c.snapshot().prepared,null);
  assert.equal(await c.share(),'unavailable');releaseResultCardResources(r);
});
test('late generation and disposal never replace or leak the current portrait and file',async()=>{
  const p=ports(),r=result();let complete,disposed=0;
  p.createResultPortrait=()=>new Promise(resolve=>complete=resolve);
  const c=createResultCardController({result:r,ports:p});await settle();c.dispose();
  complete({image:{width:320,height:480},dispose:()=>disposed++});await settle();assert.equal(c.snapshot().prepared,null);assert.equal(disposed,1);assert.equal(r.resultPortrait??null,null);releaseResultCardResources(r);
});
test('an obsolete cached portrait is released before its replacement is allocated',async()=>{
  const p=ports(),r=result();let oldDisposed=false;
  r.resultPortrait={signature:'previous-hero',portrait:{image:{width:320,height:480},dispose:()=>oldDisposed=true}};
  const render=p.createResultPortrait;p.createResultPortrait=async args=>{assert.equal(oldDisposed,true,'never hold two retained portrait images');return render(args);};
  const c=createResultCardController({result:r,ports:p});await settle();assert.equal(c.snapshot().state,'ready');releaseResultCardResources(r);
});
test('one save URL is reused then revoked on replacement and OS return does not permit overlapping shares',async()=>{
  const p=ports(),r=result();let done;p.shareImpl=payload=>{p.count.shares.push(payload);return new Promise(resolve=>done=resolve);};
  const focus=new EventTarget();p.focusTarget=focus;
  const c=createResultCardController({result:r,ports:p});await settle();const url=c.getImageUrl();assert.equal(c.getImageUrl(),url);assert.equal(p.count.urls.length,1);
  const first=c.share();assert.equal(p.count.shares.length,1);focus.dispatchEvent(new Event('focus'));assert.equal(c.snapshot().state,'ready');
  assert.equal(await c.share(),'unavailable');assert.equal(p.count.shares.length,1);done();assert.equal(await first,'shared');
  c.refresh({locale:'de'});assert.deepEqual(p.count.revoked,[url]);await settle();c.getImageUrl();releaseResultCardResources(r);assert.equal(p.count.revoked.length,2);
});
