import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openTimeAttackStore,TIME_ATTACK_DB} from '../../src/storage/time-attack-store.js';
import {createTimeAttackMemoryStore} from '../../src/storage/time-attack-memory-store.js';

const run=async(store)=>{
 const launch={launchId:'launch-test',ranked:false,playId:null,seed:4,family:'red',gameVersion:'0.1.0-ta.1'};
 await store.begin(launch,'tab-a');
 const slot=await store.get('runs','time-attack');
 assert.equal(slot.status,'active');assert.equal(slot.playId,'launch-test');
 await assert.rejects(store.begin({...launch,launchId:'second'},'tab-b'),/active_time_attack_exists/);
 await assert.rejects(store.finish(launch,'tab-b'),/stale_time_attack_run/);
 const result={playId:'guest-result',resultId:'guest-1',ranked:false,elapsedCs:3591};
 await store.finish(launch,'tab-a',result);
 assert.equal((await store.get('records','guest-result')).elapsedCs,3591);
 assert.equal((await store.get('runs','time-attack')).status,'ended');
 await assert.rejects(store.finish(launch,'tab-a',result),/stale_time_attack_run/);
 await store.begin({...launch,launchId:'next'},'tab-b');
 assert.equal((await store.getAll('launches')).length,2);
 await store.abandonOrphan();
 assert.equal((await store.get('runs','time-attack')).status,'abandoned');
 store.close();
};
test('isolated IndexedDB stores one launch, guest result and guarded active run',async()=>{
 const indexedDB=new IDBFactory();
 const store=await openTimeAttackStore({indexedDB});
 assert.equal(TIME_ATTACK_DB,'kamereoru-time-attack');
 await run(store);
 const reopened=await openTimeAttackStore({indexedDB});
 assert.equal((await reopened.get('launches','launch-test')).launchId,'launch-test');
 assert.equal((await reopened.get('records','guest-result')).ranked,false);
 reopened.close();
});
test('memory fallback has the same run ownership and record contract',async()=>{
 await run(createTimeAttackMemoryStore());
});
