// タイムアタック専用送信。通常モードへ代替送信せず、開始/結果を固定IDで再送する。
import {uuid,sha256Hex} from './api.js';
import {randomSecret} from '../storage/store.js';
import {openTimeAttackStore} from '../storage/time-attack-store.js';
import {MODE_ID,RULES_VERSION,COURSE_VERSION,HISTORY_FORMAT} from '../rules/time-attack/v1/index.js';
export const TA_CLIENT_VERSION='0.1.0-ta.1';
const CHUNK_SIZE=120*1024;
const safe=(api,item)=>api.configured && item.destination===api.destination;
export function newTimeAttackStart(name,api,gameVersion){
 return {requestId:uuid(),launchId:uuid(),secret:randomSecret(),name,modeId:MODE_ID,
  gameVersion,rulesVersion:RULES_VERSION,destination:api.destination,createdAt:Date.now()};
}
export async function reserveTimeAttack(api,store,record){
 if(!safe(api,record))throw Error('time_attack_destination_unavailable');
 await store.put('starts',record);
 const data=await api.post('time-attack-start',{requestId:record.requestId,launchId:record.launchId,
   secret:record.secret,name:record.name,gameVersion:record.gameVersion,rulesVersion:RULES_VERSION});
 if(data.modeId!==MODE_ID||!Number.isSafeInteger(Number(data.seed))||data.family==null||
  data.rulesVersion!==RULES_VERSION||data.generatorVersion!==COURSE_VERSION||!data.playId)
  throw Error('time_attack_reservation_invalid');
 const next={...record,...data,seed:Number(data.seed),ranked:true};
 await store.put('starts',next);
 return next;
}
export async function abandonTimeAttack(api,store,record){
 await store.put('starts',{...record,abandoned:true});
 if(safe(api,record)){
  await api.post('time-attack-abandon',{requestId:record.requestId,launchId:record.launchId,secret:record.secret}).catch(()=>{});
 }
}
export function newAnonymousTimeAttack(api,gameVersion,seed,family){
 return {launchId:uuid(),playId:null,seed,family,name:'',secret:null,ranked:false,
  modeId:MODE_ID,gameVersion,destination:api.destination};
}
export function makeTimeAttackLaunch(record){
 return {launchId:record.launchId,playId:record.ranked?record.playId:null,
  seed:record.seed,family:record.family,gameVersion:record.gameVersion,
  ranked:record.ranked,secret:record.secret??null,destination:record.destination,
  modeId:MODE_ID,createdAt:Date.now()};
}
async function flushLaunch(api,store,item){
 if(!safe(api,item))return false;
 const data=await api.post('time-attack-launch',{
  launchId:item.launchId,playId:item.ranked?item.playId:null,ranked:item.ranked,
  secret:item.ranked?item.secret:null,gameVersion:item.gameVersion,
  family:item.family,modeId:MODE_ID});
 if(data.modeId!==MODE_ID||data.counted!==true)throw Error('launch_unconfirmed');
 await store.put('launches',{...item,sent:true});
 return true;
}
export async function makeTimeAttackResult(launch,payload,display){
 const body=JSON.stringify({...payload,playId:launch.playId,launchId:launch.launchId,gameVersion:launch.gameVersion});
 const length=new TextEncoder().encode(body).length;
 if(length>8*1024*1024||payload.events.length>200000)throw Error('history_too_large');
 const chunks=[];for(let i=0;i<body.length;i+=CHUNK_SIZE)chunks.push(body.slice(i,i+CHUNK_SIZE));
 if(chunks.length>64)throw Error('history_too_large');
 return {modeId:MODE_ID,playId:launch.playId??uuid(),launchId:launch.launchId,
  ranked:launch.ranked,secret:launch.secret,destination:launch.destination,
  name:launch.name??'',resultId:uuid(),gameVersion:launch.gameVersion,
  family:launch.family,body,bodySha:await sha256Hex(body),length,chunks,acked:[],
  elapsedCs:display.elapsedCs,reason:display.reason,titleId:display.titleId,
  createdAt:Date.now()};
}
async function flushResult(api,store,item){
 if(!safe(api,item)||!item.ranked)return false;
 for(let index=0;index<item.chunks.length;index++){
  if(item.acked.includes(index))continue;
  const data=await api.post('time-attack-chunk',{
   playId:item.playId,resultId:item.resultId,secret:item.secret,index,
   total:item.chunks.length,length:item.length,sha256:item.bodySha,data:item.chunks[index]});
  if(data.modeId!==MODE_ID||data.accepted!==index)throw Error('chunk_unconfirmed');
  item.acked.push(index);await store.put('outbox',item);
 }
 const receipt=await api.post('time-attack-complete',{
  playId:item.playId,resultId:item.resultId,secret:item.secret});
 if(receipt.modeId!==MODE_ID||receipt.playId!==item.playId)throw Error('complete_unconfirmed');
 await store.put('records',{...item,state:'verifying',body:null,chunks:[],verified:false});
 await store.remove('outbox',item.playId);
 return true;
}
// 呼出しは送信ごとに直列化する。同じ結果を二度送ってもサーバーのID制約で1件。
let active=null;
export function flushTimeAttackPending(api,{onUpdate=()=>{}}={}){
 if(active)return active;
 active=(async()=>{
  if(!api?.configured)return {launches:0,results:0};
  const store=await openTimeAttackStore();
  try{
   let launches=0,results=0;
   for(const launch of await store.getAll('launches')){
    if(launch.sent)continue;
    try{if(await flushLaunch(api,store,launch))launches++;}
    catch(e){onUpdate({kind:'launch',error:e,launch});}
   }
   for(const result of await store.getAll('outbox')){
    try{
     const launch=(await store.get('launches',result.launchId));
     if(!launch?.sent)continue;
     if(await flushResult(api,store,result))results++;
    }catch(e){onUpdate({kind:'result',error:e,result});}
   }
   for(const rec of await store.getAll('records')){
    if(!rec.ranked||rec.state==='official'||rec.state==='no_rank'||rec.state==='rejected')continue;
    try{
     const res=await api.post('time-attack-status',{items:[{playId:rec.playId,secret:rec.secret}]});
     if(res.modeId!==MODE_ID)continue;
     const status=res.items?.[0];
     if(status?.status && status.status!=='not_received'){
      await store.put('records',{...rec,state:status.status,serverElapsedCs:status.elapsedCs,
       verified:status.status==='official',titleId:status.titleId??rec.titleId});
      onUpdate({kind:'status',playId:rec.playId,status:status.status});
     }
    }catch(e){onUpdate({kind:'status',error:e});}
   }
   return {launches,results};
  }finally{store.close();}
 })().finally(()=>{active=null;});
 return active;
}
