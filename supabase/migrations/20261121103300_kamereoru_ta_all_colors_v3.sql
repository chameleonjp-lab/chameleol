-- Reuse existing play IDs and preserve older rankings while opening the 20-wall course.
alter table private.kamereoru_ta_config alter column rules_version set default 'kamereoru-time-attack-rules-v3';
update private.kamereoru_ta_config set rules_version = 'kamereoru-time-attack-rules-v3'
 where id=1 and rules_version='kamereoru-time-attack-rules-v2';

alter table private.kamereoru_ta_starts
 drop constraint kamereoru_ta_starts_check,
 add constraint kamereoru_ta_starts_check check (status='abandoned' or (
  play_id is not null and display_name is not null and name_key is not null and seed between 0 and 4294967295 and
  ((rules_version='kamereoru-time-attack-rules-v3' and family='all') or
    (rules_version in ('kamereoru-time-attack-rules-v1','kamereoru-time-attack-rules-v2') and family in ('red','green','blue')))
  and rules_version is not null and game_version is not null and family is not null));
alter table private.kamereoru_ta_launches
 drop constraint kamereoru_ta_launches_family_check,
 add constraint kamereoru_ta_launches_family_check check(family in ('red','green','blue','all'));
alter table private.kamereoru_ta_results
 drop constraint kamereoru_ta_results_family_check,
 add constraint kamereoru_ta_results_family_check check(family in ('red','green','blue','all')),
 drop constraint kamereoru_ta_official_result_complete,
 add constraint kamereoru_ta_official_result_complete check (
  status <> 'official' or coalesce(
   reason='cleared' and buildings=case when family='all' then 20 else 30 end and
   elapsed_ms between (buildings*500) and 9007199254682991 and
   elapsed_cs=(elapsed_ms+9)/10 and official_at is not null, false)
 ) not valid;
alter table private.kamereoru_ta_ranking_versions
 add column course text not null default 'legacy' check(course in ('legacy','all'));
create index kamereoru_ta_ranking_course_version on private.kamereoru_ta_ranking_versions(course,version);

create or replace view private.kamereoru_ta_bests with (security_invoker=true) as
 select distinct on (name_key, (family='all'))
  play_id,name_key,display_name,elapsed_cs,family,title_id,official_at,
  case when family='all' then 'all' else 'legacy' end as course
 from private.kamereoru_ta_results
 where status='official' and reason='cleared' and buildings=case when family='all' then 20 else 30 end
  and name_key is not null
 order by name_key,(family='all'),elapsed_cs,official_at,play_id;

create or replace function private.kamereoru_ta_start(
 p_request uuid,p_launch uuid,p_hash bytea,p_name text,p_key text,
 p_rules text,p_game_version text,p_seed bigint,p_family text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_starts%rowtype; v_seed bigint; v_play uuid;
begin
 if p_name is null or pg_catalog.octet_length(p_name)>1000 or p_name<>p_key or p_hash is null or
    p_rules is null or p_rules not in ('kamereoru-time-attack-rules-v1','kamereoru-time-attack-rules-v2','kamereoru-time-attack-rules-v3') then
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
 if p_rules<>'kamereoru-time-attack-rules-v3' and (
  select rules_version='kamereoru-time-attack-rules-v3' from private.kamereoru_ta_config where id=1
 ) then raise exception using errcode='KM409',message='course_retired'; end if;
 if exists(select 1 from private.kamereoru_ta_starts where launch_id=p_launch) then
   raise exception using errcode='KM409',message='launch_collision';end if;
 if p_seed<0 or p_seed>4294967295 or p_family is null or
    (p_rules='kamereoru-time-attack-rules-v3' and p_family<>'all') or
    (p_rules<>'kamereoru-time-attack-rules-v3' and p_family not in ('red','green','blue')) then
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

create or replace function private.kamereoru_ta_launch(
 p_launch uuid,p_play uuid,p_ranked boolean,p_hash bytea,
 p_family text,p_game_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_launches%rowtype; st private.kamereoru_ta_starts%rowtype;
begin
 if p_family is null or p_family not in ('red','green','blue','all') or p_game_version is null then
  raise exception using errcode='KM422',message='bad_launch'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_launch::text,0));
 if p_ranked then
  select * into st from private.kamereoru_ta_starts where play_id=p_play for update;
  if not found or st.status='abandoned' or st.launch_id is distinct from p_launch
    or st.secret_hash is distinct from p_hash or st.family is distinct from p_family
    or st.game_version is distinct from p_game_version then
   raise exception using errcode='KM403',message='unregistered_start';
  end if;
 elsif p_play is not null or p_hash is not null then
  raise exception using errcode='KM422',message='anonymous_with_play_id';
 end if;
 select * into r from private.kamereoru_ta_launches where launch_id=p_launch;
 if found then
  if r.play_id is distinct from p_play or r.ranked<>p_ranked or r.family<>p_family or
   r.game_version<>p_game_version then raise exception using errcode='KM409',message='launch_conflict';end if;
  return pg_catalog.jsonb_build_object('launchId',p_launch,'counted',true);
 end if;
 -- Before the first release, guests cannot create a count. Once opened,
 -- disabling new ranked reservations must not drop queued anonymous launches.
 if not p_ranked and not (select guest_launches_opened from private.kamereoru_ta_config where id=1) then
  raise exception using errcode='KM503',message='time_attack_not_enabled';
 end if;
 if p_ranked then
  update private.kamereoru_ta_starts set status='launched' where play_id=p_play;
 end if;
 insert into private.kamereoru_ta_launches(launch_id,play_id,ranked,family,game_version)
 values(p_launch,p_play,p_ranked,p_family,p_game_version);
 return pg_catalog.jsonb_build_object('launchId',p_launch,'counted',true);
end $$;

create or replace function private.kamereoru_ta_rebuild_ranking(p_course text) returns bigint
language plpgsql security definer set search_path='' as $$
declare v bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(592040817);
 insert into private.kamereoru_ta_ranking_versions(course,row_count)
 select p_course,count(*) from private.kamereoru_ta_bests where course=p_course returning version into v;
 insert into private.kamereoru_ta_ranking_rows
 (version,position,rank,name_key,display_name,play_id,elapsed_cs,family,title_id,official_at)
 select v, row_number() over(order by elapsed_cs,official_at,play_id)::int,
  rank() over(order by elapsed_cs)::int,
  name_key,display_name,play_id,elapsed_cs,family,title_id,official_at
 from private.kamereoru_ta_bests where course=p_course;
 return v;
end $$;

create or replace function private.kamereoru_ta_finalize(
 p_play uuid,p_token uuid,p_status text,p_values jsonb,p_verdict jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.kamereoru_ta_jobs%rowtype; version bigint; v_course text; v_buildings integer;
begin
 select * into j from private.kamereoru_ta_jobs where play_id=p_play for update;
 if not found or j.claim_token is distinct from p_token or j.status<>'claimed' or
   j.lease_until<now() then raise exception using errcode='KM409',message='job_lease_lost';end if;
 if p_status not in ('official','no_rank','rejected','pending_review') then
  raise exception using errcode='KM422',message='bad_status'; end if;
 if p_status='official' then
  select case when family='all' then 'all' else 'legacy' end into v_course
  from private.kamereoru_ta_results where play_id=p_play;
  v_buildings:=case when v_course='all' then 20 else 30 end;
  if (p_values->>'reason') is distinct from 'cleared' or
   (p_values->>'buildings')::integer is distinct from v_buildings or
   coalesce((p_values->>'elapsedMs')::bigint,0)<v_buildings*500 then
   raise exception using errcode='KM422',message='invalid_official';
  end if;
 end if;
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
 if p_status='official' then version:=private.kamereoru_ta_rebuild_ranking(v_course);end if;
 return pg_catalog.jsonb_build_object('status',p_status,'version',version);
end $$;

create or replace function private.kamereoru_ta_ranking_page(p_version bigint,p_after integer,p_limit integer,p_course text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v bigint; n integer; rows jsonb; next_after integer; oldest timestamptz;
begin
 if p_limit<1 or p_limit>100 or p_after<0 or p_course is null or p_course not in ('legacy','all') then raise exception using errcode='KM422',message='bad_paging';end if;
 select max(version) into v from private.kamereoru_ta_ranking_versions where course=p_course;
 if v is null then v:=private.kamereoru_ta_rebuild_ranking(p_course);end if;
 if p_version is not null and p_version<>v then
  select created_at into oldest from private.kamereoru_ta_ranking_versions where version=p_version and course=p_course;
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
 return pg_catalog.jsonb_build_object('version',v,'course',p_course,'rows',rows,'nextAfter',next_after,
 'nameCount',coalesce(n,0),'restarted',p_version is not null and p_version<>v);
end $$;

create or replace function private.kamereoru_ta_rank_of(p_name text,p_course text)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce((
  select pg_catalog.jsonb_build_object('rank',rank,'elapsedCs',elapsed_cs)
   from private.kamereoru_ta_ranking_rows
   where version=(select max(version) from private.kamereoru_ta_ranking_versions where course=p_course)
    and name_key=p_name limit 1
 ),'{"rank":null}'::jsonb)
$$;

create or replace function private.kamereoru_ta_stats(p_course text)
returns jsonb language sql security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('totalPlays',(select count(*) from private.kamereoru_ta_launches where (family='all')=(p_course='all')),
  'participantCount',(select count(*) from private.kamereoru_ta_bests where course=p_course))
$$;

create or replace function private.kamereoru_ta_prune_rank_versions(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $ta_prune$
declare n integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(592040817);
 with expired as (
  select prior.version from private.kamereoru_ta_ranking_versions prior
  where prior.created_at<p_now-interval '24 hours'
    and prior.version<>(select max(version) from private.kamereoru_ta_ranking_versions where course=prior.course)
 ), deleted as (
  delete from private.kamereoru_ta_ranking_rows r
  using expired e where r.version=e.version
  returning r.version
 )
 select count(distinct version) into n from deleted;
 delete from private.kamereoru_ta_ranking_versions v
 where v.created_at<p_now-interval '24 hours'
   and v.version<>(select max(version) from private.kamereoru_ta_ranking_versions where course=v.course);
 return n;
end $ta_prune$;

-- Keep the older Edge Function and scripts working during deployment.
create or replace function private.kamereoru_ta_rebuild_ranking() returns bigint
language sql security definer set search_path='' as $$
 select private.kamereoru_ta_rebuild_ranking('legacy')
$$;
create or replace function private.kamereoru_ta_ranking_page(p_version bigint,p_after integer,p_limit integer)
returns jsonb language sql security definer set search_path='' as $$
 select private.kamereoru_ta_ranking_page(p_version,p_after,p_limit,'legacy')
$$;
create or replace function private.kamereoru_ta_rank_of(p_name text) returns jsonb
language sql security definer set search_path='' as $$
 select private.kamereoru_ta_rank_of(p_name,'legacy')
$$;
create or replace function private.kamereoru_ta_stats() returns jsonb
language sql security definer set search_path='' as $$
 select private.kamereoru_ta_stats('legacy')
$$;

revoke all on function private.kamereoru_ta_rebuild_ranking(text),
 private.kamereoru_ta_ranking_page(bigint,integer,integer,text),
 private.kamereoru_ta_rank_of(text,text), private.kamereoru_ta_stats(text)
 from public,anon,authenticated;
