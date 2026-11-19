import test from 'node:test';
import assert from 'node:assert/strict';
import { startPreparedResultShare } from '../../src/ui/share-card.js';
const prepared=()=>({revision:2,file:new File(['PNG'],'chameleol-result.png',{type:'image/png'})});
test('file checks and OS sharing occur synchronously in the tap and omit empty URLs',async()=>{
  for(const url of [null,'','https://example.invalid/game/']){
    const calls=[],p=prepared();let complete;
    const navigator={canShare:x=>(calls.push(['check',x]),true),share:x=>(calls.push(['share',x]),new Promise(r=>complete=r))};
    const promise=startPreparedResultShare({prepared:p,currentRevision:2,text:'result',url,navigator});
    assert.deepEqual(calls.map(x=>x[0]),['check','check','share']);
    assert.equal(calls[2][1],calls[1][1]);assert.equal(calls[2][1].files[0],p.file);
    assert.equal(Object.hasOwn(calls[2][1],'url'),!!url);
    complete();assert.equal(await promise,'shared');
  }
});
test('stale or unsupported images do not start a native share',()=>{
  let shares=0;const nav={canShare:()=>false,share:()=>shares++};
  assert.equal(startPreparedResultShare({prepared:prepared(),currentRevision:3,navigator:nav}),null);
  assert.equal(startPreparedResultShare({prepared:prepared(),currentRevision:2,navigator:nav}),null);assert.equal(shares,0);
  assert.equal(startPreparedResultShare({prepared:prepared(),currentRevision:2,navigator:{share:nav.share}}),null);
});
test('OS cancellations and failures are distinct and concurrent requests are rejected',async()=>{
  for(const [name,want] of [['AbortError','cancelled'],['DataError','failed']]){
    const nav={canShare:()=>true,share:()=>Promise.reject(Object.assign(new Error(),{name}))};
    assert.equal(await startPreparedResultShare({prepared:prepared(),currentRevision:2,navigator:nav}),want);
  }
  let done;const nav={canShare:()=>true,share:()=>new Promise(r=>done=r)};
  const first=startPreparedResultShare({prepared:prepared(),currentRevision:2,navigator:nav});
  assert.equal(startPreparedResultShare({prepared:prepared(),currentRevision:2,navigator:nav}),null);done();assert.equal(await first,'shared');
});
