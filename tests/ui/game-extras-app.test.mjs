import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {App} from '../../src/app.js';
import {GameSession} from '../../src/game/session.js';
import {MemoryStore} from '../../src/storage/memory-store.js';
import {createExtendedStepper} from '../../src/scene/stage.js';
let app;const frames=new Map();let seq=0;
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
afterEach(()=>{app?.disposeStage();frames.clear();app=null;});

function setup(presentationSet,{drawable=true,realStepper=false}={}){
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');
 Object.assign(globalThis,{document,Node:window.Node,requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:n=>frames.delete(n),addEventListener:()=>{}});
 const audio={settings:{},setMusic(){},setSettings(){},setBuilding(){},setArea(){},setFinale(){},setPoliceStage(){},setDanger(){},startGameAudio(){},stopGameAudio(){},stopSfx(){},async suspend(){},play(){}};
 let controller,lastView,defaultPresentationSet,stepCalls=0;
 const order=[],ticks=[],controllerEvents=[],stageEvents=[],inputs=[];
 app=new App(document.querySelector('#root'),{audio,stageFactory:async(_host,options)=>{
  defaultPresentationSet=options.presentationSet;
  // Mirrors the CL05 explicit wrapper: only the stage selects the extended path.
  const opts=presentationSet?{...options,presentationSet}:options;
  controller=opts.gameExtrasController;
  const step=controller.step.bind(controller);
  controller.step=input=>{stepCalls++;inputs.push(input);return step(input);};
  const stepper=realStepper?createExtendedStepper({controller}):null;
  const event=controller.event.bind(controller);
  controller.event=input=>{controllerEvents.push(structuredClone(input));return event(input);};
  return {dispose(){stepper?.dispose();},resize(){},forcePresentationEffect(){return true;},presentationStats(){return {};},presentationEvent:event=>stageEvents.push(structuredClone(event)),setBestDistance(){},fx(){},update(args){
   order.push('stage');lastView=args.presentation;
   if(opts.presentationSet==='extended96'){
    if(stepper)stepper.step(args.presentation,{drawable,placements:{railway:true,water:true,robot:true,bird:true,existing:{12:true}}});
    else controller.step({...args.presentation,actorBusy:{hero:false,police:false},drawable,placements:{}});
   }
  }};
 }});
 app.store=new MemoryStore();app.flags={openingSeen:true,alertGuideSeen:true};app.initializeGuides=async()=>({version:1,basic:{consumed:true},brightness:{consumed:true}});app.api={configured:false};
 return {order,ticks,controllerEvents,stageEvents,inputs,get controller(){return controller;},get lastView(){return lastView;},get defaultPresentationSet(){return defaultPresentationSet;},get stepCalls(){return stepCalls;},observeBonus(){
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

test('explicit extended96 forwards the real post-stage badge to batchless evaluation bonus ticks with no extra step or run changes',async()=>{
 const view=setup('extended96');
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

test('the default legacy80 stage never steps the extended controller or enables a precision badge',async()=>{
 const view=setup();const s=new GameSession({playId:'legacy',seed:17});await app.showGame(s,{fresh:true});view.observeBonus();
 assert.equal(view.defaultPresentationSet,'legacy80');
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
