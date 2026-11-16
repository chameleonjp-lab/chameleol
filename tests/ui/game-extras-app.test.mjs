import test,{afterEach} from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {App} from '../../src/app.js';import {GameSession} from '../../src/game/session.js';import {MemoryStore} from '../../src/storage/memory-store.js';
let app;const frames=new Map();let seq=0;
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
afterEach(()=>{app?.disposeStage();frames.clear();app=null;});
test('app passes its real controller and exact input-derived intervals to the stage without changing the run',async()=>{
 const {window,document}=parseHTML('<html><body><main id="root"></main></body></html>');
 Object.assign(globalThis,{document,Node:window.Node,requestAnimationFrame:fn=>(frames.set(++seq,fn),seq),cancelAnimationFrame:n=>frames.delete(n),addEventListener:()=>{}});
 const audio={settings:{},setMusic(){},setSettings(){},setBuilding(){},setArea(){},setFinale(){},setPoliceStage(){},setDanger(){},startGameAudio(){},stopGameAudio(){},stopSfx(){},async suspend(){},play(){}};
 let controller,lastView;
 app=new App(document.querySelector('#root'),{audio,stageFactory:async(_host,opts)=>{controller=opts.gameExtrasController;return {dispose(){},resize(){},presentationEvent(){},setBestDistance(){},fx(){},update(args){lastView=args.presentation;controller.step({...args.presentation,guideActive:false,actorBusy:{hero:false,police:false},drawable:true,placements:{}});}};}});
 app.store=new MemoryStore();app.flags={openingSeen:true,alertGuideSeen:true};app.initializeGuides=async()=>({version:1,basic:{consumed:true},brightness:{consumed:true}});app.api={configured:false};
 const s=new GameSession({playId:'p',seed:17});await app.showGame(s,{fresh:true});assert.ok(controller);
 s.running=false;s.apply({type:'color',t:100,...s.game.course.targets[0]});s.apply({type:'tick',t:2000});const inspect=()=>JSON.stringify({state:s.state,history:s.recorder.entries,saveSeq:s.saveSeq});const before=inspect();
 [...frames.values()].at(-1)();await settle();
 assert.equal(lastView.evaluationSegments[0].from,1500);assert.equal(lastView.evaluationSegments[0].to,2000);assert.equal(controller.snapshot().precisionBadge.kind,'nearPerfect');assert.equal(inspect(),before);
 app.disposeStage();assert.deepEqual(controller.snapshot(),{travelTongue:null,cameo:null,policeExtra:null,precisionBadge:null});
});
