// Dedicated TA endpoint tests. Run with npm run test:sql against a disposable PostgreSQL database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {freshServer,SKIP} from './helpers.mjs';
import {uuid,sha256Hex} from '../../src/net/api.js';
import {randomSecret} from '../../src/storage/store.js';
import {generateTimeAttackCourse,createTimeAttackState,applyTimeAttackEvent,replayTimeAttack,
  MODE_ID,RULES_VERSION,COURSE_VERSION,HISTORY_FORMAT,centiseconds} from '../../src/rules/time-attack/v1/index.js';

const version='0.1.0-ta.1';
function trace(seed,playId,launchId,gameVersion=version){
 const course=generateTimeAttackCourse(seed),events=[];
 let s=createTimeAttackState(course),t=0;
 function send(kind,data={}){
  const e={kind,seq:events.length,t,...data};
  s=applyTimeAttackEvent(s,e,course);events.push(e);
 }
 send('ready',{building:1});
 for(let i=1;i<=30;i++){
  send('input',course.targets[i-1]);
  t+=500;
  s=applyTimeAttackEvent(s,{kind:'tick',t},course);
  if(i<30){
   send('travel',{fromBuilding:i});
   t+=2000;
   s=applyTimeAttackEvent(s,{kind:'tick',t},course);
   send('ready',{building:i+1});
  }
 }
 const end={seq:events.length,t,kind:'end',reason:'cleared',elapsedMs:s.elapsedMs,elapsedCs:centiseconds(s.elapsedMs)};
 const payload={modeId:MODE_ID,format:HISTORY_FORMAT,rulesVersion:RULES_VERSION,generatorVersion:COURSE_VERSION,
  seed,family:course.family,events,end,playId,launchId,gameVersion};
 assert.equal(replayTimeAttack(payload).elapsedCs,1500);
 return payload;
}
async function reserve(srv,name='TA-Tester'){
 const req={requestId:uuid(),launchId:uuid(),secret:randomSecret(),name,gameVersion:version,rulesVersion:RULES_VERSION};
 const started=await srv.call('time-attack-start',req);
 assert.equal(started.status,200,JSON.stringify(started.body));
 assert.equal(started.body.modeId,MODE_ID);
 const l=await srv.call('time-attack-launch',{launchId:req.launchId,modeId:MODE_ID,
   ranked:true,playId:started.body.playId,secret:req.secret,
   family:started.body.family,gameVersion:version});
 assert.equal(l.status,200,JSON.stringify(l.body));
 // The deterministic test completes instantly; move the reservation back in time for wall-clock validation.
 await srv.sql("update private.kamereoru_ta_starts set created_at=now()-interval '10 minutes' where request_id=$1",[req.requestId]);
 return {...req,playId:started.body.playId,seed:started.body.seed,family:started.body.family};
}
async function submit(srv,start,payload){
 const resultId=uuid(),text=JSON.stringify(payload),sha=await sha256Hex(text);
 const upload=await srv.call('time-attack-chunk',{playId:start.playId,resultId,secret:start.secret,
  index:0,total:1,length:new TextEncoder().encode(text).length,sha256:sha,data:text});
 assert.equal(upload.status,200,JSON.stringify(upload.body));
 const done=await srv.call('time-attack-complete',{playId:start.playId,resultId,secret:start.secret});
 assert.equal(done.status,200,JSON.stringify(done.body));
 await srv.settle();
 return {done,resultId};
}
test('TA official 30-building replay, idempotent start/launch, stats and ranked entry', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_official');
 try{
  await srv.sql('update private.kamereoru_ta_config set accepting=true');
  const a=await reserve(srv,'白い怪盗');
  const duplicate=await srv.call('time-attack-start',{requestId:a.requestId,launchId:a.launchId,
   secret:a.secret,name:a.name,gameVersion:version,rulesVersion:RULES_VERSION});
  assert.equal(duplicate.body.playId,a.playId);
  const launchAgain=await srv.call('time-attack-launch',{launchId:a.launchId,modeId:MODE_ID,
    ranked:true,playId:a.playId,secret:a.secret,family:a.family,gameVersion:version});
  assert.equal(launchAgain.status,200);
  const payload=trace(a.seed,a.playId,a.launchId);
  const {resultId}=await submit(srv,a,payload);
  const duplicateResult=await srv.call('time-attack-complete',{playId:a.playId,resultId,secret:a.secret});
  assert.equal(duplicateResult.status,200);
  const [res]=await srv.sql('select status,elapsed_ms,elapsed_cs,buildings,reason,title_id from private.kamereoru_ta_results where play_id=$1',[a.playId]);
  assert.equal(res.status,'official');assert.equal(Number(res.elapsed_ms),15000);
  assert.equal(Number(res.elapsed_cs),1500);assert.equal(res.buildings,30);
  assert.equal(res.title_id,'ta.title.01');
  const stats=await srv.call('time-attack-stats',{}, {method:'GET'});
  assert.equal(stats.body.totalPlays,1);assert.equal(stats.body.participantCount,1);
  const ranking=await srv.call('time-attack-ranking?limit=100',{}, {method:'GET'});
  assert.equal(ranking.body.rows.length,1);
  assert.equal(ranking.body.rows[0].rank,1);
  assert.equal(ranking.body.rows[0].name,'白い怪盗');
  const rank=await srv.call('time-attack-rank',{name:'白い怪盗'});
  assert.equal(rank.body.rank,1);
  const status=await srv.call('time-attack-status',{items:[{playId:a.playId,secret:a.secret}]});
  assert.equal(status.body.items[0].status,'official');
 }finally{await srv.close();}
});
test('TA anonymous launch counts once but never enters ranking, and stays independent of regular main', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_guest');
 try{
  const launchId=uuid(),payload={launchId,modeId:MODE_ID,ranked:false,
   playId:null,family:'green',gameVersion:version};
  assert.equal((await srv.call('time-attack-launch',payload)).status,200);
  assert.equal((await srv.call('time-attack-launch',payload)).status,200);
  const altered=await srv.call('time-attack-launch',{...payload,family:'red'});
  assert.equal(altered.status,409);
  const counts=await srv.call('time-attack-stats',{}, {method:'GET'});
  assert.deepEqual([counts.body.totalPlays,counts.body.participantCount],[1,0]);
  const standard=(await srv.sql('select count(*)::int as n from private.kamereoru_launches'))[0];
  assert.equal(standard.n,0);
 }finally{await srv.close();}
});
test('TA rejects forged result and wrong secret, allows owner to request one review', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_reject');
 try{
  await srv.sql('update private.kamereoru_ta_config set accepting=true');
  const a=await reserve(srv,'Tester');
  const payload=trace(a.seed,a.playId,a.launchId);
  payload.end.elapsedMs=14999;
  const resultId=uuid(),raw=JSON.stringify(payload),hash=await sha256Hex(raw);
  const rejectedChunk=await srv.call('time-attack-chunk',{playId:a.playId,resultId,secret:randomSecret(),
   index:0,total:1,length:raw.length,sha256:hash,data:raw});
  assert.equal(rejectedChunk.status,403);
  const uploaded=await srv.call('time-attack-chunk',{playId:a.playId,resultId,secret:a.secret,
   index:0,total:1,length:raw.length,sha256:hash,data:raw});
  assert.equal(uploaded.status,200);
  assert.equal((await srv.call('time-attack-complete',{playId:a.playId,resultId,secret:a.secret})).status,200);
  await srv.settle();
  const record=(await srv.sql('select status from private.kamereoru_ta_results where play_id=$1',[a.playId]))[0];
  assert.equal(record.status,'rejected');
  assert.equal((await srv.call('time-attack-review',{playId:a.playId,secret:randomSecret()})).status,403);
  const review=await srv.call('time-attack-review',{playId:a.playId,secret:a.secret});
  assert.equal(review.body.status,'under_review');
  assert.equal((await srv.call('time-attack-review',{playId:a.playId,secret:a.secret})).body.status,'under_review');
  const stats=await srv.call('time-attack-stats',{}, {method:'GET'});
  assert.equal(stats.body.totalPlays,1);
  assert.equal(stats.body.participantCount,0);
 }finally{await srv.close();}
});
