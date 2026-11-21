-- 同系色タイムアタック専用保存。通常モードと既存ランキング表に変更を加えない。
-- 初期状態では正式受付を無効。Edge Function・ゲーム・実験場の合格後に明示的に有効化する。
create schema if not exists private;
create table private.kamereoru_ta_config (
 id integer primary key default 1 check(id=1), accepting boolean not null default false,
 rules_version text not null default 'kamereoru-time-attack-rules-v1',
 created_at timestamptz not null default now()
);
insert into private.kamereoru_ta_config(id) values(1) on conflict(id) do nothing;

create table private.kamereoru_ta_starts (
 request_id uuid primary key, launch_id uuid not null unique, play_id uuid unique,
 secret_hash bytea not null, display_name text, name_key text, seed bigint, family text,
 rules_version text, game_version text, status text not null default 'reserved'
 check(status in ('reserved','launched','abandoned')),
 created_at timestamptz not null default now(),
 check (status='abandoned' or
  (play_id is not null and display_name is not null and name_key is not null and seed between 0 and 4294967295 and
   family in ('red','green','blue') and rules_version is not null and game_version is not null))
);
create table private.kamereoru_ta_launches (
 launch_id uuid primary key, play_id uuid unique references private.kamereoru_ta_starts(play_id),
 ranked boolean not null, family text not null check(family in ('red','green','blue')),
 game_version text not null, mode_id text not null default 'chameleol_time_attack'
   check(mode_id='chameleol_time_attack'), started_at timestamptz not null default now(),
 check ((ranked and play_id is not null) or (not ranked and play_id is null))
);
create table private.kamereoru_ta_result_claims (
 play_id uuid primary key references private.kamereoru_ta_starts(play_id),
 result_id uuid not null unique, secret_hash bytea not null,
 chunk_count integer not null check(chunk_count between 1 and 64),
 total_length integer not null check(total_length between 1 and 8388608),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
create table private.kamereoru_ta_uploads (
 play_id uuid not null references private.kamereoru_ta_result_claims(play_id),
 chunk_index integer not null check(chunk_index between 0 and 63),
 chunk_text text not null, primary key(play_id,chunk_index),
 check(octet_length(chunk_text) between 1 and 163840)
);
create table private.kamereoru_ta_results (
 play_id uuid primary key references private.kamereoru_ta_starts(play_id),
 result_id uuid not null unique, body jsonb not null,
 status text not null default 'verifying'
  check(status in ('verifying','official','no_rank','pending_review','under_review','rejected')),
 reason text, elapsed_ms bigint check(elapsed_ms>=0), elapsed_cs bigint check(elapsed_cs>=0),
 family text check(family in ('red','green','blue')), buildings integer check(buildings between 0 and 30),
 display_name text, name_key text, title_id text,
 accepted_at timestamptz not null default now(), official_at timestamptz,
 verdict jsonb not null default '{}'::jsonb,
 review_requested boolean not null default false
);
create table private.kamereoru_ta_jobs (
 play_id uuid primary key references private.kamereoru_ta_results(play_id),
 attempts integer not null default 0, lease_until timestamptz,
 claim_token uuid, status text not null default 'pending'
  check(status in ('pending','claimed','finished')),
 created_at timestamptz not null default now()
);
create table private.kamereoru_ta_audit (
 id bigint generated always as identity primary key, play_id uuid,
 event text not null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table private.kamereoru_ta_ranking_versions (
 version bigint generated always as identity primary key,
 created_at timestamptz not null default now(), row_count integer not null default 0
);
create table private.kamereoru_ta_ranking_rows (
 version bigint not null references private.kamereoru_ta_ranking_versions(version),
 position integer not null check(position>=1), rank integer not null check(rank>=1),
 name_key text not null, display_name text not null,
 play_id uuid not null, elapsed_cs bigint not null, family text not null,
 title_id text, official_at timestamptz not null,
 primary key(version,position), unique(version,name_key)
);
create index kamereoru_ta_result_status on private.kamereoru_ta_results(status,elapsed_cs);
create index kamereoru_ta_job_pending on private.kamereoru_ta_jobs(lease_until) where status<>'finished';
create index kamereoru_ta_ranking_position on private.kamereoru_ta_ranking_rows(version,rank,position);

-- named earliest best: same score retains earlier official acceptance.
create view private.kamereoru_ta_bests with (security_invoker=true) as
 select distinct on (name_key) play_id,name_key,display_name,elapsed_cs,family,title_id,official_at
 from private.kamereoru_ta_results
 where status='official' and reason='cleared' and buildings=30 and name_key is not null
 order by name_key,elapsed_cs asc,official_at asc,play_id asc;

-- A new confirmed score creates an immutable ranking page version, serialized per mode.
create function private.kamereoru_ta_rebuild_ranking() returns bigint
language plpgsql security definer set search_path='' as $$
declare v bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(592040817);
 insert into private.kamereoru_ta_ranking_versions(row_count)
 select count(*) from private.kamereoru_ta_bests returning version into v;
 insert into private.kamereoru_ta_ranking_rows
 (version,position,rank,name_key,display_name,play_id,elapsed_cs,family,title_id,official_at)
 select v, row_number() over(order by elapsed_cs,official_at,play_id)::int,
  rank() over(order by elapsed_cs)::int,
  name_key,display_name,play_id,elapsed_cs,family,title_id,official_at
 from private.kamereoru_ta_bests;
 return v;
end $$;

create function private.kamereoru_ta_start(
 p_request uuid,p_launch uuid,p_hash bytea,p_name text,p_key text,
 p_rules text,p_game_version text,p_seed bigint,p_family text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_starts%rowtype; v_seed bigint; v_play uuid;
begin
 if p_name is null or length(p_name)>80 or p_name<>p_key or p_hash is null or
    p_rules<>'kamereoru-time-attack-rules-v1' then
  raise exception using errcode='KM422',message='bad_start';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 select * into r from private.kamereoru_ta_starts where request_id=p_request;
 if found then
  if r.status='abandoned' then raise exception using errcode='KM409',message='start_abandoned'; end if;
  if r.launch_id<>p_launch or r.secret_hash<>p_hash or r.display_name<>p_name or
      r.rules_version<>p_rules or r.game_version<>p_game_version then
   raise exception using errcode='KM409',message='start_conflict'; end if;
  return pg_catalog.jsonb_build_object('playId',r.play_id,'seed',r.seed,'family',r.family,
    'rulesVersion',r.rules_version,'generatorVersion','kamereoru-time-attack-course-v1',
    'acceptedAt',r.created_at,'expiresAt',null);
 end if;
 if not (select accepting from private.kamereoru_ta_config where id=1) then
  raise exception using errcode='KM503',message='time_attack_not_enabled';end if;
 if exists(select 1 from private.kamereoru_ta_starts where launch_id=p_launch) then
   raise exception using errcode='KM409',message='launch_collision';end if;
 if p_seed<0 or p_seed>4294967295 or p_family not in ('red','green','blue') then
   raise exception using errcode='KM422',message='bad_seed';end if;
 v_seed:=p_seed;
 v_play:=pg_catalog.gen_random_uuid();
 insert into private.kamereoru_ta_starts
 (request_id,launch_id,play_id,secret_hash,display_name,name_key,seed,family,rules_version,game_version)
 values(p_request,p_launch,v_play,p_hash,p_name,p_key,v_seed,p_family,
  p_rules,p_game_version) returning * into r;
 return pg_catalog.jsonb_build_object('playId',r.play_id,'seed',r.seed,'family',r.family,
  'rulesVersion',r.rules_version,'generatorVersion','kamereoru-time-attack-course-v1',
  'acceptedAt',r.created_at,'expiresAt',null);
end $$;

create function private.kamereoru_ta_abandon(
 p_request uuid,p_launch uuid,p_hash bytea
) returns text language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_starts%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 select * into r from private.kamereoru_ta_starts where request_id=p_request for update;
 if found then
  if r.secret_hash<>p_hash or r.launch_id<>p_launch then
   raise exception using errcode='KM409',message='abandon_conflict'; end if;
  if r.status='launched' then return 'launched'; end if;
  update private.kamereoru_ta_starts set status='abandoned' where request_id=p_request;
 else
  insert into private.kamereoru_ta_starts
   (request_id,launch_id,secret_hash,status) values(p_request,p_launch,p_hash,'abandoned');
 end if;
 return 'abandoned';
end $$;

create function private.kamereoru_ta_launch(
 p_launch uuid,p_play uuid,p_ranked boolean,p_hash bytea,
 p_family text,p_game_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_launches%rowtype; st private.kamereoru_ta_starts%rowtype;
begin
 if p_family not in ('red','green','blue') or p_game_version is null then
  raise exception using errcode='KM422',message='bad_launch'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_launch::text,0));
 select * into r from private.kamereoru_ta_launches where launch_id=p_launch;
 if found then
  if r.play_id is distinct from p_play or r.ranked<>p_ranked or r.family<>p_family or
   r.game_version<>p_game_version then raise exception using errcode='KM409',message='launch_conflict';end if;
  return pg_catalog.jsonb_build_object('launchId',p_launch,'counted',true);
 end if;
 if p_ranked then
  select * into st from private.kamereoru_ta_starts where play_id=p_play for update;
  if not found or st.status='abandoned' or st.launch_id<>p_launch or st.secret_hash<>p_hash or
    st.family<>p_family or st.game_version<>p_game_version then
    raise exception using errcode='KM403',message='unregistered_start'; end if;
  update private.kamereoru_ta_starts set status='launched' where play_id=p_play;
 else
  if p_play is not null then raise exception using errcode='KM422',message='anonymous_with_play_id';end if;
 end if;
 insert into private.kamereoru_ta_launches(launch_id,play_id,ranked,family,game_version)
 values(p_launch,p_play,p_ranked,p_family,p_game_version);
 return pg_catalog.jsonb_build_object('launchId',p_launch,'counted',true);
end $$;

create function private.kamereoru_ta_put_chunk(
 p_play uuid,p_result uuid,p_hash bytea,p_index integer,p_total integer,
 p_length integer,p_sha text,p_chunk text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cl private.kamereoru_ta_result_claims%rowtype; old text;
begin
 if p_index<0 or p_index>=p_total or p_total<1 or p_total>64 or
 p_length<1 or p_length>8388608 or length(p_sha)<>64 or
 p_chunk is null or octet_length(p_chunk)<1 or octet_length(p_chunk)>163840 then
  raise exception using errcode='KM422',message='chunk_shape';end if;
 if not exists(select 1 from private.kamereoru_ta_starts s
   join private.kamereoru_ta_launches l on l.play_id=s.play_id
   where s.play_id=p_play and s.secret_hash=p_hash and s.status='launched') then
  raise exception using errcode='KM403',message='not_owner';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_play::text,0));
 insert into private.kamereoru_ta_result_claims(play_id,result_id,secret_hash,chunk_count,total_length,sha256)
 values(p_play,p_result,p_hash,p_total,p_length,p_sha) on conflict(play_id) do nothing;
 select * into cl from private.kamereoru_ta_result_claims where play_id=p_play;
 if cl.result_id<>p_result or cl.secret_hash<>p_hash or cl.chunk_count<>p_total or
 cl.total_length<>p_length or cl.sha256<>p_sha then
  raise exception using errcode='KM409',message='result_claim_conflict';end if;
 select chunk_text into old from private.kamereoru_ta_uploads where play_id=p_play and chunk_index=p_index;
 if found and old<>p_chunk then raise exception using errcode='KM409',message='chunk_conflict';end if;
 insert into private.kamereoru_ta_uploads(play_id,chunk_index,chunk_text)
 values(p_play,p_index,p_chunk) on conflict(play_id,chunk_index) do nothing;
 return pg_catalog.jsonb_build_object('accepted',p_index);
end $$;

create function private.kamereoru_ta_accept(
 p_play uuid,p_result uuid,p_hash bytea
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cl private.kamereoru_ta_result_claims%rowtype; bodytext text; rv jsonb; st private.kamereoru_ta_starts%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_play::text,0));
 select * into cl from private.kamereoru_ta_result_claims where play_id=p_play;
 if not found or cl.result_id<>p_result or cl.secret_hash<>p_hash then
  raise exception using errcode='KM403',message='not_owner';end if;
 if exists(select 1 from private.kamereoru_ta_results where play_id=p_play) then
  return pg_catalog.jsonb_build_object('status','verifying','playId',p_play,'resultId',p_result);
 end if;
 select string_agg(u.chunk_text,'' order by u.chunk_index) into bodytext
 from private.kamereoru_ta_uploads u where u.play_id=p_play;
 if (select count(*) from private.kamereoru_ta_uploads where play_id=p_play)<>cl.chunk_count or
    bodytext is null or octet_length(bodytext)<>cl.total_length then
  raise exception using errcode='KM425',message='chunks_missing';end if;
 select * into st from private.kamereoru_ta_starts where play_id=p_play;
 if not exists(select 1 from private.kamereoru_ta_launches where play_id=p_play and ranked=true) then
  raise exception using errcode='KM425',message='launch_required';end if;
 -- sha256 is checked in the trusted Edge Function before this database function is called.
 begin
  rv:=bodytext::jsonb;
 exception when others then raise exception using errcode='KM422',message='invalid_body';end;
 insert into private.kamereoru_ta_results
 (play_id,result_id,body,status,display_name,name_key,family)
 values(p_play,p_result,rv,'verifying',st.display_name,st.name_key,st.family);
 insert into private.kamereoru_ta_jobs(play_id) values(p_play);
 return pg_catalog.jsonb_build_object('status','verifying','playId',p_play,'resultId',p_result);
end $$;

create function private.kamereoru_ta_claim_jobs(p_limit integer)
returns table(play_id uuid,claim_token uuid,attempts integer)
language sql security definer set search_path='' as $$
 with candidates as (
  select j.play_id from private.kamereoru_ta_jobs j
   where j.status<>'finished' and (j.lease_until is null or j.lease_until<now())
   order by j.created_at for update skip locked limit least(greatest(p_limit,0),5)
 ), updated as (
  update private.kamereoru_ta_jobs j set status='claimed',
   attempts=j.attempts+1,claim_token=pg_catalog.gen_random_uuid(),
   lease_until=now()+interval '60 seconds'
  from candidates c where j.play_id=c.play_id
  returning j.play_id,j.claim_token,j.attempts
 ) select * from updated
$$;

create function private.kamereoru_ta_finalize(
 p_play uuid,p_token uuid,p_status text,p_values jsonb,p_verdict jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.kamereoru_ta_jobs%rowtype; version bigint; result_status text;
begin
 select * into j from private.kamereoru_ta_jobs where play_id=p_play for update;
 if not found or j.claim_token is distinct from p_token or j.status<>'claimed' or
   j.lease_until<now() then raise exception using errcode='KM409',message='job_lease_lost';end if;
 if p_status not in ('official','no_rank','rejected','pending_review') then
  raise exception using errcode='KM422',message='bad_status'; end if;
 if p_status='official' and (p_values->>'reason'<>'cleared' or
   (p_values->>'buildings')::integer<>30 or (p_values->>'elapsedMs')::bigint<15000) then
  raise exception using errcode='KM422',message='invalid_official';end if;
 update private.kamereoru_ta_results set
  status=p_status,reason=p_values->>'reason',
  buildings=(p_values->>'buildings')::integer,
  elapsed_ms=(p_values->>'elapsedMs')::bigint,
  elapsed_cs=(p_values->>'elapsedCs')::bigint,
  title_id=p_values->>'titleId',verdict=p_verdict,
  official_at=case when p_status='official' then now() else null end
 where play_id=p_play;
 update private.kamereoru_ta_jobs set status='finished',claim_token=null,lease_until=null where play_id=p_play;
 insert into private.kamereoru_ta_audit(play_id,event,detail)
 values(p_play,p_status,pg_catalog.jsonb_build_object('reason',coalesce(p_verdict->>'reason','unknown')));
 if p_status='official' then version:=private.kamereoru_ta_rebuild_ranking();end if;
 return pg_catalog.jsonb_build_object('status',p_status,'version',version);
end $$;

create function private.kamereoru_ta_ranking_page(p_version bigint,p_after integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v bigint; n integer; rows jsonb; next_after integer; oldest timestamptz;
begin
 if p_limit<1 or p_limit>100 or p_after<0 then raise exception using errcode='KM422',message='bad_paging';end if;
 select max(version) into v from private.kamereoru_ta_ranking_versions;
 if v is null then v:=private.kamereoru_ta_rebuild_ranking();end if;
 if p_version is not null and p_version<>v then
  select created_at into oldest from private.kamereoru_ta_ranking_versions where version=p_version;
  if oldest is not null and oldest>=now()-interval '24 hours' then v:=p_version; end if;
 end if;
 select row_count into n from private.kamereoru_ta_ranking_versions where version=v;
 with slice as (select position,rank,display_name as name,elapsed_cs as "elapsedCs",
    family,title_id as "titleId",official_at as "officialAt"
    from private.kamereoru_ta_ranking_rows
    where version=v and position>case when p_version is null or p_version=v then coalesce(p_after,0) else 0 end
    order by position limit p_limit+1)
 select coalesce(jsonb_agg(to_jsonb(slice) order by position),'[]'::jsonb) into rows from slice;
 if jsonb_array_length(rows)>p_limit then
  select (x->>'position')::integer into next_after
    from jsonb_array_elements(rows) with ordinality t(x,ord)
    where ord=p_limit;
  select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) into rows
   from jsonb_array_elements(rows) with ordinality t(x,ord) where ord<=p_limit;
 end if;
 return pg_catalog.jsonb_build_object('version',v,'rows',rows,'nextAfter',next_after,
 'nameCount',coalesce(n,0),'restarted',p_version is not null and p_version<>v);
end $$;

-- Optional rank query is by normalized name, not by authentication identity.
create function private.kamereoru_ta_rank_of(p_name text)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce((
  select pg_catalog.jsonb_build_object('rank',rank,'elapsedCs',elapsed_cs)
   from private.kamereoru_ta_ranking_rows
   where version=(select max(version) from private.kamereoru_ta_ranking_versions)
    and name_key=p_name limit 1
 ),'{"rank":null}'::jsonb)
$$;
create function private.kamereoru_ta_stats()
returns jsonb language sql security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('totalPlays',(select count(*) from private.kamereoru_ta_launches),
  'participantCount',(select count(*) from private.kamereoru_ta_bests))
$$;

-- No direct Data API access. Edge connects with SUPABASE_DB_URL.
do $$
declare r record;
begin
 for r in select table_name from information_schema.tables
   where table_schema='private' and table_type='BASE TABLE' and table_name like 'kamereoru_ta_%' loop
  execute format('alter table private.%I enable row level security',r.table_name);
  execute format('revoke all on table private.%I from public, anon, authenticated',r.table_name);
 end loop;
 for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname like 'kamereoru_ta_%' loop
  execute format('revoke all on function %s from public, anon, authenticated',r.f);
 end loop;
 revoke all on private.kamereoru_ta_bests from public,anon,authenticated;
end $$;
