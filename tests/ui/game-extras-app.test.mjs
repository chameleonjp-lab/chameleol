import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {App} from '../../src/app.js';
import {GameSession} from '../../src/game/session.js';
import {MemoryStore} from '../../src/storage/memory-store.js';
import {createExtendedStepper} from '../../src/scene/stage.js';
import {t} from '../../src/i18n/i18n.js';
let app;const frames=new Map();let seq=0;
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
afterEach(()=>{app?.disposeStage();frames.clear();app=null;});

function setup(presentationSet,{drawable=true,realStepper=false}={}){
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');
 Object.assign(globalThis,{document,Node:window.Node,requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:n=>frames.delete(n),addEventListener:()=>{}});
 const audio={settings:{},setMusic(){},setSettings(){},setBuilding(){},setArea(){},setFinale(){},setPoliceStage(){},setDanger(){},startGameAudio(){},stopGameAudio(){},stopSfx(){},async suspend(){},play(){}};
 let controller,lastView,defaultPresentationSet,stepCalls=0;
 const order=[],ticks=[],controllerEvents=[],stageEvents=[],inputs=[],previews=[];
 app=new App(document.querySelector('#root'),{audio,stageFactory:async(_host,options)=>{
  defaultPresentationSet=options.presentationSet;
  // An explicit wrapper can still select legacy80; normal App requests extended96.
  const opts=presentationSet?{...options,presentationSet}:options;
  controller=opts.gameExtrasController;
  const step=controller.step.bind(controller);
  controller.step=input=>{stepCalls++;inputs.push(input);return step(input);};
  const stepper=realStepper?createExtendedStepper({controller}):null;
  const event=controller.event.bind(controller);
  controller.event=input=>{controllerEvents.push(structuredClone(input));return event(input);};
  return {dispose(){stepper?.dispose();},resize(){},forcePresentationEffect(id,preview){previews.push({id,preview:structuredClone(preview)});return true;},presentationStats(){return {};},presentationEvent:event=>stageEvents.push(structuredClone(event)),setBestDistance(){},fx(){},update(args){
   order.push('stage');lastView=args.presentation;
   if(opts.presentationSet==='extended96'){
    if(stepper)stepper.step(args.presentation,{drawable,placements:{railway:true,water:true,robot:true,bird:true,existing:{12:true}}});
    else controller.step({...args.presentation,actorBusy:{hero:false,police:false},drawable,placements:{}});
   }
  }};
 }});
 app.store=new MemoryStore();app.flags={openingSeen:true,alertGuideSeen:true};app.initializeGuides=async()=>({version:1,basic:{consumed:true},brightness:{consumed:true}});app.api={configured:false};
 return {order,ticks,controllerEvents,stageEvents,inputs,previews,get controller(){return controller;},get lastView(){return lastView;},get defaultPresentationSet(){return defaultPresentationSet;},get stepCalls(){return stepCalls;},observeBonus(){
  const tick=app.bonusPresentation.tick;
  app.bonusPresentation.tick=args=>{order.push('bonus');ticks.push(args);return tick(args);};
 }};
}
const inspect=session=>JSON.stringify({state:session.state,history:session.recorder.entries,saveSeq:session.saveSeq});
async function frame(){[...frames.values()].at(-1)();await settle();}

test('verification warmup uses real stage intervals without permanently suppressing the next claimed cameo or mutating the run',async()=>{
 const view=setup('extended96',{realStepper:true});
 app.runtime={...app.runtime,isVerification:true};
 await app.debugStart({atMs:30000,seed:1});
 const session=app.session,before=inspect(session);
 await app.debugPresentation({effectId:21});
 assert.equal(inspect(session),before);
 const warmup=view.inputs.slice();
 assert.equal(warmup[0].t,27000);assert.equal(warmup.at(-1).t,30000);
 const advance=(t,phase)=>app.stage.update({t,color:session.state.color,policeStage:0,presentation:{...view.lastView,t,building:7,passed:6,phase,running:true,hidden:false,moving:true,policeStage:0,lastEvalSuccess:false,matchState:null,guideActive:false,guidanceActive:false,warningActive:false,evaluationSegments:[]}});
 advance(30100,'eval');advance(31000,'grace');
 await settle();advance(31016,'grace');
 assert.equal(view.controller.snapshot().cameo?.id,14,'a real claim succeeds after warmup; slow-frame suppression must not be latched');
 assert.ok(warmup.slice(1).every(input=>input.frameIntervalMs>0&&input.frameIntervalMs<=16));
 assert.equal(inspect(session),before);
});

test('normal extended96 forwards the real post-stage badge to batchless evaluation bonus ticks with no extra step or run changes',async()=>{
 const view=setup();
 const s=new GameSession({playId:'p',seed:17});await app.showGame(s,{fresh:true});assert.ok(view.controller);view.observeBonus();
 let batches=0;const show=app.bonusPresentation.show;app.bonusPresentation.show=(...args)=>{batches++;return show(...args);};
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});
 let before=inspect(s);await frame();
 assert.equal(view.lastView.evaluationSegments[0].from,1500);assert.equal(view.lastView.evaluationSegments[0].to,2000);
 assert.equal(view.controller.snapshot().precisionBadge.kind,'nearPerfect');assert.equal(inspect(s),before);
 s.apply({type:'tick',t:2100});before=inspect(s);await frame();
 assert.equal(view.ticks.at(-1).phase,'eval');assert.equal(batches,0,'no completed-building bonus batch exists yet');
 assert.deepEqual(view.ticks.at(-1).precisionBadge,view.controller.snapshot().precisionBadge);
 assert.equal(view.ticks.at(-1).precisionBadge.elapsedMs,100,'snapshot reflects this stage update, not the previous frame');
 assert.equal(view.ticks.at(-1).activeMs,2100);assert.equal(inspect(s),before);
 s.apply({type:'tick',t:3400});await frame();
 assert.equal(view.ticks.at(-1).precisionBadge,null,'expired snapshot clears the notification input');
 assert.equal(view.stepCalls,3,'the stage is the only controller step caller');
 assert.deepEqual(view.order,['stage','bonus','stage','bonus','stage','bonus']);
 app.disposeStage();assert.deepEqual(view.controller.snapshot(),{travelTongue:null,cameo:null,policeExtra:null,precisionBadge:null});
});

test('an explicit legacy80 stage never steps the extended controller or enables a precision badge',async()=>{
 const view=setup('legacy80');const s=new GameSession({playId:'legacy',seed:17});await app.showGame(s,{fresh:true});view.observeBonus();
 assert.equal(view.defaultPresentationSet,'extended96');
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});await frame();
 s.apply({type:'tick',t:2100});await frame();
 assert.equal(view.stepCalls,0);assert.equal(view.controller.snapshot().precisionBadge,null);
 assert.ok(view.ticks.every(tick=>tick.precisionBadge==null));
 assert.deepEqual(view.order,['stage','bonus','stage','bonus']);
});

test('synthetic instantSuccess reaches the real extras controller and legacy stage exactly once for the building',async()=>{
 const view=setup('extended96');const s=new GameSession({playId:'instant',seed:17});await app.showGame(s,{fresh:true});
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});
 for(const t of [2000,2200,2200,2300]){
  s.apply({type:'tick',t});const before=inspect(s);await frame();assert.equal(inspect(s),before);
 }
 const expected=[{type:'instantSuccess',t:2200,building:1}];
 assert.deepEqual(view.controllerEvents.filter(event=>event.type==='instantSuccess'),expected);
 assert.deepEqual(view.stageEvents.filter(event=>event.type==='instantSuccess'),expected);
});
test('effects off keeps evaluation processing but never forwards a decorative precision badge',async()=>{
 const view=setup('extended96',{drawable:false});const s=new GameSession({playId:'effects-off',seed:17,effects:false});
 await app.showGame(s,{fresh:true});view.observeBonus();
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});await frame();
 s.apply({type:'tick',t:2100});const before=inspect(s);await frame();
 assert.equal(view.controller.snapshot().precisionBadge.kind,'nearPerfect','the real evaluation and one-time claim still run');
 assert.equal(view.ticks.at(-1).precisionBadge,null,'effects off suppresses only its display');
 assert.equal(view.stepCalls,2);assert.equal(inspect(s),before);
});
test('the simple stage may still forward a badge when effects are enabled',async()=>{
 const view=setup('extended96',{drawable:false});const s=new GameSession({playId:'simple-stage',seed:17});
 await app.showGame(s,{fresh:true});view.observeBonus();
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});await frame();
 s.apply({type:'tick',t:2100});await frame();
 assert.equal(view.ticks.at(-1).precisionBadge.kind,'nearPerfect');assert.equal(view.stepCalls,2);
});
test('one police officer keeps the existing warning priority over a precision badge',async()=>{
 const view=setup('extended96');const s=new GameSession({playId:'police-badge',seed:17});
 await app.showGame(s,{fresh:true});view.observeBonus();
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});await frame();
 s.apply({type:'tick',t:2100});s.state.alert=s.rules.alert.stages[0].enterAt;await frame();
 assert.equal(view.lastView.policeStage,1);assert.equal(view.controller.snapshot().precisionBadge.kind,'nearPerfect');
 assert.equal(view.ticks.at(-1).warningActive,true);assert.equal(view.ticks.at(-1).precisionBadge,null);
 s.state.alert=0;s.apply({type:'tick',t:2200});await frame();
 assert.equal(view.ticks.at(-1).precisionBadge.elapsedMs,200,'returning from warning never restarts its lifetime');
});


test('normal verification precision preview uses actual evaluation data without claiming the current run badge',async()=>{
 const view=setup(undefined,{realStepper:true});app.runtime={...app.runtime,isVerification:true};
 await app.debugStart({atMs:2000,seed:1});
 const before=inspect(app.session),extras=JSON.stringify(app.extrasMemory),calls=view.stepCalls;
 const proof=await app.debugPresentation({effectId:44});
 assert.equal(proof.badge,true);assert.equal(proof.visible,true);
 assert.equal(document.querySelector('.bonus-card-badge').textContent,`◎ ${t('presentation.nearPerfect')}`);
 assert.equal(view.stepCalls,calls,'an isolated preview adds no normal-stage controller step');
 assert.equal(inspect(app.session),before);assert.equal(JSON.stringify(app.extrasMemory),extras);
 assert.equal(view.controller.snapshot().precisionBadge,null,'the run claim is untouched');
});

test('normal App loop preserves the same 50-building course, summary, history and submission as explicit legacy, with effects on and off',{timeout:30000},async()=>{
 const {buildResultBody}=await import('../../src/net/outbox.js');const runs=[];
 for(const mode of ['legacy80',undefined])for(const effects of [false,true]){
  const view=setup(mode,{realStepper:true,drawable:false});
  const session=new GameSession({playId:'same-play',launchId:'same-launch',seed:17,effects,startedAt:1000});
  await app.showGame(session,{fresh:true});session.running=false;
  app.stage.playEnding=async()=>{};
  const finishPlay=app.finishPlay.bind(app);let finished;
  app.finishPlay=(...args)=>(finished=finishPlay(...args));
  const milestones=[];
  for(let b=1;b<=50;b++){
   const target=session.game.course.targets[b-1];
   session.apply({type:'color',t:(b-1)*5000+100,...target});
   for(const offset of [2000,2500,4500]){
    session.apply({type:'tick',t:(b-1)*5000+offset});
    const before=inspect(session);await frame();assert.equal(inspect(session),before);
   }
   session.apply({type:'tick',t:b*5000});
   if([20,40,50].includes(b))milestones.push(session.state.passed);
  }
  assert.ok(finished,'the actual cleared event started finishPlay');
  await finished;
  const evidence=app.lastResult.evidence;assert.ok(evidence,'showResult started history analysis');
  if(evidence.status==='pending')await new Promise(resolve=>{
   const unsubscribe=evidence.subscribe(()=>{if(evidence.status!=='pending'){unsubscribe();resolve();}});
  });
  assert.deepEqual(milestones,[20,40,50]);assert.equal(app.lastResult.summary.buildings,50);
  assert.equal(app.lastResult.evidence.status,'ready');assert.equal(session.listeners.size,0);
  assert.equal(view.stepCalls,mode==='legacy80'?0:150,'one step for each real App game frame');
  const snapshot=session.snapshot();snapshot.meta.effects=true;
  const summary=session.summary();runs.push({course:session.game.course,summary,history:snapshot.history,body:buildResultBody(snapshot,summary,{endedAt:1000})});
  app.disposeStage();frames.clear();
 }
 for(const run of runs.slice(1))assert.deepEqual(run,runs[0]);
});


test('bird verification warmup reports the real building/phase at each frame without changing run history or cameo claims',async()=>{
 const view=setup(undefined,{realStepper:true});app.runtime={...app.runtime,isVerification:true};
 await app.debugStart({atMs:21000,seed:1});
 const before=inspect(app.session),extras=JSON.stringify(app.extrasMemory);
 await app.debugPresentation({effectId:69});
 assert.equal(view.inputs[0].t,18000);assert.equal(view.inputs.at(-1).t,21000);
 for(const input of view.inputs){
  assert.equal(input.building,Math.floor(input.t/5000)+1);
  const offset=input.t%5000;
  assert.equal(input.phase,offset>=1500&&offset<4500?'eval':'grace');
 }
 assert.equal(view.inputs.find(input=>input.building===5).t,20000,'building5 route is first considered at its real first grace');
 const cameo=view.previews.at(-1).preview.cameo;
 assert.equal(cameo.startedAt,20000);assert.equal(cameo.elapsedMs,1000);
 assert.equal(cameo.startedAt+cameo.elapsedMs,view.inputs.at(-1).t,'elapsed1000 is drawn with the t=21000 camera, not the start camera');
 assert.equal(inspect(app.session),before);assert.equal(JSON.stringify(app.extrasMemory),extras);
 assert.equal(view.controller.snapshot().cameo,null,'preview warming does not consume a production claim');
});
