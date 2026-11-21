// 30棟の同系色タイムアタック。通常のApp/Session/保存とは分離する。
import {h} from './dom.js';
import {createControls} from './controls.js';
import {createStage} from '../scene/stage.js';
import {makeDecorations,RULES_V5} from '../rules/v1/index.js';
import {MODE_ID,RULES_VERSION,COURSE_VERSION,HISTORY_FORMAT,generateTimeAttackCourse,
 createTimeAttackState,applyTimeAttackEvent,publicView,replayTimeAttack,
 centiseconds,formatTime,formatTimeJa,titleNameJa} from '../rules/time-attack/v1/index.js';
import {normalizeName} from '../shared/name.js';
import {openTimeAttackStore} from '../storage/time-attack-store.js';
import {createTimeAttackMemoryStore} from '../storage/time-attack-memory-store.js';
import {newTimeAttackStart,reserveTimeAttack,abandonTimeAttack,
  newAnonymousTimeAttack,makeTimeAttackLaunch,makeTimeAttackResult,flushTimeAttackPending} from '../net/time-attack.js';
import {t,getLanguage} from '../i18n/i18n.js';
import {timeAttackText,timeAttackTitle} from '../i18n/time-attack.js';
import {xShareForm} from './share.js';
import {randomSecret} from '../storage/store.js';

const txt=(key)=>timeAttackText(key,getLanguage());
function smallButton(text,onClick,primary=false){
 return h('button',{type:'button',class:'btn'+(primary?' btn-primary':''),onclick:onClick},text);
}
function badge(label,value){
 return h('div',{class:'ta-stat'},[h('span',{class:'ta-stat-label'},label),h('strong',{},value)]);
}
function currentName(app){
 const res=normalizeName(app.nameRaw);
 return res.ok?res:{ok:false,empty:true,name:''};
}
export async function startTimeAttack(app,rawName){
 if(app.timeAttackStarting||app.taController||app.startAttempt)return;
 app.timeAttackStarting=true;
 let store=null,reservation=null;
 try{
  const name=normalizeName(rawName);
  if(!name.ok){app.layer?.append(h('p',{class:'notice'},t('name.fixBeforeStart')));return;}
  try{store=await openTimeAttackStore();}
  catch{store=createTimeAttackMemoryStore();}
  const old=await store.get('runs','time-attack');
  if(old?.status==='active'){
   const replace=globalThis.confirm?.(txt('replaceRun'))??false;
   if(!replace){store.close();return;}
   await store.abandonOrphan();
  }
  // Formal ranked play requires server-issued seed and reservation.
  if(!name.empty && (!app.api.configured||store.memory)){
   const okay=globalThis.confirm?.(txt('unrankedQuestion'))??false;
   if(!okay){store.close();return;}
  }
  if(!name.empty && app.api.configured && !store.memory){
   const request=newTimeAttackStart(name.name,app.api,app.runtime.gameVersion);
   try{
    reservation=await reserveTimeAttack(app.api,store,request);
    if(generateTimeAttackCourse(reservation.seed).family!==reservation.family)throw Error('course_mismatch');
   }catch(e){
    // A failed ranked reservation must not silently turn into an anonymous ranked result.
    const playUnranked=globalThis.confirm?.(txt('unrankedQuestion'))??false;
    if(!playUnranked){store.close();return;}
    await abandonTimeAttack(app.api,store,reservation??request).catch(()=>{});
    reservation=null;
   }
  }
  const random=new Uint32Array(1);crypto.getRandomValues(random);
  const anon=reservation?null:newAnonymousTimeAttack(app.api,app.runtime.gameVersion,random[0],
    generateTimeAttackCourse(random[0]).family);
  const record=reservation??anon;
  const course=generateTimeAttackCourse(record.seed);
  const launch=makeTimeAttackLaunch(record);
  await runTimeAttack(app,store,course,launch);
 }catch(error){
  try{app.taController?.dispose();}catch{}
  store?.close();
  app.showHome();
  app.layer?.append(h('p',{class:'notice'},txt('startError')));
  console.warn('[time-attack] unable to launch',String(error?.message??error));
 }finally{
  app.timeAttackStarting=false;
 }
}
async function runTimeAttack(app,store,course,launch){
 const stageBox=h('div',{class:'stage ta-stage','data-testid':'ta-stage'});
 const cover=h('div',{class:'ta-overlay',hidden:true});
 const hudTime=badge(txt('time'),formatTime(0));
 const hudBuilding=badge(txt('building'),'1 / 30');
 const hudFamily=badge(txt('family'),txt(course.family));
 const hudMatch=badge(txt('color'),'0%');
 const hudLight=badge(txt('brightness'),'—');
 const holdFill=h('div',{class:'ta-hold-progress'});
 const pauseBtn=smallButton('Ⅱ',()=>pause('user'));
 pauseBtn.classList.add('ta-pause');
 const top=h('div',{class:'ta-hud'},[hudBuilding,hudTime,hudFamily,pauseBtn]);
 const hold=h('div',{class:'ta-hold-track'},holdFill);
 const stats=h('div',{class:'ta-match-stats'},[hudMatch,hudLight]);
 const controls=createControls({scrollSpeed:app.pcScrollSpeed,
  onChange:(value)=>input(value)});
 const screen=h('main',{class:'screen game ta-game'},[
  h('div',{class:'stage-wrap'},[stageBox,top,stats,hold,cover]),controls.el
 ]);
 app.mount(screen,null);
 const generation=app.screenGeneration;
 const current=()=>app.screenGeneration===generation&&app.taController?.id===generation;
 let disposed=false,raf=0,finishing=false,lastNow=null,fraction=0,stage=null;
 let state=createTimeAttackState(course);
 const events=[],visualCourse={seed:course.seed,targets:course.targets.map(()=>({h:0,s:0,v:3000}))};
 const owner=crypto.randomUUID?.()??String(Date.now())+'-'+Math.random();
 const stageRules={...RULES_V5,buildingCount:30,buildingMs:2000,brightnessUnlockBuilding:15};
 const controller={id:generation,dispose(){
  disposed=true;cancelAnimationFrame(raf);controls.destroy();
  document.removeEventListener('visibilitychange',onVisibility);
  stage?.dispose(); if(app.stage===stage)app.stage=null;
  store.close();app.taController=null;
 }};
 app.taController=controller;
 stage=await createStage(stageBox,{course:visualCourse,rules:stageRules,
  decorations:makeDecorations(course.seed),presentationEnabled:false});
 if(!current()){stage.dispose();return;}
 app.stage=stage;
 await store.begin(launch,owner);
 if(!current())return;
 if(store.memory && app.api.configured){
   void app.api.post('time-attack-launch',{launchId:launch.launchId,playId:null,ranked:false,
     family:launch.family,gameVersion:launch.gameVersion,modeId:MODE_ID}).catch(()=>{});
 } else void flushTimeAttackPending(app.api);
 // 時計を動かすのは最初の目標色の描画と操作を許可した後。
 function add(kind,extra={}){
  const event={seq:events.length,t:state.t,kind,...extra};
  const next=applyTimeAttackEvent(state,event,course);
  events.push(event);state=next;
  return next;
 }
 function advance(now){
  if(!current()||disposed||finishing)return;
  if(!['active','travel'].includes(state.phase)){lastNow=now;return;}
  if(lastNow===null){lastNow=now;return;}
  const delta=now-lastNow;lastNow=now;
  if(delta>1000 || delta<0){pause('stalled');return;}
  fraction+=delta;
  const step=Math.floor(fraction);
  if(step<=0)return;
  const before=state.t;
  state=applyTimeAttackEvent(state,{kind:'tick',t:state.t+step},course);
  fraction-=state.t-before;
  if(state.phase==='await_travel'){
   add('travel',{fromBuilding:state.building});
   fraction=0;lastNow=now;
  }else if(state.phase==='await_ready'){
   stage.setTimeAttackTarget?.(state.building+1,course.targets[state.building]);
   add('ready',{building:state.building+1});
   controls.setLocked(state.building<15);
   controls.setValues(state.color);
   fraction=0;lastNow=now;
  }else if(state.phase==='cleared'){
   fraction=0;
   void endGame('cleared');
  }
 }
 function draw(){
  if(!current()||disposed||finishing)return;
  const v=publicView(state,course);
  hudBuilding.lastChild.textContent=v.building+' / 30';
  hudTime.lastChild.textContent=formatTime(centiseconds(v.elapsedMs));
  hudMatch.lastChild.textContent=v.colorMatchUnits===null?'—':(v.colorMatchUnits/1000000).toFixed(1)+'%';
  hudLight.lastChild.textContent=v.brightnessMatchUnits===null?'—':(v.brightnessMatchUnits/1000000).toFixed(1)+'%';
  hudLight.hidden=!v.brightnessEnabled;
  holdFill.style.width=Math.min(100,v.holdMs/500*100)+'%';
  controls.setEnabled(v.phase==='active');
  const sceneTime=v.scenePosition*2000;
  stage.update({t:sceneTime,color:v.currentColor,policeStage:0,
   walking:v.phase==='travel',running:v.phase==='travel',
   presentation:{t:state.t,building:state.building,running:v.phase==='travel',
    moving:v.phase==='travel',hidden:document.hidden}});
 }
 function loop(now){
  if(!current()||disposed)return;
  if(document.hidden&&state.phase!=='paused')pause('hidden');
  else advance(now);
  draw();
  raf=requestAnimationFrame(loop);
 }
 function input(value){
  if(!current()||state.phase!=='active'||finishing)return;
  advance(performance.now());
  if(state.phase!=='active')return;
  try{add('input',value);}catch(e){console.warn('TA input rejected',e);}
  draw();
 }
 function onVisibility(){if(document.hidden)pause('hidden');}
 function pause(reason){
  if(!current()||finishing||state.phase==='paused'||['cleared','quit'].includes(state.phase))return;
  lastNow=null;fraction=0;
  if(state.phase!=='prepared')add('pause');
  controls.setEnabled(false);
  cover.hidden=false;
  cover.replaceChildren(
   h('h2',{},txt('paused')),
   smallButton(txt('resume'),()=>{
    if(state.phase==='paused')add('resume');
    else if(state.phase==='prepared'){stage.setTimeAttackTarget?.(1,course.targets[0]);add('ready',{building:1});}
    cover.hidden=true;cover.replaceChildren();lastNow=null;fraction=0;draw();
   },true),
   smallButton(txt('quit'),()=>void endGame('quit'))
  );
  draw();
 }
 async function endGame(reason){
  if(finishing||!current())return;
  finishing=true;cancelAnimationFrame(raf);
  controls.setEnabled(false);
  if(state.phase==='paused'&&reason==='quit')add('end',{reason:'quit',elapsedMs:state.elapsedMs,elapsedCs:centiseconds(state.elapsedMs)});
  else add('end',{reason,elapsedMs:state.elapsedMs,elapsedCs:centiseconds(state.elapsedMs)});
  let summary;
  const payload={format:HISTORY_FORMAT,modeId:MODE_ID,rulesVersion:RULES_VERSION,generatorVersion:COURSE_VERSION,
   seed:course.seed,family:course.family,events,end:{seq:events.length,t:state.t,kind:'end',
    reason,elapsedMs:state.elapsedMs,elapsedCs:centiseconds(state.elapsedMs)}};
  // add('end') already emitted; persist exactly one explicit terminal event.
  // Build the evidence sequence excluding the terminal event, with its original sequence id.
  payload.events=events.slice(0,-1);
  const end=events.at(-1);
  payload.end=end;
  try{summary=replayTimeAttack(payload);}catch(e){
   console.warn('TA local replay mismatch',e);summary={reason,buildings:state.clearedCount,
    elapsedMs:state.elapsedMs,elapsedCs:centiseconds(state.elapsedMs),titleId:null};
  }
  let result=null;
  if(reason==='cleared'){
   try{result=await makeTimeAttackResult(launch,payload,summary);}
   catch(error){result={playId:launch.playId??crypto.randomUUID(),ranked:false,
     elapsedCs:summary.elapsedCs,reason:'cleared',titleId:summary.titleId,state:'too_large',family:course.family};}
  }
  try{await store.finish(launch,owner,result);}catch(error){console.warn('TA finish save',error);}
  if(!current())return;
  showTimeAttackResult(app,summary,launch,course.family,result);
  if(result?.ranked)void flushTimeAttackPending(app.api);
 }
 document.addEventListener('visibilitychange',onVisibility);
 stage.setTimeAttackTarget?.(1,course.targets[0]);
 add('ready',{building:1});
 controls.layout();controls.setValues(state.color);controls.setLocked(true);
 controls.setEnabled(true);
 lastNow=null;
 raf=requestAnimationFrame(loop);
}
export function showTimeAttackResult(app,summary,launch,family,result){
 const cleared=summary.reason==='cleared';
 const content=h('div',{class:'ta-result-card'},[
  h('p',{class:'ta-kicker'},txt('mode')),
  h('h1',{},cleared?txt('clear'):txt('quit')),
  h('p',{class:'ta-result-time'},cleared?formatTime(summary.elapsedCs):'—'),
  h('p',{class:'ta-result-title'},cleared?timeAttackTitle(summary.elapsedCs,getLanguage()):txt('notCleared')),
  h('p',{class:'note'},txt(family)),
  h('p',{class:'note'},!launch.ranked?txt('anonymous'):txt('verifying'))
 ]);
 const actions=[smallButton(txt('again'),()=>void startTimeAttack(app,app.nameRaw),true),
  smallButton(txt('ranking'),()=>{globalThis.location.href='https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=chameleol&tab=time-attack';}),
  smallButton(t('common.home'),()=>app.showHome())];
 if(cleared){
  const text=[txt('shareMode'),txt('shareRecord')+': '+(getLanguage()==='ja'?formatTimeJa(summary.elapsedCs):formatTime(summary.elapsedCs)),'#カメレオる'].join('\n');
  actions.splice(2,0,xShareForm(text,'time-attack-share').el);
 }
 app.mount(h('main',{class:'screen ta-result'},[content,...actions]),null);
}
