// IndexedDBが使えない時だけの一時保存。再読み込みでは復元できないことを明示して使う。
const ITEMS=['starts','launches','outbox','records','runs','kv'];
const KEYS={starts:'requestId',launches:'launchId',outbox:'playId',records:'playId',runs:'slot'};
export function createTimeAttackMemoryStore(){
 const tables=new Map(ITEMS.map(n=>[n,new Map()]));
 const tbl=n=>{const x=tables.get(n);if(!x)throw Error('invalid_table');return x;};
 return {
  memory:true,
  async getAll(name){return [...tbl(name).values()].map(x=>structuredClone(x));},
  async get(name,key){const x=tbl(name).get(key);return x?structuredClone(x):undefined;},
  async put(name,item,key){tbl(name).set(key??item[KEYS[name]],structuredClone(item));},
  async remove(name,key){tbl(name).delete(key);},
  async begin(launch,owner){
   const runs=tbl('runs'),old=runs.get('time-attack');
   if(old?.status==='active')throw Error('active_time_attack_exists');
   if(tbl('launches').has(launch.launchId))throw Error('duplicate_launch');
   tbl('launches').set(launch.launchId,{...launch,sent:false});
   runs.set('time-attack',{slot:'time-attack',status:'active',playId:launch.playId??launch.launchId,owner});
  },
  async finish(launch,owner,result=null){
   const runs=tbl('runs'),row=runs.get('time-attack');
   if(!row||row.status!=='active'||row.owner!==owner||row.playId!==(launch.playId??launch.launchId))
    throw Error('stale_time_attack_run');
   if(result)tbl(result.ranked?'outbox':'records').set(result.playId,result);
   runs.set('time-attack',{...row,status:'ended'});
  },
  async abandonOrphan(){
   const r=tbl('runs').get('time-attack');if(r?.status==='active')
    tbl('runs').set('time-attack',{...r,status:'abandoned'});
  },
  close(){}
 };
}
