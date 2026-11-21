// 同系色モード専用の受付。通常の starts/results/ranking 関数へ絶対に流さない。
// 内部DB接続からだけ非公開テーブルへアクセスし、公開時は最小限の表示値のみ返す。
import {normalizeName} from './shared/name.js';
import {MODE_ID,RULES_VERSION,COURSE_VERSION,HISTORY_FORMAT,timeAttackFamilyForSeed,InvalidTimeAttackHistoryError,
  replayTimeAttack} from './rules/time-attack/v1/index.js';
type DB={query(text:string,params?:unknown[]):Promise<any[]>};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET=/^[A-Za-z0-9_-]{43}$/;
const SHA=/^[a-f0-9]{64}$/;
const LIMITS={body:200*1024,chunk:160*1024,total:8*1024*1024};
function error(status:number,code:string,retryable=false){return Object.assign(new Error(code),{status,code,retryable});}
function ok(data:Record<string,unknown>,status=200){return new Response(JSON.stringify({ok:true,modeId:MODE_ID,...data}),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});}
async function sha(text:string){const bytes=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');}
function uuid(s:any){if(typeof s!=='string'||!UUID.test(s))throw error(422,'invalid_uuid');return s;}
function secret(s:any){if(typeof s!=='string'||!SECRET.test(s))throw error(422,'bad_secret');return s;}
function safeInt(n:any,min:number,max:number){if(!Number.isSafeInteger(n)||n<min||n>max)throw error(422,'invalid_number');return n;}
async function read(req:Request){
 const reported=Number(req.headers.get('content-length')??0);if(reported>LIMITS.body)throw error(413,'too_large');
 const text=await req.text();if(new TextEncoder().encode(text).length>LIMITS.body)throw error(413,'too_large');
 let b;try{b=JSON.parse(text);}catch{throw error(422,'invalid_json');}
 if(!b||typeof b!=='object'||Array.isArray(b))throw error(422,'invalid_body');return b;
}
function dbError(e:any):never{
 if(e?.code==='KM409')throw error(409,String(e.message).slice(0,80));
 if(e?.code==='KM422')throw error(422,String(e.message).slice(0,80));
 if(e?.code==='KM403')throw error(403,'forbidden');
 if(e?.code==='KM425')throw error(409,String(e.message).slice(0,80),true);
 if(e?.code==='KM503')throw error(503,'time_attack_not_enabled');
 throw error(503,'temporarily_unavailable',true);
}
export function createTimeAttackHandler({db,workerSecret='',ipSalt='',log=()=>{},waitUntil}:{
 db:DB,workerSecret?:string,ipSalt?:string,log?:(entry:Record<string,unknown>)=>void,
 waitUntil?:(p:Promise<any>)=>void
}){
 const call=async(text:string,params:unknown[]=[])=>{try{return await db.query(text,params);}catch(e){dbError(e);}};
 const task=(p:Promise<any>)=>{const safe=p.catch(e=>log({event:'ta_job_error',reason:String(e?.message??e).slice(0,120)}));waitUntil?.(safe);};
 async function throttle(req:Request,name:string,limit:number){
  const ip=req.headers.get('cf-connecting-ip')??req.headers.get('x-forwarded-for')?.split(',')[0]??'unknown';
  const h=await sha(ipSalt+'|'+ip);
  const b='ta:'+name+':'+h.slice(0,32);
  const rows=await call('select private.kamereoru_rate_hit($1,$2::interval,$3) as ok',[b,'10 minutes',limit]);
  if(rows[0]?.ok!==true)throw error(429,'rate_limited',true);
 }
 async function processJobs(limit=2){
  const began = performance.now();
  let processed=0;
  for (let i = 0; i < limit && performance.now() - began < 900; i++) {
   const [j] = await call('select * from private.kamereoru_ta_claim_jobs($1)', [1]);
   if (!j) break;
   let status='rejected',values:Record<string,unknown>={},verdict:Record<string,unknown>={reason:'invalid_replay'};
   try{
    const [r]=await call('select r.body, s.seed,s.family,s.play_id,s.launch_id,s.game_version,s.created_at,r.accepted_at from private.kamereoru_ta_results r join private.kamereoru_ta_starts s using(play_id) where r.play_id=$1',[j.play_id]);
    if(!r)throw Error('missing_input');
    const payload=r.body;
    if(payload?.seed!==Number(r.seed)||payload?.family!==r.family||payload?.playId!==r.play_id||
      payload?.launchId!==r.launch_id||payload?.gameVersion!==r.game_version||payload?.format!==HISTORY_FORMAT)throw Error('reservation_mismatch');
    const computed=replayTimeAttack(payload);
    const elapsedWall=Date.parse(r.accepted_at)-Date.parse(r.created_at);
    const neededWall=computed.elapsedMs+computed.executedTravelMs;
    if(Number.isFinite(elapsedWall)&&neededWall>elapsedWall+5000)throw Error('faster_than_wall_clock');
    status=computed.reason==='cleared'?'official':'no_rank';
    values={reason:computed.reason,buildings:computed.buildings,elapsedMs:computed.elapsedMs,
      elapsedCs:computed.elapsedCs,titleId:computed.titleId};
    verdict={reason:'verified'};
   }catch(e:any){
    if (e instanceof InvalidTimeAttackHistoryError) {
     verdict={reason:String(e.message).slice(0,100)};
    } else if (['reservation_mismatch', 'faster_than_wall_clock'].includes(e?.message)) {
     verdict={reason:e.message};
    } else {
     if (j.attempts < 3) continue;
     status = 'pending_review';
     verdict = {reason:'verifier_error'};
    }
   }
   try{await call('select private.kamereoru_ta_finalize($1,$2,$3,$4::text::jsonb,$5::text::jsonb) as r',[
    j.play_id,j.claim_token,status,JSON.stringify(values),JSON.stringify(verdict)]);
    processed++;
   }catch(e){log({event:'ta_finalize_retryable',reason:String((e as any)?.message??e).slice(0,80)});}
  }
  return {processed};
 }
 async function handle(req:Request,url:URL){
  const route=url.pathname.split('/').filter(Boolean).at(-1)??'';
  if(!route.startsWith('time-attack-'))return null;
  const json=(status:number,data:any)=>{const res=ok(data,status);return res;};
  try{
   if(route==='time-attack-start'&&req.method==='POST'){
    const b=await read(req);uuid(b.requestId);uuid(b.launchId);secret(b.secret);
    const n=normalizeName(b.name);
    const requested = b.supportedRulesVersions ?? [b.rulesVersion];
    if(!n.ok||n.empty||n.name!==b.name||!Array.isArray(requested)||requested.length!==1||requested[0]!==RULES_VERSION||!b.gameVersion)throw error(422,'bad_start');
    const existing=await call('select 1 from private.kamereoru_ta_starts where request_id=$1',[b.requestId]);
    if(!existing.length)await throttle(req,'start',30);
    const rand=new Uint32Array(1);crypto.getRandomValues(rand);const seed=rand[0];
    const family=timeAttackFamilyForSeed(seed);
    const rows=await call("select private.kamereoru_ta_start($1,$2,decode($3,'hex'),$4,$5,$6,$7,$8,$9) as r",[
      b.requestId,b.launchId,await sha(b.secret),n.name,n.key,RULES_VERSION,b.gameVersion,seed,family]);
    const r=rows[0]?.r;
    if(timeAttackFamilyForSeed(Number(r.seed))!==r.family)throw error(503,'seed_mismatch');
    return json(200,r);
   }
   if(route==='time-attack-abandon'&&req.method==='POST'){
    const b=await read(req);uuid(b.requestId);uuid(b.launchId);secret(b.secret);
    const rows=await call("select private.kamereoru_ta_abandon($1,$2,decode($3,'hex')) as r",[
      b.requestId,b.launchId,await sha(b.secret)]);
    return json(200,{status:rows[0].r});
   }
   if(route==='time-attack-launch'&&req.method==='POST'){
    const b=await read(req);uuid(b.launchId);if(b.modeId!==MODE_ID||typeof b.ranked!=='boolean')throw error(422,'bad_launch');
    if(!['red','green','blue'].includes(b.family)||!b.gameVersion)throw error(422,'bad_launch');
    if(b.ranked){uuid(b.playId);secret(b.secret);}else if(b.playId!=null)throw error(422,'anonymous_play_id');
    await throttle(req,'launch',300);
    const rows=await call("select private.kamereoru_ta_launch($1,$2,$3,decode($4,'hex'),$5,$6) as r",[
      b.launchId,b.ranked?b.playId:null,b.ranked,b.ranked?await sha(b.secret):null,b.family,b.gameVersion]);
    return json(200,rows[0].r);
   }
   if(route==='time-attack-chunk'&&req.method==='POST'){
    const b=await read(req);uuid(b.playId);uuid(b.resultId);secret(b.secret);
    safeInt(b.index,0,63);safeInt(b.total,1,64);safeInt(b.length,1,LIMITS.total);
    const chunk = b.chunk ?? b.data;
    if(typeof b.sha256!=='string'||!SHA.test(b.sha256)||typeof chunk!=='string'||
      new TextEncoder().encode(chunk).length>LIMITS.chunk||chunk.length===0)throw error(422,'bad_chunk');
    await throttle(req,'chunk',3000);
    const rows=await call("select private.kamereoru_ta_put_chunk($1,$2,decode($3,'hex'),$4,$5,$6,$7,$8) as r",[
      b.playId,b.resultId,await sha(b.secret),b.index,b.total,b.length,b.sha256,chunk]);
    return json(200,{...rows[0].r,playId:b.playId,resultId:b.resultId,index:b.index});
   }
   if(route==='time-attack-complete'&&req.method==='POST'){
    const b=await read(req);uuid(b.playId);uuid(b.resultId);secret(b.secret);
    const hash=await sha(b.secret);
    const [existing]=await call("select r.status from private.kamereoru_ta_results r join private.kamereoru_ta_result_claims c using(play_id) where r.play_id=$1 and r.result_id=$2 and c.secret_hash=decode($3,'hex')",[b.playId,b.resultId,hash]);
    if(existing)return json(200,{playId:b.playId,resultId:b.resultId,status:existing.status,duplicate:true});
    const [f]=await call("select c.sha256,c.total_length,c.chunk_count,coalesce(string_agg(u.chunk_text,'' order by u.chunk_index),'') as body, count(u.chunk_index)::integer as parts from private.kamereoru_ta_result_claims c left join private.kamereoru_ta_uploads u using(play_id) where c.play_id=$1 and c.result_id=$2 and c.secret_hash=decode($3,'hex') group by c.sha256,c.total_length,c.chunk_count",[
      b.playId,b.resultId,hash]);
    if(!f)throw error(403,'not_owner');
    if(Number(f.parts)!==Number(f.chunk_count))throw error(409,'chunks_missing',true);
    if(new TextEncoder().encode(f.body).length!==f.total_length||await sha(f.body)!==f.sha256)
      throw error(422,'body_integrity');
    const [r]=await call("select private.kamereoru_ta_accept($1,$2,decode($3,'hex')) as r",[
      b.playId,b.resultId,hash]);
    task(processJobs(2));
    return json(200,r.r);
   }
   if(route==='time-attack-status'&&req.method==='POST'){
    const b=await read(req);if(!Array.isArray(b.items)||b.items.length>50)throw error(422,'bad_items');
    await throttle(req,'status',600);
    const results=[];
    for(const i of b.items){
     uuid(i.playId);secret(i.secret);
     const rows=await call("select r.status,r.reason,r.elapsed_ms,r.elapsed_cs,r.title_id,r.family,r.review_requested from private.kamereoru_ta_results r join private.kamereoru_ta_starts s using(play_id) where r.play_id=$1 and s.secret_hash=decode($2,'hex')",[
       i.playId,await sha(i.secret)]);
     results.push({playId:i.playId,status:rows[0]?.status??'not_received',
      reason:rows[0]?.reason??null,elapsedMs:rows[0]?.elapsed_ms==null?null:Number(rows[0].elapsed_ms),
      elapsedCs:rows[0]?.elapsed_cs==null?null:Number(rows[0].elapsed_cs),reviewRequested:rows[0]?.review_requested===true,
      titleId:rows[0]?.title_id??null,family:rows[0]?.family??null});
    }
    task(processJobs(2));
    return json(200,{items:results});
   }
   if(route==='time-attack-review'&&req.method==='POST'){
    const b=await read(req);uuid(b.playId);secret(b.secret);
    await throttle(req,'status',600);
    const [r]=await call("select private.kamereoru_ta_review($1,decode($2,'hex')) as status",[
      b.playId,await sha(b.secret)]);
    return json(200,{status:r.status});
   }
   if(route==='time-attack-rank'&&req.method==='POST'){
    const b=await read(req),n=normalizeName(b.name);if(!n.ok||n.empty)return json(200,{rank:null});
    await throttle(req,'read',1200);
    const rows=await call('select private.kamereoru_ta_rank_of($1) as r',[n.key]);
    return json(200,rows[0].r);
   }
   if(route==='time-attack-stats'&&req.method==='GET'){
    await throttle(req,'read',1200);
    const rows=await call('select private.kamereoru_ta_stats() as r');
    return json(200,rows[0].r);
   }
   if(route==='time-attack-ranking'&&req.method==='GET'){
    await throttle(req,'read',1200);
    const v=url.searchParams.get('version'),a=url.searchParams.get('after'),l=url.searchParams.get('limit')??'100';
    if((v===null)!==(a===null)||!/^([0-9]{1,17})$/.test(l)||
      (v!==null&&!/^[0-9]{1,17}$/.test(v))||(a!==null&&!/^[0-9]{1,10}$/.test(a)))throw error(422,'bad_cursor');
    const limit=safeInt(Number(l),1,100);
    const rows=await call('select private.kamereoru_ta_ranking_page($1::bigint,$2::integer,$3::integer) as r',[
      v,a,limit]);
    const r=rows[0].r;
    return json(200,{...r,version:Number(r.version)});
   }
   if(route==='time-attack-process'&&req.method==='POST'){
    const input=req.headers.get('x-ta-worker-secret')??'';
    const token=req.headers.get('x-ta-worker-token')??'';
    let authorized = SECRET.test(workerSecret) && SECRET.test(input) && await sha(input) === await sha(workerSecret);
    if (!authorized && SHA.test(token)) {
      const rows = await call('select private.kamereoru_ta_worker_authorized($1) as authorized', [token]);
      authorized = rows[0]?.authorized === true;
    }
    if (!authorized) throw error(403,'forbidden');
    return json(200,await processJobs(5));
   }
   throw error(404,'not_found');
  }catch(e:any){
   const status=Number.isInteger(e?.status)?e.status:500;
   if(status>=500)log({event:'ta_error',route,reason:String(e?.message??e).slice(0,120)});
   const retryAfter = status===429 ? 600-(Math.floor(Date.now()/1000)%600) : null;
   const headers = new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
   if (retryAfter!==null) headers.set('retry-after', String(retryAfter));
   return new Response(JSON.stringify({ok:false,modeId:MODE_ID,error:e?.code??'internal_error',
    retryable:e?.retryable??status>=500,retryAfterMs:retryAfter===null?undefined:retryAfter*1000}),{status,headers});
  }
 }
 return {handle,processJobs};
}
