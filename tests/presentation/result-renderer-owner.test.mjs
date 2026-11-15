import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultRendererOwner } from '../../src/presentation/result-renderer-owner.js';
for(const asynchronous of [false,true])test(`portrait takes priority over a model whose creation is still pending (async=${asynchronous})`,async()=>{
 let createDone,creations=0,alive=0,maxAlive=0,retry;
 const make=()=>{alive++;maxAlive=Math.max(maxAlive,alive);return {};};
 const owner=createResultRendererOwner({createRenderer:()=>{creations++;return asynchronous&&creations===1?new Promise(r=>createDone=()=>r(make())):make();},destroyRenderer:()=>alive--});
 try{
  let revoked=0;
  const model=owner.acquire('model',{onRevoke:()=>{revoked++;retry=owner.acquire('model');}});
  const portrait=owner.acquire('portrait');
  if(asynchronous)createDone();
  assert.equal(await model,null,'superseded model request settles instead of holding the card');
  const lease=await Promise.race([portrait,new Promise(r=>setImmediate(()=>r(null)))]);
  assert.equal(lease?.owner,'portrait');assert.equal(revoked,1);assert.equal(creations,1);
  lease.release();const restarted=await retry;assert.equal(restarted.owner,'model');restarted.release();assert.equal(maxAlive,1);
 }finally{owner.dispose();}
 assert.equal(alive,0);
});
test('dispose resolves the requester immediately even when context creation has not finished',async()=>{
 let createDone;const owner=createResultRendererOwner({createRenderer:()=>new Promise(r=>createDone=r)});
 const pending=owner.acquire('portrait');owner.dispose();
 const observed=await Promise.race([pending,new Promise(r=>setImmediate(()=>r('still-pending')))]);
 createDone({});assert.equal(observed,null);
});
test('portrait preempts the model and never creates two rendering contexts at once',async()=>{
  let alive=0,max=0;const owner=createResultRendererOwner({createRenderer:()=>{alive++;max=Math.max(max,alive);return {};},destroyRenderer:()=>alive--});
  let revoked=0;const model=await owner.acquire('model',{onRevoke:()=>revoked++});
  const portrait=await owner.acquire('portrait');
  assert.equal(model.signal.aborted,true);assert.equal(revoked,1);assert.equal(max,1);
  portrait.release();portrait.release();owner.dispose();owner.dispose();assert.equal(alive,0);
});
test('a late asynchronous context is destroyed after abort and queued owners are released on disposal',async()=>{
  let resolve,disposed=0;const owner=createResultRendererOwner({createRenderer:()=>new Promise(r=>resolve=r),destroyRenderer:()=>disposed++});
  const abort=new AbortController();const first=owner.acquire('portrait',{signal:abort.signal});
  const next=owner.acquire('model');abort.abort();owner.dispose();resolve({});
  assert.equal(await first,null);assert.equal(await next,null);await new Promise(r=>setImmediate(r));assert.equal(disposed,1);
});
