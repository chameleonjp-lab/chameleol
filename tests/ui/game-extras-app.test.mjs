import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {App} from '../../src/app.js';
import {GameSession} from '../../src/game/session.js';
import {MemoryStore} from '../../src/storage/memory-store.js';
let app;const frames=new Map();let seq=0;
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
afterEach(()=>{app?.disposeStage();frames.clear();app=null;});

function setup(presentationSet){
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');
 Object.assign(globalThis,{document,Node:window.Node,requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:n=>frames.delete(n),addEventListener:()=>{}});
 const audio={settings:{},setMusic(){},setSettings(){},setBuilding(){},setArea(){},setFinale(){},setPoliceStage(){},setDanger(){},startGameAudio(){},stopGameAudio(){},stopSfx(){},async suspend(){},play(){}};
 let controller,lastView,defaultPresentationSet,stepCalls=0;
 const order=[],ticks=[],controllerEvents=[],stageEvents=[];
 app=new App(document.querySelector('#root'),{audio,stageFactory:async(_host,options)=>{
  defaultPresentationSet=options.presentationSet;
  // Mirrors the CL05 explicit wrapper: only the stage selects the extended path.
  const opts=presentationSet?{...options,presentationSet}:options;
  controller=opts.gameExtrasController;
  const step=controller.step.bind(controller);
  controller.step=input=>{stepCalls++;return step(input);};
  const event=controller.event.bind(controller);
  controller.event=input=>{controllerEvents.push(structuredClone(input));return event(input);};
  return {dispose(){},resize(){},presentationEvent:event=>stageEvents.push(structuredClone(event)),setBestDistance(){},fx(){},update(args){
   order.push('stage');lastView=args.presentation;
   if(opts.presentationSet==='extended96')controller.step({...args.presentation,actorBusy:{hero:false,police:false},drawable:true,placements:{}});
  }};
 }});
 app.store=new MemoryStore();app.flags={openingSeen:true,alertGuideSeen:true};app.initializeGuides=async()=>({version:1,basic:{consumed:true},brightness:{consumed:true}});app.api={configured:false};
 return {order,ticks,controllerEvents,stageEvents,get controller(){return controller;},get lastView(){return lastView;},get defaultPresentationSet(){return defaultPresentationSet;},get stepCalls(){return stepCalls;},observeBonus(){
  const tick=app.bonusPresentation.tick;
  app.bonusPresentation.tick=args=>{order.push('bonus');ticks.push(args);return tick(args);};
 }};
}
const inspect=session=>JSON.stringify({state:session.state,history:session.recorder.entries,saveSeq:session.saveSeq});
async function frame(){[...frames.values()].at(-1)();await settle();}

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
