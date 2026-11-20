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
 const controllerEvents=[],stageEvents=[],inputs=[],previews=[];
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
   lastView=args.presentation;
   if(opts.presentationSet==='extended96'){
    if(stepper)stepper.step(args.presentation,{drawable,placements:{railway:true,water:true,robot:true,bird:true,existing:{12:true}}});
    else controller.step({...args.presentation,actorBusy:{hero:false,police:false},drawable,placements:{}});
   }
  }};
 }});
 app.store=new MemoryStore();app.flags={openingSeen:true,alertGuideSeen:true};app.initializeGuides=async()=>({version:1,basic:{consumed:true},brightness:{consumed:true}});app.api={configured:false};
 return {controllerEvents,stageEvents,inputs,previews,get controller(){return controller;},get lastView(){return lastView;},get defaultPresentationSet(){return defaultPresentationSet;},get stepCalls(){return stepCalls;}};
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

test('normal extended96 updates the stage without presenting or claiming a precision popup',async()=>{
 const view=setup();
 const s=new GameSession({playId:'p',seed:17});await app.showGame(s,{fresh:true});
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});
 const before=inspect(s);await frame();
 assert.equal(view.lastView.phase,'eval');
 assert.equal(view.controller.snapshot().precisionBadge,null);
 assert.equal(document.querySelector('.bonus-card'),null);
 assert.equal(inspect(s),before);
 assert.equal(view.stepCalls,1,'the stage is the only controller step caller');
 app.disposeStage();assert.deepEqual(view.controller.snapshot(),{travelTongue:null,cameo:null,policeExtra:null,precisionBadge:null});
});

test('an explicit legacy80 stage never steps the extended controller or enables a precision badge',async()=>{
 const view=setup('legacy80');const s=new GameSession({playId:'legacy',seed:17});await app.showGame(s,{fresh:true});
 assert.equal(view.defaultPresentationSet,'extended96');
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});await frame();
 s.apply({type:'tick',t:2100});await frame();
 assert.equal(view.stepCalls,0);assert.equal(view.controller.snapshot().precisionBadge,null);
 assert.equal(document.querySelector('.bonus-card'),null);
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
test('normal verification precision preview uses actual evaluation data without claiming the current run badge',async()=>{
 const view=setup(undefined,{realStepper:true});app.runtime={...app.runtime,isVerification:true};
 await app.debugStart({atMs:2000,seed:1});
 const before=inspect(app.session),extras=JSON.stringify(app.extrasMemory),calls=view.stepCalls;
 const proof=await app.debugPresentation({effectId:44});
 assert.equal(proof.badge,true);assert.equal(proof.visible,true);
 assert.equal(document.querySelector('.bonus-card-badge').textContent,`◎ ${t('presentation.nearPerfect')}`);
 assert.equal(document.querySelector('.bonus-card').style.getPropertyValue('--bonus-enter'),'1');
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

test('the brightness range follows the current wall on buildings 23–30 only', async () => {
  setup();
  const session = new GameSession({ playId: 'brightness-range', seed: 1 });
  await app.showGame(session, { fresh: true });
  const range = document.querySelector('.bar .bar-guide-range');
  const paletteTarget = document.querySelector('.palette-guide-target');
  const barTarget = document.querySelector('.bar-guide-target');

  for (const [i, wall] of session.game.course.targets.slice(0, 31).entries()) {
    session.apply({ type: 'color', t: i * session.rules.buildingMs, ...wall });
    const before = inspect(session);
    app.renderGuidance();
    assert.equal(inspect(session), before, 'rendering the range does not change the session or its input history');
    const building = i + 1;
    const visible = building >= 23 && building <= 30;
    assert.equal(range.hidden, !visible, `building ${building}`);
    if (!visible) continue;

    assert.equal(paletteTarget.style.display, 'none');
    assert.equal(barTarget.style.display, 'none');
    assert.ok(Math.abs(Number.parseFloat(range.style.top) - Math.max(0, 100 - wall.v * 0.015)) < 1e-9);
    assert.equal(Number.parseFloat(range.style.bottom), wall.v / 200);

    if (building === 23) {
      session.pause('user');
      app.showPause('user');
      app.renderGuidance();
      assert.equal(range.hidden, true);
      app.coverEl.hidden = true;
      session.startClock(performance.now());
      app.renderGuidance();
      assert.equal(range.hidden, false);
    }
  }
});

test('the brightness range is available when an older saved game resumes at building 23', async () => {
  setup();
  const session = new GameSession({ playId: 'old-brightness-range', seed: 1, rulesVersion: 'kamereoru-rules-v4' });
  for (const [i, wall] of session.game.course.targets.slice(0, 23).entries()) {
    session.apply({ type: 'color', t: i * session.rules.buildingMs, ...wall });
  }
  const restored = GameSession.fromSnapshot(session.snapshot()).session;
  assert.equal(restored.meta.rulesVersion, 'kamereoru-rules-v4');
  await app.showGame(restored, { fresh: false });
  const range = document.querySelector('.bar-guide-range');
  assert.equal(range.hidden, true);
  app.coverEl.hidden = true;
  restored.startClock(performance.now());
  app.renderGuidance();
  assert.equal(range.hidden, false);
});
