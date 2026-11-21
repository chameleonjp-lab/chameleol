// Dedicated TA endpoint tests. Run with npm run test:sql against a disposable PostgreSQL database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {freshServer,SKIP} from './helpers.mjs';
import {uuid,sha256Hex} from '../../src/net/api.js';
import {randomSecret} from '../../src/storage/store.js';
import {generateTimeAttackCourse,createTimeAttackState,applyTimeAttackEvent,replayTimeAttack,
  MODE_ID,INSTANT_RULES_VERSION,CURRENT_RULES_VERSION,COURSE_VERSION,HISTORY_FORMAT,centiseconds} from '../../src/rules/time-attack/v1/index.js';

const version='0.1.0-ta.3';
function trace(seed,playId,launchId,rulesVersion=CURRENT_RULES_VERSION){
 const course=generateTimeAttackCourse(seed,rulesVersion),events=[];
 let s=createTimeAttackState(course),t=0;
 function send(kind,data={}){
  const e={kind,seq:events.length,t,...data};
  s=applyTimeAttackEvent(s,e,course);events.push(e);
 }
 send('ready',{building:1});
 for(let i=1;i<=course.targets.length;i++){
  send('input',course.targets[i-1]);
  t+=500;
  s=applyTimeAttackEvent(s,{kind:'tick',t},course);
  if(i<course.targets.length)send('ready',{building:i+1});
 }
 const end={seq:events.length,t,kind:'end',reason:'cleared',elapsedMs:s.elapsedMs,elapsedCs:centiseconds(s.elapsedMs)};
 const payload={modeId:MODE_ID,format:HISTORY_FORMAT,rulesVersion,generatorVersion:COURSE_VERSION,
  seed,family:course.family,events,end,playId,launchId,gameVersion:version};
 assert.equal(replayTimeAttack(payload).elapsedCs,course.targets.length*50);
 return payload;
}
async function reserve(srv,name='TA-Tester',rulesVersion=CURRENT_RULES_VERSION){
 const req={requestId:uuid(),launchId:uuid(),secret:randomSecret(),name,gameVersion:version,rulesVersion};
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
test('TA official 20-building replay, idempotent start/launch, stats and ranked entry', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_official');
 try{
  await srv.sql('update private.kamereoru_ta_config set accepting=true');
  const a=await reserve(srv,'白い怪盗');
  const duplicate=await srv.call('time-attack-start',{requestId:a.requestId,launchId:a.launchId,
   secret:a.secret,name:a.name,gameVersion:version,rulesVersion:CURRENT_RULES_VERSION});
  assert.equal(duplicate.body.playId,a.playId);
  const launchAgain=await srv.call('time-attack-launch',{launchId:a.launchId,modeId:MODE_ID,
    ranked:true,playId:a.playId,secret:a.secret,family:a.family,gameVersion:version});
  assert.equal(launchAgain.status,200);
  const payload=trace(a.seed,a.playId,a.launchId);
  const {resultId}=await submit(srv,a,payload);
  const duplicateResult=await srv.call('time-attack-complete',{playId:a.playId,resultId,secret:a.secret});
  assert.equal(duplicateResult.status,200);
  const [res]=await srv.sql('select status,elapsed_ms,elapsed_cs,buildings,reason,title_id from private.kamereoru_ta_results where play_id=$1',[a.playId]);
  assert.equal(res.status,'official');assert.equal(Number(res.elapsed_ms),10000);
  assert.equal(Number(res.elapsed_cs),1000);assert.equal(res.buildings,20);
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
  await srv.sql('update private.kamereoru_ta_config set accepting=true');
  const launchId=uuid(),payload={launchId,modeId:MODE_ID,ranked:false,
   playId:null,family:'all',gameVersion:version};
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

test('a retired 30-building receipt still verifies, while public ranking reads only 20-wall records', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_course_retirement');
 try{
  await srv.sql('update private.kamereoru_ta_config set accepting=true,rules_version=$1',[INSTANT_RULES_VERSION]);
  const old=await reserve(srv,'記録を残すテスト',INSTANT_RULES_VERSION);
  await srv.sql('update private.kamereoru_ta_config set rules_version=$1',[CURRENT_RULES_VERSION]);
  const duplicate=await srv.call('time-attack-start',old);
  assert.equal(duplicate.body.playId,old.playId);
  const retired=await srv.call('time-attack-start',{...old,requestId:uuid(),launchId:uuid()});
  assert.equal(retired.body.error,'course_retired');
  await submit(srv,old,trace(old.seed,old.playId,old.launchId,INSTANT_RULES_VERSION));
  const [saved]=await srv.sql('select status,buildings from private.kamereoru_ta_results where play_id=$1',[old.playId]);
  assert.deepEqual(saved,{status:'official',buildings:30});
  const hidden=await srv.call('time-attack-ranking?course=legacy',{}, {method:'GET'});
  assert.equal(hidden.status,422);
  const empty=await srv.call('time-attack-ranking',{}, {method:'GET'});
  assert.equal(empty.body.course,'all');
  assert.deepEqual(empty.body.rows,[]);
  const fresh=await reserve(srv,old.name);
  await submit(srv,fresh,trace(fresh.seed,fresh.playId,fresh.launchId));
  const listed=await srv.call('time-attack-ranking?course=all',{}, {method:'GET'});
  assert.deepEqual(listed.body.rows.map(row=>[row.name,row.elapsedCs,row.family]),[[old.name,1000,'all']]);
 }finally{await srv.close();}
});

test('the public leaderboard exposes an empty current board before the new schema is installed', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_course_rollout');
 try{
  await srv.sql('alter function private.kamereoru_ta_ranking_page(bigint,integer,integer,text) rename to ta_test_later_page');
  await srv.sql('alter function private.kamereoru_ta_stats(text) rename to ta_test_later_stats');
  await srv.sql('alter function private.kamereoru_ta_rank_of(text,text) rename to ta_test_later_rank');
  const page=await srv.call('time-attack-ranking?version=3&after=1',{}, {method:'GET'});
  assert.equal(page.status,200);
  assert.equal(page.body.course,'all');
  assert.deepEqual(page.body.rows,[]);
  assert.equal(page.body.restarted,true);
  const stats=await srv.call('time-attack-stats',{}, {method:'GET'});
  assert.equal(stats.status,200);
  assert.equal(stats.body.totalPlays,0);
  assert.equal(stats.body.participantCount,0);
  const result=await srv.call('time-attack-rank',{name:'旧コース'});
  assert.equal(result.status,200);
  assert.equal(result.body.rank,null);
 }finally{await srv.close();}
});
test('TA rejects forged result and wrong secret, allows owner to request one review', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_reject');
 try{
  await srv.sql('update private.kamereoru_ta_config set accepting=true');
  const a=await reserve(srv,'Tester');
  const payload=trace(a.seed,a.playId,a.launchId);
  payload.end.elapsedMs=9999;
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

test('TA accepts valid 20-grapheme Unicode names without a stricter SQL character cap', {skip:SKIP},async()=>{
 const srv=await freshServer('ta_unicode');
 try{
  await srv.sql('update private.kamereoru_ta_config set accepting=true');
  const name='👨‍👩‍👧‍👦'.repeat(20);
  assert.ok([...name].length>80);
  assert.ok(new TextEncoder().encode(name).length<=1000);
  const start=await reserve(srv,name);
  assert.equal(start.name,name);
 }finally{await srv.close();}
});
