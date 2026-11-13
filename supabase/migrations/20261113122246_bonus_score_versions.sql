-- Add ranked bonus rules without changing any existing start or result.
-- Old clients and the eight-argument start function remain supported.
alter table private.kamereoru_config alter column accepted_rules_versions
  set default array['kamereoru-rules-v3', 'kamereoru-rules-v1'];
update private.kamereoru_config
set accepted_rules_versions = array_prepend('kamereoru-rules-v3', accepted_rules_versions), updated_at = now()
where 'kamereoru-rules-v1' = any(accepted_rules_versions)
  and not ('kamereoru-rules-v3' = any(accepted_rules_versions));

create or replace function private.kamereoru_start_compatible(
  p_request_id uuid,
  p_secret_hash bytea,
  p_launch_id uuid,
  p_display_name text,
  p_name_key text,
  p_game_version text,
  p_supported_rules_versions text[]
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v private.kamereoru_starts;
  cfg private.kamereoru_config;
  selected_version text;
  v_created boolean := false;
begin
  -- Validate before looking up an old request; neither direct callers nor
  -- future clients may use standalone, unknown, null or duplicate versions.
  if p_supported_rules_versions is null
    or coalesce(array_ndims(p_supported_rules_versions), 0) <> 1
    or cardinality(p_supported_rules_versions) not between 1 and 2
    or exists (select 1 from unnest(p_supported_rules_versions) x
      where x is null or x not in ('kamereoru-rules-v1', 'kamereoru-rules-v3'))
    or (select count(distinct x) from unnest(p_supported_rules_versions) x) <> cardinality(p_supported_rules_versions)
  then
    raise exception using errcode = 'KM422', message = 'unsupported_rules_versions';
  end if;
  if p_secret_hash is null or octet_length(p_secret_hash) <> 32 then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;

  select * into v from private.kamereoru_starts where request_id = p_request_id;
  if not found then
    select * into cfg from private.kamereoru_config;
    if not cfg.accepting_ranked_starts then
      raise exception using errcode = 'KM503', message = 'ranked_starts_paused';
    end if;
    if 'kamereoru-rules-v3' = any(p_supported_rules_versions) and 'kamereoru-rules-v3' = any(cfg.accepted_rules_versions) then
      selected_version := 'kamereoru-rules-v3';
    elsif 'kamereoru-rules-v1' = any(p_supported_rules_versions) and 'kamereoru-rules-v1' = any(cfg.accepted_rules_versions) then
      selected_version := 'kamereoru-rules-v1';
    else
      raise exception using errcode = 'KM422', message = 'unsupported_rules_version';
    end if;
    insert into private.kamereoru_starts (request_id, secret_hash, launch_id, display_name, name_key, seed, rules_version, generator_version, game_version)
    values (p_request_id, p_secret_hash, p_launch_id, p_display_name, p_name_key, floor(random() * 4294967296)::bigint, selected_version, 'kamereoru-course-v1', p_game_version)
    on conflict (request_id) do nothing
    returning * into v;
    v_created := found;
    if not found then
      -- An INSERT may wait for a concurrent winner. Read its committed row;
      -- the version selected before waiting is no longer authoritative.
      select * into v from private.kamereoru_starts where request_id = p_request_id;
    end if;
  end if;
  if v.secret_hash is distinct from p_secret_hash then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;
  if v.launch_id is distinct from p_launch_id or v.display_name is distinct from p_display_name
    or v.name_key is distinct from p_name_key or v.game_version is distinct from p_game_version
    or not (v.rules_version = any(p_supported_rules_versions)) then
    raise exception using errcode = 'KM409', message = 'request_conflict';
  end if;
  return jsonb_build_object(
    'requestId', v.request_id, 'playId', v.play_id, 'seed', v.seed, 'rulesVersion', v.rules_version,
    'generatorVersion', v.generator_version, 'gameVersion', v.game_version, 'name', v.display_name,
    'acceptedAt', v.accepted_at, 'created', v_created
  );
end $$;

-- Only the authenticated owner can receive completed auxiliary corrections.
create or replace function private.kamereoru_status(p_play_ids uuid[], p_secret_hashes bytea[]) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result_items jsonb := '[]'::jsonb;
  i int;
  s private.kamereoru_starts;
  r private.kamereoru_results;
  corrections jsonb;
begin
  if coalesce(array_length(p_play_ids, 1), 0) > 50 or coalesce(array_length(p_play_ids, 1), 0) <> coalesce(array_length(p_secret_hashes, 1), 0) then
    raise exception using errcode = 'KM422', message = 'bad_items';
  end if;
  for i in 1 .. coalesce(array_length(p_play_ids, 1), 0) loop
    select * into s from private.kamereoru_starts where play_id = p_play_ids[i];
    if not found or s.secret_hash is distinct from p_secret_hashes[i] then
      result_items := result_items || jsonb_build_array(jsonb_build_object('playId', p_play_ids[i], 'error', 'forbidden'));
      continue;
    end if;
    select * into r from private.kamereoru_results where play_id = p_play_ids[i];
    if not found then
      result_items := result_items || jsonb_build_array(jsonb_build_object('playId', p_play_ids[i], 'status', 'not_received'));
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'before', a.before, 'after', a.after, 'reason', a.reason, 'at', a.created_at) order by a.id), '[]'::jsonb)
    into corrections
    from private.kamereoru_audit a
    where a.play_id = r.play_id and a.visible_to_owner and (a.action like 'correct%' or a.action like 'decide:%');
    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'playId', r.play_id,
      'status', r.status,
      'official', case when r.status = 'official' then jsonb_build_object('buildings', r.buildings, 'rankAverage', r.rank_avg) end,
      'reviewRequests', r.review_requests,
      'reason', case when r.status in ('rejected', 'pending_review') then r.verdict ->> 'reason' end,
      'corrections', corrections
    ) || case when r.status in ('official', 'no_rank')
      and s.rules_version = 'kamereoru-rules-v3'
      and jsonb_typeof(r.verdict -> 'verifiedScore') = 'object'
      and r.verdict -> 'verifiedScore' ->> 'rulesVersion' = s.rules_version
      then jsonb_build_object('verifiedScore', r.verdict -> 'verifiedScore')
      else '{}'::jsonb end);
  end loop;
  return result_items;
end $$;

-- Functions are invoked by the existing Edge database connection only.
revoke all on function private.kamereoru_start_compatible(uuid,bytea,uuid,text,text,text,text[]) from public;
revoke all on function private.kamereoru_status(uuid[],bytea[]) from public;
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on function private.kamereoru_start_compatible(uuid,bytea,uuid,text,text,text,text[]) from %I', role_name);
      execute format('revoke all on function private.kamereoru_status(uuid[],bytea[]) from %I', role_name);
    end if;
  end loop;
end $$;
