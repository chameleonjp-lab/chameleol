import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { GameSession } from '../../src/game/session.js';
import { RULES_V3 } from '../../src/rules/v1/index.js';
import { openStore } from '../../src/storage/store.js';
import { ApiError, sha256Hex } from '../../src/net/api.js';
import { makeOutboxItem, flushOutbox, chunkOf, CHUNK_CHARS } from '../../src/net/outbox.js';
let n=0;const fresh=()=>openStore({indexedDB:new IDBFactory(),name:`bonus-outbox-${++n}`});
function server(){
 const chunks=new Map();const completions=[];let fail=true;
 return {configured:true,chunks,completions,set retry(v){fail=v;},async post(path,b){
  if(path==='chunk'){chunks.set(b.index,b.data);return {ok:true};}
  completions.push({resultId:b.resultId,playId:b.playId});if(fail)throw new ApiError('network',{retryable:true});
  return {playId:b.playId,resultId:b.resultId,status:'verifying'};
 }};
}
for(const v of [1,2])test(`outbox_body_immutable_after_upgrade: v${v}`,async()=>{
 const fixture=JSON.parse(readFileSync(new URL(`../compat/fixtures/pre-bonus-v${v}.json`,import.meta.url)));
 const snapshot={meta:{...fixture.snapshots[0].meta,playId:`old-v${v}`},history:fixture.history};
 const item=await makeOutboxItem({snapshot,summary:fixture.summary,secret:'unchanged-secret',gameVersion:'old'});
 const immutable={body:item.body,bodySha:item.bodySha,resultId:item.resultId};const store=await fresh();const api=server();
 try{
  await store.put('outbox',{...item,state:'pending',createdAt:1});assert.equal((await flushOutbox({store,api})).retryable,1);
  const saved=await store.getOne('outbox',item.playId);for(const key of Object.keys(immutable))assert.equal(saved[key],immutable[key]);
  assert.equal('bonus' in JSON.parse(saved.body).claimed,false);api.retry=false;assert.equal((await flushOutbox({store,api})).accepted,1);
  const sent=[...api.chunks.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('');assert.equal(sent,item.body);assert.equal(await sha256Hex(sent),item.bodySha);assert.deepEqual(api.completions.map(x=>x.resultId),[item.resultId,item.resultId]);
  assert.deepEqual((await store.getOne('records',item.playId)).summary,fixture.summary);
 }finally{store.close();}
});
test('maximum_awards_fit_existing_transport_and_response_retry_does_not_duplicate',async()=>{
 const s=new GameSession({playId:'max-bonus',launchId:'launch',seed:17,rulesVersion:RULES_V3.rulesVersion});
 for(let i=0;i<50;i++)s.apply({type:'color',t:i*5000,...s.game.course.targets[i]});
 s.apply({type:'tick',t:250000});const summary=s.summary();assert.equal(summary.score.total,7280);assert.equal(summary.bonus.awards.length,156);
 const item=await makeOutboxItem({snapshot:s.snapshot(),summary,secret:'secret'});
 assert.ok(item.bodyLength<8*1024*1024);assert.ok(item.chunkTotal<=64);assert.equal(item.chunkTotal,Math.ceil(item.bodyLength/CHUNK_CHARS));
 assert.equal(Array.from({length:item.chunkTotal},(_,i)=>chunkOf(item,i)).join(''),item.body);
 const store=await fresh();const api=server();try{
  await store.put('outbox',{...item,state:'pending'});await flushOutbox({store,api});api.retry=false;await flushOutbox({store,api});await flushOutbox({store,api});
  assert.equal((await store.getAll('records')).length,1);assert.deepEqual((await store.getOne('records',item.playId)).summary,summary);assert.equal(api.completions.length,2);
 }finally{store.close();}
});
