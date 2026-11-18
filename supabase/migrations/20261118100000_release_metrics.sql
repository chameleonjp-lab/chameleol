-- A canceled reservation is terminal. Serialize abandon and launch on the existing start row.
create or replace function private.kamereoru_launch(
  p_launch_id uuid,
  p_ranked boolean,
  p_play_id uuid,
  p_secret_hash bytea,
  p_game_version text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s private.kamereoru_starts;
  existing private.kamereoru_launches;
begin
  if p_ranked then
    select * into s from private.kamereoru_starts where play_id = p_play_id for update;
    if not found or p_secret_hash is null or s.secret_hash <> p_secret_hash then
      raise exception using errcode = 'KM403', message = 'forbidden';
    end if;
    if s.status = 'abandoned' then
      raise exception using errcode = 'KM409', message = 'start_abandoned';
    end if;
    if s.launch_id <> p_launch_id then
      raise exception using errcode = 'KM409', message = 'launch_conflict';
    end if;
  elsif p_play_id is not null then
    raise exception using errcode = 'KM422', message = 'unranked_with_play';
  end if;
  insert into private.kamereoru_launches (launch_id, ranked, play_id, game_version)
  values (p_launch_id, p_ranked, case when p_ranked then p_play_id end, p_game_version)
  on conflict (launch_id) do nothing;
  if found then
    if p_ranked then
      update private.kamereoru_starts set status = 'launched', launched_at = now() where play_id = p_play_id and status <> 'launched';
    end if;
    return jsonb_build_object('counted', true);
  end if;
  select * into existing from private.kamereoru_launches where launch_id = p_launch_id;
  if existing.ranked <> p_ranked or existing.play_id is distinct from (case when p_ranked then p_play_id end) then
    raise exception using errcode = 'KM409', message = 'launch_conflict';
  end if;
  return jsonb_build_object('counted', false);
end $$;

-- Only the new reservation protocol requires a matching actual launch. Chunks
-- already uploaded remain in place when complete returns KM425 for a retry.
create or replace function private.kamereoru_require_launch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from private.kamereoru_starts s
    where s.play_id = new.play_id and s.requires_launch and not exists (
      select 1 from private.kamereoru_launches l
      where l.play_id = s.play_id and l.launch_id = s.launch_id and l.ranked
    )
  ) then
    raise exception using errcode = 'KM425', message = 'launch_not_received';
  end if;
  return new;
end $$;

create or replace trigger kamereoru_require_launch before insert on private.kamereoru_results
for each row execute function private.kamereoru_require_launch();

create index if not exists kamereoru_results_run_rank on private.kamereoru_results (buildings desc, rank_avg desc)
where status = 'official' and buildings >= 1 and rank_avg is not null;

create or replace view private.kamereoru_ranked_runs as
select play_id, name_key, buildings, rank_avg, end_reason, official_at from private.kamereoru_results
where status = 'official' and buildings >= 1 and rank_avg is not null;

create table if not exists private.kamereoru_clear_admissions (
  play_id uuid primary key references private.kamereoru_results (play_id),
  confirmed_order bigint not null unique
);
alter table private.kamereoru_clear_admissions enable row level security;

create or replace view private.kamereoru_clears as
select * from private.kamereoru_ranked_runs where buildings = 50 and end_reason = 'cleared';

-- Finalization, review decisions and corrections all update the same result.
-- Its AFTER trigger runs before any name/ranking rebuild in those functions.
-- A transaction assigning a new order keeps the shared lock until commit.
create or replace function private.kamereoru_admit_clear() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from private.kamereoru_clear_admissions where play_id = new.play_id) then
    return null;
  end if;
  perform 1 from private.kamereoru_config where id for no key update;
  insert into private.kamereoru_clear_admissions (play_id, confirmed_order)
  select new.play_id, coalesce(max(confirmed_order), 0) + 1 from private.kamereoru_clear_admissions;
  return null;
end $$;

-- Install the trigger and seed admissions together, without a window for new
-- approvals to overtake historical ones. Reapplication retains every order.
do $$
begin
  lock table private.kamereoru_results in share row exclusive mode;
  create or replace trigger kamereoru_admit_clear
    after insert or update of status, buildings, rank_avg, end_reason on private.kamereoru_results
    for each row when (new.status = 'official' and new.buildings = 50
      and new.rank_avg is not null and new.end_reason = 'cleared')
    execute function private.kamereoru_admit_clear();
  insert into private.kamereoru_clear_admissions (play_id, confirmed_order)
  select c.play_id, (select coalesce(max(confirmed_order), 0) from private.kamereoru_clear_admissions)
    + row_number() over (order by c.official_at, c.play_id)
  from private.kamereoru_clears c
  where not exists (select 1 from private.kamereoru_clear_admissions a where a.play_id = c.play_id);
end $$;

create or replace view private.kamereoru_clear_ordinals as
select name_key, row_number() over (order by min(a.confirmed_order)) as ordinal
from private.kamereoru_clears c join private.kamereoru_clear_admissions a using (play_id)
group by name_key;

create or replace function private.kamereoru_stats() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'totalPlays', (select count(*) from private.kamereoru_launches),
    'clearerCount', (select count(*) from private.kamereoru_clear_ordinals)
  )
$$;

-- Preserve the existing per-item secret check, order and verifiedScore in one
-- read snapshot. Only authenticated items receive metrics.
create or replace function private.kamereoru_status_with_metrics(ids uuid[], hashes bytea[]) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(case when item ? 'error' then item else item || jsonb_build_object(
    'metrics', jsonb_build_object(
      'runRank', case when r.play_id is not null then 1 + (
        select count(*) from private.kamereoru_ranked_runs higher
        where (higher.buildings, higher.rank_avg) > (r.buildings, r.rank_avg)
      ) end,
      'totalPlays', (select count(*) from private.kamereoru_launches),
      'clearOrdinal', o.ordinal
    )
  ) end order by idx), '[]'::jsonb)
  from jsonb_array_elements(private.kamereoru_status(ids, hashes)) with ordinality as owner_items(item, idx)
  left join private.kamereoru_ranked_runs r on r.play_id = (item->>'playId')::uuid and not item ? 'error'
  left join private.kamereoru_clear_ordinals o on r.name_key = o.name_key and r.buildings = 50 and r.end_reason = 'cleared'
$$;

do $$
declare
  grantee text;
  recipient text;
begin
  for grantee in select 'public' union all select rolname from pg_roles where rolname in ('anon','authenticated') loop
    recipient := case when grantee = 'public' then 'public' else quote_ident(grantee) end;
    execute 'revoke all on private.kamereoru_ranked_runs, private.kamereoru_clears, private.kamereoru_clear_ordinals, private.kamereoru_clear_admissions from ' || recipient;
    execute 'revoke all on function private.kamereoru_stats(), private.kamereoru_status_with_metrics(uuid[],bytea[]), private.kamereoru_require_launch(), private.kamereoru_admit_clear() from ' || recipient;
  end loop;
end $$;
