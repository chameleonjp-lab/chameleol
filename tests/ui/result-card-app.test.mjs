import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {App} from '../../src/app.js';
import {MemoryStore} from '../../src/storage/memory-store.js';
import {setLanguage} from '../../src/i18n/i18n.js';
const summary=JSON.parse(readFileSync(new URL('../replay/fixtures/bonus-v3-clear.json',import.meta.url))).expected;
let app;const frames=new Map();let id=0;
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
function setup(portOverrides={},factory=false){
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');
 const events=new EventTarget();
 Object.assign(globalThis,{document,Node:window.Node,requestAnimationFrame:fn=>(frames.set(++id,fn),id),cancelAnimationFrame:id=>frames.delete(id),addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)});
 const audio={settings:{},setMusic(){},setSettings(){},stopSfx(){},stopGameAudio(){},async suspend(){},play(){}};
 let portraits=0,disposed=0;const nativeShares=[];
 const ports={waitForPresentation:async()=>{},createCanvas:()=>({}),createRenderer:()=>({}),destroyRenderer(){},createResultPortrait:async()=>{portraits++;return {image:{width:320,height:480},dispose:()=>disposed++};},drawResultCard:(c,{model})=>c.model=model,encodePng:async c=>new Blob([JSON.stringify(c.model)],{type:'image/png'}),navigator:{canShare:()=>true},shareImpl:async payload=>nativeShares.push(payload),...portOverrides};
 app=new App(document.querySelector('#root'),{audio,resultCardPorts:factory?()=>ports:ports});app.store=new MemoryStore();app.api={configured:false};
 app.lastResult={playId:'p',summary:structuredClone(summary),ranked:true,netState:'pending',arrivedBuilding:50};
 return {document,events,nativeShares,counts:()=>({portraits,disposed})};
}
afterEach(()=>{app?.showHome();app?.disposeStage();app=null;frames.clear();});
test('the existing result share action uses the prepared file synchronously when visual ports are installed',async()=>{
 const {nativeShares}=setup();app.showResult();await settle();
 const sharing=app.shareResult();assert.equal(nativeShares.length,1);assert.equal(nativeShares[0].files.length,1);assert.equal(nativeShares[0].files[0].type,'image/png');assert.equal(await sharing,'shared');
});
test('result state-only updates invalidate its file before score early-return and language redraw reuses the portrait',async()=>{
 const {counts}=setup();app.showResult();await settle();
 assert.equal(app.resultCardController.snapshot().state,'ready');const first=app.resultCardController.snapshot().revision;
 app.lastResult.netState='official';app.renderResultScore();
 assert.equal(app.resultCardController.snapshot().prepared,null);assert.ok(app.resultCardController.snapshot().revision>first);await settle();
 assert.equal(app.resultCardController.snapshot().model.verificationState,'official');
 for(const lang of ['en','ja','de','th']){setLanguage(lang);app.showResult();await settle();}
 assert.equal(counts().portraits,1);app.showHome();assert.equal(counts().disposed,1);
});
test('outbox status-only updates reach the image controller even when online UI is hidden',async()=>{
 setup();app.showResult();await settle();const before=app.resultCardController.snapshot().revision;
 app.onOutboxUpdate({playId:'p',state:'pending_review'});
 assert.ok(app.resultCardController.snapshot().revision>before);assert.equal(app.resultCardController.snapshot().prepared,null);await settle();
 assert.equal(app.resultCardController.snapshot().model.verificationState,'pending_review');
});
test('viewport rotation invalidates a prepared share even with a constant drawing layout key',async t=>{
 const previous={innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 t.after(()=>Object.assign(globalThis,previous));Object.assign(globalThis,{innerWidth:402,innerHeight:700});
 let layout='card-1200x630-v1';const {events,counts,nativeShares}=setup({getLayoutKey:()=>layout});
 app.showResult();await settle();const c=app.resultCardController,first=c.snapshot().prepared.file;
 Object.assign(globalThis,{innerWidth:874,innerHeight:402});events.dispatchEvent(new Event('resize'));
 assert.equal(c.snapshot().prepared,null,'the old File is unavailable in the resize event itself');
 assert.equal(await app.shareResult(),'unavailable');assert.equal(nativeShares.length,0);
 await settle();assert.notEqual(c.snapshot().prepared.file,first);assert.equal(counts().portraits,1);
 const revision=c.snapshot().revision;events.dispatchEvent(new Event('resize'));
 assert.equal(c.snapshot().revision,revision,'unchanged size and drawing layout do not regenerate a file');
 layout='card-1200x630-v2';events.dispatchEvent(new Event('resize'));
 assert.equal(c.snapshot().prepared,null,'drawing layout changes invalidate the file too');await settle();
 app.showHome();const disposedRevision=c.snapshot().revision;
 globalThis.innerWidth=402;events.dispatchEvent(new Event('resize'));
 assert.equal(c.snapshot().revision,disposedRevision,'the resize listener is released on leaving results');
});
test('factory ports can acquire the shared renderer at first mount before portrait presentation finishes',async()=>{
 let finishPresentation,earlyLease,firstChangeOwner,mountOwner,revoked=false,renderers=0;
 const presentationFinished=new Promise(resolve=>finishPresentation=resolve);
 const {counts}=setup({
  waitForPresentation:()=>presentationFinished,
  createRenderer:()=>({id:++renderers}),
  onChange:()=>{firstChangeOwner??=app.lastResult.resultRendererOwner??null;},
  mount:()=>{
   mountOwner=app.lastResult.resultRendererOwner;
   earlyLease=mountOwner?.acquire('model',{onRevoke:()=>{revoked=true;}})??Promise.resolve(null);
   return {dispose(){}};
  },
 },true);
 app.showResult();
 assert.ok(firstChangeOwner,'owner exists before controller first onChange');
 assert.equal(mountOwner,firstChangeOwner,'mount and controller see the same owner');
 const lease=await earlyLease;
 assert.ok(lease,'E090 can acquire during the initial presentation wait');
 assert.equal(lease.owner,'model');assert.equal(renderers,1);assert.equal(counts().portraits,0);
 finishPresentation();await settle();
 assert.equal(revoked,true,'portrait preparation revokes the early model lease');
 assert.equal(lease.signal.aborted,true);assert.equal(counts().portraits,1);
 assert.equal(app.resultCardController.snapshot().state,'ready');
});
