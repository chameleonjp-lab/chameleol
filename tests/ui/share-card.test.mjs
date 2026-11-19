import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePreparedResult } from '../../src/ui/share-card.js';
const prepared=()=>({revision:2,file:new File(['PNG'],'chameleol-result.png',{type:'image/png'})});
test('file checks and OS sharing occur synchronously in the tap and omit empty URLs',async()=>{
  for(const url of [null,'','https://example.invalid/game/']){
    const calls=[],p=prepared();let complete;
    const navigator={canShare:x=>(calls.push(['check',x]),true),share:x=>(calls.push(['share',x]),new Promise(r=>complete=r))};
    const promise=sharePreparedResult({prepared:p,currentRevision:2,text:'result',url,navigator});
    assert.deepEqual(calls.map(x=>x[0]),['check','check','share']);
    assert.equal(calls[2][1],calls[1][1]);assert.equal(calls[2][1].files[0],p.file);
    assert.equal(Object.hasOwn(calls[2][1],'url'),!!url);
    complete();assert.equal(await promise,'shared');
  }
});
test('stale or unsupported image share never falls through to a text-only popup',async()=>{
  let shares=0;const nav={canShare:()=>false,share:()=>shares++};
  assert.equal(await sharePreparedResult({prepared:prepared(),currentRevision:3,navigator:nav}),'unavailable');
  assert.equal(await sharePreparedResult({prepared:prepared(),currentRevision:2,navigator:nav}),'unavailable');assert.equal(shares,0);
  assert.equal(await sharePreparedResult({prepared:prepared(),currentRevision:2,navigator:{share:nav.share}}),'unavailable');
});
test('OS cancellations and failures are distinct and concurrent requests are rejected',async()=>{
  for(const [name,want] of [['AbortError','cancelled'],['DataError','failed']]){
    const nav={canShare:()=>true,share:()=>Promise.reject(Object.assign(new Error(),{name}))};
    assert.equal(await sharePreparedResult({prepared:prepared(),currentRevision:2,navigator:nav}),want);
  }
  let done;const nav={canShare:()=>true,share:()=>new Promise(r=>done=r)};
  const first=sharePreparedResult({prepared:prepared(),currentRevision:2,navigator:nav});
  assert.equal(await sharePreparedResult({prepared:prepared(),currentRevision:2,navigator:nav}),'unavailable');done();assert.equal(await first,'shared');
});
