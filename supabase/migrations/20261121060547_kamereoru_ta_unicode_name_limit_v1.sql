create or replace function private.kamereoru_ta_start(
 p_request uuid,p_launch uuid,p_hash bytea,p_name text,p_key text,
 p_rules text,p_game_version text,p_seed bigint,p_family text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_starts%rowtype; v_seed bigint; v_play uuid;
begin
 if p_name is null or pg_catalog.octet_length(p_name)>1000 or p_name<>p_key or p_hash is null or
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
