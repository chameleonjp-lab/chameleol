// タイムアタック専用IndexedDB。旧版の通常outboxから参照・送信されない。
export const TIME_ATTACK_DB='kamereoru-time-attack';
const STORES=['starts','launches','outbox','records','runs','kv'];
const KEY={starts:'requestId',launches:'launchId',outbox:'playId',records:'playId',runs:'slot'};
function request(r){return new Promise((ok,fail)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});}
function completion(tx){return new Promise((ok,fail)=>{tx.oncomplete=ok;tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error??Error('aborted'));});}
export async function openTimeAttackStore({indexedDB=globalThis.indexedDB}={}){
 if(!indexedDB)throw Error('indexeddb_missing');
 const req=indexedDB.open(TIME_ATTACK_DB,1);
 req.onupgradeneeded=()=>{const db=req.result;for(const s of STORES){
  if(!db.objectStoreNames.contains(s))db.createObjectStore(s,KEY[s]?{keyPath:KEY[s]}:undefined);
 }};
 const db=await request(req);
 const obj={
  async getAll(name){return request(db.transaction([name]).objectStore(name).getAll());},
  async get(name,key){return request(db.transaction([name]).objectStore(name).get(key));},
  async put(name,item,key){const tx=db.transaction([name],'readwrite');
   tx.objectStore(name).put(item,...(key===undefined?[]:[key]));await completion(tx);},
  async remove(name,key){const tx=db.transaction([name],'readwrite');tx.objectStore(name).delete(key);await completion(tx);},
  // 同じプレイの開始は一度だけ。別タブの有効なTAを上書きしない。
  async begin(launch,owner){
   const tx=db.transaction(['runs','launches'],'readwrite'),runs=tx.objectStore('runs');
   const old=await request(runs.get('time-attack'));
   if(old?.status==='active'){tx.abort();throw Error('active_time_attack_exists');}
   tx.objectStore('launches').add({...launch,sent:false});
   runs.put({slot:'time-attack',status:'active',playId:launch.playId??launch.launchId,owner,createdAt:Date.now()});
   await completion(tx);
  },
  async finish(launch,owner,result=null){
   const tx=db.transaction(['runs','outbox','records'],'readwrite');
   const slot=await request(tx.objectStore('runs').get('time-attack'));
   if(!slot||slot.status!=='active'||slot.owner!==owner||
     slot.playId!==(launch.playId??launch.launchId)){tx.abort();throw Error('stale_time_attack_run');}
   if(result){
    if(result.ranked)tx.objectStore('outbox').put({...result,state:'pending',sent:false});
    else tx.objectStore('records').put({...result,state:'local'});
   }
   tx.objectStore('runs').put({...slot,status:'ended',endedAt:Date.now()});
   await completion(tx);
  },
  async abandonOrphan(){
   const tx=db.transaction(['runs'],'readwrite');const s=tx.objectStore('runs');
   const record=await request(s.get('time-attack'));
   if(record?.status==='active')s.put({...record,status:'abandoned',endedAt:Date.now()});
   await completion(tx);
  },
  close(){db.close();}
 };
 return obj;
}
